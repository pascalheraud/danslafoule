// HTTP relay transport client (protocol spec §8). Thin wrapper — all
// protocol logic (validation, dedup, decryption) lives in crypto.ts/pipeline.ts.
import type { Envelope } from "./types";

const BASE_PATH = "/api/v1/groups";

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

export async function postEnvelope(envelope: Envelope): Promise<void> {
  const response = await fetch(`${BASE_PATH}/${envelope.groupId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`);
  }
}

export async function fetchEnvelopesSince(groupId: string, since: number | null): Promise<ReceivedEnvelope[]> {
  const query = since !== null ? `?since=${since}` : "";
  const response = await fetch(`${BASE_PATH}/${groupId}/messages${query}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.status}`);
  }
  return (await response.json()) as ReceivedEnvelope[];
}
