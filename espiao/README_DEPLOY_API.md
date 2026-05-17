# Deploy API — Railway

Guia de deploy da API NestJS no Railway.

---

## Pre-requisitos

- Conta Railway em https://railway.app
- Supabase Postgres configurado (ver README_SUPABASE_SETUP.md)
- Redis configurado (ver README_REDIS_SETUP.md)
- Repositório no GitHub

---

## Passo 1 — Criar projeto no Railway

1. Acesse https://railway.app/dashboard
2. Clique em **New Project**
3. Selecione **Deploy from GitHub repo**
4. Conecte sua conta GitHub e selecione o repositório `codex`
5. Railway detecta o `railway.json` automaticamente

---

## Passo 2 — Configurar Root Directory

Na tela de configuração do serviço:

| Campo | Valor |
|-------|-------|
| Root Directory | `espiao` |
| Build Command | *(detectado do railway.json)* |
| Start Command | *(detectado do railway.json)* |

> O `railway.json` na raiz de `espiao/` configura tudo automaticamente.

---

## Passo 3 — Configurar Variáveis de Ambiente

Em **Settings → Variables**, adicione:

### Obrigatórias

```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
REDIS_URL=redis://default:token@hostname:6379
JWT_SECRET=<string aleatória >64 chars>
JWT_REFRESH_SECRET=<string aleatória >64 chars diferente>
WEB_APP_URL=https://web-beryl-six-83.vercel.app
```

### WhatsApp Meta Cloud API

```
META_WHATSAPP_ACCESS_TOKEN=EAAxxxxx
META_WHATSAPP_PHONE_NUMBER_ID=123456789012345
META_WHATSAPP_BUSINESS_ACCOUNT_ID=987654321098765
META_WHATSAPP_APP_SECRET=abc123...
META_WHATSAPP_VERIFY_TOKEN=<seu-verify-token-aleatorio>
META_WHATSAPP_API_VERSION=v21.0
```

### OpenAI

```
OPENAI_API_KEY=sk-proj-xxxxx
OPENAI_MODEL=gpt-4.1-mini
AI_ANALYSIS_RISK_THRESHOLD=70
```

### Opcionais

```
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
API_PORT=3001
ENABLE_WEBHOOK_RAW_LOG=false
```

> **Gerar JWT_SECRET seguro:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## Passo 4 — Executar Migrations

Após o deploy inicial estar de pé (health check verde):

No Railway, abra o terminal do serviço (**Settings → Terminal**) e execute:

```bash
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

---

## Passo 5 — Executar Seed (admin inicial)

```bash
npm run prisma:seed
```

Cria o usuário admin:
- Email: `admin@espiao.local`
- Senha: `Admin@123456`
- Role: `ADMIN`

---

## Passo 6 — Verificar deploy

```bash
# Health check (deve retornar { "status": "ok" })
curl https://SUA-API.railway.app/health

# System status (mostra database, redis, openai)
curl https://SUA-API.railway.app/system/status

# WhatsApp provider status
curl https://SUA-API.railway.app/whatsapp/provider
```

---

## Scripts disponíveis (da raiz do monorepo)

```bash
# Build da API
npm run build:api

# Iniciar em produção (após build)
npm run start:prod:api

# Desenvolvimento
npm run dev:api
```

---

## Variáveis Railway não configuradas no projeto

Railway injeta automaticamente:
- `PORT` — a API já usa `process.env.PORT` automaticamente
- `RAILWAY_ENVIRONMENT` — não precisa configurar

---

## Checklist Railway

- [ ] Projeto criado e repositório conectado
- [ ] Root Directory configurado para `espiao/`
- [ ] Todas as variáveis de ambiente configuradas
- [ ] Build bem-sucedido (verde no dashboard)
- [ ] `/health` retorna `{ "status": "ok" }`
- [ ] `/system/status` retorna database healthy
- [ ] Migrations executadas
- [ ] Seed executado
- [ ] Webhook Meta configurado apontando para a URL do Railway
