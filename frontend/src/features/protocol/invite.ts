// Invite payload encode/decode (protocol spec §4.2). One codec, shared by
// both join paths: QR code (encodes this same string) and plain-text share
// (SMS/WhatsApp/copy-paste of this same string) — there is only one format.
import { base64ToBytes, bytesToBase64 } from "./bytes";
import type { Group } from "./types";

const SCHEME_PREFIX = "dlf1:";

interface InvitePayloadJson {
  v: 1;
  gid: string;
  gk: string; // base64, 32 bytes
  name: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  return base64 + padding;
}

// Encodes the same string regardless of how it will be shared — the caller
// decides whether to render it as a QR code, put it in an SMS/WhatsApp
// message, or offer it as copy-paste text.
export function encodeInvite(group: Group): string {
  const json: InvitePayloadJson = {
    v: 1,
    gid: group.groupId,
    gk: bytesToBase64(group.groupKey),
    name: group.name,
  };
  const base64 = bytesToBase64(textEncoder.encode(JSON.stringify(json)));
  return `${SCHEME_PREFIX}${toBase64Url(base64)}`;
}

// Parses an invite string from either source (QR scan result or pasted
// text) — same parser, same result either way. Returns null (never throws)
// on any malformed input.
export function decodeInvite(invite: string): Group | null {
  const trimmed = invite.trim();
  if (!trimmed.startsWith(SCHEME_PREFIX)) return null;
  try {
    const jsonBytes = base64ToBytes(fromBase64Url(trimmed.slice(SCHEME_PREFIX.length)));
    const parsed = JSON.parse(textDecoder.decode(jsonBytes)) as Partial<InvitePayloadJson>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.gid !== "string" || parsed.gid.length === 0) return null;
    if (typeof parsed.gk !== "string") return null;
    if (typeof parsed.name !== "string") return null;

    const groupKey = base64ToBytes(parsed.gk);
    if (groupKey.length !== 32) return null;

    const now = Date.now();
    return {
      groupId: parsed.gid,
      groupKey,
      name: parsed.name,
      createdAt: now,
      paused: false,
      lastActiveAt: now,
      unreadCount: 0,
    };
  } catch {
    return null;
  }
}
