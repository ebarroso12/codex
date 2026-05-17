import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module";
import { MetaCloudApiProvider } from "./providers/meta-cloud-api.provider";
import { SessionWhatsappProvider } from "./providers/session.provider";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";
import { WhatsappProviderFactory } from "./whatsapp-provider.factory";
import { WhatsappSessionsController } from "./whatsapp-sessions.controller";
import { WhatsappSessionsService } from "./whatsapp-sessions.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ limit: 60, ttl: 60_000 }]),
    AiAnalysisModule
  ],
  controllers: [WhatsappController, WhatsappSessionsController],
  providers: [
    WhatsappCloudApiService,
    WhatsappWebhookService,
    WhatsappNormalizerService,
    MetaCloudApiProvider,
    SessionWhatsappProvider,
    WhatsappProviderFactory,
    WhatsappSessionsService
  ],
  exports: [WhatsappCloudApiService, WhatsappProviderFactory]
})
export class WhatsappModule {}
