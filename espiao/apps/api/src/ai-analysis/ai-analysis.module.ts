import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiAnalysisController } from "./ai-analysis.controller";
import { AiAnalysisProcessor } from "./ai-analysis.processor";
import { AiAnalysisService } from "./ai-analysis.service";
import { OpenAIProvider } from "./openai.provider";

const IS_TEST = process.env.NODE_ENV === "test";

@Module({
  imports: IS_TEST ? [] : [BullModule.registerQueue({ name: "ai-analysis" })],
  controllers: [AiAnalysisController],
  providers: IS_TEST
    ? [AiAnalysisService, OpenAIProvider]
    : [AiAnalysisService, AiAnalysisProcessor, OpenAIProvider],
  exports: [AiAnalysisService, OpenAIProvider]
})
export class AiAnalysisModule {}
