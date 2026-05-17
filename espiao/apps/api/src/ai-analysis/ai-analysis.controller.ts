import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AiAnalysisService } from "./ai-analysis.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ai-analysis")
export class AiAnalysisController {
  constructor(private readonly aiAnalysis: AiAnalysisService) {}

  @Get("status")
  status() {
    return {
      model: this.aiAnalysis.getModel(),
      configured: this.aiAnalysis.isConfigured()
    };
  }
}
