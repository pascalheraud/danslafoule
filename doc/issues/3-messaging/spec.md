# Issue 3 — Groups and ephemeral messaging

## Purpose

Implement the first functional slice of Dans la foule: users are identified by a client-generated UUID, can set a display name, can create and join groups identified by a UUID, and can exchange ephemeral group messages relayed through a minimal backend.

The backend stores nothing but messages — a UUID, opaque content, and a server-assigned receipt timestamp. It has no notion of users, groups, or group membership; those are entirely client-side (IndexedDB), local to each device. Syncing user/group data across devices is not part of this iteration.

This iteration assumes normal network connectivity for sending and fetching messages. Offline-first / low-connectivity strategies — the app's core long-term differentiator — are out of scope here; see [[danslafoule]] for the broader project direction.

## Context

Dans la foule helps people find and talk to their friends in large crowds (festivals, ...) where mobile network coverage is poor or absent. The app is intended to run as a native Capacitor app on a phone.

Before tackling offline/low-connectivity strategies, the app needs its core domain in place: a user identity, groups, and a minimal ephemeral messaging mechanism. This issue delivers that foundation as a normal online web/React app (Capacitor packaging itself is not part of this issue), with the backend acting as a lightweight, time-expiring message relay rather than a registry of users or groups.

## Objectives

### 1. User identity

- On first launch, the frontend generates a UUID (client-side) and stores it, together with a chosen display name, in IndexedDB. This UUID is the user's identifier for all subsequent app usage on that device.
- On every subsequent launch, the frontend reads the identity from IndexedDB and reuses it.
- The user can set/edit their display name; it is stored locally only.
- There is no backend user registry and no user-related API endpoint. Identity lives entirely on the device.

### 2. Groups

- A group has a UUID and a name, both stored only in IndexedDB.
- Any user can create a group: the client generates the UUID, and the group is added to the user's local list of groups.
- The home screen lists the groups in the user's local list (name + UUID).
- A user joins a group by entering its UUID: the group is added to the user's local list. There is no server-side registry to validate the UUID against, so joining always succeeds locally.
- Joining a group automatically publishes a `Hello, I'm <name>` message to it (see §3).

### 3. Ephemeral, server-relayed messaging

- A message stored on the server has exactly three fields: `uuid` (identifies the message, client-generated), `content` (an opaque string the server never parses or validates), and `received_at` (a timestamp the server assigns at insertion time).
- `content` is a client-defined JSON envelope carrying whatever the frontend needs to interpret and route the message: at minimum the group UUID and name, the author's UUID and name, and the message text.
- Sending a message: `POST /api/messages` with `{uuid, content}`; the server stores it and returns `{uuid, content, received_at}`.
- Fetching messages: `GET /api/messages?since=<timestamp>` returns messages received after the given timestamp (all non-expired messages if `since` is omitted). This is a global, ungrouped stream — the frontend decodes each message's `content`, extracts its embedded group UUID, and keeps only the ones matching a group in the user's local list.
- The client tracks the latest `received_at` timestamp it has already fetched and passes it as `since` on the next poll, so polling only pulls new messages.
- Once fetched, a message is stored in the client's IndexedDB, keyed by its UUID and deduplicated.

### 4. Server-side message expiration

- The server purges messages older than a configured retention window (TTL), independent of whether any client has fetched them.
- Purge may be implemented lazily (e.g. a delete of expired rows run opportunistically on each read/write) rather than requiring a background scheduler.

## Expected deliverables

- Backend (FastAPI, Python 3.11, SQLAlchemy). Per [[danslafoule-db]]'s conventions (singular table name, `bigint generated` PK with a separate business `uuid` column):
  - `message` table: `id` (PK), `uuid` (unique, indexed), `content` (text), `received_at` (server default `now()`), plus the standard `created_at`/`updated_at`.
  - `POST /api/messages` — store a message, return it with server `received_at`.
  - `GET /api/messages?since=<timestamp>` — fetch non-expired messages newer than `since`.
  - TTL-based purge of expired messages.
- Frontend (React 19.2, TypeScript, Siemens iX):
  - IndexedDB-backed local store for device identity (uuid + name), the user's list of groups, and received messages (keyed by uuid), with a locally-tracked "last fetched" watermark for incremental polling.
  - Onboarding screen: name entry.
  - Home screen: list of the user's groups, "create group" action, "join group by UUID" action.
  - Group screen: display of the group UUID (with copy affordance), member's message feed, auto-refresh/poll for new messages.
  - A message content envelope (JSON) encoding at least `{groupUuid, groupName, authorUuid, authorName, text}`, built when sending and parsed when receiving.
  - Services layer encapsulating all backend calls and IndexedDB read/write, with explicit loading/empty/error/offline states.
  - The app shell built on Siemens iX's `IxApplication`/`IxApplicationHeader`/`IxMenu`/`IxContent` (see [[siemens-ix-react]]).
- Tests:
  - Backend: pytest unit/integration tests for the message store and TTL purge, and API tests for `POST`/`GET /api/messages` (including the `since` filter and expired-message exclusion).
  - Frontend: Vitest tests for the local identity/group store, the message envelope encode/decode, and the client-side group-filtering logic.
  - E2E (Playwright): the five persona scenarios below, against a real backend + Postgres Testcontainer.

## Persona scenarios (must be covered by tests, primarily E2E)

1. **A installs the app for the first time and signs up** — no local identity yet; one is generated, A sets a name, both stored in IndexedDB; A has no groups yet.
2. **B reopens the app and already exists** — IndexedDB already holds B's identity from a previous session; the home screen loads directly from local data, no onboarding shown.
3. **C has no group and creates one** — C creates a group locally; it appears immediately in C's group list with its UUID.
4. **D has no group and joins the group C created** — D enters C's group UUID; it's added to D's group list; D's join publishes a `Hello, I'm D` message; C, polling, receives and displays it.
5. **A and B share a group and exchange a message** — A sends a message; B, polling separately, fetches and stores it locally. The message is not deleted based on B having received it; it ages out of the server after the TTL, independent of either client's fetch state.

## Acceptance criteria

- A fresh install generates and persists a local identity (UUID + name) in IndexedDB; reused on subsequent launches.
- A user can create a group (local UUID + name) and see it on their home screen.
- A user can join a group by UUID; joining always succeeds locally and publishes a `Hello, I'm <name>` message.
- A message can be sent (`POST /api/messages`) and is stored with a server-assigned `received_at`; it can be fetched (`GET /api/messages?since=...`) by any client, filtered client-side to the groups that client knows about.
- Messages older than the configured TTL are excluded from fetch results.
- The database contains only a `message` table (uuid, content, received_at, plus standard timestamps).
- All five persona scenarios pass as automated E2E tests (Playwright) against a real Postgres Testcontainer and a real backend instance.
- The message-store/TTL-purge logic and the API layer are both covered by backend tests.
- The UI uses Siemens iX components, with explicit loading/empty/error/offline states for the flows above.
- Once identity/groups/messages have synced at least once, the app remains fully readable (groups list, group UUID, previously received messages) with the network disabled.

## Assumptions

- Message `uuid` is generated client-side.
- The message content envelope is JSON with at least `{groupUuid, groupName, authorUuid, authorName, text}`; exact field names/shape are an implementation detail for the plan.
- TTL duration is a backend config value, on the order of a day, not fixed numerically here.
- A group's name, for a device that joined rather than created it, is unknown until a message carrying that group's UUID is received; the UI must handle "name not yet known" as an explicit state, not an error.
- `GET /api/messages` returning a global, ungrouped stream, filtered client-side, is acceptable at this iteration's scale.
