import { listGroups } from "./groupService";
import { flushOutboxes, syncMessages } from "./messageService";

const POLL_INTERVAL_MS = 5000;

type PollListener = () => void;

const listeners = new Set<PollListener>();
let timer: number | undefined;
let started = false;

async function tick(): Promise<void> {
  try {
    const groups = await listGroups();
    // Each group polled independently, failures swallowed here: syncMessages
    // (via pollOnce) throws on a network/server error with no retry of its
    // own, and an uncaught rejection from just one group used to propagate
    // past the reschedule below, permanently killing the polling loop until
    // a full page reload — this failed silently for as long as the relay
    // was unreachable, which is exactly when polling matters most.
    await Promise.all([
      flushOutboxes(), // retry queued offline sends every tick, paused groups included
      ...groups.filter((group) => !group.paused).map((group) => syncMessages(group.groupId).catch(() => {})),
    ]);

    for (const listener of listeners) {
      listener();
    }
  } finally {
    if (started) {
      timer = window.setTimeout(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    }
  }
}

export function startGlobalPoller(): () => void {
  if (started) {
    return () => {
      listeners.clear();
    };
  }

  started = true;
  void tick();

  return () => {
    started = false;
    if (timer) {
      window.clearTimeout(timer);
    }
    listeners.clear();
  };
}

export function subscribeToGlobalPoll(listener: PollListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
