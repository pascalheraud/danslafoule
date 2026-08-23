import { describe, expect, it } from "vitest";
import { randomBytes } from "./bytes";
import { buildEnvelope, verifyAndDecryptEnvelope } from "./crypto";
import { getOrCreateIdentity } from "./identity";
import { _resetDbForTests } from "./db";
import type { ChatPayload } from "./types";

async function freshIdentity() {
  await _resetDbForTests();
  return getOrCreateIdentity("Alice");
}

describe("buildEnvelope / verifyAndDecryptEnvelope", () => {
  it("round-trips a chat payload", async () => {
    const identity = await freshIdentity();
    const groupKey = randomBytes(32);
    const payload: ChatPayload = { type: "chat", text: "hello", replyTo: null, sentAt: Date.now() };

    const envelope = await buildEnvelope("group-1", groupKey, identity, payload);
    const result = await verifyAndDecryptEnvelope(envelope, groupKey);

    expect(result).not.toBeNull();
    expect(result?.payload).toEqual(payload);
  });

  it("rejects a tampered signature", async () => {
    const identity = await freshIdentity();
    const groupKey = randomBytes(32);
    const envelope = await buildEnvelope("group-1", groupKey, identity, {
      type: "chat",
      text: "hi",
      replyTo: null,
      sentAt: Date.now(),
    });

    const tampered = { ...envelope, signature: envelope.signature.replace(/^./, envelope.signature[0] === "A" ? "B" : "A") };

    expect(await verifyAndDecryptEnvelope(tampered, groupKey)).toBeNull();
  });

  it("rejects decryption with the wrong group key", async () => {
    const identity = await freshIdentity();
    const groupKey = randomBytes(32);
    const wrongKey = randomBytes(32);
    const envelope = await buildEnvelope("group-1", groupKey, identity, {
      type: "chat",
      text: "hi",
      replyTo: null,
      sentAt: Date.now(),
    });

    expect(await verifyAndDecryptEnvelope(envelope, wrongKey)).toBeNull();
  });

  it("rejects a well-signed envelope whose decrypted payload is not valid JSON", async () => {
    const identity = await freshIdentity();
    const groupKey = randomBytes(32);
    // Build a legit envelope then corrupt only the ciphertext after signing,
    // simulating "correctly encoded, payload not valid" at the crypto boundary.
    const envelope = await buildEnvelope("group-1", groupKey, identity, {
      type: "chat",
      text: "hi",
      replyTo: null,
      sentAt: Date.now(),
    });
    // Re-sign a nonsense ciphertext so signature verification still passes
    // but decryption fails (GCM tag mismatch) — still must resolve to null.
    const corrupted = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + "AAAA" };

    expect(await verifyAndDecryptEnvelope(corrupted, groupKey)).toBeNull();
  });

  it("rejects a decrypted payload with an unknown type", async () => {
    const identity = await freshIdentity();
    const groupKey = randomBytes(32);
    // @ts-expect-error deliberately building an invalid payload shape
    const envelope = await buildEnvelope("group-1", groupKey, identity, { type: "not-a-real-type" });

    expect(await verifyAndDecryptEnvelope(envelope, groupKey)).toBeNull();
  });

  it("rejects a decrypted chat payload missing required fields", async () => {
    const identity = await freshIdentity();
    const groupKey = randomBytes(32);
    // @ts-expect-error deliberately missing `text`
    const envelope = await buildEnvelope("group-1", groupKey, identity, { type: "chat", sentAt: Date.now() });

    expect(await verifyAndDecryptEnvelope(envelope, groupKey)).toBeNull();
  });
});
