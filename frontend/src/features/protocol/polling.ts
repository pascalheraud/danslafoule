// Foreground polling loop (§8.2). Every retrieved envelope goes through the
// same onEnvelopeReceived pipeline as any other transport would (§9).
import { onEnvelopeReceived } from "./pipeline";
import type { PipelineDeps } from "./pipeline";
import { fetchEnvelopesSince, postEnvelope } from "./relayService";

export const DEFAULT_POLL_INTERVAL_MS = 7_000;

export async function pollOnce(deps: Omit<PipelineDeps, "send">, since: number | null): Promise<number> {
  const received = await fetchEnvelopesSince(deps.group.groupId, since);
  let latest = since ?? 0;
  for (const { envelope, cursor } of received) {
    await onEnvelopeReceived(envelope, { ...deps, send: postEnvelope });
    latest = Math.max(latest, cursor);
  }
  return latest;
}

export function startPolling(deps: Omit<PipelineDeps, "send">, intervalMs = DEFAULT_POLL_INTERVAL_MS): () => void {
  let since: number | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      since = await pollOnce(deps, since);
    } catch {
      // Network hiccup: retry on the next tick, per foreground-polling design (§8.2).
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
    }
  };

  let timer = setTimeout(tick, intervalMs);

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
