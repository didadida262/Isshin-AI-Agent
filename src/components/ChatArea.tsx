import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { ChatMessage, ChatMode } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ModelSelector } from "./ModelSelector";
import { SmartInput } from "./SmartInput";

interface ChatAreaProps {
  messages: ChatMessage[];
  models: string[];
  selectedModel: string;
  onSelectModel: (m: string) => void;
  onSend: (text: string) => void;
  isLoading: boolean;
  configError: string | null;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
}

export function ChatArea({
  messages,
  models,
  selectedModel,
  onSelectModel,
  onSend,
  isLoading,
  configError,
  chatMode,
  onChatModeChange,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black">
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-4 overflow-visible border-b border-white/5 px-6 py-4">
        <motion.h1
          className="shrink-0 text-sm font-medium text-text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          对话
        </motion.h1>
        <ModelSelector
          models={models}
          selected={selectedModel}
          onSelect={onSelectModel}
        />
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

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <motion.div
            className="flex h-full flex-col items-center justify-center px-4 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="max-w-md rounded-2xl border border-white/10 bg-surface/40 px-8 py-10">
              <p className="text-lg font-medium text-white">有什么需要帮忙的吗？</p>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                {chatMode === "agent"
                  ? "Agent 模式：输入「查看文件」或「读取项目」可读取本地 package.json 等项目文件"
                  : "对话模式：直接与模型聊天；切换到 Agent 可读取本地项目文件"}
              </p>
            </div>
          </motion.div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <motion.div ref={bottomRef} />
      </div>

      <SmartInput
        disabled={isLoading}
        activeModel={selectedModel}
        chatMode={chatMode}
        onChatModeChange={onChatModeChange}
        onSend={onSend}
      />
    </main>
  );
}
