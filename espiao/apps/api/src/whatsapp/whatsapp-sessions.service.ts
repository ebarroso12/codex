import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WhatsappProviderFactory } from "./whatsapp-provider.factory";
import type { CreateSessionInput, QrCodeResult, SessionStatusResult } from "./types/whatsapp-provider.types";

@Injectable()
export class WhatsappSessionsService {
  private readonly logger = new Logger(WhatsappSessionsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway,
    @Inject(WhatsappProviderFactory) private readonly factory: WhatsappProviderFactory
  ) {}

  async createSession(input: CreateSessionInput) {
    const provider = this.factory.getProvider();

    const session = await this.prisma.whatsappSession.create({
      data: {
        provider: input.provider,
        status: "PENDING",
        phoneNumber: input.phoneNumber,
        tenantId: input.tenantId,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull
      }
    });

    await provider.createSession(session.id, input);

    await this.prisma.auditLog.create({
      data: {
        action: "SESSION_CREATED",
        entity: "WhatsappSession",
        entityId: session.id,
        metadata: {
          provider: session.provider,
          sessionId: session.id
        } as Prisma.InputJsonValue
      }
    });

    this.realtime.emit("whatsapp.session.created", {
      sessionId: session.id,
      provider: session.provider,
      createdAt: session.createdAt.toISOString()
    });

    this.logger.log(`Session created: ${session.id} provider=${session.provider}`);

    return {
      id: session.id,
      provider: session.provider,
      status: session.status,
      phoneNumber: session.phoneNumber,
      createdAt: session.createdAt.toISOString()
    };
  }

  async getQrCode(sessionId: string): Promise<QrCodeResult> {
    const session = await this.findOrFail(sessionId);
    const provider = this.factory.getProvider();
    const qrDataUrl = await provider.getQrCode(session.id);

    return {
      sessionId: session.id,
      qrDataUrl,
      expiresAt: null
    };
  }

  async getStatus(sessionId: string): Promise<SessionStatusResult> {
    const session = await this.findOrFail(sessionId);
    const provider = this.factory.getProvider();
    const liveStatus = await provider.getSessionStatus(session.id);

    if (liveStatus !== session.status) {
      await this.prisma.whatsappSession.update({
        where: { id: session.id },
        data: { status: liveStatus }
      });
    }

    return {
      sessionId: session.id,
      status: liveStatus,
      phoneNumber: session.phoneNumber,
      connectedAt: session.connectedAt?.toISOString() ?? null,
      disconnectedAt: session.disconnectedAt?.toISOString() ?? null,
      provider: session.provider
    };
  }

  async disconnectSession(sessionId: string): Promise<{ disconnected: true }> {
    const session = await this.findOrFail(sessionId);
    const provider = this.factory.getProvider();

    await provider.disconnectSession(session.id);

    const now = new Date();
    await this.prisma.whatsappSession.update({
      where: { id: session.id },
      data: { status: "DISCONNECTED", disconnectedAt: now }
    });

    await this.prisma.auditLog.create({
      data: {
        action: "SESSION_DISCONNECTED",
        entity: "WhatsappSession",
        entityId: session.id,
        metadata: {
          provider: session.provider,
          sessionId: session.id,
          disconnectedAt: now.toISOString()
        } as Prisma.InputJsonValue
      }
    });

    this.realtime.emit("whatsapp.session.disconnected", {
      sessionId: session.id,
      disconnectedAt: now.toISOString()
    });

    this.logger.log(`Session disconnected: ${session.id}`);
    return { disconnected: true };
  }

  private async findOrFail(sessionId: string) {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) {
      throw new NotFoundException(`WhatsappSession ${sessionId} not found`);
    }
    return session;
  }
}
