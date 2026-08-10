---
name: danslafoule
description: Dans la foule monorepo — React frontend and Python backend architecture, development conventions, and project context.
---

# Dans la foule

## 1. Project context

Project name: Dans la foule

Project type: monorepo

Monorepo modules:
- frontend: React application
- backend: Python API

Confirmed stack versions:
- Frontend: React 19.2, Node 25.6, TypeScript (`.tsx`), SCSS for styles.
- Backend: FastAPI on Python 3.11.
- Python tooling: Pyenv (Python version management), Poetry (dependency and build management), Pytest (testing). `cibuildwheel`, `Pyarmor`, and `PyInstaller` are part of the Python toolchain for wheel building, code protection, and packaging when the project needs to ship a standalone Python artifact — not required for the FastAPI web backend itself.

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
      hooks/
      styles/
  db/
    docker-compose.yml
  testdata/          # shared TestDataBuilder-based seeding module, used by backend repository tests and e2e tests
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
- Data must pass through proper services or hooks.
- Loading, error, and empty states must be handled explicitly.
- Network calls must be encapsulated in coherent services.
- Components must be reasonably small and reusable.

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
- Persistence is managed via SQLAlchemy ORM.
- Backend integration tests run against a real Postgres started via Testcontainers ([[testcontainers]]), session-scoped, with per-test isolation via transaction rollback — not an in-memory SQLite substitute, to avoid Postgres/SQLite behavior divergence.
- Test data seeding for backend repository tests and e2e tests goes through the shared `testdata/` module ([[test-data-builder-usage]]), a local `danslafoule-testdata` Poetry package (path dependency from `backend` and `e2e`) wrapping `test-data-builder-py` (pinned to `v1.0.0`) with this project's `DanslafouleTable`/`HelloWorldColumn` mapping and `DanslafouleTestDataBuilder`. Backend repository tests get isolation from transaction rollback, so they only need `create()`; e2e tests (no rollback) must call `apply()`.

### Technology skills used by the project

The project architecture is described at the monorepo level and references the relevant technology skills instead of embedding the full stack in the Python skill:

- [[react]] for React frontend conventions.
- [[fastapi]] for the HTTP API layer.
- [[sqlalchemy]] for ORM persistence and database access patterns.
- [[postgresql]] for database schema and persistence conventions.
- [[pytest]] for automated validation.
- [[pyenv]] and [[poetry]] for the Python environment and dependency management.

Usage rules:
- The project-level architecture remains the authoritative location for the stack decision.
- Tooling details stay in their dedicated technology skills.
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

The skills to prioritize for this monorepo are the following, and only those that match the project stack and architecture:

- `languages/python`: Python language conventions, typing, and module structure — independent of any framework or tooling choice.
- `languages/python/python-3.11`: language features specific to the Python 3.11 version used by this project.
- `backend/python`: backend architecture, layering, DI, and persistence boundaries — independent of the concrete web framework.
- `backend/python/fastapi`: FastAPI-specific conventions — routers, Pydantic request/response models, dependency injection, error handling, route tests.
- `backend/python/test`: backend testing best practices and application validation, independent of the concrete test framework.
- `frontend/react`: React conventions, components, hooks, frontend services, and interface organization.
- `frontend/react/typescript`: TypeScript conventions for `.tsx` React code.
- `frontend/react/css`: SCSS Modules conventions for component styles.
- `frontend/react/test-vitest`: Vitest unit-testing conventions for React components.
- `frontend/siemens-ix`: Siemens iX design system — framework-agnostic packages, theming, and icon conventions.
- `frontend/react/siemens-ix-react`: Siemens iX for React — `@siemens/ix-react` setup and component usage.
- `test/e2e/playwright`: Playwright end-to-end testing conventions.
- `test/pytest`: global project testing framework and automated validation.
- `tooling/testcontainers`, `languages/python/tooling/testcontainers`: backend integration tests run against a real containerized Postgres with transaction-rollback isolation, not an in-memory SQLite stand-in.
- `third-party/test-data-builder-usage`: wiring the `test-data-builder-py` library into the shared `testdata/` module used by backend and e2e tests.
- `languages/python/tooling/pyenv`, `languages/python/tooling/poetry`: Python environment and dependency management.
- `languages/python/tooling/venv`: virtualenv naming and gitignore conventions.
- `languages/python/tooling/cibuildwheel`, `languages/python/tooling/pyarmor`, `languages/python/tooling/pyinstaller`: only relevant if/when the project ships a packaged Python artifact — not needed for the FastAPI web backend itself.
- `tooling/docker`: Docker/Docker Compose conventions for the dev database and any other containerized service.

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

## 12. Global changelog

The project changelog follows the evolution of the monorepo with each issue. It must be updated for every important decision, new feature, bug fix, or architecture refactor.

Rules:
- a significant change must be added to this section,
- entries are ordered from newest to oldest,
- each entry must mention the context, purpose, and impact,
- issues must remain readable without rereading the whole codebase.

Recommended format:

```markdown
### Issue X — YYYY-MM-DD
- Added:
- Modified:
- Fixed:
- Impact:
```

### Issue 1 — 2026-08-10
- Added: initialization of the `danslafoule` monorepo (`backend/`, `frontend/`, `db/`, `doc/`), PostgreSQL dev environment via Docker Compose, FastAPI backend on Python 3.11 with SQLAlchemy persistence, and a fully working Hello n worlds slice — `GET /api/hello-count` backed by a `hello_worlds` table, a React `HelloWorlds` component consuming it, with pytest (backend) and Vitest (frontend) coverage. Confirmed exact stack versions: React 19.2, Node 25.6, TypeScript/SCSS frontend, Siemens iX component library ([[siemens-ix]] / [[siemens-ix-react]]), Vite dev/build modes served by the backend in build mode, Vitest + Playwright testing, and the full Python tooling set (Pyenv, Poetry, Pytest, cibuildwheel, Pyarmor, PyInstaller).
- Modified: creation of the project reference structure and the architecture/development convention documentation.
- Fixed: no major functional fixes; this issue focuses on building the technical foundation.
- Impact: end-to-end path verified locally (Postgres → SQLAlchemy → FastAPI → React, both dev and build modes). Verification in this sandbox used Python 3.12 and Node 20 (pyenv/Poetry/Node 25.6 unavailable here) — re-verify on the pinned exact versions before considering issue 1 fully closed. The project is otherwise ready for the next issue.

The changelog must be updated for every new issue, without exception, to maintain a clear history of the project’s evolution.
