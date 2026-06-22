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
  AGENT_MAX_ROUNDS,
  AGENT_MAX_TOOL_CALLS,
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
  const body = [
    `**Agent 工作区执行记录**（\`${WORKSPACE_ROOT}\`）`,
    `共 ${steps.length} 次工具调用：`,
    "",
    parts.join("\n\n"),
  ].join("\n");

  const MAX_CHARS = 48_000;
  if (body.length <= MAX_CHARS) return body;
  return `${body.slice(0, MAX_CHARS)}\n\n…（观察结果过长已截断，原文 ${body.length} 字符）`;
}

function toolCallSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

/**
 * Phase 1–3：LLM Tool Calling + 多步 ReAct + 护栏
 * - 路由器：LLM 选择工具与参数
 * - 循环：最多 AGENT_MAX_ROUNDS 轮 LLM、AGENT_MAX_TOOL_CALLS 次工具执行
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
  const seenToolCalls = new Set<string>();
  let thought: string | null = null;
  let errorMessage: string | null = null;
  let roundCount = 0;

  const ctx = { userMessage, recentMessages };

  try {
    for (let round = 0; round < AGENT_MAX_ROUNDS; round++) {
      roundCount = round + 1;
      if (loopSignal.aborted) {
        errorMessage = "Agent 执行超时或被取消";
        break;
      }

      if (steps.length >= AGENT_MAX_TOOL_CALLS) {
        errorMessage =
          errorMessage ?? `已达工具调用上限（${AGENT_MAX_TOOL_CALLS} 次）`;
        break;
      }

      onPhase?.("thought", `第 ${round + 1} 轮：LLM 规划工具…`);

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
        errorMessage = `第 ${round + 1} 轮路由失败：${err}`;
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

      let hitToolCap = false;

      for (const call of response.tool_calls) {
        if (steps.length >= AGENT_MAX_TOOL_CALLS) {
          errorMessage =
            errorMessage ?? `已达工具调用上限（${AGENT_MAX_TOOL_CALLS} 次）`;
          hitToolCap = true;
          break;
        }

        const toolName = call.function.name;
        const args = parseToolArguments(call.function.arguments);
        const sig = toolCallSignature(toolName, args);

        if (seenToolCalls.has(sig)) {
          errorMessage =
            errorMessage ?? "检测到重复工具调用，已提前结束路由";
          hitToolCap = true;
          break;
        }
        seenToolCalls.add(sig);

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

      if (hitToolCap) break;
    }

    if (
      roundCount >= AGENT_MAX_ROUNDS &&
      steps.length > 0 &&
      !thought
    ) {
      errorMessage =
        errorMessage ?? `已达最大路由轮数（${AGENT_MAX_ROUNDS} 轮）`;
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
      ? `已完成 ${roundCount} 轮路由、${steps.length} 次工具：${steps.map((s) => s.toolName).join(" → ")}`
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
