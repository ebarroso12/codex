# Vercel Web Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the Next.js frontend for Vercel deployment with no hardcoded URLs, separate NEXT_PUBLIC_SOCKET_URL env var, production-safe next.config.ts, and a complete deploy guide.

**Architecture:** Minimal changes — add `socketUrl` var to `RealtimeDashboard.tsx`, update `next.config.ts` to be production-safe (reactStrictMode only), add root scripts, update env example files, create `README_DEPLOY_WEB.md`. No backend changes. No secret exposure.

**Tech Stack:** Next.js 15, Vercel, npm workspaces

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/components/RealtimeDashboard.tsx` | Add `socketUrl` from `NEXT_PUBLIC_SOCKET_URL` |
| Modify | `apps/web/next.config.ts` | Production-safe config |
| Modify | `package.json` (root) | Add `build:web`, `start:web` scripts |
| Modify | `.env.example` | Add `NEXT_PUBLIC_SOCKET_URL` |
| Create | `apps/web/.env.local.example` | Local dev env template |
| Create | `README_DEPLOY_WEB.md` | Vercel step-by-step deploy guide |

---

## Task 1: Add NEXT_PUBLIC_SOCKET_URL to RealtimeDashboard

**Files:**
- Modify: `apps/web/src/components/RealtimeDashboard.tsx`

- [ ] **Step 1: Replace the apiUrl/socket lines**

In `apps/web/src/components/RealtimeDashboard.tsx`, find:

```typescript
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const socket = useSocket(apiUrl);
```

Replace with:

```typescript
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? apiUrl;
  const socket = useSocket(socketUrl);
```

`socketUrl` is declared exactly once. `apiUrl` remains for any future REST calls from the component.

- [ ] **Step 2: Verify build**

```bash
cd apps/web && npm run build
```

Expected: exit 0. If `NEXT_PUBLIC_SOCKET_URL` warning appears (e.g., "unrecognized env var"), it is expected and benign — Next.js only warns for vars used via `process.env` that don't appear in `next.config.ts`. No error.

---

## Task 2: Update next.config.ts

**Files:**
- Modify: `apps/web/next.config.ts`

Current content (all it does):
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = { reactStrictMode: true };
export default nextConfig;
```

- [ ] **Step 1: Replace with production-safe config**

Replace the full content of `apps/web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Expose NEXT_PUBLIC_* vars at build time — no server-only secrets here
  env: {
    // These are NEXT_PUBLIC_ vars so they are already exposed to the browser.
    // Listed here explicitly so tools like Vercel know they are expected.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    NEXT_PUBLIC_SOCKET_URL:
      process.env.NEXT_PUBLIC_SOCKET_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3001"
  }
};

export default nextConfig;
```

- [ ] **Step 2: Verify build**

```bash
cd apps/web && npm run build
```

Expected: exit 0.

---

## Task 3: Add build:web and start:web scripts to root package.json

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add scripts**

In the root `package.json` `"scripts"` section, add after `"dev:api"`:

```json
"build:web": "npm run build -w apps/web",
"start:web": "npm run start -w apps/web",
```

Full scripts block becomes:

```json
"scripts": {
  "dev": "npm run dev --workspace apps/web",
  "dev:web": "npm run dev --workspace apps/web",
  "dev:api": "npm run start:dev -w apps/api",
  "build:web": "npm run build -w apps/web",
  "start:web": "npm run start -w apps/web",
  "build": "npm run build --workspaces",
  "lint": "eslint apps packages --ext .ts,.tsx",
  "typecheck": "tsc -b",
  "test": "vitest run",
  "prisma:generate": "prisma generate --schema packages/database/prisma/schema.prisma",
  "prisma:migrate": "prisma migrate dev --schema packages/database/prisma/schema.prisma",
  "prisma:seed": "ts-node packages/database/prisma/seed.ts"
}
```

- [ ] **Step 2: Verify build:web from root**

```bash
npm run build:web 2>&1 | tail -15
```

Expected: `Route (app)` table showing `/` and `/_not-found`. Exit 0.

---

## Task 4: Update env files

**Files:**
- Modify: `.env.example`
- Create: `apps/web/.env.local.example`

- [ ] **Step 1: Add NEXT_PUBLIC_SOCKET_URL to .env.example**

In `.env.example`, find:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Replace with:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

- [ ] **Step 2: Create apps/web/.env.local.example**

Create `apps/web/.env.local.example`:

```
# Vercel frontend environment variables
# Copy this file to .env.local for local development

# REST API base URL — used for any direct fetch calls
NEXT_PUBLIC_API_URL=http://localhost:3001

# Socket.io server URL — if same as API, can be omitted (will fall back to API URL)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

---

## Task 5: Create README_DEPLOY_WEB.md

**Files:**
- Create: `README_DEPLOY_WEB.md`

- [ ] **Step 1: Create the deploy guide**

Create `README_DEPLOY_WEB.md` at the repository root:

```markdown
# Deploy Frontend — Vercel

Este guia cobre o deploy do webapp (`apps/web`) na Vercel.

## Pre-requisitos

- Conta Vercel em https://vercel.com
- API backend rodando em algum host (Railway, Render, Fly.io)
- URL da API backend disponível antes de configurar o Vercel

