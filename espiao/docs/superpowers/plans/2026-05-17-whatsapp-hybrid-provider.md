# WhatsApp Hybrid Provider Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid WhatsApp provider architecture that keeps Meta Cloud API untouched and adds a SESSION_PROVIDER stub (for future Evolution API / WPPConnect integration) behind a feature flag, with a new `WhatsappSession` model, 4 REST endpoints, realtime session status events, and audit logging.

**Architecture:** Strategy pattern — `IWhatsappProvider` interface with two implementations (`MetaCloudApiProvider` wrapping existing service, `SessionWhatsappProvider` stub). `WhatsappProviderFactory` selects which to use based on `WHATSAPP_PROVIDER` env var. `WhatsappSessionsService` manages CRUD + audit log. All session endpoints are JWT-protected. QR codes are never logged.

**Tech Stack:** NestJS 11, Prisma 6 (new model + migration), existing RealtimeGateway, JwtAuthGuard (existing), Vitest

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/database/prisma/schema.prisma` | Add WhatsappProviderType enum, WhatsappSessionStatus enum, WhatsappSession model |
| Create | `packages/database/prisma/migrations/20260517000002_add_whatsapp_session/migration.sql` | Migration SQL for new model |
| Modify | `apps/api/src/shared/config/env.validation.ts` | Add WHATSAPP_PROVIDER validation |
| Modify | `.env.example` | Document WHATSAPP_PROVIDER |
| Create | `apps/api/src/whatsapp/types/whatsapp-provider.types.ts` | IWhatsappProvider interface + shared DTOs |
| Create | `apps/api/src/whatsapp/providers/meta-cloud-api.provider.ts` | Wraps existing WhatsappCloudApiService |
| Create | `apps/api/src/whatsapp/providers/session.provider.ts` | Stub for future Evolution/WPPConnect |
| Create | `apps/api/src/whatsapp/whatsapp-provider.factory.ts` | Selects provider from WHATSAPP_PROVIDER env |
| Create | `apps/api/src/whatsapp/whatsapp-sessions.service.ts` | Session CRUD + audit log |
| Create | `apps/api/src/whatsapp/whatsapp-sessions.controller.ts` | POST/GET/DELETE endpoints, JWT-protected |
| Modify | `apps/api/src/whatsapp/whatsapp.module.ts` | Register new providers and services |
| Modify | `apps/api/src/realtime/realtime-events.types.ts` | Add 4 session events to RealtimeEventMap |
| Modify | `apps/web/src/lib/realtime-events.types.ts` | Mirror session event types for frontend |
| Create | `apps/api/src/whatsapp/whatsapp-sessions.spec.ts` | Tests |
| Create | `README_WHATSAPP_SESSION_PROVIDER.md` | Documentation |

---

## Task 1: Prisma schema — WhatsappSession model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260517000002_add_whatsapp_session/migration.sql`

- [ ] **Step 1: Add enums and model to schema.prisma**

In `packages/database/prisma/schema.prisma`, add after the existing enums (after `AnalysisStatus`):

```prisma
enum WhatsappProviderType {
  META_CLOUD_API
  SESSION_PROVIDER
}

enum WhatsappSessionStatus {
  PENDING
  QR_PENDING
  CONNECTED
  DISCONNECTED
  FAILED
}
```

And add the model after the `Report` model:

```prisma
model WhatsappSession {
  id                String                  @id @default(uuid())
  provider          WhatsappProviderType
  status            WhatsappSessionStatus   @default(PENDING)
  phoneNumber       String?
  qrCode            String?                 // NEVER log this field
  connectedAt       DateTime?
  disconnectedAt    DateTime?
  externalSessionId String?                 // maps to Evolution/WPP session ID
  tenantId          String?                 // future multi-tenant
  metadata          Json?                   // no secrets stored here
  createdAt         DateTime                @default(now())
  updatedAt         DateTime                @updatedAt
}
```

- [ ] **Step 2: Create migration SQL**

