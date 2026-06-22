import { useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { ChatMessage, ChatMode } from "../types";
import { MessageBubble } from "./MessageBubble";
import { SmartInput } from "./SmartInput";

interface ChatAreaProps {
  messages: ChatMessage[];
  activeSessionId: string;
  models: string[];
  selectedModel: string;
  onSelectModel: (m: string) => void;
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  configError: string | null;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
}

export function ChatArea({
  messages,
  activeSessionId,
  models,
  selectedModel,
  onSelectModel,
  onSend,
  isLoading,
  onStop,
  configError,
  chatMode,
  onChatModeChange,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPinnedRef = useRef(true);
  const prevSnapshotRef = useRef({ count: 0, lastId: "" });

  useEffect(() => {
    isPinnedRef.current = true;
    prevSnapshotRef.current = { count: 0, lastId: "" };
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeSessionId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    isPinnedRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const snapshot = prevSnapshotRef.current;
    const isNewMessage =
      messages.length !== snapshot.count || last?.id !== snapshot.lastId;

    prevSnapshotRef.current = {
      count: messages.length,
      lastId: last?.id ?? "",
    };

    if (isNewMessage && last?.role === "user") {
      isPinnedRef.current = true;
    }

    const el = scrollRef.current;
    if (!el || !isPinnedRef.current) return;

    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black">
      <header className="relative z-30 flex shrink-0 items-center border-b border-white/5 px-6 py-4">
        <motion.h1
          className="shrink-0 text-sm font-medium text-text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          对话
        </motion.h1>
      </header>

      {configError && (
        <motion.div
          className="mx-6 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-300"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {configError}
        </motion.div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto px-6 py-6"
      >
        {messages.length === 0 ? (
          <motion.div
            className="flex h-full flex-col items-center justify-center px-4 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="max-w-md rounded-lg border border-white/10 bg-surface/40 px-8 py-10">
              <p className="text-lg font-medium text-white">有什么需要帮忙的吗？</p>
            </div>
          </motion.div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <SmartInput
        isGenerating={isLoading}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        chatMode={chatMode}
        onChatModeChange={onChatModeChange}
        onSend={onSend}
        onStop={onStop}
      />
    </main>
  );
}
