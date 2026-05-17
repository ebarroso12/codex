import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";

@Controller("whatsapp")
export class WhatsappController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly whatsapp: WhatsappCloudApiService
  ) {}

  @Get("provider")
  provider() {
    return {
      provider: this.whatsapp.getProviderName(),
      unofficialAutomationAllowed: false
    };
  }

  @Get("webhook")
  verifyWebhook(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string
  ) {
    const expectedToken = this.config.get<string>("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && token && token === expectedToken) {
      return challenge;
    }

    return {
      verified: false
    };
  }
}
