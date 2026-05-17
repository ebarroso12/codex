# AI Analysis Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add async BullMQ worker that analyzes WhatsApp conversations via OpenAI GPT-4.1 mini using only operational metadata (never message content), persists results to AiAnalysis, creates AuditLog alerts for high-risk conversations, and emits `alert.created` via RealtimeGateway.

**Architecture:** `WhatsappWebhookService` enqueues a deduplicated BullMQ job (`jobId: conv:${conversationId}`) after each new message. `AiAnalysisProcessor` (WorkerHost) collects conversation metadata from Prisma, calls OpenAI with only non-sensitive operational data, saves the result to `AiAnalysis`, and when `riskScore >= 70` or `needsSupervisorReview === true`, creates an `AuditLog` entry and emits `alert.created` via WebSocket. All failures are caught and stored as `AiAnalysis.status = FAILED` without crashing the webhook.

**Tech Stack:** NestJS 11, @nestjs/bullmq WorkerHost, BullMQ Queue deduplication, OpenAI SDK v5 (`gpt-4.1-mini`), Prisma 6, RealtimeGateway (existing)

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/ai-analysis/dto/analysis-job.types.ts` | BullMQ job payload type |
| Create | `apps/api/src/ai-analysis/dto/analysis-result.types.ts` | ConversationMetadata + AnalysisResult types |
| Create | `apps/api/src/ai-analysis/ai-analysis.processor.ts` | BullMQ WorkerHost: fetch metadata, call OpenAI, persist, emit |
| Create | `apps/api/src/ai-analysis/ai-analysis.spec.ts` | Unit tests with mocked OpenAI and Prisma |
| Modify | `apps/api/src/ai-analysis/ai-analysis.module.ts` | Add AiAnalysisProcessor (conditionally, same pattern as queue) |
| Modify | `apps/api/src/ai-analysis/ai-analysis.service.ts` | Add enqueue() with Optional queue injection + failsafe |
| Modify | `apps/api/src/whatsapp/whatsapp.module.ts` | Import AiAnalysisModule |
| Modify | `apps/api/src/whatsapp/whatsapp-webhook.service.ts` | Inject AiAnalysisService, call enqueue() after message.create |
| Modify | `.env.example` | Document AI_ANALYSIS_RISK_THRESHOLD |
| Modify | `README.md` | Add AI Analysis section |

---

## Task 1: Analysis DTO types

**Files:**
- Create: `apps/api/src/ai-analysis/dto/analysis-job.types.ts`
- Create: `apps/api/src/ai-analysis/dto/analysis-result.types.ts`

- [ ] **Step 1: Create analysis-job.types.ts**

Create `apps/api/src/ai-analysis/dto/analysis-job.types.ts`:

```typescript
export type AnalysisJob = {
  conversationId: string;
  messageId: string;
  triggeredAt: string; // ISO8601
};
```

- [ ] **Step 2: Create analysis-result.types.ts**

Create `apps/api/src/ai-analysis/dto/analysis-result.types.ts`:

```typescript
export type ConversationMetadata = {
  conversationId: string;
  status: string;
  durationSeconds: number;
  totalMessages: number;
  inboundCount: number;
  outboundCount: number;
  avgResponseTimeSeconds: number | null;
  secondsSinceLastMessage: number;
  hasMedia: boolean;
  messageTypes: string[];
  // Fields intentionally excluded: message.text, patient.name, patient.phoneE164
};

export type AnalysisResult = {
  summary: string;
  riskScore: number;                               // 0-100
  confidenceLevel: "low" | "medium" | "high";
  sentimentEstimate: "positive" | "neutral" | "negative" | "unknown";
  sentimentBasis: "behavioral_patterns_only";
  responseDelayRisk: "none" | "low" | "medium" | "high";
  needsSupervisorReview: boolean;
  recommendedAction: string;
  analysisNote: string;
};
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 2: AiAnalysisService — add enqueue()

