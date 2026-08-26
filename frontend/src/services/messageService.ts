import { bytesToBase64 } from "../features/protocol/bytes";
import { buildEnvelope } from "../features/protocol/crypto";
import { getGroup, listGroups as listProtocolGroups, touchGroupActivity } from "../features/protocol/group";
import { getOrCreateIdentity } from "../features/protocol/identity";
import { getMembers } from "../features/protocol/members";
import {
  addToOutbox,
  getAckers,
  getAllOutboxGroupIds,
  getChatMessage,
  getChatMessages,
  getOutbox,
  getSystemEvents,
  markChatMessageSent,
  removeFromOutbox,
  storeChatMessage,
} from "../features/protocol/messages";
import { pollOnce } from "../features/protocol/polling";
import { postEnvelope } from "../features/protocol/relayService";
import type { Group } from "../features/protocol/types";
import type { ChatMessageView, MemberView, MessageReceiptView } from "./types";

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

// Offline-first send (spec: doc/general-spec.md §5): the message is stored
// and shown locally as "pending" *before* the network attempt, so it never
// depends on that attempt succeeding to exist on-device. `flushOutboxes` (run
// right after this, and on every global poll tick — see globalPoller.ts)
// does the actual POST and retries; this function never throws on a network
// failure, only on a genuinely broken local/crypto state (unknown group).
export async function queueChatMessage(groupId: string, text: string): Promise<void> {
  const group = await requireGroup(groupId);
  const identity = await getOrCreateIdentity();
  const selfPub = bytesToBase64(identity.publicKeyRaw);
  const envelope = await buildEnvelope(groupId, group.groupKey, identity, {
    type: "chat",
    text,
    replyTo: null,
    sentAt: Date.now(),
  });
  // Snapshot at send time — see StoredChatMessage.knownMemberPubs.
  const members = await getMembers(groupId);
  const knownMemberPubs = Array.from(new Set([...Object.keys(members), selfPub]));
  await storeChatMessage(
    groupId,
    selfPub,
    envelope.messageId,
    { type: "chat", text, replyTo: null, sentAt: envelope.timestamp },
    knownMemberPubs,
    "pending",
  );
  await addToOutbox(groupId, envelope);
}

// Attempts every queued-but-unsent message for one group, in order (so a
// burst of offline messages lands in the order the user sent them once
// connectivity returns). Stops at the first failure — retrying later ones
// out of order isn't worth the complexity for what's expected to be an
// occasional, short-lived queue.
async function flushOutbox(groupId: string): Promise<void> {
  const entries = await getOutbox(groupId);
  for (const envelope of entries) {
    try {
      // Timestamp refreshed on each retry — same rationale as the manual
      // resend in pipeline.ts's resendEnvelope: routing-only, unsigned field.
      await postEnvelope({ ...envelope, timestamp: Date.now() });
    } catch {
      return; // still offline (or relay down) — try again next flush
    }
    await removeFromOutbox(groupId, envelope.messageId);
    await markChatMessageSent(groupId, envelope.messageId);
    await touchGroupActivity(groupId); // sending counts as activity too, not just receiving
  }
}

