import { apiClient } from "./apiClient";
import { localCache } from "./localCache";
import { listGroups } from "./groupService";
import type { Message } from "./types";

interface MessageDto {
  uuid: string;
  content: string;
  received_at: string;
}

interface Envelope {
  groupUuid: string;
  groupName: string;
  authorUuid: string;
  authorName: string;
  text: string;
}

function encodeEnvelope(envelope: Envelope): string {
  return JSON.stringify(envelope);
}

function decodeEnvelope(content: string): Envelope | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === "object" &&
      "groupUuid" in parsed &&
      "groupName" in parsed &&
      "authorUuid" in parsed &&
      "authorName" in parsed &&
      "text" in parsed
    ) {
      return parsed as Envelope;
    }
    return null;
  } catch {
    return null;
  }
}

export async function sendMessage(envelope: Envelope): Promise<Message> {
  const dto = await apiClient.post<MessageDto>("/messages", {
    uuid: crypto.randomUUID(),
    content: encodeEnvelope(envelope),
  });
  const message: Message = { uuid: dto.uuid, receivedAt: dto.received_at, ...envelope };
  await localCache.addMessage(message);
  return message;
}

/**
 * Fetches new messages since the local watermark, decodes each one's
 * envelope, and stores the ones belonging to a group the user knows about
 * locally (see spec §3 — the server has no notion of groups, so filtering
 * happens entirely client-side). Advances the watermark past every fetched
 * message, matched or not, so unrelated groups' traffic is never re-fetched.
 */
export async function syncMessages(): Promise<void> {
  const since = await localCache.getWatermark();
  const dtos = await apiClient.get<MessageDto[]>(
    `/messages${since ? `?since=${encodeURIComponent(since)}` : ""}`,
  );
  if (dtos.length === 0) return;

  const knownGroupUuids = new Set((await listGroups()).map((g) => g.uuid));

  for (const dto of dtos) {
    const envelope = decodeEnvelope(dto.content);
    if (envelope && knownGroupUuids.has(envelope.groupUuid)) {
      const message: Message = { uuid: dto.uuid, receivedAt: dto.received_at, ...envelope };
      await localCache.addMessage(message);
      await localCache.upsertGroup({ uuid: envelope.groupUuid, name: envelope.groupName });
    }
  }

  const latest = dtos.reduce((max, dto) => (dto.received_at > max ? dto.received_at : max), dtos[0].received_at);
  await localCache.setWatermark(latest);
}
