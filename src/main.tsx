import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { config as faConfig } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import App from "./App";
import "./index.css";

faConfig.autoAddCss = false;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
