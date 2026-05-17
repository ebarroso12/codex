# WhatsApp Audit SaaS

Base inicial de um SaaS para auditoria de atendimentos WhatsApp usando somente a integração oficial da Meta WhatsApp Business Cloud API.

## Stack

- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Banco: PostgreSQL
- Cache/fila: Redis + BullMQ
- ORM: Prisma
- Auth: JWT com RBAC
- IA: serviço preparado para OpenAI GPT-4.1 mini
- Desenvolvimento local: Docker Compose

## Estrutura

```text
apps/
  api/                  # NestJS API
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
  web/                  # Next.js app
packages/
  database/             # Prisma schema e client compartilhável
docker-compose.yml
.env.example
```

## Regras de integração WhatsApp

Este projeto é preparado somente para a Meta WhatsApp Business Cloud API oficial.

Não há uso de WhatsApp Web, Baileys, Venom, Puppeteer ou automação não oficial. O serviço inicial de WhatsApp usa o endpoint `https://graph.facebook.com/{version}/{phone-number-id}/messages`.

## Setup

1. Instale dependências:

```bash
npm install
```

2. Configure variáveis de ambiente:

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

5. Rode a primeira migration:

```bash
npm run prisma:migrate
```

6. Inicie API e web em terminais separados:

```bash
npm run dev:api
npm run dev:web
```

URLs padrão:

- Web: http://localhost:3000
- API: http://localhost:3001
- Healthcheck: http://localhost:3001/health

## Qualidade

```bash
npm run lint
npm run typecheck
npm test
```

## Endpoints iniciais

- `GET /health`
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

Rotas de domínio, exceto health/auth/webhook/provider, já estão protegidas por JWT e RBAC onde aplicável.

## Próximas tarefas sugeridas

1. Implementar cadastro/login real com hash de senha, refresh token e política de senha.
2. Criar migrations versionadas e seed de usuário administrador.
3. Persistir webhooks oficiais da Meta e validar assinatura `X-Hub-Signature-256`.
4. Criar workers BullMQ para normalização de mensagens e análise com OpenAI.
5. Implementar CRUDs com paginação, filtros e auditoria.
6. Adicionar multi-tenancy antes de dados reais de clínicas/unidades.
7. Criar testes e2e da API e testes de fluxos críticos do dashboard.
