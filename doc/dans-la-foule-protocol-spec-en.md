# Dans la Foule — Communication Protocol Specification

Version 0.1 — Draft

## 1. Purpose and context

"Dans la Foule" lets people who are physically close to each other (concert, festival, mountain, hike) communicate and share their location, with or without network access. The protocol must behave identically across two transports:

- **Bluetooth Low Energy (BLE)**: local mesh, gossip between devices in range.
- **Optional HTTP relay server**: helps propagation when BLE isn't enough, but is never a source of truth.

Guiding principles:

- End-to-end encryption: the server never decrypts anything.
- The protocol must be identical regardless of transport (same message envelope).
- Graceful degradation: the app must remain fully usable 100% offline (BLE only).
- Ephemeral by design: data has a short lifetime on the server (fixed 1h purge), unlimited retention on the client.
- No group-level TTL: message "freshness" is a client-side judgment call left entirely to the user, not a protocol-enforced expiry.
- Trust model: possessing the `groupKey` is sufficient to trust a member — it never travels over the network (only via QR code), and the people who share it know each other in person. No anti-Sybil / anti-forgery mechanism inside the group.
- Delivery acknowledgements (ACK): each message can be tracked to know which of the known members has received it.

Target stack: Capacitor + React (client), Python + PostgreSQL (relay server).

---

## 2. Cryptographic primitives

| Purpose | Algorithm | Details |
|---|---|---|
| Identity (signing) | Ed25519 | 32-byte key, 64-byte signature |
| Group (symmetric encryption) | AES-256-GCM | 32-byte key, 12-byte IV, 16-byte tag |
| Group id derivation (optional) | SHA-256 | To obscure the groupId if needed in the future |
| Generation | Web Crypto API (`crypto.subtle`) on web, equivalent native plugin on Capacitor if performance requires it | |

Ed25519 is preferred over ECDSA P-256 for compactness (32-byte public key vs. ~65 bytes uncompressed) — important given BLE payload and QR code size constraints.

---

## 3. Identity model

Each device generates **a single identity key pair**, at install time, valid across all groups.

```
Identity {
  privateKey: Ed25519 private key   // never exported, never transmitted
  publicKey:  Ed25519 public key    // 32 bytes, shared in every group joined
  pseudo:     string                // display name, changeable per group or globally
}
```

Storage: IndexedDB, non-extractable key if the API allows it, otherwise extractable but never transmitted over the network.

A derived `shortId` can be used for display/debugging: `shortId = base58(SHA-256(publicKey)).slice(0, 8)`.

---

## 4. Group model

```
Group {
  groupId:            UUIDv4
  groupKey:           AES-256 key (32 bytes)
  createdAt:          timestamp
  name:               string   // optional, local to each client
}
```

### 4.1 Creation

The creator generates `groupId` (UUIDv4) and `groupKey` (random, 32 bytes), then encodes both into an **invite payload** (§4.2). That payload is transport-agnostic: it can be rendered as a QR code and/or shared as plain text (SMS, WhatsApp, email, copy/paste) — both are just two encodings of the same underlying data, and either can be used to join.

### 4.2 Invite payload format

Logical content (before encoding):

```json
{
  "v": 1,
  "gid": "a1b2c3d4-...",
  "gk": "base64-32-bytes",
  "name": "Concert X"
}
```

This JSON is serialized into a single compact **text string** — the invite payload — which is the one artifact actually shared between devices:

```
dlf://join?v=1&gid=a1b2c3d4-...&gk=<base64url-or-base45-32-bytes>&name=Concert%20X
```

or an equivalent compact string encoding (e.g. base45 of the compressed/CBOR JSON, prefixed with a short scheme marker). Exact wire encoding is an implementation detail as long as it round-trips losslessly and stays copy/paste-safe (no characters that break when pasted into SMS/WhatsApp/email bodies — URL-safe alphabet only, no raw JSON with braces/quotes sent as-is).

This string is then shared through either channel, interchangeably:

- **QR code**: the string is encoded into a QR code and scanned by the camera.
- **Text**: the string is copy/pasted or sent as-is through any messaging app (SMS, WhatsApp, email, etc.) and copy/pasted back into the app by the recipient.

Recommendation: encode in **base45** (the standard used by European health QR codes) rather than base64 for better density in the QR code, or compress with CBOR before encoding to reduce size. Failing that, JSON + base64url remains acceptable for a first iteration. The same encoding is reused for both the QR code content and the plain-text/link form — there is only one invite payload format, not two.

### 4.3 Joining a group

1. Obtain the invite payload, either by scanning the QR code or by pasting the shared text string → parse it (same parser regardless of source) → store `Group` in a local `Map<groupId, Group>`.
2. Broadcast an `announce` message (see §6.1), signed with the identity and encrypted with `groupKey`, over both available transports.
3. Other members, upon receiving it, add `publicKey → pseudo` to their table of known members for that group.

No central validation: belonging to the group = possessing the `groupKey`. No admin/revocation concept in v1 (noted as a limitation: revoking a member requires rotating the `groupKey` and redistributing it to everyone else, out of scope for the initial version).

**Trust model note**: sharing the invite as plain text (SMS/WhatsApp/etc.) relies on the same trust assumption as the QR code — the channel used to transmit it is trusted because it's a direct, personal channel between people who know each other (§1, §12). Unlike the QR code (which requires physical proximity to scan), a text invite can in principle be forwarded further by its recipient; this is a slightly weaker trust boundary than the QR code's implicit "same room" constraint, and is accepted as a usability trade-off, consistent with the existing "no anti-Sybil / no admin revocation" stance for this protocol.

---

## 5. Message envelope (common to all transports)

Every message, regardless of transport, follows the same structure before transmission:

```
Envelope {
  v:          1                      // protocol version
  groupId:    UUIDv4                 // plaintext, so recipients know which groupKey to try
  messageId:  string                 // SHA-256(ciphertext + senderPubKey + nonce), used for dedup
  senderPub:  base64 (32 bytes)      // sender's Ed25519 public key
  nonce:      base64 (12 bytes)      // AES-GCM IV, unique per message
  ciphertext: base64                 // AES-256-GCM(payload, groupKey, nonce)
  signature:  base64 (64 bytes)      // Ed25519(senderPrivateKey, ciphertext || nonce || messageId)
  timestamp:  int (unix ms)          // last (re)transmission time, routing metadata only
}
```

The `payload` (before encryption) depends on `type` (see §6). The `type` field lives **inside** the encrypted payload, not in the plaintext envelope, so as not to leak the nature of a message (text vs. location vs. announce) to a passive observer of the channel.

**Important**: `envelope.timestamp` is **not** covered by the signature (`signature` only covers `ciphertext || nonce || messageId`). It is purely routing/display metadata, and can be refreshed on a resend (§6.5) without invalidating the signature or changing the authenticated author or content. The actual authoring time, for display purposes, is carried separately as `sentAt` inside the encrypted payload (see §6.2/6.3) and never changes.

There is no protocol-level message TTL: a group has no configured lifetime, and no expiry field travels in the envelope. Judging whether a message is still relevant ("too old to matter") is left entirely to the user, client-side — the protocol only enforces the fixed 1h server purge (§8.3), which is a storage/relay concern, not a freshness rule.

### 5.1 Verification on receipt

```
1. Look up groupKey for envelope.groupId. Missing → silently ignore.
2. messageId already seen (local cache) → ignore (dedup), don't reprocess but may still be relayed per §7 rules.
3. Decrypt ciphertext with groupKey + nonce → payload.
4. Verify signature with senderPub. Invalid → reject and log (possible forgery attempt).
5. Handle according to payload.type.
```

---

## 6. Payload types

### 6.1 `announce` — group join announcement

```json
{
  "type": "announce",
  "pseudo": "Alice"
}
```
The envelope's `senderPub` is enough to identify who is announcing themselves. Sent on join, and periodically re-sent (e.g., every 10 min) to help new BLE arrivals populate their member table without depending on the server.

