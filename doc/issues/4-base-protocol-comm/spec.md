# Issue 4 — Base protocol communication

## Purpose

Implement the first working version of the inter-device communication protocol described in
[`doc/dans-la-foule-protocol-spec-en.md`](../../dans-la-foule-protocol-spec-en.md), restricted to the
**HTTP relay transport only**. BLE (§7 of the protocol spec) is explicitly out of scope for this issue
and left for a later one — the protocol envelope and payload formats are however designed to be
transport-agnostic from day one, so no rework of the message model will be needed when BLE is added.

## Context

The protocol spec (v0.1 draft) already defines the full target design: identity, groups, envelope,
payload types, BLE transport, HTTP transport, and client/local storage. This issue implements a
coherent vertical slice of that spec — everything needed for two or more devices to exchange
messages through the backend relay, with correct end-to-end encryption, without yet touching BLE.

## Scope

### In scope

1. **Identity model** (§3): Ed25519 identity keypair generated and stored client-side (IndexedDB),
   never transmitted.
2. **Group model** (§4): group creation (`groupId` + `groupKey`), the shared invite payload format
   (§4.2), and joining a group either by scanning a QR code or by pasting a shared text invite (SMS,
   WhatsApp, copy/paste, etc.) — both are the same underlying string, only the sharing channel
   differs.
3. **Message envelope** (§5): the transport-agnostic envelope (encryption, signing, verification on
   receipt) — implemented once, on the frontend, and reused for the HTTP transport now, and BLE later.
4. **Payload types** (§6): `announce`, `chat`, `location`, `ack`, and resend (rebroadcast) semantics.
5. **HTTP transport** (§8): backend relay endpoints (`POST`/`GET /v1/groups/:groupId/messages`),
   opaque envelope storage, fixed 1h purge job, client polling strategy.
6. **Client/HTTP unification hook** (§9): the `onEnvelopeReceived` pipeline, minus the BLE rebroadcast
   branch (no second transport to relay to yet).
7. **Local storage** (§11): IndexedDB schema for identity, groups, members, messages, locations,
   seen-cache.

### Out of scope (deferred)

- BLE transport (§7): GATT service, fragmentation, gossip loop prevention, iOS native plugin.
- The transport-selection/bridging logic that picks between BLE and HTTP — since only HTTP exists,
  every envelope always goes through it.
- `groupKey` rotation / member revocation (§13, v2).
- WebSocket/SSE push (§8.1, v2) — v1 uses polling only.
- Payload compression (CBOR) and bloom-filter sync — BLE-specific concerns.
- Multi-device per identity.

## Architecture impact

- **Frontend**: new `features/protocol` (or similar) area covering identity generation, group
  join/create, invite payload encode/decode (shared by both the QR and text-share join paths),
  envelope build/verify, and a `services/relay` HTTP client for the two endpoints.
  Crypto operations via the Web Crypto API (`crypto.subtle`), per §2 of the protocol spec.
- **Backend**: a new `messages` domain — `api` route handlers for the two endpoints, a `messages`
  repository backed by the `messages` table (§8.3), and a periodic purge job. The backend only ever
  handles opaque envelopes: no decryption, no knowledge of `groupKey`, no per-group membership
  concept server-side, consistent with the "server is never a source of truth" principle (§1, §10).
- **Shared**: the `Envelope` and payload `type` shapes should be documented once (e.g. in `shared/` or
  as backend Pydantic schemas mirrored by frontend TypeScript types) to avoid drift between the two
  sides, per the monorepo's frontend/backend contract rules.

## Expected deliverables

- Backend: `POST /v1/groups/:groupId/messages` and `GET /v1/groups/:groupId/messages?since=...`
  endpoints, minimal validation (envelope shape, rate-limiting), `messages` Postgres table + index,
  and the fixed-1h purge job.
- Frontend: identity generation/storage on first launch, group creation (invite payload generation,
  rendered both as a QR code and as a copyable/shareable text string), joining a group either by
  scanning the QR code or by pasting a shared text invite (same parser for both paths), envelope
  build + signature/encryption, envelope verification + decryption on receipt,
  `announce`/`chat`/`location`/`ack` payload handling, manual resend action.
- Frontend: polling-based retrieval from the relay, feeding into the same `onEnvelopeReceived`
  pipeline that BLE will later feed into.
- Tests: backend pytest coverage for the relay endpoints and purge job; frontend unit tests
  (Vitest) for envelope crypto (encrypt/decrypt/sign/verify) and payload handling; an e2e scenario
  covering two simulated devices exchanging a `chat` message through the relay.
- Documentation: this spec, a plan (`doc/issues/4-base-protocol-comm/plan.md`), and a changelog entry
  in the `danslafoule` project skill once implemented.

## Acceptance criteria

- A device can create a group and produce an invite payload matching §4.2, shown both as a scannable
  QR code and as a copyable text string.
- A second device can join that group either by scanning the QR code or by pasting the shared text
  invite (e.g. received via SMS/WhatsApp), and both join paths yield the same result; both devices
  can then see each other via `announce` messages relayed through the server.
- A `chat` message sent by one device is encrypted client-side, relayed opaquely by the server, and
  correctly decrypted and displayed by the other device(s) in the group.
