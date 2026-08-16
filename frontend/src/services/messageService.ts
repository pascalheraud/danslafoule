import { bytesToBase64 } from "../features/protocol/bytes";
import { buildEnvelope } from "../features/protocol/crypto";
import { getGroup, listGroups as listProtocolGroups, touchGroupActivity } from "../features/protocol/group";
import { getOrCreateIdentity } from "../features/protocol/identity";
import { getMembers } from "../features/protocol/members";
import { getChatMessages, getSystemEvents } from "../features/protocol/messages";
import { pollOnce } from "../features/protocol/polling";
import { postEnvelope } from "../features/protocol/relayService";
import type { Group } from "../features/protocol/types";
import type { ChatMessageView } from "./types";

// Per-group HTTP polling watermark (protocol spec §8.2) — in-memory only,
// each session starts a fresh sync from the beginning of the relay's 1h
// retention window, which is fine since local storage already holds history.
const sinceByGroup = new Map<string, number | null>();

async function requireGroup(groupId: string): Promise<Group> {
  const group = await getGroup(groupId);
  if (!group) throw new Error(`Unknown group ${groupId}`);
  return group;
}

// Announces this device's presence/pseudo to the group (protocol §6.1) — call
// once after creating/joining so other members' member tables pick it up.
export async function announce(groupId: string): Promise<void> {
  const group = await requireGroup(groupId);
  const identity = await getOrCreateIdentity();
  const envelope = await buildEnvelope(groupId, group.groupKey, identity, {
    type: "announce",
    pseudo: identity.pseudo,
  });
  await postEnvelope(envelope);
}

export async function sendChatMessage(groupId: string, text: string): Promise<void> {
  const group = await requireGroup(groupId);
  const identity = await getOrCreateIdentity();
  const envelope = await buildEnvelope(groupId, group.groupKey, identity, {
    type: "chat",
    text,
    replyTo: null,
    sentAt: Date.now(),
  });
  await postEnvelope(envelope);
  await touchGroupActivity(groupId); // sending counts as activity too, not just receiving
}

// Polls the relay and feeds every retrieved envelope through the shared
// receive pipeline (protocol spec §8.2/§9) — the same pipeline a future BLE
// transport would feed, so this is the only transport-specific glue.
export async function syncMessages(groupId: string): Promise<void> {
  const group = await requireGroup(groupId);
  const identity = await getOrCreateIdentity();
  const since = sinceByGroup.get(groupId) ?? null;
  // Watermarked by the server's opaque cursor (see polling.ts/relayService.ts),
  // never by envelope.timestamp — that field is client-clock and would drift,
  // and wouldn't resurface a resent message the way the cursor does.
  const latest = await pollOnce({ group, identity }, since);
  sinceByGroup.set(groupId, latest);
}

export async function getMessages(groupId: string): Promise<ChatMessageView[]> {
  const [messages, systemEvents, members, identity] = await Promise.all([
    getChatMessages(groupId),
    getSystemEvents(groupId),
    getMembers(groupId),
    getOrCreateIdentity(),
  ]);
  const selfPub = bytesToBase64(identity.publicKeyRaw);

  const chatEntries: ChatMessageView[] = messages.map((message) => ({
    kind: "chat",
    messageId: message.messageId,
    text: message.text,
    authorName:
      message.senderPub === selfPub ? "You" : (members[message.senderPub]?.pseudo ?? message.senderPub.slice(0, 8)),
    isSelf: message.senderPub === selfPub,
    sentAt: message.sentAt,
  }));

  const systemEntries: ChatMessageView[] = systemEvents.map((event) => ({
    kind: "system",
    messageId: event.messageId,
    text: event.text,
    sentAt: event.at,
  }));

  return [...chatEntries, ...systemEntries].sort((a, b) => a.sentAt - b.sentAt);
}

// Sent to every group this device belongs to when the user changes their
// (cross-group) display name on the "Me" screen — protocol spec §6.4.
export async function broadcastRename(oldPseudo: string, newPseudo: string): Promise<void> {
  const identity = await getOrCreateIdentity();
  const groups = await listProtocolGroups();
  await Promise.all(
    groups.map(async (group) => {
      const envelope = await buildEnvelope(group.groupId, group.groupKey, identity, {
        type: "rename",
        oldPseudo,
        pseudo: newPseudo,
      });
      await postEnvelope(envelope);
    }),
  );
}

// Test-only: resets the per-group polling watermark between tests.
export function _resetSyncWatermarksForTests(): void {
  sinceByGroup.clear();
}
