import { useCallback, useEffect, useRef, useState } from "react";
import type { AppConfig, ChatMessage, ChatMode, ChatSession } from "../types";
import { loadConfig, saveConfig } from "../services/config";
import { runAgentLoop } from "../agent/graph";
import { ISSHIN_AGENT_PERSONA } from "../agent/prompt";
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
  const [isLoading, setIsLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("chat");
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef(false);

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

  const stopGeneration = useCallback(() => {
    cancelRef.current = true;
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

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
      cancelRef.current = false;
      const requestController = new AbortController();
      abortRef.current = requestController;

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

      const agentStatusId = uid();
      const showAgentUi = chatMode === "agent";
      if (showAgentUi) {
        appendMessage(sessionId, {
          id: agentStatusId,
          role: "agent-status",
          content: "正在分析意图…",
          agentPhase: "thought",
        });
      }

      const recentForAgent = activeSession.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-6)
        .map((m) => m.content);

      const agentResult = await runAgentLoop(
        config,
        selectedModel,
        text,
        (phase, detail) => {
          if (!showAgentUi) return;
          const labels: Record<string, string> = {
            thought: detail ?? "意图识别中…",
            action:
              detail
                ? `正在执行本地工具：${detail}…`
                : "正在访问本地工作区…",
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
        },
          recentForAgent,
          requestController.signal,
        );

      agentObservation = agentResult.observation;

      if (showAgentUi) {
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
      } else if (agentResult.shouldAct && !agentObservation) {
        // 对话模式下触发了工具但未拿到结果，仍提示用户
        agentObservation = agentResult.thought ?? null;
      }

      if (cancelRef.current) {
        setIsLoading(false);
        return;
      }

      const assistantId = uid();
      appendMessage(sessionId, {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      });

      const systemParts: string[] = [];
      if (chatMode === "agent") {
        systemParts.push(ISSHIN_AGENT_PERSONA);
      }

      const agentContextPrefix =
        "【重要】本地 Agent 工具已在本机执行完毕，结果见下方。你必须直接根据结果用自然语言回答用户，禁止输出 [TOOL_CALL]、list_directory、function_call 等任何工具调用语法，禁止让用户自行执行终端命令。\n\n";

      if (agentObservation) {
        systemParts.push(
          (chatMode === "agent"
            ? "以下是通过本地 Agent 从工作区读取的真实内容（可能包含多个源码文件），请基于代码梳理调用链、数据流与关键函数，解释用户问题的具体实现逻辑，不要只复述 README 或泛泛而谈：\n"
            : "以下是通过本地 Agent 从工作区读取的真实数据，你必须基于此直接回答：\n") +
            agentContextPrefix +
            agentObservation,
        );
      }

      const userContentForApi = agentObservation
        ? `${text}\n\n---\n${agentContextPrefix}${agentObservation}`
        : text;

      const messages = [
        ...(systemParts.length
          ? [{ role: "system" as const, content: systemParts.join("\n\n") }]
          : []),
        ...activeSession.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user" as const, content: userContentForApi },
      ];

      try {
        let full = "";
        for await (const chunk of streamChatCompletion(
          config,
          selectedModel,
          messages,
          requestController.signal,
        )) {
          if (cancelRef.current) break;
          full += chunk;
          patchMessage(sessionId, assistantId, { content: full.trimStart() });
        }

        const wasCancelled =
          cancelRef.current ||
          requestController.signal.aborted;

        if (wasCancelled && !full.trim()) {
          updateSession(sessionId, (s) => ({
            ...s,
            messages: s.messages.filter((m) => m.id !== assistantId),
          }));
        } else {
          patchMessage(sessionId, assistantId, {
            content: full.trimStart(),
            isStreaming: false,
          });
        }
      } catch (e) {
        if (cancelRef.current || (e instanceof Error && e.name === "AbortError")) {
          updateSession(sessionId, (s) => {
            const msg = s.messages.find((m) => m.id === assistantId);
            if (!msg?.content.trim()) {
              return {
                ...s,
                messages: s.messages.filter((m) => m.id !== assistantId),
              };
            }
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            };
          });
        } else {
          const err = e instanceof Error ? e.message : String(e);
          patchMessage(sessionId, assistantId, {
            content: `请求失败：${err}`,
            isStreaming: false,
          });
        }
      } finally {
        abortRef.current = null;
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
    isLoading,
    configError,
    setConfigError,
    handleSaveConfig,
    sendMessage,
    stopGeneration,
    newSession,
    deleteSession,
    chatMode,
    setChatMode,
  };
}
