// Envelope build/verify per protocol spec §5.
import { base64ToBytes, bytesToBase64, concatBytes, randomBytes } from "./bytes";
import { parsePayload } from "./payloads";
import type { Envelope, Identity, Payload } from "./types";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// TS's DOM lib types BufferSource as ArrayBuffer-backed specifically; our
// Uint8Arrays are always freshly allocated (never SharedArrayBuffer-backed)
// so this cast is safe, just working around an overly strict typed-array generic.
function bs(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

function importGroupKey(groupKey: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bs(groupKey), { name: "AES-GCM" }, false, [usage]);
}

async function computeMessageId(ciphertext: Uint8Array, senderPub: Uint8Array, nonce: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bs(concatBytes(ciphertext, senderPub, nonce)));
  return bytesToBase64(new Uint8Array(digest));
}

export async function buildEnvelope(
  groupId: string,
  groupKey: Uint8Array,
  identity: Identity,
  payload: Payload,
): Promise<Envelope> {
  const nonce = randomBytes(12);
  const aesKey = await importGroupKey(groupKey, "encrypt");
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(nonce) }, aesKey, bs(plaintext)),
  );

  const messageId = await computeMessageId(ciphertext, identity.publicKeyRaw, nonce);
  const signaturePayload = concatBytes(ciphertext, nonce, textEncoder.encode(messageId));
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, identity.privateKey, bs(signaturePayload));

  return {
    v: 1,
    groupId,
    messageId,
    senderPub: bytesToBase64(identity.publicKeyRaw),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    signature: bytesToBase64(new Uint8Array(signature)),
    timestamp: Date.now(),
  };
}

export interface VerifiedEnvelope {
  envelope: Envelope;
  payload: Payload;
}

// Returns null (never throws) on any failure: bad base64, invalid signature,
// decryption failure, or a decrypted payload that doesn't validate (§5.1, §6).
export async function verifyAndDecryptEnvelope(envelope: Envelope, groupKey: Uint8Array): Promise<VerifiedEnvelope | null> {
  try {
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const nonce = base64ToBytes(envelope.nonce);
    const senderPub = base64ToBytes(envelope.senderPub);
    const signature = base64ToBytes(envelope.signature);

    const signaturePayload = concatBytes(ciphertext, nonce, textEncoder.encode(envelope.messageId));
    const senderKey = await crypto.subtle.importKey("raw", bs(senderPub), { name: "Ed25519" }, false, ["verify"]);
    const signatureValid = await crypto.subtle.verify(
      { name: "Ed25519" },
      senderKey,
      bs(signature),
      bs(signaturePayload),
    );
    if (!signatureValid) return null;

    const aesKey = await importGroupKey(groupKey, "decrypt");
    const plaintextBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(nonce) }, aesKey, bs(ciphertext));

    let parsed: unknown;
    try {
      parsed = JSON.parse(textDecoder.decode(plaintextBuffer));
    } catch {
      return null;
    }

    const payload = parsePayload(parsed);
    if (!payload) return null;

    return { envelope, payload };
  } catch {
    return null;
  }
}
