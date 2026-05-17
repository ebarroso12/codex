# WhatsApp Cloud API Webhook - Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo usuário

---

## Objetivo

Receber e persistir mensagens em tempo real via webhook oficial da Meta WhatsApp Business Cloud API. Sincronus. Sem fila. Sem IA. Sem envio.

---

## Arquitetura

```
apps/api/src/whatsapp/
  dto/
    meta-webhook.types.ts        - tipos TypeScript payload Meta (não usa class-validator)
  whatsapp.controller.ts         - modificar: add POST /whatsapp/webhook + ThrottleGuard
  whatsapp-webhook.service.ts    - NOVO: HMAC, audit log, orquestração, persistência
  whatsapp-normalizer.service.ts - NOVO: payload Meta → entidades internas
  whatsapp.module.ts             - modificar: registrar novos providers + ThrottlerModule
  whatsapp-webhook.spec.ts       - NOVO: testes de integração

apps/api/src/main.ts             - modificar: rawBody: true
apps/api/src/shared/config/env.validation.ts - modificar: ENABLE_WEBHOOK_RAW_LOG
packages/database/prisma/schema.prisma - modificar: add accountPhoneNumberId a Conversation
packages/database/prisma/migrations/20260517000001_add_conversation_account_phone/ - NOVO
```

`WhatsappCloudApiService` não muda.

---

## Fluxo POST /whatsapp/webhook

```
1. ThrottlerGuard - rate limit (60 req/min por IP)
2. Extrair X-Hub-Signature-256 do header
3. Se ausente → 403 ForbiddenException
4. HMAC-SHA256(rawBody, META_WHATSAPP_APP_SECRET) via timingSafeEqual
5. Se inválida → 403 ForbiddenException
6. Se ENABLE_WEBHOOK_RAW_LOG=true → persistir AuditLog com payload bruto
7. Para cada entry[].changes[].value.messages[]:
   a. NormalizerService.normalize(message, contacts, metadata) → NormalizedMessage
   b. Upsert Patient por phoneE164
   c. findFirst Conversation OPEN por { patientId, accountPhoneNumberId }
      → se não existe: criar Conversation
   d. Upsert Message por metaMessageId (catch P2002 → already processed → skip)
8. Retornar 200 { received: true }

Payloads sem `messages` (status updates, delivery) → 200 { received: true } silencioso
```

---

## Tipos Meta (meta-webhook.types.ts)

```typescript
export type MetaWebhookPayload = {
  object: "whatsapp_business_account";
  entry: MetaEntry[];
};

export type MetaEntry = {
  id: string;
  changes: MetaChange[];
};

export type MetaChange = {
  value: MetaChangeValue;
  field: string;
};

export type MetaChangeValue = {
  messaging_product: "whatsapp";
  metadata: MetaMetadata;
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[]; // TODO: implementar status handler
};

export type MetaMetadata = {
  display_phone_number: string;
  phone_number_id: string;
};

export type MetaContact = {
  profile: { name: string };
  wa_id: string;
};

export type MetaMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: MetaMessageType;
  text?: { body: string };
  image?: MetaMedia;
  audio?: MetaMedia;
  video?: MetaMedia;
  document?: MetaMedia;
  sticker?: MetaMedia;
  location?: MetaLocation;
  contacts?: MetaContactMessage[];
  interactive?: Record<string, unknown>;
  // TODO: reactions, template respostas
};

export type MetaMessageType =
  | "text" | "image" | "audio" | "video" | "document"
  | "sticker" | "location" | "contacts" | "interactive"
  | "template" | "unknown";

export type MetaMedia = {
  caption?: string;
  filename?: string;
  id: string;
  mime_type: string;
  sha256: string;
};

export type MetaLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export type MetaContactMessage = { name: { formatted_name: string } };

export type MetaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
};
```

---

## Tipo Normalizado (NormalizedMessage)

