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
