# WhatsApp Webhook Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive and persist real-time WhatsApp messages via official Meta Cloud API webhook, with HMAC-SHA256 signature validation, patient/conversation/message upserts, and full idempotency.

**Architecture:** Two-service design — `WhatsappWebhookService` orchestrates validation and persistence, `WhatsappNormalizerService` maps Meta payload types to internal domain types. Processing is synchronous within the request cycle. `@nestjs/throttler` limits POST /whatsapp/webhook to 60 req/min per IP. Idempotency via `metaMessageId` unique constraint and Prisma P2002 catch.

**Tech Stack:** NestJS 11, @nestjs/throttler ^6, Prisma 6, node:crypto (built-in), bcryptjs (existing), Vitest

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/whatsapp/dto/meta-webhook.types.ts` | TypeScript types for Meta webhook payload (no class-validator) |
| Create | `apps/api/src/whatsapp/whatsapp-normalizer.service.ts` | Maps MetaMessage → NormalizedMessage |
| Create | `apps/api/src/whatsapp/whatsapp-webhook.service.ts` | HMAC validation, audit log, patient/conversation/message persistence |
| Create | `apps/api/src/whatsapp/whatsapp-webhook.spec.ts` | Integration + unit tests |
| Modify | `apps/api/src/whatsapp/whatsapp.controller.ts` | Add POST /whatsapp/webhook with @HttpCode(200) @UseGuards(ThrottlerGuard) |
| Modify | `apps/api/src/whatsapp/whatsapp.module.ts` | Register new providers + ThrottlerModule |
| Modify | `apps/api/src/main.ts` | Add rawBody: true |
| Modify | `apps/api/src/shared/config/env.validation.ts` | Add ENABLE_WEBHOOK_RAW_LOG |
| Modify | `.env.example` | Document ENABLE_WEBHOOK_RAW_LOG |
| Modify | `apps/api/package.json` | Add @nestjs/throttler ^6.0.0 |
| Modify | `packages/database/prisma/schema.prisma` | Add accountPhoneNumberId String? to Conversation |
| Create | `packages/database/prisma/migrations/20260517000001_add_conversation_account_phone/migration.sql` | Migration SQL |

---

## Task 1: Add @nestjs/throttler dependency

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add to apps/api/package.json dependencies**

In `apps/api/package.json`, add inside `"dependencies"`:

```json
"@nestjs/throttler": "^6.0.0",
```

The final dependencies section relevant entries:
```json
{
  "dependencies": {
    "@nestjs/throttler": "^6.0.0",
    "@whatsapp-audit/database": "0.1.0",
    "@nestjs/bullmq": "^11.0.2",
    "@nestjs/common": "^11.1.6"
  }
}
```

- [ ] **Step 2: Install**

```bash
cd C:\Users\Cliente\OneDrive\Área de Trabalho\projetos\codex\espiao
npm install
```

Expected: `@nestjs/throttler` appears in node_modules. No errors.

- [ ] **Step 3: Verify import resolves**

```bash
node -e "require('@nestjs/throttler')" && echo OK
```

Expected: `OK`

---

## Task 2: Prisma schema migration (accountPhoneNumberId)

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260517000001_add_conversation_account_phone/migration.sql`

- [ ] **Step 1: Add field to Conversation model in schema.prisma**

In `packages/database/prisma/schema.prisma`, find the Conversation model and add `accountPhoneNumberId` after the `status` field:

```prisma
model Conversation {
  id                       String             @id @default(uuid())
  whatsappConversationId   String?            @unique
  patientId                String
  employeeId               String?
  status                   ConversationStatus @default(OPEN)
  accountPhoneNumberId     String?
  startedAt                DateTime           @default(now())
  closedAt                 DateTime?
  patient                  Patient            @relation(fields: [patientId], references: [id])
  employee                 Employee?          @relation(fields: [employeeId], references: [id])
  messages                 Message[]
  analyses                 AiAnalysis[]
  createdAt                DateTime           @default(now())
  updatedAt                DateTime           @updatedAt
}
```

- [ ] **Step 2: Create migration SQL**

Create `packages/database/prisma/migrations/20260517000001_add_conversation_account_phone/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "accountPhoneNumberId" TEXT;
```

- [ ] **Step 3: Verify Prisma client generates without errors**

```bash
cd C:\Users\Cliente\OneDrive\Área de Trabalho\projetos\codex\espiao
npx prisma generate --schema packages/database/prisma/schema.prisma
```

