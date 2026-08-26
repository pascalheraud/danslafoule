// Minimal promise-based IndexedDB wrapper for the protocol's local storage
// schema (doc/dans-la-foule-protocol-spec-en.md §11). One object store per
// top-level key, single record per store keyed by "id" where the store holds
// a single map-like value (identity, groups, members, ...).

const DB_NAME = "danslafoule-protocol";
// Bump only alongside a real decision on how to handle existing local data
// that's genuinely incompatible with the new schema (not just a new
// optional field — those are handled with a runtime fallback at the call
// site instead, see e.g. messageService.ts's knownMemberPubs handling).
// Options considered but not yet chosen: an onupgradeneeded migration
// per version, or detecting the mismatch and wiping the local DB with a
// clear warning to the user (loses the local identity and joined groups).
const DB_VERSION = 1;

export const STORE_NAMES = ["identity", "groups", "members", "messages", "locations", "seenCache"] as const;
export type StoreName = (typeof STORE_NAMES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

// Test-only: close the current connection so a subsequent deleteDatabase()
// doesn't hang waiting on an open handle (IndexedDB's "blocked" behavior).
async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function dbSet<T>(store: StoreName, key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function _resetDbForTests(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