### 6.2 `chat` — text message

```json
{
  "type": "chat",
  "text": "we're on stage left",
  "replyTo": "messageId | null",
  "sentAt": 1723600000000
}
```
`sentAt` is the actual authoring timestamp, used for display — independent from `envelope.timestamp`, which is used only for routing/TTL and can be refreshed on a resend (§6.5).

### 6.3 `location` — geographic position

```json
{
  "type": "location",
  "lat": 45.1234,
  "lon": 5.5678,
  "accuracy": 15,
  "sentAt": 1723600000000
}
```
Handled differently in local storage: it **replaces** the sender's last known position rather than accumulating (`Map<senderPub, lastLocation>`). With no protocol-level TTL, the client displays `sentAt` (e.g., "Alice's position, 12 min ago") and leaves it to the user to judge whether a position is still useful, rather than automatically hiding or invalidating it.

### 6.4 `rename` — pseudo change announcement

```json
{
  "type": "rename",
  "oldPseudo": "Alice",
  "pseudo": "Bob"
}
```
Sent by a device to every group it currently belongs to whenever the user changes their display name (the "Me" screen — a single, cross-group identity setting, not a per-group one). Semantically distinct from `announce`: `announce` means "I just joined and here's my name", `rename` means "I'm already a known member and I'm changing my name". `oldPseudo` is carried in the payload itself rather than left for the recipient to look up in its local `members` table — a recipient that never saw (or has since evicted) the sender's original `announce` would otherwise have no "old name" to show, and the sender always knows its own previous pseudo with certainty. Recipients update `members[groupId][senderPub].pseudo` to `pseudo` (same table `announce` populates) and locally synthesize a system notice — "*oldPseudo* is now known as *pseudo*" — displayed inline in the chat feed, not stored as a `chat` payload.

### 6.5 `ack` — delivery acknowledgement

```json
{
  "type": "ack",
  "ackedMessageId": "<original message's messageId>"
}
```
Automatically emitted as soon as a `chat`/`location` message is successfully decrypted and its signature validated. Broadcast over both transports exactly like a standard message (same envelope, same dedup, same server storage — see §8.3).

**Local storage of acks:**
```
ackState: Map<messageId, Set<ackerPublicKey>>
```
Populated by every ack seen on the mesh, not just one's own. Compared against `members[groupId]` (the table of known `announce`s) to display a delivery status ("seen by Alice, not yet by Bob" or "2/3 known members").

**Idempotence:** if `ackerPub` is already present in `ackState[messageId]`, don't re-emit an ack for that message (avoids network noise on resend, see §6.5).

**Trust model:** an ack is only accepted as valid if it is correctly signed and decryptable with the group's `groupKey` — possession of the `groupKey` being itself considered proof of trust (see guiding principles, §1), so no additional check (anti-Sybil, weighted counting) is applied.

### 6.5 Resending a message (rebroadcast)

Gives a message another chance at delivery when some known members haven't yet acknowledged it (`ackState[messageId]` incomplete relative to `members[groupId]`).

**Trigger:** manual only (a "resend to missing recipients" button) — since there's no group-level TTL, there's no "expiry approaching" signal to automate the trigger from. A client can still surface a hint (e.g., "sent 20 min ago, 2 members haven't seen it yet") to prompt the user, but firing the resend itself stays a deliberate action, by any client that still holds the message locally, not necessarily the original author.

**Mechanism:**
```
envelope.timestamp = now()
// ciphertext, nonce, messageId, signature: UNCHANGED
→ re-propagated via BLE + HTTP, like a normal send
```
Since `timestamp` isn't covered by the signature (§5), a resend requires neither re-encryption nor re-signing — the original authenticity and authorship remain intact.

**Handling on receipt:** since `messageId` is unchanged, recipients who already received it ignore it via the usual dedup (no duplicate shown, no duplicate ack thanks to the idempotence above). Recipients who never received it treat it as a normal message, with the correct authoring date thanks to `sentAt`.

