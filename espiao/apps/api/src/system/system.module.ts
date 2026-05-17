import { Module } from "@nestjs/common";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";

@Module({
  imports: [AiAnalysisModule],
  controllers: [SystemController],
  providers: [SystemService]
})
export class SystemModule {}
