import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type { AnalysisJob } from "./dto/analysis-job.types";

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);
  private readonly model: string;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    // Optional: not registered in test mode (NODE_ENV=test skips BullModule.registerQueue)
    @Optional() @InjectQueue("ai-analysis") private readonly queue?: Queue
  ) {
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4.1-mini");
  }

  getModel(): string {
    return this.model;
  }

  isConfigured(): boolean {
    return this.queue !== undefined;
  }

  async enqueue(job: AnalysisJob): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `AI analysis queue not available (test mode or Redis unavailable). Skipping enqueue for conversation ${job.conversationId}.`
      );
      return;
    }
    try {
      await this.queue.add("analyze", job, {
        // jobId deduplication:
        // - If a job with this jobId is already waiting/active/delayed → BullMQ silently ignores the add
        // - If the job previously completed or failed → new job IS created (correct: re-analyze on next message)
        jobId: `conv:${job.conversationId}`
      });
      this.logger.log(
        `Enqueued AI analysis for conversation ${job.conversationId} (jobId: conv:${job.conversationId})`
      );
    } catch (error) {
      // Fail silently: Redis down or queue error must never break the webhook
      this.logger.warn(
        `Failed to enqueue AI analysis for conversation ${job.conversationId}: ${(error as Error).message}`
      );
    }
  }
}