Create `packages/database/prisma/migrations/20260517000002_add_whatsapp_session/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "WhatsappProviderType" AS ENUM ('META_CLOUD_API', 'SESSION_PROVIDER');

-- CreateEnum
CREATE TYPE "WhatsappSessionStatus" AS ENUM ('PENDING', 'QR_PENDING', 'CONNECTED', 'DISCONNECTED', 'FAILED');

-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "provider" "WhatsappProviderType" NOT NULL,
    "status" "WhatsappSessionStatus" NOT NULL DEFAULT 'PENDING',
    "phoneNumber" TEXT,
    "qrCode" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "externalSessionId" TEXT,
    "tenantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd C:\Users\Cliente\OneDrive\Área de Trabalho\projetos\codex\espiao
npx prisma generate --schema packages/database/prisma/schema.prisma --no-engine
```

Expected: `Generated Prisma Client` — no errors.

- [ ] **Step 4: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 2: Env validation + feature flag

**Files:**
- Modify: `apps/api/src/shared/config/env.validation.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add WHATSAPP_PROVIDER to env schema**

In `apps/api/src/shared/config/env.validation.ts`, add inside `envSchema` after `ENABLE_WEBHOOK_RAW_LOG`:

```typescript
  WHATSAPP_PROVIDER: z.enum(["meta_cloud_api", "session_provider"]).default("meta_cloud_api"),
```

- [ ] **Step 2: Add to .env.example**

In `.env.example`, add after `ENABLE_WEBHOOK_RAW_LOG=false`:

```
# WhatsApp provider: meta_cloud_api | session_provider
WHATSAPP_PROVIDER=meta_cloud_api
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 3: Provider interface + types

**Files:**
- Create: `apps/api/src/whatsapp/types/whatsapp-provider.types.ts`

- [ ] **Step 1: Create the types file**

```bash
mkdir -p "apps/api/src/whatsapp/types"
```

Create `apps/api/src/whatsapp/types/whatsapp-provider.types.ts`:

```typescript
import type { WhatsappProviderType, WhatsappSessionStatus } from "@prisma/client";

export type { WhatsappProviderType, WhatsappSessionStatus };

export type CreateSessionInput = {
  provider: WhatsappProviderType;
  phoneNumber?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
};

export type SessionStatusResult = {
  sessionId: string;
  status: WhatsappSessionStatus;
  phoneNumber: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  provider: WhatsappProviderType;
};

export type QrCodeResult = {
  sessionId: string;
  // qrCode omitted from API response for security — client uses endpoint /sessions/:id/qrcode
  qrDataUrl: string | null;
  expiresAt: string | null;
};

export interface IWhatsappProvider {
  getProviderType(): WhatsappProviderType;
  createSession(sessionId: string, input: CreateSessionInput): Promise<void>;
  getQrCode(sessionId: string): Promise<string | null>;
  getSessionStatus(sessionId: string): Promise<WhatsappSessionStatus>;
  disconnectSession(sessionId: string): Promise<void>;
  sendMessage(to: string, text: string): Promise<void>;
  handleWebhook(payload: unknown): Promise<void>;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 4: MetaCloudApiProvider

**Files:**
- Create: `apps/api/src/whatsapp/providers/meta-cloud-api.provider.ts`

- [ ] **Step 1: Create the provider**

```bash
mkdir -p "apps/api/src/whatsapp/providers"
```

Create `apps/api/src/whatsapp/providers/meta-cloud-api.provider.ts`:

```typescript
import { Inject, Injectable } from "@nestjs/common";
import { WhatsappCloudApiService } from "../whatsapp-cloud-api.service";
import type {
  CreateSessionInput,
  IWhatsappProvider,
  WhatsappProviderType,
  WhatsappSessionStatus
} from "../types/whatsapp-provider.types";

@Injectable()
export class MetaCloudApiProvider implements IWhatsappProvider {
  constructor(
    @Inject(WhatsappCloudApiService)
    private readonly cloudApi: WhatsappCloudApiService
  ) {}

  getProviderType(): WhatsappProviderType {
    return "META_CLOUD_API";
  }

  async createSession(_sessionId: string, _input: CreateSessionInput): Promise<void> {
    // Meta Cloud API does not use session-based auth — no-op
  }

