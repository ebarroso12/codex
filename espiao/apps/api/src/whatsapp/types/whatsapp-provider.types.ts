import type { WhatsappProviderType, WhatsappSessionStatus } from "@prisma/client";

export type { WhatsappProviderType, WhatsappSessionStatus };

export type CreateSessionInput = {
  provider: WhatsappProviderType;
  phoneNumber?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
};

export type SessionStatusResult = {
  sessionId: string;
  status: WhatsappSessionStatus;
  phoneNumber: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  provider: WhatsappProviderType;
};

export type QrCodeResult = {
  sessionId: string;
  // qrCode intentionally omitted from response — never exposed directly
  qrDataUrl: string | null;
  expiresAt: string | null;
};

export interface IWhatsappProvider {
  getProviderType(): WhatsappProviderType;
  createSession(sessionId: string, input: CreateSessionInput): Promise<void>;
  getQrCode(sessionId: string): Promise<string | null>;
  getSessionStatus(sessionId: string): Promise<WhatsappSessionStatus>;
  disconnectSession(sessionId: string): Promise<void>;
  sendMessage(to: string, text: string): Promise<void>;
  handleWebhook(payload: unknown): Promise<void>;
}
