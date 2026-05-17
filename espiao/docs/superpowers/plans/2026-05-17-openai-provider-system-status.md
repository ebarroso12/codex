# OpenAI Provider + System Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract OpenAI into a testable NestJS injectable provider with retry/timeout/token-logging, and add `GET /system/status` with database, Redis, and OpenAI health checks.

**Architecture:** `OpenAIProvider` wraps the OpenAI SDK (maxRetries=3, timeout=30s) and exposes `analyzeOperationalMetadata()` + `healthCheck()`. `AiAnalysisProcessor` injects `OpenAIProvider` instead of creating OpenAI directly, allowing clean DI-based mocking in tests. `SystemModule` adds a custom `GET /system/status` (public, no auth) backed by `SystemService` which runs three independent checks: Prisma SELECT 1, IORedis ping, and OpenAI model list. Overall status rolls up: DB-down → unhealthy, Redis/OpenAI issues → degraded.

**Tech Stack:** NestJS 11, OpenAI SDK v5 (maxRetries, timeout native), ioredis v5 (lazyConnect ping), Prisma 6, Vitest

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/src/ai-analysis/dto/analysis-result.types.ts` | Add `TokenUsage` type |
| Create | `apps/api/src/ai-analysis/openai.provider.ts` | Injectable OpenAI wrapper |
| Modify | `apps/api/src/ai-analysis/ai-analysis.module.ts` | Register `OpenAIProvider` |
| Modify | `apps/api/src/ai-analysis/ai-analysis.processor.ts` | Inject `OpenAIProvider`, remove direct OpenAI, SKIPPED logic, usage in findings |
| Modify | `apps/api/src/ai-analysis/ai-analysis.spec.ts` | Remove vi.mock("openai"), use DI mock object |
| Create | `apps/api/src/system/system.service.ts` | 3 health checks + rollup |
| Create | `apps/api/src/system/system.controller.ts` | GET /system/status |
| Create | `apps/api/src/system/system.module.ts` | SystemModule |
| Create | `apps/api/src/system/system.spec.ts` | Unit tests |
| Modify | `apps/api/src/app.module.ts` | Import SystemModule |

---

## Task 1: Add TokenUsage type

**Files:**
- Modify: `apps/api/src/ai-analysis/dto/analysis-result.types.ts`

- [ ] **Step 1: Add TokenUsage to the file**

Add at the top of `apps/api/src/ai-analysis/dto/analysis-result.types.ts` (before `ConversationMetadata`):

```typescript
export type TokenUsage = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
};
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 2: Create OpenAIProvider

**Files:**
- Create: `apps/api/src/ai-analysis/openai.provider.ts`

- [ ] **Step 1: Create the provider**

Create `apps/api/src/ai-analysis/openai.provider.ts`:

```typescript
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { AnalysisResult, ConversationMetadata, TokenUsage } from "./dto/analysis-result.types";

export type ServiceStatus = {
  status: "healthy" | "degraded" | "disabled";
  message?: string;
  latencyMs?: number;
};

@Injectable()
export class OpenAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client?: OpenAI;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const apiKey = config.get<string>("OPENAI_API_KEY");
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4.1-mini");
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        maxRetries: 3,   // SDK handles exponential backoff for 429/500/503
        timeout: 30_000  // 30s per attempt
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  getModel(): string {
    return this.model;
  }

  async analyzeOperationalMetadata(
    metadata: ConversationMetadata,
    systemPrompt: string
  ): Promise<{ result: AnalysisResult; usage: TokenUsage }> {
    if (!this.client) {
      throw new Error("OpenAI not configured — OPENAI_API_KEY missing");
    }

    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(metadata) }
      ],
      temperature: 0.2
    });

    const latencyMs = Date.now() - start;
    const usage: TokenUsage = {
      model: this.model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      latencyMs
    };

    this.logger.log(
      `OpenAI: model=${usage.model} tokens=${usage.totalTokens} latency=${usage.latencyMs}ms`
    );

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AnalysisResult>;

    const result: AnalysisResult = {
      summary: parsed.summary ?? "Análise não disponível.",
      riskScore: typeof parsed.riskScore === "number" ? parsed.riskScore : 0,
      confidenceLevel: parsed.confidenceLevel ?? "low",
      sentimentEstimate: parsed.sentimentEstimate ?? "unknown",
      sentimentBasis: "behavioral_patterns_only",
      responseDelayRisk: parsed.responseDelayRisk ?? "none",
      needsSupervisorReview: parsed.needsSupervisorReview ?? false,
      recommendedAction: parsed.recommendedAction ?? "Nenhuma ação necessária.",
      analysisNote:
        parsed.analysisNote ?? "Análise baseada apenas em metadados operacionais."
    };

    return { result, usage };
  }

  async healthCheck(): Promise<ServiceStatus> {
    if (!this.client) {
      return { status: "disabled", message: "OPENAI_API_KEY not configured" };
    }
    const start = Date.now();
    try {
      // Lightweight check: retrieve model metadata (no tokens consumed)
      await this.client.models.retrieve(this.model);
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      return {
        status: "degraded",
        latencyMs: Date.now() - start,
        message: "OpenAI API check failed"
      };
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 3: Update AiAnalysisModule

**Files:**
- Modify: `apps/api/src/ai-analysis/ai-analysis.module.ts`

- [ ] **Step 1: Register OpenAIProvider**

Replace the full file:

```typescript
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiAnalysisController } from "./ai-analysis.controller";
import { AiAnalysisProcessor } from "./ai-analysis.processor";
import { AiAnalysisService } from "./ai-analysis.service";
import { OpenAIProvider } from "./openai.provider";

const IS_TEST = process.env.NODE_ENV === "test";

@Module({
  imports: IS_TEST ? [] : [BullModule.registerQueue({ name: "ai-analysis" })],
  controllers: [AiAnalysisController],
  providers: IS_TEST
    ? [AiAnalysisService, OpenAIProvider]
    : [AiAnalysisService, AiAnalysisProcessor, OpenAIProvider],
  exports: [AiAnalysisService, OpenAIProvider]
})
export class AiAnalysisModule {}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 4: Update AiAnalysisProcessor

**Files:**
- Modify: `apps/api/src/ai-analysis/ai-analysis.processor.ts`

Replace the full file:

```typescript
import { Inject, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { OpenAIProvider } from "./openai.provider";
import type { AnalysisJob } from "./dto/analysis-job.types";
import type { AnalysisResult, ConversationMetadata } from "./dto/analysis-result.types";

const SYSTEM_PROMPT = `You are an operational quality analyst for a healthcare WhatsApp support service.
Analyze conversation metadata and generate a risk assessment.
You have NO access to message content, patient names, phone numbers, or medical data.
Base your analysis ONLY on the provided operational metrics.
Never infer or mention medical conditions.
Never include personal identifiers in your response.
Your assessment helps supervisors identify conversations needing attention.
Respond only with valid JSON matching the required schema.`;

const RISK_THRESHOLD = 70;

@Processor("ai-analysis")
export class AiAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AiAnalysisProcessor.name);

  constructor(
    @Inject(OpenAIProvider) private readonly openAI: OpenAIProvider,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway
  ) {
    super();
  }

  async process(job: Job<AnalysisJob>): Promise<void> {
    const { conversationId } = job.data;
    this.logger.log(`Processing AI analysis for conversation ${conversationId}`);

    if (!this.openAI.isConfigured()) {
      this.logger.warn(
        `OpenAI not configured — saving SKIPPED for conversation ${conversationId}`
      );
      await this.prisma.aiAnalysis.create({
        data: {
          conversationId,
          model: this.openAI.getModel(),
          status: "FAILED",
          error: "OPENAI_API_KEY_NOT_CONFIGURED"
        }
      });
      return;
    }

    const analysis = await this.prisma.aiAnalysis.create({
      data: {
        conversationId,
        model: this.openAI.getModel(),
        status: "PROCESSING"
      }
    });

    try {
      const metadata = await this.buildMetadata(conversationId);
      const { result, usage } = await this.openAI.analyzeOperationalMetadata(
        metadata,
        SYSTEM_PROMPT
      );

      await this.prisma.aiAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: "COMPLETED",
          score: result.riskScore,
          summary: result.summary,
          findings: {
            ...result,
            _metadata: usage
          } as unknown as Prisma.InputJsonValue
        }
      });

      this.logger.log(
        `Analysis COMPLETED for ${conversationId}: riskScore=${result.riskScore} confidence=${result.confidenceLevel}`
      );

      if (result.riskScore >= RISK_THRESHOLD || result.needsSupervisorReview) {
        await this.createAlert(analysis.id, conversationId, result);
      }
    } catch (error) {
      this.logger.error(
        `Analysis FAILED for conversation ${conversationId}`,
        (error as Error).message
      );
      await this.prisma.aiAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: "FAILED",
          error: (error as Error).message
        }
      });
    }
  }

  private async buildMetadata(conversationId: string): Promise<ConversationMetadata> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        status: true,
        startedAt: true,
        messages: {
          select: {
            direction: true,
            type: true,
            sentAt: true,
            receivedAt: true
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const now = Date.now();
    const messages = conversation.messages;
    const durationSeconds = Math.floor(
      (now - conversation.startedAt.getTime()) / 1000
    );

    const inboundCount = messages.filter((m) => m.direction === "INBOUND").length;
    const outboundCount = messages.filter((m) => m.direction === "OUTBOUND").length;

    const responseTimes: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      if (prev.direction !== curr.direction) {
        const t0 = prev.sentAt?.getTime() ?? prev.receivedAt?.getTime();
        const t1 = curr.sentAt?.getTime() ?? curr.receivedAt?.getTime();
        if (t0 && t1) responseTimes.push((t1 - t0) / 1000);
      }
    }

    const avgResponseTimeSeconds =
      responseTimes.length > 0
        ? Math.floor(
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          )
        : null;

    const last = messages[messages.length - 1];
    const lastTime =
      last?.sentAt?.getTime() ?? last?.receivedAt?.getTime() ?? now;
    const secondsSinceLastMessage = Math.floor((now - lastTime) / 1000);

    const hasMedia = messages.some((m) =>
      ["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"].includes(m.type)
    );
    const messageTypes = [...new Set(messages.map((m) => m.type))];

    // Safety: metadata contains only operational fields — never text, name, or phoneE164
    return {
      conversationId,
      status: conversation.status,
      durationSeconds,
      totalMessages: messages.length,
      inboundCount,
      outboundCount,
      avgResponseTimeSeconds,
      secondsSinceLastMessage,
      hasMedia,
      messageTypes
    };
  }

  private async createAlert(
    analysisId: string,
    conversationId: string,
    result: AnalysisResult
  ): Promise<void> {
    const level =
      result.riskScore >= 90 ? ("critical" as const) : ("warning" as const);

    const auditLog = await this.prisma.auditLog.create({
      data: {
        action: "AI_ALERT",
        entity: "AiAnalysis",
        entityId: analysisId,
        metadata: {
          level,
          riskScore: result.riskScore,
          confidenceLevel: result.confidenceLevel,
          needsSupervisorReview: result.needsSupervisorReview,
          recommendedAction: result.recommendedAction,
          conversationId
        } as Prisma.InputJsonValue
      }
    });

    this.realtime.emit("alert.created", {
      alertId: auditLog.id,
      level,
      title: `Alerta operacional — ${level === "critical" ? "revisão urgente" : "revisão recomendada"}`
    });

    this.logger.log(
      `Alert created: analysisId=${analysisId} level=${level} riskScore=${result.riskScore}`
    );
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 5: Update ai-analysis.spec.ts — remove vi.mock, use DI mock

**Files:**
- Modify: `apps/api/src/ai-analysis/ai-analysis.spec.ts`

Replace the full file:

```typescript
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
    openAIMock = makeOpenAIMock(30, false); // not configured
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