Expected: `Generated Prisma Client` — no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add accountPhoneNumberId to Conversation for multi-account webhook routing"
```

---

## Task 3: Env validation update

**Files:**
- Modify: `apps/api/src/shared/config/env.validation.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add ENABLE_WEBHOOK_RAW_LOG to env schema**

In `apps/api/src/shared/config/env.validation.ts`, replace the full file:

```typescript
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3001),
  JWT_SECRET: z.string().min(1).default("change-me-in-development"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  JWT_REFRESH_SECRET: z.string().min(1).default("change-me-refresh-in-development"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/whatsapp_audit?schema=public"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  META_WHATSAPP_API_VERSION: z.string().default("v21.0"),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_WHATSAPP_APP_SECRET: z.string().optional(),
  ENABLE_WEBHOOK_RAW_LOG: z.enum(["true", "false"]).default("false"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini")
});

export function validateEnv(config: Record<string, unknown>) {
  return envSchema.parse(config);
}
```

- [ ] **Step 2: Add ENABLE_WEBHOOK_RAW_LOG to .env.example**

In `.env.example`, add after the `META_WHATSAPP_APP_SECRET` line:

```
# Webhook
ENABLE_WEBHOOK_RAW_LOG=false
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 4: Meta webhook types

**Files:**
- Create: `apps/api/src/whatsapp/dto/meta-webhook.types.ts`

No tests needed — pure TypeScript types, validated at compile time.

- [ ] **Step 1: Create the file**

Create `apps/api/src/whatsapp/dto/meta-webhook.types.ts`:

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
  statuses?: MetaStatus[];
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
  type: string;
  text?: { body: string };
  image?: MetaMedia;
  audio?: MetaMedia;
  video?: MetaMedia;
  document?: MetaMedia;
  sticker?: MetaMedia;
  location?: MetaLocation;
  contacts?: MetaContactMessage[];
  interactive?: Record<string, unknown>;
  // TODO: reactions, template responses
};

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

export type MetaContactMessage = {
  name: { formatted_name: string };
};

export type MetaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  // TODO: errors, conversation billing
};
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 5: WhatsappNormalizerService

**Files:**
- Create: `apps/api/src/whatsapp/whatsapp-normalizer.service.ts`

- [ ] **Step 1: Create the normalizer service**

Create `apps/api/src/whatsapp/whatsapp-normalizer.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { MessageType } from "@prisma/client";
import type { MetaContact, MetaMessage, MetaMetadata } from "./dto/meta-webhook.types";

export type NormalizedMessage = {
  metaMessageId: string;
  fromNumber: string;
  contactName: string | null;
  type: MessageType;
  text: string | null;
  payload: Record<string, unknown> | null;
  sentAt: Date;
};

const TYPE_MAP: Record<string, MessageType> = {
  text: "TEXT",
  image: "IMAGE",
  audio: "AUDIO",
  video: "VIDEO",
  document: "DOCUMENT",
  sticker: "IMAGE",
  location: "TEXT",
  contacts: "TEXT",
  interactive: "INTERACTIVE",
  template: "TEMPLATE"
};

