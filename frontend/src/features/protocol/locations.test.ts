import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests } from "./db";
import { getLocations, storeLocation } from "./locations";
import type { LocationPayload } from "./types";

beforeEach(async () => {
  await _resetDbForTests();
});

describe("storeLocation", () => {
  it("stores the sender's location", async () => {
    const payload: LocationPayload = { type: "location", lat: 45.1, lon: 5.5, accuracy: 15, sentAt: 1000 };

    await storeLocation("group-1", "pub-a", payload);

    expect(await getLocations("group-1")).toEqual({ "pub-a": { lat: 45.1, lon: 5.5, accuracy: 15, sentAt: 1000 } });
  });

  it("replaces the previous position with a newer one, doesn't accumulate (§6.3)", async () => {
    await storeLocation("group-1", "pub-a", { type: "location", lat: 45.1, lon: 5.5, accuracy: 15, sentAt: 1000 });
    await storeLocation("group-1", "pub-a", { type: "location", lat: 46.0, lon: 6.0, accuracy: 10, sentAt: 2000 });

    expect(await getLocations("group-1")).toEqual({ "pub-a": { lat: 46.0, lon: 6.0, accuracy: 10, sentAt: 2000 } });
  });

  it("ignores an out-of-order (older) location update", async () => {
    await storeLocation("group-1", "pub-a", { type: "location", lat: 46.0, lon: 6.0, accuracy: 10, sentAt: 2000 });
    await storeLocation("group-1", "pub-a", { type: "location", lat: 45.1, lon: 5.5, accuracy: 15, sentAt: 1000 });

    expect(await getLocations("group-1")).toEqual({ "pub-a": { lat: 46.0, lon: 6.0, accuracy: 10, sentAt: 2000 } });
  });
});