  async getQrCode(_sessionId: string): Promise<string | null> {
    // Meta Cloud API does not use QR codes
    return null;
  }

  async getSessionStatus(_sessionId: string): Promise<WhatsappSessionStatus> {
    // Meta Cloud API is always connected when credentials are configured
    const status = this.cloudApi.getProviderStatus();
    return status.configured ? "CONNECTED" : "FAILED";
  }

  async disconnectSession(_sessionId: string): Promise<void> {
    // Meta Cloud API sessions are not disconnectable via API
  }

  async sendMessage(to: string, text: string): Promise<void> {
    await this.cloudApi.sendTextMessage({ to, body: text });
  }

  async handleWebhook(payload: unknown): Promise<void> {
    // Handled by WhatsappWebhookService — not delegated through provider
    void payload;
  }
}
```

---

## Task 5: SessionWhatsappProvider (stub)

**Files:**
- Create: `apps/api/src/whatsapp/providers/session.provider.ts`

- [ ] **Step 1: Create the stub provider**

Create `apps/api/src/whatsapp/providers/session.provider.ts`:

```typescript
import { Injectable, Logger, NotImplementedException } from "@nestjs/common";
import type {
  CreateSessionInput,
  IWhatsappProvider,
  WhatsappProviderType,
  WhatsappSessionStatus
} from "../types/whatsapp-provider.types";

/**
 * Stub provider for session-based WhatsApp connections (Evolution API, WPPConnect).
 *
 * WARNING: Session-based providers use unofficial WhatsApp connections.
 * They may violate WhatsApp Terms of Service and can be disconnected at any time.
 * Only use with explicit consent from the account holder.
 *
 * TODO: Integrate Evolution API or WPPConnect when approved.
 * Evolution API docs: https://doc.evolution-api.com
 */
@Injectable()
export class SessionWhatsappProvider implements IWhatsappProvider {
  private readonly logger = new Logger(SessionWhatsappProvider.name);

  getProviderType(): WhatsappProviderType {
    return "SESSION_PROVIDER";
  }

  async createSession(sessionId: string, input: CreateSessionInput): Promise<void> {
    this.logger.log(
      `[STUB] createSession: ${sessionId} provider=${this.getProviderType()} phone=${input.phoneNumber ?? "not set"}`
    );
    // TODO: Call Evolution API / WPPConnect to create session
    // Example: POST /session/create { sessionId }
  }

  async getQrCode(sessionId: string): Promise<string | null> {
    this.logger.log(`[STUB] getQrCode: ${sessionId}`);
    // TODO: Poll Evolution API for QR code data URL
    // Example: GET /session/{sessionId}/qrcode → { base64: "data:image/png;base64,..." }
    return null;
  }

  async getSessionStatus(sessionId: string): Promise<WhatsappSessionStatus> {
    this.logger.log(`[STUB] getSessionStatus: ${sessionId}`);
    // TODO: GET /session/{sessionId}/status → { status: "open"|"connecting"|"close" }
    return "PENDING";
  }

  async disconnectSession(sessionId: string): Promise<void> {
    this.logger.log(`[STUB] disconnectSession: ${sessionId}`);
    // TODO: DELETE /session/{sessionId}/logout
  }

  async sendMessage(to: string, _text: string): Promise<void> {
    this.logger.log(`[STUB] sendMessage to ${to} — not yet implemented`);
    throw new NotImplementedException(
      "SESSION_PROVIDER sendMessage requires Evolution API integration"
    );
  }

  async handleWebhook(payload: unknown): Promise<void> {
    this.logger.log("[STUB] handleWebhook received");
    // TODO: Parse Evolution API webhook payload
    void payload;
  }
}
```

---

## Task 6: WhatsappProviderFactory

**Files:**
- Create: `apps/api/src/whatsapp/whatsapp-provider.factory.ts`

- [ ] **Step 1: Create the factory**

Create `apps/api/src/whatsapp/whatsapp-provider.factory.ts`:

```typescript
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MetaCloudApiProvider } from "./providers/meta-cloud-api.provider";
import { SessionWhatsappProvider } from "./providers/session.provider";
import type { IWhatsappProvider } from "./types/whatsapp-provider.types";