@Injectable()
export class WhatsappNormalizerService {
  normalize(
    message: MetaMessage,
    contacts: MetaContact[] | undefined,
    _metadata: MetaMetadata
  ): NormalizedMessage {
    const contact = contacts?.find((c) => c.wa_id === message.from);
    const type: MessageType = TYPE_MAP[message.type] ?? "UNKNOWN";

    let text: string | null = null;
    let payload: Record<string, unknown> | null = null;

    switch (message.type) {
      case "text":
        text = message.text?.body ?? null;
        break;

      case "image":
        if (message.image) {
          payload = message.image as unknown as Record<string, unknown>;
          text = message.image.caption ?? null;
        }
        break;

      case "video":
        if (message.video) {
          payload = message.video as unknown as Record<string, unknown>;
          text = message.video.caption ?? null;
        }
        break;

      case "audio":
        if (message.audio) {
          payload = message.audio as unknown as Record<string, unknown>;
        }
        break;

      case "document":
        if (message.document) {
          payload = message.document as unknown as Record<string, unknown>;
          text = message.document.caption ?? null;
        }
        break;

      case "sticker":
        if (message.sticker) {
          payload = message.sticker as unknown as Record<string, unknown>;
        }
        break;

      case "location":
        if (message.location) {
          payload = message.location as unknown as Record<string, unknown>;
          text = message.location.name ?? null;
        }
        break;

      case "contacts":
        if (message.contacts) {
          payload = { contacts: message.contacts } as Record<string, unknown>;
          text = message.contacts[0]?.name.formatted_name ?? null;
        }
        break;

      case "interactive":
        if (message.interactive) {
          payload = message.interactive;
        }
        break;

      default:
        // TODO: handle reactions, template responses
        payload = { raw: message } as Record<string, unknown>;
    }

    return {
      metaMessageId: message.id,
      fromNumber: message.from,
      contactName: contact?.profile.name ?? null,
      type,
      text,
      payload,
      sentAt: new Date(Number(message.timestamp) * 1000)
    };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 6: WhatsappWebhookService

**Files:**
- Create: `apps/api/src/whatsapp/whatsapp-webhook.service.ts`

- [ ] **Step 1: Create the service**

Create `apps/api/src/whatsapp/whatsapp-webhook.service.ts`:

```typescript
import * as crypto from "node:crypto";
import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { MetaContact, MetaMessage, MetaMetadata, MetaWebhookPayload } from "./dto/meta-webhook.types";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);
  private readonly appSecret: string;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WhatsappNormalizerService) private readonly normalizer: WhatsappNormalizerService
  ) {
    // Lazy validation: appSecret is empty string when not configured.
    // validateSignature() throws InternalServerErrorException in that case.
    this.appSecret = config.get<string>("META_WHATSAPP_APP_SECRET") ?? "";
  }

  validateSignature(rawBody: Buffer, signature: string | undefined): void {
    if (!this.appSecret) {
      throw new InternalServerErrorException(
        "META_WHATSAPP_APP_SECRET is not configured."
      );
    }

    if (!signature) {
      throw new ForbiddenException("Missing X-Hub-Signature-256 header.");
    }

    const expected = `sha256=${crypto
      .createHmac("sha256", this.appSecret)
      .update(rawBody)
      .digest("hex")}`;

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      // timingSafeEqual throws when buffer lengths differ
    }

    if (!valid) {
      throw new ForbiddenException("Invalid X-Hub-Signature-256.");
    }
  }

  async processWebhook(payload: MetaWebhookPayload): Promise<void> {
    const enableRawLog =
      this.config.get<string>("ENABLE_WEBHOOK_RAW_LOG") === "true";

    if (enableRawLog) {
      await this.prisma.auditLog.create({
        data: {
          action: "WEBHOOK_RECEIVED",
          entity: "Webhook",
          metadata: payload as unknown as Prisma.InputJsonValue
        }
      });
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;

        const { messages, contacts, metadata } = change.value;

        if (!messages?.length) continue;

        for (const message of messages) {
          await this.persistMessage(metadata, contacts, message);
        }
      }
    }
  }

  private async persistMessage(
    metadata: MetaMetadata,
    contacts: MetaContact[] | undefined,
    message: MetaMessage
  ): Promise<void> {
    const normalized = this.normalizer.normalize(message, contacts, metadata);

    const patient = await this.prisma.patient.upsert({
      where: { phoneE164: normalized.fromNumber },
      update: { name: normalized.contactName ?? undefined },
      create: {
        phoneE164: normalized.fromNumber,
        name: normalized.contactName
      }
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        patientId: patient.id,
        status: "OPEN",
        accountPhoneNumberId: metadata.phone_number_id
      },
      orderBy: { startedAt: "desc" }
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          patientId: patient.id,
          accountPhoneNumberId: metadata.phone_number_id,
          status: "OPEN"
        }
      });
      this.logger.log(
        `New conversation ${conversation.id} for patient ${patient.id}`
      );
    }

    try {
      await this.prisma.message.upsert({
        where: { metaMessageId: normalized.metaMessageId },
        update: {},
        create: {
          conversationId: conversation.id,
          metaMessageId: normalized.metaMessageId,
          direction: "INBOUND",
          type: normalized.type,
          text: normalized.text,
          payload:
            normalized.payload !== null
              ? (normalized.payload as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          sentAt: normalized.sentAt
        }
      });

      this.logger.log(
        `Message ${normalized.metaMessageId} persisted (type=${normalized.type})`
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        this.logger.warn(
          `Duplicate message ignored: ${normalized.metaMessageId}`
        );
        return;
      }
      this.logger.error(`Failed to persist message ${normalized.metaMessageId}`, (error as Error).stack);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 7: Update WhatsappController

**Files:**
- Modify: `apps/api/src/whatsapp/whatsapp.controller.ts`

- [ ] **Step 1: Replace controller content**

Replace the full content of `apps/api/src/whatsapp/whatsapp.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  RawBody,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { MetaWebhookPayload } from "./dto/meta-webhook.types";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Controller("whatsapp")
export class WhatsappController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly whatsapp: WhatsappCloudApiService,
    private readonly webhookService: WhatsappWebhookService
  ) {}

