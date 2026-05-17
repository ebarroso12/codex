# Auth Enterprise-Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete enterprise-grade auth for espiao SaaS by adding the user registration endpoint and Prisma initial migration, since all other auth primitives are already implemented.

**Architecture:** NestJS + Passport + JWT (access/refresh) + bcryptjs + Prisma + PostgreSQL. Most of auth is already in place (login, guards, RBAC, seed, tests). Only missing pieces are: POST /auth/register, the Prisma migration SQL files, and a root package.json JSON syntax fix.

**Tech Stack:** NestJS 11, @nestjs/jwt, @nestjs/passport, passport-jwt, bcryptjs, class-validator, Prisma 6, Vitest

---

## What is already implemented (do NOT re-implement)

| Feature | File |
|---------|------|
| Login w/ email+password | `apps/api/src/auth/auth.service.ts:30` |
| bcrypt password check | `apps/api/src/auth/auth.service.ts:41` |
| JWT access token | `apps/api/src/auth/auth.module.ts`, `jwt.strategy.ts` |
| Refresh token | `apps/api/src/auth/auth.service.ts:50` |
| RBAC enum | `apps/api/src/auth/roles.enum.ts` |
| JwtAuthGuard | `apps/api/src/auth/jwt-auth.guard.ts` |
| RolesGuard | `apps/api/src/auth/roles.guard.ts` |
| Roles decorator | `apps/api/src/auth/roles.decorator.ts` |
| Protected routes | `conversations.controller.ts`, `users.controller.ts` |
| Seed admin | `packages/database/prisma/seed.ts` |
| Auth tests (5 cases) | `apps/api/src/auth/auth.spec.ts` |
| .env.example | `.env.example` |
| README auth section | `README.md` |

## File Map

| Status | Path | Responsibility |
|--------|------|---------------|
| Create | `apps/api/src/auth/dto/register.dto.ts` | RegisterDto with email/name/password validation |
| Modify | `apps/api/src/auth/auth.service.ts` | Add `register()` method |
| Modify | `apps/api/src/auth/auth.controller.ts` | Add `POST /auth/register` |
| Create | `packages/database/prisma/migrations/20260517000000_init/migration.sql` | Initial DB migration |
| Create | `packages/database/prisma/migrations/migration_lock.toml` | Prisma migration lock |
| Modify | `package.json` (root) | Fix double-comma JSON syntax error on line 13 |
| Modify | `README.md` | Add register endpoint section |

---

## Task 1: Fix root package.json syntax error

**Files:**
- Modify: `package.json` (root) line 13 — double comma `,,`

- [ ] **Step 1: Fix the syntax error**

In `package.json` line 13, change:
```json
"dev:api": "npm run start:dev -w apps/api",,
```
to:
```json
"dev:api": "npm run start:dev -w apps/api",
```

- [ ] **Step 2: Verify JSON parses correctly**

```bash
node -e "require('./package.json')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "fix: remove double comma in root package.json scripts"
```

---

## Task 2: Create RegisterDto

**Files:**
- Create: `apps/api/src/auth/dto/register.dto.ts`

- [ ] **Step 1: Write the DTO**

Create `apps/api/src/auth/dto/register.dto.ts`:

```typescript
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: "password must contain at least one uppercase letter, one lowercase letter, and one digit"
  })
  password!: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

---

## Task 3: Add register() to AuthService

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`

- [ ] **Step 1: Add ConflictException import and register method**

Add `ConflictException` to the import from `@nestjs/common` (line 1). Then add the `register()` method after the `login()` method:

```typescript
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
```

Add after `login()` (after line 48):

```typescript
  async register(input: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (existing) {
      throw new ConflictException("Email already registered.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        role: Role.AUDITOR
      }
    });

    return this.issueTokenPair(user);
  }
```

Also add `RegisterDto` to the imports at the top:

```typescript
import { RegisterDto } from "./dto/register.dto";
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

---

## Task 4: Add POST /auth/register to AuthController

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`

