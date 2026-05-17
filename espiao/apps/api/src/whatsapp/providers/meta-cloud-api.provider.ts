import { Inject, Injectable } from "@nestjs/common";
import { WhatsappCloudApiService } from "../whatsapp-cloud-api.service";
import type {
  CreateSessionInput,
  IWhatsappProvider,
  WhatsappProviderType,
  WhatsappSessionStatus
} from "../types/whatsapp-provider.types";

@Injectable()
export class MetaCloudApiProvider implements IWhatsappProvider {
  constructor(
    @Inject(WhatsappCloudApiService)
    private readonly cloudApi: WhatsappCloudApiService
  ) {}

  getProviderType(): WhatsappProviderType {
    return "META_CLOUD_API";
  }

  async createSession(_sessionId: string, _input: CreateSessionInput): Promise<void> {
    // Meta Cloud API does not use session-based auth — no-op
  }

  async getQrCode(_sessionId: string): Promise<string | null> {
    // Meta Cloud API does not use QR codes
    return null;
  }

  async getSessionStatus(_sessionId: string): Promise<WhatsappSessionStatus> {
    const status = this.cloudApi.getProviderStatus();
    return status.configured ? "CONNECTED" : "FAILED";
  }

  async disconnectSession(_sessionId: string): Promise<void> {
    // Meta Cloud API sessions are not disconnectable via API
  }

  async sendMessage(to: string, text: string): Promise<void> {
    await this.cloudApi.sendTextMessage({ to, body: text });
  }

  async handleWebhook(payload: unknown): Promise<void> {
    // Handled by WhatsappWebhookService — not delegated through provider
    void payload;
  }
}
