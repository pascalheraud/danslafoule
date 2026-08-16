import { afterEach, describe, expect, it } from "vitest";
import { _resetCacheForTests } from "./localCache";
import { getProfile, setProfileName } from "./userService";

describe("userService", () => {
  afterEach(async () => {
    await _resetCacheForTests();
  });

  it("returns null when no profile has been set yet", async () => {
    await expect(getProfile()).resolves.toBeNull();
  });

  it("sets and retrieves the local profile", async () => {
    const profile = await setProfileName("u1", "Alice");

    expect(profile).toEqual({ uuid: "u1", name: "Alice" });
    await expect(getProfile()).resolves.toEqual({ uuid: "u1", name: "Alice" });
  });

  it("overwrites the previous name", async () => {
    await setProfileName("u1", "Alice");

    await setProfileName("u1", "Alicia");

    await expect(getProfile()).resolves.toEqual({ uuid: "u1", name: "Alicia" });
  });
});
