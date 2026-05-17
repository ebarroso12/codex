export type MetaWebhookPayload = {
  object: "whatsapp_business_account";
  entry: MetaEntry[];
};

export type MetaEntry = {
  id: string;
  changes: MetaChange[];
};

export type MetaChange = {
  value: MetaChangeValue;
  field: string;
};

export type MetaChangeValue = {
  messaging_product: "whatsapp";
  metadata: MetaMetadata;
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
};

export type MetaMetadata = {
  display_phone_number: string;
  phone_number_id: string;
};

export type MetaContact = {
  profile: { name: string };
  wa_id: string;
};

export type MetaMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: MetaMedia;
  audio?: MetaMedia;
  video?: MetaMedia;
  document?: MetaMedia;
  sticker?: MetaMedia;
  location?: MetaLocation;
  contacts?: MetaContactMessage[];
  interactive?: Record<string, unknown>;
  // TODO: reactions, template responses
};

export type MetaMedia = {
  caption?: string;
  filename?: string;
  id: string;
  mime_type: string;
  sha256: string;
};

export type MetaLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export type MetaContactMessage = {
  name: { formatted_name: string };
};

export type MetaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  // TODO: errors, conversation billing
};