**Targeting:** no precise targeting needed — a broad rebroadcast is enough, since already-served recipients ignore it with no side effect. Simpler than a unicast BLE send to specific devices.

---

## 7. BLE transport (mesh / gossip)

### 7.1 Roles

Each device alternates (or combines, if the hardware allows) two roles:
- **Peripheral / Advertiser**: advertises a custom GATT service, exposes recent messages for read/write.
- **Central / Scanner**: scans nearby devices advertising this service, connects to them, exchanges messages.

### 7.2 GATT service (proposal)

```
Service UUID:       custom (generated once for the app)
Characteristic TX:   write — local device pushes its messages
Characteristic RX:   notify — local device receives new messages
Characteristic SYNC: read/write — exchange of a bloom filter or list of known messageIds, to avoid retransmitting what the other side already has
```

### 7.3 Fragmentation

Effective BLE MTU is often limited (~180-244 bytes depending on device/OS overhead). An encrypted envelope (short text + 64-byte signature + 32-byte public key + metadata) easily exceeds this size.

```
Fragment {
  messageId:   string
  index:       int
  total:       int
  chunk:       bytes
}
```
Reassembled on the receiving side by `messageId`, with a reassembly timeout (e.g., 10s) beyond which partial fragments are discarded.

### 7.4 Gossip loop prevention

```
seenCache: Set<messageId>  // purged on a fixed local rolling window (e.g. matching the server's 1h horizon), decoupled from any group setting
```
On each BLE peer connection: a quick exchange of known `messageId`s (via the SYNC characteristic, ideally as a bloom filter to limit size), followed by transmission of only the messages missing on either side. Avoids looping retransmission of what the other side already has.

### 7.5 iOS constraint

Web Bluetooth is not supported on iOS Safari. The envelope protocol stays identical, but the transport implementation must go through a native Capacitor plugin (e.g., `@capacitor-community/bluetooth-le`) rather than the web API, with the same peripheral/central logic on both sides.

---

## 8. HTTP transport (relay server)

The server only stores opaque `Envelope`s (it sees neither the `payload` nor the `groupKey`). No authentication tied to crypto identity — only basic anti-spam rate-limiting (IP or app token).

### 8.1 Endpoints (REST proposal)

```
POST /v1/groups/:groupId/messages
  body: Envelope
  → 201 if accepted, 429 if rate-limited, 400 if malformed

GET /v1/groups/:groupId/messages?since=<messageId|timestamp>
  → list of Envelopes received since <since>, not expired

GET /v1/groups/:groupId/messages/stream   (optional v2, websocket or SSE)
  → real-time push of new messages for the group
```

The server has no notion of who is allowed to post to a given `groupId` — it's possession of the `groupKey` (invisible to the server) that establishes legitimacy client-side. It only validates envelope shape and applies rate-limiting.

### 8.2 Client-side retrieval strategy

- **Polling** in v1 (simplicity), short interval during active use (e.g., 5-10s), or triggered only in foreground.
- **SSE/WebSocket** in v2 if greater responsiveness is needed without draining the battery.
- Every newly retrieved envelope goes through the same processing path as BLE (§5.1), ensuring the two channels stay unified.

### 8.3 Server purge

A simple, fixed rule, independent of the `ttl` carried by each envelope (which remains an informational, client-side TTL): the server timestamps each message **on receipt**, and systematically deletes anything older than one hour — messages, acks, and resends (rebroadcasts) are all treated identically.

```
Periodic job (e.g., every minute):
  DELETE FROM messages WHERE received_at < now() - interval '1 hour'
```
Minimal PostgreSQL table:
```sql
CREATE TABLE messages (
  message_id   TEXT PRIMARY KEY,
  group_id     UUID NOT NULL,
  envelope     JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_group_since ON messages (group_id, received_at);
```
A resend (§6.5) POSTed again to the server is treated as a new record (`received_at` refreshed), giving it a full extra hour of availability on the relay.

No group/identity table on the server side — it doesn't need to know them. No expected-ack counter or early-purge logic: the fixed one-hour rule is the sole purge mechanism, deliberately kept simple so as not to expose additional metadata (expected member count, etc.) to the server.

