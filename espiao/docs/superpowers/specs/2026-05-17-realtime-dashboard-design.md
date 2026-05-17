# Realtime Dashboard Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo usuário

---

## Objetivo

Atualizar o dashboard em tempo real quando novas mensagens WhatsApp chegarem via webhook, sem refresh manual. Supervisores conectados veem atualizações instantâneas.

---

## Arquitetura

```
Meta Webhook POST
  → WhatsappWebhookService.persistMessage()
  → RealtimeGateway.emit(envelope)
  → socket.io broadcast
  → Browser: useSocket singleton
  → patch incremental de estado React
  → UI atualiza + sonner toast
```

---

## Arquivos

| Status | Path | Responsabilidade |
|--------|------|-----------------|
| Create | `apps/api/src/realtime/realtime-events.types.ts` | Envelope + tipos de eventos |
| Create | `apps/api/src/realtime/realtime.gateway.ts` | WebSocket Gateway, heartbeat, CORS, emit |
| Create | `apps/api/src/realtime/realtime.module.ts` | Registra RealtimeGateway, exporta |
| Modify | `apps/api/src/app.module.ts` | Importar RealtimeModule |
| Modify | `apps/api/src/whatsapp/whatsapp-webhook.service.ts` | Injetar RealtimeGateway, emitir após persistir |
| Create | `apps/web/src/lib/realtime-events.types.ts` | Mesmos tipos espelhados no frontend |
| Create | `apps/web/src/hooks/use-socket.ts` | Singleton socket.io-client, lifecycle |
| Create | `apps/web/src/components/RealtimeDashboard.tsx` | Client Component, estado realtime, UI viva |
| Modify | `apps/web/src/app/layout.tsx` | Add `<Toaster>` do sonner |
| Modify | `apps/web/src/app/page.tsx` | Passar initialData para RealtimeDashboard |
| Modify | `apps/web/package.json` | Add socket.io-client, sonner |
| Modify | `apps/api/package.json` | Add @nestjs/platform-socket.io, @nestjs/websockets |

---

## Envelope de eventos

```typescript
export type RealtimeEnvelope<T> = {
  event: string;
  version: 1;
  timestamp: string; // ISO8601
  data: T;
};
```

---

## Tipos de eventos

```typescript
export type MessageCreatedPayload = {
  messageId: string;
  conversationId: string;
  fromNumber: string;      // E.164 mascarado: "+55119****0001"
  messageType: string;     // TEXT | IMAGE | AUDIO | etc
  sentAt: string;          // ISO8601
};

export type ConversationCreatedPayload = {
  conversationId: string;
  patientPhone: string;    // E.164 mascarado
  accountPhoneNumberId: string;
  startedAt: string;
};

export type PatientCreatedPayload = {
  patientId: string;
  createdAt: string;
  // sem nome, sem dados médicos
};

export type AlertCreatedPayload = {
  alertId: string;
  level: "info" | "warning" | "critical";
  title: string;
  // sem payload sensível
};

export type RealtimeEventMap = {
  "message.created": RealtimeEnvelope<MessageCreatedPayload>;
  "conversation.created": RealtimeEnvelope<ConversationCreatedPayload>;
  "patient.created": RealtimeEnvelope<PatientCreatedPayload>;
  "alert.created": RealtimeEnvelope<AlertCreatedPayload>;
};
```

**Nunca emitir:** nome completo, texto da mensagem, mídia, observações clínicas, diagnósticos.

---

## Backend: RealtimeGateway

```typescript
@WebSocketGateway({
  cors: { origin: process.env.WEB_APP_URL || "http://localhost:3000" },
  transports: ["websocket"],       // evitar polling fallback
  pingInterval: 25000,             // heartbeat
  pingTimeout: 60000
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Socket connected: ${client.id}`);
    // TODO: JWT auth guard - extrair tenantId, client.join(`tenant:${tenantId}`)
    // TODO: room per supervisor: client.join(`supervisor:${userId}`)
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  emit<K extends keyof RealtimeEventMap>(event: K, data: RealtimeEventMap[K]["data"]): void {
    const envelope: RealtimeEventMap[K] = {
      event,
      version: 1,
      timestamp: new Date().toISOString(),
      data
    } as RealtimeEventMap[K];
    this.server.emit(event, envelope);
    this.logger.log(`Emitted ${event}`);
    // TODO: Redis adapter - substituir this.server.emit() por room-based emit
    // TODO: room per tenant: this.server.to(`tenant:${tenantId}`).emit(event, envelope)
  }
}
```

**Observabilidade:** Logger em connect, disconnect, reconnect attempt, cada emit.

---

## Backend: Integração com WhatsappWebhookService

Após `message.upsert()` com sucesso:
```typescript
this.realtime.emit("message.created", {
  messageId: persisted.id,
  conversationId: conversation.id,
  fromNumber: maskPhone(normalized.fromNumber),
  messageType: normalized.type,
  sentAt: normalized.sentAt.toISOString()
});
```

Após `conversation.create()`:
```typescript
this.realtime.emit("conversation.created", {
  conversationId: conversation.id,
  patientPhone: maskPhone(normalized.fromNumber),
  accountPhoneNumberId: metadata.phone_number_id,
  startedAt: conversation.startedAt.toISOString()
});
```

`maskPhone("+5511999990001")` → `"+55119****0001"` (mantém código país + 4 primeiros + 4 últimos mascarados).

---

## Frontend: useSocket (singleton real)

```typescript
// Singleton fora do hook: uma instância por módulo JS, não por render
let socketInstance: Socket | null = null;

