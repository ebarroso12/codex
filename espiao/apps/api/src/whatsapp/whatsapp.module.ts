import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ limit: 60, ttl: 60_000 }]),
    AiAnalysisModule
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappCloudApiService,
    WhatsappWebhookService,
    WhatsappNormalizerService
  ],
  exports: [WhatsappCloudApiService]
})
export class WhatsappModule {}
