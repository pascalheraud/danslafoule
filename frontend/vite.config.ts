import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  // The mobile build serves from capacitor://localhost / https://localhost,
  // not from "/", so its assets need relative paths. The web build is
  // served by the backend at an absolute root and must resolve assets from
  // "/" regardless of the current client-side route (e.g. reloading on
  // /groups/:id) — a relative base would resolve them against that route's
  // path instead.
  base: mode === "mobile" ? "./" : "/",
  build: {
    sourcemap: false, // don't ship source maps inside the native app bundle
    target: "es2015", // older Android System WebView compatibility
  },
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern",
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
  },
}));