**Files:**
- Modify: `apps/api/src/ai-analysis/ai-analysis.service.ts`

Replace the full file:

```typescript
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type { AnalysisJob } from "./dto/analysis-job.types";

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);
  private readonly model: string;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    // Optional: not registered in test mode (NODE_ENV=test skips BullModule.registerQueue)
    @Optional() @InjectQueue("ai-analysis") private readonly queue?: Queue
  ) {
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4.1-mini");
  }

  getModel(): string {
    return this.model;
  }

  isConfigured(): boolean {
    return this.queue !== undefined;
  }

  async enqueue(job: AnalysisJob): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `AI analysis queue not available (test mode or Redis unavailable). Skipping enqueue for conversation ${job.conversationId}.`
      );
      return;
    }
    try {
      await this.queue.add("analyze", job, {
        // jobId deduplication:
        // - If a job with this jobId is already waiting/active/delayed → BullMQ silently ignores the add
        // - If the job previously completed or failed → new job IS created (correct: re-analyze on next message)
        jobId: `conv:${job.conversationId}`
      });
      this.logger.log(
        `Enqueued AI analysis for conversation ${job.conversationId} (jobId: conv:${job.conversationId})`
      );
    } catch (error) {
      // Fail silently: Redis down or queue error must never break the webhook
      this.logger.warn(
        `Failed to enqueue AI analysis for conversation ${job.conversationId}: ${(error as Error).message}`
      );
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

## Task 3: AiAnalysisProcessor

**Files:**
- Create: `apps/api/src/ai-analysis/ai-analysis.processor.ts`

- [ ] **Step 1: Create processor**

Create `apps/api/src/ai-analysis/ai-analysis.processor.ts`:

```typescript
import { Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
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
  private readonly model: string;
  private readonly client: OpenAI;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway
  ) {
    super();
    const apiKey = config.get<string>("OPENAI_API_KEY") ?? "";
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4.1-mini");
    this.client = new OpenAI({ apiKey: apiKey || "no-api-key-configured" });
  }

  async process(job: Job<AnalysisJob>): Promise<void> {
    const { conversationId } = job.data;
    this.logger.log(`Processing AI analysis for conversation ${conversationId}`);

    const analysis = await this.prisma.aiAnalysis.create({
      data: {
        conversationId,
        model: this.model,
        status: "PROCESSING"
      }
    });

    try {
      const metadata = await this.buildMetadata(conversationId);
      const result = await this.callOpenAI(metadata);

      await this.prisma.aiAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: "COMPLETED",
          score: result.riskScore,
          summary: result.summary,
          findings: result as unknown as Prisma.InputJsonValue
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

    // Safety assertion: metadata must never contain sensitive fields
    // conversationId is an opaque UUID — not a personal identifier
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

  private async callOpenAI(metadata: ConversationMetadata): Promise<AnalysisResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify(metadata)
        }
      ],
      temperature: 0.2
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AnalysisResult>;

    return {
      summary: parsed.summary ?? "Análise não disponível.",
      riskScore: typeof parsed.riskScore === "number" ? parsed.riskScore : 0,
      confidenceLevel: parsed.confidenceLevel ?? "low",
      sentimentEstimate: parsed.sentimentEstimate ?? "unknown",
      sentimentBasis: "behavioral_patterns_only",
      responseDelayRisk: parsed.responseDelayRisk ?? "none",
      needsSupervisorReview: parsed.needsSupervisorReview ?? false,
      recommendedAction: parsed.recommendedAction ?? "Nenhuma ação necessária.",
      analysisNote:
        parsed.analysisNote ??
        "Análise baseada apenas em metadados operacionais."
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

Expected: no errors. If `response_format` type mismatch on OpenAI SDK: cast with `as Parameters<typeof this.client.chat.completions.create>[0]["response_format"]`.

---

## Task 4: Update AiAnalysisModule

**Files:**
- Modify: `apps/api/src/ai-analysis/ai-analysis.module.ts`

Replace the full file:

```typescript
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiAnalysisController } from "./ai-analysis.controller";
import { AiAnalysisProcessor } from "./ai-analysis.processor";
import { AiAnalysisService } from "./ai-analysis.service";

const IS_TEST = process.env.NODE_ENV === "test";

@Module({
  imports: IS_TEST
    ? []
    : [BullModule.registerQueue({ name: "ai-analysis" })],
  controllers: [AiAnalysisController],
  providers: IS_TEST
    ? [AiAnalysisService]
    : [AiAnalysisService, AiAnalysisProcessor],
  exports: [AiAnalysisService]
})
export class AiAnalysisModule {}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 5: Update WhatsappModule and WhatsappWebhookService

**Files:**
- Modify: `apps/api/src/whatsapp/whatsapp.module.ts`
- Modify: `apps/api/src/whatsapp/whatsapp-webhook.service.ts`

- [ ] **Step 1: Import AiAnalysisModule in WhatsappModule**

Replace `apps/api/src/whatsapp/whatsapp.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ limit: 60, ttl: 60_000 }]),
    AiAnalysisModule
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappCloudApiService,
    WhatsappWebhookService,
    WhatsappNormalizerService
  ],
  exports: [WhatsappCloudApiService]
})
export class WhatsappModule {}
```

- [ ] **Step 2: Inject AiAnalysisService in WhatsappWebhookService**

In `apps/api/src/whatsapp/whatsapp-webhook.service.ts`, add import at the top:

```typescript
import { AiAnalysisService } from "../ai-analysis/ai-analysis.service";
```

Replace the constructor:

```typescript
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WhatsappNormalizerService) private readonly normalizer: WhatsappNormalizerService,
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway,
    @Inject(AiAnalysisService) private readonly aiAnalysis: AiAnalysisService
  ) {
    this.appSecret = config.get<string>("META_WHATSAPP_APP_SECRET") ?? "";
  }
