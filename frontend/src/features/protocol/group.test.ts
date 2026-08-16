import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests } from "./db";
import { createGroup, getGroup, listGroups, saveJoinedGroup } from "./group";
import { decodeInvite, encodeInvite } from "./invite";

beforeEach(async () => {
  await _resetDbForTests();
});

describe("createGroup", () => {
  it("creates a group with a fresh 32-byte key and persists it", async () => {
    const group = await createGroup("Concert X");

    expect(group.groupKey).toHaveLength(32);
    const stored = await getGroup(group.groupId);
    expect(stored?.groupId).toBe(group.groupId);
    expect(stored?.name).toBe(group.name);
    expect(Array.from(stored!.groupKey)).toEqual(Array.from(group.groupKey));
  });
});

describe("join path via invite (either QR or pasted text)", () => {
  it("both join paths converge on the same stored Group", async () => {
    const created = await createGroup("Concert X");
    const invite = encodeInvite(created);

    // Second device: decode the invite (source doesn't matter) then join.
    const decoded = decodeInvite(invite);
    expect(decoded).not.toBeNull();
    await saveJoinedGroup(decoded!);

    const stored = await getGroup(created.groupId);
    expect(stored?.groupId).toBe(created.groupId);
    expect(Array.from(stored!.groupKey)).toEqual(Array.from(created.groupKey));
  });
});

describe("listGroups", () => {
  it("lists all created/joined groups", async () => {
    const a = await createGroup("A");
    const b = await createGroup("B");

    const groups = await listGroups();
    expect(groups.map((g) => g.groupId).sort()).toEqual([a.groupId, b.groupId].sort());
  });
});
