# Issue 7 — Implementation plan

Plan derived from [spec.md](./spec.md).

## 1. Frontend: env-driven API base URL

- [x] `frontend/src/features/protocol/relayService.ts`: read `import.meta.env.VITE_API_BASE_URL`
      (falls back to `""`, preserving today's relative-path web behavior when unset) and prefix
      `BASE_PATH` with it.
- [x] `frontend/src/vite-env.d.ts`: declare `VITE_API_BASE_URL?: string` on `ImportMetaEnv`.
- [x] `frontend/.env.example`: document `VITE_API_BASE_URL` (blank for web, required absolute URL
      for the mobile build).

## 2. Frontend: router — runtime platform detection

- [x] `frontend/src/main.tsx`: `Capacitor.isNativePlatform() ? MemoryRouter : BrowserRouter`, update
      the existing anticipatory comment.

## 3. Vite config

- [x] `frontend/vite.config.ts`: `base: "./"`, `build.sourcemap: false`, `build.target: "es2015"`.

## 4. Capacitor tooling

- [x] `frontend/package.json`: add `@capacitor/core`, `@capacitor/android`, `@capacitor/app`
      (deps), `@capacitor/cli` (devDep); add `build:mobile` and `cap:sync` scripts.
- [x] `frontend/.env.mobile`: `VITE_API_BASE_URL=<placeholder>`.
- [x] `frontend/capacitor.config.ts`: `appId: "com.danslafoule.app"`, `appName: "Dans la foule"`,
      `webDir: "dist"`, `server.androidScheme: "https"`.
- [x] `npx cap add android` → generates `frontend/android/` (committed, native Gradle project).
- [x] Android/Gradle build artifacts ignored — `npx cap add android` scaffolds its own
      `android/.gitignore` covering `build/`, `.gradle/`, `local.properties`, etc.; no changes needed
      to `frontend/.gitignore` itself.

## 5. Minimal mobile UX conformance

- [x] `frontend/index.html`: add `viewport-fit=cover` to the viewport meta tag.
- [x] `frontend/src/styles/global.scss`: safe-area padding on the app shell,
      `overscroll-behavior: none` on `html, body`.
- [x] `frontend/src/app/App.tsx`: `@capacitor/app` `backButton` listener → `navigate(-1)` /
      `App.exitApp()`, guarded by `Capacitor.isNativePlatform()`, with cleanup.

## 6. Backend CORS

- [x] `backend/app/core/config.py`: add `cors_origins: list[str] = ["http://localhost:5173"]`.
- [x] `backend/app/main.py`: use `settings.cors_origins` instead of the hardcoded list.

## 7. Follow-ups (not this issue)

- [ ] iOS target (`npx cap add ios` on macOS, no code changes expected).
- [ ] CI Android build job.
- [ ] Status bar, splash screen, dark-mode sync, keyboard-height CSS vars.
- [ ] Project skill note (`danslafoule` skill §9) pointing at the `frontend/mobile/capacitor` skill
      plus this project's two local conventions (`VITE_API_BASE_URL` contract, runtime router switch).
