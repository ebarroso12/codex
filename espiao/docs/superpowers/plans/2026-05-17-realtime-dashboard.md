# Realtime Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time dashboard updates via socket.io so every connected browser updates instantly when new WhatsApp messages arrive via webhook.

**Architecture:** NestJS `RealtimeGateway` (global singleton) emits typed envelopes after each webhook persist. Next.js `RealtimeDashboard.tsx` (Client Component) connects via `useSocket` singleton hook (SSR-safe: socket created inside `useEffect` only), patches state incrementally, and shows `sonner` toasts. `page.tsx` stays as Server Component passing initial mock data as props.

**Tech Stack:** NestJS 11, @nestjs/websockets, @nestjs/platform-socket.io, socket.io, socket.io-client ^4, sonner, React 19, Next.js 15

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/realtime/realtime-events.types.ts` | Envelope + typed event payloads |
| Create | `apps/api/src/realtime/realtime.gateway.ts` | WebSocket server, emit helper, maskPhone util |
| Create | `apps/api/src/realtime/realtime.module.ts` | @Global module, exports RealtimeGateway |
| Create | `apps/api/src/realtime/realtime.gateway.spec.ts` | Unit tests for maskPhone + emit |
| Modify | `apps/api/src/app.module.ts` | Import RealtimeModule |
| Modify | `apps/api/src/whatsapp/whatsapp-webhook.service.ts` | Inject RealtimeGateway; switch upsert→create+P2002; emit events |
| Modify | `apps/api/src/whatsapp/whatsapp-webhook.spec.ts` | Update mock: message.upsert→message.create; add RealtimeGateway mock |
| Modify | `apps/api/package.json` | Add @nestjs/websockets, @nestjs/platform-socket.io |
| Create | `apps/web/src/lib/realtime-events.types.ts` | Mirror of backend event types for frontend |
| Create | `apps/web/src/hooks/use-socket.ts` | SSR-safe singleton socket.io-client hook |
| Create | `apps/web/src/components/RealtimeDashboard.tsx` | "use client" — socket lifecycle, state, table, badge |
| Modify | `apps/web/src/app/layout.tsx` | Add `<Toaster>` from sonner |
| Modify | `apps/web/src/app/page.tsx` | Pass initialConversations+initialActiveCount to RealtimeDashboard |
| Modify | `apps/web/src/app/globals.css` | CSS for .onlineDot, .realtimeStatus, .activeCount |
| Modify | `apps/web/package.json` | Add socket.io-client, sonner |

---

## Task 1: Backend WebSocket dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add dependencies**

In `apps/api/package.json` inside `"dependencies"`, add after `"@nestjs/throttler": "^6.0.0",`:

```json
"@nestjs/platform-socket.io": "^11.1.6",
"@nestjs/websockets": "^11.1.6",
```

- [ ] **Step 2: Install**

```bash
cd C:\Users\Cliente\OneDrive\Área de Trabalho\projetos\codex\espiao
npm install
```

Expected: `@nestjs/websockets` and `@nestjs/platform-socket.io` appear in `node_modules`. Also installs `socket.io` as peer dep.

- [ ] **Step 3: Verify**

```bash
node -e "require('@nestjs/websockets'); require('@nestjs/platform-socket.io'); console.log('OK')"
```

Expected: `OK`

---

## Task 2: Realtime event types (backend)

**Files:**
- Create: `apps/api/src/realtime/realtime-events.types.ts`

- [ ] **Step 1: Create file**

Create `apps/api/src/realtime/realtime-events.types.ts`:

```typescript
export type RealtimeEnvelope<T> = {
  event: string;
  version: 1;
  timestamp: string;
  data: T;
};

export type MessageCreatedPayload = {
  messageId: string;
  conversationId: string;
  fromNumber: string;
  messageType: string;
  sentAt: string;
};

export type ConversationCreatedPayload = {
  conversationId: string;
  patientPhone: string;
  accountPhoneNumberId: string;
  startedAt: string;
};

export type PatientCreatedPayload = {
  patientId: string;
  createdAt: string;
};

