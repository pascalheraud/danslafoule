import { listGroups } from "./groupService";
import { syncMessages } from "./messageService";

const POLL_INTERVAL_MS = 5000;

type PollListener = () => void;

const listeners = new Set<PollListener>();
let timer: number | undefined;
let started = false;

async function tick(): Promise<void> {
  const groups = await listGroups();
  await Promise.all(
    groups
      .filter((group) => !group.paused)
      .map((group) => syncMessages(group.groupId)),
  );

  for (const listener of listeners) {
    listener();
  }

  if (!started) return;
  timer = window.setTimeout(() => {
    void tick();
  }, POLL_INTERVAL_MS);
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