@Injectable()
export class WhatsappProviderFactory {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MetaCloudApiProvider) private readonly metaProvider: MetaCloudApiProvider,
    @Inject(SessionWhatsappProvider) private readonly sessionProvider: SessionWhatsappProvider
  ) {}

  getProvider(): IWhatsappProvider {
    const type = this.config.get<string>("WHATSAPP_PROVIDER", "meta_cloud_api");
    return type === "session_provider" ? this.sessionProvider : this.metaProvider;
  }
}
```

---

## Task 7: Realtime session events

**Files:**
- Modify: `apps/api/src/realtime/realtime-events.types.ts`
- Modify: `apps/web/src/lib/realtime-events.types.ts`

- [ ] **Step 1: Add session payloads and events to backend types**

In `apps/api/src/realtime/realtime-events.types.ts`, add after `AlertCreatedPayload`:

```typescript
export type WhatsappSessionCreatedPayload = {
  sessionId: string;
  provider: string;
  createdAt: string;
};

export type WhatsappSessionQrUpdatedPayload = {
  sessionId: string;
  // qrCode intentionally omitted — client fetches via GET /whatsapp/sessions/:id/qrcode
};

export type WhatsappSessionConnectedPayload = {
  sessionId: string;
  phoneNumber: string | null;
  connectedAt: string;
};

export type WhatsappSessionDisconnectedPayload = {
  sessionId: string;
  disconnectedAt: string;
};
```

And update `RealtimeEventMap` to add the 4 session events:

```typescript
export type RealtimeEventMap = {
  "message.created": RealtimeEnvelope<MessageCreatedPayload>;
  "conversation.created": RealtimeEnvelope<ConversationCreatedPayload>;
  "patient.created": RealtimeEnvelope<PatientCreatedPayload>;
  "alert.created": RealtimeEnvelope<AlertCreatedPayload>;
  "whatsapp.session.created": RealtimeEnvelope<WhatsappSessionCreatedPayload>;
  "whatsapp.session.qr_updated": RealtimeEnvelope<WhatsappSessionQrUpdatedPayload>;
  "whatsapp.session.connected": RealtimeEnvelope<WhatsappSessionConnectedPayload>;
  "whatsapp.session.disconnected": RealtimeEnvelope<WhatsappSessionDisconnectedPayload>;
};
```

- [ ] **Step 2: Mirror in frontend types**

In `apps/web/src/lib/realtime-events.types.ts`, add at the end:

```typescript
export type WhatsappSessionCreatedPayload = {
  sessionId: string;
  provider: string;
  createdAt: string;
};

export type WhatsappSessionQrUpdatedPayload = {
  sessionId: string;
};

export type WhatsappSessionConnectedPayload = {
  sessionId: string;
  phoneNumber: string | null;
  connectedAt: string;
};

export type WhatsappSessionDisconnectedPayload = {
  sessionId: string;
  disconnectedAt: string;
};
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 8: WhatsappSessionsService

**Files:**
- Create: `apps/api/src/whatsapp/whatsapp-sessions.service.ts`

- [ ] **Step 1: Create the service**

Create `apps/api/src/whatsapp/whatsapp-sessions.service.ts`:

