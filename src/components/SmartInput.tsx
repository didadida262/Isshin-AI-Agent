import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import type { ChatMode } from "../types";
import { ModeToggle } from "./ModeToggle";

interface SmartInputProps {
  disabled?: boolean;
  activeModel: string;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
  onSend: (text: string) => void;
}

export function SmartInput({
  disabled,
  activeModel,
  chatMode,
  onChatModeChange,
  onSend,
}: SmartInputProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    ref.current?.focus();
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const placeholder =
    chatMode === "agent"
      ? "Agent 模式：可输入「读取项目」「查看文件」等…"
      : "输入消息… Shift+Enter 换行，Enter 发送";

  return (
    <div className="border-t border-white/5 bg-[#0a0a0a] px-4 py-4">
      <motion.div
        className="mb-3 flex flex-wrap items-center justify-between gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <ModeToggle
          mode={chatMode}
          onChange={onChatModeChange}
          disabled={disabled}
        />
        {activeModel && (
          <span className="text-xs text-text-muted">
            模型 ·{" "}
            <span className="font-medium text-accent">{activeModel}</span>
          </span>
        )}
      </motion.div>
      <motion.div
        className="relative rounded-2xl border bg-surface p-1 transition"
        animate={{
          borderColor: focused
            ? "rgba(0, 255, 102, 0.6)"
            : "rgba(255, 255, 255, 0.08)",
          boxShadow: focused
            ? "0 0 20px rgba(0, 255, 102, 0.15)"
            : "0 0 0px transparent",
        }}
        transition={{ duration: 0.2 }}
      >
        <textarea
          ref={ref}
          rows={2}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm text-white outline-none placeholder:text-text-dim disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="absolute bottom-3 right-3 rounded-lg p-2 text-accent transition hover:bg-accent/10 disabled:opacity-30"
        >
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </motion.div>
    </div>
  );
}