- [ ] **Step 1: Add register endpoint**

Replace the full file content:

```typescript
import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body);
  }

  @Post("dev-token")
  devToken() {
    return this.authService.issueDevelopmentToken();
  }
}
```

Note: `@Post("login")` now returns 200 (not 201). The test at `auth.spec.ts:136` expects `response.status` to be `201`. Check this: the original controller had no `@HttpCode` decorator, so NestJS defaults POST to 201. The test expects 201 — keep the original behavior. Remove `@HttpCode(HttpStatus.OK)` from login and refresh.

Corrected version:

```typescript
import { Body, Controller, Inject, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post("refresh")
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body);
  }

  @Post("dev-token")
  devToken() {
    return this.authService.issueDevelopmentToken();
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit auth register feature**

```bash
git add apps/api/src/auth/
git commit -m "feat(auth): add POST /auth/register endpoint with conflict guard"
```

---

## Task 5: Create Prisma initial migration

**Files:**
- Create: `packages/database/prisma/migrations/migration_lock.toml`
- Create: `packages/database/prisma/migrations/20260517000000_init/migration.sql`

- [ ] **Step 1: Create migration_lock.toml**

Create `packages/database/prisma/migrations/migration_lock.toml`:

```toml
# Please do not edit this file manually
# It should be added in your version-control system (i.e. Git)
provider = "postgresql"
```

- [ ] **Step 2: Create initial migration SQL**

Create `packages/database/prisma/migrations/20260517000000_init/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'AUDITOR', 'AGENT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'INTERACTIVE', 'TEMPLATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'AUDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalRef" TEXT,
    "roleTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phoneE164" TEXT NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "whatsappConversationId" TEXT,
    "patientId" TEXT NOT NULL,
    "employeeId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "metaMessageId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "summary" TEXT,
    "findings" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filters" JSONB,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_externalRef_key" ON "Employee"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_phoneE164_key" ON "Patient"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_externalRef_key" ON "Patient"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_whatsappConversationId_key" ON "Conversation"("whatsappConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_metaMessageId_key" ON "Message"("metaMessageId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Commit migration**

```bash
git add packages/database/prisma/migrations/
git commit -m "feat(db): add initial Prisma migration with full schema"
```

---

## Task 6: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add register endpoint to the Autenticacao section**

After the existing "Login" block and before "Refresh", insert:

```markdown
Registro:

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "Nome Completo",
  "password": "Senha@123"
}
```

Resposta (201):

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "name": "Nome Completo",
    "role": "AUDITOR"
  }
}
```
```

Also add `POST /auth/register` to the "Endpoints iniciais" list.

- [ ] **Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: add POST /auth/register to README"
```

---

## Task 7: Verification

- [ ] **Step 1: Typecheck**

```bash
cd apps/api && npm run typecheck
```

Expected: exit 0, no errors.

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npm test
```

Expected: 5 tests pass in `Auth HTTP` suite.

- [ ] **Step 3: Build**

```bash
cd apps/api && npm run build
```

Expected: exit 0, `dist/` populated.

---

## Self-Review Against Spec

| Spec requirement | Status | Task |
|------------------|--------|------|
| Login email+password | Already done | - |
| Registro de usuário | Missing → adds | Task 2-4 |
| bcrypt hash | Already done | - |
| JWT access token | Already done | - |
| Refresh token | Already done | - |
| RBAC ADMIN/SUPERVISOR/AGENT/AUDITOR | Already done | - |
| JwtAuthGuard | Already done | - |
| RolesGuard | Already done | - |
| Roles decorator | Already done | - |
| Protect API routes | Already done | - |
| Seed admin | Already done | - |
| Prisma migration | Missing | Task 5 |
| .env.example | Already done | - |
| Tests (5 cases) | Already done | - |
| README | Partial | Task 6 |
| JSON syntax bug | Bug | Task 1 |