- The server never has access to plaintext payload content or the `groupKey` at any point (verified
  by inspecting what's persisted server-side: only the opaque `Envelope` JSON).
- `ack` messages are emitted automatically on valid receipt and correctly tracked per message
  (`ackState`).
- A manual resend re-propagates an unchanged envelope (same `messageId`, refreshed `timestamp`) and
  is correctly deduplicated by devices that already have the message.
- Messages older than 1h are purged server-side; client-side history is unaffected by that purge.
- Existing CI (backend pytest, frontend Vitest, e2e) passes with the new coverage included.

## Addendum — messaging UI (scope added during implementation)

The original scope above (protocol/logic layer only, no screens) turned out to be too thin to
actually validate end-to-end: the user directed a full follow-up pass building the real messaging
UI on top of `features/protocol/*`/`services/*`, driven by hands-on testing rather than an upfront
spec. Recording it here after the fact, per this project's "document non-obvious decisions as soon
as they become structured" rule:

- **Screens**: `Onboarding` (pseudo capture, pre-app gate), `Home` (group list, create/join forms),
  `GroupScreen` (chat view) — Siemens iX components throughout.
- **Routing**: React Router v6 (`BrowserRouter`), so Back/Forward/F5 all work correctly — `/` and
  `/groups/:groupId`, typed via `routes.ts`/`useAppNavigate`, per the project's `frontend/react/routing`
  and `frontend/web` skills. Scroll-to-top on route change; anchor-based scroll (`/#create-group`,
  `/#join-group`) for the two menu shortcuts that jump to Home's forms.
- **Join UX**: joining an already-known group shows an info toast and opens it directly rather than
  erroring; copying an invite/toggling pause show toasts (success/error/info).
- **Client-side inactivity pause** (not in the original protocol spec): a group with no chat/location
  activity for 1h auto-pauses polling for it; the user can also pause/resume manually from the group
  list, the group screen, or the app menu. Auto-pause is one-directional (silence → paused); resuming
  is always an explicit user action. See `Group.paused`/`Group.lastActiveAt` in
  `features/protocol/types.ts` and `services/groupService.ts`.
- **Chat scroll UX**: two states, "auto" (follows new messages, scrolls to bottom) and "scrolling"
  (user scrolled away from the bottom — no forced scroll). A floating scroll-to-bottom button appears
  when scrolled away, with an unread-count badge. A just-arrived message is highlighted (light blue)
  for 30s. Own messages render right-aligned with a distinct (light green) background; others left-aligned.
- **Unread tracking**: persisted per group (`Group.unreadCount`, not per-screen React state) so it's
  visible consistently in the group list, the app menu, and the header — incremented by the protocol
  pipeline on receipt of a `chat` message not authored by this device, cleared once the user has
  actually scrolled to the bottom of that group's conversation.
- **Header active-group indicator**: `HeaderActiveGroup` shows, next to the app name (not a list of
  every unread group as first built — narrowed after feedback), the single most recently *viewed*
  group (`app/recentGroup.ts`, a localStorage-only UI memory, not protocol state) with its unread
  badge if any. Clicking it navigates there; a paused target shows the same "this group is paused"
  toast as elsewhere.
- **"Me" screen and pseudo renaming** (protocol spec §6.4, a new `rename` payload type): a dedicated
  `/me` screen lets the user change their cross-group display name. Saving broadcasts a `rename`
  envelope — `{ oldPseudo, pseudo }` — to every group the device currently belongs to
  (`messageService.broadcastRename`); the very first pseudo (onboarding) is not a rename and doesn't
  broadcast (no groups exist yet regardless). Recipients update the member's pseudo and synthesize a
  local-only system notice — "*oldPseudo* is now *pseudo*" — rendered centered/muted in the chat feed,
  distinct from a real `chat` bubble (`services/types.ts`'s `ChatMessageView` became a
  `ChatMessageEntry | SystemMessageEntry` union to carry this).
- **Toast duration**: halved from Siemens iX's own 5000ms default to 2500ms, via a thin
  `app/toast.ts` wrapper every call site now imports instead of `showToast` directly.

None of this changes the protocol wire format or the backend; it's additional client-side UX built on
top of the already-implemented protocol/relay layer.

## Non-goals

- No BLE implementation or BLE-specific abstractions in this issue.
- No admin/revocation flow for group membership.
- No production-grade anti-spam beyond basic rate-limiting.

## Assumptions

- The protocol spec (`doc/dans-la-foule-protocol-spec-en.md`) is the authoritative source for
  envelope/payload formats; this issue implements it rather than re-designing it. Any deviation found
  necessary during implementation must be reflected back into that spec document.
- QR code generation/scanning UI itself (camera access, QR rendering library choice) is treated as an
  implementation detail of this issue, not a separate protocol concern.

## Questions resolved or to confirm with the project

- Transport scope for issue 4: HTTP relay only, BLE deferred — confirmed by the user.
- Everything else (crypto choices, envelope shape, purge policy) follows the existing protocol spec
  as-is.

## Next step

Once this spec is validated, produce `doc/issues/4-base-protocol-comm/plan.md` breaking the
deliverables above into concrete backend/frontend/e2e implementation steps, following the monorepo's
layering conventions (`api/core/domain/services/repositories/schemas` on the backend,
`app/components/features/services/hooks` on the frontend).
