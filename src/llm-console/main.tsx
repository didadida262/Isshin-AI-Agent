import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LlmConsolePanel } from "../components/LlmConsolePanel";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LlmConsolePanel standalone />
  </StrictMode>,
);
