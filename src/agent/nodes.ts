import { invoke } from "@tauri-apps/api/core";
import {
  AGENT_KEYWORDS,
  FILE_KEYWORD_MAP,
  type AgentGraphState,
} from "./schema";

/** 节点一：Thought — 意图识别 */
export async function thoughtNode(
  state: AgentGraphState,
): Promise<Partial<AgentGraphState>> {
  const msg = state.userMessage.toLowerCase();
  const matched = AGENT_KEYWORDS.some((kw) => state.userMessage.includes(kw));

  if (!matched) {
    return {
      thought: "用户消息未触发 Agent 工具链，走普通对话。",
      shouldAct: false,
      phase: "done",
    };
  }

  let targetFile = "package.json";
  for (const [key, file] of Object.entries(FILE_KEYWORD_MAP)) {
    if (msg.includes(key.toLowerCase())) {
      targetFile = file;
      break;
    }
  }

  return {
    thought: `检测到文件操作意图，准备读取项目文件：${targetFile}`,
    shouldAct: true,
    targetFile,
    phase: "thought",
  };
}

/** 节点二：Action — 通过 Tauri IPC 读取本地文件 */
export async function actionNode(
  state: AgentGraphState,
): Promise<Partial<AgentGraphState>> {
  if (!state.shouldAct || !state.targetFile) {
    return { phase: "done" };
  }

  try {
    const result = await invoke<{
      filename: string;
      content: string;
      path: string;
    }>("read_project_file", { filename: state.targetFile });

    return {
      fileResult: result,
      errorMessage: null,
      phase: "action",
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return {
      fileResult: null,
      errorMessage: err,
      phase: "action",
    };
  }
}

/** 节点三：Observation — 将执行结果格式化为可拼入对话的 Markdown */
export function observationNode(
  state: AgentGraphState,
): Partial<AgentGraphState> {
  if (!state.shouldAct) {
    return { observation: null, phase: "done" };
  }

  if (state.errorMessage) {
    return {
      observation: `**Agent 执行失败**\n\n\`\`\`\n${state.errorMessage}\n\`\`\``,
      phase: "observation",
    };
  }

  if (!state.fileResult) {
    return {
      observation: "**Agent 执行完成**，但未返回文件内容。",
      phase: "observation",
    };
  }

  const { filename, content, path } = state.fileResult;
  const ext = filename.endsWith(".json") ? "json" : "text";
  const observation = [
    `**Agent 观察结果** — 已读取 \`${path}\``,
    "",
    `\`\`\`${ext}`,
    content,
    "```",
  ].join("\n");

  return { observation, phase: "done" };
}
