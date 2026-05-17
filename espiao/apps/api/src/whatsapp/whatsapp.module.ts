import { Module } from "@nestjs/common";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappController } from "./whatsapp.controller";

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappCloudApiService],
  exports: [WhatsappCloudApiService]
})
export class WhatsappModule {}
