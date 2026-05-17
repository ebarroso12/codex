import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { SystemService, type CheckResult } from "./system.service";
import { OpenAIProvider } from "../ai-analysis/openai.provider";

function makeConfigMock(extras: Record<string, string | number | undefined> = {}) {
  const defaults: Record<string, string | number | undefined> = {
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    ...extras
  };
  return {
    get: <T>(key: string, def?: T): T | undefined =>
      ((defaults[key] ?? def) as T | undefined)
  } as unknown as ConfigService;
}

function makeOpenAIMock(status: "healthy" | "degraded" | "disabled" = "healthy") {
  return {
    healthCheck: vi.fn().mockResolvedValue({
      status,
      latencyMs: 120,
      ...(status === "disabled" && { message: "OPENAI_API_KEY not configured" })
    }),
    getModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
    isConfigured: vi.fn().mockReturnValue(status !== "disabled")
  } as unknown as OpenAIProvider;
}

function makePrismaMock(queryResult: "ok" | "error" = "ok") {
  return {
    $queryRaw: queryResult === "ok"
      ? vi.fn().mockResolvedValue([{ "?column?": 1 }])
      : vi.fn().mockRejectedValue(new Error("connection refused"))
  };
}

type ServiceWithProtected = SystemService & {
  createRedisClient: () => unknown;
};

describe("SystemService.checkDatabase", () => {
  it("returns healthy when Prisma query succeeds", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("ok") as never,
      makeOpenAIMock()
    );
    const result: CheckResult = await service.checkDatabase();
    expect(result.status).toBe("healthy");
    expect(result.latencyMs).toBeTypeOf("number");
  });

  it("returns unhealthy with safe message when Prisma query fails", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("error") as never,
      makeOpenAIMock()
    );
    const result: CheckResult = await service.checkDatabase();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toBe("Database unavailable");
    expect(result).not.toHaveProperty("stack");
  });
});

describe("SystemService.checkRedis", () => {
  let noHostService: SystemService;

  beforeEach(() => {
    const noHostConfig = {
      get: (key: string, def?: unknown) =>
        key === "REDIS_HOST" ? undefined : def
    } as unknown as ConfigService;
    noHostService = new SystemService(
      noHostConfig,
      makePrismaMock() as never,
      makeOpenAIMock()
    );
  });

  it("returns degraded when REDIS_HOST is not configured", async () => {
    const result = await noHostService.checkRedis();
    expect(result.status).toBe("degraded");
    expect(result.message).toBe("Redis not configured");
  });

  it("returns degraded with safe message when Redis ping fails", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock()
    );
    vi.spyOn(service as ServiceWithProtected, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:6379")),
      disconnect: vi.fn()
    } as never);
    const result = await service.checkRedis();
    expect(result.status).toBe("degraded");
    expect(result.message).toBe("Redis unavailable");
    expect(result.message).not.toContain("ECONNREFUSED");
    expect(result.message).not.toContain("127.0.0.1");
  });

  it("returns healthy when Redis ping succeeds", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock()
    );
    vi.spyOn(service as ServiceWithProtected, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn()
    } as never);
    const result = await service.checkRedis();
    expect(result.status).toBe("healthy");
    expect(result.latencyMs).toBeTypeOf("number");
  });
});

describe("SystemService.checkOpenAI", () => {
  it("returns disabled when OpenAI not configured", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock("disabled")
    );
    const result = await service.checkOpenAI();
    expect(result.status).toBe("disabled");
    expect(result).not.toHaveProperty("model");
  });

  it("returns healthy with model when OpenAI is configured and accessible", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock() as never,
      makeOpenAIMock("healthy")
    );
    const result = await service.checkOpenAI();
    expect(result.status).toBe("healthy");
    expect(result.model).toBe("gpt-4.1-mini");
  });
});

describe("SystemService.getStatus — rollup", () => {
  it("returns overall=unhealthy when database is unhealthy", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("error") as never,
      makeOpenAIMock("healthy")
    );
    vi.spyOn(service as ServiceWithProtected, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn()
    } as never);
    const status = await service.getStatus();
    expect(status.status).toBe("unhealthy");
    expect(status.services.database.status).toBe("unhealthy");
  });

  it("returns overall=degraded when DB is healthy but Redis is degraded", async () => {
    const noHostConfig = {
      get: (key: string, def?: unknown) =>
        key === "REDIS_HOST" ? undefined : def
    } as unknown as ConfigService;
    const service = new SystemService(
      noHostConfig,
      makePrismaMock("ok") as never,
      makeOpenAIMock("healthy")
    );
    const status = await service.getStatus();
    expect(status.status).toBe("degraded");
    expect(status.services.redis.status).toBe("degraded");
  });

  it("returns overall=degraded when DB is healthy and OpenAI is disabled", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("ok") as never,
      makeOpenAIMock("disabled")
    );
    vi.spyOn(service as ServiceWithProtected, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn()
    } as never);
    const status = await service.getStatus();
    expect(status.status).toBe("degraded");
    expect(status.services.openai.status).toBe("disabled");
  });

  it("response never exposes secrets or stack traces", async () => {
    const service = new SystemService(
      makeConfigMock(),
      makePrismaMock("error") as never,
      makeOpenAIMock()
    );
    vi.spyOn(service as ServiceWithProtected, "createRedisClient").mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      disconnect: vi.fn()
    } as never);
    const status = await service.getStatus();
    const json = JSON.stringify(status);
    expect(json).not.toContain("password");
    expect(json).not.toContain("ECONNREFUSED");
    expect(json).not.toContain("stack");
    expect(json).not.toContain("apiKey");
  });
});
