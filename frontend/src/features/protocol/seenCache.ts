import { dbGet, dbSet } from "./db";

type SeenByGroup = Record<string, Record<string, number>>; // groupId -> messageId -> expiresAt

// Matches the server's fixed 1h purge horizon (§8.3), decoupled from any
// group setting — purely a local dedup window (§7.4/§9), not a freshness rule.
const TTL_MS = 60 * 60 * 1000;

async function loadAll(): Promise<SeenByGroup> {
  return (await dbGet<SeenByGroup>("seenCache", "all")) ?? {};
}
async function saveAll(data: SeenByGroup): Promise<void> {
  await dbSet("seenCache", "all", data);
}

export async function hasSeen(groupId: string, messageId: string, now = Date.now()): Promise<boolean> {
  const expiresAt = (await loadAll())[groupId]?.[messageId];
  return expiresAt !== undefined && expiresAt > now;
}

export async function markSeen(groupId: string, messageId: string, now = Date.now()): Promise<void> {
  const all = await loadAll();
  const group = all[groupId] ?? {};
  group[messageId] = now + TTL_MS;
  all[groupId] = group;
  await saveAll(all);
}
