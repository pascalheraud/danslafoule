// Validation of decrypted payloads (protocol spec §6). This is the one
// validation layer the backend structurally cannot perform (it never sees
// the decrypted content) — must reject anything that doesn't match, without
// throwing, so a malformed/unexpected payload never corrupts local state.
import type { AckPayload, AnnouncePayload, ChatPayload, LocationPayload, Payload, RenamePayload } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseAnnouncePayload(value: unknown): AnnouncePayload | null {
  if (!isRecord(value) || value.type !== "announce") return null;
  if (typeof value.pseudo !== "string" || value.pseudo.length === 0) return null;
  return { type: "announce", pseudo: value.pseudo };
}

export function parseChatPayload(value: unknown): ChatPayload | null {
  if (!isRecord(value) || value.type !== "chat") return null;
  if (typeof value.text !== "string" || value.text.length === 0) return null;
  if (value.replyTo !== null && typeof value.replyTo !== "string") return null;
  if (typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt)) return null;
  return { type: "chat", text: value.text, replyTo: value.replyTo, sentAt: value.sentAt };
}

export function parseLocationPayload(value: unknown): LocationPayload | null {
  if (!isRecord(value) || value.type !== "location") return null;
  const { lat, lon, accuracy, sentAt } = value;
  if (typeof lat !== "number" || lat < -90 || lat > 90) return null;
  if (typeof lon !== "number" || lon < -180 || lon > 180) return null;
  if (typeof accuracy !== "number" || accuracy < 0) return null;
  if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return null;
  return { type: "location", lat, lon, accuracy, sentAt };
}

export function parseAckPayload(value: unknown): AckPayload | null {
  if (!isRecord(value) || value.type !== "ack") return null;
  if (typeof value.ackedMessageId !== "string" || value.ackedMessageId.length === 0) return null;
  return { type: "ack", ackedMessageId: value.ackedMessageId };
}

export function parseRenamePayload(value: unknown): RenamePayload | null {
  if (!isRecord(value) || value.type !== "rename") return null;
  if (typeof value.pseudo !== "string" || value.pseudo.length === 0) return null;
  if (typeof value.oldPseudo !== "string" || value.oldPseudo.length === 0) return null;
  return { type: "rename", oldPseudo: value.oldPseudo, pseudo: value.pseudo };
}

export function parsePayload(value: unknown): Payload | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "announce":
      return parseAnnouncePayload(value);
    case "chat":
      return parseChatPayload(value);
    case "location":
      return parseLocationPayload(value);
    case "ack":
      return parseAckPayload(value);
    case "rename":
      return parseRenamePayload(value);
    default:
      return null;
  }
}
