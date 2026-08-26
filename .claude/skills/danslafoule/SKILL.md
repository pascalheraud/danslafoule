---
name: danslafoule
description: Dans la foule monorepo — React frontend and Python backend architecture, development conventions, and project context.
---

# Dans la foule

## 1. Project context

Project name: Dans la foule

Project type: monorepo

Monorepo modules (see §4 for the full tree, §9 for the skills each one uses):
- `backend/`: the Python/FastAPI HTTP API — the only writer of business data.
- `frontend/`: the React application.
- `db/`: no code — just the `docker-compose.yml` running the local dev PostgreSQL instance.
- `testdata/`: a small shared Python package (`danslafoule-testdata`) with test-data-builder mappings, depended on by `backend/` and `e2e/` so both seed test data through the same code.
- `e2e/`: a separate Python/Playwright project driving the real built frontend against a real backend + Postgres.

Overall objective:
- Build a modern application split into coherent modules.
- Separate the frontend from the backend API to clarify responsibilities.
- Ensure simple, testable, and maintainable scalability.

Starting conventions:
- The monorepo is the source of truth for architecture.
- Architecture decisions must be documented here before being stabilized.
- A new module or service must not add logic duplication or implicit dependencies.
- All project code and documentation must be written in English.

Language rule:
- variable names, function names, class names, file names, module names, component names, routes, tests, and documentation elements must remain in English,
- comments, commit messages, and documentation must also be in English,
- human-facing project decisions may be discussed in French, but the technical reference for the project must remain in English.

## 2. Guiding principles

- Clearly separate responsibilities between frontend, backend, and data.
- Favor explicit interfaces and contracts between modules.
- Do not mix business logic, UI logic, and data access.
- Prefer consistent, testable, and simple components and services.
- Document non-obvious decisions as soon as they become structured.

## 3. Global monorepo architecture

The monorepo is organized into two main areas:

### Frontend (React)
- Manages the user experience and browser interaction.
- Relies on reusable components and adapted frontend services.
- Sends API calls to the backend through a clear communication layer.
- Must not contain the application’s critical business logic.

### Backend (Python)
- Exposes the application API and centralizes business logic.
- Validates inputs, orchestrates processing, and enforces business rules.
- Isolates access to data and third-party services.
- Acts as the single source of truth for critical business rules.

### Shared layer
- Shared types, DTOs, interfaces, common validations, and utilities.
- Helps reduce friction between frontend and backend without creating excessive coupling.

## 4. Reference monorepo structure

```text
danslafoule/
  backend/
    app/
      api/
      core/
      domain/
      services/
      repositories/
      schemas/
    tests/
  frontend/
    src/
      app/
      components/
      features/
      services/
      styles/
  db/
    docker-compose.yml
  testdata/          # shared TestDataBuilder-based seeding module, used by backend repository tests and e2e tests
  e2e/
    pages/
    tests/
  doc/
    issues/
  shared/            # optional — contracts/types/validators shared between frontend and backend, added only when actually needed
```

Associated rules:
- Modules must be grouped by business and technical responsibility.
- The frontend does not know the backend implementation details.
- The backend is the only component responsible for critical business rules.
- Dependencies must flow in the logical direction of the system.

## 5. Front-end React rules

