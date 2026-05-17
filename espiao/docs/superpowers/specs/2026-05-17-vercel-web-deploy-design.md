# Vercel Web Deploy Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo usuário

---

## Objetivo

Preparar `apps/web` (Next.js 15) para deploy na Vercel, sem URLs hardcoded, sem secrets expostos, build production funcionando.

---

## Arquivos

| Status | Path | Responsabilidade |
|--------|------|-----------------|
| Ler/atualizar | `apps/web/next.config.ts` | Configuração production-safe simples |
| Modificar | `apps/web/src/components/RealtimeDashboard.tsx` | NEXT_PUBLIC_SOCKET_URL separado de API_URL |
| Modificar | `package.json` (root) | Add build:web e start:web scripts |
| Modificar | `.env.example` | Add NEXT_PUBLIC_SOCKET_URL |
| Criar | `apps/web/.env.local.example` | Variáveis dev local |
| Criar | `README_DEPLOY_WEB.md` | Guia Vercel passo a passo |

Não tocar: backend, banco, WhatsApp.

---

## Mudanças técnicas

### RealtimeDashboard.tsx

```typescript
// BEFORE:
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const socket = useSocket(apiUrl);

// AFTER:
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? apiUrl;
const socket = useSocket(socketUrl);
```

`socketUrl` declarado uma única vez. Sem duplicação.

### next.config.ts

Configuração mínima e production-safe:
- Sem CSP inventada
- Sem rewrites complexos
- `output: "standalone"` se quiser containerizar depois (opcional, pode omitir)
- Apenas garantir que o arquivo existe e não conflita com build

### package.json (root) — scripts adicionados

```json
"build:web": "npm run build -w apps/web",
"start:web": "npm run start -w apps/web"
```

### Variáveis de ambiente

`.env.example`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

`apps/web/.env.local.example`:
```
# Variáveis para desenvolvimento local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

Em produção Vercel: ambas apontam para a URL da API no Railway/backend.

---

## Vercel deploy config (documentado no README)

### Opção A — Root Directory: apps/web
```
Root Directory:     apps/web
Build Command:      npm run build
Output Directory:   .next
Install Command:    npm install
```

Atenção: se Vercel não resolver workspaces monorepo desta forma, usar Opção B.

### Opção B — Root Directory: raiz do repo
```
Root Directory:     (vazio — raiz)
Build Command:      npm run build:web
Output Directory:   apps/web/.next
Install Command:    npm install
```

Recomendado para monorepo com Vercel.

### Variáveis de ambiente na Vercel

Configurar no painel Vercel → Settings → Environment Variables:
```
NEXT_PUBLIC_API_URL=https://sua-api.railway.app
NEXT_PUBLIC_SOCKET_URL=https://sua-api.railway.app
```

Nunca expor variáveis sem prefixo `NEXT_PUBLIC_` neste deploy (o frontend não tem acesso a secrets).

---

## Critério

- `npm run build:web` passa sem erros
- `npm run build -w apps/web` idem
- Nenhum `localhost` hardcoded no bundle de produção
- `README_DEPLOY_WEB.md` completo com link https://vercel.com/new?teamSlug=edsonbarroso-7705s-projects
