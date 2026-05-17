# OpenAI Provider + System Status Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo usuário

---

## Objetivo

Extrair OpenAI para um provider NestJS injetável (testável via DI, sem vi.mock global), adicionar retry/timeout via SDK nativo, logar tokens/custo por análise, e criar `GET /system/status` com checks de Database, Redis e OpenAI.

---

## Arquivos

| Status | Path | Responsabilidade |
|--------|------|-----------------|
| Create | `apps/api/src/ai-analysis/openai.provider.ts` | Client OpenAI, maxRetries, timeout, healthCheck, analyze |
| Modify | `apps/api/src/ai-analysis/ai-analysis.processor.ts` | Injetar OpenAIProvider, remover OpenAI direto, usar SKIPPED |
| Modify | `apps/api/src/ai-analysis/ai-analysis.module.ts` | Registrar OpenAIProvider |
| Modify | `apps/api/src/ai-analysis/ai-analysis.spec.ts` | overrideProvider em vez de vi.mock("openai") |
| Create | `apps/api/src/system/system.module.ts` | Módulo do sistema |
| Create | `apps/api/src/system/system.controller.ts` | GET /system/status (público) |
| Create | `apps/api/src/system/system.service.ts` | 3 health checks + rollup |
| Create | `apps/api/src/system/system.spec.ts` | Testes isolados dos checks |
| Modify | `apps/api/src/app.module.ts` | Importar SystemModule |
| Modify | `apps/api/src/ai-analysis/dto/analysis-result.types.ts` | Adicionar TokenUsage type |

---

## OpenAIProvider

```typescript
export type TokenUsage = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
};

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
        maxRetries: 3,
        timeout: 30_000   // 30s per attempt, SDK handles backoff
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
      throw new Error("OpenAI not configured");
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
      `OpenAI call: model=${usage.model} tokens=${usage.totalTokens} latency=${usage.latencyMs}ms`
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
      analysisNote: parsed.analysisNote ?? "Análise baseada apenas em metadados operacionais."
    };
    return { result, usage };
  }

  async healthCheck(): Promise<ServiceStatus> {
    if (!this.client) {
      return { status: "disabled", message: "OPENAI_API_KEY not configured" };
    }
    const start = Date.now();
    try {
      // Minimal check: retrieve one model entry (no tokens, no completion)
      await this.client.models.retrieve(this.model);
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      return { status: "degraded", latencyMs: Date.now() - start, message: "OpenAI API check failed" };
    }
  }
}
```

---

## AiAnalysisProcessor — mudanças

1. Remover `new OpenAI(...)` do construtor
2. Injetar `OpenAIProvider`
3. Se `!openAI.isConfigured()`: criar AiAnalysis com `status: "FAILED"`, `error: "OPENAI_API_KEY_NOT_CONFIGURED"`, retornar sem alert
4. Chamar `openAI.analyzeOperationalMetadata(metadata, SYSTEM_PROMPT)` em vez de `this.client.chat.completions.create(...)`
5. Salvar `usage` em `AiAnalysis.findings` como campo `_metadata`

```typescript
// AiAnalysis.findings estrutura:
{
  // campos do AnalysisResult (summary, riskScore, etc.)
  summary: "...",
  riskScore: 42,
  // ...
  // metadados de uso (nunca expostos ao usuário final)
  _metadata: {
    model: "gpt-4.1-mini",
    promptTokens: 180,
    completionTokens: 95,
    totalTokens: 275,
    latencyMs: 1340
  }
}
```

---

## SystemService checks

### Database

```typescript
async checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await Promise.race([
      this.prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      )
    ]);
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { status: "unhealthy", message: "Database unavailable" };
  }
}
```

### Redis

```typescript
async checkRedis(): Promise<CheckResult> {
  const host = this.config.get<string>("REDIS_HOST");
  if (!host) {
    return { status: "degraded", message: "Redis not configured" };
  }
  const client = new IORedis({
    host,
    port: this.config.get<number>("REDIS_PORT", 6379),
    password: this.config.get<string>("REDIS_PASSWORD"),
    connectTimeout: 3000,
    commandTimeout: 3000,
    lazyConnect: true
  });
  const start = Date.now();
  try {
    await client.connect();
    await client.ping();
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch {
    return { status: "degraded", message: "Redis unavailable" };
  } finally {
    await client.quit().catch(() => undefined);
  }
}
```

### OpenAI

```typescript
async checkOpenAI(): Promise<CheckResult & { model?: string }> {
  const result = await this.openAI.healthCheck();
  return {
    status: result.status,
    latencyMs: result.latencyMs,
    model: result.status !== "disabled" ? this.openAI.getModel() : undefined,
    message: result.message
  };
}
```

---

## Rollup + response format

```typescript
type CheckResult = {
  status: "healthy" | "degraded" | "unhealthy" | "disabled";
  latencyMs?: number;
  message?: string;
  model?: string;
};

type SystemStatusResponse = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: CheckResult;
    redis: CheckResult;
    openai: CheckResult;
  };
};

// Rollup logic:
// DB unhealthy → overall = unhealthy
// redis degraded || openai degraded/disabled → overall = degraded (se DB ok)
// all healthy → healthy
```

**Regras de segurança:** `message` só contém texto descritivo genérico (nunca stack trace, host, password). Controller retorna sempre 200 com o JSON — status HTTP reflete o estado do sistema via campo `status`.

---

## Testes obrigatórios

### system.spec.ts
1. DB healthy — retorna `{ status: "healthy", latencyMs: ... }`
2. DB timeout/error → `{ status: "unhealthy", message: "Database unavailable" }`
3. Redis sem config (`REDIS_HOST` ausente) → `{ status: "degraded", message: "Redis not configured" }`
4. Redis ping error → `{ status: "degraded", message: "Redis unavailable" }`
5. OpenAI disabled (`!isConfigured()`) → `{ status: "disabled" }`
6. Status geral: DB unhealthy → overall = unhealthy
7. Status geral: DB ok + Redis degraded → overall = degraded
8. Response não expõe secrets (sem host, senha, stack trace)

### ai-analysis.spec.ts (atualizado)
- Remover `vi.mock("openai")`
- Substituir por `overrideProvider(OpenAIProvider).useValue(mockOpenAIProvider)`
- `mockOpenAIProvider = { isConfigured: () => true, analyzeOperationalMetadata: vi.fn(), healthCheck: vi.fn(), getModel: () => "gpt-4.1-mini" }`
- Adicionar teste: `isConfigured() === false` → AiAnalysis criado com `status: "FAILED"`, `error: "OPENAI_API_KEY_NOT_CONFIGURED"`, sem emit

---

## Status codes do rollup

| Database | Redis | OpenAI | Overall |
|----------|-------|--------|---------|
| healthy | healthy | healthy | healthy |
| healthy | healthy | degraded | degraded |
| healthy | healthy | disabled | degraded |
| healthy | degraded | any | degraded |
| unhealthy | any | any | unhealthy |
