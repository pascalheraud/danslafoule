import { dbGet, dbSet } from "./db";
import type { ChatPayload } from "./types";

export interface StoredChatMessage {
  messageId: string;
  senderPub: string;
  text: string;
  replyTo: string | null;
  sentAt: number;
}

// A synthesized "X is now Y" notice (protocol spec §6.4) — never sent over
// the wire itself, built locally from a received `rename` payload plus the
// member's previously-known pseudo.
export interface StoredSystemEvent {
  messageId: string;
  text: string;
  at: number;
}

type MessagesByGroup = Record<string, StoredChatMessage[]>;
type AckStateByGroup = Record<string, Record<string, string[]>>; // groupId -> messageId -> ackerPub[]
type SystemEventsByGroup = Record<string, StoredSystemEvent[]>;

async function loadMessages(): Promise<MessagesByGroup> {
  return (await dbGet<MessagesByGroup>("messages", "chat")) ?? {};
}
async function saveMessages(data: MessagesByGroup): Promise<void> {
  await dbSet("messages", "chat", data);
}
async function loadAckState(): Promise<AckStateByGroup> {
  return (await dbGet<AckStateByGroup>("messages", "ackState")) ?? {};
}
async function saveAckState(data: AckStateByGroup): Promise<void> {
  await dbSet("messages", "ackState", data);
}
async function loadSystemEvents(): Promise<SystemEventsByGroup> {
  return (await dbGet<SystemEventsByGroup>("messages", "systemEvents")) ?? {};
}
async function saveSystemEvents(data: SystemEventsByGroup): Promise<void> {
  await dbSet("messages", "systemEvents", data);
}

export async function storeChatMessage(
  groupId: string,
  senderPub: string,
  messageId: string,
  payload: ChatPayload,
): Promise<void> {
  const all = await loadMessages();
  const list = all[groupId] ?? [];
  if (list.some((message) => message.messageId === messageId)) return; // dedup, §5.1/§9
  list.push({ messageId, senderPub, text: payload.text, replyTo: payload.replyTo, sentAt: payload.sentAt });
  all[groupId] = list;
  await saveMessages(all);
}

export async function getChatMessages(groupId: string): Promise<StoredChatMessage[]> {
  return (await loadMessages())[groupId] ?? [];
}

// Returns true the first time ackerPub acks messageId, false on a repeat
// (idempotence, §6.4 — avoids network noise on resend).
export async function recordAck(groupId: string, messageId: string, ackerPub: string): Promise<boolean> {
  const all = await loadAckState();
  const group = all[groupId] ?? {};
  const ackers = group[messageId] ?? [];
  if (ackers.includes(ackerPub)) return false;
  group[messageId] = [...ackers, ackerPub];
  all[groupId] = group;
  await saveAckState(all);
  return true;
}

export async function getAckers(groupId: string, messageId: string): Promise<string[]> {
  return (await loadAckState())[groupId]?.[messageId] ?? [];
}

export async function storeSystemEvent(groupId: string, messageId: string, text: string, at: number): Promise<void> {
  const all = await loadSystemEvents();
  const list = all[groupId] ?? [];
  if (list.some((event) => event.messageId === messageId)) return; // dedup, same as chat messages
  list.push({ messageId, text, at });
  all[groupId] = list;
  await saveSystemEvents(all);
}

export async function getSystemEvents(groupId: string): Promise<StoredSystemEvent[]> {
  return (await loadSystemEvents())[groupId] ?? [];
}
