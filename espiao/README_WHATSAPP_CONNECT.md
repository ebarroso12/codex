# Conectar WhatsApp — Meta Business Cloud API Oficial

Este guia cobre a configuração completa da integração oficial com o WhatsApp Business Cloud API da Meta.

> **Apenas Meta WhatsApp Business Cloud API oficial.**
> Não usamos QR Code, WhatsApp Web, Baileys, Venom, Puppeteer ou qualquer automação não oficial.

---

## Pré-requisitos

- Conta Facebook pessoal (para acesso ao Business Manager)
- Número de telefone real dedicado ao atendimento (celular ou linha fixa com SMS)
  - O número **não pode** estar vinculado a uma conta WhatsApp pessoal/Business no celular
- Acesso ao Meta Developer: https://developers.facebook.com
- Backend da API rodando com URL pública (Railway, Render, Fly.io ou tunnel local)

---

## Passo 1 — Criar Meta Business Manager

1. Acesse https://business.facebook.com
2. Clique em **Criar conta**
3. Preencha nome da empresa, email e nome do responsável
4. Confirme o email

---

## Passo 2 — Criar aplicativo Meta no Developer Console

1. Acesse https://developers.facebook.com/apps
2. Clique em **Criar aplicativo**
3. Tipo: **Business** (não: Consumer, Gaming, etc.)
4. Associe ao Business Manager criado no Passo 1
5. Após criar, procure o painel **WhatsApp** e clique em **Configurar**

---

## Passo 3 — Criar WhatsApp Business Account (WABA)

1. Na configuração do WhatsApp no Developer Console
2. Crie ou selecione uma **WhatsApp Business Account**
3. Anote o **WhatsApp Business Account ID** (WABA ID) — aparece no painel

---

## Passo 4 — Adicionar e verificar número de telefone

1. Em **Gerenciar números de telefone**, clique em **Adicionar número de telefone**
2. Informe o número no formato internacional (ex: +55 11 99999-0001)
3. Escolha verificação via **SMS** ou **chamada de voz**
4. Confirme o código recebido
5. Aguarde aprovação (pode levar até 24h para novos números)

Após aprovação, anote o **Phone Number ID** — é diferente do número em si.

---

## Passo 5 — Gerar System User Token (permanente)

O token de página temporário expira em 60 dias. Para produção, use **System User Token**.

1. Acesse https://business.facebook.com → Configurações → Usuários do sistema
2. Clique em **Adicionar** → Tipo: **Administrador do sistema**
3. Com o sistema criado, clique em **Gerar novo token**
4. Selecione o aplicativo criado no Passo 2
5. Permissões obrigatórias:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Gere o token e salve em local seguro — ele não será exibido novamente

---

## Passo 6 — Obter variáveis de ambiente

Acesse https://developers.facebook.com/apps → seu aplicativo → WhatsApp → Configuração da API.

| Variável | Onde encontrar |
|----------|---------------|
| `META_WHATSAPP_ACCESS_TOKEN` | Token do sistema (Passo 5) |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Painel WhatsApp → número adicionado → ID do número |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | Painel WhatsApp → ID da conta comercial |
| `META_WHATSAPP_APP_SECRET` | Configurações do aplicativo → Básico → Segredo do aplicativo |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Você define — qualquer string aleatória segura |
| `META_WHATSAPP_API_VERSION` | Use `v21.0` (ou versão mais recente disponível) |

Gere o verify token com:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Passo 7 — Configurar webhook na Meta

1. No Developer Console → WhatsApp → Configuração
2. Em **Webhook**, clique em **Editar**
3. URL do callback:
   ```
   https://SUA-API.railway.app/whatsapp/webhook
   ```
4. Token de verificação: o valor de `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
5. Clique em **Verificar e salvar**
   - A Meta enviará um GET com `hub.verify_token` — a API responderá com o challenge
6. Após salvar, clique em **Gerenciar** ao lado de **Campos do webhook**
7. Assine o evento: **messages** ✓
8. Clique em **Salvar**

---

## Passo 8 — Configurar variáveis no backend

Configure as variáveis de ambiente na plataforma de deploy (Railway, Render, etc.):

```
META_WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxx
META_WHATSAPP_PHONE_NUMBER_ID=123456789012345
META_WHATSAPP_BUSINESS_ACCOUNT_ID=987654321098765
META_WHATSAPP_APP_SECRET=abc123def456...
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=seu-token-aleatorio-aqui
META_WHATSAPP_API_VERSION=v21.0
```

---

## Passo 9 — Validar configuração via API

Com a API rodando, acesse:

```http
GET https://SUA-API.railway.app/whatsapp/provider
```

Resposta esperada quando tudo está configurado:

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

Se `missingEnv` não estiver vazio, configure as variáveis listadas.

---

## Passo 10 — Testar handshake do webhook

```bash
curl "https://SUA-API.railway.app/whatsapp/webhook?\
hub.mode=subscribe&\
hub.verify_token=SEU_VERIFY_TOKEN&\
hub.challenge=test-challenge-123"
```

Resposta esperada: `test-challenge-123` (texto simples, sem JSON)

---

## Passo 11 — Enviar mensagem teste real

Envie uma mensagem WhatsApp do número do cliente para o número cadastrado.

No banco de dados (`AiAnalysis`, `Message`, `Conversation`, `Patient`), verifique se os registros foram criados.

Via `/system/status`, confirme que database e Redis estão `healthy`.

---

## Passo 12 — Checklist final

- [ ] Meta Business Manager criado e verificado
- [ ] WhatsApp Business Account ativa
- [ ] Número de telefone verificado e aprovado
- [ ] System User Token gerado (não o token temporário de página)
- [ ] Todas as variáveis de ambiente configuradas no backend
- [ ] `GET /whatsapp/provider` retorna `configured: true, webhookReady: true`
- [ ] Webhook verificado pela Meta (GET com verify_token respondido corretamente)
- [ ] Evento `messages` assinado no webhook
- [ ] Mensagem teste recebida e persistida no banco
- [ ] Dashboard exibindo alertas em tempo real

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| `webhookReady: false` | VERIFY_TOKEN ou APP_SECRET ausentes | Configurar variáveis de ambiente |
| GET webhook retorna 404 | API não está rodando ou URL errada | Verificar deploy e URL |
| Meta rejeita verificação webhook | VERIFY_TOKEN não bate | Confirmar mesmo valor no .env e no painel Meta |
| Mensagens não chegam | Evento `messages` não assinado | Gerenciar campos do webhook → messages |
| Assinatura HMAC inválida | APP_SECRET errado | Obter APP_SECRET correto no Developer Console |
