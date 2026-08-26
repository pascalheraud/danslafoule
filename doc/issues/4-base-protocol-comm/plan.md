# Issue 4 — Implementation plan

Plan derived from [spec.md](./spec.md) and the protocol spec
[`doc/dans-la-foule-protocol-spec-en.md`](../../dans-la-foule-protocol-spec-en.md) (§3–§6, §8, §9, §11).

Note: stale `__pycache__` artifacts under `backend/app/{domain,api,repositories,services,schemas}/`
reference `group`, `group_membership`, `user`, `message`, `message_receipt` modules with no matching
`.py` source in the tree — leftovers from an earlier, since-reverted attempt. No source to reuse, but
kept as a naming hint (`group`/`membership`/`message`/`message_receipt` domain vocabulary) for this
plan's own naming below.

## 1. Shared envelope/payload contract

- [x] Write down the `Envelope` and payload `type` shapes as Pydantic schemas in
      `backend/app/schemas/envelope.py` (opaque as far as the backend is concerned: it only validates
      the envelope's outer shape — `v`, `groupId`, `messageId`, `senderPub`, `nonce`, `ciphertext`,
      `signature`, `timestamp` — never the encrypted payload).
- [x] Mirror the same shape as a frontend TypeScript type — landed in
      `frontend/src/features/protocol/types.ts` (not `envelope.ts` as originally named here) covering
      `Envelope` and the four payload types (`announce`, `chat`, `location`, `ack`).
- [x] Field-level constraints (sizes, base64 encodings) enforced in `envelope.py` validators; mirrored
      informally in the frontend's `payloads.ts` validators — no shared codegen, kept in sync by hand.

## 2. Backend relay (`backend/`)

- [x] `domain/message.py`: SQLAlchemy model for the `messages` table (§8.3: `message_id` PK,
      `group_id`, `envelope` JSONB, `received_at`).
- [x] `repositories/message_repository.py`: `save(envelope)` (upsert on `message_id`, refreshing
      `received_at` — needed for resend semantics, §6.5/§8.3), `list_since(group_id, since)`,
      `purge_older_than(cutoff)`.
- [x] `services/message_service.py`: orchestrates validation (envelope shape only, not crypto) +
      repository calls; `core/rate_limit.py` provides a simple in-memory per-IP sliding-window
      rate-limiting hook (§8.1) used by the POST endpoint.
