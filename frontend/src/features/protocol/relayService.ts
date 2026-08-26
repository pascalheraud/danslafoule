// HTTP relay transport client (protocol spec §8). Thin wrapper — all
// protocol logic (validation, dedup, decryption) lives in crypto.ts/pipeline.ts.
import type { Envelope } from "./types";

// Absolute in the Capacitor native build (VITE_API_BASE_URL), relative in the
// web build (empty — same-origin, via the Vite dev-server proxy or the
// backend's own static hosting).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const BASE_PATH = `${API_BASE_URL}/api/v1/groups`;

export interface ReceivedEnvelope {
  envelope: Envelope;
  // Opaque, monotonically increasing server-assigned cursor — the only value
  // safe to pass back as the next `since`. Not a timestamp: envelope.timestamp
  // is client-clock, routing metadata that gets refreshed on a resend (§6.5)
  // without changing content, so a plain wall-clock watermark would either
  // drift on clock skew or fail to resurface a resent message; cursor solves
  // both by being bumped server-side on every insert *and* resend.
  cursor: number;
}

// Connectivity state (doc/general-spec.md §4's server connection indicator),
// derived from the outcome of the actual send/poll traffic below — no
// separate health-check request. relayService is this app's sole HTTP fetch
// choke point (every send and every poll goes through postEnvelope/
// fetchEnvelopesSince), so tracking it here covers both without each caller
// having to report in.
export type ConnectivityStatus = "online" | "offline";
export interface ConnectivityState {
  status: ConnectivityStatus;
  // Unix ms of the last completed request, regardless of outcome — null
  // until the first one resolves.
  lastCheckedAt: number | null;
}

let connectivityState: ConnectivityState = { status: "online", lastCheckedAt: null };
const connectivityListeners = new Set<(state: ConnectivityState) => void>();

function reportConnectivity(status: ConnectivityStatus): void {
  connectivityState = { status, lastCheckedAt: Date.now() };
  for (const listener of connectivityListeners) listener(connectivityState);
}

export function getConnectivityState(): ConnectivityState {
  return connectivityState;
}

export function subscribeToConnectivity(listener: (state: ConnectivityState) => void): () => void {
  connectivityListeners.add(listener);
  return () => {
    connectivityListeners.delete(listener);
  };
}

export async function postEnvelope(envelope: Envelope): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}/${envelope.groupId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
  } catch (error) {
    reportConnectivity("offline");
    throw error;
  }
  reportConnectivity(response.ok ? "online" : "offline");
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`);
  }
}

export async function fetchEnvelopesSince(groupId: string, since: number | null): Promise<ReceivedEnvelope[]> {
  const query = since !== null ? `?since=${since}` : "";
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}/${groupId}/messages${query}`);
  } catch (error) {
    reportConnectivity("offline");
    throw error;
  }
  reportConnectivity(response.ok ? "online" : "offline");
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.status}`);
  }
  return (await response.json()) as ReceivedEnvelope[];
}
