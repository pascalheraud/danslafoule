import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests } from "./db";
import { getAckers, getChatMessages, recordAck, storeChatMessage } from "./messages";
import type { ChatPayload } from "./types";

beforeEach(async () => {
  await _resetDbForTests();
});

const payload: ChatPayload = { type: "chat", text: "hello", replyTo: null, sentAt: 1000 };

describe("storeChatMessage", () => {
  it("stores a new message", async () => {
    await storeChatMessage("group-1", "pub-a", "msg-1", payload);

    expect(await getChatMessages("group-1")).toEqual([
      { messageId: "msg-1", senderPub: "pub-a", text: "hello", replyTo: null, sentAt: 1000 },
    ]);
  });

  it("dedups by messageId (resend/rebroadcast, §6.5)", async () => {
    await storeChatMessage("group-1", "pub-a", "msg-1", payload);
    await storeChatMessage("group-1", "pub-a", "msg-1", { ...payload, text: "different text, same id" });

    const messages = await getChatMessages("group-1");
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("hello");
  });
});

describe("recordAck", () => {
  it("returns true and records the first ack from a given acker", async () => {
    expect(await recordAck("group-1", "msg-1", "pub-bob")).toBe(true);
    expect(await getAckers("group-1", "msg-1")).toEqual(["pub-bob"]);
  });

  it("returns false and doesn't duplicate on a repeat ack (idempotence, §6.4)", async () => {
    await recordAck("group-1", "msg-1", "pub-bob");

    expect(await recordAck("group-1", "msg-1", "pub-bob")).toBe(false);
    expect(await getAckers("group-1", "msg-1")).toEqual(["pub-bob"]);
  });

  it("tracks multiple distinct ackers", async () => {
    await recordAck("group-1", "msg-1", "pub-bob");
    await recordAck("group-1", "msg-1", "pub-carol");

    expect(await getAckers("group-1", "msg-1")).toEqual(["pub-bob", "pub-carol"]);
  });
});
