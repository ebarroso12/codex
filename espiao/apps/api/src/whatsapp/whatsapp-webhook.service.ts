import * as crypto from "node:crypto";
import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AiAnalysisService } from "../ai-analysis/ai-analysis.service";
import { maskPhone, RealtimeGateway } from "../realtime/realtime.gateway";
import type { MetaContact, MetaMessage, MetaMetadata, MetaWebhookPayload } from "./dto/meta-webhook.types";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);
  private readonly appSecret: string;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WhatsappNormalizerService) private readonly normalizer: WhatsappNormalizerService,
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway,
    @Inject(AiAnalysisService) private readonly aiAnalysis: AiAnalysisService
  ) {
    // Lazy validation: appSecret is empty string when not configured.
    // validateSignature() throws InternalServerErrorException in that case.
    this.appSecret = config.get<string>("META_WHATSAPP_APP_SECRET") ?? "";
  }

  validateSignature(rawBody: Buffer, signature: string | undefined): void {
    if (!this.appSecret) {
      throw new InternalServerErrorException(
        "META_WHATSAPP_APP_SECRET is not configured."
      );
    }

    if (!signature) {
      throw new ForbiddenException("Missing X-Hub-Signature-256 header.");
    }

    const expected = `sha256=${crypto
      .createHmac("sha256", this.appSecret)
      .update(rawBody)
      .digest("hex")}`;

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      // timingSafeEqual throws when buffer lengths differ
    }

    if (!valid) {
      throw new ForbiddenException("Invalid X-Hub-Signature-256.");
    }
  }

  async processWebhook(payload: MetaWebhookPayload): Promise<void> {
    const enableRawLog =
      this.config.get<string>("ENABLE_WEBHOOK_RAW_LOG") === "true";

    if (enableRawLog) {
      await this.prisma.auditLog.create({
        data: {
          action: "WEBHOOK_RECEIVED",
          entity: "Webhook",
          metadata: payload as unknown as Prisma.InputJsonValue
        }
      });
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;

        const { messages, contacts, metadata } = change.value;

        if (!messages?.length) continue;

        for (const message of messages) {
          await this.persistMessage(metadata, contacts, message);
        }
      }
    }
  }

  private async persistMessage(
    metadata: MetaMetadata,
    contacts: MetaContact[] | undefined,
    message: MetaMessage
  ): Promise<void> {
    const normalized = this.normalizer.normalize(message, contacts, metadata);

    const patient = await this.prisma.patient.upsert({
      where: { phoneE164: normalized.fromNumber },
      update: { name: normalized.contactName ?? undefined },
      create: {
        phoneE164: normalized.fromNumber,
        name: normalized.contactName
      }
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        patientId: patient.id,
        status: "OPEN",
        accountPhoneNumberId: metadata.phone_number_id
      },
      orderBy: { startedAt: "desc" }
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          patientId: patient.id,
          accountPhoneNumberId: metadata.phone_number_id,
          status: "OPEN"
        }
      });
      this.logger.log(
        `New conversation ${conversation.id} for patient ${patient.id}`
      );
      this.realtime.emit("conversation.created", {
        conversationId: conversation.id,
        patientPhone: maskPhone(normalized.fromNumber),
        accountPhoneNumberId: metadata.phone_number_id,
        startedAt: (conversation.startedAt ?? new Date()).toISOString()
      });
    }

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
  }
}
