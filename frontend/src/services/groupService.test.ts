import { afterEach, describe, expect, it } from "vitest";
import { createGroup, joinGroup, listGroups } from "./groupService";
import { _resetCacheForTests } from "./localCache";

describe("groupService", () => {
  afterEach(async () => {
    await _resetCacheForTests();
  });

  it("creates a group locally with a generated uuid", async () => {
    const group = await createGroup("Crew");

    expect(group.name).toBe("Crew");
    expect(group.uuid).toHaveLength(36);
    await expect(listGroups()).resolves.toEqual([group]);
  });

  it("joins a group by uuid, with no known name yet", async () => {
    const group = await joinGroup("11111111-1111-1111-1111-111111111111");

    expect(group).toEqual({ uuid: "11111111-1111-1111-1111-111111111111", name: null });
  });

  it("joining a group already known locally is idempotent and keeps its name", async () => {
    const created = await createGroup("Crew");

    const rejoined = await joinGroup(created.uuid);

    expect(rejoined).toEqual({ uuid: created.uuid, name: "Crew" });
    await expect(listGroups()).resolves.toEqual([{ uuid: created.uuid, name: "Crew" }]);
  });
});
