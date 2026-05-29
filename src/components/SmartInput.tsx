import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faStop } from "@fortawesome/free-solid-svg-icons";
import type { ChatMode } from "../types";
import { ModeToggle } from "./ModeToggle";

interface SmartInputProps {
  isGenerating?: boolean;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
}

export function SmartInput({
  isGenerating,
  chatMode,
  onChatModeChange,
  onSend,
  onStop,
}: SmartInputProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isGenerating) return;
    onSend(trimmed);
    setText("");
    ref.current?.focus();
  }, [text, isGenerating, onSend]);

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
        className="mb-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <ModeToggle
          mode={chatMode}
          onChange={onChatModeChange}
          disabled={isGenerating}
        />
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm text-white outline-none placeholder:text-text-dim"
        />
        {isGenerating ? (
          <button
            type="button"
            onClick={onStop}
            title="停止生成"
            className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90"
          >
            <FontAwesomeIcon icon={faStop} className="text-[10px]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            title="发送"
            className="absolute bottom-3 right-3 rounded-lg p-2 text-accent transition hover:bg-accent/10 disabled:opacity-30"
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        )}
      </motion.div>
    </div>
  );
}