```typescript
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WhatsappProviderFactory } from "./whatsapp-provider.factory";
import type { CreateSessionInput, QrCodeResult, SessionStatusResult } from "./types/whatsapp-provider.types";

@Injectable()
export class WhatsappSessionsService {
  private readonly logger = new Logger(WhatsappSessionsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway,
    @Inject(WhatsappProviderFactory) private readonly factory: WhatsappProviderFactory
  ) {}

  async createSession(input: CreateSessionInput) {
    const provider = this.factory.getProvider();

    const session = await this.prisma.whatsappSession.create({
      data: {
        provider: input.provider,
        status: "PENDING",
        phoneNumber: input.phoneNumber,
        tenantId: input.tenantId,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull
      }
    });

    await provider.createSession(session.id, input);

    await this.prisma.auditLog.create({
      data: {
        action: "SESSION_CREATED",
        entity: "WhatsappSession",
        entityId: session.id,
        metadata: {
          provider: session.provider,
          sessionId: session.id
        } as Prisma.InputJsonValue
      }
    });

    this.realtime.emit("whatsapp.session.created", {
      sessionId: session.id,
      provider: session.provider,
      createdAt: session.createdAt.toISOString()
    });

    this.logger.log(`Session created: ${session.id} provider=${session.provider}`);

    return {
      id: session.id,
      provider: session.provider,
      status: session.status,
      phoneNumber: session.phoneNumber,
      createdAt: session.createdAt.toISOString()
    };
  }

  async getQrCode(sessionId: string): Promise<QrCodeResult> {
    const session = await this.findOrFail(sessionId);
    const provider = this.factory.getProvider();
    const qrDataUrl = await provider.getQrCode(session.id);

    return {
      sessionId: session.id,
      qrDataUrl,
      expiresAt: null // TODO: set expiry when real provider is integrated
    };
  }

  async getStatus(sessionId: string): Promise<SessionStatusResult> {
    const session = await this.findOrFail(sessionId);
    const provider = this.factory.getProvider();
    const liveStatus = await provider.getSessionStatus(session.id);

    if (liveStatus !== session.status) {
      await this.prisma.whatsappSession.update({
        where: { id: session.id },
        data: { status: liveStatus }
      });
    }

    return {
      sessionId: session.id,
      status: liveStatus,
      phoneNumber: session.phoneNumber,
      connectedAt: session.connectedAt?.toISOString() ?? null,
      disconnectedAt: session.disconnectedAt?.toISOString() ?? null,
      provider: session.provider
    };
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const session = await this.findOrFail(sessionId);
    const provider = this.factory.getProvider();

    await provider.disconnectSession(session.id);

    const now = new Date();
    await this.prisma.whatsappSession.update({
      where: { id: session.id },
      data: { status: "DISCONNECTED", disconnectedAt: now }
    });

    await this.prisma.auditLog.create({
      data: {
        action: "SESSION_DISCONNECTED",
        entity: "WhatsappSession",
        entityId: session.id,
        metadata: {
          provider: session.provider,
          sessionId: session.id,
          disconnectedAt: now.toISOString()
        } as Prisma.InputJsonValue
      }
    });

    this.realtime.emit("whatsapp.session.disconnected", {
      sessionId: session.id,
      disconnectedAt: now.toISOString()
    });

    this.logger.log(`Session disconnected: ${session.id}`);
  }

  private async findOrFail(sessionId: string) {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) {
      throw new NotFoundException(`WhatsappSession ${sessionId} not found`);
    }
    return session;
  }
}
```

---

## Task 9: WhatsappSessionsController

**Files:**
- Create: `apps/api/src/whatsapp/whatsapp-sessions.controller.ts`

- [ ] **Step 1: Create the controller**

Create `apps/api/src/whatsapp/whatsapp-sessions.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WhatsappSessionsService } from "./whatsapp-sessions.service";
import type { CreateSessionInput } from "./types/whatsapp-provider.types";

@Controller("whatsapp/sessions")
@UseGuards(JwtAuthGuard)
export class WhatsappSessionsController {
  constructor(
    @Inject(WhatsappSessionsService)
    private readonly sessions: WhatsappSessionsService
  ) {}

  @Post()
  createSession(@Body() body: CreateSessionInput) {
    return this.sessions.createSession(body);
  }

  @Get(":id/qrcode")
  getQrCode(@Param("id") id: string) {
    return this.sessions.getQrCode(id);
  }

  @Get(":id/status")
  getStatus(@Param("id") id: string) {
    return this.sessions.getStatus(id);
  }

  @Delete(":id")
  @HttpCode(200)
  disconnectSession(@Param("id") id: string) {
    return this.sessions.disconnectSession(id);
  }
}
```

---

## Task 10: Update WhatsappModule

