# Espiao WhatsApp Audit SaaS

Base inicial de um SaaS para auditoria de atendimentos WhatsApp usando somente a integracao oficial da Meta WhatsApp Business Cloud API.

## Stack

- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Banco: PostgreSQL
- Cache/fila: Redis + BullMQ
- ORM: Prisma
- Auth: JWT com RBAC, access token e refresh token
- IA: servico preparado para OpenAI GPT-4.1 mini
- Desenvolvimento local: Docker Compose

## Estrutura

```text
apps/
  api/
    src/
      auth/
      users/
      employees/
      patients/
      conversations/
      messages/
      whatsapp/
      ai-analysis/
      reports/
      audit-logs/
      prisma/
  web/
packages/
  database/
    prisma/
      schema.prisma
      seed.ts
docker-compose.yml
.env.example
```

## Regras de integracao WhatsApp

Este projeto e preparado somente para a Meta WhatsApp Business Cloud API oficial.

Nao ha uso de WhatsApp Web, Baileys, Venom, Puppeteer ou automacao nao oficial. A integracao final de WhatsApp ainda nao foi implementada nesta etapa.

## Setup

1. Instale dependencias:

```bash
npm install
```

2. Configure variaveis de ambiente:

```bash
cp .env.example .env
```

3. Suba Postgres e Redis:

```bash
docker compose up -d
```

4. Gere o Prisma Client:

```bash
npm run prisma:generate
```

5. Rode a migration:

```bash
npm run prisma:migrate
```

6. Crie o administrador inicial:

```bash
npm run prisma:seed
```

Credenciais do seed:

- Email: `admin@espiao.local`
- Senha: `Admin@123456`
- Role: `ADMIN`

7. Inicie API e web em terminais separados:

```bash
npm run dev:api
npm run dev:web
```

URLs padrao:

- Web: http://localhost:3000
- API: http://localhost:3001
- Healthcheck publico: http://localhost:3001/health

## Autenticacao

Registro (role padrao: `AGENT`):

```http
POST /auth/register
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "name": "Nome Completo",
  "password": "Senha@123456"
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
    "email": "usuario@exemplo.com",
    "name": "Nome Completo",
    "role": "AGENT"
  }
}
```

Requisitos de senha: minimo 8 caracteres, ao menos uma letra maiuscula, uma minuscula e um digito.

Login:

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@espiao.local",
  "password": "Admin@123456"
}
```

Resposta:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "user": {
    "id": "...",
    "email": "admin@espiao.local",
    "name": "Admin Espiao",
    "role": "ADMIN"
  }
}
```

Refresh:

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "..."
}
```

Roles disponiveis:

- `ADMIN`
- `SUPERVISOR`
- `AGENT`
- `AUDITOR`

Rotas de dominio exigem JWT. Algumas rotas tambem exigem roles especificas via `RolesGuard`. `/health` permanece publico.

## Qualidade

```bash
npm run lint
npm run typecheck
npm test
```

## Analise IA (BullMQ + OpenAI)

Apos cada nova mensagem persistida, um job e enfileirado no BullMQ para analise assincrona da conversa.

O worker analisa somente **metadados operacionais** — nunca texto, nome, telefone ou dados medicos.

Dados enviados ao OpenAI:
- contagem de mensagens (entrada/saida)
- tempos de resposta medios
- duracao da conversa
- tipos de mensagem (TEXT, IMAGE, etc.)
- status da conversa

Dados **nunca** enviados ao OpenAI:
- texto das mensagens
- nome do paciente
- telefone completo
- diagnosticos ou observacoes clinicas

Quando `riskScore >= 70`, um `AuditLog` e criado e o evento `alert.created` e emitido via WebSocket para o dashboard em tempo real.

Endpoint de status:

```http
GET /ai-analysis/status
Authorization: Bearer <token>
```

Resposta:

```json
{
  "model": "gpt-4.1-mini",
  "configured": true
}
```

## Endpoints iniciais

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/dev-token`
- `GET /whatsapp/provider`
- `GET /whatsapp/webhook`
- `GET /users`
- `GET /employees`
- `GET /patients`
- `GET /conversations`
- `GET /messages`
- `GET /ai-analysis/status`
- `GET /reports`
- `GET /audit-logs`

## Proximas tarefas sugeridas

1. Criar migrations versionadas em ambiente com Postgres disponivel.
2. Adicionar tela de login no dashboard usando `/auth/login`.
3. Persistir webhooks oficiais da Meta e validar assinatura `X-Hub-Signature-256`.
4. Criar workers BullMQ para normalizacao de mensagens.
5. Implementar CRUDs com paginacao, filtros e auditoria.
6. Adicionar multi-tenancy antes de dados reais.
