import { dbGet, dbSet } from "./db";
import type { Identity } from "./types";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  let out = "";
  while (value > 0n) {
    const remainder = value % 58n;
    out = BASE58_ALPHABET[Number(remainder)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = BASE58_ALPHABET[0] + out;
  }
  return out || BASE58_ALPHABET[0];
}

const IDENTITY_KEY = "self";

interface StoredIdentity {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  pseudo: string;
}

async function generateIdentity(pseudo: string): Promise<Identity> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyRaw,
    pseudo,
  };
}

async function persist(identity: Identity): Promise<void> {
  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", identity.privateKey),
    crypto.subtle.exportKey("jwk", identity.publicKey),
  ]);
  const stored: StoredIdentity = { privateKeyJwk, publicKeyJwk, pseudo: identity.pseudo };
  await dbSet("identity", IDENTITY_KEY, stored);
}

async function restore(stored: StoredIdentity): Promise<Identity> {
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.importKey("jwk", stored.privateKeyJwk, { name: "Ed25519" }, true, ["sign"]),
    crypto.subtle.importKey("jwk", stored.publicKeyJwk, { name: "Ed25519" }, true, ["verify"]),
  ]);
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  return { privateKey, publicKey, publicKeyRaw, pseudo: stored.pseudo };
}

export async function getOrCreateIdentity(defaultPseudo = "Anonymous"): Promise<Identity> {
  const stored = await dbGet<StoredIdentity>("identity", IDENTITY_KEY);
  if (stored) {
    return restore(stored);
  }
  const identity = await generateIdentity(defaultPseudo);
  await persist(identity);
  return identity;
}

// Peek without creating — lets callers distinguish "no identity yet" (e.g. to
// gate onboarding) from "identity exists with its default pseudo".
export async function hasIdentity(): Promise<boolean> {
  return (await dbGet<StoredIdentity>("identity", IDENTITY_KEY)) !== undefined;
}

export async function setPseudo(pseudo: string): Promise<Identity> {
  const identity = await getOrCreateIdentity(pseudo);
  if (identity.pseudo === pseudo) return identity;
  const renamed: Identity = { ...identity, pseudo };
  await persist(renamed);
  return renamed;
}

export async function shortId(publicKeyRaw: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", publicKeyRaw as unknown as BufferSource));
  return toBase58(digest).slice(0, 8);
}