- React 19.2, Node 25.6.
- Code is written in TypeScript (`.tsx`); styles are written in SCSS.
- Prefer the Siemens iX component library ([[siemens-ix-react]], built on [[siemens-ix]]) over custom components when it already covers the need; fall back to a custom component only when the library doesn't provide it.
- Components must stay UI-oriented and not contain too much business logic.
- Data must pass through proper services.
- No dedicated custom-hook files (no `hooks/useX.ts`) for data fetching or per-screen side effects, per [[component-design]]'s "custom hooks are not the default" rule — a `Screen`/feature component that owns a piece of state calls plain, testable service functions (`services/`) directly from its own `useState`/`useEffect`. A hook file is only justified for behavior genuinely reused across 2+ components (e.g. a browser event subscription) — not yet the case anywhere in this project.
- Loading, error, and empty states must be handled explicitly.
- Network calls must be encapsulated in coherent services.
- Components must be reasonably small and reusable.
- Routing uses **React Router v6** (`BrowserRouter`), per [[routing]]/[[frontend/web]]'s "every page
  must support Back, Forward, and reload" rule — every screen (Home, a group's chat) has its own
  distinct URL (`/`, `/groups/:groupId`) via `<Routes>`/`<Route>`, not in-memory-only navigation state.
  Typed route paths live in `routes.ts` (`ROUTES`/`buildRoute`), navigation goes through
  `useAppNavigate()`/`<Link>`, never a hand-typed path string. Onboarding is the one exception: a
  pre-app gate shown before any route renders, not a route of its own, since it's not a page meant to
  be linked to, reloaded into, or reachable via Back.

### Frontend run modes

- **Dev mode**: served by a Vite dev server with hot reload, for active development.
- **Build mode**: the webapp is bundled with Vite, then served as static assets by the backend — this is how the app runs outside local development.

### Frontend testing

- Unit tests: Vitest.
- End-to-end tests: Playwright.

## 6. Backend Python rules

The Python backend must follow a clear organization:

- api: HTTP/API entry points
- core: configuration, constants, shared utilities
- domain: business models and business rules
- services: orchestration and application logic
- repositories: data access / persistence
- schemas: payload validation, DTOs, input/output contracts
- tests: unit and integration tests

