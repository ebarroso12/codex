export type RealtimeEnvelope<T> = {
  event: string;
  version: 1;
  timestamp: string;
  data: T;
};

export type MessageCreatedPayload = {
  messageId: string;
  conversationId: string;
  fromNumber: string;
  messageType: string;
  sentAt: string;
};

export type ConversationCreatedPayload = {
  conversationId: string;
  patientPhone: string;
  accountPhoneNumberId: string;
  startedAt: string;
};

export type WhatsappSessionCreatedPayload = {
  sessionId: string;
  provider: string;
  createdAt: string;
};

export type WhatsappSessionQrUpdatedPayload = {
  sessionId: string;
};

export type WhatsappSessionConnectedPayload = {
  sessionId: string;
  phoneNumber: string | null;
  connectedAt: string;
};

export type WhatsappSessionDisconnectedPayload = {
  sessionId: string;
  disconnectedAt: string;
};