export type AlertCreatedPayload = {
  alertId: string;
  level: "info" | "warning" | "critical";
  title: string;
};

export type RealtimeEventMap = {
  "message.created": RealtimeEnvelope<MessageCreatedPayload>;
  "conversation.created": RealtimeEnvelope<ConversationCreatedPayload>;
  "patient.created": RealtimeEnvelope<PatientCreatedPayload>;
  "alert.created": RealtimeEnvelope<AlertCreatedPayload>;
};
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 3: RealtimeGateway

**Files:**
- Create: `apps/api/src/realtime/realtime.gateway.ts`

- [ ] **Step 1: Create gateway**

Create `apps/api/src/realtime/realtime.gateway.ts`:

```typescript
import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import type { RealtimeEventMap } from "./realtime-events.types";

export function maskPhone(e164: string): string {
  if (e164.length < 8) return "***";
  return `${e164.slice(0, 5)}****${e164.slice(-4)}`;
}

@WebSocketGateway({
  cors: { origin: process.env["WEB_APP_URL"] ?? "http://localhost:3000" },
  transports: ["websocket"],
  pingInterval: 25000,
  pingTimeout: 60000
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private emitCount = 0;

  @WebSocketServer()
  private server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(
      `Socket connected: ${client.id} | clients: ${this.server?.sockets?.size ?? "?"}`
    );
    // TODO: JWT auth — extract tenantId from client.handshake.auth.token
    // TODO: client.join(`tenant:${tenantId}`)
    // TODO: client.join(`supervisor:${userId}`)
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  emit<K extends keyof RealtimeEventMap>(
    event: K,
    data: RealtimeEventMap[K]["data"]
  ): void {
    const envelope = {
      event,
      version: 1 as const,
      timestamp: new Date().toISOString(),
      data
    };
    this.server.emit(event as string, envelope);
    this.emitCount++;
    this.logger.log(`Emitted ${event} (total: ${this.emitCount})`);
    // TODO: Redis adapter — replace with room-based emit:
    // this.server.to(`tenant:${tenantId}`).emit(event, envelope)
    // TODO: room per clinic: this.server.to(`clinic:${clinicId}`).emit(...)
    // TODO: room per supervisor: this.server.to(`supervisor:${userId}`).emit(...)
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 4: RealtimeModule

**Files:**
- Create: `apps/api/src/realtime/realtime.module.ts`

- [ ] **Step 1: Create module**

Create `apps/api/src/realtime/realtime.module.ts`:

```typescript
import { Global, Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";

@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway]
})
export class RealtimeModule {}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 5: Import RealtimeModule in AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add import**

In `apps/api/src/app.module.ts`, add the import at the top:

```typescript
import { RealtimeModule } from "./realtime/realtime.module";
```

And add `RealtimeModule` to the `imports` array before `PrismaModule`:

