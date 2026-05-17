# AI Analysis Worker Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo usuário

---

## Objetivo

Analisar conversas WhatsApp de forma assíncrona usando OpenAI GPT-4.1 mini, gerando alertas operacionais baseados exclusivamente em metadados — sem expor conteúdo sensível, nomes, telefones ou dados médicos.

---

## Arquitetura

```
message.create() sucesso no WhatsappWebhookService
  → AiAnalysisService.enqueue({ conversationId, messageId })
  → BullMQ.add("analyze", payload, { jobId: `conv:${conversationId}` })
     (deduplicação: BullMQ ignora se jobId já existe em waiting/active/delayed;
      se job já completou anteriormente, novo job é aceito — comportamento correto)
  → AiAnalysisProcessor.process(job)
  → Prisma: busca metadados da conversa (sem texto, sem nome, sem telefone completo)
  → OpenAI chat.completions(gpt-4.1-mini) com metadados operacionais
  → Salva AiAnalysis { status: COMPLETED/FAILED, findings: JSON }
  → Se riskScore >= 70 OU needsSupervisorReview:
      Salva AuditLog { action: "AI_ALERT", metadata: { level, riskScore, ... } }
      RealtimeGateway.emit("alert.created", { alertId, level, title })
```

---

## Arquivos

| Status | Path | Responsabilidade |
|--------|------|-----------------|
| Create | `apps/api/src/ai-analysis/dto/analysis-job.types.ts` | Tipo do job BullMQ |
| Create | `apps/api/src/ai-analysis/dto/analysis-result.types.ts` | Tipo do resultado OpenAI |
| Create | `apps/api/src/ai-analysis/ai-analysis.processor.ts` | BullMQ worker |
| Create | `apps/api/src/ai-analysis/ai-analysis.spec.ts` | Testes com OpenAI mockada |
| Modify | `apps/api/src/ai-analysis/ai-analysis.module.ts` | Registrar Processor |
| Modify | `apps/api/src/ai-analysis/ai-analysis.service.ts` | Adicionar enqueue() |
| Modify | `apps/api/src/ai-analysis/ai-analysis.controller.ts` | Sem alteração funcional |
| Modify | `apps/api/src/whatsapp/whatsapp-webhook.service.ts` | Injetar AiAnalysisService, chamar enqueue() |
| Modify | `.env.example` | Documentar OPENAI_API_KEY e threshold |
| Modify | `README.md` | Seção AI Analysis |

---

## Tipos

### AnalysisJob

```typescript
export type AnalysisJob = {
  conversationId: string;
  messageId: string;
  triggeredAt: string; // ISO8601
};
```

### ConversationMetadata (coletado do DB, enviado ao OpenAI)

```typescript
// NUNCA inclui: message.text, patient.name, patient.phoneE164, dados médicos
type ConversationMetadata = {
  conversationId: string;
  status: "OPEN" | "CLOSED" | "ESCALATED";
  durationSeconds: number;
  totalMessages: number;
  inboundCount: number;
  outboundCount: number;
  avgResponseTimeSeconds: number | null;
  secondsSinceLastMessage: number;
  hasMedia: boolean;
  messageTypes: string[]; // ["TEXT", "IMAGE", "AUDIO"]
};
```

### AnalysisResult (resposta do OpenAI, JSON mode)

```typescript
export type AnalysisResult = {
  summary: string;
  riskScore: number;                // 0-100
  confidenceLevel: "low" | "medium" | "high";
  sentimentEstimate: "positive" | "neutral" | "negative" | "unknown";
  sentimentBasis: "behavioral_patterns_only"; // valor fixo — AI nunca infere conteúdo
  responseDelayRisk: "none" | "low" | "medium" | "high";
  needsSupervisorReview: boolean;
  recommendedAction: string;
  analysisNote: string; // deve conter: "Análise baseada apenas em metadados operacionais."
};
```

---

