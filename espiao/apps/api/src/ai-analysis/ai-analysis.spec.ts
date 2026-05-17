import { describe, expect, it, vi, beforeEach } from "vitest";
import { AiAnalysisProcessor } from "./ai-analysis.processor";
import { AiAnalysisService } from "./ai-analysis.service";
import { OpenAIProvider } from "./openai.provider";
import type { AnalysisJob } from "./dto/analysis-job.types";
import type { AnalysisResult } from "./dto/analysis-result.types";

// No vi.mock("openai") — OpenAIProvider is injected via DI and mocked as an object

function makeOpenAIMock(
  riskScore = 30,
  configured = true
): {
  isConfigured: ReturnType<typeof vi.fn>;
  getModel: ReturnType<typeof vi.fn>;
  analyzeOperationalMetadata: ReturnType<typeof vi.fn>;
  healthCheck: ReturnType<typeof vi.fn>;
} {
  const result: AnalysisResult = {
    summary: "Conversa com tempo de resposta normal.",
    riskScore,
    confidenceLevel: "medium",
    sentimentEstimate: "neutral",
    sentimentBasis: "behavioral_patterns_only",
    responseDelayRisk: "none",
    needsSupervisorReview: riskScore >= 70,
    recommendedAction: "Nenhuma ação necessária.",
    analysisNote: "Análise baseada apenas em metadados operacionais."
  };

  const usage = {
    model: "gpt-4.1-mini",
    promptTokens: 180,
    completionTokens: 95,
    totalTokens: 275,
    latencyMs: 1200
  };

  return {
    isConfigured: vi.fn().mockReturnValue(configured),
    getModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
    analyzeOperationalMetadata: vi.fn().mockResolvedValue({ result, usage }),
    healthCheck: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 120 })
  };
}

function makeConversationRow(messageCount = 3) {
  const now = Date.now();
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    direction: (i % 2 === 0 ? "INBOUND" : "OUTBOUND") as "INBOUND" | "OUTBOUND",
    type: "TEXT",
    sentAt: new Date(now - (messageCount - i) * 60_000),
    receivedAt: null
  }));
  return {
    status: "OPEN",
    startedAt: new Date(now - 600_000),
    messages
  };
}

