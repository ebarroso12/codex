# Supabase Setup — PostgreSQL Production

Guia para configurar o banco de dados PostgreSQL via Supabase para o projeto espiao.

---

## Passo 1 — Criar conta e projeto

1. Acesse https://supabase.com e crie uma conta gratuita
2. Clique em **New Project**
3. Preencha:
   - **Name:** `espiao-prod`
   - **Database Password:** gere uma senha forte e salve em local seguro
   - **Region:** escolha a mais próxima do servidor Railway (ex: `South America (São Paulo)`)
4. Clique em **Create new project** e aguarde (~2 minutos)

---

## Passo 2 — Obter a DATABASE_URL

1. No painel do projeto → **Settings → Database**
2. Em **Connection string**, selecione a aba **URI**
3. Copie a connection string no formato:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
   ```
4. Substitua `[PASSWORD]` pela senha criada no Passo 1

### Connection Pooling (recomendado para produção)

Para evitar esgotar conexões com múltiplas instâncias:

1. Ainda em **Settings → Database**, selecione a aba **Connection pooling**
2. Copie a URI com porta `6543`:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true
   ```

> Use a URI de connection pooling no Railway para produção.
> Use a URI direta (porta 5432) para rodar `prisma migrate deploy` manualmente.

---

## Passo 3 — Adicionar sslmode

Supabase exige SSL. Adicione `?sslmode=require` ao final da URI se não estiver presente:

```
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true&sslmode=require
```

---

## Passo 4 — Configurar DATABASE_URL no Railway

1. No Railway → seu projeto → **Settings → Variables**
2. Adicione:
   ```
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true&sslmode=require
   ```

---

## Passo 5 — Rodar migrations Prisma

As migrations estão em `packages/database/prisma/migrations/`.

### Via terminal Railway (após deploy da API)

No Railway → serviço da API → **Settings → Terminal**:

```bash
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

> Use `prisma migrate deploy` (não `migrate dev`) em produção.
> `migrate deploy` aplica as migrations pendentes sem criar novas.

### Via ambiente local (conectando ao Supabase remoto)

```bash
# Na raiz do projeto, com DATABASE_URL apontando para Supabase:
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require" \
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

---

## Passo 6 — Rodar seed do admin

```bash
# Via terminal Railway ou local com DATABASE_URL configurada:
npm run prisma:seed
```

Cria:
- Email: `admin@espiao.local`
- Senha: `Admin@123456`
- Role: `ADMIN`

> Altere a senha do admin após o primeiro login.

---

## Passo 7 — Testar conexão

```bash
# Via terminal Railway:
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count().then(n => console.log('Users:', n)).catch(console.error).finally(() => p.\$disconnect());
"
```

Ou via `/system/status`:
```bash
curl https://SUA-API.railway.app/system/status
```

Resposta esperada:
```json
{
  "status": "healthy",
  "services": {
    "database": { "status": "healthy" }
  }
}
```

---

## Erros comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `SSL connection required` | Falta `sslmode=require` | Adicionar `?sslmode=require` na DATABASE_URL |
| `Connection refused` | Porta errada | Usar porta `5432` para conexão direta, `6543` para pooling |
| `password authentication failed` | Senha errada | Conferir a senha usada no Passo 1 |
| `too many connections` | Sem connection pooling | Usar a URI com `pgbouncer=true` |

---

## Checklist Supabase

- [ ] Projeto criado no Supabase
- [ ] DATABASE_URL obtida com connection pooling
- [ ] DATABASE_URL configurada no Railway
- [ ] `prisma migrate deploy` executado com sucesso
- [ ] `prisma:seed` executado (usuário admin criado)
- [ ] `/system/status` mostra database healthy