## BullMQ: Deduplicação por conversationId

```typescript
await this.queue.add("analyze", payload, {
  jobId: `conv:${conversationId}`,
  // BullMQ comportamento:
  // - Se jobId já existe em waiting/active/delayed → novo add é ignorado (dedup ativa)
  // - Se job já completou/falhou → novo add é aceito (análise futura válida)
  // - Esse comportamento é nativo do BullMQ e não requer configuração extra
});
```

Documentar esse contrato nos comentários do código para futuros desenvolvedores.

---

## Failsafe: Redis indisponível

`AiAnalysisService.enqueue()` deve capturar qualquer exceção de acesso à queue:

```typescript
async enqueue(job: AnalysisJob): Promise<void> {
  if (!this.queue) {
    this.logger.warn("AI analysis queue not available (test mode or Redis down). Skipping.");
    return;
  }
  try {
    await this.queue.add("analyze", job, { jobId: `conv:${job.conversationId}` });
  } catch (error) {
    this.logger.warn(
      `Failed to enqueue AI analysis for conversation ${job.conversationId}`,
      (error as Error).message
    );
    // Falha silenciosa — webhook não pode quebrar por causa de Redis
  }
}
```

---

## OpenAI: System prompt

```
You are an operational quality analyst for a healthcare WhatsApp support service.
Analyze conversation metadata and generate a risk assessment.
You have NO access to message content, patient names, phone numbers, or medical data.
Base your analysis ONLY on the provided operational metrics.
Never infer or mention medical conditions.
Never include personal identifiers in your response.
Your assessment helps supervisors identify conversations needing attention.
Respond only with valid JSON matching the required schema.
```

---

## Alert threshold e AuditLog

Condição: `riskScore >= 70 || needsSupervisorReview === true`

```typescript
// AuditLog criado quando threshold atingido:
{
  action: "AI_ALERT",
  entity: "AiAnalysis",
  entityId: analysisId,
  metadata: {
    level: riskScore >= 90 ? "critical" : "warning",
    riskScore,
    confidenceLevel,
    needsSupervisorReview,
    recommendedAction,
    conversationId
  }
}

// RealtimeGateway.emit("alert.created", {
//   alertId: auditLog.id,
//   level: "warning" | "critical",
//   title: "Alerta operacional — revisão necessária"
// });
```

---

## Testes obrigatórios

1. **Enqueue após message.create** — `AiAnalysisService.enqueue` chamado com `conversationId` correto
2. **Deduplicação** — segunda chamada enqueue com mesmo `conversationId` usa mesmo `jobId`
3. **Prompt não contém dados sensíveis** — verificar que prompt enviado ao OpenAI NÃO contém `message.text`, telefone completo, nome do paciente
4. **AiAnalysis COMPLETED** — quando OpenAI retorna resultado válido
5. **AuditLog + emit** — quando `riskScore >= 70`
6. **AiAnalysis FAILED** — quando OpenAI falha (exception), status=FAILED, error salvo
7. **Webhook não quebra** — quando Redis está indisponível (queue=undefined), enqueue retorna sem erro
8. **Failsafe enqueue** — quando queue.add lança exceção, Logger.warn chamado, sem throw

---

## Segurança

- `ConversationMetadata` construído via Prisma `select` explícito — nunca inclui campos sensíveis
- System prompt instrui AI a não incluir dados pessoais na resposta
- `AnalysisResult.summary` não deve ser gerado com base em conteúdo inexistente
- OpenAI JSON mode garante resposta estruturada (sem extravazamento de texto livre)

---

## TODOs futuros

- [ ] Modo B: DLP/mascaramento avançado de texto antes de enviar ao OpenAI
- [ ] Modelo Alert no Prisma com status de resolução
- [ ] Throttle configurable por conversação (max 1 análise por X minutos)
- [ ] Rastrear tokens/custo por análise
- [ ] Dashboard de histórico de alertas
