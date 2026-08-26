import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { _resetDbForTests } from "../features/protocol/db";
import { createGroup } from "./groupService";
import { startGlobalPoller } from "./globalPoller";

function stubFetch(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status < 400,
      status,
      json: async () => (status < 400 ? [] : { detail: "boom" }),
    })),
  );
}

// Waits for `predicate` by yielding real macrotasks — under a full-suite run
// (heavier load, more contention) a fixed round count of setTimeout(0) isn't
// always enough for the real IndexedDB + fetch-stub chain to settle.
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor: timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await _resetDbForTests();
});

beforeEach(async () => {
  await _resetDbForTests();
});

describe("globalPoller", () => {
  it("reschedules the next tick even when the relay returns 500 (real setTimeout, no fake timers)", async () => {
    await createGroup("Crew");
    stubFetch(500);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    const stop = startGlobalPoller();
    try {
      // Real IndexedDB + fetch stub work through several real microtask/
      // macrotask hops before the first tick's finally block runs.
      await waitFor(() => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0);

      // The real bug this guards: an uncaught rejection from a 500 used to
      // skip straight past the reschedule, so setTimeout(tick, 5000) was
      // never called a second time and polling died silently.
      await waitFor(() => setTimeoutSpy.mock.calls.some(([, delay]) => delay === 5000));
    } finally {
      stop();
      setTimeoutSpy.mockRestore();
    }
  });
});
