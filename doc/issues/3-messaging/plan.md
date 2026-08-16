# Issue 3 — Implementation plan

Plan derived from [spec.md](./spec.md). DB conventions (bigint identity PK, `created_at`/`updated_at`, singular table names, no `ON DELETE CASCADE`) per [[danslafoule-db]].

## 1. Backend: message store (`backend/app`)

- [x] `domain`: `Message` model — `id` (PK, bigint identity), `uuid` (unique, indexed), `content` (text), `received_at` (server default `clock_timestamp()` — not `now()`, which is frozen at transaction start in Postgres and would give same-transaction inserts an identical timestamp), `created_at`, `updated_at`.
- [x] `schemas`: `MessageCreateRequest` (`uuid`, `content`), `MessageResponse` (`uuid`, `content`, `received_at`).
- [x] `repositories`: `MessageRepository` — create, list received after a given timestamp, delete expired rows.
- [x] `services`: `MessageService` — post a message; fetch messages since a timestamp, purging expired ones first (lazy TTL purge — no scheduler).
- [x] `core`: `message_ttl_hours` config value (default 24), exposed as a `message_ttl` `timedelta` property, read via `pydantic-settings`.
- [x] `api`:
  - `POST /api/messages` — body `{uuid, content}` → `{uuid, content, received_at}`.
  - `GET /api/messages?since=<timestamp>` — returns non-expired messages with `received_at` after `since` (all non-expired if omitted).
- [x] Removed everything backend-side that wasn't the message store: `User`/`Group`/`GroupMembership`/`MessageReceipt` domain models, repositories, services, and routes; the now-unused `core/errors.py`; PostGIS (extension bootstrap, `geoalchemy2` dependency, the `,public` search_path addition) since location tracking is gone. Also removed the pre-existing `hello_worlds` demo slice (domain/repository/service/api/schema + its endpoint wiring) at the user's request, since it predates the app's real screens and had no remaining purpose.

## 2. Backend tests

- [x] Unit tests: TTL purge logic (messages older than TTL excluded/deleted; messages within TTL kept) — `test_message_service.py`, using `monkeypatch` on `settings.message_ttl_hours` for a fast, deterministic TTL window instead of waiting out the real default.
- [x] Repository/integration tests (Testcontainers Postgres): create + fetch-since, covered via `MessageService` unit tests against a real `db_session`.
- [x] API tests: `POST`/`GET /api/messages`, including the `since` filter — `test_messages_api.py`. 9 backend tests total, all passing.

## 3. Frontend: local store (`frontend/src`)

- [x] IndexedDB (via `idb`) store (`services/localCache.ts`) covering:
  - `profile` (`uuid`, `name`),
  - `groups` (`uuid`, `name | null` — null until learned from a message, for a joined-not-created group),
  - messages per group (keyed by `messages:<groupUuid>`, deduplicated by message `uuid`),
  - a single global `watermark` (last-seen `received_at`) for incremental polling.
- [x] Message content envelope (`services/messageService.ts`): JSON `{groupUuid, groupName, authorUuid, authorName, text}`, encoded on send, decoded on fetch; malformed/foreign content is silently skipped (`decodeEnvelope` returns `null`).
- [x] Services: `userService.ts` (local profile get/set, no backend calls), `groupService.ts` (local create/join/list, no backend calls — joining always succeeds, there's nothing server-side to fail against), `messageService.ts` (`sendMessage`/`syncMessages` wrapping `POST`/`GET /api/messages`, filtering fetched messages to groups the device already knows about, and opportunistically learning/refreshing a group's name from an incoming message via `localCache.upsertGroup`).

## 4. Frontend screens (Siemens iX)

