import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBrain,
  faRobot,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { ChatMessage } from "../types";
import { stripThinkingContent } from "../utils/messageContent";
import { MarkdownContent } from "./MarkdownContent";

interface MessageBubbleProps {
  message: ChatMessage;
}

const bubbleSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "agent-status") {
    return (
      <motion.div
        className="flex justify-start"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={bubbleSpring}
      >
        <motion.div
          className="flex max-w-lg items-start gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-sm"
          animate={
            message.agentPhase !== "done"
              ? { borderColor: ["rgba(0,255,102,0.2)", "rgba(0,255,102,0.5)", "rgba(0,255,102,0.2)"] }
              : {}
          }
          transition={{ repeat: message.agentPhase !== "done" ? Infinity : 0, duration: 1.5 }}
        >
          <FontAwesomeIcon
            icon={message.agentPhase === "done" ? faBrain : faSpinner}
            spin={message.agentPhase !== "done"}
            className="mt-0.5 text-accent"
          />
          <motion.div>
            <p className="text-accent text-xs font-medium uppercase tracking-wider">
              Agent · {message.agentPhase ?? "thought"}
            </p>
            <p className="mt-1 text-text-muted">{message.content}</p>
          </motion.div>
        </motion.div>
      </motion.div>
    );
  }

  const isUser = message.role === "user";
  const displayContent = isUser
    ? message.content.trimStart()
    : stripThinkingContent(message.content);

  if (!displayContent && !message.isStreaming) {
    return null;
  }

  return (
    <motion.div
      className={`flex items-start ${isUser ? "justify-end" : "justify-start"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bubbleSpring}
    >
      {!isUser && (
        <div className="mr-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-surface">
          <FontAwesomeIcon icon={faRobot} className="text-text-muted text-sm" />
        </div>
      )}
      <motion.div
        className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "max-w-[75%] whitespace-pre-wrap bg-surface-elevated text-white"
            : "max-w-[min(85%,48rem)] border border-white/10 bg-surface text-white/90"
        }`}
      >
        {isUser ? (
          displayContent
        ) : (
          <MarkdownContent content={displayContent} />
        )}
        {message.isStreaming && (
          <motion.span
            className="ml-0.5 inline-block h-4 w-1.5 bg-accent"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
