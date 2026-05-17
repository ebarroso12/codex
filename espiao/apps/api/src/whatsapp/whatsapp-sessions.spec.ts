import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { WhatsappSessionsService } from "./whatsapp-sessions.service";
import { WhatsappProviderFactory } from "./whatsapp-provider.factory";
import type { WhatsappProviderType, WhatsappSessionStatus } from "./types/whatsapp-provider.types";

function makeSessionMock(
  overrides: Partial<{
    id: string;
    provider: WhatsappProviderType;
    status: WhatsappSessionStatus;
    phoneNumber: string | null;
    connectedAt: Date | null;
    disconnectedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string | null;
    externalSessionId: string | null;
    metadata: null;
    qrCode: null;
  }> = {}
) {
  return {
    id: "session-id-1",
    provider: "META_CLOUD_API" as WhatsappProviderType,
    status: "PENDING" as WhatsappSessionStatus,
    phoneNumber: null,
    connectedAt: null,
    disconnectedAt: null,
    tenantId: null,
    externalSessionId: null,
    metadata: null,
    qrCode: null,
    createdAt: new Date("2026-05-17T00:00:00Z"),
    updatedAt: new Date("2026-05-17T00:00:00Z"),
    ...overrides
  };
}

function makeProviderMock() {
  return {
    getProviderType: vi.fn().mockReturnValue("META_CLOUD_API"),
    createSession: vi.fn().mockResolvedValue(undefined),
    getQrCode: vi.fn().mockResolvedValue(null),
    getSessionStatus: vi.fn().mockResolvedValue("CONNECTED" as WhatsappSessionStatus),
    disconnectSession: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    handleWebhook: vi.fn().mockResolvedValue(undefined)
  };
}

describe("WhatsappSessionsService", () => {
  let service: WhatsappSessionsService;
  let sessionCreate: ReturnType<typeof vi.fn>;
  let sessionFindUnique: ReturnType<typeof vi.fn>;
  let sessionUpdate: ReturnType<typeof vi.fn>;
  let auditLogCreate: ReturnType<typeof vi.fn>;
  let realtimeEmit: ReturnType<typeof vi.fn>;
  let prismaMock: unknown;
  let factoryMock: WhatsappProviderFactory;
  let providerMock: ReturnType<typeof makeProviderMock>;

  beforeEach(() => {
    vi.clearAllMocks();

    providerMock = makeProviderMock();
    realtimeEmit = vi.fn();
    sessionCreate = vi.fn().mockResolvedValue(makeSessionMock());
    sessionFindUnique = vi.fn().mockResolvedValue(makeSessionMock());
    sessionUpdate = vi.fn().mockResolvedValue(makeSessionMock({ status: "DISCONNECTED" }));
    auditLogCreate = vi.fn().mockResolvedValue({ id: "audit-1" });

    prismaMock = {
      whatsappSession: {
        create: sessionCreate,
        findUnique: sessionFindUnique,
        update: sessionUpdate
      },
      auditLog: { create: auditLogCreate }
    };

    factoryMock = {
      getProvider: vi.fn().mockReturnValue(providerMock)
    } as unknown as WhatsappProviderFactory;

    service = new WhatsappSessionsService(
      prismaMock as never,
      { emit: realtimeEmit } as never,
      factoryMock
    );
  });

  it("createSession — creates DB record, calls provider, writes audit log, emits event", async () => {
    const result = await service.createSession({ provider: "META_CLOUD_API" });

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: "META_CLOUD_API", status: "PENDING" })
      })
    );
    expect(providerMock.createSession).toHaveBeenCalledWith("session-id-1", expect.anything());
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SESSION_CREATED", entity: "WhatsappSession" })
      })
    );
    expect(realtimeEmit).toHaveBeenCalledWith(
      "whatsapp.session.created",
      expect.objectContaining({ sessionId: "session-id-1", provider: "META_CLOUD_API" })
    );
    expect(result.id).toBe("session-id-1");
    expect(result.provider).toBe("META_CLOUD_API");
  });

  it("getQrCode — returns null for META_CLOUD_API stub", async () => {
    providerMock.getQrCode.mockResolvedValue(null);
    const result = await service.getQrCode("session-id-1");
    expect(result.qrDataUrl).toBeNull();
    expect(result.sessionId).toBe("session-id-1");
    // qrCode never in result object directly
    expect(result).not.toHaveProperty("qrCode");
  });

  it("getStatus — returns live status from provider", async () => {
    providerMock.getSessionStatus.mockResolvedValue("CONNECTED");
    const result = await service.getStatus("session-id-1");
    expect(result.status).toBe("CONNECTED");
    expect(result.provider).toBe("META_CLOUD_API");
  });

  it("disconnectSession — calls provider, updates DB, writes audit log, emits event", async () => {
    const result = await service.disconnectSession("session-id-1");

    expect(providerMock.disconnectSession).toHaveBeenCalledWith("session-id-1");
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-id-1" },
        data: expect.objectContaining({ status: "DISCONNECTED" })
      })
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SESSION_DISCONNECTED" })
      })
    );
    expect(realtimeEmit).toHaveBeenCalledWith(
      "whatsapp.session.disconnected",
      expect.objectContaining({ sessionId: "session-id-1" })
    );
    expect(result.disconnected).toBe(true);
  });

  it("getStatus — throws NotFoundException for unknown session", async () => {
    sessionFindUnique.mockResolvedValue(null);
    await expect(service.getStatus("bad-id")).rejects.toThrow(NotFoundException);
  });
});
