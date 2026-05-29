import { useCallback, useEffect, useState } from "react";
import type { AppConfig, ChatMessage, ChatMode, ChatSession } from "../types";
import { loadConfig, saveConfig } from "../services/config";
import { runAgentLoop } from "../agent/graph";
import { streamChatCompletion } from "../services/chat";

function uid() {
  return crypto.randomUUID();
}

function createSession(title = "新对话"): ChatSession {
  return { id: uid(), title, messages: [], createdAt: Date.now() };
}

export function useAppState() {
  const [config, setConfig] = useState<AppConfig>({
    baseUrl: "https://aiplatform.njsrd.com/llm/v1",
    apiKey: "",
    models: [],
  });
  const [sessions, setSessions] = useState<ChatSession[]>([createSession()]);
  const [activeSessionId, setActiveSessionId] = useState(sessions[0].id);
  const [selectedModel, setSelectedModel] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("chat");

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  useEffect(() => {
    loadConfig().then((cfg) => {
      setConfig(cfg);
      if (cfg.models.length > 0) setSelectedModel(cfg.models[0]);
    });
  }, []);

  const updateSession = useCallback(
    (sessionId: string, updater: (s: ChatSession) => ChatSession) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updater(s) : s)),
      );
    },
    [],
  );

  const appendMessage = useCallback(
    (sessionId: string, msg: ChatMessage) => {
      updateSession(sessionId, (s) => ({
        ...s,
        messages: [...s.messages, msg],
      }));
    },
    [updateSession],
  );

  const patchMessage = useCallback(
    (
      sessionId: string,
      messageId: string,
      patch: Partial<ChatMessage>,
    ) => {
      updateSession(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, ...patch } : m,
        ),
      }));
    },
    [updateSession],
  );

  const handleSaveConfig = useCallback(async (next: AppConfig) => {
    setConfig(next);
    await saveConfig(next);
    if (next.models.length > 0 && !next.models.includes(selectedModel)) {
      setSelectedModel(next.models[0]);
    }
  }, [selectedModel]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!config.baseUrl.trim() || !config.apiKey.trim()) {
        setConfigError("请先在设置中配置 Base URL 与 API Key");
        setSettingsOpen(true);
        return;
      }
      if (!selectedModel) {
        setConfigError("请先在设置中同步模型列表");
        setSettingsOpen(true);
        return;
      }
      setConfigError(null);

      const sessionId = activeSessionId;
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text,
      };

      updateSession(sessionId, (s) => {
        const title =
          s.messages.length === 0 ? text.slice(0, 24) : s.title;
        return {
          ...s,
          title,
          messages: [...s.messages, userMsg],
        };
      });

      setIsLoading(true);

      let agentObservation: string | null = null;

      if (chatMode === "agent") {
        setAgentRunning(true);
        const agentStatusId = uid();
        appendMessage(sessionId, {
          id: agentStatusId,
          role: "agent-status",
          content: "正在分析意图…",
          agentPhase: "thought",
        });

        try {
          const agentResult = await runAgentLoop(text, (phase, detail) => {
            const labels: Record<string, string> = {
              thought: detail ?? "意图识别中…",
              action: `正在读取 ${detail ?? "项目文件"}…`,
              observation: "整理观察结果…",
              done: "Agent 执行完成",
              idle: "待命",
            };
            patchMessage(sessionId, agentStatusId, {
              agentPhase:
                phase === "done"
                  ? "done"
                  : phase === "observation"
                    ? "observation"
                    : phase === "action"
                      ? "action"
                      : "thought",
              content: labels[phase] ?? phase,
            });
          });

          agentObservation = agentResult.observation;

          if (agentResult.shouldAct || agentObservation) {
            patchMessage(sessionId, agentStatusId, {
              agentPhase: "done",
              content: agentResult.thought ?? "Agent 执行完成",
            });
          } else {
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.filter((m) => m.id !== agentStatusId),
            }));
          }
        } finally {
          setAgentRunning(false);
        }
      }

      const assistantId = uid();
      appendMessage(sessionId, {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      });

      const history = [
        ...activeSession.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user" as const, content: text },
      ];

      const systemParts: string[] = [];
      if (agentObservation) {
        systemParts.push(
          "以下是通过本地 Agent 读取的真实文件内容，请基于此回答用户：\n" +
            agentObservation,
        );
      }

      const messages = [
        ...(systemParts.length
          ? [{ role: "system" as const, content: systemParts.join("\n") }]
          : []),
        ...history,
      ];

      try {
        let full = "";
        for await (const chunk of streamChatCompletion(
          config,
          selectedModel,
          messages,
        )) {
          full += chunk;
          patchMessage(sessionId, assistantId, { content: full });
        }
        patchMessage(sessionId, assistantId, {
          content: full,
          isStreaming: false,
        });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        patchMessage(sessionId, assistantId, {
          content: `请求失败：${err}`,
          isStreaming: false,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      config,
      selectedModel,
      activeSessionId,
      activeSession.messages,
      chatMode,
      appendMessage,
      patchMessage,
      updateSession,
    ],
  );

  const newSession = useCallback(() => {
    const s = createSession();
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      const sessions = next.length > 0 ? next : [createSession()];

      setActiveSessionId((activeId) => {
        const stillExists = sessions.some((s) => s.id === activeId);
        if (activeId === sessionId || !stillExists) return sessions[0].id;
        return activeId;
      });

      return sessions;
    });
  }, []);

  return {
    config,
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    selectedModel,
    setSelectedModel,
    settingsOpen,
    setSettingsOpen,
    agentRunning,
    isLoading,
    configError,
    setConfigError,
    handleSaveConfig,
    sendMessage,
    newSession,
    deleteSession,
    chatMode,
    setChatMode,
  };
}
