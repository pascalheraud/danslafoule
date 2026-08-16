# Issue 1 — Implementation plan

Plan derived from [spec.md](./spec.md).

## 1. Monorepo skeleton

- [x] Create top-level folders: `backend/`, `frontend/`, `db/`, `doc/`, `doc/issues/1/` (already exists) — all present.
- [x] Add root-level `README.md` / getting-started doc explaining the monorepo layout and how to run each part — root `README.md` covers structure, prerequisites, and per-module setup commands.

## 2. Backend initialization (`backend/`)

- [x] Install/pin Python 3.11 via Pyenv (`.python-version`) — `backend/.python-version` pins `3.11.9`.
- [x] Init Poetry project (`pyproject.toml`), add dependencies: `fastapi`, `uvicorn`, `sqlalchemy`, `psycopg` (binary extra), `pydantic-settings`, dev deps `pytest`/`httpx`.
- [x] Create folder structure: `api/`, `core/`, `domain/`, `services/`, `repositories/`, `schemas/`, `tests/`.
- [x] Add base FastAPI app entrypoint with a health-check route (`GET /api/health`).
- [x] Configure DB connection settings (env-based via `pydantic-settings`, defaulting to the Docker Postgres instance).

## 3. Dev database (`db/`)

- [x] Write `docker-compose.yml` with a `postgres` service, named volume for persistence, exposed port, default credentials via env vars — done (`db/docker-compose.yml`: `postgres:16-alpine`, `postgres_data` volume, port `5432`, env-overridable credentials, healthcheck).
- [x] Document how to start/stop the DB (`docker compose up -d`) — done (`db/README.md`).

Note: `docker-compose.yml` still sets the legacy top-level `version: "3.9"` key, ignored by current Compose versions — harmless, not worth a plan step, mention only if the file is touched again.

## 4. "Enhanced Hello World" vertical slice

- [x] SQLAlchemy model for a single-column table (`hello_worlds(id)`, `app/domain/hello.py`), created via `Base.metadata.create_all()` in a lifespan startup handler — no Alembic/migration framework for this dev-only demo table; revisit if a second issue needs real migrations.
- [x] Seed script or manual insert to populate a few rows for testing — manually inserted 3 rows during verification (`INSERT INTO hello_worlds DEFAULT VALUES`); no dedicated seed script added since row creation isn't a product feature yet.
- [x] Repository/service layer to count rows (`HelloRepository.count()`, `HelloService.count_worlds()`).
- [x] FastAPI endpoint `GET /api/hello-count` returning `{ "n": <row_count> }`.
- [x] Pytest test(s) covering the endpoint and repository logic (`tests/test_hello_repository.py`, `tests/test_hello_api.py`) — migrated to Testcontainers per the 2026-08-10 decision: `tests/conftest.py`'s `postgres_engine` fixture starts a session-scoped real `postgres:16-alpine` container, with a function-scoped `db_session` fixture giving per-test isolation via connection/transaction rollback. No SQLite left in the suite.

## 5. Frontend initialization (`frontend/`)

- [x] Bootstrap React 19.2 + TypeScript (`.tsx`) project with Vite, on Node 25.6, in `frontend/`; styles in SCSS.
- [x] Add a component that calls the backend endpoint and renders `Hello n worlds !` (`src/features/hello/HelloWorlds.tsx`, via `useHelloCount` hook + `helloService`).
- [x] Configure dev proxy / CORS so the frontend (Vite dev server) can reach the FastAPI backend locally (`vite.config.ts` proxy `/api` → `:8000`, backend CORS allows `:5173`).
- [x] Wire the Vite build so the backend serves the bundled webapp in build mode (`app/main.py` mounts `frontend/dist` as static files when present).
- [x] Add a Vitest unit test for the Hello-world component (`HelloWorlds.test.tsx`, success + error states).

Siemens component library and Playwright e2e remain deferred past this minimal slice (no reusable component need yet, no user flow worth an e2e test yet) — tracked as follow-up, not acceptance-blocking for issue 1.

## 6. Documentation & conventions

- [x] Getting-started doc: prerequisites, how to run DB / backend / frontend together — root `README.md` + `db/README.md`; prerequisites section clarified to name exact required versions without OS-specific install steps.
- [x] Document conventions: frontend/backend separation, Poetry dependency management, input validation (Pydantic schemas), SQLAlchemy-only persistence, Pytest testing rules, module/architecture organization — `.claude/skills/danslafoule/SKILL.md` covers these; remaining "to be completed" items (§10) are business-module-level, out of scope for issue 1.
- [x] Reflect these architecture rules in the project's Claude skills (per [danslafoule skill](/.claude/skills) — keep generic tooling out of the project doc per the spec's non-goal) — skill file cross-references the dedicated tech skills (fastapi, sqlalchemy, pytest, poetry, pyenv, react, typescript, css, test-vitest, playwright, siemens-ix, siemens-ix-react) instead of duplicating tooling detail.

## 7. Validation against acceptance criteria

