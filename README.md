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
poetry run uvicorn app.main:app --reload
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

## Mobile app (Android, via Capacitor)

The frontend is wrapped as a native Android app with [Capacitor](https://capacitorjs.com/) — same
React codebase, no separate app. See [doc/issues/7-mobile-app/spec.md](doc/issues/7-mobile-app/spec.md)
for the full design. iOS is not set up yet (needs Xcode/macOS).

Additional prerequisites for the mobile build:

- Android Studio (or just the Android SDK + command-line tools) — provides `adb` and the Gradle
  Android toolchain
- A running backend reachable from the device/emulator (see [`frontend/.env.mobile`](frontend/.env.mobile) below)

### 1. Point the build at a reachable backend

The backend URL is baked in at build time (`VITE_API_BASE_URL`, read by
[`frontend/src/features/protocol/relayService.ts`](frontend/src/features/protocol/relayService.ts)) —
there is no in-app settings screen yet. Edit `frontend/.env.mobile` before building:

- Android **emulator**: `10.0.2.2` is the emulator's alias for the host machine's `localhost` — the
  default already in `.env.mobile` works if the backend runs locally on port 8000.
- Physical **device**: use the host machine's LAN IP (e.g. `http://192.168.1.42:8000`), and make sure
  the backend is reachable on your network (bind uvicorn to `0.0.0.0`, not just `127.0.0.1`).

Also make sure the backend allows the app's origin: set `CORS_ORIGINS` (backend, see
[`backend/app/core/config.py`](backend/app/core/config.py)) to include `https://localhost` alongside
the web dev origin, e.g.:

```bash
export CORS_ORIGINS='["http://localhost:5173","https://localhost"]'
```

### 2. Build the web assets and sync the native project

```bash
cd frontend
npm run build:mobile   # vite build --mode mobile, loads .env.mobile
npm run cap:sync       # copies dist/ into android/app/src/main/assets/public
```

### 3. Run on a device or emulator

With a device connected (`adb devices` shows it) or an emulator running, the simplest path builds,
installs, and launches in one step:

```bash
npx cap run android
```

To do it manually with Gradle + `adb` instead:

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.danslafoule.app/.MainActivity
```

Re-run steps 2–3 after any frontend change — Capacitor does not hot-reload from `dist/`.

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
