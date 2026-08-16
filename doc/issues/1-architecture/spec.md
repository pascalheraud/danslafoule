# Issue 1 — Dans la foule project initialization

## Purpose

Set up the foundation of the `danslafoule` monorepo with a clear separation between:

- the React frontend,
- the FastAPI backend on Python 3.11,
- persistence via the SQLAlchemy ORM,
- the PostgreSQL development database.

## Context

The project starts as a monorepo. The chosen tech stack is:

- frontend: React
- backend: FastAPI on Python 3.11
- ORM: SQLAlchemy
- development database: PostgreSQL via Docker
- dependencies and packaging: Poetry
- Python version management: Pyenv
- tests: Pytest

The goal is to set up a clean, coherent, and scalable development foundation, without mixing responsibilities between modules.

## Objectives

### 1. Structure the monorepo

Create a base structure that explicitly separates:

- `frontend/`
- `backend/`
- `db/`
- `doc/`
- `shared/` or equivalent, if needed

### 2. Initialize the FastAPI backend

Set up the Python backend with:

- Python 3.11
- FastAPI
- SQLAlchemy
- dependencies managed via Poetry
- base application configuration
- clean folder organization (api, core, domain, services, repositories, schemas, tests)

### 3. Initialize the development database

Create a local PostgreSQL environment via Docker Compose to:

- start the local DB quickly,
- persist data in a Docker volume,
- provide a standard dev connection point.

### 4. Build a working "enhanced Hello World"

Set up a first fully end-to-end feature:

- a SQL table with a single column,
- a FastAPI endpoint that returns the number of rows in that table,
- a React frontend that displays `Hello n worlds !` with `n = number of rows in the table`.

The goal is to validate that the whole pipeline works:

- PostgreSQL database,
- SQLAlchemy ORM,
- FastAPI API,
- backend call from the React frontend,
- visual rendering in the browser.

### 5. Define the development conventions

Document the following rules:

- frontend/backend separation,
- dependency management,
- input validation,
- persistence via SQLAlchemy,
- Pytest tests,
- application architecture and module organization.

### 6. Set up CI validation

Create a GitHub Actions workflow that validates the project on every push/PR:

- backend: install dependencies via Poetry, build/compile check, run the Pytest suite,
- frontend: install dependencies, run the TypeScript build (`tsc -b`), run the test suite.

### 7. Set up End-to-End testing

Create a dedicated `e2e/` module and cover the Hello n worlds feature end-to-end:

- a new `backend/python/test/playwright-python` Claude skill, modeled on the existing Java/Playwright skill, documenting the Python/pytest/Testcontainers-specific E2E conventions,
- a Poetry-managed `e2e/` module, pinned to the same Python version as `backend/` (3.11) unless that turns out to be incompatible with Playwright,
- Testcontainers standing up a real PostgreSQL instance, the backend started as a real process (built frontend + `uvicorn`, no dev server) against that instance,
- one scenario validating the Hello n worlds page: seed a known row count via SQL, open the app in a real browser, assert the displayed message matches,
- wired into the CI workflow as its own job.

## Expected deliverables

- monorepo structure created,
- FastAPI backend initialized,
- Python environment configured with Poetry / Pyenv,
- local dev PostgreSQL database that can be started,
- dev SQL table created with a single column,
- API endpoint returning the number of rows in the table,
- React frontend displaying `Hello n worlds !` with `n` = number of rows in the table,
- getting-started and project structure documentation,
- architecture rules visible in the project's Claude skills,
- a GitHub Actions workflow validating backend build + tests and frontend build + tests on every push/PR,
- a `backend/python/test/playwright-python` Claude skill for Python/Playwright E2E conventions,
- an `e2e/` module with a Playwright scenario covering the Hello n worlds page, wired into CI.

## Acceptance criteria

- The monorepo contains at least the backend, frontend, and db modules.
- The backend is initialized with FastAPI on Python 3.11.
- The dev database is usable via Docker Compose.
- Persistence is scoped with the SQLAlchemy ORM.
- A simple SQL table with a single column exists in the dev database.
- The API correctly returns the number of rows in that table.
- The React frontend displays the `Hello n worlds !` message with the correct value of `n`.
- The development conventions are documented.
- The project is ready for the creation of the first business modules.
- The GitHub Actions workflow passes on the default branch, validating both backend and frontend build + tests.
- The E2E scenario passes locally and in CI, against a real PostgreSQL Testcontainer and a real (built, non-dev-server) app instance.

## Non-goals

- Don't mix generic tooling questions into the project doc, which must stay focused on architecture and the project itself.

## Assumptions

- The frontend is a separate React project.
- The backend is a Python service based on FastAPI.
- The development database is a local PostgreSQL instance.
- The monorepo is the project's working reference, without depending on another repository.

## Questions resolved or to confirm with the project

- Exact name of the frontend module: `frontend`
- Database used in production: PostgreSQL
- First concrete business model in this issue: nothing besides the Hello n worlds demo, no additional application business models

## Next step

Create the monorepo skeleton and initialize the first components:

- `backend/`
- `db/`
- `frontend/`
- `doc/issues/1/`
- getting-started documentation
- then the FastAPI backend, the dev table, and the React frontend displaying `Hello n worlds !`.