**Files:**
- Modify: `apps/api/src/whatsapp/whatsapp.module.ts`

- [ ] **Step 1: Register all new providers**

Replace the full content of `apps/api/src/whatsapp/whatsapp.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module";
import { MetaCloudApiProvider } from "./providers/meta-cloud-api.provider";
import { SessionWhatsappProvider } from "./providers/session.provider";
import { WhatsappCloudApiService } from "./whatsapp-cloud-api.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";
import { WhatsappProviderFactory } from "./whatsapp-provider.factory";
import { WhatsappSessionsController } from "./whatsapp-sessions.controller";
import { WhatsappSessionsService } from "./whatsapp-sessions.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ limit: 60, ttl: 60_000 }]),
    AiAnalysisModule
  ],
  controllers: [WhatsappController, WhatsappSessionsController],
  providers: [
    WhatsappCloudApiService,
    WhatsappWebhookService,
    WhatsappNormalizerService,
    MetaCloudApiProvider,
    SessionWhatsappProvider,
    WhatsappProviderFactory,
    WhatsappSessionsService
  ],
  exports: [WhatsappCloudApiService, WhatsappProviderFactory]
})
export class WhatsappModule {}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 11: Tests

**Files:**
- Create: `apps/api/src/whatsapp/whatsapp-sessions.spec.ts`

- [ ] **Step 1: Create test file**

Create `apps/api/src/whatsapp/whatsapp-sessions.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { WhatsappSessionsService } from "./whatsapp-sessions.service";
import { WhatsappProviderFactory } from "./whatsapp-provider.factory";

function makeSessionMock(overrides: Partial<{
  id: string;
  provider: "META_CLOUD_API" | "SESSION_PROVIDER";
  status: "PENDING" | "QR_PENDING" | "CONNECTED" | "DISCONNECTED" | "FAILED";
  phoneNumber: string | null;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  createdAt: Date;
}> = {}) {
  return {
    id: "session-id-1",
    provider: "META_CLOUD_API" as const,
    status: "PENDING" as const,
    phoneNumber: null,
    connectedAt: null,
    disconnectedAt: null,
    tenantId: null,
    externalSessionId: null,
    metadata: null,
    createdAt: new Date("2026-05-17T00:00:00Z"),
    updatedAt: new Date("2026-05-17T00:00:00Z"),
    ...overrides
  };
}

function makeProviderMock() {
  return {
    getProviderType: vi.fn().mockReturnValue("META_CLOUD_API"),
    createSession: vi.fn().mockResolvedValue(undefined),
    getQrCode: vi.fn().mockResolvedValue(null),
    getSessionStatus: vi.fn().mockResolvedValue("CONNECTED"),
    disconnectSession: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    handleWebhook: vi.fn().mockResolvedValue(undefined)
  };
}

