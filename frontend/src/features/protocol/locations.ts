import { dbGet, dbSet } from "./db";
import type { LocationPayload } from "./types";

export interface StoredLocation {
  lat: number;
  lon: number;
  accuracy: number;
  sentAt: number;
}

type LocationsByGroup = Record<string, Record<string, StoredLocation>>; // groupId -> senderPub -> location

async function loadAll(): Promise<LocationsByGroup> {
  return (await dbGet<LocationsByGroup>("locations", "all")) ?? {};
}
async function saveAll(data: LocationsByGroup): Promise<void> {
  await dbSet("locations", "all", data);
}

// Replaces, doesn't accumulate (protocol spec §6.3): only the sender's most
// recent position (by sentAt) is kept.
export async function storeLocation(groupId: string, senderPub: string, payload: LocationPayload): Promise<void> {
  const all = await loadAll();
  const group = all[groupId] ?? {};
  const existing = group[senderPub];
  if (existing && existing.sentAt >= payload.sentAt) return;
  group[senderPub] = { lat: payload.lat, lon: payload.lon, accuracy: payload.accuracy, sentAt: payload.sentAt };
  all[groupId] = group;
  await saveAll(all);
}

export async function getLocations(groupId: string): Promise<Record<string, StoredLocation>> {
  return (await loadAll())[groupId] ?? {};
}
