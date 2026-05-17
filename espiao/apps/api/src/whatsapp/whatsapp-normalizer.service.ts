import { Injectable } from "@nestjs/common";
import { MessageType } from "@prisma/client";
import type { MetaContact, MetaMessage, MetaMetadata } from "./dto/meta-webhook.types";

export type NormalizedMessage = {
  metaMessageId: string;
  fromNumber: string;
  contactName: string | null;
  type: MessageType;
  text: string | null;
  payload: Record<string, unknown> | null;
  sentAt: Date;
};

const TYPE_MAP: Record<string, MessageType> = {
  text: "TEXT",
  image: "IMAGE",
  audio: "AUDIO",
  video: "VIDEO",
  document: "DOCUMENT",
  sticker: "IMAGE",
  location: "TEXT",
  contacts: "TEXT",
  interactive: "INTERACTIVE",
  template: "TEMPLATE"
};

@Injectable()
export class WhatsappNormalizerService {
  normalize(
    message: MetaMessage,
    contacts: MetaContact[] | undefined,
    _metadata: MetaMetadata
  ): NormalizedMessage {
    const contact = contacts?.find((c) => c.wa_id === message.from);
    const type: MessageType = TYPE_MAP[message.type] ?? "UNKNOWN";

    let text: string | null = null;
    let payload: Record<string, unknown> | null = null;

    switch (message.type) {
      case "text":
        text = message.text?.body ?? null;
        break;

      case "image":
        if (message.image) {
          payload = message.image as unknown as Record<string, unknown>;
          text = message.image.caption ?? null;
        }
        break;

      case "video":
        if (message.video) {
          payload = message.video as unknown as Record<string, unknown>;
          text = message.video.caption ?? null;
        }
        break;

      case "audio":
        if (message.audio) {
          payload = message.audio as unknown as Record<string, unknown>;
        }
        break;

      case "document":
        if (message.document) {
          payload = message.document as unknown as Record<string, unknown>;
          text = message.document.caption ?? null;
        }
        break;

      case "sticker":
        if (message.sticker) {
          payload = message.sticker as unknown as Record<string, unknown>;
        }
        break;

      case "location":
        if (message.location) {
          payload = message.location as unknown as Record<string, unknown>;
          text = message.location.name ?? null;
        }
        break;

      case "contacts":
        if (message.contacts) {
          payload = { contacts: message.contacts } as Record<string, unknown>;
          text = message.contacts[0]?.name.formatted_name ?? null;
        }
        break;

      case "interactive":
        if (message.interactive) {
          payload = message.interactive;
        }
        break;

      default:
        // TODO: reactions, template responses
        payload = { raw: message } as Record<string, unknown>;
    }

    return {
      metaMessageId: message.id,
      fromNumber: message.from,
      contactName: contact?.profile.name ?? null,
      type,
      text,
      payload,
      sentAt: new Date(Number(message.timestamp) * 1000)
    };
  }
}