- [x] `docker compose up` starts a usable Postgres — started via `docker compose up -d` in `db/`, healthy.
- [x] Backend boots on Python 3.11 / FastAPI, table exists, endpoint returns correct count — verified with a local venv (Python 3.12, closest available in this environment — see note below) against the real Postgres instance: `GET /api/health` → `{"status":"ok"}`, `GET /api/hello-count` → `{"n":0}` then `{"n":3}` after seeding 3 rows.
- [x] Frontend displays `Hello n worlds !` with the right `n` — verified both dev mode (Vite proxy, `curl localhost:5173/api/hello-count` → `{"n":3}`) and build mode (backend served `dist/index.html` at `/` and the API at `/api/hello-count` from the same running instance).
- [x] Conventions documented; project ready for first business modules.

## Suggested execution order

1. Monorepo skeleton + getting-started stub
2. `db/` docker-compose
3. `backend/` init (Poetry, structure, health check)
4. Hello-world table + endpoint + tests
5. `frontend/` init + Hello-world display
6. Finalize conventions doc + Claude skills
7. End-to-end check against acceptance criteria

## Log

<!-- One entry per completed step, newest at the bottom. Format: - YYYY-MM-DD — <step done> — <short note> -->
- 2026-08-10 — Plan reviewed against spec.md and repo state — checked boxes for what actually exists (`db/docker-compose.yml`, `db/README.md`, root `README.md`, `.claude/skills/danslafoule/SKILL.md`); `backend/` and `frontend/` are not created yet, hello-world slice not started. Settled the open migration-tool question for step 4: use `Base.metadata.create_all()`, no Alembic, given the table is a single-column dev demo.
- 2026-08-10 — Confirmed stack decisions communicated by the project owner: React 19.2, Node 25.6, TypeScript/SCSS, Vite dev/build modes (backend serves the build), Vitest + Playwright, Siemens component library, full Python tooling set (Pyenv, Poetry, Pytest, cibuildwheel, Pyarmor, PyInstaller). Recorded in `.claude/skills/danslafoule/SKILL.md` §1/§5/§9/§10/§12. Updated step 5 accordingly; deferred Siemens library and Playwright e2e past this minimal issue-1 slice.
- 2026-08-10 — Split the Siemens iX skill into `frontend/siemens-ix` (generic design system: packages, theming, icons) and `frontend/react/siemens-ix-react` (React-specific `@siemens/ix-react` setup) per user request; updated project skill references.
- 2026-08-10 — Implemented the full issue-1 slice: `backend/` (Poetry project, layered structure, `hello_worlds` table, `GET /api/hello-count`, `GET /api/health`, pytest suite — 4 tests passing) and `frontend/` (React 19.2 + TS + Vite + SCSS, `HelloWorlds` component/hook/service, Vitest suite — 2 tests passing, `tsc` type-check clean, production build clean). Environment note: this sandbox has neither pyenv/Python 3.11 (only 3.12.3) nor Node 25.6 (only 20.19.4) nor Poetry installed; verified backend behavior with a throwaway `venv` (Python 3.12) installing the same dependency set, and frontend with the available Node 20 — both matched expected behavior. Ran a full local end-to-end check: `docker compose up -d` in `db/`, backend against the real Postgres (table auto-created, `/api/hello-count` correct before/after seeding 3 rows), frontend dev mode via the Vite proxy, and build mode with the backend serving the bundled `dist/`. All temporary venv/build artifacts removed after verification; `.gitignore` added to both `backend/` and `frontend/`. Remaining risk: behavior on the pinned exact versions (Python 3.11 via Pyenv, Poetry, Node 25.6) is unverified in this environment and should be re-checked once those are available.
- 2026-08-10 — Decision: backend integration tests must run against a real Postgres via Testcontainers (session-scoped `postgres:16-alpine` container, per-test transaction-rollback isolation) instead of the in-memory SQLite fixture currently in `tests/conftest.py` — SQLite silently diverges from Postgres behavior (schemas, constraints, dialect-specific SQL). Documented in `.claude/skills/danslafoule/SKILL.md` §6/§9 and in two new skills: `tooling/testcontainers` (generic) and `languages/python/tooling/testcontainers` (Python: `testcontainers-python`, pytest fixtures, SQLAlchemy transaction-rollback pattern). Requires Docker reachable wherever tests run (local + CI). Step 4's pytest checkbox unchecked until `tests/conftest.py` is migrated to this pattern.
- 2026-08-10 — Plan reviewed against current repo state: `tests/conftest.py` migration to Testcontainers is done (`postgres_engine` + `db_session` fixtures, verified passing — `poetry run pytest` 4/4 in `backend/`). Checked the last open box in step 4; issue 1 is now fully complete against its plan. (Since this issue closed, `backend/` and `e2e/` also gained a shared `testdata/` seeding module wired to `test-data-builder-py` — tracked under issue 3's follow-up in `test-data-builder-py`'s own `doc/issues/3/plan.md`, not re-litigated here.)
- 2026-08-10 — Gap found and fixed: spec.md §6/§7 and its acceptance criteria required the E2E suite to run in CI, but `.github/workflows/ci.yml` only ever had `backend`/`frontend` jobs — no `e2e` job was ever added, despite the plan's step-4/step-7 checkmarks implying the whole slice was done. Added an `e2e` job (Python 3.11 + Poetry, Node 25.6, installs backend/frontend/e2e deps, `playwright install --with-deps chromium`, `poetry run pytest`) to `ci.yml`. Not yet verified green in actual GitHub Actions (no CI run triggered from this session) — verify on the next push/PR.
