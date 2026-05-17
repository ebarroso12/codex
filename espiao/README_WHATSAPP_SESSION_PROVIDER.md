# WhatsApp Session Provider — Integração por Sessão

> ⚠️ **AVISO IMPORTANTE:** Providers por sessão (Evolution API, WPPConnect) usam conexões
> não-oficiais do WhatsApp. Isso pode violar os Termos de Serviço do WhatsApp e resultar
> em banimento do número. Use somente com consentimento explícito do responsável.

---

## Arquitetura de Providers

O sistema suporta dois providers via feature flag `WHATSAPP_PROVIDER`:

| Provider | Valor | Status |
|----------|-------|--------|
| Meta Cloud API | `meta_cloud_api` (padrão) | Produção — API oficial da Meta |
| Session Provider | `session_provider` | Stub — aguarda integração Evolution/WPPConnect |

## Configuração

```env
# .env ou Railway Variables
WHATSAPP_PROVIDER=session_provider  # ou meta_cloud_api
```

## Endpoints de Sessão

Todos os endpoints requerem autenticação JWT (`Authorization: Bearer <token>`).

### Criar sessão

```http
POST /whatsapp/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "SESSION_PROVIDER",
  "phoneNumber": "+5516999990001"
}
```

Resposta (201):
```json
{
  "id": "uuid",
  "provider": "SESSION_PROVIDER",
  "status": "PENDING",
  "phoneNumber": "+5516999990001",
  "createdAt": "2026-05-17T..."
}
```

### Obter QR Code

```http
GET /whatsapp/sessions/:id/qrcode
Authorization: Bearer <token>
```

Resposta:
```json
{
  "sessionId": "uuid",
  "qrDataUrl": null,
  "expiresAt": null
}
```

`qrDataUrl` será preenchido quando Evolution API / WPPConnect estiver integrado.

### Status da sessão

```http
GET /whatsapp/sessions/:id/status
Authorization: Bearer <token>
```

Resposta:
```json
{
  "sessionId": "uuid",
  "status": "PENDING",
  "phoneNumber": null,
  "connectedAt": null,
  "disconnectedAt": null,
  "provider": "SESSION_PROVIDER"
}
```

Status possíveis: `PENDING` | `QR_PENDING` | `CONNECTED` | `DISCONNECTED` | `FAILED`

### Desconectar sessão

```http
DELETE /whatsapp/sessions/:id
Authorization: Bearer <token>
```

Resposta: `{ "disconnected": true }`

---

## Eventos Realtime (WebSocket)

O dashboard recebe estes eventos via socket.io:

| Evento | Payload |
|--------|---------|
| `whatsapp.session.created` | `{ sessionId, provider, createdAt }` |
| `whatsapp.session.qr_updated` | `{ sessionId }` — busque QR via endpoint |
| `whatsapp.session.connected` | `{ sessionId, phoneNumber, connectedAt }` |
| `whatsapp.session.disconnected` | `{ sessionId, disconnectedAt }` |

---

## Modelo de banco

```
WhatsappSession {
  id                — UUID primário
  provider          — META_CLOUD_API | SESSION_PROVIDER
  status            — PENDING | QR_PENDING | CONNECTED | DISCONNECTED | FAILED
  phoneNumber       — número conectado (nullable)
  qrCode            — NUNCA logado, NUNCA no frontend
  connectedAt       — datetime da conexão
  disconnectedAt    — datetime da desconexão
  externalSessionId — ID da sessão no Evolution/WPPConnect
  tenantId          — futuro multi-tenant
  metadata          — JSON sem secrets
  createdAt, updatedAt
}
```

Audit log registra: `SESSION_CREATED`, `SESSION_DISCONNECTED`.

---

## Integrando Evolution API

O stub está em `apps/api/src/whatsapp/providers/session.provider.ts`.
Todos os métodos têm `// TODO` com exemplos de chamada à Evolution API.

Passos para integrar:
1. Obtenha URL e API Key do Evolution API
2. Adicione `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` ao `.env`
3. Implemente os métodos no `SessionWhatsappProvider`
4. Obtenha aprovação antes de ativar `WHATSAPP_PROVIDER=session_provider` em produção

---

## Segurança

- `qrCode` nunca é logado (Logger ignora o campo)
- Tokens de sessão nunca chegam ao frontend
- Todos os eventos de connect/disconnect registrados no `AuditLog`
- `metadata` nos eventos realtime nunca contém dados sensíveis
- Não use para monitoramento oculto sem consentimento do responsável
