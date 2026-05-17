import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

@Injectable()
export class AiAnalysisService {
  private readonly model: string;
  private readonly client?: OpenAI;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const apiKey = config.get<string>("OPENAI_API_KEY");
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4.1-mini");
    this.client = apiKey ? new OpenAI({ apiKey }) : undefined;
  }

  getModel() {
    return this.model;
  }

  isConfigured() {
    return Boolean(this.client);
  }
}