export function useSocket(url: string) {
  // socket criado na primeira chamada, reutilizado nas seguintes
  if (!socketInstance) {
    socketInstance = io(url, {
      transports: ["websocket"],
      reconnectionDelayMax: 10_000,
      autoConnect: true
    });
  }

  // cleanup apenas quando o componente que controla o lifecycle desmonta
  useEffect(() => {
    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
    };
  }, []);

  return socketInstance;
}
```

Evita múltiplas conexões por re-render. Disconnect + reset no unmount.

---

## Frontend: RealtimeDashboard

```typescript
"use client";

// Props vindas do Server Component (page.tsx)
type Props = {
  initialConversations: ConversationRow[];
  initialActiveCount: number;
};

// Estado interno
const [conversations, setConversations] = useState(initialConversations);
const [activeCount, setActiveCount] = useState(initialActiveCount);
const [online, setOnline] = useState(false);

// Socket
const socket = useSocket(process.env.NEXT_PUBLIC_API_URL!);

// Listeners com deduplicação (remover antes de adicionar)
useEffect(() => {
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("message.created", onMessageCreated);
  socket.on("conversation.created", onConversationCreated);
  return () => {
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("message.created", onMessageCreated);
    socket.off("conversation.created", onConversationCreated);
  };
}, [socket]);

// Patch incremental (sem refetch)
function onMessageCreated(envelope: RealtimeEnvelope<MessageCreatedPayload>) {
  setConversations(prev =>
    prev.map(c =>
      c.id === envelope.data.conversationId
        ? { ...c, lastMessage: new Date(envelope.data.sentAt).toLocaleTimeString() }
        : c
    )
  );
  toast.info("Nova mensagem recebida", { duration: 3000 });
}

function onConversationCreated(envelope: RealtimeEnvelope<ConversationCreatedPayload>) {
  setActiveCount(prev => prev + 1);
  toast.success("Nova conversa iniciada", { duration: 4000 });
}

// Reconexão: toast com debounce (não mais de 1 por 5s)
let lastReconnectToast = 0;
socket.io.on("reconnect", () => {
  const now = Date.now();
  if (now - lastReconnectToast > 5_000) {
    toast.success("Conexão restabelecida");
    lastReconnectToast = now;
  }
  setOnline(true);
});
```

---

## Frontend: OnlineBadge

```tsx
<span className={`onlineBadge ${online ? "online" : "offline"}`}>
  {online ? "Realtime ativo" : "Reconectando..."}
</span>
```

CSS: dot verde animado quando online, dot vermelho pulsando quando offline.

---

## Toasts por evento

| Evento | Nível | Mensagem | Duration |
|--------|-------|----------|----------|
| `connect` | — | (sem toast) | — |
| `disconnect` | warning | "Conexão perdida. Reconectando..." | persist |
| `reconnect` | success | "Conexão restabelecida" | 3s |
| `message.created` | info | "Nova mensagem recebida" | 3s |
| `conversation.created` | success | "Nova conversa iniciada" | 4s |
| `alert.created` | warning | `alert.title` | 6s |

Flood protection: não emitir toast `message.created` se o anterior foi há menos de 1s (debounce simples via `Date.now()`).

---

## Segurança

- CORS socket.io restrito ao `WEB_APP_URL` via ConfigService
- `transports: ["websocket"]` — sem polling (sem cookies problemáticos)
- Dados sensíveis nunca emitidos
- Telefone sempre mascarado antes de qualquer emit
- TODO: JWT auth guard no handleConnection
- TODO: Rooms por tenant antes de dados reais de produção

---

## Teste manual documentado

```
1. Iniciar API: npm run dev:api
2. Iniciar web: npm run dev:web
3. Abrir http://localhost:3000 em 2 abas do browser
4. Verificar badge "Realtime ativo" (verde) nas 2 abas
5. Disparar webhook manualmente:

curl -X POST http://localhost:3001/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=$(echo -n '{"object":"whatsapp_business_account","entry":[...]}' | openssl dgst -sha256 -hmac 'change-me')" \
  -d '{"object":"whatsapp_business_account","entry":[...]}'

6. Ambas as abas atualizam sem refresh
7. Toast aparece nas 2 abas
8. Fechar uma aba → badge muda para offline → reabrir → "Conexão restabelecida"
```

---

## Escalabilidade futura (TODOs explícitos)

- [ ] JWT auth guard no `handleConnection` — extrair tenantId do token
- [ ] `client.join(`tenant:${tenantId}`)` — isolamento por tenant
- [ ] `client.join(`supervisor:${userId}`)` — canal por supervisor
- [ ] `client.join(`clinic:${clinicId}`)` — canal por clínica
- [ ] `@socket.io/redis-adapter` — substituir broadcast local
- [ ] Presence tracking — quem está online por tenant
- [ ] Realtime AI alerts — quando IA gerar análise crítica
