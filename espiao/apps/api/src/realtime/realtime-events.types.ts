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

export type PatientCreatedPayload = {
  patientId: string;
  createdAt: string;
};

export type AlertCreatedPayload = {
  alertId: string;
  level: "info" | "warning" | "critical";
  title: string;
};

export type RealtimeEventMap = {
  "message.created": RealtimeEnvelope<MessageCreatedPayload>;
  "conversation.created": RealtimeEnvelope<ConversationCreatedPayload>;
  "patient.created": RealtimeEnvelope<PatientCreatedPayload>;
  "alert.created": RealtimeEnvelope<AlertCreatedPayload>;
};
