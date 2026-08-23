import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetDbForTests } from "../features/protocol/db";
import { createGroup } from "./groupService";
import { getProfile, setProfilePseudo } from "./profileService";

function stubFetch(onPost: (body: Record<string, unknown>) => void) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        onPost(JSON.parse(init.body as string));
        return { ok: true, status: 201, json: async () => ({ status: "accepted" }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    }),
  );
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await _resetDbForTests();
});

describe("profileService", () => {
  it("returns null before any identity/profile exists (onboarding gate)", async () => {
    await expect(getProfile()).resolves.toBeNull();
  });

  it("does not create an identity as a side effect of checking the profile", async () => {
    await getProfile();
    await getProfile();

    // Still gated — getProfile must be read-only, otherwise onboarding would
    // never show for a first-time user.
    await expect(getProfile()).resolves.toBeNull();
  });

  it("sets and retrieves the pseudo", async () => {
    const profile = await setProfilePseudo("Alice");

    expect(profile).toEqual({ pseudo: "Alice" });
    await expect(getProfile()).resolves.toEqual({ pseudo: "Alice" });
  });

  it("overwrites the previous pseudo without creating a new identity", async () => {
    await setProfilePseudo("Alice");

    await setProfilePseudo("Alicia");

    await expect(getProfile()).resolves.toEqual({ pseudo: "Alicia" });
  });

  it("does not broadcast a rename for the very first (onboarding) pseudo", async () => {
    let postCount = 0;
    stubFetch(() => postCount++);

    await setProfilePseudo("Alice");

    expect(postCount).toBe(0);
  });

  it("broadcasts a rename to every known group when changing an existing pseudo", async () => {
    await setProfilePseudo("Alice");
    await createGroup("Crew");
    const posted: Record<string, unknown>[] = [];
    stubFetch((body) => void posted.push(body));

    await setProfilePseudo("Alicia");

    expect(posted).toHaveLength(1);
  });

  it("does not broadcast when saving the same pseudo again", async () => {
    await setProfilePseudo("Alice");
    await createGroup("Crew");
    let postCount = 0;
    stubFetch(() => postCount++);

    await setProfilePseudo("Alice");

    expect(postCount).toBe(0);
  });
});
