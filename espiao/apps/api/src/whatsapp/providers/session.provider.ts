import { Injectable, Logger, NotImplementedException } from "@nestjs/common";
import type {
  CreateSessionInput,
  IWhatsappProvider,
  WhatsappProviderType,
  WhatsappSessionStatus
} from "../types/whatsapp-provider.types";

/**
 * Stub provider for session-based WhatsApp connections (Evolution API, WPPConnect).
 *
 * WARNING: Session-based providers use unofficial WhatsApp connections.
 * They may violate WhatsApp Terms of Service and can be disconnected at any time.
 * Only use with explicit consent from the account holder.
 *
 * TODO: Integrate Evolution API or WPPConnect when approved.
 * Evolution API docs: https://doc.evolution-api.com
 */
@Injectable()
export class SessionWhatsappProvider implements IWhatsappProvider {
  private readonly logger = new Logger(SessionWhatsappProvider.name);

  getProviderType(): WhatsappProviderType {
    return "SESSION_PROVIDER";
  }

  async createSession(sessionId: string, input: CreateSessionInput): Promise<void> {
    this.logger.log(
      `[STUB] createSession: ${sessionId} phone=${input.phoneNumber ?? "not set"}`
    );
    // TODO: POST to Evolution API / WPPConnect to create session
  }

  async getQrCode(sessionId: string): Promise<string | null> {
    this.logger.log(`[STUB] getQrCode: ${sessionId}`);
    // TODO: GET /session/{sessionId}/qrcode from Evolution API
    return null;
  }

  async getSessionStatus(sessionId: string): Promise<WhatsappSessionStatus> {
    this.logger.log(`[STUB] getSessionStatus: ${sessionId}`);
    // TODO: GET /session/{sessionId}/status from Evolution API
    return "PENDING";
  }

  async disconnectSession(sessionId: string): Promise<void> {
    this.logger.log(`[STUB] disconnectSession: ${sessionId}`);
    // TODO: DELETE /session/{sessionId}/logout from Evolution API
  }

  async sendMessage(to: string, _text: string): Promise<void> {
    this.logger.log(`[STUB] sendMessage to ${to} — not yet implemented`);
    throw new NotImplementedException(
      "SESSION_PROVIDER sendMessage requires Evolution API integration"
    );
  }

  async handleWebhook(payload: unknown): Promise<void> {
    this.logger.log("[STUB] handleWebhook received");
    // TODO: Parse Evolution API / WPPConnect webhook payload
    void payload;
  }
}
