// Unified receive pipeline (protocol spec §9). Transport-agnostic: HTTP
// feeds it today, BLE will feed the same function once implemented — no
// rework needed here when that lands.
import { bytesToBase64 } from "./bytes";
import { buildEnvelope, verifyAndDecryptEnvelope } from "./crypto";
import { incrementUnreadCount, touchGroupActivity } from "./group";
import { getAckers, recordAck, storeChatMessage, storeSystemEvent } from "./messages";
import { getMembers, recordAnnounce } from "./members";
import { storeLocation } from "./locations";
import { hasSeen, markSeen } from "./seenCache";
import type { Envelope, Group, Identity } from "./types";

export interface PipelineDeps {
  group: Group;
  identity: Identity;
  send: (envelope: Envelope) => Promise<void>;
}

export async function onEnvelopeReceived(envelope: Envelope, deps: PipelineDeps): Promise<void> {
  if (envelope.groupId !== deps.group.groupId) return;
  if (await hasSeen(envelope.groupId, envelope.messageId)) return;

  const verified = await verifyAndDecryptEnvelope(envelope, deps.group.groupKey);
  if (!verified) return;

  await markSeen(envelope.groupId, envelope.messageId);

  const isFromSelf = envelope.senderPub === bytesToBase64(deps.identity.publicKeyRaw);

  const { payload } = verified;
  switch (payload.type) {
    case "announce": {
      const isNewMember = await recordAnnounce(envelope.groupId, envelope.senderPub, payload.pseudo, envelope.timestamp);
      if (isNewMember) {
        await storeSystemEvent(
          envelope.groupId,
          envelope.messageId,
          `${payload.pseudo} joined the group`,
          envelope.timestamp,
        );
      }
      return;
    }
    case "chat": {
      // Snapshot, not a live lookup at display time: whoever joins the group
      // afterwards shouldn't retroactively become someone this message was
      // "supposed to" reach — see StoredChatMessage.knownMemberPubs.
      const members = await getMembers(envelope.groupId);
      const knownMemberPubs = Array.from(
        new Set([...Object.keys(members), envelope.senderPub, bytesToBase64(deps.identity.publicKeyRaw)]),
      );
      await storeChatMessage(envelope.groupId, envelope.senderPub, envelope.messageId, payload, knownMemberPubs);
      await touchGroupActivity(envelope.groupId); // resets the inactivity/auto-pause clock
      // A message this device authored isn't "unread" for it, even once the
      // relay round-trip hands it back via polling.
      if (!isFromSelf) await incrementUnreadCount(envelope.groupId);
      await emitAck(envelope.messageId, deps);
      return;
    }
    case "location":
      await storeLocation(envelope.groupId, envelope.senderPub, payload);
      await touchGroupActivity(envelope.groupId);
      await emitAck(envelope.messageId, deps);
      return;
    case "ack":
      await recordAck(envelope.groupId, payload.ackedMessageId, envelope.senderPub);
      return;
    case "rename":
      await recordAnnounce(envelope.groupId, envelope.senderPub, payload.pseudo, envelope.timestamp);
      await touchGroupActivity(envelope.groupId);
      if (payload.oldPseudo !== payload.pseudo) {
        await storeSystemEvent(
          envelope.groupId,
          envelope.messageId,
          `${payload.oldPseudo} is now known as ${payload.pseudo}`,
          envelope.timestamp,
        );
      }
      return;
  }
}

async function emitAck(ackedMessageId: string, deps: PipelineDeps): Promise<void> {
  // Idempotence (§6.4): don't re-emit if this device already acked it.
  const selfPub = bytesToBase64(deps.identity.publicKeyRaw);
  const ackers = await getAckers(deps.group.groupId, ackedMessageId);
  if (ackers.includes(selfPub)) return;
  const ackEnvelope = await buildEnvelope(deps.group.groupId, deps.group.groupKey, deps.identity, {
    type: "ack",
    ackedMessageId,
  });
  await deps.send(ackEnvelope);
}

// Manual resend (§6.5): timestamp refreshed, everything else — ciphertext,
// nonce, messageId, signature — left untouched, so no re-encryption/signing
// is needed and existing recipients dedup it via seenCache as usual.
export function resendEnvelope(envelope: Envelope): Envelope {
  return { ...envelope, timestamp: Date.now() };
}
