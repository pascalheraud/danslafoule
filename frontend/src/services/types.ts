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

export interface ChatMessageEntry {
  kind: "chat";
  messageId: string;
  text: string;
  authorName: string;
  isSelf: boolean;
  sentAt: number;
}

// A synthesized "X is now Y" rename notice (protocol spec §6.4) — no author,
// rendered centered/muted rather than as a chat bubble.
export interface SystemMessageEntry {
  kind: "system";
  messageId: string;
  text: string;
  sentAt: number;
}

export type ChatMessageView = ChatMessageEntry | SystemMessageEntry;
