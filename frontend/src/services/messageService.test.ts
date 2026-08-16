import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroup } from "./groupService";
import { _resetCacheForTests, localCache } from "./localCache";
import { sendMessage, syncMessages } from "./messageService";

function stubFetch(impl: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => impl(url, init),
    })),
  );
}

describe("messageService", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await _resetCacheForTests();
  });

  it("sendMessage posts an encoded envelope and stores the result locally", async () => {
    stubFetch((_url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { uuid: string; content: string };
        return { uuid: body.uuid, content: body.content, received_at: "2026-01-01T00:00:00Z" };
      }
      return [];
    });

    const message = await sendMessage({
      groupUuid: "g1",
      groupName: "Crew",
      authorUuid: "u1",
      authorName: "Alice",
      text: "hi",
    });

    expect(message.text).toBe("hi");
    expect(message.receivedAt).toBe("2026-01-01T00:00:00Z");
    await expect(localCache.getMessages("g1")).resolves.toEqual([message]);
  });

  it("syncMessages stores only messages belonging to a locally known group", async () => {
    const known = await createGroup("Crew");
    const knownEnvelope = JSON.stringify({
      groupUuid: known.uuid,
      groupName: "Crew",
      authorUuid: "u1",
      authorName: "Alice",
      text: "for my group",
    });
    const unknownEnvelope = JSON.stringify({
      groupUuid: "some-other-group",
      groupName: "Other",
      authorUuid: "u2",
      authorName: "Bob",
      text: "not for me",
    });
    stubFetch(() => [
      { uuid: "m1", content: knownEnvelope, received_at: "2026-01-01T00:00:00Z" },
      { uuid: "m2", content: unknownEnvelope, received_at: "2026-01-01T00:00:01Z" },
    ]);

    await syncMessages();

    const stored = await localCache.getMessages(known.uuid);
    expect(stored.map((m) => m.uuid)).toEqual(["m1"]);
    await expect(localCache.getMessages("some-other-group")).resolves.toEqual([]);
  });

  it("syncMessages advances the watermark past every fetched message", async () => {
    stubFetch(() => [{ uuid: "m1", content: "not json", received_at: "2026-01-01T00:00:05Z" }]);

    await syncMessages();

    await expect(localCache.getWatermark()).resolves.toBe("2026-01-01T00:00:05Z");
  });

  it("syncMessages passes the stored watermark as the since query parameter", async () => {
    await localCache.setWatermark("2026-01-01T00:00:00Z");
    let requestedUrl = "";
    stubFetch((url) => {
      requestedUrl = url;
      return [];
    });

    await syncMessages();

    expect(requestedUrl).toContain("since=2026-01-01T00%3A00%3A00Z");
  });
});