- [x] `api/messages.py`: `POST /api/v1/groups/{group_id}/messages` (201/429/400) and
      `GET /api/v1/groups/{group_id}/messages?since=...` (deviation: prefixed with `/api` like the
      existing `hello` router, instead of a bare `/v1` — consistent with this app's own convention).
      `since` **superseded**: originally a unix-ms query param, then redesigned as an opaque,
      monotonically increasing `cursor` (backed by a Postgres sequence, `domain/message.py`'s
      `message_cursor_seq`) — see the 2026-08-16 log entry below for why the timestamp approach was
      wrong (client/server clock mismatch, and resend §6.5 needs a value that can move forward again
      without the client's own clock being involved).
- [x] Purge job: `services/message_purge.py`, an asyncio background loop (60s tick) started/cancelled
      from `app/main.py`'s existing lifespan, deleting rows with `received_at` older than 1h.
- [x] Pytest coverage: repository (save/list/purge, resend refreshes `received_at`), API (201/400
      paths, `since` filtering), rate-limit unit tests — Testcontainers Postgres per project
      convention. 27/27 passing.
- [x] Pytest coverage for malformed envelopes: missing/wrong-type fields, invalid base64, wrong-length
      `senderPub`/`nonce`/`signature`, unknown `v`, non-UUID `groupId`, empty `ciphertext`/`messageId`
      → all rejected with `400` (via a `RequestValidationError` handler in `main.py` converting
      FastAPI's default 422 to the spec's 400), never persisted (`tests/test_message_api.py`,
      `TestMalformedEnvelopeRejected`).

## 3. Frontend crypto & identity (`frontend/src/features/protocol/`)

- [x] `identity.ts`: generate Ed25519 keypair via Web Crypto API on first launch, persist in
      IndexedDB (JWK export/import — `extractable: true`; the Web Crypto API's non-extractable-key
      option isn't usable together with `exportKey`/IndexedDB persistence, so this is a deliberate
      deviation from the spec's "non-extractable if the API allows it" wording), `getOrCreateIdentity()`.
- [x] `crypto.ts`: envelope build (`encrypt` + `sign`) and verify (`verify` + `decrypt`) per §5;
      `shortId` in `identity.ts` (SHA-256 + base58, matching the spec exactly).
- [x] Vitest coverage: round-trip encrypt/decrypt, signature verification (valid + tampered cases +
      wrong group key), `shortId` stability/uniqueness (`crypto.test.ts`, `identity.test.ts`).
- [x] Vitest coverage for a well-formed, correctly signed/encrypted envelope whose **decrypted
      payload** doesn't validate: unknown `type`, missing required field, corrupted ciphertext (GCM
      tag mismatch). All resolve to `null` without throwing (`crypto.test.ts`); payload-shape
      validation itself lives in `payloads.ts` with its own dedicated tests (`payloads.test.ts`).

## 4. Frontend group model & invite payload

- [x] `group.ts`: `Group` type, local map persisted to IndexedDB (`createGroup()`, `saveJoinedGroup()`,
      `getGroup()`, `listGroups()`).
- [x] `invite.ts`: encode/decode the invite payload string (§4.2) — one shared codec (`dlf1:<base64url
      JSON>`) used by both join paths.
- [ ] **Still deferred**: QR rendering (new dep, e.g. `qrcode`) and QR scanning (camera access +
      decode lib, e.g. `@zxing/browser`/Capacitor plugin) — pure UI/device integration work, no
      protocol logic involved (the invite codec is done and tested). The invite *string* is shown/
      copyable as plain text (`Home`/`GroupScreen`'s "Copy invite"), so sharing already works
      end-to-end — only the QR-specific rendering/scanning affordance itself is missing.
- [x] Text-invite join path: `decodeInvite()` parses a pasted/entered invite string directly — same
      parser the QR path would use once built. Covers SMS/WhatsApp/copy-paste sharing, **now wired
      into a real screen** (`Home`'s "Join a group" form, §10).
- [x] Vitest coverage: invite encode/decode round-trip (incl. non-ASCII group names), URL-safe output,
      malformed-invite rejection (bad prefix, bad base64url, non-JSON, wrong version, wrong-length
      key, missing fields), and that "QR-decoded" vs "pasted-text" inputs converge on the same `Group`
      (`invite.test.ts`, `group.test.ts`).

## 5. Frontend payload handling & local storage

- [x] IndexedDB schema per §11: `identity`, `groups`, `members`, `messages`, `locations`, `seenCache`
      object stores (`db.ts`, one record per logical key inside each store).
- [x] `announce` handling: `members.ts#recordAnnounce` updates `members[groupId]` on receipt. Periodic
      re-send on a timer is UI/lifecycle wiring, deferred with the rest of §4's screens.
- [x] `chat` handling: `messages.ts#storeChatMessage`, dedup by `messageId`, `replyTo` carried through.
- [x] `location` handling: `locations.ts#storeLocation`, replace-not-accumulate, ignores out-of-order
      (older `sentAt`) updates.
- [x] `ack` handling: `messages.ts#recordAck` (idempotent per `(messageId, ackerPub)`) +
      `pipeline.ts#emitAck` (auto-emitted on valid `chat`/`location` receipt, itself idempotent against
      self-double-acking).
- [x] Manual resend action: `pipeline.ts#resendEnvelope` — refreshes `timestamp` only, everything else
      untouched.
- [x] Vitest coverage for each payload handler and the resend/dedup path (`members.test.ts`,
      `messages.test.ts`, `locations.test.ts`, `seenCache.test.ts`, `pipeline.test.ts`).
- [x] Vitest coverage per handler for schema-invalid input of its own type, at the `payloads.ts`
      validator level (`payloads.test.ts`: out-of-range lat/lon, negative accuracy, missing
      `ackedMessageId`, empty/missing `text`, wrong-type `replyTo`, etc.) and end-to-end through the
      pipeline (`pipeline.test.ts`'s "malformed input rejected end-to-end" block) — confirms a bad
      payload never reaches `members`/`messages`/`locations` storage.

## 6. HTTP transport wiring & unification

- [x] `relayService.ts`: thin client for the two backend endpoints (`postEnvelope`,
      `fetchEnvelopesSince`).
- [x] Polling loop (`polling.ts`, `startPolling`/`pollOnce`, default 7s interval within the spec's
      5–10s range) feeding retrieved envelopes into the shared `onEnvelopeReceived` pipeline (§9) — no
      BLE branch, since none exists yet in this issue's scope.
- [x] Outgoing sends (new message / resend / ack) go through `relayService.postEnvelope` — wired as the
      pipeline's injected `send` dependency, so `pipeline.ts` stays transport-agnostic and testable
      without a network call.
- [x] Vitest coverage: dedup via `seenCache` and correct handling of both freshly-received and re-sent
      envelopes is covered in `pipeline.test.ts` (`dedups an already-seen envelope`,
      `does not double-ack a resent envelope`). `polling.ts` itself (network-facing glue) has no direct
      unit test — it's a thin wrapper over already-tested `relayService`/`pipeline` calls; deferred to
      the e2e scenario (§7) once that's built, rather than mocked in isolation.

## 7. End-to-end scenario

- [x] Playwright e2e scenario landed in `e2e/tests/test_groups_scenario.py`:
      `test_device_a_creates_device_b_joins_via_invite_chat_and_ack` — two browser contexts, device A
      creates a group, device B joins via the text invite path, A sends a `chat` message, B receiving
      and rendering the plaintext proves decryption succeeded (relay only ever sees ciphertext), and A
      is asserted to record an ack from B. Acks have no UI surface (§6.5 is pure protocol bookkeeping),
      so that last assertion reads the `danslafoule-protocol` IndexedDB store directly
      (`AppPage.has_ack_for_group`) rather than the DOM — see the 2026-08-23 log entry.
      `pages/app_page.py` was rewritten against the real app (it still targeted a bare-group-uuid join
      flow and a since-removed auto "Hello, I'm X" chat message from the old, pre-protocol messaging
      feature) and the two pre-existing scenario files were fixed to match. 8/8 e2e tests green,
      re-run twice for stability.
- [x] Already wired into the existing `e2e` CI job (`.github/workflows/ci.yml`) — no new job needed.

## 8. Documentation & conventions

- [x] Added the Issue 4 entry to the repo-root `CHANGELOG.md` (§7 landed, so it describes the
      complete, e2e-verified slice rather than "UI exists but only manually exercised").
- [x] Cross-checked the protocol spec doc against the implementation; deviations found and recorded
      inline in this plan (§1–§2): backend routes prefixed `/api/v1/...` not `/v1/...`; `since` ended
      up as an opaque cursor (see §2's updated entry), not a timestamp or `messageId`; Ed25519 private
      key stored `extractable` (JWK export/import) rather than non-extractable. None affect wire
      compatibility with a future BLE implementation.
- [x] spec.md updated with an "Addendum — messaging UI" section documenting the §10 scope added during
      implementation (client-side pause, scroll/unread UX, routing) — none of it changes the protocol
      wire format.

## 9. Validation against acceptance criteria

- [x] Group create/join both paths (invite *codec* + text UI, §10): done and tested; QR *rendering/
      scanning* itself still deferred (§4) — copy/paste text invite is the fully working path today.
- [x] Chat relay + decrypt, ack tracking, resend/dedup: done and tested end-to-end at the protocol
      layer (`pipeline.test.ts`), through the real HTTP relay in a Testcontainers-backed FastAPI
      instance (`test_message_api.py`), manually exercised through the real UI (§10), **and now
      covered by an automated two-device Playwright e2e run** (§7).
- [x] Server opacity: confirmed — `backend/app/schemas/envelope.py` never touches `ciphertext`
      contents; `test_message_repository.py`/`test_message_api.py` assert only the opaque envelope
      round-trips through storage.
- [x] 1h purge: `purge_older_than` tested directly; the asyncio loop wiring itself untested (would
      require a real 1h wait or time-mocking the event loop, not worth it for a fixed, simple
      `DELETE ... WHERE received_at < cutoff` job).
- [x] CI: not yet re-run in GitHub Actions from this session; `poetry run pytest` (25/25 backend,
      8/8 e2e) and `npm run build` + `npx vitest run` (106/106) verified locally, matching what CI
      runs per the existing `ci.yml` jobs.

## 10. Messaging UI (added during implementation, see spec.md's addendum)

Not in the original plan — built in direct response to hands-on testing/user feedback once the
protocol/logic layer (§1–§6) was in place. Backend untouched by any of this.

- [x] `Onboarding` screen: pseudo capture, pre-app gate (not a route — see App.tsx's comment on why).
- [x] `Home` screen: group list (cards with name, pause/play toggle), "Create a group" and "Join a
      group" forms (the latter accepts an invite string, not a bare group id — joining needs the key).
- [x] `GroupScreen`: chat view, header with invite-copy + pause/play, message list, send form.
- [x] Routing: React Router v6 (`BrowserRouter`), `routes.ts`/`useAppNavigate`/`buildRoute` typed
      navigation, `/` and `/groups/:groupId` — Back/Forward/F5 all correct.
      `ScrollRestoration.tsx` resets scroll to top on a real page change (not on an anchor-hash-only
      change). Anchor links (`buildRoute.homeAnchor`) scroll Home to its create/join forms from the
      app menu.
- [x] Client-side inactivity pause: `Group.paused`/`Group.lastActiveAt` (protocol layer),
      `groupService.ts`'s one-directional auto-pause check + manual `setGroupPaused`. Toggle available
      in the group list, the group screen header, and the app menu — each shows a toast on change.
- [x] Chat scroll UX: `GroupScreen`'s "auto"/"scrolling" state machine, floating scroll-to-bottom
      button (shown only when scrolled away), 30s new-message highlight (a recurring sweep effect, not
      one `setTimeout` per message — see the 2026-08-16 log entry for why), own-message vs.
      other-message alignment/color.
- [x] Unread tracking: `Group.unreadCount` (protocol layer, persisted — not per-screen React state),
      incremented by `pipeline.ts` on receipt of a `chat` message not authored by this device, cleared
      by `GroupScreen` once the user reaches the bottom. Surfaced in the group list, the group screen's
      floating button, the app menu (`GroupsMenu`), and the header (`HeaderActiveGroup`, §10 below).
- [x] App menu (`GroupsMenu`): "Me", "All groups", "Create a group", "Join a group" (both
      anchor-linked to Home), then the live group list with name/pause-toggle/unread-badge. Clicking
      any item collapses the (mobile/overlay) menu. Flat `IxMenuItem` list, not `IxMenuCategory` (see
      the 2026-08-16 log entry: the category component's own nested scroll region fought with the
      menu's single outer scrollbar).
- [x] Header active-group indicator (`HeaderActiveGroup`, `app/recentGroup.ts`): next to the app name,
      the most recently *viewed* group with its unread badge — narrowed from an earlier "every unread
      group" list after feedback that a single, predictable "group I was just in" shortcut was what
      was actually wanted.
- [x] "Me" screen (`/me`, `features/me/MeScreen.tsx`) and pseudo renaming: a new `rename` payload type
      (protocol spec §6.4) broadcasts `{oldPseudo, pseudo}` to every group on save
      (`messageService.broadcastRename`); recipients update the member table and get a synthesized
      "*oldPseudo* is now *pseudo*" system notice in the chat feed (`ChatMessageView` became a
      `ChatMessageEntry | SystemMessageEntry` union — see `GroupScreen`'s `SystemMessageItem`).
      `oldPseudo` travels in the payload itself (not looked up from the recipient's local `members`
      table) per user feedback — a recipient that missed the original `announce` would otherwise have
      no "old name" to show.
- [x] Toast duration halved (2500ms, from Siemens iX's 5000ms default) via a shared `app/toast.ts`
      wrapper — every `showToast` call site now imports from there instead of `@siemens/ix-react`
      directly, so the delay (or any other shared default) is tuned in one place.
- [x] Vitest coverage exists for the underlying services (`groupService.test.ts`,
      `messageService.test.ts`, `profileService.test.ts`) and for `Onboarding`/`Home` at the
      component level; deeper component-level interaction tests (Siemens iX's Stencil web components
      don't wire up custom events like `valueChange` reliably under jsdom) are covered instead by the
      real-browser Playwright e2e suite (§7), which now exists and exercises onboarding, create/join,
      chat send/receive, and pause/unread UI end to end.

## 11. Offline-first messaging, delivery receipts, group members & connectivity (added post-closure)

Not in the original plan, and added after §1–§10 had already closed — built in direct response to a
new round of hands-on testing/feedback, the same way §10 was. Backend untouched by all of it; every
new payload/state stays opaque to the relay like everything else in this issue.

- [x] Offline send queue: `messages.ts`'s `OutboxEntry`/`addToOutbox`/`removeFromOutbox`/`getOutbox`,
      `messageService.ts#queueChatMessage` (stores + shows the message locally as `"pending"`
      immediately, before any network attempt) and `flushOutboxes` (retries every group's queue,
      called right after a user-initiated send and on every `globalPoller` tick).
- [x] WhatsApp-style delivery status per own message (pending → sent → acked by one → acked by all),
      `messageService.ts#deriveDeliveryStatus`, rendered via `GroupScreen.tsx`'s `DeliveryTicks`.
- [x] Member snapshot per message (`StoredChatMessage.knownMemberPubs`, captured at send time in
      `queueChatMessage` and at receive time in `pipeline.ts`'s `chat` case): delivery status and the
      message-detail recipient list are computed against *this* snapshot, never the group's live
      member list — a member who joins later never becomes a retroactive expected recipient of older
      messages. Fallback to the live member list for pre-existing local data stored before this field
      existed (no IndexedDB migration; see `db.ts`'s `DB_VERSION` comment for the broader open question
      of when a real migration/reset strategy becomes necessary).
- [x] "Group members" screen: `messageService.ts#getGroupMembers`, a button in `GroupScreen`'s header
      opening an `IxModal` listing every known member (pseudo, last-seen), self included.
- [x] Message detail screen: `messageService.ts#getMessageReceipts`, opened by tapping any message —
      the sender listed first (marked distinctly, not as an acked/not-acked row) then every other
      member from that message's own snapshot, marked seen/not-seen.
- [x] "X joined the group" system notice: `members.ts#recordAnnounce` now returns whether the pubkey
      was new, `pipeline.ts`'s `announce` case synthesizes the notice (via the same `storeSystemEvent`
      the `rename` notice already used) only the first time a given member is seen — a repeat
      `announce` (re-join, periodic re-send) doesn't duplicate it.
- [x] Rename notice wording changed from "X is now Y" to "X is now known as Y" (`pipeline.ts`, and the
      protocol spec's own §6.4 description of it, kept in sync as the spec's own rule requires).
- [x] Server connection indicator: `relayService.ts` derives online/offline state from the outcome of
      its own existing traffic (send/poll), no dedicated health-check request; `ConnectivityIndicator.tsx`
      renders it as a fixed-position icon (portaled onto `<body>`, not slotted into
      `IxApplicationHeader`, whose secondary slot collapses into a "more" dropdown below the sm
      breakpoint — defeating the point of an always-visible status on mobile) with a popup on click.
      `HeaderActiveGroup` moved to the same fixed/portaled pattern for the same reason, which let the
      header's now-always-empty "more" toggle disappear on its own (Siemens iX auto-hides it when its
      slots have no assigned content).
- [x] Fixed a real, pre-existing bug found while testing this: `globalPoller.ts`'s `tick()` had no
      error handling around `syncMessages` — a single relay failure (e.g. a 500, or the relay simply
      being down) threw past the `setTimeout` reschedule at the bottom of the function, permanently
      killing the polling loop until a full page reload, with no visible symptom beyond "nothing
      updates anymore". Fixed with a `try/finally` guaranteeing the reschedule always happens, plus a
      per-group `.catch()` so one group's failure doesn't block the others. Regression-tested in
      `globalPoller.test.ts` (verified failing against the old code, passing against the fix).
      Related: `GroupScreen.tsx`'s unconditional `<IxSpinner>` while `group` was `null` was removed —
      `GroupHeader()` already has a `group?.name ?? "Unnamed group"` fallback, so the spinner added no
      information and, combined with the above bug, could spin forever with no way to tell a slow load
      from a dead poller.
- [x] Persona e2e scenarios (see below) landed in `e2e/tests/test_offline_delivery_and_snapshot_scenario.py`
      and `e2e/tests/test_members_join_and_connectivity_scenario.py`, plus new `AppPage` helpers
      (`delivery_status`, `open_members`/`member_rows`/`wait_for_member`, `open_message_detail`/
      `receipt_rows`, `close_modal`, `wait_for_system_event`, `connectivity_status`/
      `open_connectivity_popup`, `wait_for_text`). Scenario 6 (join notice idempotence) turned out to
      have no reachable path through today's UI — Home's join flow short-circuits to an "already a
      member" toast without re-announcing when the invite is for a group the device already knows, so
      there's no way to make it emit a second real `announce` envelope from the browser. Moved that
      specific assertion to a Vitest unit test instead (`pipeline.test.ts`: "synthesizes a 'joined the
      group' notice on the first announce from a member, not on a later one", feeding
      `onEnvelopeReceived` two distinct `announce` envelopes directly), which can and does exercise it;
      the e2e scenario itself was trimmed to just "join shows the notice" (`test_join_shows_a_system_notice`).
      6/6 e2e tests green (scenarios 1–5 and 7 all passed as designed, scenario 6 covered as above),
      108/108 Vitest, `tsc -b` clean.
- [x] `doc/general-spec.md` update — done.

### Persona scenarios (this section)

Personas: **Alice** (creates the group), **Bob** (joins early), **Carol** (joins later, after Alice's
first message).

1. **Alice sends while offline** — Alice's connection drops; she sends "hi offline", which appears
   immediately marked as not-yet-sent and stays that way for at least one poll interval; once her
   connection returns, it's sent automatically with no action from her.
2. **Two-member delivery reaches "seen by everyone"** — Alice and Bob share a group; Alice sends a
   message, Bob receives it, and Alice's copy progresses to "seen by everyone" (not stuck at "seen by
   some") since Bob is the only other member.
3. **A later-joining member doesn't retroactively apply** — Alice and Bob share a group and fully
   exchange a message (reaches "seen by everyone"). Carol then joins. A new message Alice sends
   afterward expects Carol as a recipient; the earlier message's status and detail screen are
   unaffected by Carol ever existing.
4. **Group members list** — opening the members screen shows every known member, including oneself.
5. **Message detail lists the sender first** — tapping any message shows its sender first, marked
   distinctly, then every other expected recipient with their seen/not-seen state.
6. **Join notice, once** — a device joining a group produces a "X joined the group" notice for other
   members, exactly once even if that device's announce is seen again later (idempotent).
7. **Connectivity indicator** — reflects the real online/offline state of the underlying send/poll
   traffic, and clicking it opens a popup with that status.

## Suggested execution order

1. Shared envelope/payload contract (§1) — unblocks both sides in parallel.
2. Backend relay + purge job (§2).
3. Frontend crypto & identity (§3).
4. Frontend group model & invite payload, both join paths (§4).
5. Frontend payload handling & local storage (§5).
6. HTTP transport wiring & unification (§6).
7. E2E scenario (§7) — done.
8. Documentation (§8) — changelog entry (§12) still pending, now unblocked.
9. Final acceptance-criteria pass (§9).
10. Messaging UI (§10) — done, out of original order, driven by user feedback after §1–§6 landed.

## Log

<!-- One entry per completed step, newest at the bottom. Format: - YYYY-MM-DD — <step done> — <short note> -->
- 2026-08-16 — Implemented §1–§3, §5, §6, and the non-UI parts of §4 (all protocol/business logic,
  no UI). Backend: `app/schemas/envelope.py`, `app/domain/message.py`, `app/repositories/message_repository.py`,
  `app/services/message_service.py`, `app/core/rate_limit.py`, `app/api/messages.py` (mounted at
  `/api/v1`), `app/services/message_purge.py` wired into `main.py`'s lifespan, plus a
  `RequestValidationError` → 400 handler so malformed envelopes match the spec's contract instead of
  FastAPI's default 422. 27 pytest tests (`test_message_repository.py`, `test_message_api.py` incl. a
  dedicated `TestMalformedEnvelopeRejected` class, `test_rate_limit.py`), all passing against a real
  Testcontainers Postgres. Frontend: full `frontend/src/features/protocol/` module — `types.ts`,
  `bytes.ts`, `db.ts` (IndexedDB wrapper, `fake-indexeddb` added as a dev dep for testing),
  `identity.ts`, `crypto.ts`, `payloads.ts`, `invite.ts`, `group.ts`, `members.ts`, `messages.ts`,
  `locations.ts`, `seenCache.ts`, `pipeline.ts`, `relayService.ts`, `polling.ts`. 71 Vitest tests
  passing, `tsc -b` clean, `npm run build` clean. Deferred out of this pass: QR code
  rendering/scanning UI (§4 — no protocol logic involved, pure device/camera integration), the actual
  group-creation/chat React screens, and the Playwright e2e scenario (§7), which needs those screens
  to exist. Deviations from the original plan text, all harmless: backend routes live under
  `/api/v1/...` (matching this app's existing `/api` convention) not bare `/v1/...`; `since` is a
  unix-ms query param, not `messageId|timestamp`; the Ed25519 private key is stored as an extractable
  JWK (IndexedDB via `exportKey`/`importKey`) rather than non-extractable, since the two aren't
  compatible with each other in the Web Crypto API. Not re-verified against the real local Postgres
  container manually (its stored credentials no longer match `.env.dev` — a pre-existing environment
  drift unrelated to this change); Testcontainers-based pytest is this project's authoritative
  verification path and is green.
- 2026-08-16 — Fixed a bad merge: the branch had diverged before "feature 3" (a simple, pre-protocol,
  non-encrypted `uuid`/`content` messaging feature) landed, and merging it in resolved almost every
  conflict by concatenating both versions instead of picking one — `main.py`, `domain/message.py`,
  `repositories/message_repository.py`, `services/message_service.py`, `api/messages.py` all ended up
  with duplicated imports/functions/routes, two competing `/api/messages` (flat) and
  `/api/v1/groups/{id}/messages` (protocol) endpoints in the same files, and a dangling import of an
  already-deleted `hello` module. Removed the entire non-protocol messaging path (old schemas, routes,
  tests) and kept only the Envelope-based one, while adopting feature 3's genuinely good additions:
  structured logging (`@logged`, correlation-id middleware), the DB PK convention (bigint identity +
  separate business identifier column, singular table names, `created_at`/`updated_at`), and
  `get_db()`'s auto-commit. 23/23 backend tests green after the cleanup. Frontend: same story —
  `messageService.ts`/`groupService.ts` had been built by feature 3 against the old flat endpoint with
  a fake plaintext "envelope" (`JSON.stringify` of `{groupUuid, text, ...}`, no crypto at all); rewired
  both to actually use `features/protocol/*` (real Ed25519/AES-GCM envelopes, `groupKey`-bearing
  invites). Retired the now-redundant `services/{identity,userService,localCache,apiClient}.ts` in
  favor of a slim `profileService.ts`. The "join a group" UI had to change from a bare group-UUID
  field to an invite-string field, since joining is cryptographically meaningless without the key.
- 2026-08-16 — Redesigned `since`/polling from a unix-ms timestamp to an opaque, monotonically
  increasing `cursor` (backed by `message_cursor_seq`, a Postgres sequence — `domain/message.py`).
  Root cause: the frontend was watermarking its polling `since` off `envelope.timestamp` (client
  clock, refreshed on resend) while the backend filtered on `received_at` (server clock) — a mismatch
  that could silently skip messages on clock drift, and, worse, a resend (§6.5) bumping only
  `received_at` while an id-based cursor stays frozen would never resurface to a client that already
  polled past it. Fixed by making `MessageRepository.save()` assign a fresh `cursor` from the sequence
  on *both* insert and resend-update, and having the GET endpoint return `{envelope, cursor}` per item
  instead of a bare envelope list. Frontend (`relayService.ts`, `polling.ts`, `messageService.ts`)
  updated to track `cursor`, never `envelope.timestamp`, as the watermark.
- 2026-08-16 — Built the full messaging UI (§10 above) in response to a long sequence of hands-on
  testing/feedback: Onboarding/Home/GroupScreen screens, React Router v6 routing with scroll
  restoration and anchor links, client-side inactivity pause (manual + automatic), the chat
  auto/scrolling scroll-state machine with a floating scroll-to-bottom button, a 30s new-message
  highlight (redesigned mid-session from N independent `setTimeout`s to a single recurring sweep
  effect, after the per-timer version was observed to leave highlights stuck — most likely individual
  timers getting orphaned by Vite HMR swapping the component mid-session, though the sweep design is
  more robust regardless of root cause), persisted per-group unread counts surfaced in four places
  (group list, group screen, app menu, app header), and an app-menu "Create/Join a group" shortcut.
  Two new generic skill rules came out of this: `frontend/web`'s "every page must support Back,
  Forward, and reload" and its scroll-to-top corollary, cross-referenced from `danslafoule`'s frontend
  section. 90/90 frontend Vitest tests green, `tsc -b` and `npm run build` clean; backend untouched by
  any of this (25/25 pytest still green). CI not re-run from this session.
- 2026-08-16 — Follow-up UI fixes on §10, all frontend-only, 90/90 Vitest still green after each:
  own vs. other message alignment/background (right/light-green for the current device's messages,
  left/neutral for everyone else's — `GroupScreen.module.scss`'s `.messageSelf`/`.messageOther`);
  fixed the group-list pause/play toggle not actually landing at the card's right edge (the flex row
  had no explicit `width: 100%`, so it was shrink-wrapped by `IxCardContent`'s own layout, leaving
  `margin-left: auto` nothing to push into); the app menu now collapses when a group is clicked
  (`IxMenu`'s `expand` prop lifted to `App.tsx`, `GroupsMenu` takes an `onNavigate` callback); replaced
  `IxMenuCategory` with a flat `IxMenuItem` list under a plain label — the category component gives
  its own expanded sub-items a separate internal scroll region (built for the collapsed-rail flyout
  case), which produced a second, nested scrollbar for the group list instead of the whole menu
  scrolling as one unit like the rest of `ix-menu` already does by design.
- 2026-08-16 — Three more UI fixes on §10: `GroupScreen`'s back button now always targets
  `ROUTES.home` instead of `navigate(-1)` — a deliberate exception to the routing skill's usual
  Rule 2, since a group can be opened from the menu/a reload/an anchor link with no meaningful
  "previous page" in browser history; own-message highlight fixed by applying the "new" background as
  an inline `style` instead of a CSS class (`.messageNew`), removing any dependency on stylesheet rule
  order relative to `.messageSelf`/`.messageOther` (same specificity, so which one visually "won" was
  fragile); clicking a paused group (from the group list, the app menu, or the header's unread list)
  now shows an informational toast ("This group is paused — resume it to see new messages") without
  blocking navigation — the group is still readable, just not actively polled.
- 2026-08-16 — Added the `rename` payload type (protocol spec §6.4) end to end: `types.ts`/
  `payloads.ts` (validated, `oldPseudo` carried in the payload itself per user feedback rather than
  looked up locally), `pipeline.ts` (updates the member's pseudo, synthesizes a system notice via the
  new `messages.ts#storeSystemEvent`/`getSystemEvents`, skipped if `oldPseudo === pseudo`),
  `messageService.ts#broadcastRename` (fans out to every known group), `profileService.ts#setProfilePseudo`
  now triggers a broadcast on a genuine rename (not on the very first, onboarding pseudo — no groups
  exist yet then anyway). New `/me` screen (`features/me/MeScreen.tsx`) to trigger it, linked from the
  app menu. `ChatMessageView` (`services/types.ts`) became a `ChatMessageEntry | SystemMessageEntry`
  union so `GroupScreen` can render rename notices centered/muted instead of as a chat bubble.
  Also this session: replaced the header's "every unread group" list with `HeaderActiveGroup` (the
  single most-recently-*viewed* group, tracked via a new localStorage-only `app/recentGroup.ts`, not
  protocol state) shown in `IxApplicationHeader`'s `secondary` slot (right after the app name, not the
  far-right default slot); halved the default toast duration to 2500ms via a shared `app/toast.ts`
  wrapper replacing direct `@siemens/ix-react` `showToast` imports everywhere. 11 new Vitest tests
  (`payloads.test.ts`, `pipeline.test.ts`, `messageService.test.ts`, `profileService.test.ts`) —
  101/101 total, `tsc -b` and `npm run build` clean. Protocol spec doc (`dans-la-foule-protocol-spec-en.md`
  §6.4) and this issue's spec.md addendum updated to match. Backend untouched — `rename` is opaque to
  it like every other payload type.
- 2026-08-23 — Landed §7 (e2e) and closed out the plan. Two TypeScript regressions in the working tree
  (`HeaderActiveGroup`'s `SetStateAction` narrowing, `GroupScreen` filtering `SystemMessageEntry` for
  `isSelf`) were blocking `npm run build`; fixed both before anything else could run. `e2e/pages/app_page.py`
  and its two pre-existing scenario files (`test_groups_scenario.py`,
  `test_unread_badges_and_message_colors.py`) still targeted issue 3's plaintext flow (bare group-uuid
  join, an auto "Hello, I'm X" chat message on join) — neither had ever run successfully against the
  real protocol build. Rewrote `AppPage` against the actual app (invite-string join, no visible
  group-id element so the group screen's URL is now the source of truth, clipboard-based invite
  copying with `browser_context_args`/`new_context(permissions=...)` granting clipboard access) and
  fixed both files' assumptions (unread badges only accumulate while sitting on Home, not while the
  group screen is open and auto-clearing on receipt; a freshly-arrived message is still "new"/blue,
  not yet plain "other"/grey). Added the actual §7 acceptance scenario,
  `test_device_a_creates_device_b_joins_via_invite_chat_and_ack`: two devices, invite join, chat
  send/decrypt, and an ack assertion read directly from the `danslafoule-protocol` IndexedDB store
  (`AppPage.has_ack_for_group`) since acks have no UI surface at all. Along the way, found and fixed a
  real backend bug: `/groups/:id` (and any other React Router path) 404'd on direct navigation or
  reload, because `StaticFiles(html=True)` only serves `index.html` for `/` and real directories, not
  as a SPA fallback for arbitrary client-side routes — added `SPAStaticFiles` (retries `index.html` on
  any 404) in `app/main.py`. 8/8 e2e tests green, re-run twice for stability (one earlier flake in a
  color assertion, fixed with a short settle wait after message send rather than reading computed
  style on the same tick as the DOM update — see `test_sender_sees_own_messages_in_green_...`). Backend
  25/25, frontend 106/106 all still green. Added the Issue 4 entry to the repo-root `CHANGELOG.md`
  (§8). This closes every remaining item in the plan except QR invite rendering/scanning (§4), which
  was always scoped as pure UI/device integration work, not protocol logic, and remains a clean
  candidate for a follow-up issue rather than this one.
- 2026-08-26 — Landed §11: offline send queue, WhatsApp-style delivery status with a per-message
  member snapshot (no retroactive expectations on later joiners), a group-members screen, a message
  detail/receipts screen, a "joined the group" system notice, a server-connectivity indicator, and a
  fix for a real pre-existing bug (`globalPoller.ts` dying permanently on any relay failure). Wrote the
  7 persona e2e scenarios into this plan first, then two new e2e test files plus `AppPage` helpers, then
  implemented; 6/6 e2e green (scenario 6's exactly-once guard moved to a Vitest unit test — no reachable
  path through today's UI to exercise a second real `announce`, see §11's checklist), 108/108 Vitest,
  `tsc -b` clean. `doc/general-spec.md` updated to match (offline queue, delivery status, member
  snapshot, members screen with self always listed, message detail/receipts, join notice,
  connectivity indicator) — §11 fully closed.