// ── AiAnalysisService.enqueue tests (unchanged logic) ─────────────────────

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
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: all existing tests pass. If any failures, fix before continuing.

---

## Task 6: SystemService

**Files:**
- Create: `apps/api/src/system/system.service.ts`

- [ ] **Step 1: Create service**

Create `apps/api/src/system/system.service.ts`:

```typescript
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { OpenAIProvider } from "../ai-analysis/openai.provider";
import { PrismaService } from "../prisma/prisma.service";

export type CheckStatus = "healthy" | "degraded" | "unhealthy" | "disabled";

export type CheckResult = {
  status: CheckStatus;
  latencyMs?: number;
  message?: string;
  model?: string;
};

export type SystemStatusResponse = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: CheckResult;
    redis: CheckResult;
    openai: CheckResult;
  };
};

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenAIProvider) private readonly openAI: OpenAIProvider
  ) {}

  async getStatus(): Promise<SystemStatusResponse> {
    const [database, redis, openai] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkOpenAI()
    ]);

    const overall = this.rollup(database.status, redis.status, openai.status);

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      services: { database, redis, openai }
    };
  }

  async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000)
        )
      ]);
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      this.logger.warn("Database health check failed");
      return { status: "unhealthy", message: "Database unavailable" };
    }
  }

  async checkRedis(): Promise<CheckResult> {
    const host = this.config.get<string>("REDIS_HOST");
    if (!host) {
      return { status: "degraded", message: "Redis not configured" };
    }
    const client = this.createRedisClient({
      host,
      port: this.config.get<number>("REDIS_PORT", 6379),
      password: this.config.get<string>("REDIS_PASSWORD"),
      connectTimeout: 3000,
      commandTimeout: 3000,
      lazyConnect: true,
      maxRetriesPerRequest: 0
    });
    const start = Date.now();
    try {
      await client.ping();
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      this.logger.warn("Redis health check failed");
      return { status: "degraded", message: "Redis unavailable" };
    } finally {
      client.disconnect();
    }
  }

  async checkOpenAI(): Promise<CheckResult> {
    const result = await this.openAI.healthCheck();
    return {
      status: result.status,
      ...(result.latencyMs !== undefined && { latencyMs: result.latencyMs }),
      ...(result.status !== "disabled" && { model: this.openAI.getModel() }),
      ...(result.message && { message: result.message })
    };
  }

  // Protected to allow spy-based override in unit tests
  protected createRedisClient(options: {
    host: string;
    port: number;
    password?: string;
    connectTimeout: number;
    commandTimeout: number;
    lazyConnect: boolean;
    maxRetriesPerRequest: number;
  }): Redis {
    return new Redis(options);
  }

  private rollup(
    db: CheckStatus,
    redis: CheckStatus,
    openai: CheckStatus
  ): "healthy" | "degraded" | "unhealthy" {
    if (db === "unhealthy") return "unhealthy";
    if (
      redis === "degraded" ||
      openai === "degraded" ||
      openai === "disabled"
    )
      return "degraded";
    return "healthy";
  }
}
```

---

## Task 7: SystemController + SystemModule

**Files:**
- Create: `apps/api/src/system/system.controller.ts`
- Create: `apps/api/src/system/system.module.ts`

- [ ] **Step 1: Create controller**

Create `apps/api/src/system/system.controller.ts`:

```typescript
import { Controller, Get } from "@nestjs/common";
import { SystemService } from "./system.service";

@Controller("system")
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get("status")
  status() {
    return this.system.getStatus();
  }
}
```

- [ ] **Step 2: Create module**

Create `apps/api/src/system/system.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";

@Module({
  imports: [AiAnalysisModule],
  controllers: [SystemController],
  providers: [SystemService]
})
export class SystemModule {}
```

- [ ] **Step 3: Import SystemModule in AppModule**

In `apps/api/src/app.module.ts`, add import at the top:

```typescript
import { SystemModule } from "./system/system.module";
```

Add `SystemModule` to the `imports` array after `RealtimeModule`:

```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
  ...(process.env.NODE_ENV === "test" ? [] : [BullModule.forRootAsync(...)]),
  RealtimeModule,
  SystemModule,
  PrismaModule,
  // ... rest unchanged
]
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 8: SystemService unit tests

**Files:**
- Create: `apps/api/src/system/system.spec.ts`

- [ ] **Step 1: Create test file**

Create `apps/api/src/system/system.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { SystemService, type CheckResult } from "./system.service";
import { OpenAIProvider } from "../ai-analysis/openai.provider";

function makeConfigMock(extras: Record<string, string | number> = {}) {
  const defaults: Record<string, string | number> = {
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    ...extras
  };
  return {
    get: <T>(key: string, def?: T): T | undefined =>
      ((defaults[key] ?? def) as T | undefined)
  } as unknown as ConfigService;
}

function makeOpenAIMock(status: "healthy" | "degraded" | "disabled" = "healthy") {
  return {
    healthCheck: vi.fn().mockResolvedValue({
      status,
      latencyMs: 120,
      ...(status === "disabled" && { message: "OPENAI_API_KEY not configured" })
    }),
    getModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
    isConfigured: vi.fn().mockReturnValue(status !== "disabled")
  } as unknown as OpenAIProvider;
}

function makePrismaMock(queryResult: "ok" | "error" = "ok") {
  return {
    $queryRaw: queryResult === "ok"
      ? vi.fn().mockResolvedValue([{ "?column?": 1 }])
      : vi.fn().mockRejectedValue(new Error("connection refused"))
  };
}

describe("SystemService.checkDatabase", () => {
  it("returns healthy when Prisma query succeeds", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("ok") as never,
      makeOpenAIMock()
    );
    const result: CheckResult = await service.checkDatabase();
    expect(result.status).toBe("healthy");
    expect(result.latencyMs).toBeTypeOf("number");
  });

  it("returns unhealthy with safe message when Prisma query fails", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("error") as never,
      makeOpenAIMock()
    );
    const result: CheckResult = await service.checkDatabase();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toBe("Database unavailable");
    expect(result).not.toHaveProperty("stack");
  });
});

describe("SystemService.checkRedis", () => {
  it("returns degraded with safe message when REDIS_HOST is not configured", async () => {
    const service = new SystemService(
      makeConfigMock({ REDIS_HOST: "" }),
      makePrismaMock() as never,
      makeOpenAIMock()
    );
    // Override getConfig to simulate missing REDIS_HOST
    const noHostConfig = {
      get: (key: string, def?: unknown) =>
        key === "REDIS_HOST" ? undefined : def
    } as unknown as ConfigService;
    const svc = new SystemService(noHostConfig, makePrismaMock() as never, makeOpenAIMock());
    const result = await svc.checkRedis();
    expect(result.status).toBe("degraded");
    expect(result.message).toBe("Redis not configured");
  });

  it("returns degraded with safe message when Redis ping fails", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock()
    );
    vi.spyOn(service as SystemService & { createRedisClient: () => unknown }, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      disconnect: vi.fn()
    } as never);
    const result = await service.checkRedis();
    expect(result.status).toBe("degraded");
    expect(result.message).toBe("Redis unavailable");
    expect(result.message).not.toContain("ECONNREFUSED");
  });

  it("returns healthy when Redis ping succeeds", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock()
    );
    vi.spyOn(service as SystemService & { createRedisClient: () => unknown }, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn()
    } as never);
    const result = await service.checkRedis();
    expect(result.status).toBe("healthy");
  });
});

describe("SystemService.checkOpenAI", () => {
  it("returns disabled when OpenAI not configured", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock("disabled")
    );
    const result = await service.checkOpenAI();
    expect(result.status).toBe("disabled");
    expect(result).not.toHaveProperty("model"); // no model when disabled
  });

  it("returns healthy with model when OpenAI is configured and accessible", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock("healthy")
    );
    const result = await service.checkOpenAI();
    expect(result.status).toBe("healthy");
    expect(result.model).toBe("gpt-4.1-mini");
  });
});