describe("AiAnalysisProcessor", () => {
  let prismaCreateAnalysis: ReturnType<typeof vi.fn>;
  let prismaUpdateAnalysis: ReturnType<typeof vi.fn>;
  let prismaFindConversation: ReturnType<typeof vi.fn>;
  let prismaCreateAuditLog: ReturnType<typeof vi.fn>;
  let realtimeEmit: ReturnType<typeof vi.fn>;
  let prismaMock: unknown;
  let realtimeMock: unknown;
  let openAIMock: ReturnType<typeof makeOpenAIMock>;
  let processor: AiAnalysisProcessor;

  beforeEach(() => {
    vi.clearAllMocks();

    prismaCreateAnalysis = vi.fn().mockResolvedValue({
      id: "analysis-id-1",
      conversationId: "conv-id-1"
    });
    prismaUpdateAnalysis = vi.fn().mockResolvedValue({});
    prismaFindConversation = vi.fn().mockResolvedValue(makeConversationRow());
    prismaCreateAuditLog = vi.fn().mockResolvedValue({ id: "audit-log-id-1" });
    realtimeEmit = vi.fn();

    prismaMock = {
      aiAnalysis: {
        create: prismaCreateAnalysis,
        update: prismaUpdateAnalysis
      },
      conversation: {
        findUnique: prismaFindConversation
      },
      auditLog: {
        create: prismaCreateAuditLog
      }
    };

    realtimeMock = { emit: realtimeEmit };
    openAIMock = makeOpenAIMock(30, true);

    processor = new AiAnalysisProcessor(
      openAIMock as unknown as OpenAIProvider,
      prismaMock as never,
      realtimeMock as never
    );
  });

  const makeJob = (conversationId = "conv-id-1") =>
    ({
      data: {
        conversationId,
        messageId: "msg-id-1",
        triggeredAt: new Date().toISOString()
      } as AnalysisJob
    }) as never;

  it("creates AiAnalysis with PROCESSING then updates to COMPLETED", async () => {
    await processor.process(makeJob());

    expect(prismaCreateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: "conv-id-1", status: "PROCESSING" })
      })
    );
    expect(prismaUpdateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED", score: 30 })
      })
    );
  });

  it("saves usage metadata (_metadata) in findings", async () => {
    await processor.process(makeJob());

    expect(prismaUpdateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findings: expect.objectContaining({
            _metadata: expect.objectContaining({
              model: "gpt-4.1-mini",
              totalTokens: 275,
              latencyMs: 1200
            })
          })
        })
      })
    );
  });

  it("does NOT create AuditLog or emit alert when riskScore < 70", async () => {
    await processor.process(makeJob());

    expect(prismaCreateAuditLog).not.toHaveBeenCalled();
    expect(realtimeEmit).not.toHaveBeenCalled();
  });

  it("creates AuditLog and emits alert.created when riskScore >= 70", async () => {
    openAIMock = makeOpenAIMock(85);
    processor = new AiAnalysisProcessor(
      openAIMock as unknown as OpenAIProvider,
      prismaMock as never,
      realtimeMock as never
    );

    await processor.process(makeJob());

    expect(prismaCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "AI_ALERT", entity: "AiAnalysis" })
      })
    );
    expect(realtimeEmit).toHaveBeenCalledWith(
      "alert.created",
      expect.objectContaining({ level: "warning" })
    );
  });

  it("creates AuditLog with level=critical when riskScore >= 90", async () => {
    openAIMock = makeOpenAIMock(95);
    processor = new AiAnalysisProcessor(
      openAIMock as unknown as OpenAIProvider,
      prismaMock as never,
      realtimeMock as never
    );

    await processor.process(makeJob());

    expect(prismaCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ level: "critical" })
        })
      })
    );
    expect(realtimeEmit).toHaveBeenCalledWith(
      "alert.created",
      expect.objectContaining({ level: "critical" })
    );
  });

  it("saves AiAnalysis with status=FAILED when analyzeOperationalMetadata throws", async () => {
    openAIMock.analyzeOperationalMetadata.mockRejectedValue(
      new Error("OpenAI rate limit")
    );

    await processor.process(makeJob());

    expect(prismaUpdateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", error: "OpenAI rate limit" })
      })
    );
    expect(realtimeEmit).not.toHaveBeenCalled();
  });

  it("saves AiAnalysis with error=OPENAI_API_KEY_NOT_CONFIGURED when isConfigured() is false", async () => {
    openAIMock = makeOpenAIMock(30, false);
    processor = new AiAnalysisProcessor(
      openAIMock as unknown as OpenAIProvider,
      prismaMock as never,
      realtimeMock as never
    );

    await processor.process(makeJob());

    expect(prismaCreateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "OPENAI_API_KEY_NOT_CONFIGURED"
        })
      })
    );
    expect(openAIMock.analyzeOperationalMetadata).not.toHaveBeenCalled();
    expect(realtimeEmit).not.toHaveBeenCalled();
  });

  it("prompt sent to OpenAI contains only operational metadata — no text, phone, or patient name", async () => {
    prismaFindConversation.mockResolvedValue({
      status: "OPEN",
      startedAt: new Date(Date.now() - 600_000),
      messages: [
        { direction: "INBOUND", type: "TEXT", sentAt: new Date(Date.now() - 300_000), receivedAt: null },
        { direction: "OUTBOUND", type: "TEXT", sentAt: new Date(Date.now() - 200_000), receivedAt: null }
      ]
    });

    await processor.process(makeJob());

    expect(openAIMock.analyzeOperationalMetadata).toHaveBeenCalledOnce();
    const [metadata] = openAIMock.analyzeOperationalMetadata.mock
      .calls[0] as [Record<string, unknown>, string];

    expect(metadata).not.toHaveProperty("text");
    expect(metadata).not.toHaveProperty("name");
    expect(metadata).not.toHaveProperty("phoneE164");
    expect(metadata).not.toHaveProperty("phone");
    expect(metadata).toHaveProperty("conversationId");
    expect(metadata).toHaveProperty("totalMessages");
    expect(metadata).toHaveProperty("inboundCount");
    expect(metadata).toHaveProperty("outboundCount");
  });
});

// ── AiAnalysisService.enqueue tests ─────────────────────────────────────────

describe("AiAnalysisService.enqueue", () => {
  function makeConfigMockForService() {
    return {
      get: (key: string, def?: unknown) =>
        key === "OPENAI_MODEL" ? "gpt-4.1-mini" : def
    } as never;
  }

  it("returns without throwing when queue is undefined (test mode / Redis down)", async () => {
    const service = new AiAnalysisService(makeConfigMockForService(), undefined);
    const job: AnalysisJob = {
      conversationId: "conv-1",
      messageId: "msg-1",
      triggeredAt: new Date().toISOString()
    };
    await expect(service.enqueue(job)).resolves.toBeUndefined();
  });

  it("uses jobId conv:<conversationId> for BullMQ deduplication", async () => {
    const mockAdd = vi.fn().mockResolvedValue(undefined);
    const service = new AiAnalysisService(makeConfigMockForService(), { add: mockAdd } as never);
    await service.enqueue({
      conversationId: "conv-abc",
      messageId: "msg-1",
      triggeredAt: new Date().toISOString()
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "analyze",
      expect.objectContaining({ conversationId: "conv-abc" }),
      expect.objectContaining({ jobId: "conv:conv-abc" })
    );
  });

  it("returns without throwing when queue.add throws (Redis ECONNREFUSED)", async () => {
    const service = new AiAnalysisService(
      makeConfigMockForService(),
      { add: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) } as never
    );
    await expect(
      service.enqueue({ conversationId: "conv-1", messageId: "msg-1", triggeredAt: new Date().toISOString() })
    ).resolves.toBeUndefined();
  });
});
