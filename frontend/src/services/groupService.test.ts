import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetDbForTests } from "../features/protocol/db";
import { INACTIVITY_PAUSE_MS, createGroup, getInvite, joinGroupByInvite, listGroups, setGroupPaused } from "./groupService";

afterEach(async () => {
  vi.useRealTimers();
  await _resetDbForTests();
});

describe("groupService", () => {
  it("creates a group locally and returns a shareable invite", async () => {
    const { group, invite } = await createGroup("Crew");

    expect(group.name).toBe("Crew");
    expect(invite).toMatch(/^dlf1:/);
    await expect(listGroups()).resolves.toEqual([group]);
  });

  it("joins a group from an invite (as if pasted from SMS/WhatsApp)", async () => {
    const { invite, group: created } = await createGroup("Crew");

    // Simulates a second device: only the invite string travels, never the
    // Group object itself — reset local storage so the creator's own copy
    // of the group doesn't make this look like an already-known group.
    await _resetDbForTests();
    const joined = await joinGroupByInvite(invite);

    expect(joined).toEqual({
      group: { groupId: created.groupId, name: "Crew", paused: false, unreadCount: 0 },
      alreadyMember: false,
    });
  });

  it("rejects a malformed invite", async () => {
    await expect(joinGroupByInvite("not-an-invite")).resolves.toBeNull();
  });

  it("joining an already-known group is idempotent and reports alreadyMember", async () => {
    const { invite, group: created } = await createGroup("Crew");

    await joinGroupByInvite(invite);
    const rejoined = await joinGroupByInvite(invite);

    expect(rejoined).toEqual({
      group: { groupId: created.groupId, name: "Crew", paused: false, unreadCount: 0 },
      alreadyMember: true,
    });
    await expect(listGroups()).resolves.toEqual([
      { groupId: created.groupId, name: "Crew", paused: false, unreadCount: 0 },
    ]);
  });

  it("getInvite regenerates a valid invite for a known group, null otherwise", async () => {
    const { group } = await createGroup("Crew");

    const invite = await getInvite(group.groupId);
    expect(invite).toMatch(/^dlf1:/);
    expect(await joinGroupByInvite(invite!)).toEqual({ group, alreadyMember: true });

    expect(await getInvite("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  describe("inactivity pause", () => {
    it("stays unpaused while within the inactivity window", async () => {
      const { group } = await createGroup("Crew");

      const [listed] = await listGroups();
      expect(listed.groupId).toBe(group.groupId);
      expect(listed.paused).toBe(false);
    });

    it("auto-pauses once a group has had no activity for over an hour", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      await createGroup("Crew");

      vi.advanceTimersByTime(INACTIVITY_PAUSE_MS + 1);
      const [listed] = await listGroups();

      expect(listed.paused).toBe(true);
    });

    it("setGroupPaused manually resumes a group (always wins over auto-pause)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { group } = await createGroup("Crew");
      vi.advanceTimersByTime(INACTIVITY_PAUSE_MS + 1);
      await listGroups(); // triggers the auto-pause

      const resumed = await setGroupPaused(group.groupId, false);

      expect(resumed?.paused).toBe(false);
      const [listed] = await listGroups();
      expect(listed.paused).toBe(false);
    });

    it("setGroupPaused returns null for an unknown group", async () => {
      await expect(setGroupPaused("00000000-0000-0000-0000-000000000000", true)).resolves.toBeNull();
    });
  });
});
