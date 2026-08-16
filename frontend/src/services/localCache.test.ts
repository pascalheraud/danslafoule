import { beforeEach, describe, expect, it } from "vitest";
import { _resetCacheForTests, localCache } from "./localCache";
import type { Message } from "./types";

describe("localCache", () => {
  beforeEach(async () => {
    await _resetCacheForTests();
  });

  it("stores and retrieves a profile", async () => {
    await localCache.setProfile({ uuid: "u1", name: "Alice" });

    await expect(localCache.getProfile()).resolves.toEqual({ uuid: "u1", name: "Alice" });
  });

  it("returns null when no profile is cached", async () => {
    await expect(localCache.getProfile()).resolves.toBeNull();
  });

  it("upserts a new group and keeps an existing group's known name", async () => {
    await localCache.upsertGroup({ uuid: "g1", name: null });
    await localCache.upsertGroup({ uuid: "g1", name: "Crew" });
    const afterLearning = await localCache.getGroups();

    await localCache.upsertGroup({ uuid: "g1", name: "" });
    const afterEmptyName = await localCache.getGroups();

    expect(afterLearning).toEqual([{ uuid: "g1", name: "Crew" }]);
    expect(afterEmptyName).toEqual([{ uuid: "g1", name: "Crew" }]);
  });

  it("merges and deduplicates messages by uuid, sorted by receivedAt", async () => {
    const first: Message = {
      uuid: "m2",
      groupUuid: "g1",
      groupName: "Crew",
      authorUuid: "a",
      authorName: "A",
      text: "second",
      receivedAt: "2026-01-02",
    };
    const second: Message = {
      uuid: "m1",
      groupUuid: "g1",
      groupName: "Crew",
      authorUuid: "a",
      authorName: "A",
      text: "first",
      receivedAt: "2026-01-01",
    };

    await localCache.addMessage(first);
    const merged = await localCache.addMessage(second);

    expect(merged.map((m) => m.uuid)).toEqual(["m1", "m2"]);
  });

  it("is idempotent when adding the same message twice", async () => {
    const message: Message = {
      uuid: "m1",
      groupUuid: "g1",
      groupName: "Crew",
      authorUuid: "a",
      authorName: "A",
      text: "hi",
      receivedAt: "2026-01-01",
    };

    await localCache.addMessage(message);
    const afterSecondAdd = await localCache.addMessage(message);

    expect(afterSecondAdd).toEqual([message]);
  });
});
