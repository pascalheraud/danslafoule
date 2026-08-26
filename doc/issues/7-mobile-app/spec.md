# Issue 7 — Add a mobile application

## Goal

Wrap the existing React web frontend in [Capacitor](https://capacitorjs.com/) to produce a native
Android app, reusing the same codebase (no fork, no parallel app). This was explicitly anticipated
and deferred by issue #3 (`doc/issues/3-messaging/spec.md`: "The app is intended to run as a native
Capacitor app on a phone" / "Capacitor packaging itself is not part of this issue") and by a comment
already present in `frontend/src/main.tsx` anticipating the `MemoryRouter` switch.

## Scope

- Android only. This is developed on a Linux machine — iOS needs Xcode/macOS and can be added later
  with `npx cap add ios`, which requires no code changes (same web build, different native shell).
- Single shared build (`frontend/dist`) for both the web app (served by FastAPI) and the Capacitor
  Android shell — differentiated only by an env-driven backend URL and runtime platform detection,
  not by a code fork.

## Non-goals (this issue)

- iOS packaging.
- Runtime-configurable backend URL / in-app settings screen — the backend URL is a build-time value
  (`VITE_API_BASE_URL`), acceptable tradeoff for an early-stage app; changing it requires a rebuild.
- CI wiring for native Android builds (Android SDK/Gradle toolchain in CI is a separate, larger
  lift — left for a later issue).
- Automated on-device/emulator testing — native/device-level verification stays manual.
- Native plugins beyond `@capacitor/core`, `@capacitor/android`, `@capacitor/app` (back button only).
  No push notifications, no camera, no native storage plugin (IndexedDB via `idb` already works fine
  inside a Capacitor WebView).
- Cosmetic native polish: status bar color/style, splash screen assets, dark-mode status-bar sync,
  keyboard-height CSS handling. Left as fast-follows once the app is otherwise working.

## Key technical points

- `frontend/src/features/protocol/relayService.ts` is the sole HTTP fetch choke point in the
  frontend; a native Android WebView's origin (`https://localhost` under Capacitor's
  `androidScheme: "https"`) is not same-origin with any backend, so it needs an absolute,
  env-driven `VITE_API_BASE_URL` instead of the current hardcoded relative `/api/v1/groups` path.
- `frontend/src/main.tsx` switches between `BrowserRouter` (web) and `MemoryRouter` (native) at
  runtime via `Capacitor.isNativePlatform()` — no separate router build flag needed.
- Backend CORS (`backend/app/main.py`, `backend/app/core/config.py`) must allow the native app's
  origin (`https://localhost`) in addition to the existing web dev origin
  (`http://localhost:5173`), via a new `cors_origins` setting (env var `CORS_ORIGINS`, JSON list,
  defaulting to today's single origin so existing dev/CI behavior is unchanged).
