# Redis Setup — BullMQ Production

Guia para configurar Redis em produção para o projeto espiao (usado pelo BullMQ para fila de análise de IA).

---

## Opção recomendada: Upstash Redis (free tier disponível)

Upstash é serverless Redis com free tier generoso. Ideal para este projeto.

---

## Passo 1 — Criar conta e banco Redis (Upstash)

1. Acesse https://upstash.com e crie uma conta
2. Clique em **Create Database**
3. Preencha:
   - **Name:** `espiao-redis`
   - **Type:** Regional
   - **Region:** escolha a mais próxima do Railway (ex: `us-east-1` para AWS East, ou `sa-east-1` para São Paulo)
   - **TLS/SSL:** ✓ (habilitado)
4. Clique em **Create**

---

## Passo 2 — Obter as credenciais

Após criar, no painel do banco Redis:

1. Vá para a aba **Details** ou **Quick Start**
2. Em **Connect your database**, selecione **ioredis**
3. Copie a URL de conexão no formato:
   ```
   redis://default:[TOKEN]@[HOST].upstash.io:6379
   ```

---

## Passo 3 — Configurar no Railway

No Railway → serviço da API → **Settings → Variables**:

### Usando REDIS_URL (recomendado para Upstash)

```
REDIS_URL=redis://default:[TOKEN]@[HOST].upstash.io:6379
```

> **Nota:** O projeto usa `REDIS_HOST` + `REDIS_PORT` + `REDIS_PASSWORD` por padrão.
> Para Upstash com TLS via URL completa, configure as três variáveis separadas:

```
REDIS_HOST=[HOST].upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=[TOKEN]
```

---

## Passo 4 — Alternativa: Redis Cloud (Redis Labs)

1. Acesse https://redis.com/try-free
2. Crie um banco gratuito (30MB)
3. Em **Databases** → seu banco → **Configuration**
4. Copie:
   - **Endpoint:** `host:port`
   - **Password:** token de autenticação
5. Configure no Railway:
   ```
   REDIS_HOST=redis-xxxxx.c1.us-east-1-4.ec2.cloud.redislabs.com
   REDIS_PORT=16379
   REDIS_PASSWORD=sua-senha-aqui
   ```

---

## Passo 5 — Alternativa: Redis Plugin do Railway

Railway oferece um plugin Redis nativo:

1. No projeto Railway → **Add a Service** → **Database** → **Redis**
2. Railway cria o Redis e injeta automaticamente:
   ```
   REDIS_URL=redis://default:password@redis.railway.internal:6379
   ```
3. No serviço da API, use essa URL como variável de referência.

> **Vantagem:** Zero config, fica na mesma rede interna do Railway (mais rápido).
> **Desvantagem:** Sem free tier — é cobrado por uso.

---

## Passo 6 — Testar conexão

Via `/system/status`:

```bash
curl https://SUA-API.railway.app/system/status
```

Resposta esperada quando Redis está OK:
```json
{
  "services": {
    "redis": { "status": "healthy", "latencyMs": 5 }
  }
}
```

Se Redis não estiver configurado:
```json
{
  "services": {
    "redis": { "status": "degraded", "message": "Redis not configured" }
  }
}
```

O sistema funciona degradado sem Redis (webhooks funcionam, mas fila de IA fica desativada).

---

## Comportamento sem Redis

Se Redis não estiver configurado ou cair:
- Webhooks WhatsApp continuam funcionando normalmente
- Mensagens são persistidas no banco
- Análise de IA via BullMQ fica desativada (silenciosamente, sem erro)
- `/system/status` mostra `redis: degraded`

---

## Erros comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `ECONNREFUSED` | Host/porta errados | Confirmar endpoint copiado corretamente |
| `NOAUTH` | Password não configurado | Configurar `REDIS_PASSWORD` |
| `redis: degraded` no /system/status | `REDIS_HOST` não configurado | Adicionar variável no Railway |
| TLS error | Upstash requer TLS | Usar `rediss://` (com duplo s) para conexões TLS |

---

## Checklist Redis

- [ ] Redis criado (Upstash, Redis Cloud, ou Railway plugin)
- [ ] `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD` configurados no Railway
- [ ] `/system/status` mostra redis healthy
- [ ] BullMQ processando jobs de análise de IA