```

- [ ] **Step 3: Call enqueue after message.create**

In `persistMessage()`, after the successful `this.realtime.emit("message.created", ...)` call, add:

```typescript
      // Enqueue async AI analysis — deduplicated by conversationId (fails silently if Redis down)
      void this.aiAnalysis.enqueue({
        conversationId: conversation.id,
        messageId: msg.id,
        triggeredAt: new Date().toISOString()
      });
```

The full `try` block in `persistMessage()` becomes:

```typescript
    try {
      const msg = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          metaMessageId: normalized.metaMessageId,
          direction: "INBOUND",
          type: normalized.type,
          text: normalized.text,
          payload:
            normalized.payload !== null
              ? (normalized.payload as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          sentAt: normalized.sentAt
        }
      });

      this.realtime.emit("message.created", {
        messageId: msg.id,
        conversationId: conversation.id,
        fromNumber: maskPhone(normalized.fromNumber),
        messageType: normalized.type,
        sentAt: normalized.sentAt.toISOString()
      });

      // Enqueue async AI analysis — deduplicated by conversationId (fails silently if Redis down)
      void this.aiAnalysis.enqueue({
        conversationId: conversation.id,
        messageId: msg.id,
        triggeredAt: new Date().toISOString()
      });

      this.logger.log(
        `Message ${normalized.metaMessageId} persisted (type=${normalized.type})`
      );
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        this.logger.warn(
          `Duplicate message ignored: ${normalized.metaMessageId}`
        );
        return;
      }
      this.logger.error(
        `Failed to persist message ${normalized.metaMessageId}`,
        (error as Error).stack
      );
      throw error;
    }
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 6: Unit tests for AiAnalysisProcessor

**Files:**
- Create: `apps/api/src/ai-analysis/ai-analysis.spec.ts`

These are unit tests — they instantiate the processor directly and mock dependencies. No AppModule, no HTTP server needed.