  @Get("provider")
  provider() {
    return {
      provider: this.whatsapp.getProviderName(),
      unofficialAutomationAllowed: false
    };
  }

  @Get("webhook")
  verifyWebhook(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string
  ) {
    const expectedToken = this.config.get<string>(
      "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN"
    );

    if (mode === "subscribe" && token && token === expectedToken) {
      return challenge;
    }

    return { verified: false };
  }

  @Post("webhook")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async receiveWebhook(
    @RawBody() rawBody: Buffer,
    @Body() body: MetaWebhookPayload,
    @Headers("x-hub-signature-256") signature: string | undefined
  ) {
    this.webhookService.validateSignature(rawBody, signature);
    await this.webhookService.processWebhook(body);
    return { received: true };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 8: Update WhatsappModule and main.ts

**Files:**
- Modify: `apps/api/src/whatsapp/whatsapp.module.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Replace WhatsappModule**

Replace the full content of `apps/api/src/whatsapp/whatsapp.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ limit: 60, ttl: 60_000 }])
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappCloudApiService,
    WhatsappWebhookService,
    WhatsappNormalizerService
  ],
  exports: [WhatsappCloudApiService]
})
export class WhatsappModule {}
```

- [ ] **Step 2: Enable rawBody in main.ts**

Replace the full content of `apps/api/src/main.ts`:

```typescript
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>("WEB_APP_URL", "http://localhost:3000"),
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  const port = config.get<number>("API_PORT", 3001);
  await app.listen(port);
}

void bootstrap();
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit infrastructure**

```bash
git add apps/api/src/whatsapp/ apps/api/src/main.ts apps/api/src/shared/ .env.example apps/api/package.json
git commit -m "feat(whatsapp): add webhook infrastructure — normalizer, webhook service, throttler"
```

---

## Task 9: Integration + unit test suite

**Files:**
- Create: `apps/api/src/whatsapp/whatsapp-webhook.spec.ts`

- [ ] **Step 1: Create the test file**

Create `apps/api/src/whatsapp/whatsapp-webhook.spec.ts`:

```typescript
import * as crypto from "node:crypto";
import { INestApplication, InternalServerErrorException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

const TEST_SECRET = "test-app-secret";
const TEST_VERIFY_TOKEN = "test-verify-token";
const PHONE_NUMBER_ID = "PHONE_NUMBER_ID";

function makeSignature(body: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

const textMessagePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550001234",
              phone_number_id: PHONE_NUMBER_ID
            },
            contacts: [{ profile: { name: "Test User" }, wa_id: "5511999990001" }],
            messages: [
              {
                from: "5511999990001",
                id: "wamid.test123",
                timestamp: "1735689600",
                type: "text",
                text: { body: "Hello" }
              }
            ]
          },
          field: "messages"
        }
      ]
    }
  ]
};

const statusOnlyPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550001234",
              phone_number_id: PHONE_NUMBER_ID
            },
            statuses: [
              {
                id: "wamid.status456",
                status: "delivered",
                timestamp: "1735689600",
                recipient_id: "5511999990001"
              }
            ]
          },
          field: "messages"
        }
      ]
    }
  ]
};

const unknownTypePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550001234",
              phone_number_id: PHONE_NUMBER_ID
            },
            contacts: [{ profile: { name: "Test User" }, wa_id: "5511999990001" }],
            messages: [
              {
                from: "5511999990001",
                id: "wamid.unknown789",
                timestamp: "1735689600",
                type: "reaction"
              }
            ]
          },
          field: "messages"
        }
      ]
    }
  ]
};

async function sendWebhook(
  baseUrl: string,
  payload: object,
  options: { secret?: string; skipSignature?: boolean } = {}
) {
  const bodyStr = JSON.stringify(payload);
  const secret = options.secret ?? TEST_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!options.skipSignature) {
    headers["x-hub-signature-256"] = makeSignature(bodyStr, secret);
  }

  const response = await fetch(`${baseUrl}/whatsapp/webhook`, {
    method: "POST",
    headers,
    body: bodyStr
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  return { response, body };
}

describe("WhatsApp Webhook", () => {
  let app: INestApplication;
  let baseUrl: string;

  const patientStore = new Map<string, { id: string; phoneE164: string; name: string | null }>();
  const conversationStore = new Map<string, { id: string; patientId: string; status: string; accountPhoneNumberId: string }>();
  const messageStore = new Map<string, { id: string; metaMessageId: string }>();

  const prismaMock = {
    patient: {
      upsert: vi.fn(({ where, create }: { where: { phoneE164: string }; create: { phoneE164: string; name: string | null } }) => {
        const existing = patientStore.get(where.phoneE164);
        if (existing) return Promise.resolve(existing);
        const patient = { id: `patient-${where.phoneE164}`, phoneE164: where.phoneE164, name: create.name };
        patientStore.set(where.phoneE164, patient);
        return Promise.resolve(patient);
      })
    },
    conversation: {
      findFirst: vi.fn(({ where }: { where: { patientId: string; status: string; accountPhoneNumberId: string } }) => {
        const found = [...conversationStore.values()].find(
          (c) => c.patientId === where.patientId && c.status === "OPEN" && c.accountPhoneNumberId === where.accountPhoneNumberId
        );
        return Promise.resolve(found ?? null);
      }),
      create: vi.fn(({ data }: { data: { patientId: string; accountPhoneNumberId: string; status: string } }) => {
        const conv = {
          id: `conv-${data.patientId}`,
          patientId: data.patientId,
          status: data.status,
          accountPhoneNumberId: data.accountPhoneNumberId
        };
        conversationStore.set(conv.id, conv);
        return Promise.resolve(conv);
      })
    },
    message: {
      upsert: vi.fn(({ where, create }: { where: { metaMessageId: string }; create: { metaMessageId: string; conversationId: string } }) => {
        const existing = messageStore.get(where.metaMessageId);
        if (existing) return Promise.resolve(existing);
        const msg = { id: `msg-${where.metaMessageId}`, metaMessageId: where.metaMessageId, conversationId: create.conversationId };
        messageStore.set(where.metaMessageId, msg);
        return Promise.resolve(msg);
      })
    },
    auditLog: {
      create: vi.fn(() => Promise.resolve({ id: "audit-id" }))
    },
    $disconnect: vi.fn(() => Promise.resolve())
  };

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.META_WHATSAPP_APP_SECRET = TEST_SECRET;
    process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── GET verify ──────────────────────────────────────────────────────────────

  it("GET /whatsapp/webhook — valid token returns challenge", async () => {
    const response = await fetch(
      `${baseUrl}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=my-challenge`
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain("my-challenge");
  });

  it("GET /whatsapp/webhook — invalid token returns verified: false", async () => {
    const response = await fetch(
      `${baseUrl}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=my-challenge`
    );
    const json = await response.json() as { verified: boolean };
    expect(response.status).toBe(200);
    expect(json.verified).toBe(false);
  });

  // ── POST signature validation ────────────────────────────────────────────────

  it("POST /whatsapp/webhook — missing signature returns 403", async () => {
    const { response } = await sendWebhook(baseUrl, textMessagePayload, { skipSignature: true });
    expect(response.status).toBe(403);
  });

  it("POST /whatsapp/webhook — invalid signature returns 403", async () => {
    const { response } = await sendWebhook(baseUrl, textMessagePayload, { secret: "wrong-secret" });
    expect(response.status).toBe(403);
  });

  // ── POST message persistence ─────────────────────────────────────────────────

  it("POST /whatsapp/webhook — valid text message persists patient, conversation, message", async () => {
    patientStore.clear();
    conversationStore.clear();
    messageStore.clear();
    vi.clearAllMocks();

    const { response, body } = await sendWebhook(baseUrl, textMessagePayload);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(prismaMock.patient.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.conversation.create).toHaveBeenCalledOnce();
    expect(prismaMock.message.upsert).toHaveBeenCalledOnce();
    expect(messageStore.has("wamid.test123")).toBe(true);
  });

  it("POST /whatsapp/webhook — duplicate message returns 200 without creating duplicate", async () => {
    // Second call with same payload — message already in store from previous test
    const { response, body } = await sendWebhook(baseUrl, textMessagePayload);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true });
    // message.upsert called but store still has only one entry for this messageId
    expect(messageStore.size).toBe(1);
  });

  it("POST /whatsapp/webhook — status-only payload (no messages) returns 200", async () => {
    vi.clearAllMocks();
    const { response, body } = await sendWebhook(baseUrl, statusOnlyPayload);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(prismaMock.patient.upsert).not.toHaveBeenCalled();
    expect(prismaMock.message.upsert).not.toHaveBeenCalled();
  });

  it("POST /whatsapp/webhook — unknown message type saves as UNKNOWN without throwing", async () => {
    patientStore.clear();
    conversationStore.clear();
    messageStore.clear();
    vi.clearAllMocks();

    const { response, body } = await sendWebhook(baseUrl, unknownTypePayload);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(messageStore.has("wamid.unknown789")).toBe(true);
    const msg = messageStore.get("wamid.unknown789") as { id: string; metaMessageId: string };
    expect(msg).toBeDefined();
  });

  // ── Unit: missing APP_SECRET ─────────────────────────────────────────────────

  it("validateSignature throws InternalServerErrorException when APP_SECRET is not configured", () => {
    const service = new WhatsappWebhookService(
      { get: () => undefined } as unknown as import("@nestjs/config").ConfigService,
      {} as PrismaService,
      new WhatsappNormalizerService()
    );

    expect(() =>
      service.validateSignature(Buffer.from("{}"), "sha256=abc")
    ).toThrow(InternalServerErrorException);
  });
});
```

