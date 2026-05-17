import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type SendTextMessageInput = {
  to: string;
  body: string;
};

const REQUIRED_VARS = [
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_VERIFY_TOKEN",
  "META_WHATSAPP_APP_SECRET"
] as const;

@Injectable()
export class WhatsappCloudApiService {
  private readonly apiVersion: string;
  private readonly phoneNumberId?: string;
  private readonly accessToken?: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.apiVersion = config.get<string>("META_WHATSAPP_API_VERSION", "v21.0");
    this.phoneNumberId = config.get<string>("META_WHATSAPP_PHONE_NUMBER_ID");
    this.accessToken = config.get<string>("META_WHATSAPP_ACCESS_TOKEN");
  }

  getProviderName(): string {
    return "Meta WhatsApp Business Cloud API";
  }

  getProviderStatus() {
    const missingEnv = REQUIRED_VARS.filter(
      (key) => !this.config.get<string>(key)
    );

    return {
      provider: "meta_cloud_api",
      configured: missingEnv.length === 0,
      connected: false, // Real token validation → POST /whatsapp/provider/verify (future)
      phoneNumberIdConfigured: Boolean(
        this.config.get<string>("META_WHATSAPP_PHONE_NUMBER_ID")
      ),
      webhookReady:
        Boolean(this.config.get<string>("META_WHATSAPP_VERIFY_TOKEN")) &&
        Boolean(this.config.get<string>("META_WHATSAPP_APP_SECRET")),
      missingEnv: [...missingEnv] // names only, never values
    };
  }

  async sendTextMessage(input: SendTextMessageInput) {
    if (!this.phoneNumberId || !this.accessToken) {
      throw new Error("Meta WhatsApp Cloud API credentials are not configured.");
    }

    const response = await fetch(
      `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.to,
          type: "text",
          text: {
            preview_url: false,
            body: input.body
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Meta WhatsApp Cloud API request failed with ${response.status}.`
      );
    }

    return response.json() as Promise<unknown>;
  }
}
