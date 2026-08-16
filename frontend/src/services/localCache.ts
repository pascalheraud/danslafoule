import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { GroupSummary, Message, Profile } from "./types";

const DB_NAME = "dlf-cache";
const DB_VERSION = 1;
const STORE = "kv";

interface CacheSchema extends DBSchema {
  [STORE]: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<CacheSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<CacheSchema>> {
  dbPromise ??= openDB<CacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

async function read<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const value = await db.get(STORE, key);
  return (value as T | undefined) ?? null;
}

async function write<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put(STORE, value, key);
}

export const localCache = {
  getProfile(): Promise<Profile | null> {
    return read<Profile>("profile");
  },
  setProfile(profile: Profile): Promise<void> {
    return write("profile", profile);
  },

  getGroups(): Promise<GroupSummary[]> {
    return read<GroupSummary[]>("groups").then((groups) => groups ?? []);
  },
  setGroups(groups: GroupSummary[]): Promise<void> {
    return write("groups", groups);
  },
  async upsertGroup(group: GroupSummary): Promise<GroupSummary[]> {
    const groups = await localCache.getGroups();
    const existing = groups.find((g) => g.uuid === group.uuid);
    let next: GroupSummary[];
    if (!existing) {
      next = [...groups, group];
    } else if (!existing.name && group.name) {
      // Learn/refresh a joined-but-unnamed group's name once a message reveals it.
      next = groups.map((g) => (g.uuid === group.uuid ? { ...g, name: group.name } : g));
    } else {
      next = groups;
    }
    await localCache.setGroups(next);
    return next;
  },

  getMessages(groupUuid: string): Promise<Message[]> {
    return read<Message[]>(`messages:${groupUuid}`).then((messages) => messages ?? []);
  },
  setMessages(groupUuid: string, messages: Message[]): Promise<void> {
    return write(`messages:${groupUuid}`, messages);
  },
  async addMessage(message: Message): Promise<Message[]> {
    const existing = await localCache.getMessages(message.groupUuid);
    if (existing.some((m) => m.uuid === message.uuid)) {
      return existing;
    }
    const merged = [...existing, message].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    await localCache.setMessages(message.groupUuid, merged);
    return merged;
  },

  getWatermark(): Promise<string | null> {
    return read<string>("watermark");
  },
  setWatermark(receivedAt: string): Promise<void> {
    return write("watermark", receivedAt);
  },
};

/** Test-only: drops the IndexedDB database so each test starts isolated. */
export async function _resetCacheForTests(): Promise<void> {
  const db = await getDb();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
