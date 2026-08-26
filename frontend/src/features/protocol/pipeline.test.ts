import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "./bytes";
import { buildEnvelope } from "./crypto";
import { _resetDbForTests } from "./db";
import { getOrCreateIdentity } from "./identity";
import { getLocations } from "./locations";
import { getAckers, getChatMessages, getSystemEvents } from "./messages";
import { getMembers } from "./members";
import { onEnvelopeReceived, resendEnvelope } from "./pipeline";
import type { Group, Identity } from "./types";

async function setup() {
  await _resetDbForTests();
  const senderIdentity = await getOrCreateIdentity("Alice");
  const groupKey = randomBytes(32);
  const group: Group = {
    groupId: "group-1",
    groupKey,
    createdAt: Date.now(),
    name: "Test group",
    paused: false,
    lastActiveAt: Date.now(),
    unreadCount: 0,
  };
  return { senderIdentity, group };
}

async function receiverIdentity(pseudo: string): Promise<Identity> {
  await _resetDbForTests();
  return getOrCreateIdentity(pseudo);
}

describe("onEnvelopeReceived", () => {
  it("processes a chat message, stores it, and auto-emits an ack", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const envelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "chat",
      text: "hello",
      replyTo: null,
      sentAt: Date.now(),
    });
    const send = vi.fn().mockResolvedValue(undefined);

    await onEnvelopeReceived(envelope, { group, identity: receiver, send });

    const messages = await getChatMessages(group.groupId);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("hello");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("processes an announce message and records the member", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const envelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "announce",
      pseudo: "Alice",
    });

    await onEnvelopeReceived(envelope, { group, identity: receiver, send: vi.fn() });

    const members = await getMembers(group.groupId);
    expect(Object.values(members)).toEqual([{ pseudo: "Alice", lastSeen: envelope.timestamp }]);
  });

  it("synthesizes a 'joined the group' notice on the first announce from a member, not on a later one", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const firstAnnounce = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "announce",
      pseudo: "Alice",
    });
    await onEnvelopeReceived(firstAnnounce, { group, identity: receiver, send: vi.fn() });

    // A distinct envelope (different messageId, so seenCache dedup doesn't
    // hide this case) from the same already-known sender — e.g. a future
    // periodic re-announce — must not duplicate the join notice.
    const secondAnnounce = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "announce",
      pseudo: "Alice",
    });
    await onEnvelopeReceived(secondAnnounce, { group, identity: receiver, send: vi.fn() });

    const events = await getSystemEvents(group.groupId);
    expect(events).toEqual([{ messageId: firstAnnounce.messageId, text: "Alice joined the group", at: firstAnnounce.timestamp }]);
  });

  it("processes a location message with replace semantics", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const envelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "location",
      lat: 45.1,
      lon: 5.5,
      accuracy: 15,
      sentAt: Date.now(),
    });

    await onEnvelopeReceived(envelope, { group, identity: receiver, send: vi.fn() });

    const locations = await getLocations(group.groupId);
    expect(Object.keys(locations)).toHaveLength(1);
  });

  it("processes an ack message and records it, without re-emitting anything", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const envelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "ack",
      ackedMessageId: "some-message-id",
    });
    const send = vi.fn().mockResolvedValue(undefined);

    await onEnvelopeReceived(envelope, { group, identity: receiver, send });

    expect(await getAckers(group.groupId, "some-message-id")).toEqual([expect.any(String)]);
    expect(send).not.toHaveBeenCalled();
  });

  it("dedups an already-seen envelope (same messageId) without side effects", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const envelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "chat",
      text: "hello",
      replyTo: null,
      sentAt: Date.now(),
    });
    const send = vi.fn().mockResolvedValue(undefined);

    await onEnvelopeReceived(envelope, { group, identity: receiver, send });
    await onEnvelopeReceived(envelope, { group, identity: receiver, send });

    expect(await getChatMessages(group.groupId)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1); // only the first pass emits an ack
  });

  it("does not double-ack a resent envelope (idempotence, §6.4/§6.5)", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const original = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "chat",
      text: "hello",
      replyTo: null,
      sentAt: Date.now(),
    });
    const send = vi.fn().mockResolvedValue(undefined);
    await onEnvelopeReceived(original, { group, identity: receiver, send });

    // A resend keeps the same messageId — dedup via seenCache handles it,
    // so the handler-level idempotence check isn't even reached here, but
    // either way no second ack must be sent.
    const resent = resendEnvelope(original);
    await onEnvelopeReceived(resent, { group, identity: receiver, send });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("processes a rename message: updates the member's pseudo and synthesizes a system notice", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const announceEnvelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "announce",
      pseudo: "Alice",
    });
    await onEnvelopeReceived(announceEnvelope, { group, identity: receiver, send: vi.fn() });

    const renameEnvelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "rename",
      oldPseudo: "Alice",
      pseudo: "Alicia",
    });
    await onEnvelopeReceived(renameEnvelope, { group, identity: receiver, send: vi.fn() });

    const members = await getMembers(group.groupId);
    expect(Object.values(members)).toEqual([{ pseudo: "Alicia", lastSeen: renameEnvelope.timestamp }]);

    const events = await getSystemEvents(group.groupId);
    expect(events).toEqual([
      { messageId: announceEnvelope.messageId, text: "Alice joined the group", at: announceEnvelope.timestamp },
      { messageId: renameEnvelope.messageId, text: "Alice is now known as Alicia", at: renameEnvelope.timestamp },
    ]);
  });

  it("does not synthesize a system notice when oldPseudo equals the new pseudo", async () => {
    const { senderIdentity, group } = await setup();
    const receiver = await receiverIdentity("Bob");
    const renameEnvelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
      type: "rename",
      oldPseudo: "Alice",
      pseudo: "Alice",
    });

    await onEnvelopeReceived(renameEnvelope, { group, identity: receiver, send: vi.fn() });

    expect(await getSystemEvents(group.groupId)).toEqual([]);
  });

  describe("malformed input rejected end-to-end", () => {
    it("ignores an envelope for a different groupId", async () => {
      const { senderIdentity, group } = await setup();
      const receiver = await receiverIdentity("Bob");
      const envelope = await buildEnvelope("other-group", group.groupKey, senderIdentity, {
        type: "chat",
        text: "hi",
        replyTo: null,
        sentAt: Date.now(),
      });

      await onEnvelopeReceived(envelope, { group, identity: receiver, send: vi.fn() });

      expect(await getChatMessages(group.groupId)).toEqual([]);
    });

    it("ignores an envelope whose signature doesn't verify", async () => {
      const { senderIdentity, group } = await setup();
      const receiver = await receiverIdentity("Bob");
      const envelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, {
        type: "chat",
        text: "hi",
        replyTo: null,
        sentAt: Date.now(),
      });
      const replacement = envelope.signature[0] === "A" ? "B" : "A";
      const tampered = { ...envelope, signature: replacement + envelope.signature.slice(1) };

      await onEnvelopeReceived(tampered, { group, identity: receiver, send: vi.fn() });

      expect(await getChatMessages(group.groupId)).toEqual([]);
    });

    it("ignores an envelope whose decrypted payload doesn't validate", async () => {
      const { senderIdentity, group } = await setup();
      const receiver = await receiverIdentity("Bob");
      // @ts-expect-error deliberately malformed payload
      const envelope = await buildEnvelope(group.groupId, group.groupKey, senderIdentity, { type: "chat" });

      await onEnvelopeReceived(envelope, { group, identity: receiver, send: vi.fn() });

      expect(await getChatMessages(group.groupId)).toEqual([]);
      expect(await getMembers(group.groupId)).toEqual({});
    });
  });
});
