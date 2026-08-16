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
