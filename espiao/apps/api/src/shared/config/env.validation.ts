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
  META_WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  META_WHATSAPP_APP_SECRET: z.string().optional(),
  ENABLE_WEBHOOK_RAW_LOG: z.enum(["true", "false"]).default("false"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini")
});

export function validateEnv(config: Record<string, unknown>) {
  return envSchema.parse(config);
}
