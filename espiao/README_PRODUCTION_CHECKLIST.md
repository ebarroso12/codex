# Checklist de Produção — Espiao WhatsApp Audit SaaS

Execute nesta ordem exata. Cada etapa depende da anterior.

---

## Etapa 1 — Criar Supabase Postgres

> Guia completo: README_SUPABASE_SETUP.md

- [ ] Criar projeto no Supabase (https://supabase.com)
- [ ] Copiar DATABASE_URL com connection pooling (porta 6543)
- [ ] Testar que a URL está no formato correto com `sslmode=require`

---

## Etapa 2 — Criar Redis

> Guia completo: README_REDIS_SETUP.md

- [ ] Criar banco Redis no Upstash (https://upstash.com) — recomendado
- [ ] Copiar `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- [ ] Alternativa: usar Redis Plugin do Railway (Etapa 3 primeiro)

---

## Etapa 3 — Deploy API no Railway

> Guia completo: README_DEPLOY_API.md

- [ ] Criar projeto no Railway (https://railway.app)
- [ ] Conectar repositório GitHub `codex`
- [ ] Configurar **Root Directory:** `espiao`
- [ ] Configurar todas as variáveis de ambiente (ver lista abaixo)
- [ ] Aguardar build bem-sucedido

### Variáveis obrigatórias para o Railway

```
NODE_ENV=production
DATABASE_URL=<supabase-connection-pooling-url>
REDIS_HOST=<upstash-host>
REDIS_PORT=6379
REDIS_PASSWORD=<upstash-token>
JWT_SECRET=<string-aleatoria-64-chars>
JWT_REFRESH_SECRET=<string-aleatoria-64-chars-diferente>
WEB_APP_URL=https://web-beryl-six-83.vercel.app
META_WHATSAPP_ACCESS_TOKEN=<token-meta>
META_WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
META_WHATSAPP_BUSINESS_ACCOUNT_ID=<waba-id>
META_WHATSAPP_APP_SECRET=<app-secret>
META_WHATSAPP_VERIFY_TOKEN=<verify-token-aleatorio>
META_WHATSAPP_API_VERSION=v21.0
OPENAI_API_KEY=<openai-key>
OPENAI_MODEL=gpt-4.1-mini
```

---

## Etapa 4 — Verificar saúde da API

```bash
curl https://SUA-API.railway.app/health
# Esperado: { "status": "ok" }

curl https://SUA-API.railway.app/system/status
# Esperado: { "status": "healthy", "services": { "database": { "status": "healthy" } } }
```

- [ ] `/health` retorna `{ "status": "ok" }`
- [ ] `/system/status` retorna database healthy

---

## Etapa 5 — Rodar Migrations

Via terminal do Railway (Settings → Terminal no serviço):

```bash
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

- [ ] Migrations executadas sem erros
- [ ] Tabelas criadas no Supabase (verificar no painel Table Editor)

---

## Etapa 6 — Rodar Seed Admin

```bash
npm run prisma:seed
```

- [ ] Seed executado com sucesso
- [ ] Usuário `admin@espiao.local` criado com role `ADMIN`

---

## Etapa 7 — Testar autenticação

```bash
curl -X POST https://SUA-API.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@espiao.local","password":"Admin@123456"}'
```

- [ ] Login retorna `accessToken` e `refreshToken`
- [ ] Salvar o token para usar nas próximas requisições

---

## Etapa 8 — Configurar variáveis no Vercel

1. Vercel → projeto `web` → Settings → Environment Variables
2. Adicionar:
   ```
   NEXT_PUBLIC_API_URL=https://SUA-API.railway.app
   NEXT_PUBLIC_SOCKET_URL=https://SUA-API.railway.app
   ```

- [ ] Variáveis configuradas no Vercel
- [ ] Redeploy: Vercel → Deployments → clique no último deploy → Redeploy

---

## Etapa 9 — Redeploy Vercel

Após configurar as variáveis:

- [ ] Vercel faz rebuild automático (ou acionar manualmente)
- [ ] Acessar https://web-beryl-six-83.vercel.app
- [ ] Badge "Realtime ativo" aparece quando API está rodando

---

## Etapa 10 — Configurar CORS

Confirmar que `WEB_APP_URL` está configurado corretamente no Railway com a URL exata da Vercel:

```
WEB_APP_URL=https://web-beryl-six-83.vercel.app
```

- [ ] Dashboard carrega sem erros de CORS no browser (F12 → Console)

---

## Etapa 11 — Configurar Webhook Meta

> Guia completo: README_WHATSAPP_CONNECT.md

1. Acesse https://developers.facebook.com/apps → seu app → WhatsApp → Configuração
2. Em **Webhook**, configure:
   - URL: `https://SUA-API.railway.app/whatsapp/webhook`
   - Verify Token: valor de `META_WHATSAPP_VERIFY_TOKEN`
3. Assine o evento **messages**

- [ ] Webhook verificado pela Meta (GET com verify_token respondido)
- [ ] Evento `messages` assinado
- [ ] `GET /whatsapp/provider` retorna `configured: true, webhookReady: true`

---

## Etapa 12 — Teste de mensagem real

Envie uma mensagem WhatsApp real para o número configurado e verifique:

```bash
# Verificar se paciente foi criado
curl -H "Authorization: Bearer TOKEN" https://SUA-API.railway.app/patients

# Verificar se conversa foi criada
curl -H "Authorization: Bearer TOKEN" https://SUA-API.railway.app/conversations
```

- [ ] Mensagem recebida pelo webhook (log no Railway)
- [ ] Paciente criado no banco
- [ ] Conversa criada no banco
- [ ] Mensagem persistida no banco

---

## Etapa 13 — Confirmar dashboard realtime

1. Abrir https://web-beryl-six-83.vercel.app
2. Enviar mensagem WhatsApp para o número
3. Observar o dashboard

- [ ] Toast "Nova mensagem recebida" aparece
- [ ] Badge "Realtime ativo" está verde
- [ ] Contador de conversas ativas incrementa

---

## Etapa 14 — Confirmar IA e audit logs

Após mensagem recebida (~30s para o BullMQ processar):

```bash
# Verificar AiAnalysis criado
# Via Supabase Table Editor → tabela ai_analysis

# Verificar AuditLog para alertas de risco
# Via Supabase Table Editor → tabela audit_log
# WHERE action = 'AI_ALERT'
```

Ou via endpoint de status da IA:

```bash
curl -H "Authorization: Bearer TOKEN" https://SUA-API.railway.app/ai-analysis/status
# Esperado: { "model": "gpt-4.1-mini", "configured": true }
```

- [ ] AiAnalysis criado com `status: COMPLETED`
- [ ] `findings._metadata` contém `totalTokens` e `latencyMs`
- [ ] Se `riskScore >= 70`, AuditLog criado com `action: AI_ALERT`
- [ ] Alerta aparece no dashboard em tempo real

---

## URLs finais de produção

| Serviço | URL |
|---------|-----|
| **Frontend** | https://web-beryl-six-83.vercel.app |
| **API** | https://SUA-API.railway.app |
| **Health** | https://SUA-API.railway.app/health |
| **System Status** | https://SUA-API.railway.app/system/status |
| **WhatsApp Provider** | https://SUA-API.railway.app/whatsapp/provider |
| **Webhook URL** | https://SUA-API.railway.app/whatsapp/webhook |

---

## Guias de referência

| Guia | Arquivo |
|------|---------|
| Deploy Frontend Vercel | README_DEPLOY_WEB.md |
| Deploy API Railway | README_DEPLOY_API.md |
| Supabase Postgres | README_SUPABASE_SETUP.md |
| Redis (BullMQ) | README_REDIS_SETUP.md |
| WhatsApp Meta Cloud API | README_WHATSAPP_CONNECT.md |
