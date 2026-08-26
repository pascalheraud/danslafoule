import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "../features/protocol/bytes";
import { buildEnvelope } from "../features/protocol/crypto";
import { _resetDbForTests } from "../features/protocol/db";
import { getGroup } from "../features/protocol/group";
import { getOrCreateIdentity } from "../features/protocol/identity";
import type { Identity } from "../features/protocol/types";
import type { Envelope } from "../features/protocol/types";
import { createGroup } from "./groupService";
import {
  _resetSyncWatermarksForTests,
  announce,
  broadcastRename,
  flushOutboxes,
  getMessages,
  queueChatMessage,
  syncMessages,
} from "./messageService";

// sendChatMessage's old synchronous-POST behavior, rebuilt on top of the
// offline-first queue (queueChatMessage stores locally + enqueues,
// flushOutboxes does the actual POST) — keeps the existing tests' shape
// (assert on what got POSTed) without re-deriving that flow in every test.
async function sendChatMessage(groupId: string, text: string): Promise<void> {
  await queueChatMessage(groupId, text);
  await flushOutboxes();
}

// Mirrors the real GET response shape (see message_service.py): the server's
// opaque cursor, never envelope.timestamp, is what syncMessages must watermark on.
let nextCursor = 1;
function received(envelope: Envelope) {
  return { envelope, cursor: nextCursor++ };
}

interface StubHandlers {
  post?: (body: Record<string, unknown>) => void;
  get?: () => unknown[];
}

function stubFetch(handlers: StubHandlers) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        handlers.post?.(JSON.parse(init.body as string));
        return { ok: true, status: 201, json: async () => ({ status: "accepted" }) };
      }
      return { ok: true, status: 200, json: async () => handlers.get?.() ?? [] };
    }),
  );
}

async function makePeerIdentity(pseudo: string): Promise<Identity> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, publicKeyRaw, pseudo };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSyncWatermarksForTests();
  await _resetDbForTests();
});

describe("messageService", () => {
  it("sendChatMessage posts a real, encrypted protocol envelope for the group", async () => {
    const { group } = await createGroup("Crew");
    let posted: Record<string, unknown> | undefined;
    stubFetch({ post: (body) => (posted = body) });

    await sendChatMessage(group.groupId, "hello");

    expect(posted?.groupId).toBe(group.groupId);
    expect(posted?.v).toBe(1);
    expect(posted?.ciphertext).not.toContain("hello"); // never sent in the clear
  });

  it("announce posts an envelope carrying the local identity's public key and pseudo", async () => {
    const { group } = await createGroup("Crew");
    const identity = await getOrCreateIdentity("Alice");
    let posted: Record<string, unknown> | undefined;
    stubFetch({ post: (body) => (posted = body) });

    await announce(group.groupId);

    expect(posted?.senderPub).toBe(bytesToBase64(identity.publicKeyRaw));
  });

  it("sendChatMessage rejects for a group this device doesn't know", async () => {
    await expect(sendChatMessage("00000000-0000-0000-0000-000000000000", "hi")).rejects.toThrow();
  });

  it("syncMessages ingests a peer's chat and getMessages resolves their pseudo via a prior announce", async () => {
    const { group: summary } = await createGroup("Crew");
    const fullGroup = (await getGroup(summary.groupId))!;
    const peer = await makePeerIdentity("Bob");

    const announceEnvelope = await buildEnvelope(fullGroup.groupId, fullGroup.groupKey, peer, {
      type: "announce",
      pseudo: "Bob",
    });
    const chatEnvelope = await buildEnvelope(fullGroup.groupId, fullGroup.groupKey, peer, {
      type: "chat",
      text: "hi from Bob",
      replyTo: null,
      sentAt: Date.now(),
    });
    stubFetch({ get: () => [received(announceEnvelope), received(chatEnvelope)] });

    await syncMessages(fullGroup.groupId);
    const messages = await getMessages(fullGroup.groupId);

    // Also carries the "Bob joined the group" system notice synthesized from
    // the announce — see pipeline.test.ts for that behavior directly.
    expect(messages).toHaveLength(2);
    const message = messages.find((m) => m.kind === "chat");
    if (!message || message.kind !== "chat") throw new Error("expected a chat message");
    expect(message.text).toBe("hi from Bob");
    expect(message.authorName).toBe("Bob");
    expect(message.isSelf).toBe(false);
  });

  it("a message this device sent itself round-trips through sync and is marked isSelf", async () => {
    const { group } = await createGroup("Crew");
    let posted: Record<string, unknown> | undefined;
    stubFetch({ post: (body) => (posted = body) });
    await sendChatMessage(group.groupId, "hello from me");

    stubFetch({ get: () => [received(posted as unknown as Envelope)] });
    await syncMessages(group.groupId);
    const messages = await getMessages(group.groupId);

    expect(messages).toHaveLength(1);
    const [message] = messages;
    if (message.kind !== "chat") throw new Error("expected a chat message");
    expect(message.authorName).toBe("You");
    expect(message.isSelf).toBe(true);
  });

  it("falls back to a shortened pubkey when no announce was seen for the sender", async () => {
    const { group: summary } = await createGroup("Crew");
    const fullGroup = (await getGroup(summary.groupId))!;
    const peer = await makePeerIdentity("Bob");
    const chatEnvelope = await buildEnvelope(fullGroup.groupId, fullGroup.groupKey, peer, {
      type: "chat",
      text: "hi, no announce sent",
      replyTo: null,
      sentAt: Date.now(),
    });
    stubFetch({ get: () => [received(chatEnvelope)] });

    await syncMessages(fullGroup.groupId);
    const messages = await getMessages(fullGroup.groupId);

    const [message] = messages;
    if (message.kind !== "chat") throw new Error("expected a chat message");
    expect(message.authorName).toBe(bytesToBase64(peer.publicKeyRaw).slice(0, 8));
  });

  it("broadcastRename sends a rename envelope to every group this device belongs to", async () => {
    const { group: groupA } = await createGroup("Crew A");
    const { group: groupB } = await createGroup("Crew B");
    const posted: Record<string, unknown>[] = [];
    stubFetch({ post: (body) => void posted.push(body) });

    await broadcastRename("Alice", "Alicia");

    expect(posted).toHaveLength(2);
    const groupIds = posted.map((envelope) => envelope.groupId).sort();
    expect(groupIds).toEqual([groupA.groupId, groupB.groupId].sort());
    // Content is opaque ciphertext, not asserted here — payload shape is
    // covered by payloads.test.ts/pipeline.test.ts.
  });

  it("broadcastRename is a no-op when this device has no groups", async () => {
    const posted: Record<string, unknown>[] = [];
    stubFetch({ post: (body) => void posted.push(body) });

    await broadcastRename("Alice", "Alicia");

    expect(posted).toHaveLength(0);
  });
});
