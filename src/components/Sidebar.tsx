import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGear,
  faPlus,
  faRobot,
  faSpinner,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import type { ChatSession } from "../types";

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  agentRunning: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  agentRunning,
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
        <FontAwesomeIcon icon={faRobot} className="text-accent text-xl" />
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
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center gap-0.5 rounded-lg transition ${
              s.id === activeSessionId
                ? "bg-surface-elevated"
                : "hover:bg-white/5"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectSession(s.id)}
              className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm transition ${
                s.id === activeSessionId
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
              className={`mr-1 shrink-0 rounded p-1.5 text-text-dim transition hover:bg-red-500/10 hover:text-red-400 ${
                s.id === activeSessionId
                  ? "opacity-70"
                  : "opacity-0 group-hover:opacity-70"
              }`}
            >
              <FontAwesomeIcon icon={faTrash} className="text-xs" />
            </button>
          </div>
        ))}
      </nav>

      <motion.div
        className="border-t border-white/5 p-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <motion.div
          className="mb-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs"
          animate={agentRunning ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
          transition={{ repeat: agentRunning ? Infinity : 0, duration: 1.2 }}
        >
          <FontAwesomeIcon
            icon={faSpinner}
            spin={agentRunning}
            className={agentRunning ? "text-accent" : "text-text-dim"}
          />
          <span className={agentRunning ? "text-accent" : "text-text-muted"}>
            {agentRunning ? "Agent 运行中" : "Agent 待命"}
          </span>
        </motion.div>

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
