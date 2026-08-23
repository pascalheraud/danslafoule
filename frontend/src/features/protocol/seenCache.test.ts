import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests } from "./db";
import { hasSeen, markSeen } from "./seenCache";

beforeEach(async () => {
  await _resetDbForTests();
});

describe("seenCache", () => {
  it("reports unseen messageIds as not seen", async () => {
    expect(await hasSeen("group-1", "msg-1")).toBe(false);
  });

  it("reports a marked messageId as seen before its TTL expires", async () => {
    await markSeen("group-1", "msg-1", 1_000_000);

    expect(await hasSeen("group-1", "msg-1", 1_000_000 + 1_000)).toBe(true);
  });

  it("reports a marked messageId as no longer seen after its TTL expires", async () => {
    await markSeen("group-1", "msg-1", 1_000_000);

    const oneHourAndOneMsLater = 1_000_000 + 60 * 60 * 1000 + 1;
    expect(await hasSeen("group-1", "msg-1", oneHourAndOneMsLater)).toBe(false);
  });

  it("scopes seen state per group", async () => {
    await markSeen("group-1", "msg-1", 1_000_000);

    expect(await hasSeen("group-2", "msg-1", 1_000_000)).toBe(false);
  });
});
