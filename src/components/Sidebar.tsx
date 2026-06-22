import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGear,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import type { ChatSession } from "../types";
import logo from "../assets/logo.png";

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
}

const spring = { type: "spring" as const, stiffness: 400, damping: 30 };

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-white/5 bg-[#0a0a0a]">
      <motion.div
        className="flex items-center gap-2 border-b border-white/5 px-4 py-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <img
          src={logo}
          alt="Isshin AI Agent"
          className="h-9 w-9 shrink-0 rounded-md border border-white/10 bg-white object-contain p-0.5"
        />
        <span className="min-w-0 flex-1 text-sm font-bold leading-tight tracking-wide text-white">
          Isshin AI Agent
        </span>
      </motion.div>

      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs text-text-muted uppercase tracking-wider">
          历史会话
        </span>
        <button
          type="button"
          onClick={onNewSession}
          className="rounded-md p-1.5 text-text-muted transition hover:bg-white/5 hover:text-white"
          title="新对话"
        >
          <FontAwesomeIcon icon={faPlus} className="text-xs" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        <AnimatePresence initial={false}>
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId;

            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16, height: 0, marginTop: 0 }}
                transition={spring}
                className="group relative flex items-center gap-0.5 overflow-hidden rounded-lg hover:bg-white/5"
              >
                {isActive && (
                  <motion.div
                    layoutId="active-session"
                    className="absolute inset-0 rounded-lg bg-surface-elevated"
                    transition={spring}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  className={`relative z-10 min-w-0 flex-1 truncate px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "text-white"
                      : "text-text-muted group-hover:text-white"
                  }`}
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSession(s.id)}
                  title="删除会话"
                  className={`relative z-10 mr-1 shrink-0 rounded p-1.5 text-text-dim transition hover:bg-red-500/10 hover:text-red-400 ${
                    isActive
                      ? "opacity-70"
                      : "opacity-0 group-hover:opacity-70"
                  }`}
                >
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </nav>

      <motion.div
        className="border-t border-white/5 p-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition hover:bg-white/5 hover:text-white"
        >
          <FontAwesomeIcon icon={faGear} />
          设置
        </button>
      </motion.div>
    </aside>
  );
}