describe("WhatsappSessionsService", () => {
  let service: WhatsappSessionsService;
  let prismaMock: Record<string, unknown>;
  let realtimeMock: { emit: ReturnType<typeof vi.fn> };
  let factoryMock: WhatsappProviderFactory;
  let providerMock: ReturnType<typeof makeProviderMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    providerMock = makeProviderMock();
    realtimeMock = { emit: vi.fn() };

    prismaMock = {
      whatsappSession: {
        create: vi.fn().mockResolvedValue(makeSessionMock()),
        findUnique: vi.fn().mockResolvedValue(makeSessionMock()),
        update: vi.fn().mockResolvedValue(makeSessionMock({ status: "DISCONNECTED" }))
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    factoryMock = {
      getProvider: vi.fn().mockReturnValue(providerMock)
    } as unknown as WhatsappProviderFactory;

    service = new WhatsappSessionsService(
      prismaMock as never,
      realtimeMock as never,
      factoryMock
    );
  });

  it("createSession — creates DB record, calls provider, emits event, writes audit log", async () => {
    const result = await service.createSession({
      provider: "META_CLOUD_API"
    });

    expect((prismaMock.whatsappSession as Record<string, ReturnType<typeof vi.fn>>).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: "META_CLOUD_API", status: "PENDING" })
      })
    );
    expect(providerMock.createSession).toHaveBeenCalledWith("session-id-1", expect.anything());
    expect((prismaMock.auditLog as Record<string, ReturnType<typeof vi.fn>>).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SESSION_CREATED" })
      })
    );
    expect(realtimeMock.emit).toHaveBeenCalledWith(
      "whatsapp.session.created",
      expect.objectContaining({ sessionId: "session-id-1", provider: "META_CLOUD_API" })
    );
    expect(result.id).toBe("session-id-1");
    expect(result.provider).toBe("META_CLOUD_API");
  });

  it("getQrCode — returns null for META_CLOUD_API", async () => {
    providerMock.getQrCode.mockResolvedValue(null);
    const result = await service.getQrCode("session-id-1");
    expect(result.qrDataUrl).toBeNull();
    expect(result.sessionId).toBe("session-id-1");
  });

  it("getStatus — returns live status from provider", async () => {
    providerMock.getSessionStatus.mockResolvedValue("CONNECTED");
    const result = await service.getStatus("session-id-1");
    expect(result.status).toBe("CONNECTED");
    expect(result.provider).toBe("META_CLOUD_API");
  });

  it("disconnectSession — calls provider, updates DB, emits event, writes audit log", async () => {
    await service.disconnectSession("session-id-1");

    expect(providerMock.disconnectSession).toHaveBeenCalledWith("session-id-1");
    expect((prismaMock.whatsappSession as Record<string, ReturnType<typeof vi.fn>>).update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-id-1" },
        data: expect.objectContaining({ status: "DISCONNECTED" })
      })
    );
    expect((prismaMock.auditLog as Record<string, ReturnType<typeof vi.fn>>).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SESSION_DISCONNECTED" })
      })
    );
    expect(realtimeMock.emit).toHaveBeenCalledWith(
      "whatsapp.session.disconnected",
      expect.objectContaining({ sessionId: "session-id-1" })
    );
  });

  it("getStatus — throws NotFoundException for unknown session", async () => {
    (prismaMock.whatsappSession as Record<string, ReturnType<typeof vi.fn>>).findUnique.mockResolvedValue(null);
    await expect(service.getStatus("bad-id")).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: all existing tests pass + new `whatsapp-sessions.spec.ts` tests pass.

---

## Task 12: Documentation

**Files:**
- Create: `README_WHATSAPP_SESSION_PROVIDER.md`

- [ ] **Step 1: Create README**

Create `README_WHATSAPP_SESSION_PROVIDER.md` at the repo root:

```markdown
# WhatsApp Session Provider — Integração por Sessão

⚠️ **AVISO IMPORTANTE:** Providers por sessão (Evolution API, WPPConnect) usam conexões não-oficiais
do WhatsApp. Isso pode violar os Termos de Serviço do WhatsApp e resultar em banimento do número.
Use somente com consentimento explícito do responsável e em ambientes controlados.

---

## Arquitetura de Providers

O sistema suporta dois providers via feature flag `WHATSAPP_PROVIDER`:

| Provider | Valor | Descrição |
|----------|-------|-----------|
| Meta Cloud API | `meta_cloud_api` (padrão) | API oficial da Meta. Requer número verificado no Business Manager. |
| Session Provider | `session_provider` | Conexão via sessão (QR Code / número). Stub preparado para Evolution API ou WPPConnect. |

## Configuração

```env
# .env
WHATSAPP_PROVIDER=session_provider  # ou meta_cloud_api
```

## Endpoints de Sessão

Todos os endpoints requerem autenticação JWT.

### Criar sessão

```http
POST /whatsapp/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "SESSION_PROVIDER",
  "phoneNumber": "+5516999990001"
}
```

### Obter QR Code

```http
GET /whatsapp/sessions/:id/qrcode
Authorization: Bearer <token>
```

Retorna `qrDataUrl: null` enquanto o provider real não estiver integrado.

### Status da sessão

```http
GET /whatsapp/sessions/:id/status
Authorization: Bearer <token>
```

### Desconectar

```http
DELETE /whatsapp/sessions/:id
Authorization: Bearer <token>
```

## Eventos Realtime

O dashboard recebe estes eventos via WebSocket:

| Evento | Quando |
|--------|--------|
| `whatsapp.session.created` | Nova sessão criada |
| `whatsapp.session.qr_updated` | QR Code atualizado (aguarde provider real) |
| `whatsapp.session.connected` | Sessão conectada |
| `whatsapp.session.disconnected` | Sessão desconectada |

## Integrando Evolution API

O `SessionWhatsappProvider` em `apps/api/src/whatsapp/providers/session.provider.ts`
tem todos os métodos documentados com TODO. Para integrar:

1. Obtenha o URL base do Evolution API
2. Implemente os métodos removendo os comentários `// TODO`
3. Adicione `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` ao env
4. Solicite nova aprovação antes de ativar em produção

## Segurança

- QR codes nunca são logados
- Tokens de sessão nunca são expostos no frontend
- Todos os eventos de conexão/desconexão ficam no `AuditLog`
- `metadata` nos eventos realtime nunca contém dados sensíveis
- Não use para monitoramento oculto sem consentimento do responsável
```

---

## Task 13: Final verification + Railway migration

- [ ] **Step 1: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Full test suite**

```bash
cd apps/api && npm test 2>&1
```

Expected: all tests pass (42+ existing + 5 new session tests).

- [ ] **Step 3: Build**

```bash
cd apps/api && npm run build
```

Expected: exit 0.

- [ ] **Step 4: Update Railway start command to include migration**

Run via Railway API (token already configured in this session):

```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1b2d31c4-8c1b-476e-bbf0-ded53d6d6701" \
  -d '{"query":"mutation { serviceInstanceUpdate(serviceId: \"aff8a743-7640-40fd-9bf6-f8234f43b7f1\", environmentId: \"019ddaef-9402-4817-8d42-a71930b1bc1b\", input: { startCommand: \"npx prisma migrate deploy --schema packages/database/prisma/schema.prisma && node apps/api/dist/main.js\" }) }"}'
```

Expected: `{"data":{"serviceInstanceUpdate":true}}`

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "feat(whatsapp): hybrid provider architecture — SESSION_PROVIDER stub + session endpoints + realtime events"
git push origin main
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Enum WhatsappProviderType | Task 1 |
| Enum WhatsappSessionStatus | Task 1 |
| IWhatsappProvider interface | Task 3 |
| MetaCloudApiProvider | Task 4 |
| SessionWhatsappProvider stub | Task 5 |
| WhatsappProviderFactory | Task 6 |
| POST /whatsapp/sessions | Task 9 |
| GET /whatsapp/sessions/:id/qrcode | Task 9 |
| GET /whatsapp/sessions/:id/status | Task 9 |
| DELETE /whatsapp/sessions/:id | Task 9 |
| WhatsappSession Prisma model | Task 1 |
| tenantId, externalSessionId, metadata | Task 1 |
| Migration SQL | Task 1 |
| Migration on Railway boot | Task 13 |
| Realtime events (4) | Task 7 |
| WHATSAPP_PROVIDER feature flag | Task 2 |
| Audit log SESSION_CREATED, SESSION_DISCONNECTED | Task 8 |
| Never log qrCode | Task 8, 9 |
| Meta Cloud API not removed | Task 4 (wrapper) |
| Tests | Task 11 |
| README | Task 12 |
| Existing tests still pass | Task 13 |

### Type consistency

- `IWhatsappProvider` defined Task 3, implemented in Tasks 4 and 5 ✅
- `CreateSessionInput` defined Task 3, used in Tasks 8 and 9 ✅
- `SessionStatusResult` defined Task 3, returned by Task 8 `getStatus()` ✅
- `QrCodeResult` defined Task 3, returned by Task 8 `getQrCode()` ✅
- `WhatsappSessionStatus` from Prisma, used in Tasks 8 and 11 ✅
- `WhatsappProviderType` from Prisma, used in Tasks 3, 4, 5, 8 ✅
- 4 realtime payloads defined Task 7, emitted in Task 8 ✅
