import type { AppConfig } from "../types";
import { chatCompletionWithTools, type RouterMessage } from "../services/chat";
import {
  executeWorkspaceTool,
  formatToolResultMarkdown,
  parseToolArguments,
} from "./executor";
import type { AgentGraphState, AgentStep } from "./schema";
import { WORKSPACE_ROOT } from "./schema";
import {
  AGENT_LOOP_TIMEOUT_MS,
  AGENT_MAX_STEPS,
  AGENT_STEP_TIMEOUT_MS,
  ALLOWED_TOOL_NAMES,
  ROUTER_SYSTEM_PROMPT,
  WORKSPACE_TOOLS,
  type WorkspaceToolName,
} from "./tools";

function isAllowedTool(name: string): name is WorkspaceToolName {
  return (ALLOWED_TOOL_NAMES as readonly string[]).includes(name);
}

function buildRouterMessages(
  userMessage: string,
  recentMessages: string[],
  reactMessages: RouterMessage[],
): RouterMessage[] {
  const context =
    recentMessages.length > 0
      ? `近期对话（供理解指代）：\n${recentMessages.map((m, i) => `${i + 1}. ${m}`).join("\n")}\n\n`
      : "";

  return [
    { role: "system", content: ROUTER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${context}当前用户请求：${userMessage}`,
    },
    ...reactMessages,
  ];
}

function mergeSignal(
  parent?: AbortSignal,
  timeoutMs?: number,
): AbortSignal {
  if (!timeoutMs) return parent ?? new AbortController().signal;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => {
    clearTimeout(timer);
    ctrl.abort();
  };
  parent?.addEventListener("abort", onAbort, { once: true });
  if (parent?.aborted) onAbort();
  return ctrl.signal;
}

function formatObservation(steps: AgentStep[]): string {
  if (steps.length === 0) return "";
  const parts = steps.map(
    (s, i) =>
      `## 步骤 ${i + 1}：\`${s.toolName}\`\n\n${s.error ? `**失败**：${s.error}` : s.resultMarkdown}`,
  );
  return [
    `**Agent 工作区执行记录**（\`${WORKSPACE_ROOT}\`）`,
    `共 ${steps.length} 步工具调用：`,
    "",
    parts.join("\n\n"),
  ].join("\n");
}

/**
 * Phase 1–3：LLM Tool Calling + 多步 ReAct + 护栏
 * - 路由器：LLM 选择工具与参数
 * - 循环：最多 AGENT_MAX_STEPS 步
 * - 护栏：工具白名单、路径清洗、超时、失败降级
 */
export async function runAgentLoop(
  config: AppConfig,
  model: string,
  userMessage: string,
  onPhase?: (phase: AgentGraphState["phase"], detail?: string) => void,
  recentMessages: string[] = [],
  parentSignal?: AbortSignal,
): Promise<AgentGraphState> {
  const loopSignal = mergeSignal(parentSignal, AGENT_LOOP_TIMEOUT_MS);
  const steps: AgentStep[] = [];
  const reactMessages: RouterMessage[] = [];
  let thought: string | null = null;
  let errorMessage: string | null = null;

  const ctx = { userMessage, recentMessages };

  try {
    for (let step = 0; step < AGENT_MAX_STEPS; step++) {
      if (loopSignal.aborted) {
        errorMessage = "Agent 执行超时或被取消";
        break;
      }

      onPhase?.("thought", `第 ${step + 1} 步：LLM 规划工具…`);

      const messages = buildRouterMessages(
        userMessage,
        recentMessages,
        reactMessages,
      );

      const stepSignal = mergeSignal(loopSignal, AGENT_STEP_TIMEOUT_MS);
      let response;
      try {
        response = await chatCompletionWithTools(
          config,
          model,
          messages,
          WORKSPACE_TOOLS,
          stepSignal,
        );
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        if (steps.length === 0) {
          return {
            userMessage,
            recentMessages,
            thought: "工具路由失败，走普通对话",
            shouldAct: false,
            steps: [],
            observation: null,
            phase: "done",
            errorMessage: err,
            stepCount: 0,
            routedBy: "none",
          };
        }
        errorMessage = `第 ${step + 1} 步路由失败：${err}`;
        break;
      }

      if (!response.tool_calls || response.tool_calls.length === 0) {
        thought =
          response.content?.trim() ||
          (steps.length > 0 ? "工具执行完成" : "无需调用本地工具");
        break;
      }

      reactMessages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });

      for (const call of response.tool_calls) {
        const toolName = call.function.name;
        const args = parseToolArguments(call.function.arguments);

        onPhase?.("action", toolName);

        let resultJson = "";
        let error: string | undefined;
        let resultMarkdown = "";

        if (!isAllowedTool(toolName)) {
          error = `工具不在白名单：${toolName}`;
          resultJson = JSON.stringify({ ok: false, error });
        } else {
          try {
            resultJson = await executeWorkspaceTool(toolName, args, ctx);
            resultMarkdown = formatToolResultMarkdown(
              toolName,
              args,
              resultJson,
            );
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            resultMarkdown = formatToolResultMarkdown(
              toolName,
              args,
              "",
              error,
            );
          }
        }

        steps.push({
          step: steps.length + 1,
          toolName,
          args,
          resultMarkdown,
          error,
        });

        reactMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: error
            ? JSON.stringify({ ok: false, error })
            : resultJson,
        });
      }
    }

    if (steps.length >= AGENT_MAX_STEPS && reactMessages.length > 0) {
      const lastAssistant = reactMessages[reactMessages.length - 2];
      if (lastAssistant?.role === "assistant" && lastAssistant.tool_calls) {
        errorMessage =
          errorMessage ?? `已达最大步数限制（${AGENT_MAX_STEPS} 步）`;
      }
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  onPhase?.("observation");
  const observation =
    steps.length > 0 ? formatObservation(steps) : null;

  onPhase?.("done");

  const shouldAct = steps.length > 0;
  const summaryThought =
    thought ??
    (shouldAct
      ? `已完成 ${steps.length} 步工具调用：${steps.map((s) => s.toolName).join(" → ")}`
      : "用户消息未触发工作区工具");

  return {
    userMessage,
    recentMessages,
    thought: summaryThought,
    shouldAct,
    steps,
    observation,
    phase: "done",
    errorMessage,
    stepCount: steps.length,
    routedBy: shouldAct ? "llm" : "none",
  };
}
