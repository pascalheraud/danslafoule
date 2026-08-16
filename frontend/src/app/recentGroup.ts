// Purely a UI navigation memory (not protocol state, not synced anywhere) —
// which group the user most recently opened, so the header can offer a
// quick way back into it. localStorage, not IndexedDB: a single small
// synchronous value, not data that needs the protocol's async storage layer.
const KEY = "dlf:last-viewed-group-id";

export function setLastViewedGroupId(groupId: string): void {
  localStorage.setItem(KEY, groupId);
}

export function getLastViewedGroupId(): string | null {
  return localStorage.getItem(KEY);
}
