import { randomBytes } from "./bytes";
import { dbGet, dbSet } from "./db";
import type { Group } from "./types";

const GROUPS_KEY = "all";

type GroupMap = Record<string, Group>;

async function loadGroups(): Promise<GroupMap> {
  return (await dbGet<GroupMap>("groups", GROUPS_KEY)) ?? {};
}

async function saveGroups(groups: GroupMap): Promise<void> {
  await dbSet("groups", GROUPS_KEY, groups);
}

export async function createGroup(name: string): Promise<Group> {
  const now = Date.now();
  const group: Group = {
    groupId: crypto.randomUUID(),
    groupKey: randomBytes(32),
    createdAt: now,
    name,
    paused: false,
    lastActiveAt: now,
    unreadCount: 0,
  };
  const groups = await loadGroups();
  groups[group.groupId] = group;
  await saveGroups(groups);
  return group;
}

// Used by both join paths (QR scan and text-invite paste, protocol spec
// §4.3) once the invite string has been decoded into a Group.
export async function saveJoinedGroup(group: Group): Promise<void> {
  const groups = await loadGroups();
  groups[group.groupId] = group;
  await saveGroups(groups);
}

export async function getGroup(groupId: string): Promise<Group | undefined> {
  return (await loadGroups())[groupId];
}

export async function listGroups(): Promise<Group[]> {
  return Object.values(await loadGroups());
}

// Sets the sticky paused flag directly (protocol-agnostic; the "auto-pause
// after 1h of silence" policy lives in services/groupService.ts, which
// decides *when* to call this — this function only persists the value).
// Resuming (paused: false) also counts as activity — see Group.lastActiveAt.
export async function setGroupPaused(groupId: string, paused: boolean): Promise<Group | undefined> {
  const groups = await loadGroups();
  const group = groups[groupId];
  if (!group) return undefined;
  const updated: Group = { ...group, paused, lastActiveAt: paused ? group.lastActiveAt : Date.now() };
  groups[groupId] = updated;
  await saveGroups(groups);
  return updated;
}

// Marks the group as having just seen activity (a sent or received
// message) — resets the inactivity clock without touching `paused` itself
// (an auto-paused group only resumes via an explicit setGroupPaused call).
export async function touchGroupActivity(groupId: string, at: number = Date.now()): Promise<void> {
  const groups = await loadGroups();
  const group = groups[groupId];
  if (!group) return;
  groups[groupId] = { ...group, lastActiveAt: at };
  await saveGroups(groups);
}

// Called by pipeline.ts on every received chat/location message, regardless
// of whether a screen for this group happens to be open — so the count is
// correct even for groups the user isn't currently looking at (shown in the
// app menu). GroupScreen clears it once the user has actually seen the
// bottom of the conversation (see clearUnreadCount).
export async function incrementUnreadCount(groupId: string, by = 1): Promise<void> {
  const groups = await loadGroups();
  const group = groups[groupId];
  if (!group) return;
  groups[groupId] = { ...group, unreadCount: group.unreadCount + by };
  await saveGroups(groups);
}

export async function clearUnreadCount(groupId: string): Promise<void> {
  const groups = await loadGroups();
  const group = groups[groupId];
  if (!group || group.unreadCount === 0) return;
  groups[groupId] = { ...group, unreadCount: 0 };
  await saveGroups(groups);
}