---

## 9. BLE / HTTP unification on the client

```
onEnvelopeReceived(envelope, sourceTransport):
  if not passesValidation(envelope):  # §5.1
    return
  if messageId in seenCache:
    return  # already processed
  seenCache.add(messageId)
  store(envelope, payload)            # local IndexedDB
  relay(envelope, exclude=sourceTransport)  # rebroadcast on the other transport if available
```

A message picked up over BLE can be pushed to the server by a device that has network access (bridge), and a message retrieved from the server can be rebroadcast over BLE to offline devices nearby — the client acts as a bridge point between the two meshes.

---

## 10. Data lifetime and purging

| Data | Server purge | Client retention |
|---|---|---|
| `chat` message | Fixed, 1h after receipt (§8.3) | Kept indefinitely (IndexedDB) — freshness judged by the user |
| `location` | Fixed, 1h after receipt | Overwritten by the next position; `sentAt` shown so the user judges relevance |
| `announce` | Fixed, 1h after receipt | Member table continuously updated |
| `ack` | Fixed, 1h after receipt | Kept as long as the associated message is displayed |

There is no group-level TTL. The only expiry rule in the whole protocol is the server's fixed one-hour relay purge (§8.3), which is a storage/relay concern — it doesn't mean a message stops being usable or shown to the user; it only means the relay server can no longer help deliver it (BLE can still carry it, and a resend, §6.5, can still be issued for as long as at least one client holds it).

The server is disposable by design: it is never the source of truth. Clients are authoritative and keep history for as long as the user doesn't delete the group locally.

---

## 11. Local storage (IndexedDB) — proposed schema

```
identity        { publicKey, privateKey, pseudo }               // single entry
groups          { groupId → Group }
members         { groupId → Map<publicKey, {pseudo, lastSeen}> }
messages        { groupId → [{messageId, senderPub, type, payload, timestamp}] }
locations       { groupId → Map<publicKey, {lat, lon, accuracy, timestamp}> }
seenCache       { messageId → expiresAt }                       // dedup, purged periodically
```

---

## 12. Security considerations (threat model summary)

- **Explicit trust model**: possession of the `groupKey` establishes legitimacy. It never travels over the network (only via QR code, i.e. through physical contact between people who know each other), and anyone who holds it is considered a legitimate, trusted member. Accepted consequence: no anti-Sybil protection is implemented inside a group (a member could, for instance, generate several identities and produce multiple acks) — this residual risk is considered acceptable for the intended use case (friends/close contacts), and is limited to an availability nuisance, never a confidentiality or integrity breach.
- **Content confidentiality**: guaranteed as long as the `groupKey` hasn't leaked (shared only via QR code, a channel considered trusted because it requires physical proximity).
- **Sender authenticity**: guaranteed by the Ed25519 signature, non-repudiable as long as the private key isn't compromised. The envelope's `timestamp` isn't covered by the signature (enabling resends, §6.5), but this doesn't affect the authenticated content or author.
- **No member revocation in v1**: leaving the group in the UI doesn't stop a malicious ex-member from continuing to decrypt past/future messages as long as they keep the `groupKey`. Documented as a known limitation.
- **Residual network traceability**: even encrypted, the plaintext `groupId` in the envelope lets a passive observer (BLE or server) correlate a group's activity over time, without reading its content. Acceptable for the intended use case (ephemeral, local), worth revisiting if a more sensitive use case emerges.
- **Compromised server**: cannot read content, but can observe metadata (who posts, when, IP, frequency, payload size). No anonymity guarantee against a malicious server operator.

---

## 13. Open items / v2

- `groupKey` rotation to support genuine member revocation.
- Payload compression before encryption (CBOR instead of JSON) to reduce BLE size.
- A real bloom filter for BLE sync (§7.4) instead of a raw list of `messageId`s.
- Server-side WebSocket/SSE to reduce latency compared to polling.
- Multi-device per identity (currently 1 identity = 1 device).