---

## Passo 1: Importar projeto

Acesse o link de import direto:
**https://vercel.com/new?teamSlug=edsonbarroso-7705s-projects**

Selecione o repositório `codex` (ou `espiao`).

---

## Passo 2: Configurar Build Settings

Na tela de configuração do projeto, preencha:

### Opção A — Root Directory: raiz do repo (recomendado para monorepo)

| Campo | Valor |
|-------|-------|
| Root Directory | *(deixar vazio — raiz do repositório)* |
| Framework Preset | Next.js |
| Build Command | `npm run build:web` |
| Output Directory | `apps/web/.next` |
| Install Command | `npm install` |

### Opção B — Root Directory: apps/web

| Campo | Valor |
|-------|-------|
| Root Directory | `apps/web` |
| Framework Preset | Next.js |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm install` |

> Prefira Opção A se a Opção B falhar com erros de workspace.

---

## Passo 3: Configurar Variáveis de Ambiente

No painel Vercel → seu projeto → **Settings → Environment Variables**.

Adicione as variáveis abaixo para os ambientes **Production**, **Preview** e **Development**:

| Nome | Valor (produção) | Obrigatório |
|------|-----------------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://sua-api.railway.app` | Sim |
| `NEXT_PUBLIC_SOCKET_URL` | `https://sua-api.railway.app` | Não (herda de API_URL) |

> **Nunca adicione** `OPENAI_API_KEY`, `JWT_SECRET`, `DATABASE_URL` ou qualquer secret do backend no projeto Vercel do frontend.
> Variáveis `NEXT_PUBLIC_*` são incorporadas no bundle JavaScript e ficam visíveis ao usuário final.

---

## Passo 4: Deploy

Clique em **Deploy**. O Vercel executa `npm run build:web` (ou `npm run build` no diretório `apps/web`).

Build bem-sucedido: o painel mostra ✅ e fornece a URL pública do frontend.

---

## Passo 5: Verificar

Após o deploy:

1. Acesse a URL fornecida pelo Vercel
2. O badge "Realtime ativo" deve aparecer verde quando a API estiver rodando
3. Se o badge ficar vermelho, verifique `NEXT_PUBLIC_SOCKET_URL` e se a API aceita CORS da URL da Vercel

---

## CORS no Backend

Quando o frontend estiver em `https://seu-app.vercel.app`, configure a variável `WEB_APP_URL` no backend:

```
WEB_APP_URL=https://seu-app.vercel.app
```

O NestJS já usa essa variável para configurar CORS em `main.ts`.

---

## Scripts disponíveis

```bash
# Build somente o frontend (a partir da raiz do monorepo)
npm run build:web

# Subir em produção local após build
npm run start:web

# Desenvolvimento local
npm run dev:web
```

---

## Checklist pré-deploy

- [ ] `npm run build:web` passa sem erros localmente
- [ ] `NEXT_PUBLIC_API_URL` configurado no Vercel
- [ ] API backend rodando e acessível publicamente
- [ ] CORS no backend configurado com a URL do Vercel (`WEB_APP_URL`)
- [ ] Nenhuma variável secreta configurada no projeto Vercel do frontend
```

---

## Task 6: Final verification

- [ ] **Step 1: Build from root**

```bash
npm run build:web 2>&1
```

Expected: exit 0. Route table showing `/` and `/_not-found`.

- [ ] **Step 2: Verify no hardcoded localhost in build output**

```bash
grep -r "localhost" apps/web/.next/static 2>&1 | grep -v ".next/static/chunks/main"
```

Expected: empty or only in source maps (not in the runtime bundle). If `localhost:3001` appears in a non-sourcemap chunk, trace back to a hardcoded URL.

Note: `next.config.ts` uses `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"` as the build-time default. In production (Vercel), `NEXT_PUBLIC_API_URL` IS set, so `localhost` never appears in the production bundle. The fallback is only for local dev.

- [ ] **Step 3: Commit**

```bash
git add apps/web/next.config.ts apps/web/src/components/RealtimeDashboard.tsx apps/web/.env.local.example package.json .env.example README_DEPLOY_WEB.md docs/
git commit -m "feat(deploy): prepare frontend for Vercel — NEXT_PUBLIC_SOCKET_URL, build:web scripts, deploy guide"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Preparar apps/web para Vercel | Task 2, 3, 5 |
| Configuração production do Next.js | Task 2 |
| Scripts build:web, start:web | Task 3 |
| NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL | Tasks 1, 4 |
| Sem URL hardcoded localhost no production | Task 2, 6 |
| Fallback seguro para dev local | Task 2 (env default) |
| README_DEPLOY_WEB.md | Task 5 |
| Link https://vercel.com/new?teamSlug=edsonbarroso-7705s-projects | Task 5 |
| Build production passando | Task 6 |
| Não mexer no backend | Não tocado ✅ |
| Não mexer no banco | Não tocado ✅ |
| Não mexer no WhatsApp | Não tocado ✅ |

### Placeholder scan

No TBDs or incomplete steps. ✅

### Type consistency

No new types introduced. `socketUrl` is `string` same type as `apiUrl`. ✅
