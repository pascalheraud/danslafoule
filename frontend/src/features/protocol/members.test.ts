import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests } from "./db";
import { getMembers, recordAnnounce } from "./members";

beforeEach(async () => {
  await _resetDbForTests();
});

it("records and retrieves a member", async () => {
  await recordAnnounce("group-1", "pub-a", "Alice", 1000);

  expect(await getMembers("group-1")).toEqual({ "pub-a": { pseudo: "Alice", lastSeen: 1000 } });
});

it("updates lastSeen and pseudo on a repeat announce", async () => {
  await recordAnnounce("group-1", "pub-a", "Alice", 1000);
  await recordAnnounce("group-1", "pub-a", "Alice2", 2000);

  expect(await getMembers("group-1")).toEqual({ "pub-a": { pseudo: "Alice2", lastSeen: 2000 } });
});

it("keeps members scoped per group", async () => {
  await recordAnnounce("group-1", "pub-a", "Alice", 1000);
  await recordAnnounce("group-2", "pub-b", "Bob", 1000);

  expect(await getMembers("group-1")).toEqual({ "pub-a": { pseudo: "Alice", lastSeen: 1000 } });
  expect(await getMembers("group-2")).toEqual({ "pub-b": { pseudo: "Bob", lastSeen: 1000 } });
});

describe("edge cases", () => {
  it("returns an empty object for an unknown group", async () => {
    expect(await getMembers("unknown-group")).toEqual({});
  });
});
