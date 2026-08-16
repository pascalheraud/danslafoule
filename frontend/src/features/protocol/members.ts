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

export async function recordAnnounce(groupId: string, senderPub: string, pseudo: string, seenAt: number): Promise<void> {
  const all = await loadAll();
  const group = all[groupId] ?? {};
  group[senderPub] = { pseudo, lastSeen: seenAt };
  all[groupId] = group;
  await saveAll(all);
}

export async function getMembers(groupId: string): Promise<Record<string, Member>> {
  return (await loadAll())[groupId] ?? {};
}
