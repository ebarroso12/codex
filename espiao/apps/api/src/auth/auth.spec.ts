import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

type TestUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  refreshTokenHash: string | null;
  role: "ADMIN" | "SUPERVISOR" | "AGENT" | "AUDITOR";
  isActive: boolean;
};

const users = new Map<string, TestUser>();

async function requestJson<TBody extends object>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: TBody;
    token?: string;
  } = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;

  return { response, body };
}

describe("Auth HTTP", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "test-access-secret";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

    const adminPasswordHash = await bcrypt.hash("Admin@123456", 10);
    const auditorPasswordHash = await bcrypt.hash("Auditor@123456", 10);

    users.set("admin@espiao.local", {
      id: "admin-id",
      email: "admin@espiao.local",
      name: "Admin Espiao",
      passwordHash: adminPasswordHash,
      refreshTokenHash: null,
      role: "ADMIN",
      isActive: true
    });
    users.set("auditor@espiao.local", {
      id: "auditor-id",
      email: "auditor@espiao.local",
      name: "Auditor Espiao",
      passwordHash: auditorPasswordHash,
      refreshTokenHash: null,
      role: "AUDITOR",
      isActive: true
    });

    const prismaMock = {
      user: {
        findUnique: ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) {
            return Promise.resolve(users.get(where.email) ?? null);
          }

          return Promise.resolve([...users.values()].find((user) => user.id === where.id) ?? null);
        },
        update: ({
          where,
          data
        }: {
          where: { id: string };
          data: { refreshTokenHash?: string | null };
        }) => {
          const user = [...users.values()].find((item) => item.id === where.id);

          if (!user) {
            throw new Error("User not found");
          }

          user.refreshTokenHash = data.refreshTokenHash ?? null;
          return Promise.resolve(user);
        }
      },
      $disconnect: () => Promise.resolve()
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
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

  it("returns access and refresh tokens for valid login", async () => {
    const { response, body } = await requestJson(baseUrl, "/auth/login", {
      method: "POST",
      body: {
        email: "admin@espiao.local",
        password: "Admin@123456"
      }
    });

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      tokenType: "Bearer",
      user: {
        email: "admin@espiao.local",
        role: "ADMIN"
      }
    });
    expect((body as { accessToken?: string }).accessToken).toEqual(expect.any(String));
    expect((body as { refreshToken?: string }).refreshToken).toEqual(expect.any(String));
  });

  it("rejects invalid login credentials", async () => {
    const { response } = await requestJson(baseUrl, "/auth/login", {
      method: "POST",
      body: {
        email: "admin@espiao.local",
        password: "wrong-password"
      }
    });

    expect(response.status).toBe(401);
  });

  it("rejects protected routes without a token", async () => {
    const { response } = await requestJson(baseUrl, "/conversations");

    expect(response.status).toBe(401);
  });

  it("allows protected routes with a valid token", async () => {
    const login = await requestJson(baseUrl, "/auth/login", {
      method: "POST",
      body: {
        email: "admin@espiao.local",
        password: "Admin@123456"
      }
    });

    const { response } = await requestJson(baseUrl, "/conversations", {
      token: (login.body as { accessToken: string }).accessToken
    });

    expect(response.status).toBe(200);
  });

  it("denies access when user role is not allowed", async () => {
    const login = await requestJson(baseUrl, "/auth/login", {
      method: "POST",
      body: {
        email: "auditor@espiao.local",
        password: "Auditor@123456"
      }
    });

    const { response } = await requestJson(baseUrl, "/users", {
      token: (login.body as { accessToken: string }).accessToken
    });

    expect(response.status).toBe(403);
  });
});
