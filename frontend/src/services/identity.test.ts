import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateDeviceUuid } from "./identity";

describe("getOrCreateDeviceUuid", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates and persists a UUID on first call", () => {
    const uuid = getOrCreateDeviceUuid();

    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem("dlf:device-uuid")).toBe(uuid);
  });

  it("returns the same UUID on subsequent calls", () => {
    const first = getOrCreateDeviceUuid();
    const second = getOrCreateDeviceUuid();

    expect(second).toBe(first);
  });
});