```typescript
type NormalizedMessage = {
  metaMessageId: string;
  fromNumber: string;       // E.164
  contactName: string | null;
  type: MessageType;
  text: string | null;
  payload: Record<string, unknown> | null;
  sentAt: Date;
};
```

---

## Mapeamento de tipos

| Meta `type` | MessageType interno |
|-------------|---------------------|
| `text` | `TEXT` |
| `image` | `IMAGE` |
| `audio` | `AUDIO` |
| `video` | `VIDEO` |
| `document` | `DOCUMENT` |
| `sticker` | `IMAGE` |
| `location` | `TEXT` (payload em `Message.payload`) |
| `contacts` | `TEXT` (payload em `Message.payload`) |
| `interactive` | `INTERACTIVE` |
| `template` | `TEMPLATE` |
| qualquer outro | `UNKNOWN` (nunca falha o webhook) |

---

## Schema: Conversation (ajuste)

Adicionar campo `accountPhoneNumberId` para rastrear de qual número Meta a mensagem chegou:

```prisma
model Conversation {
  // ...campos existentes...
  accountPhoneNumberId String?   // phone_number_id da Meta metadata
}
```

Lookup: `findFirst({ where: { patientId, status: OPEN, accountPhoneNumberId }, orderBy: { startedAt: 'desc' } })`

---

## Env vars adicionadas

```
ENABLE_WEBHOOK_RAW_LOG=false   # true = persiste payload bruto em audit_logs
```

`META_WHATSAPP_APP_SECRET` já existe no .env.example — obrigatório em produção. Em ausência, serviço lança `Error` na inicialização.

---

## Segurança

| Caso | Resposta |
|------|----------|
| Token inválido no GET | `{ verified: false }` 200 |
| Header de assinatura ausente | 403 |
| Assinatura inválida | 403 (timingSafeEqual) |
| APP_SECRET não configurado | 500 na inicialização |
| Rate limit excedido | 429 ThrottlerException |
| Payload sem `messages` | 200 `{ received: true }` |
| `metaMessageId` duplicado | 200 `{ received: true }` (P2002 capturado) |
| Tipo de mensagem desconhecido | 200 `{ received: true }` (UNKNOWN salvo) |

---

## Rate Limiting

Pacote: `@nestjs/throttler`
Config: `ThrottlerModule.forRoot([{ limit: 60, ttl: 60_000 }])`
Aplicado: `@UseGuards(ThrottlerGuard)` apenas no POST /whatsapp/webhook

---

## Idempotência

Prisma usa `createOrUpdate` (upsert) com `where: { metaMessageId }` para Message.
Se race condition gerar P2002, captura o erro Prisma e retorna 200 normalmente.
Código do erro Prisma: `error.code === 'P2002'`

---

## Logs estruturados

```typescript
private readonly logger = new Logger(WhatsappWebhookService.name);
// Exemplos:
logger.log(`Webhook received: ${messageCount} messages`);
logger.warn(`Unknown message type: ${type}, messageId: ${id}`);
logger.error(`Failed to persist message`, error.stack);
```

---

## Testes (whatsapp-webhook.spec.ts)

1. GET — token válido → retorna challenge como string
2. GET — token inválido → `{ verified: false }`
3. POST — assinatura ausente → 403
4. POST — assinatura inválida → 403
5. POST — mensagem texto válida → 200, cria patient + conversation + message
6. POST — mensagem duplicada (mesmo metaMessageId) → 200, sem duplicata
7. POST — payload sem `messages` (status update) → 200
8. POST — tipo desconhecido → 200, salva como UNKNOWN
9. Inicialização sem META_WHATSAPP_APP_SECRET → lança erro

---

## TODOs explícitos (fora do escopo atual)

- [ ] Status handler (delivered/read/failed)
- [ ] Reactions handler
- [ ] Media download e storage (S3/R2)
- [ ] BullMQ worker para processamento assíncrono
- [ ] IA analysis worker
- [ ] Multi-tenant (organizationId em todas entidades)
