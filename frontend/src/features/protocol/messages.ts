import { dbGet, dbSet } from "./db";
import type { ChatPayload, Envelope } from "./types";

export interface StoredChatMessage {
  messageId: string;
  senderPub: string;
  text: string;
  replyTo: string | null;
  sentAt: number;
  // Absent (undefined) for messages that arrived through the receive
  // pipeline — they were, by definition, already accepted by the relay.
  // "pending": queued locally, not yet accepted by the relay (offline send).
  // "sent": accepted by the relay; kept (rather than cleared) so a message
  // sent while already displayed doesn't need a second local write to drop
  // the flag — see queueChatMessage/markChatMessageSent in messageService.ts.
  status?: "pending" | "sent";
  // Snapshot of every member pubkey known (locally, on this device) at the
  // moment this message was queued/received — including the sender. A
  // member who joins the group afterwards isn't retroactively expected to
  // ack messages sent before they were known, so delivery status and the
  // per-message receipt list (messageService.ts) are computed against this
  // snapshot, never against the group's current, live member list.
  knownMemberPubs: string[];
}

// A synthesized "X is now known as Y" notice (protocol spec §6.4) — never sent over
// the wire itself, built locally from a received `rename` payload plus the
// member's previously-known pseudo.
export interface StoredSystemEvent {
  messageId: string;
  text: string;
  at: number;
}

// Offline-send queue (outbox): the already-built envelope for a chat message
// not yet accepted by the relay. Built once at queue time and re-POSTed as-is
// on retry (refreshing only `timestamp`, mirroring the manual-resend
// semantics in pipeline.ts's resendEnvelope) rather than rebuilt from scratch,
// so a flaky connection can't produce two differently-encrypted envelopes for
// what the user experiences as a single send.
export type OutboxEntry = Envelope;

type MessagesByGroup = Record<string, StoredChatMessage[]>;
type AckStateByGroup = Record<string, Record<string, string[]>>; // groupId -> messageId -> ackerPub[]
type SystemEventsByGroup = Record<string, StoredSystemEvent[]>;
type OutboxByGroup = Record<string, OutboxEntry[]>;

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
async function loadOutbox(): Promise<OutboxByGroup> {
  return (await dbGet<OutboxByGroup>("messages", "outbox")) ?? {};
}
async function saveOutbox(data: OutboxByGroup): Promise<void> {
  await dbSet("messages", "outbox", data);
}

export async function storeChatMessage(
  groupId: string,
  senderPub: string,
  messageId: string,
  payload: ChatPayload,
  knownMemberPubs: string[],
  status?: "pending" | "sent",
): Promise<void> {
  const all = await loadMessages();
  const list = all[groupId] ?? [];
  if (list.some((message) => message.messageId === messageId)) return; // dedup, §5.1/§9
  list.push({
    messageId,
    senderPub,
    text: payload.text,
    replyTo: payload.replyTo,
    sentAt: payload.sentAt,
    status,
    knownMemberPubs,
  });
  all[groupId] = list;
  await saveMessages(all);
}

export async function getChatMessage(groupId: string, messageId: string): Promise<StoredChatMessage | undefined> {
  return (await loadMessages())[groupId]?.find((message) => message.messageId === messageId);
}

// Flips a locally-queued message from "pending" to "sent" once the relay has
// accepted it. No-op if the message isn't there (e.g. cleared some other way).
export async function markChatMessageSent(groupId: string, messageId: string): Promise<void> {
  const all = await loadMessages();
  const list = all[groupId];
  const message = list?.find((m) => m.messageId === messageId);
  if (!message) return;
  message.status = "sent";
  await saveMessages(all);
}

export async function addToOutbox(groupId: string, entry: OutboxEntry): Promise<void> {
  const all = await loadOutbox();
  const list = all[groupId] ?? [];
  list.push(entry);
  all[groupId] = list;
  await saveOutbox(all);
}

export async function removeFromOutbox(groupId: string, messageId: string): Promise<void> {
  const all = await loadOutbox();
  const list = all[groupId];
  if (!list) return;
  all[groupId] = list.filter((entry) => entry.messageId !== messageId);
  await saveOutbox(all);
}

export async function getOutbox(groupId: string): Promise<OutboxEntry[]> {
  return (await loadOutbox())[groupId] ?? [];
}

export async function getAllOutboxGroupIds(): Promise<string[]> {
  return Object.keys(await loadOutbox());
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