- [x] Onboarding: name entry, stored locally (no location-sharing UI — that feature is gone along with the backend user registry).
- [x] Home: groups list (local), "create group" (local), "join group by UUID" (local, always succeeds) — join also sends the `Hello, I'm <name>` message.
- [x] Group screen: UUID display (copy affordance), message feed (poll every 5s → `syncMessages()` → re-read local store → render), a message-compose form (text input + send button) since the spec calls for actually sending messages, not just the automatic Hello. "Group name not yet known" renders as "Unnamed group", not an error.
- [x] App shell: `IxApplication`/`IxApplicationHeader`/`IxMenu`/`IxContent` per [[siemens-ix-react]] (already in place from before this rewrite; unaffected by the architecture change other than dropping the `ApiError`/offline-identity branches, since identity/groups no longer talk to a backend at all).

## 5. Frontend tests

- [x] Vitest: `localCache` (profile, group upsert/name-learning semantics, message merge/dedup), `userService`, `groupService`, `messageService` (envelope encode/decode, client-side group filtering, watermark advancement — mocked `fetch`), `Onboarding` component. 19 tests passing, `tsc -b` and `vite build` both clean.

## 6. E2E (Playwright, backend + Postgres Testcontainer)

- [x] Scenario 1 — A: fresh install, local identity created, no groups.
- [x] Scenario 2 — B: re-expressed as onboard once, `page.reload()`, confirm onboarding is skipped and the previously-created group is still there — there's no backend identity to pre-seed independently anymore, so "already exists" is only meaningfully testable as "was already established locally, then the page reloaded."
- [x] Scenario 3 — C: creates a group locally, sees it with its UUID.
- [x] Scenario 4 — D: joins C's group by UUID (separate browser context simulating a separate device); `Hello, I'm D` message sent through the real backend and visible to C's polling context.
- [x] Scenario 5 — A and B (separate contexts) share a group; A sends a message via the new compose form; both see it; `builder.count_rows(DanslafouleTable.MESSAGE) >= 1` after both have "received" it, confirming delivery doesn't trigger deletion (only TTL does, not exercised in this fast-running test).
- Fixed one flake along the way: `get_by_text("Send")` (case-insensitive substring match) was matching the send-icon's `<desc>send-right</desc>` instead of the button — added `data-testid="send-message-button"` to the button and switched the page object to that locator, same pattern as the earlier `ix-input[name="..."] input` / `page.locator('[data-testid="..."]')` gotchas.
- 5/5 e2e tests passing against a real Postgres Testcontainer (plain `postgres:16-alpine`, no longer PostGIS) and a real backend instance.

## 7. Validation against acceptance criteria

- [x] Walked spec.md's "Acceptance criteria" — all covered: local identity/group persistence (Vitest + e2e personas 1–2), group create/join always succeeding locally (Vitest `groupService` tests + personas 3–4), message send/fetch with server `received_at` (backend API tests + persona 5), TTL exclusion (backend unit tests, not separately re-verified in e2e since that would require waiting out or mocking the TTL in a real browser run), single-table DB (manual review of `backend/app/domain/`), Siemens iX UI with explicit states (loading spinners, `IxEmptyState` for no-groups/no-messages), and offline-after-sync readiness (unchanged from before — cache-then-network reads from IndexedDB, not separately re-tested this pass since the mechanism didn't change, only what's stored).

## Suggested execution order

1. Backend message store + TTL purge (steps 1–2)
2. Frontend IndexedDB local store + envelope (step 3)
3. Frontend screens (step 4) + their Vitest coverage (step 5)
4. E2E personas (step 6)
5. Acceptance-criteria pass (step 7)

## Log

<!-- One entry per completed step, newest at the bottom. Format: - YYYY-MM-DD — <step done> — <short note> -->
- 2026-08-16 — Full implementation of the message-relay architecture (steps 1–7), starting from a blank dev database (no migration needed, per the user). Backend, frontend, and e2e all green: backend 9/9 pytest, frontend 19/19 Vitest + clean `tsc -b`/`vite build`, e2e 5/5 Playwright. Also removed the pre-existing `hello_worlds` demo slice entirely (backend + any lingering references) at the user's request, since it had no remaining purpose once the app's real screens took over the root route.