// Called after a user-initiated send (immediate retry) and by the global
// poller on every tick (background retry while the app is open) — see
// globalPoller.ts. Iterates only groups that actually have something queued.
export async function flushOutboxes(): Promise<void> {
  const groupIds = await getAllOutboxGroupIds();
  await Promise.all(groupIds.map(flushOutbox));
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

// Derives a self-authored message's WhatsApp-style status from its local
// send state plus the ack state against the group's other known members —
// see doc/general-spec.md §5. Not meaningful for a message authored by
// someone else (the caller never asks).
function deriveDeliveryStatus(status: "pending" | "sent" | undefined, ackerCount: number, otherMemberCount: number) {
  if (status === "pending") return "pending" as const;
  if (ackerCount === 0) return "sent" as const;
  if (otherMemberCount > 0 && ackerCount >= otherMemberCount) return "ackedByAll" as const;
  return "ackedByOne" as const;
}

export async function getMessages(groupId: string): Promise<ChatMessageView[]> {
  const [messages, systemEvents, members, identity] = await Promise.all([
    getChatMessages(groupId),
    getSystemEvents(groupId),
    getMembers(groupId),
    getOrCreateIdentity(),
  ]);
  const selfPub = bytesToBase64(identity.publicKeyRaw);

  const chatEntries: ChatMessageView[] = await Promise.all(
    messages.map(async (message) => {
      const isSelf = message.senderPub === selfPub;
      const ackers = isSelf ? await getAckers(groupId, message.messageId) : [];
      // Members expected to ack this specific message, fixed at send/receive
      // time (message.knownMemberPubs) — not the group's current member
      // count, which could include people who joined afterwards. Falls back
      // to the live member list for messages stored before this field
      // existed (no migration for pre-existing local data).
      const knownMemberPubs = message.knownMemberPubs ?? Object.keys(members);
      const otherMemberCount = knownMemberPubs.filter((pub) => pub !== selfPub).length;
      return {
        kind: "chat" as const,
        messageId: message.messageId,
        text: message.text,
        authorName: isSelf ? "You" : (members[message.senderPub]?.pseudo ?? message.senderPub.slice(0, 8)),
        // Separate from authorName: the avatar's initials should reflect the
        // real pseudo even for the viewer's own messages, where authorName
        // is deliberately the generic "You" label instead.
        authorInitials: (isSelf ? identity.pseudo : (members[message.senderPub]?.pseudo ?? message.senderPub)).slice(
          0,
          2,
        ).toUpperCase(),
        authorPub: message.senderPub,
        isSelf,
        sentAt: message.sentAt,
        deliveryStatus: deriveDeliveryStatus(message.status, ackers.length, otherMemberCount),
      };
    }),
  );

  const systemEntries: ChatMessageView[] = systemEvents.map((event) => ({
    kind: "system",
    messageId: event.messageId,
    text: event.text,
    sentAt: event.at,
  }));

  return [...chatEntries, ...systemEntries].sort((a, b) => a.sentAt - b.sentAt);
}

// For the "group members" screen (doc/general-spec.md §4) — every member
// known locally (from received announce/rename payloads), most recently
// active first.
export async function getGroupMembers(groupId: string): Promise<MemberView[]> {
  const members = await getMembers(groupId);
  return Object.entries(members)
    .map(([senderPub, member]) => ({ senderPub, pseudo: member.pseudo, lastSeen: member.lastSeen }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

// For a message's detail screen (doc/general-spec.md §5) — the sender first
// (isSender: true, so the UI can show them distinctly rather than as an
// acked/not-acked row), then every other group member pseudo-alphabetical
// so their order doesn't jump around as acks arrive.
export async function getMessageReceipts(
  groupId: string,
  messageId: string,
  authorPub: string,
): Promise<MessageReceiptView[]> {
  const [storedMessage, members, ackers, identity] = await Promise.all([
    getChatMessage(groupId, messageId),
    getMembers(groupId),
    getAckers(groupId, messageId),
    getOrCreateIdentity(),
  ]);
  const selfPub = bytesToBase64(identity.publicKeyRaw);
  const ackerSet = new Set(ackers);
  // Pseudo/lastSeen come from the current members table (fine — those can
  // freely update), but *which* pubkeys are listed at all comes from the
  // message's own snapshot: someone who joined after this message was
  // sent isn't shown as an expected (and therefore "not seen yet") recipient.
  const expectedPubs = storedMessage?.knownMemberPubs ?? Object.keys(members);
  const pseudoFor = (senderPub: string) =>
    senderPub === selfPub ? "You" : (members[senderPub]?.pseudo ?? senderPub.slice(0, 8));

  const sender: MessageReceiptView = {
    senderPub: authorPub,
    pseudo: pseudoFor(authorPub),
    acked: ackerSet.has(authorPub),
    isSender: true,
  };
  const others = expectedPubs
    .filter((senderPub) => senderPub !== authorPub)
    .map((senderPub) => ({
      senderPub,
      pseudo: pseudoFor(senderPub),
      acked: ackerSet.has(senderPub),
      isSender: false,
    }))
    .sort((a, b) => a.pseudo.localeCompare(b.pseudo));

  return [sender, ...others];
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