Associated rules:
- Routes must not contain the full business logic.
- Input validation must be explicit.
- Services must be testable in isolation.
- Data access must go through explicit abstractions.
- The backend uses FastAPI on Python 3.11.
- Python tooling: Pyenv (version management), Poetry (dependency/build management), Pytest (testing). `cibuildwheel`, `Pyarmor`, and `PyInstaller` are for wheel building, code protection, and packaging when shipping a standalone Python artifact — not needed for the FastAPI web backend itself. This same tooling baseline applies to `testdata/` and `e2e/` too — each is its own Poetry project, not just `backend/`.
- Persistence is managed via SQLAlchemy ORM.
- Database schema conventions (primary key strategy, timestamp columns, schema/search_path) are documented in [[danslafoule-db]] and apply to every table.
- Backend integration tests run against a real Postgres started via Testcontainers ([[testcontainers]]), session-scoped, with per-test isolation via transaction rollback — not an in-memory SQLite substitute, to avoid Postgres/SQLite behavior divergence.
- Test data seeding for backend repository tests and e2e tests goes through the shared `testdata/` module ([[test-data-builder-usage]]), a local `danslafoule-testdata` Poetry package (path dependency from `backend` and `e2e`) wrapping `test-data-builder-py` (pinned to `v1.0.0`) with this project's `DanslafouleTable`/`MessageColumn` mapping and `DanslafouleTestDataBuilder`. Backend repository tests get isolation from transaction rollback, so they only need `create()`; e2e tests (no rollback) must call `apply()`.
- Service-level start/end logging (per [[api]]'s "Logging" convention) uses [[backend/python/logging]]'s **Option 1 — explicit decorator** (`@logged` on each service method) — not the auto-wrapping base class or a DI/AOP mechanism, since this project has no DI container and the explicit-at-the-call-site tradeoff fits its small service count.

Usage rules:
- The project-level architecture remains the authoritative location for the stack decision.
- Tooling details stay in their dedicated technology skills — see §9 for the full list, grouped by module.
- The Python skill remains focused on Python language convention and backend organization.
- The persistence layer must keep a clear separation between ORM models and business logic.

## 7. Frontend ↔ backend integration rules

- The frontend consumes a clear and stable API contract.
- Data schemas must remain consistent across modules.
- API errors must be handled in a structured way on the frontend.
- Contract changes must be documented and validated before impact.

## 8. Development standards for this monorepo

- Conventions must remain consistent in each module.
- Naming must be explicit and aligned with business logic.
- Features must be tested at the right level: unit, integration, or e2e.
- External dependencies must remain controlled and justified.
- Any stable architectural decision must be documented here.
- The Python backend must remain compatible with the Pyenv environment defined for the project (Python 3.11 in general).
- The build and dependency environment must always go through Poetry.

## 9. Claude skills to use for this project

This monorepo has five code modules, each with its own dependency manifest and its own concerns (see §4 for the full tree):

- **`backend/`** — the Python/FastAPI HTTP API, the only writer of business data, backed by PostgreSQL via SQLAlchemy.
- **`frontend/`** — the React app, consuming the backend's API and owning all UI/UX concerns.
- **`db/`** — no code, just the `docker-compose.yml` that runs the local dev PostgreSQL instance the other modules connect to.
- **`testdata/`** — a small shared Python package (`danslafoule-testdata`) with no purpose on its own; it exists purely to be depended on by `backend/` (repository tests) and `e2e/` (seeding), so both build their test data through the same `DanslafouleTestDataBuilder` instead of duplicating insert logic.
- **`e2e/`** — a separate Python/Playwright project that drives the real built frontend against a real backend instance and a real (Testcontainers) Postgres — it depends on `testdata/` for seeding, but is otherwise independent of both `backend/` and `frontend/`'s own toolchains.

The skills below are grouped by which of these modules they apply to; only load the ones relevant to the module you're actually touching.

### `backend/`

- `languages/python`: Python language conventions, typing, and module structure — independent of any framework or tooling choice.
- `languages/python/python-3.11`: language features specific to the Python 3.11 version used by this project.
- `backend/generic/api`: framework-agnostic backend API conventions (route/service split, status codes, logging) that [[fastapi]] implements concretely for this project.
- `backend/python`: backend architecture, layering, DI, and persistence boundaries — independent of the concrete web framework.
- `backend/python/fastapi`: FastAPI-specific conventions — routers, Pydantic request/response models, dependency injection, error handling, route tests.
- `backend/python/sqlalchemy`: ORM/persistence conventions and SQL query logging.
- `backend/python/pydantic-settings`: configuration/settings conventions (`app/core/config.py`).
- `backend/python/logging`: service-call logging patterns — this project uses **Option 1, the explicit decorator** (see §6 above).
- `backend/python/test`: backend testing best practices and application validation, independent of the concrete test framework.
- `test/pytest`: the concrete test framework/runner backend tests use.
- `tooling/testcontainers`, `languages/python/tooling/testcontainers`: backend integration tests run against a real containerized Postgres with transaction-rollback isolation, not an in-memory SQLite stand-in.
- `languages/python/tooling/pyenv`, `languages/python/tooling/poetry`: Python environment and dependency management (also applies to `testdata/` and `e2e/`, each with their own Poetry project).
- `languages/python/tooling/venv`: virtualenv naming and gitignore conventions (same cross-module scope as pyenv/poetry above).
- `languages/python/tooling/cibuildwheel`, `languages/python/tooling/pyarmor`, `languages/python/tooling/pyinstaller`: only relevant if/when the project ships a packaged Python artifact — not needed for the FastAPI web backend itself.
- `danslafoule-db`: this project's own database schema conventions (PK strategy, timestamps, schema/search_path) — project-specific, not a generic tool skill.

### `frontend/`

- `frontend/react`: React conventions, components, hooks, frontend services, and interface organization.
- `frontend/react/routing`: React Router v6 conventions — route definitions, typed navigation, Back button rules.
- `frontend/react/typescript`: TypeScript conventions for `.tsx` React code.
- `frontend/react/css`: SCSS Modules conventions for component styles.
- `frontend/react/test-vitest`: Vitest unit-testing conventions for React components.
- `frontend/siemens-ix`: Siemens iX design system — framework-agnostic packages, theming, and icon conventions.
- `frontend/react/siemens-ix-react`: Siemens iX for React — `@siemens/ix-react` setup and component usage.

### `db/`

- `tooling/docker`: Docker/Docker Compose conventions for the dev database and any other containerized service.
- `danslafoule-db`: the schema/naming conventions the running database actually enforces (cross-referenced from `backend/` above too, since that's what creates the schema).

### `testdata/`

- `third-party/test-data-builder-usage`: wiring the `test-data-builder-py` library into this shared package's `DanslafouleTable`/`MessageColumn` mapping and `DanslafouleTestDataBuilder`, consumed as a path dependency by both `backend/` and `e2e/`.
- `languages/python`, `languages/python/python-3.11`, `languages/python/tooling/poetry`: same Python language/tooling baseline as `backend/` — this is a small but real Poetry package of its own.

### `e2e/`

- `test/e2e/playwright`: Playwright end-to-end testing conventions.
- `backend/python/test/playwright-python`: the Python/pytest/Testcontainers-specific flavor of that — this project's e2e suite is Python, not JS/TS, driving Playwright against the built frontend.
- `third-party/test-data-builder-usage`, `tooling/testcontainers`, `languages/python/tooling/testcontainers`: seeding and the real Postgres instance, same as `backend/`'s integration tests but from a separate Poetry project.
- `languages/python`, `languages/python/python-3.11`, `languages/python/tooling/pyenv`, `languages/python/tooling/poetry`: same Python language/tooling baseline as `backend/`.

Clear separation rule:
- best practices for each tool must be recorded in that tool’s own skill,
- project-specific technical choices may exist in this project skill when their scope is specific to the monorepo,
- this project skill must not duplicate general tool conventions already documented elsewhere,
- project decisions must remain readable at the architecture level, while tool usage details remain in their respective skills,
- if a tool is specific to the Python language and directly tied to the project’s Python environment, it must be placed under `languages/python/tooling/` rather than in the generic global tooling folder,
- purely generic or cross-cutting tools remain in `tooling/`.

Note:
- Python-specific project tools such as `pyenv`, `poetry`, `pyinstaller`, `pyarmor`, and `cibuildwheel` should be organized under `languages/python/tooling/` when they directly concern the Python environment and backend packaging,
- generic tooling skills remain in Claude’s generic skill set,
- they are not expanded here to avoid mixing generic tool conventions with project-specific rules for Dans la foule,
- they may still be consulted when needed, but the architectural reference for this project remains centered on the monorepo’s application skills.

## 10. To be completed over time

The React frontend stack (React 19.2, Node 25.6, TypeScript, SCSS, Vite dev/build modes, Vitest, Playwright) and the Python backend/tooling stack (FastAPI, Python 3.11, Pyenv, Poetry, Pytest, with `cibuildwheel`/`Pyarmor`/`PyInstaller` available for packaged-artifact scenarios) are now confirmed — see §1, §5, and §9.

This skill will still be extended with:
- detailed business modules,
- API contracts,
- persistence strategy,
- validation and testing tools,
- security and configuration conventions,
- the exact build, packaging, and protection policy for Python artifacts (when a packaged-artifact use case actually arises).

## 11. Update rule

As soon as a technical or architectural decision is validated:
1. document it in this skill,
2. align the affected module code,
3. verify interface consistency (frontend/backend),
4. update tests and related documentation.

This skill serves as the central reference for the monorepo and must remain consistent with the decisions actually implemented in the code.

The change history itself (what shipped in each issue) lives in [`CHANGELOG.md`](../../../CHANGELOG.md) at the repo root, not in this skill — a skill documents standing conventions and architecture, not a per-issue timeline.

**At the end of every implementation plan** (whether or not it changes this skill), update
[`doc/general-spec.md`](../../../doc/general-spec.md) — a snapshot of what the app currently does,
referencing [`doc/dans-la-foule-protocol-spec-en.md`](../../../doc/dans-la-foule-protocol-spec-en.md)
for protocol detail rather than restating it. It holds current-state description only: no rationale,
no history, no deferred/discarded options — those stay in the per-issue `doc/issues/*/spec.md` files
and `CHANGELOG.md`. Amend the relevant section(s) in place (or add a new one for a new area); this is
a distinct step from writing the per-issue `spec.md`/`plan.md`.
