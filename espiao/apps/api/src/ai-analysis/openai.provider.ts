import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { AnalysisResult, ConversationMetadata, TokenUsage } from "./dto/analysis-result.types";

export type ServiceStatus = {
  status: "healthy" | "degraded" | "disabled";
  message?: string;
  latencyMs?: number;
};

@Injectable()
export class OpenAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client?: OpenAI;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const apiKey = config.get<string>("OPENAI_API_KEY");
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4.1-mini");
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        maxRetries: 3,   // SDK handles exponential backoff for 429/500/503
        timeout: 30_000  // 30s per attempt
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  getModel(): string {
    return this.model;
  }

  async analyzeOperationalMetadata(
    metadata: ConversationMetadata,
    systemPrompt: string
  ): Promise<{ result: AnalysisResult; usage: TokenUsage }> {
    if (!this.client) {
      throw new Error("OpenAI not configured — OPENAI_API_KEY missing");
    }

    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(metadata) }
      ],
      temperature: 0.2
    });

    const latencyMs = Date.now() - start;
    const usage: TokenUsage = {
      model: this.model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      latencyMs
    };

    this.logger.log(
      `OpenAI: model=${usage.model} tokens=${usage.totalTokens} latency=${usage.latencyMs}ms`
    );

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AnalysisResult>;

    const result: AnalysisResult = {
      summary: parsed.summary ?? "Análise não disponível.",
      riskScore: typeof parsed.riskScore === "number" ? parsed.riskScore : 0,
      confidenceLevel: parsed.confidenceLevel ?? "low",
      sentimentEstimate: parsed.sentimentEstimate ?? "unknown",
      sentimentBasis: "behavioral_patterns_only",
      responseDelayRisk: parsed.responseDelayRisk ?? "none",
      needsSupervisorReview: parsed.needsSupervisorReview ?? false,
      recommendedAction: parsed.recommendedAction ?? "Nenhuma ação necessária.",
      analysisNote:
        parsed.analysisNote ?? "Análise baseada apenas em metadados operacionais."
    };

    return { result, usage };
  }

  async healthCheck(): Promise<ServiceStatus> {
    if (!this.client) {
      return { status: "disabled", message: "OPENAI_API_KEY not configured" };
    }
    const start = Date.now();
    try {
      // Lightweight check: retrieve model metadata (no tokens consumed)
      await this.client.models.retrieve(this.model);
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      return {
        status: "degraded",
        latencyMs: Date.now() - start,
        message: "OpenAI API check failed"
      };
    }
  }
}
