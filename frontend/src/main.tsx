import { defineCustomElements as defineIxIcons } from "@siemens/ix-icons/loader";
import { defineCustomElements } from "@siemens/ix/loader";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
    <App />
  </StrictMode>,
);