- [ ] **Step 1: Create test file**

Create `apps/api/src/ai-analysis/ai-analysis.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { AiAnalysisProcessor } from "./ai-analysis.processor";
import { AiAnalysisService } from "./ai-analysis.service";
import type { AnalysisJob } from "./dto/analysis-job.types";

// ── Mock OpenAI module ──────────────────────────────────────────────────────

const mockCompletionsCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCompletionsCreate
      }
    }
  }))
}));

// ── Mock factories ──────────────────────────────────────────────────────────

function makeConfigMock(extras: Record<string, string> = {}) {
  const values: Record<string, string> = {
    OPENAI_API_KEY: "sk-test-key",
    OPENAI_MODEL: "gpt-4.1-mini",
    ...extras
  };
  return {
    get: <T>(key: string, def?: T): T | undefined =>
      (values[key] ?? def) as T | undefined
  } as unknown as ConfigService;
}

function makeConversationRow(messageCount = 3) {
  const now = Date.now();
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    direction: i % 2 === 0 ? "INBOUND" : "OUTBOUND" as "INBOUND" | "OUTBOUND",
    type: "TEXT",
    sentAt: new Date(now - (messageCount - i) * 60_000),
    receivedAt: null
  }));
  return {
    status: "OPEN" as const,
    startedAt: new Date(now - 600_000), // 10 minutes ago
    messages
  };
}

function makeAnalysisResult(riskScore = 30) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "Conversa com tempo de resposta normal.",
          riskScore,
          confidenceLevel: "medium",
          sentimentEstimate: "neutral",
          sentimentBasis: "behavioral_patterns_only",
          responseDelayRisk: "none",
          needsSupervisorReview: riskScore >= 70,
          recommendedAction: "Nenhuma ação necessária.",
          analysisNote: "Análise baseada apenas em metadados operacionais."
        })
      }
    }]
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("AiAnalysisProcessor", () => {
  let prismaCreateAnalysis: ReturnType<typeof vi.fn>;
  let prismaUpdateAnalysis: ReturnType<typeof vi.fn>;
  let prismaFindConversation: ReturnType<typeof vi.fn>;
  let prismaCreateAuditLog: ReturnType<typeof vi.fn>;
  let realtimeEmit: ReturnType<typeof vi.fn>;
  let prismaMock: unknown;
  let realtimeMock: unknown;
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

    processor = new AiAnalysisProcessor(
      makeConfigMock(),
      prismaMock as never,
      realtimeMock as never
    );
  });

  it("persists AiAnalysis with COMPLETED status on successful OpenAI call", async () => {
    mockCompletionsCreate.mockResolvedValue(makeAnalysisResult(40));

    const job = {
      data: { conversationId: "conv-id-1", messageId: "msg-id-1", triggeredAt: new Date().toISOString() }
    } as never;

    await processor.process(job);

    expect(prismaCreateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-id-1", status: "PROCESSING" })
    );
    expect(prismaUpdateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED", score: 40 })
      })
    );
  });

  it("does NOT create AuditLog or emit alert when riskScore < 70", async () => {
    mockCompletionsCreate.mockResolvedValue(makeAnalysisResult(40));

    await processor.process({
      data: { conversationId: "conv-id-1", messageId: "msg-1", triggeredAt: new Date().toISOString() }
    } as never);

    expect(prismaCreateAuditLog).not.toHaveBeenCalled();
    expect(realtimeEmit).not.toHaveBeenCalled();
  });

  it("creates AuditLog and emits alert.created when riskScore >= 70", async () => {
    mockCompletionsCreate.mockResolvedValue(makeAnalysisResult(85));

    await processor.process({
      data: { conversationId: "conv-id-1", messageId: "msg-1", triggeredAt: new Date().toISOString() }
    } as never);

    expect(prismaCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "AI_ALERT",
          entity: "AiAnalysis"
        })
      })
    );
    expect(realtimeEmit).toHaveBeenCalledWith(
      "alert.created",
      expect.objectContaining({ level: "warning" })
    );
  });

  it("creates AuditLog with level=critical when riskScore >= 90", async () => {
    mockCompletionsCreate.mockResolvedValue(makeAnalysisResult(95));

    await processor.process({
      data: { conversationId: "conv-id-1", messageId: "msg-1", triggeredAt: new Date().toISOString() }
    } as never);

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

  it("saves AiAnalysis with status=FAILED when OpenAI throws", async () => {
    mockCompletionsCreate.mockRejectedValue(new Error("OpenAI rate limit"));

    await processor.process({
      data: { conversationId: "conv-id-1", messageId: "msg-1", triggeredAt: new Date().toISOString() }
    } as never);

    expect(prismaUpdateAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "OpenAI rate limit"
        })
      })
    );
    expect(realtimeEmit).not.toHaveBeenCalled();
  });

  it("prompt sent to OpenAI does not contain message text, full phone, or patient name", async () => {
    mockCompletionsCreate.mockResolvedValue(makeAnalysisResult(30));

    // Conversation has messages with potential sensitive metadata in DB
    // but buildMetadata() must select only operational fields (no text/name/phone)
    prismaFindConversation.mockResolvedValue({
      status: "OPEN",
      startedAt: new Date(Date.now() - 600_000),
      messages: [
        { direction: "INBOUND", type: "TEXT", sentAt: new Date(Date.now() - 300_000), receivedAt: null },
        { direction: "OUTBOUND", type: "TEXT", sentAt: new Date(Date.now() - 200_000), receivedAt: null }
      ]
    });

    await processor.process({
      data: { conversationId: "conv-id-1", messageId: "msg-1", triggeredAt: new Date().toISOString() }
    } as never);

    expect(mockCompletionsCreate).toHaveBeenCalledOnce();
    const callArgs = mockCompletionsCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callArgs.messages.find(m => m.role === "user")?.content ?? "";
    const parsed = JSON.parse(userContent) as Record<string, unknown>;

    // Must NOT contain sensitive fields
    expect(parsed).not.toHaveProperty("text");
    expect(parsed).not.toHaveProperty("name");
    expect(parsed).not.toHaveProperty("phoneE164");
    expect(parsed).not.toHaveProperty("phone");
    expect(parsed).not.toHaveProperty("patientName");

    // MUST contain only operational metadata
    expect(parsed).toHaveProperty("conversationId");
    expect(parsed).toHaveProperty("totalMessages");
    expect(parsed).toHaveProperty("durationSeconds");
    expect(parsed).toHaveProperty("inboundCount");
    expect(parsed).toHaveProperty("outboundCount");
  });
});

// ── AiAnalysisService.enqueue ───────────────────────────────────────────────

describe("AiAnalysisService.enqueue", () => {
  it("logs warning and returns without throwing when queue is undefined (test mode)", async () => {
    const service = new AiAnalysisService(
      makeConfigMock(),
      undefined // no queue — test mode
    );

    const job: AnalysisJob = {
      conversationId: "conv-1",
      messageId: "msg-1",
      triggeredAt: new Date().toISOString()
    };

    await expect(service.enqueue(job)).resolves.toBeUndefined();
  });

  it("uses jobId conv:<conversationId> for deduplication", async () => {
    const mockAdd = vi.fn().mockResolvedValue(undefined);
    const queueMock = { add: mockAdd } as never;

    const service = new AiAnalysisService(makeConfigMock(), queueMock);

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

  it("logs warning and returns without throwing when queue.add throws (Redis down)", async () => {
    const queueMock = {
      add: vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    } as never;

    const service = new AiAnalysisService(makeConfigMock(), queueMock);

    await expect(
      service.enqueue({
        conversationId: "conv-1",
        messageId: "msg-1",
        triggeredAt: new Date().toISOString()
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: all existing tests + new `ai-analysis.spec.ts` tests pass. Total should be 20+ tests.

---

## Task 7: Update .env.example and README

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update .env.example**

Add after `OPENAI_MODEL=gpt-4.1-mini`:

```
AI_ANALYSIS_RISK_THRESHOLD=70
```

Note: `AI_ANALYSIS_RISK_THRESHOLD` is hardcoded to 70 in this phase. The env var is documented for future configurability.

- [ ] **Step 2: Update README — add AI Analysis section**

After the "Qualidade" section in README.md, add:

```markdown
## Análise IA (BullMQ + OpenAI)

