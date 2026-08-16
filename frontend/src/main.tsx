import { defineCustomElements as defineIxIcons } from "@siemens/ix-icons/loader";
import { defineCustomElements } from "@siemens/ix/loader";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import "@siemens/ix/dist/siemens-ix/siemens-ix.css";
import "./styles/global.scss";

defineIxIcons();
defineCustomElements();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {/* BrowserRouter: this runs as a regular web app (real URL bar) in both
        dev and build modes. Switch to MemoryRouter if/when this ships
        wrapped in Capacitor (protocol spec's target stack), per the
        project's routing skill. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
