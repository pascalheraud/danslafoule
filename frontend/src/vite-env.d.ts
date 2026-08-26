/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Absolute backend URL — required for the Capacitor native build (no
  // same-origin backend), blank for the web build (relative paths, Vite
  // dev-server proxy or same-origin reverse proxy in prod).
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