Após cada nova mensagem persistida, um job é enfileirado no BullMQ para análise assíncrona da conversa.

O worker analisa somente **metadados operacionais** — nunca texto, nome, telefone ou dados médicos.

Dados enviados ao OpenAI:
- contagem de mensagens (entrada/saída)
- tempos de resposta médios
- duração da conversa
- tipos de mensagem (TEXT, IMAGE, etc.)
- status da conversa

Dados nunca enviados ao OpenAI:
- texto das mensagens
- nome do paciente
- telefone completo
- diagnósticos ou observações clínicas

Quando `riskScore >= 70`, um `AuditLog` é criado e o evento `alert.created` é emitido via WebSocket para o dashboard em tempo real.

Endpoint de status:

```http
GET /ai-analysis/status
Authorization: Bearer <token>
```

Resposta:

```json
{
  "model": "gpt-4.1-mini",
  "configured": true
}
```

---

## Task 8: Final verification

- [ ] **Step 1: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Run all tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: all tests pass (20+ total). Verify:
- `realtime.gateway.spec.ts` — 5 tests ✓
- `app.module.spec.ts` — 1 test ✓
- `whatsapp-webhook.spec.ts` — 9 tests ✓
- `auth.spec.ts` — 5 tests ✓
- `ai-analysis.spec.ts` — 8 tests ✓

