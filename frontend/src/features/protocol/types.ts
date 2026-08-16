// Protocol shapes per doc/dans-la-foule-protocol-spec-en.md §5/§6.
// Kept in sync by hand with backend/app/schemas/envelope.py — no codegen yet.

export interface Envelope {
  v: 1;
  groupId: string;
  messageId: string;
  senderPub: string; // base64, 32 bytes
  nonce: string; // base64, 12 bytes
  ciphertext: string; // base64
  signature: string; // base64, 64 bytes
  timestamp: number; // unix ms, routing-only, not signed
}

export interface AnnouncePayload {
  type: "announce";
  pseudo: string;
}

export interface ChatPayload {
  type: "chat";
  text: string;
  replyTo: string | null;
  sentAt: number;
}

export interface LocationPayload {
  type: "location";
  lat: number;
  lon: number;
  accuracy: number;
  sentAt: number;
}

export interface AckPayload {
  type: "ack";
  ackedMessageId: string;
}

// Protocol spec §6.4: broadcast to every group this device belongs to when
// the user changes their (cross-group) display name on the "Me" screen.
export interface RenamePayload {
  type: "rename";
  oldPseudo: string;
  pseudo: string;
}

export type Payload = AnnouncePayload | ChatPayload | LocationPayload | AckPayload | RenamePayload;

export interface Identity {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyRaw: Uint8Array;
  pseudo: string;
}

export interface Group {
  groupId: string;
  groupKey: Uint8Array; // 32 bytes, AES-256
  createdAt: number;
  name: string;
  // Sticky flag: set automatically after 1h with no activity (client-side
  // inactivity pause — stops polling for this group), or manually by the
  // user. Only ever cleared by an explicit manual resume — see groupService.
  paused: boolean;
  // Last time this device saw activity for the group: creation, join,
  // manually resuming, sending a message, or receiving any valid envelope
  // (see group.ts's touchGroupActivity). Drives the auto-pause check —
  // deliberately its own field rather than re-derived from message history
  // on every check, so a manual resume with no new messages yet still
  // starts a fresh inactivity window instead of instantly re-pausing.
  lastActiveAt: number;
  // Persisted (not per-screen React state) so both GroupScreen and the app
  // menu's group list can show the same count — see group.ts's
  // incrementUnreadCount/clearUnreadCount and pipeline.ts's chat/location
  // handling. Counts chat/location messages only (not announce/ack).
  unreadCount: number;
}