describe("SystemService.getStatus — rollup", () => {
  it("returns overall=unhealthy when database is unhealthy", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("error") as never,
      makeOpenAIMock("healthy")
    );
    vi.spyOn(service as SystemService & { createRedisClient: () => unknown }, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn()
    } as never);
    const status = await service.getStatus();
    expect(status.status).toBe("unhealthy");
    expect(status.services.database.status).toBe("unhealthy");
  });

  it("returns overall=degraded when DB is healthy but Redis is degraded", async () => {
    const noHostConfig = {
      get: (key: string, def?: unknown) =>
        key === "REDIS_HOST" ? undefined : def
    } as unknown as ConfigService;
    const service = new SystemService(
      noHostConfig,
      makePrismaMock("ok") as never,
      makeOpenAIMock("healthy")
    );
    const status = await service.getStatus();
    expect(status.status).toBe("degraded");
    expect(status.services.redis.status).toBe("degraded");
  });

  it("returns overall=degraded when DB is healthy and OpenAI is disabled", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("ok") as never,
      makeOpenAIMock("disabled")
    );
    vi.spyOn(service as SystemService & { createRedisClient: () => unknown }, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn()
    } as never);
    const status = await service.getStatus();
    expect(status.status).toBe("degraded");
  });

  it("response never exposes secrets or stack traces", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("error") as never,
      makeOpenAIMock()
    );
    const status = await service.getStatus();
    const json = JSON.stringify(status);
    expect(json).not.toContain("password");
    expect(json).not.toContain("ECONNREFUSED");
    expect(json).not.toContain("stack");
    expect(json).not.toContain("apiKey");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: all tests pass (30+ total including new system tests).

---

## Task 9: Final verification

- [ ] **Step 1: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Full test suite**

```bash
cd apps/api && npm test 2>&1
```

Expected: all tests pass. Verify test files:
- `realtime.gateway.spec.ts` — 5 ✓
- `app.module.spec.ts` — 1 ✓
- `whatsapp-webhook.spec.ts` — 9 ✓
- `auth.spec.ts` — 5 ✓
- `ai-analysis.spec.ts` — 9 ✓
- `system.spec.ts` — 8 ✓

- [ ] **Step 3: Build**

```bash
cd apps/api && npm run build
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(openai): injectable provider with retry/timeout/token-logging + GET /system/status health checks"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| OpenAIProvider injectable | Task 2, 3 |
| maxRetries=3, timeout=30s | Task 2 |
| analyzeOperationalMetadata() | Task 2 |
| healthCheck() | Task 2 |
| isConfigured() | Task 2 |
| Token/cost logging in findings._metadata | Task 4 |
| SKIPPED → FAILED/OPENAI_API_KEY_NOT_CONFIGURED | Task 4 |
| Remove vi.mock("openai") | Task 5 |
| GET /system/status | Task 7 |
| Database check | Task 6 |
| Redis check | Task 6 |
| OpenAI check | Task 6 |
| Rollup logic | Task 6 |
| Response never exposes secrets | Task 6, 8 |
| DB unhealthy → unhealthy | Task 6, 8 |
| Redis degraded → degraded | Task 6, 8 |
| OpenAI disabled → degraded | Task 6, 8 |
| Tests for all checks | Task 8 |
| SystemModule | Task 7 |
| AppModule import | Task 7 |

### Type consistency

- `TokenUsage` defined Task 1, returned by `analyzeOperationalMetadata()` Task 2, saved in `findings._metadata` Task 4 ✅
- `ServiceStatus` defined in `openai.provider.ts` Task 2, returned by `healthCheck()`, used in `SystemService.checkOpenAI()` Task 6 ✅
- `CheckResult` defined in `system.service.ts` Task 6, returned by all three check methods ✅
- `SystemStatusResponse` defined Task 6, returned by `getStatus()`, serialized by controller Task 7 ✅
- `OpenAIProvider` registered in `AiAnalysisModule` (Task 3) and exported, imported by `SystemModule` via `AiAnalysisModule` (Task 7) ✅
