import { Capacitor } from "@capacitor/core";
import { defineCustomElements as defineIxIcons } from "@siemens/ix-icons/loader";
import { defineCustomElements } from "@siemens/ix/loader";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { App } from "./app/App";
import "@siemens/ix/dist/siemens-ix/siemens-ix.css";
import "./styles/global.scss";

defineIxIcons();
defineCustomElements();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

// BrowserRouter (real URL bar) for the web app; MemoryRouter inside the
// Capacitor native shell, which has no URL bar and no reliable native
// history API — chosen at runtime, not build time, since both targets share
// the same built bundle.
const Router = Capacitor.isNativePlatform() ? MemoryRouter : BrowserRouter;

createRoot(rootElement).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
