const DEVICE_UUID_KEY = "dlf:device-uuid";

export function getOrCreateDeviceUuid(): string {
  const existing = localStorage.getItem(DEVICE_UUID_KEY);
  if (existing) {
    return existing;
  }
  const uuid = crypto.randomUUID();
  localStorage.setItem(DEVICE_UUID_KEY, uuid);
  return uuid;
}
