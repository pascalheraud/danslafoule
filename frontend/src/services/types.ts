// UI-facing view types. Identity/group/message persistence and crypto all
// live in features/protocol/* — these services are thin adapters over it.

export interface Profile {
  pseudo: string;
}

export interface GroupSummary {
  groupId: string;
  name: string;
  paused: boolean;
  unreadCount: number;
}

// See features/protocol/messages.ts's StoredChatMessage.status: "pending"
// (queued, offline) and "sent" (accepted by the relay, awaiting acks) are
// only ever set for messages authored by this device — a received message
// is implicitly "acked" (no separate status needed, see ChatMessageEntry.ackedBy).
export type DeliveryStatus = "pending" | "sent" | "ackedByOne" | "ackedByAll";

export interface ChatMessageEntry {
  kind: "chat";
  messageId: string;
  text: string;
  authorName: string;
  // Two-letter avatar initials — derived from the real pseudo even when
  // authorName is the generic "You" label (the viewer's own messages).
  authorInitials: string;
  // Author's public key — passed through to getMessageReceipts so the
  // detail screen can pin the sender first, regardless of who's viewing.
  authorPub: string;
  isSelf: boolean;
  sentAt: number;
  // Only meaningful for isSelf messages — see DeliveryStatus.
  deliveryStatus: DeliveryStatus;
}

export interface MemberView {
  senderPub: string;
  pseudo: string;
  lastSeen: number;
}

// One row per group member for a given message's detail screen — whether
// that member has acked it yet. The sender's own row is pinned first (see
// getMessageReceipts) and flagged via isSender instead of an acked state,
// since "did the author receive their own message" isn't a meaningful
// question to show the viewer.
export interface MessageReceiptView {
  senderPub: string;
  pseudo: string;
  acked: boolean;
  isSender: boolean;
}

// A synthesized "X is now known as Y" rename notice (protocol spec §6.4) — no author,
// rendered centered/muted rather than as a chat bubble.
export interface SystemMessageEntry {
  kind: "system";
  messageId: string;
  text: string;
  sentAt: number;
}

export type ChatMessageView = ChatMessageEntry | SystemMessageEntry;
