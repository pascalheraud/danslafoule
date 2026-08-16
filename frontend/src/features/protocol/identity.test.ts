import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests } from "./db";
import { getOrCreateIdentity, shortId } from "./identity";

beforeEach(async () => {
  await _resetDbForTests();
});

describe("getOrCreateIdentity", () => {
  it("creates and persists an identity on first call", async () => {
    const identity = await getOrCreateIdentity("Alice");

    expect(identity.pseudo).toBe("Alice");
    expect(identity.publicKeyRaw).toHaveLength(32);
  });

  it("returns the same identity (same public key) on subsequent calls", async () => {
    const first = await getOrCreateIdentity("Alice");
    const second = await getOrCreateIdentity("ignored default, restored instead");

    expect(Array.from(second.publicKeyRaw)).toEqual(Array.from(first.publicKeyRaw));
    expect(second.pseudo).toBe("Alice");
  });
});

describe("shortId", () => {
  it("is stable for the same public key", async () => {
    const identity = await getOrCreateIdentity("Alice");

    const a = await shortId(identity.publicKeyRaw);
    const b = await shortId(identity.publicKeyRaw);

    expect(a).toBe(b);
    expect(a).toHaveLength(8);
  });

  it("differs for different public keys", async () => {
    const alice = await getOrCreateIdentity("Alice");
    await _resetDbForTests();
    const bob = await getOrCreateIdentity("Bob");

    expect(await shortId(alice.publicKeyRaw)).not.toBe(await shortId(bob.publicKeyRaw));
  });
});
