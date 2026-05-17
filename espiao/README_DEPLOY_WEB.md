# Deploy Frontend — Vercel

Guia de deploy do webapp (`apps/web`) na Vercel.

---

## Pre-requisitos

- Conta Vercel ativa
- API backend rodando em algum host (Railway, Render ou Fly.io)
- URL pública da API disponível antes de configurar o Vercel

---

## Passo 1: Importar projeto

Acesse o link de import direto:

**https://vercel.com/new?teamSlug=edsonbarroso-7705s-projects**

Selecione o repositório `codex` (contém a pasta `espiao/`).

---

## Passo 2: Configurar Build Settings

### Opção A — Raiz do monorepo (recomendado)

| Campo | Valor |
|-------|-------|
| Root Directory | *(vazio — raiz do repositório)* |
| Framework Preset | Next.js |
| Build Command | `npm run build:web` |
| Output Directory | `apps/web/.next` |
| Install Command | `npm install` |

### Opção B — Root Directory: apps/web

Se a Opção A falhar com erros de workspace, tente:

| Campo | Valor |
|-------|-------|
| Root Directory | `espiao/apps/web` |
| Framework Preset | Next.js |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm install` |

---

## Passo 3: Variáveis de Ambiente

No painel Vercel → seu projeto → **Settings → Environment Variables**.

Configure para **Production**, **Preview** e **Development**:

| Variável | Valor (produção) | Obrigatório |
|----------|-----------------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://sua-api.railway.app` | Sim |
| `NEXT_PUBLIC_SOCKET_URL` | `https://sua-api.railway.app` | Não (herda de API_URL) |

> **Nunca adicione** `OPENAI_API_KEY`, `JWT_SECRET`, `DATABASE_URL` ou qualquer secret do backend
> no projeto Vercel do frontend. Variáveis `NEXT_PUBLIC_*` ficam visíveis no bundle JavaScript.

---

## Passo 4: Deploy

Clique em **Deploy**. O Vercel executa o build e fornece a URL pública do frontend.

Build bem-sucedido: painel mostra ✅ e exibe a URL final.

---

## Passo 5: Configurar CORS no Backend

Quando o frontend estiver em `https://seu-app.vercel.app`, configure no backend:

```
WEB_APP_URL=https://seu-app.vercel.app
```

O NestJS usa essa variável em `main.ts` para permitir requisições CORS.

---

## Passo 6: Verificar

1. Acesse a URL pública do Vercel
2. Badge "Realtime ativo" deve aparecer verde quando a API estiver ativa
3. Se badge ficar vermelho, verificar `NEXT_PUBLIC_SOCKET_URL` e CORS no backend

---

## Scripts disponíveis (a partir da raiz do monorepo)

```bash
# Build somente o frontend
npm run build:web

# Subir localmente após build
npm run start:web

# Desenvolvimento local
npm run dev:web
```

---

## Checklist pré-deploy

- [ ] `npm run build:web` passa sem erros localmente
- [ ] `NEXT_PUBLIC_API_URL` configurado no painel Vercel
- [ ] API backend rodando e acessível publicamente
- [ ] `WEB_APP_URL` configurado no backend com a URL do Vercel
- [ ] Nenhum secret do backend configurado no projeto Vercel do frontend
