# Dans la foule

Monorepo — React frontend and Python backend (FastAPI).

## Prerequisites

The exact install steps depend on your OS — see each tool's own documentation.

- [Pyenv](https://github.com/pyenv/pyenv) with **Python 3.11** installed and selected for this project — Python version management
- [Poetry](https://python-poetry.org/) — Python dependencies, virtualenv, and build management
- **Node.js 25.6** (e.g. via [nvm](https://github.com/nvm-sh/nvm)) — required to run/build the React frontend
- Docker + Docker Compose — local PostgreSQL database

Optional, only needed if the project ends up shipping a packaged Python artifact (not required for running the FastAPI web backend):

- [cibuildwheel](https://cibuildwheel.pypa.io/) — wheel building
- [Pyarmor](https://pyarmor.readthedocs.io/) — Python code protection
- [PyInstaller](https://pyinstaller.org/) — standalone application packaging

## Monorepo structure

```text
danslafoule/
  backend/     # Python API (FastAPI)
  frontend/    # React application
  e2e/         # End-to-End tests (Playwright)
  testdata/    # shared test data seeding (TestDataBuilder), used by backend + e2e tests
  db/          # local PostgreSQL dev environment (Docker Compose)
  doc/         # documentation, specs per issue
```

> `backend/` and `frontend/` are being set up (see [doc/issues/1](doc/issues/1/spec.md)).

## Setting up the environment

### 1. Database

```bash
cd db
docker compose up -d
```

See [db/README.md](db/README.md) for the default connection settings and environment variables.

### 2. Backend (Python)

```bash
cd backend
pyenv install 3.11.9   # if not already installed
pyenv local 3.11.9
poetry install
# poetry run uvicorn app.main:app --reload
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

## Tests

### Backend unit/integration tests

```bash
cd backend
poetry run pytest
```

### End-to-End tests (Playwright)

The E2E suite starts a real PostgreSQL instance via Testcontainers and runs the backend as a real process (serving the built frontend), then drives a real browser against it — no dev server, no mocks. Docker must be running.

```bash
cd e2e
poetry install
poetry run playwright install chromium   # first run only
poetry run pytest
```

Useful flags:

```bash
poetry run pytest --headed          # watch the browser
poetry run pytest --browser firefox # run against another browser
```

## Project conventions

Architecture rules and development conventions are documented in the project's Claude skill ([.claude/skills/danslafoule/SKILL.md](.claude/skills/danslafoule/SKILL.md)) and in the per-issue specs ([doc/issues/](doc/issues/)).
