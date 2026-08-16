import {
  clearUnreadCount as clearProtocolUnreadCount,
  createGroup as createProtocolGroup,
  getGroup,
  listGroups as listProtocolGroups,
  saveJoinedGroup,
  setGroupPaused as setProtocolGroupPaused,
} from "../features/protocol/group";
import { decodeInvite, encodeInvite } from "../features/protocol/invite";
import type { Group } from "../features/protocol/types";
import type { GroupSummary } from "./types";

// Client-side inactivity pause: a group with no activity for this long
// auto-pauses (stops being polled) until the user manually resumes it.
export const INACTIVITY_PAUSE_MS = 60 * 60 * 1000;

function toSummary(group: Group): GroupSummary {
  return { groupId: group.groupId, name: group.name, paused: group.paused, unreadCount: group.unreadCount };
}

// Auto-pause is one-directional: it only ever flips paused false -> true on
// detected silence (group.lastActiveAt, kept fresh by group.ts/pipeline.ts/
// messageService.ts on create/join/manual-resume/send/receive). Resuming
// (true -> false) is always an explicit user action (see setGroupPaused
// below), never inferred here.
async function withAutoPause(group: Group): Promise<Group> {
  if (group.paused) return group;
  if (Date.now() - group.lastActiveAt < INACTIVITY_PAUSE_MS) return group;
  return (await setProtocolGroupPaused(group.groupId, true)) ?? group;
}

export async function listGroups(): Promise<GroupSummary[]> {
  const groups = await listProtocolGroups();
  const withPauseChecked = await Promise.all(groups.map(withAutoPause));
  return withPauseChecked.map(toSummary);
}

export interface CreatedGroup {
  group: GroupSummary;
  invite: string;
}

export async function createGroup(name: string): Promise<CreatedGroup> {
  const group = await createProtocolGroup(name);
  return { group: toSummary(group), invite: encodeInvite(group) };
}

export interface JoinedGroup {
  group: GroupSummary;
  // True when this device already knew the group (created or previously
  // joined) before this call — lets the caller skip the "you joined!"
  // fanfare (re-announcing, etc.) and tell the user they're already in.
  alreadyMember: boolean;
}

// Accepts an invite string, shared via QR code or as plain text (SMS,
// WhatsApp, copy-paste — protocol spec §4.2/§4.3), not a bare group id:
// joining requires the groupKey the invite carries, a bare id can't decrypt
// anything. Returns null on a malformed/unrecognized invite.
export async function joinGroupByInvite(invite: string): Promise<JoinedGroup | null> {
  const decoded = decodeInvite(invite);
  if (!decoded) return null;
  const existing = await getGroup(decoded.groupId);
  if (existing) return { group: toSummary(existing), alreadyMember: true };
  await saveJoinedGroup(decoded);
  return { group: toSummary(decoded), alreadyMember: false };
}

export async function getInvite(groupId: string): Promise<string | null> {
  const group = await getGroup(groupId);
  return group ? encodeInvite(group) : null;
}

// Manual play/pause toggle (group list) — always wins over auto-pause,
// including resuming: the next poll simply resumes fetching for this group.
export async function setGroupPaused(groupId: string, paused: boolean): Promise<GroupSummary | null> {
  const group = await setProtocolGroupPaused(groupId, paused);
  return group ? toSummary(group) : null;
}

// Called by GroupScreen once the user has actually seen the bottom of the
// conversation (scroll state "auto") — the unread count itself is
// incremented by the protocol pipeline on receipt, regardless of which
// screen (if any) is open, see features/protocol/pipeline.ts.
export async function clearUnreadCount(groupId: string): Promise<void> {
  await clearProtocolUnreadCount(groupId);
}