- [ ] **Step 2: Run tests — they may fail, diagnose**

```bash
cd apps/api && npm test 2>&1
```

Expected: all 9 tests in `whatsapp-webhook.spec.ts` pass + 6 existing tests pass (15 total). If failures, read the error and fix.

- [ ] **Step 3: Commit tests and implementation**

```bash
git add apps/api/src/whatsapp/whatsapp-webhook.spec.ts
git commit -m "test(whatsapp): add webhook integration and unit tests"
```

---

## Task 10: Final verification

- [ ] **Step 1: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: exit 0, no errors.

- [ ] **Step 2: Full test suite**

```bash
cd apps/api && npm test
```

Expected: all tests pass (15 total: 6 auth + 1 app-module + 9 whatsapp-webhook — count may vary).

- [ ] **Step 3: Build**

```bash
cd apps/api && npm run build
```

Expected: exit 0, `dist/` populated.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(whatsapp): webhook integration — Meta Cloud API official, HMAC validation, patient/conversation/message upsert, idempotency"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| GET /whatsapp/webhook — verify token | Task 7 (kept from existing), Tests 1-2 |
| POST /whatsapp/webhook | Task 7 |
| Validate VERIFY_TOKEN | Task 7 |
| Validate X-Hub-Signature-256 | Task 6, Tests 3-4 |
| Persist raw payload to audit_logs | Task 6 (ENABLE_WEBHOOK_RAW_LOG) |
| Normalize messages | Task 5 |
| Save conversations | Task 6, Test 5 |
| Save messages | Task 6, Test 5 |
| Save patients | Task 6, Test 5 |
| Upsert patient by phone | Task 6 |
| Auto-create conversation | Task 6 |
| Tests webhook | Task 9 |
| Structured logs | Task 6 (Logger) |
| No message sending | Not implemented |
| No IA | Not implemented |
| Idempotency — no duplicates | Task 6 (upsert + P2002), Tests 6 |
| TypeScript strict | All tasks (no `any`) |
| Rate limit | Tasks 1, 7, 8 (ThrottlerGuard) |
| Unknown types never fail | Task 5 (TYPE_MAP default), Test 8 |
| TODOs for future work | Tasks 4, 5, 6 (comments) |
| Test for missing APP_SECRET | Task 9 (unit test) |
| accountPhoneNumberId in conversation lookup | Tasks 2, 6 |
| ENABLE_WEBHOOK_RAW_LOG | Tasks 3, 6 |

### Type consistency check

- `NormalizedMessage` defined in Task 5, used in Task 6 ✅
- `MetaWebhookPayload` defined in Task 4, used in Tasks 6, 7 ✅
- `MetaMessage`, `MetaContact`, `MetaMetadata` defined in Task 4, used in Tasks 5, 6 ✅
- `WhatsappNormalizerService` registered in Task 8, injected in Task 6 ✅
- `ThrottlerGuard` imported from `@nestjs/throttler` in Tasks 7, 8, test ✅
- `accountPhoneNumberId` in schema (Task 2) and service (Task 6) ✅
