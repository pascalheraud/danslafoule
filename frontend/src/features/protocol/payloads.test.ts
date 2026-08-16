import { describe, expect, it } from "vitest";
import {
  parseAckPayload,
  parseAnnouncePayload,
  parseChatPayload,
  parseLocationPayload,
  parsePayload,
  parseRenamePayload,
} from "./payloads";

describe("parsePayload dispatch", () => {
  it("returns null for a non-object value", () => {
    expect(parsePayload("just a string")).toBeNull();
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload(42)).toBeNull();
  });

  it("returns null for an unknown type", () => {
    expect(parsePayload({ type: "unknown-type", foo: "bar" })).toBeNull();
  });

  it("returns null when type is missing", () => {
    expect(parsePayload({ text: "hi" })).toBeNull();
  });
});

describe("parseAnnouncePayload", () => {
  it("accepts a valid payload", () => {
    expect(parseAnnouncePayload({ type: "announce", pseudo: "Alice" })).toEqual({ type: "announce", pseudo: "Alice" });
  });

  it("rejects missing pseudo", () => {
    expect(parseAnnouncePayload({ type: "announce" })).toBeNull();
  });

  it("rejects empty pseudo", () => {
    expect(parseAnnouncePayload({ type: "announce", pseudo: "" })).toBeNull();
  });

  it("rejects wrong-type pseudo", () => {
    expect(parseAnnouncePayload({ type: "announce", pseudo: 123 })).toBeNull();
  });
});

describe("parseChatPayload", () => {
  it("accepts a valid payload", () => {
    const payload = { type: "chat", text: "hi", replyTo: null, sentAt: 1000 };
    expect(parseChatPayload(payload)).toEqual(payload);
  });

  it("accepts a valid replyTo string", () => {
    const payload = { type: "chat", text: "hi", replyTo: "abc", sentAt: 1000 };
    expect(parseChatPayload(payload)).toEqual(payload);
  });

  it("rejects missing text", () => {
    expect(parseChatPayload({ type: "chat", replyTo: null, sentAt: 1000 })).toBeNull();
  });

  it("rejects empty text", () => {
    expect(parseChatPayload({ type: "chat", text: "", replyTo: null, sentAt: 1000 })).toBeNull();
  });

  it("rejects wrong-type replyTo", () => {
    expect(parseChatPayload({ type: "chat", text: "hi", replyTo: 5, sentAt: 1000 })).toBeNull();
  });

  it("rejects missing sentAt", () => {
    expect(parseChatPayload({ type: "chat", text: "hi", replyTo: null })).toBeNull();
  });

  it("rejects non-finite sentAt", () => {
    expect(parseChatPayload({ type: "chat", text: "hi", replyTo: null, sentAt: Number.NaN })).toBeNull();
  });
});

describe("parseLocationPayload", () => {
  it("accepts a valid payload", () => {
    const payload = { type: "location", lat: 45.1, lon: 5.5, accuracy: 15, sentAt: 1000 };
    expect(parseLocationPayload(payload)).toEqual(payload);
  });

  it("rejects out-of-range latitude", () => {
    expect(parseLocationPayload({ type: "location", lat: 200, lon: 5.5, accuracy: 15, sentAt: 1000 })).toBeNull();
  });

  it("rejects out-of-range longitude", () => {
    expect(parseLocationPayload({ type: "location", lat: 45.1, lon: -200, accuracy: 15, sentAt: 1000 })).toBeNull();
  });

  it("rejects negative accuracy", () => {
    expect(parseLocationPayload({ type: "location", lat: 45.1, lon: 5.5, accuracy: -1, sentAt: 1000 })).toBeNull();
  });

  it("rejects missing sentAt", () => {
    expect(parseLocationPayload({ type: "location", lat: 45.1, lon: 5.5, accuracy: 15 })).toBeNull();
  });
});

describe("parseAckPayload", () => {
  it("accepts a valid payload", () => {
    expect(parseAckPayload({ type: "ack", ackedMessageId: "abc" })).toEqual({ type: "ack", ackedMessageId: "abc" });
  });

  it("rejects missing ackedMessageId", () => {
    expect(parseAckPayload({ type: "ack" })).toBeNull();
  });

  it("rejects empty ackedMessageId", () => {
    expect(parseAckPayload({ type: "ack", ackedMessageId: "" })).toBeNull();
  });
});

describe("parseRenamePayload", () => {
  it("accepts a valid payload", () => {
    const payload = { type: "rename", oldPseudo: "Alice", pseudo: "Bob" };
    expect(parseRenamePayload(payload)).toEqual(payload);
  });

  it("rejects missing pseudo", () => {
    expect(parseRenamePayload({ type: "rename", oldPseudo: "Alice" })).toBeNull();
  });

  it("rejects missing oldPseudo", () => {
    expect(parseRenamePayload({ type: "rename", pseudo: "Bob" })).toBeNull();
  });

  it("rejects empty pseudo or oldPseudo", () => {
    expect(parseRenamePayload({ type: "rename", oldPseudo: "", pseudo: "Bob" })).toBeNull();
    expect(parseRenamePayload({ type: "rename", oldPseudo: "Alice", pseudo: "" })).toBeNull();
  });
});
