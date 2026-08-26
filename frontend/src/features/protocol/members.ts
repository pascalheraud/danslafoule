import { dbGet, dbSet } from "./db";

export interface Member {
  pseudo: string;
  lastSeen: number;
}

type MembersByGroup = Record<string, Record<string, Member>>; // groupId -> senderPub -> Member

async function loadAll(): Promise<MembersByGroup> {
  return (await dbGet<MembersByGroup>("members", "all")) ?? {};
}

async function saveAll(data: MembersByGroup): Promise<void> {
  await dbSet("members", "all", data);
}

// Returns true the first time this pubkey is seen in the group (a join,
// not just a later activity/rename update) — pipeline.ts uses this to
// synthesize a one-time "X joined the group" system notice.
export async function recordAnnounce(
  groupId: string,
  senderPub: string,
  pseudo: string,
  seenAt: number,
): Promise<boolean> {
  const all = await loadAll();
  const group = all[groupId] ?? {};
  const isNew = !(senderPub in group);
  group[senderPub] = { pseudo, lastSeen: seenAt };
  all[groupId] = group;
  await saveAll(all);
  return isNew;
}

export async function getMembers(groupId: string): Promise<Record<string, Member>> {
  return (await loadAll())[groupId] ?? {};
}
