import { describe, expect, it } from "vitest";
import { randomBytes } from "./bytes";
import { decodeInvite, encodeInvite } from "./invite";
import type { Group } from "./types";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    groupId: "a1b2c3d4-0000-0000-0000-000000000000",
    groupKey: randomBytes(32),
    createdAt: Date.now(),
    name: "Concert Été",
    paused: false,
    lastActiveAt: Date.now(),
    unreadCount: 0,
    ...overrides,
  };
}

describe("encodeInvite / decodeInvite", () => {
  it("round-trips a group, including non-ASCII names", () => {
    const group = makeGroup();

    const invite = encodeInvite(group);
    const decoded = decodeInvite(invite);

    expect(decoded).not.toBeNull();
    expect(decoded?.groupId).toBe(group.groupId);
    expect(decoded?.name).toBe(group.name);
    expect(Array.from(decoded!.groupKey)).toEqual(Array.from(group.groupKey));
  });

  it("produces a copy/paste-safe string (URL-safe alphabet only)", () => {
    const invite = encodeInvite(makeGroup());

    expect(invite).toMatch(/^dlf1:[A-Za-z0-9_-]+$/);
  });

  it("the QR-encoded string and the text-shared string are identical", () => {
    // There is only one invite format (protocol spec §4.2) — whichever
    // channel carries it (QR scan result or pasted text), decoding must
    // converge on the same Group.
    const group = makeGroup();
    const invite = encodeInvite(group);

    const fromQrScan = decodeInvite(invite);
    const fromPastedText = decodeInvite(`  ${invite}  `); // pasted text often has stray whitespace

    // Not a full toEqual: decodeInvite stamps lastActiveAt/createdAt with
    // Date.now() on each call, so two independent calls can legitimately
    // land on different milliseconds — compare the fields that actually
    // come from the invite payload itself.
    expect(fromQrScan).not.toBeNull();
    expect(fromQrScan?.groupId).toBe(fromPastedText?.groupId);
    expect(fromQrScan?.name).toBe(fromPastedText?.name);
    expect(Array.from(fromQrScan!.groupKey)).toEqual(Array.from(fromPastedText!.groupKey));
  });

  describe("rejects malformed invites", () => {
    it("wrong scheme prefix", () => {
      expect(decodeInvite("not-an-invite")).toBeNull();
    });

    it("not valid base64url after the prefix", () => {
      expect(decodeInvite("dlf1:not base64!!")).toBeNull();
    });

    it("valid base64url but not JSON", () => {
      expect(decodeInvite("dlf1:bm90LWpzb24")).toBeNull(); // "not-json"
    });

    it("unsupported version", () => {
      const badJson = JSON.stringify({ v: 2, gid: "gid", gk: "x", name: "x" });
      const base64url = btoa(badJson).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      expect(decodeInvite(`dlf1:${base64url}`)).toBeNull();
    });

    it("groupKey of the wrong length", () => {
      const badJson = JSON.stringify({ v: 1, gid: "gid", gk: btoa("too-short"), name: "x" });
      const base64url = btoa(badJson).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      expect(decodeInvite(`dlf1:${base64url}`)).toBeNull();
    });

    it("missing gid field", () => {
      const badJson = JSON.stringify({ v: 1, gk: btoa("x".repeat(32)), name: "x" });
      const base64url = btoa(badJson).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      expect(decodeInvite(`dlf1:${base64url}`)).toBeNull();
    });
  });
});
