import { localCache } from "./localCache";
import type { GroupSummary } from "./types";

export function listGroups(): Promise<GroupSummary[]> {
  return localCache.getGroups();
}

export async function createGroup(name: string): Promise<GroupSummary> {
  const group: GroupSummary = { uuid: crypto.randomUUID(), name };
  await localCache.upsertGroup(group);
  return group;
}

export async function joinGroup(groupUuid: string): Promise<GroupSummary> {
  const group: GroupSummary = { uuid: groupUuid, name: null };
  const groups = await localCache.upsertGroup(group);
  return groups.find((g) => g.uuid === groupUuid) ?? group;
}
