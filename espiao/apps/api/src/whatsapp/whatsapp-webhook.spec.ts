import * as crypto from "node:crypto";
import {
  INestApplication,
  InternalServerErrorException,
  ValidationPipe
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { AiAnalysisService } from "../ai-analysis/ai-analysis.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WhatsappNormalizerService } from "./whatsapp-normalizer.service";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

// ConfigService mock: ConfigModule optional fields return undefined in some vitest
// isolation contexts. Providing explicit values is more reliable than env vars.
const configValues: Record<string, string | number> = {
  META_WHATSAPP_APP_SECRET: "test-app-secret",
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-verify-token",
  ENABLE_WEBHOOK_RAW_LOG: "false",
  JWT_SECRET: "test-jwt-secret",
  JWT_EXPIRES_IN: "1h",
  JWT_REFRESH_SECRET: "test-refresh-secret",
  JWT_REFRESH_EXPIRES_IN: "7d",
  WEB_APP_URL: "http://localhost:3000",
  NODE_ENV: "test",
  API_PORT: 3001,
  META_WHATSAPP_API_VERSION: "v21.0"
};
const configServiceMock = {
  get: <T>(key: string, defaultVal?: T): T | undefined =>
    (configValues[key] ?? defaultVal) as T | undefined
};

const realtimeMock = {
  emit: vi.fn(),
  handleConnection: vi.fn(),
  handleDisconnect: vi.fn()
};

// Required for AppModule to skip BullMQ (reads process.env directly, not ConfigService).
process.env.NODE_ENV = "test";

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

  const patientStore = new Map<
    string,
    { id: string; phoneE164: string; name: string | null }
  >();
  const conversationStore = new Map<
    string,
    {
      id: string;
      patientId: string;
      status: string;
      accountPhoneNumberId: string;
      startedAt: Date;
    }
  >();
  const messageStore = new Map<
    string,
    { id: string; metaMessageId: string; conversationId: string }
  >();

  const prismaMock = {
    patient: {
      upsert: vi.fn(
        ({
          where,
          create
        }: {
          where: { phoneE164: string };
          create: { phoneE164: string; name: string | null };
        }) => {
          const existing = patientStore.get(where.phoneE164);
          if (existing) return Promise.resolve(existing);
          const patient = {
            id: `patient-${where.phoneE164}`,
            phoneE164: where.phoneE164,
            name: create.name
          };
          patientStore.set(where.phoneE164, patient);
          return Promise.resolve(patient);
        }
      )
    },
    conversation: {
      findFirst: vi.fn(
        ({
          where
        }: {
          where: {
            patientId: string;
            status: string;
            accountPhoneNumberId: string;
          };
        }) => {
          const found = [...conversationStore.values()].find(
            (c) =>
              c.patientId === where.patientId &&
              c.status === "OPEN" &&
              c.accountPhoneNumberId === where.accountPhoneNumberId
          );
          return Promise.resolve(found ?? null);
        }
      ),
      create: vi.fn(
        ({
          data
        }: {
          data: {
            patientId: string;
            accountPhoneNumberId: string;
            status: string;
          };
        }) => {
          const conv = {
            id: `conv-${data.patientId}`,
            patientId: data.patientId,
            status: data.status,
            accountPhoneNumberId: data.accountPhoneNumberId,
            startedAt: new Date()
          };
          conversationStore.set(conv.id, conv);
          return Promise.resolve(conv);
        }
      )
    },
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
    auditLog: {
      create: vi.fn(() => Promise.resolve({ id: "audit-id" }))
    },
    $disconnect: vi.fn(() => Promise.resolve())
  };

  beforeAll(async () => {
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

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true
      })
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── GET verify ───────────────────────────────────────────────────────────────

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
    const json = (await response.json()) as { verified: boolean };
    expect(response.status).toBe(200);
    expect(json.verified).toBe(false);
  });

  // ── POST signature validation ─────────────────────────────────────────────────

  it("POST /whatsapp/webhook — missing signature returns 403", async () => {
    const { response } = await sendWebhook(baseUrl, textMessagePayload, {
      skipSignature: true
    });
    expect(response.status).toBe(403);
  });

  it("POST /whatsapp/webhook — invalid signature returns 403", async () => {
    const { response } = await sendWebhook(baseUrl, textMessagePayload, {
      secret: "wrong-secret"
    });
    expect(response.status).toBe(403);
  });

  // ── POST message persistence ──────────────────────────────────────────────────

  it("POST /whatsapp/webhook — valid text message persists patient, conversation, message and emits events", async () => {
    patientStore.clear();
    conversationStore.clear();
    messageStore.clear();
    vi.clearAllMocks();

    const { response, body } = await sendWebhook(baseUrl, textMessagePayload);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(prismaMock.patient.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.conversation.create).toHaveBeenCalledOnce();
    expect(prismaMock.message.create).toHaveBeenCalledOnce();
    expect(messageStore.has("wamid.test123")).toBe(true);
    expect(realtimeMock.emit).toHaveBeenCalledWith(
      "message.created",
      expect.objectContaining({
        conversationId: expect.any(String),
        fromNumber: expect.stringContaining("****"),
        messageType: "TEXT"
      })
    );
  });

  it("POST /whatsapp/webhook — duplicate message returns 200 without creating duplicate or emitting", async () => {
    vi.clearAllMocks();
    // messageStore still has wamid.test123 — mock throws P2002

    const { response, body } = await sendWebhook(baseUrl, textMessagePayload);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(messageStore.size).toBe(1);
    expect(realtimeMock.emit).not.toHaveBeenCalledWith("message.created", expect.anything());
  });

  it("POST /whatsapp/webhook — status-only payload returns 200 without touching DB", async () => {
    vi.clearAllMocks();

    const { response, body } = await sendWebhook(baseUrl, statusOnlyPayload);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ received: true });
    expect(prismaMock.patient.upsert).not.toHaveBeenCalled();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
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
  });

  // ── Unit: missing APP_SECRET ──────────────────────────────────────────────────

  it("validateSignature throws InternalServerErrorException when APP_SECRET is not configured", () => {
    const service = new WhatsappWebhookService(
      { get: () => undefined } as unknown as ConfigService,
      {} as PrismaService,
      new WhatsappNormalizerService(),
      { emit: () => undefined } as unknown as RealtimeGateway,
      { enqueue: () => Promise.resolve() } as unknown as AiAnalysisService
    );

    expect(() =>
      service.validateSignature(Buffer.from("{}"), "sha256=abc")
    ).toThrow(InternalServerErrorException);
  });
});
