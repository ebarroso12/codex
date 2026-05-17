# WhatsApp Provider Status + Connection Guide Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo usuário

---

## Objetivo

Atualizar `GET /whatsapp/provider` para retornar status de configuração sem expor secrets, e criar documentação oficial de conexão Meta WhatsApp Cloud API.

---

## Arquivos

| Status | Path | Responsabilidade |
|--------|------|-----------------|
| Modify | `apps/api/src/whatsapp/whatsapp-cloud-api.service.ts` | Adicionar `getProviderStatus()` |
| Modify | `apps/api/src/whatsapp/whatsapp.controller.ts` | Usar `getProviderStatus()` em GET /whatsapp/provider |
| Create | `README_WHATSAPP_CONNECT.md` | Guia oficial de conexão Meta Cloud API |

---

## Endpoint

```
GET /whatsapp/provider
```

Público (sem JWT). Retorna configuração atual sem expor valores dos secrets.

### Resposta

```json
{
  "provider": "meta_cloud_api",
  "configured": true,
  "connected": false,
  "phoneNumberIdConfigured": true,
  "webhookReady": true,
  "missingEnv": []
}
```

- `configured`: todas as 4 vars obrigatórias presentes
- `connected`: sempre `false` nesta etapa (validação real → POST /whatsapp/provider/verify, futuro)
- `phoneNumberIdConfigured`: `META_WHATSAPP_PHONE_NUMBER_ID` presente
- `webhookReady`: `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` AND `META_WHATSAPP_APP_SECRET` presentes
- `missingEnv`: nomes das vars ausentes, sem valores

### requiredVars

```typescript
const REQUIRED_VARS = [
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_WHATSAPP_APP_SECRET"
] as const;
```

Nunca expor os valores, só os nomes.

---

## README_WHATSAPP_CONNECT.md — seções

1. Pré-requisitos
2. Criar Meta Business Manager
3. Criar WhatsApp Business Account
4. Adicionar número de telefone oficial
5. Verificar número na Meta
6. Gerar system user token (permanente, não expira)
7. Obter variáveis: onde encontrar cada uma no Developer Console
8. Configurar webhook: URL + evento messages
9. Validar com GET /whatsapp/provider
10. Testar handshake GET webhook
11. Enviar mensagem teste real
12. Checklist final
