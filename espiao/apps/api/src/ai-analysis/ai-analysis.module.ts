import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiAnalysisController } from "./ai-analysis.controller";
import { AiAnalysisService } from "./ai-analysis.service";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "ai-analysis"
    })
  ],
  controllers: [AiAnalysisController],
  providers: [AiAnalysisService],
  exports: [AiAnalysisService]
})
export class AiAnalysisModule {}
