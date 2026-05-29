import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComments, faRobot } from "@fortawesome/free-solid-svg-icons";
import type { ChatMode } from "../types";

interface ModeToggleProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

export function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div
      className="inline-flex rounded-lg border border-white/10 bg-surface p-0.5"
      role="group"
      aria-label="对话模式"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("chat")}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          mode === "chat" ? "text-white" : "text-text-muted hover:text-white"
        }`}
      >
        {mode === "chat" && (
          <motion.span
            layoutId="mode-pill"
            className="absolute inset-0 rounded-md bg-white/10"
            transition={spring}
          />
        )}
        <FontAwesomeIcon icon={faComments} className="relative z-10 text-[10px]" />
        <span className="relative z-10">对话</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("agent")}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          mode === "agent" ? "text-accent" : "text-text-muted hover:text-white"
        }`}
      >
        {mode === "agent" && (
          <motion.span
            layoutId="mode-pill"
            className="absolute inset-0 rounded-md bg-accent/15 ring-1 ring-accent/30"
            transition={spring}
          />
        )}
        <FontAwesomeIcon icon={faRobot} className="relative z-10 text-[10px]" />
        <span className="relative z-10">Agent</span>
      </button>
    </div>
  );
}
