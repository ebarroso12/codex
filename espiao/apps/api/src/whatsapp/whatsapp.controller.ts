import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  RawBody,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { MetaWebhookPayload } from "./dto/meta-webhook.types";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Controller("whatsapp")
export class WhatsappController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(WhatsappCloudApiService) private readonly whatsapp: WhatsappCloudApiService,
    @Inject(WhatsappWebhookService) private readonly webhookService: WhatsappWebhookService
  ) {}

  @Get("provider")
  provider() {
    return this.whatsapp.getProviderStatus();
  }

  @Get("webhook")
  verifyWebhook(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string
  ) {
    const expectedToken = this.config.get<string>(
      "META_WHATSAPP_VERIFY_TOKEN"
    );

    if (mode === "subscribe" && token && token === expectedToken) {
      return challenge;
    }

    return { verified: false };
  }

  @Post("webhook")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async receiveWebhook(
    @RawBody() rawBody: Buffer,
    @Body() body: MetaWebhookPayload,
    @Headers("x-hub-signature-256") signature: string | undefined
  ) {
    this.webhookService.validateSignature(rawBody, signature);
    await this.webhookService.processWebhook(body);
    return { received: true };
  }
}
