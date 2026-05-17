import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { OpenAIProvider } from "../ai-analysis/openai.provider";
import { PrismaService } from "../prisma/prisma.service";

export type CheckStatus = "healthy" | "degraded" | "unhealthy" | "disabled";

export type CheckResult = {
  status: CheckStatus;
  latencyMs?: number;
  message?: string;
  model?: string;
};

export type SystemStatusResponse = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: CheckResult;
    redis: CheckResult;
    openai: CheckResult;
  };
};

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenAIProvider) private readonly openAI: OpenAIProvider
  ) {}

  async getStatus(): Promise<SystemStatusResponse> {
    const [database, redis, openai] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkOpenAI()
    ]);

    const overall = this.rollup(database.status, redis.status, openai.status);

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      services: { database, redis, openai }
    };
  }

  async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000)
        )
      ]);
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      this.logger.warn("Database health check failed");
      return { status: "unhealthy", message: "Database unavailable" };
    }
  }

  async checkRedis(): Promise<CheckResult> {
    const host = this.config.get<string>("REDIS_HOST");
    if (!host) {
      return { status: "degraded", message: "Redis not configured" };
    }
    const client = this.createRedisClient({
      host,
      port: this.config.get<number>("REDIS_PORT", 6379),
      password: this.config.get<string>("REDIS_PASSWORD"),
      connectTimeout: 3000,
      commandTimeout: 3000,
      lazyConnect: true,
      maxRetriesPerRequest: 0
    });
    const start = Date.now();
    try {
      await client.ping();
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      this.logger.warn("Redis health check failed");
      return { status: "degraded", message: "Redis unavailable" };
    } finally {
      client.disconnect();
    }
  }

  async checkOpenAI(): Promise<CheckResult> {
    const result = await this.openAI.healthCheck();
    return {
      status: result.status,
      ...(result.latencyMs !== undefined && { latencyMs: result.latencyMs }),
      ...(result.status !== "disabled" && { model: this.openAI.getModel() }),
      ...(result.message && { message: result.message })
    };
  }

  // Protected to allow spy-based override in unit tests without module mocking
  protected createRedisClient(options: {
    host: string;
    port: number;
    password?: string;
    connectTimeout: number;
    commandTimeout: number;
    lazyConnect: boolean;
    maxRetriesPerRequest: number;
  }): Redis {
    return new Redis(options);
  }

  private rollup(
    db: CheckStatus,
    redis: CheckStatus,
    openai: CheckStatus
  ): "healthy" | "degraded" | "unhealthy" {
    if (db === "unhealthy") return "unhealthy";
    if (
      redis === "degraded" ||
      openai === "degraded" ||
      openai === "disabled"
    )
      return "degraded";
    return "healthy";
  }
}