```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
  ...(process.env.NODE_ENV === "test"
    ? []
    : [BullModule.forRootAsync({ ... })]),
  RealtimeModule,
  PrismaModule,
  AuthModule,
  // ...rest unchanged
]
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 6: Integrate RealtimeGateway into WhatsappWebhookService

**Files:**
- Modify: `apps/api/src/whatsapp/whatsapp-webhook.service.ts`

The current service uses `message.upsert({ update: {} })` which can't distinguish create from update. Switch to `message.create` + P2002 catch so events only emit for genuinely new messages.

- [ ] **Step 1: Add imports**

At the top of `apps/api/src/whatsapp/whatsapp-webhook.service.ts`, add:

```typescript
import { maskPhone, RealtimeGateway } from "../realtime/realtime.gateway";
```

- [ ] **Step 2: Add RealtimeGateway to constructor**

Replace the constructor:

```typescript
constructor(
  @Inject(ConfigService) private readonly config: ConfigService,
  @Inject(PrismaService) private readonly prisma: PrismaService,
  @Inject(WhatsappNormalizerService) private readonly normalizer: WhatsappNormalizerService,
  @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway
) {
  this.appSecret = config.get<string>("META_WHATSAPP_APP_SECRET") ?? "";
}
```

- [ ] **Step 3: Replace message.upsert with message.create + emit**

In the `persistMessage` private method, replace the entire `try/catch` block that does `message.upsert`:

```typescript
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
      this.realtime.emit("conversation.created", {
        conversationId: conversation.id,
        patientPhone: maskPhone(normalized.fromNumber),
        accountPhoneNumberId: metadata.phone_number_id,
        startedAt: conversation.startedAt.toISOString()
      });
    }

    try {
      const msg = await this.prisma.message.create({
        data: {
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

      this.realtime.emit("message.created", {
        messageId: msg.id,
        conversationId: conversation.id,
        fromNumber: maskPhone(normalized.fromNumber),
        messageType: normalized.type,
        sentAt: normalized.sentAt.toISOString()
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
      this.logger.error(
        `Failed to persist message ${normalized.metaMessageId}`,
        (error as Error).stack
      );
      throw error;
    }
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: no errors.

---

## Task 7: Update whatsapp-webhook.spec.ts

**Files:**
- Modify: `apps/api/src/whatsapp/whatsapp-webhook.spec.ts`

The mock needs `message.create` instead of `message.upsert`, and a mock for `RealtimeGateway`.

- [ ] **Step 1: Add RealtimeGateway mock import and mock object**

After the existing imports in `whatsapp-webhook.spec.ts`, add:

```typescript
import { RealtimeGateway } from "../realtime/realtime.gateway";
```

After the `configServiceMock` block, add:

```typescript
const realtimeMock = {
  emit: vi.fn(),
  handleConnection: vi.fn(),
  handleDisconnect: vi.fn()
};
```

- [ ] **Step 2: Replace message.upsert with message.create in prismaMock**

In `prismaMock.message`, replace the `upsert` function with `create`:

```typescript
    message: {
      create: vi.fn(
        ({
          data
        }: {
          data: { metaMessageId: string; conversationId: string };
        }) => {
          const existing = messageStore.get(data.metaMessageId);
          if (existing) {
            const err = Object.assign(
              new Error("Unique constraint failed on the fields: (`metaMessageId`)"),
              { code: "P2002", clientVersion: "6.0.0", meta: { target: ["metaMessageId"] } }
            );
            Object.setPrototypeOf(err, (await import("@prisma/client")).Prisma.PrismaClientKnownRequestError.prototype);
            return Promise.reject(err);
          }
          const msg = {
            id: `msg-${data.metaMessageId}`,
            metaMessageId: data.metaMessageId,
            conversationId: data.conversationId
          };
          messageStore.set(data.metaMessageId, msg);
          return Promise.resolve(msg);
        }
      )
    },
```

Wait — dynamically importing Prisma inside a `vi.fn` is messy. Use a simpler approach that doesn't rely on the Prisma prototype:

```typescript
    message: {
      create: vi.fn(
        ({
          data
        }: {
          data: { metaMessageId: string; conversationId: string };
        }) => {
          const existing = messageStore.get(data.metaMessageId);
          if (existing) {
            // Simulate Prisma P2002 unique constraint violation
            const err = new Error("Unique constraint failed");
            (err as unknown as { code: string }).code = "P2002";
            (err as unknown as { clientVersion: string }).clientVersion = "6.0.0";
            (err as unknown as { meta: object }).meta = { target: ["metaMessageId"] };
            Object.setPrototypeOf(
              err,
              Object.create(Error.prototype, {
                name: { value: "PrismaClientKnownRequestError" }
              })
            );
            return Promise.reject(err);
          }
          const msg = {
            id: `msg-${data.metaMessageId}`,
            metaMessageId: data.metaMessageId,
            conversationId: data.conversationId
          };
          messageStore.set(data.metaMessageId, msg);
          return Promise.resolve(msg);
        }
      )
    },
```

Hmm, this prototype trick won't work for `instanceof Prisma.PrismaClientKnownRequestError` checks. Let me use a cleaner approach: import Prisma at test module level.

Replace the `message` section of `prismaMock` with this approach using a simple flag instead of prototype checking:

Actually, the cleanest fix is to change `WhatsappWebhookService` to check `error.code === "P2002"` AND `"code" in error` rather than `instanceof Prisma.PrismaClientKnownRequestError`. This makes it easier to mock.

In `whatsapp-webhook.service.ts`, replace the catch condition:

```typescript
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        this.logger.warn(`Duplicate message ignored: ${normalized.metaMessageId}`);
        return;
      }
      // ... throw
    }
```

This removes the `instanceof Prisma.PrismaClientKnownRequestError` requirement, making the mock simpler.

With this change in the service, the mock can just throw any error with `code: "P2002"`:

```typescript
    message: {
      create: vi.fn(
        ({
          data
        }: {
          data: { metaMessageId: string; conversationId: string };
        }) => {
          const existing = messageStore.get(data.metaMessageId);
          if (existing) {
            return Promise.reject(
              Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
            );
          }
          const msg = {
            id: `msg-${data.metaMessageId}`,
            metaMessageId: data.metaMessageId,
            conversationId: data.conversationId
          };
          messageStore.set(data.metaMessageId, msg);
          return Promise.resolve(msg);
        }
      )
    },
```

- [ ] **Step 3: Add RealtimeGateway override to test module**

In `beforeAll`, add `.overrideProvider(RealtimeGateway).useValue(realtimeMock)` after the `ConfigService` override:

```typescript
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ConfigService)
      .useValue(configServiceMock)
      .overrideProvider(RealtimeGateway)
      .useValue(realtimeMock)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
```

- [ ] **Step 4: Update persistence test to verify realtime emit**

In the test `"POST /whatsapp/webhook — valid text message persists patient, conversation, message"`, add assertion after existing assertions:

```typescript
    expect(realtimeMock.emit).toHaveBeenCalledWith(
      "message.created",
      expect.objectContaining({
        conversationId: expect.any(String),
        fromNumber: expect.stringMatching(/\*{4}/),
        messageType: "TEXT"
      })
    );
```

- [ ] **Step 5: Also update the test for duplicate to verify no emit**

In the test `"POST /whatsapp/webhook — duplicate message returns 200 without creating duplicate"`, add:

```typescript
    // realtimeMock.emit should NOT have been called for the duplicate
    expect(realtimeMock.emit).not.toHaveBeenCalled();
```

Note: `vi.clearAllMocks()` is NOT called before this test (it runs after the persistence test which already cleared mocks). Make sure `vi.clearAllMocks()` IS called at the start of the duplicate test:

Add `vi.clearAllMocks();` as the first line of the duplicate test.

- [ ] **Step 6: Run tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: 15/15 tests pass (or more if new tests added). Fix any failures before continuing.

---

## Task 8: RealtimeGateway unit tests

**Files:**
- Create: `apps/api/src/realtime/realtime.gateway.spec.ts`

- [ ] **Step 1: Create test file**

Create `apps/api/src/realtime/realtime.gateway.spec.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { RealtimeGateway, maskPhone } from "./realtime.gateway";

describe("maskPhone", () => {
  it("masks middle digits of a valid E.164 number", () => {
    expect(maskPhone("+5511999990001")).toBe("+55119****0001");
  });

  it("returns *** for strings shorter than 8 characters", () => {
    expect(maskPhone("+55119")).toBe("***");
  });

  it("preserves first 5 and last 4 characters", () => {
    const result = maskPhone("+12345678901234");
    expect(result.startsWith("+1234")).toBe(true);
    expect(result.endsWith("1234")).toBe(true);
    expect(result).toContain("****");
  });
});

describe("RealtimeGateway.emit", () => {
  it("calls server.emit with correct envelope structure", () => {
    const gateway = new RealtimeGateway();
    const mockServer = { emit: vi.fn(), sockets: { size: 0 } };
    // @ts-expect-error — accessing private decorated field for unit testing
    gateway.server = mockServer;

    gateway.emit("message.created", {
      messageId: "msg-1",
      conversationId: "conv-1",
      fromNumber: "+55119****0001",
      messageType: "TEXT",
      sentAt: "2026-05-17T00:00:00.000Z"
    });

    expect(mockServer.emit).toHaveBeenCalledOnce();
    expect(mockServer.emit).toHaveBeenCalledWith(
      "message.created",
      expect.objectContaining({
        event: "message.created",
        version: 1,
        data: expect.objectContaining({
          messageId: "msg-1",
          conversationId: "conv-1"
        })
      })
    );
  });

  it("includes a valid ISO8601 timestamp in the envelope", () => {
    const gateway = new RealtimeGateway();
    const mockServer = { emit: vi.fn(), sockets: { size: 0 } };
    // @ts-expect-error
    gateway.server = mockServer;

    gateway.emit("conversation.created", {
      conversationId: "conv-2",
      patientPhone: "+55119****0001",
      accountPhoneNumberId: "PHONE_ID",
      startedAt: "2026-05-17T00:00:00.000Z"
    });

    const [[, envelope]] = (mockServer.emit as ReturnType<typeof vi.fn>).mock.calls as [[string, { timestamp: string }]];
    expect(() => new Date(envelope.timestamp)).not.toThrow();
    expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: new tests in `realtime.gateway.spec.ts` pass alongside all existing tests.

---

## Task 9: Frontend dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install frontend deps**

```bash
cd C:\Users\Cliente\OneDrive\Área de Trabalho\projetos\codex\espiao
npm install socket.io-client sonner -w apps/web
```

Expected: both packages installed, `apps/web/package.json` updated.

- [ ] **Step 2: Verify**

```bash
node -e "require('socket.io-client'); console.log('OK')"
```

Expected: `OK`

---

## Task 10: Frontend event types

**Files:**
- Create: `apps/web/src/lib/realtime-events.types.ts`

These mirror the backend types exactly. Kept in sync manually (no code generation yet).

- [ ] **Step 1: Create file**

Create `apps/web/src/lib/realtime-events.types.ts`:

```typescript
export type RealtimeEnvelope<T> = {
  event: string;
  version: 1;
  timestamp: string;
  data: T;
};

export type MessageCreatedPayload = {
  messageId: string;
  conversationId: string;
  fromNumber: string;
  messageType: string;
  sentAt: string;
};

export type ConversationCreatedPayload = {
  conversationId: string;
  patientPhone: string;
  accountPhoneNumberId: string;
  startedAt: string;
};
```

---

## Task 11: useSocket hook (SSR-safe singleton)

**Files:**
- Create: `apps/web/src/hooks/use-socket.ts`

The singleton lives OUTSIDE the hook function so it persists across re-renders. The socket is created inside `useEffect` so it never runs during SSR (`renderToString`), keeping `page.test.tsx` passing.

- [ ] **Step 1: Create hook**

Create `apps/web/src/hooks/use-socket.ts`:

```typescript
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

// Module-level singleton: one connection per browser session, survives re-renders.
// Null until first useEffect fires (SSR-safe — useEffect never runs server-side).
let socketInstance: Socket | null = null;

export function useSocket(url: string): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!socketInstance) {
      socketInstance = io(url, {
        transports: ["websocket"],
        reconnectionDelayMax: 10_000,
        autoConnect: true
      });
    }
    setSocket(socketInstance);

    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
      setSocket(null);
    };
  }, [url]);

  return socket;
}
```

---

## Task 12: RealtimeDashboard component

**Files:**
- Create: `apps/web/src/components/RealtimeDashboard.tsx`

- [ ] **Step 1: Create component**

Create `apps/web/src/components/RealtimeDashboard.tsx`:

```typescript
"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSocket } from "../hooks/use-socket";
import type {
  ConversationCreatedPayload,
  MessageCreatedPayload,
  RealtimeEnvelope
} from "../lib/realtime-events.types";

