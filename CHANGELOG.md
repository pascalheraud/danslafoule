# Changelog

The project changelog follows the evolution of the monorepo with each issue.

Rules:
- a significant change must be added to this file,
- entries are ordered from newest to oldest,
- each entry must mention the context, purpose, and impact,
- issues must remain readable without rereading the whole codebase.

Format:

```markdown
### Issue X — YYYY-MM-DD
- Added:
- Modified:
- Fixed:
- Impact:
```

### Issue 4 — 2026-08-23
- Added: the real end-to-end encrypted protocol (spec §1–§11) replacing issue 3's plaintext relay —
  Ed25519 identity + AES-GCM envelopes, `announce`/`chat`/`location`/`ack`/`rename` payloads, an
  opaque-cursor HTTP relay (`POST`/`GET /api/v1/groups/{id}/messages`) with 1h purge and per-IP rate
  limiting, and a text-invite group join/create flow (QR rendering/scanning still deferred — the
  invite is a plain copy/paste string today). Full messaging UI on top: onboarding, home/group
  screens, React Router with scroll restoration, client-side inactivity pause, unread tracking
  surfaced in four places, a "Me" screen with pseudo renaming, and an app menu. Two-device Playwright
  e2e scenario covering create → invite join → chat → decrypt → ack.
- Modified: `since` redesigned from a client-clock timestamp to a server-assigned monotonic cursor,
  to fix a resend/clock-drift message-loss bug. Backend now falls back to `index.html` for any
  unresolved static path, so a reload/direct link on a React Router route (e.g. `/groups/:id`) no
  longer 404s.
- Fixed: a bad merge that had concatenated issue 3's plaintext messaging path with the new encrypted
  one (duplicated routes/imports across several backend files) — the plaintext path was removed
  entirely and the merge's genuinely good additions (structured logging, the DB PK convention,
  `get_db()` auto-commit) kept. Two frontend TypeScript regressions (`HeaderActiveGroup`'s state
  narrowing, `GroupScreen` filtering `SystemMessageEntry` as if it had `isSelf`) that had crept into
  the working tree and were blocking `npm run build`.
- Impact: backend 25/25, frontend 106/106, e2e 8/8, all green. Server never sees plaintext — only the
  opaque envelope round-trips through storage. Still deferred: QR invite rendering/scanning. Full
  decision trail in `doc/issues/4-base-protocol-comm/plan.md`.

### Issue 3 — 2026-08-16
- Added: user identity and groups, kept entirely client-side (IndexedDB, no backend persistence); ephemeral group messaging relayed through a minimal backend that only ever stores a message's `uuid`, opaque `content`, and server-assigned `received_at`, purged by TTL. Frontend: Siemens iX app shell (`IxApplication`/`IxApplicationHeader`/`IxMenu`) around `Onboarding`/`Home`/`GroupScreen`, a message-compose form, and a new logo. Playwright e2e coverage for all 5 spec personas.
- Modified: new `danslafoule-db` skill for DB conventions; documented that this project doesn't use dedicated hook files. DB role renamed `danslafoule` → `danslafouleapp`, decoupled from the schema name.
- Fixed: `get_db()` wasn't committing sessions — writes were silently lost across real HTTP requests (masked by the pytest suite's shared-transaction fixture, since fixed).
- Impact: backend 9/9, frontend 19/19, e2e 5/5, all green, starting from a blank dev database. Also removed the `hello_worlds` demo slice from issue 1, no longer needed. Details and the full decision trail are in `doc/issues/3-messaging/plan.md`.

### Issue 1 — 2026-08-10
- Added: initialization of the `danslafoule` monorepo (`backend/`, `frontend/`, `db/`, `doc/`), PostgreSQL dev environment via Docker Compose, FastAPI backend on Python 3.11 with SQLAlchemy persistence, and a fully working Hello n worlds slice — `GET /api/hello-count` backed by a `hello_worlds` table, a React `HelloWorlds` component consuming it, with pytest (backend) and Vitest (frontend) coverage. Confirmed exact stack versions: React 19.2, Node 25.6, TypeScript/SCSS frontend, Siemens iX component library, Vite dev/build modes served by the backend in build mode, Vitest + Playwright testing, and the full Python tooling set (Pyenv, Poetry, Pytest, cibuildwheel, Pyarmor, PyInstaller).
- Modified: creation of the project reference structure and the architecture/development convention documentation.
- Fixed: no major functional fixes; this issue focuses on building the technical foundation.
- Impact: end-to-end path verified locally (Postgres → SQLAlchemy → FastAPI → React, both dev and build modes). Verification in this sandbox used Python 3.12 and Node 20 (pyenv/Poetry/Node 25.6 unavailable here) — re-verify on the pinned exact versions before considering issue 1 fully closed. The project is otherwise ready for the next issue.