- [ ] **Step 3: Build**

```bash
cd apps/api && npm run build
```

Expected: exit 0.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(ai): async analysis worker — OpenAI metadata-only analysis, BullMQ dedup, alert.created events"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Módulo ai-analysis (update) | Task 4 |
| Fila BullMQ para análise | Task 2, 4 |
| Enfileirar ao receber message.created | Task 5 |
| OPENAI_API_KEY + gpt-4.1-mini | Task 3 |
| Resumo operacional sem dados sensíveis | Task 3 (buildMetadata + system prompt) |
| riskScore, sentimentEstimate, responseDelayRisk | Task 3 (AnalysisResult) |
| needsSupervisorReview, recommendedAction | Task 1, 3 |
| Salvar em AiAnalysis | Task 3 |
| AuditLog quando risco alto | Task 3 |
| alert.created via RealtimeGateway | Task 3 |
| Testes com OpenAI mockada | Task 6 |
| Teste: prompt sem texto/telefone/nome | Task 6 |
| Teste: COMPLETED/FAILED | Task 6 |
| Teste: enqueue no-op quando Redis down | Task 6 |
| Webhook não quebra quando Redis down | Task 2 (failsafe enqueue) |
| .env.example | Task 7 |
| README | Task 7 |

### Placeholder scan

No TBDs or incomplete sections. ✅

### Type consistency

- `AnalysisJob` defined Task 1, used Task 2 and 5 ✅
- `ConversationMetadata` defined Task 1, returned by `buildMetadata()` Task 3, used in `callOpenAI()` Task 3 ✅
- `AnalysisResult` defined Task 1, returned by `callOpenAI()` Task 3 ✅
- `AiAnalysisService.enqueue(job: AnalysisJob)` — same type across Task 2, 5, 6 ✅
- `RISK_THRESHOLD = 70` — consistent with spec ✅
- `level: "critical" | "warning"` — consistent with `AlertCreatedPayload` in `realtime-events.types.ts` ✅