export type ConversationRow = {
  id: string;
  patient: string;
  agent: string;
  channel: string;
  status: string;
  score: number;
  lastMessage: string;
};

type Props = {
  initialConversations: ConversationRow[];
  initialActiveCount: number;
};

export function RealtimeDashboard({ initialConversations, initialActiveCount }: Props) {
  const [conversations, setConversations] = useState<ConversationRow[]>(initialConversations);
  const [activeCount, setActiveCount] = useState(initialActiveCount);
  const [online, setOnline] = useState(false);
  const lastMessageToastRef = useRef<number>(0);
  const lastReconnectToastRef = useRef<number>(0);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const socket = useSocket(apiUrl);

  useEffect(() => {
    if (!socket) return;

    function onConnect() {
      setOnline(true);
    }

    function onDisconnect() {
      setOnline(false);
      toast.warning("Conexão perdida. Reconectando...", {
        id: "socket-disconnect",
        duration: Infinity
      });
    }

    function onMessageCreated(envelope: RealtimeEnvelope<MessageCreatedPayload>) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === envelope.data.conversationId
            ? {
                ...c,
                lastMessage: new Date(envelope.data.sentAt).toLocaleTimeString("pt-BR")
              }
            : c
        )
      );
      const now = Date.now();
      if (now - lastMessageToastRef.current > 1000) {
        toast.info("Nova mensagem recebida", { duration: 3000 });
        lastMessageToastRef.current = now;
      }
    }

    function onConversationCreated(
      envelope: RealtimeEnvelope<ConversationCreatedPayload>
    ) {
      setActiveCount((prev) => prev + 1);
      toast.success(
        `Nova conversa iniciada — ${envelope.data.patientPhone}`,
        { duration: 4000 }
      );
    }

    function onReconnect() {
      setOnline(true);
      toast.dismiss("socket-disconnect");
      const now = Date.now();
      if (now - lastReconnectToastRef.current > 5_000) {
        toast.success("Conexão restabelecida", { duration: 3000 });
        lastReconnectToastRef.current = now;
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message.created", onMessageCreated);
    socket.on("conversation.created", onConversationCreated);
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message.created", onMessageCreated);
      socket.off("conversation.created", onConversationCreated);
      socket.io.off("reconnect", onReconnect);
    };
  }, [socket]);

  return (
    <>
      <div className="realtimeStatus">
        <span className={`onlineDot ${online ? "online" : "offline"}`} />
        <span className="realtimeLabel">
          {online ? "Realtime ativo" : "Reconectando..."}
        </span>
        <span className="activeCount">{activeCount} ativas</span>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Atendente</th>
              <th>Status</th>
              <th>Score</th>
              <th>Ultima mensagem</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conversation) => (
              <tr key={conversation.id}>
                <td>
                  <strong>{conversation.patient}</strong>
                  <span>{conversation.channel}</span>
                </td>
                <td>{conversation.agent}</td>
                <td>
                  <span
                    className={`statusPill ${conversation.status
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {conversation.status}
                  </span>
                </td>
                <td>{conversation.score}%</td>
                <td>{conversation.lastMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

---

## Task 13: Update layout.tsx with Toaster

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add Toaster**

Replace the full content of `apps/web/src/app/layout.tsx`:

```typescript
import React from "react";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp Audit",
  description: "Auditoria de atendimentos WhatsApp com Meta Cloud API oficial."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
```

---

## Task 14: Update page.tsx

**Files:**
- Modify: `apps/web/src/app/page.tsx`

`page.tsx` remains a Server Component. The `recentConversations` array now has `id` fields and is passed as props to `RealtimeDashboard`.

- [ ] **Step 1: Replace page.tsx content**

Replace the full content of `apps/web/src/app/page.tsx`:

```typescript
import React from "react";
import { RealtimeDashboard, type ConversationRow } from "../components/RealtimeDashboard";

const navItems = [
  "Dashboard",
  "Conversas",
  "Pacientes",
  "Colaboradores",
  "Analise IA",
  "Relatorios",
  "Auditoria"
];

const metrics = [
  { label: "Conversas auditadas", value: "1.284", delta: "+12% vs. semana" },
  { label: "Tempo medio resposta", value: "3m 42s", delta: "-18% vs. meta" },
  { label: "Conformidade", value: "91%", delta: "+4 pts" },
  { label: "Alertas IA abertos", value: "17", delta: "5 criticos" }
];

const initialConversations: ConversationRow[] = [
  {
    id: "conv-mock-1",
    patient: "Marina Costa",
    agent: "Ana Paula",
    channel: "Cloud API",
    status: "Em auditoria",
    score: 94,
    lastMessage: "Hoje, 10:42"
  },
  {
    id: "conv-mock-2",
    patient: "Roberto Lima",
    agent: "Diego Ramos",
    channel: "Cloud API",
    status: "Alerta",
    score: 61,
    lastMessage: "Hoje, 09:18"
  },
  {
    id: "conv-mock-3",
    patient: "Camila Rocha",
    agent: "Fernanda Alves",
    channel: "Cloud API",
    status: "Concluida",
    score: 88,
    lastMessage: "Ontem, 17:05"
  },
  {
    id: "conv-mock-4",
    patient: "Paulo Nunes",
    agent: "Lucas Vieira",
    channel: "Cloud API",
    status: "Pendente",
    score: 72,
    lastMessage: "Ontem, 15:31"
  }
];

const aiAlerts = [
  {
    title: "Possivel quebra de protocolo",
    detail: "Atendimento sem confirmacao final de consentimento.",
    level: "Critico"
  },
  {
    title: "Resposta com atraso",
    detail: "Tempo entre mensagens acima da meta configurada.",
    level: "Medio"
  },
  {
    title: "Sentimento negativo",
    detail: "Paciente demonstrou frustracao no fechamento.",
    level: "Medio"
  }
];

export default function HomePage() {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <span className="brandMark">WA</span>
          <span>Audit SaaS</span>
        </div>
        <nav className="sidebarNav">
          {navItems.map((item) => (
            <a className={item === "Dashboard" ? "active" : ""} href="#" key={item}>
              {item}
            </a>
          ))}
        </nav>
        <div className="sidebarFooter">
          <span>Ambiente</span>
          <strong>Realtime ativo</strong>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operacao de qualidade</p>
            <h1>Dashboard de auditoria WhatsApp</h1>
            <p>Conexao em tempo real via Meta Cloud API oficial.</p>
          </div>
          <div className="topbarActions">
            <span className="status">Cloud API oficial</span>
            <button type="button">Exportar relatorio</button>
          </div>
        </header>

        <section className="metrics" aria-label="Resumo operacional">
          {metrics.map((metric) => (
            <article className="metricCard" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.delta}</small>
            </article>
          ))}
        </section>

        <section className="dashboardGrid">
          <section className="panel conversationsPanel">
            <div className="panelHeader">
              <div>
                <h2>Conversas recentes</h2>
                <p>Atualiza em tempo real quando novas mensagens chegam.</p>
              </div>
              <button type="button" className="ghostButton">
                Ver todas
              </button>
            </div>

            <RealtimeDashboard
              initialConversations={initialConversations}
              initialActiveCount={initialConversations.length}
            />
          </section>

          <aside className="panel alertsPanel" aria-label="Alertas IA">
            <div className="panelHeader">
              <div>
                <h2>Alertas IA</h2>
                <p>Prioridades simuladas para triagem.</p>
              </div>
            </div>
            <div className="alertsList">
              {aiAlerts.map((alert) => (
                <article className="alertItem" key={alert.title}>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                  </div>
                  <span>{alert.level}</span>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
```

---

## Task 15: CSS for realtime badge

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Append CSS at the end of globals.css**

Add at the end of `apps/web/src/app/globals.css`:

```css
/* ── Realtime status ── */

.realtimeStatus {
  align-items: center;
  display: flex;
  font-size: 13px;
  gap: 8px;
  margin-bottom: 14px;
}

.onlineDot {
  border-radius: 50%;
  display: inline-block;
  flex: 0 0 auto;
  height: 8px;
  width: 8px;
}

.onlineDot.online {
  animation: realtimePulse 2s ease-in-out infinite;
  background: #22c55e;
}

.onlineDot.offline {
  animation: realtimeBlink 1s ease-in-out infinite;
  background: var(--danger);
}

@keyframes realtimePulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@keyframes realtimeBlink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.15;
  }
}

.realtimeLabel {
  color: var(--muted);
}

.activeCount {
  background: var(--surface-soft);
  border: 1px solid #cce8d6;
  border-radius: 999px;
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 800;
  padding: 2px 8px;
}
```

---

## Task 16: Final verification

- [ ] **Step 1: Typecheck API**

```bash
cd apps/api && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Typecheck web**

```bash
cd apps/web && npm run typecheck
```

Expected: exit 0. If errors about `socket.io-client` types: run `npm install -w apps/web` first.

- [ ] **Step 3: Run all API tests**

```bash
cd apps/api && npm test 2>&1
```

Expected: all tests pass (15+ tests across 3+ test files).

- [ ] **Step 4: Build API**

```bash
cd apps/api && npm run build
```

Expected: exit 0.

- [ ] **Step 5: Build web**

```bash
cd apps/web && npm run build
```

Expected: exit 0.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(realtime): WebSocket gateway + live dashboard — message.created, conversation.created events via socket.io"
```

---

## Manual test procedure

After both servers are running (`npm run dev:api` + `npm run dev:web`):

```
1. Open http://localhost:3000 in 2 browser tabs
2. Verify green dot "Realtime ativo" appears in both tabs
3. Disconnect API server — both tabs show red dot "Reconectando..."
4. Restart API — both tabs show green dot + "Conexão restabelecida" toast
5. Send a test webhook:

   BODY='{"object":"whatsapp_business_account","entry":[{"id":"WABA","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15550001234","phone_number_id":"PHONE_ID"},"contacts":[{"profile":{"name":"Test"},"wa_id":"5511999990001"}],"messages":[{"from":"5511999990001","id":"wamid.test-live-01","timestamp":"1735689600","type":"text","text":{"body":"Hello realtime"}}]},"field":"messages"}]}]}'
   SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac 'change-me-in-development' | awk '{print $2}')"
   curl -X POST http://localhost:3001/whatsapp/webhook \
     -H "Content-Type: application/json" \
     -H "x-hub-signature-256: $SIG" \
     -d "$BODY"

6. Both tabs show "Nova mensagem recebida" toast
7. Table row for "conv-mock-1" (if conversationId matches) updates lastMessage
   OR a new conversation row appears (activeCount increments)
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| WebSocket Gateway NestJS | Task 3-4 |
| message.created event | Task 6, 8 |
| conversation.created event | Task 6 |
| patient.created event | Types defined (Task 2, 10); emit TODO — requires detecting upsert=create |
| alert.created event | Types defined; emit requires AI system (future) |
| socket.io-client frontend | Task 9, 11 |
| Dashboard atualiza sem refresh | Task 12 |
| Online/offline indicator | Task 12, 15 |
| Toast nova mensagem | Task 12, 13 |
| Contador realtime conversas ativas | Task 12 |
| Singleton socket (no leaks) | Task 11 (module-level var) |
| Cleanup no unmount | Task 11 (useEffect return) |
| Deduplicação listeners | Task 12 (off before re-add) |
| Debounce toasts | Task 12 (useRef timestamps) |
| Dados sensíveis sanitizados | Task 6 (maskPhone) |
| TypeScript estrito, sem any | All tasks |
| Logs estruturados | Task 3 (Logger) |
| TODO Redis adapter | Task 3 (comments) |
| TODO JWT auth socket | Task 3 (comments) |
| TODO rooms tenant/supervisor | Task 3 (comments) |
| Testes gateway | Task 8 |
| Testes webhook atualizado | Task 7 |
| Build passando | Task 16 |
| Manual test document | Task 16 |

### Type consistency

- `ConversationRow` defined in `RealtimeDashboard.tsx:L13`, exported, imported in `page.tsx` ✅
- `RealtimeEnvelope<T>` defined in both `realtime-events.types.ts` files, identical structure ✅
- `maskPhone` exported from `realtime.gateway.ts`, imported in `whatsapp-webhook.service.ts` ✅
- `RealtimeGateway.emit<K>` uses `RealtimeEventMap[K]["data"]` — type-safe call sites ✅
- `useSocket` returns `Socket | null`, all uses in `RealtimeDashboard` guarded by `if (!socket) return` ✅
