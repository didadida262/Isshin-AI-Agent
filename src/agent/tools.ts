import { WORKSPACE_ROOT } from "./schema";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const ALLOWED_TOOL_NAMES = [
  "list_work_dir",
  "read_work_file",
  "search_work_text",
  "analyze_project",
] as const;

export type WorkspaceToolName = (typeof ALLOWED_TOOL_NAMES)[number];

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_work_dir",
      description:
        "列出工作区目录内容。relativePath 为空字符串表示工作区根目录。用于查看有哪些项目/文件。",
      parameters: {
        type: "object",
        properties: {
          relativePath: {
            type: "string",
            description: `相对于 ${WORKSPACE_ROOT} 的路径，空字符串为根目录`,
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_work_file",
      description:
        "读取工作区内单个文本文件。若目标是项目目录而非文件，请用 list_work_dir 或 analyze_project。",
      parameters: {
        type: "object",
        properties: {
          relativePath: {
            type: "string",
            description: "相对路径，如 Isshin-AI-Agent/package.json",
          },
        },
        required: ["relativePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_work_text",
      description: "在工作区递归搜索文本（跳过 node_modules/.git 等）。返回匹配行。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          limit: {
            type: "number",
            description: "最大匹配条数，默认 30",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_project",
      description:
        "分析某项目的功能逻辑：在项目目录内搜索关键词并读取相关源码（最多 5 个文件）。适合「如何实现」「源码逻辑」类问题。",
      parameters: {
        type: "object",
        properties: {
          projectName: {
            type: "string",
            description: "项目目录名，如 Isshin-Etymonix-AI",
          },
          query: {
            type: "string",
            description: "要分析的功能/关键词，如「单词卡片」",
          },
        },
        required: ["projectName", "query"],
      },
    },
  },
];

export const ROUTER_SYSTEM_PROMPT = `你是 Isshin AI Agent 的工作区工具路由器（不是面向用户的最终回复者）。

工作区根目录：\`${WORKSPACE_ROOT}\`
- 可访问该目录下全部子目录（如 \`Isshin-Etymonix-AI/src/\`）
- 自动跳过 node_modules、.git、target、dist 等

规则：
1. 用户问题涉及本地项目/文件/目录/代码时，调用合适的工具获取真实数据
2. 可多次调用工具（先 list 再 read/search/analyze）
3. 信息足够时，不再调用工具（返回空 tool_calls 或简短 content）
4. 纯闲聊、通用知识、与本地工作区无关时，不调用任何工具
5. 路径一律使用相对工作区根目录的路径；列出根目录项目时 relativePath 传 ""
6. 不要编造工具结果；不要输出 [TOOL_CALL] 等标记`;

export const AGENT_MAX_STEPS = 5;
export const AGENT_LOOP_TIMEOUT_MS = 120_000;
export const AGENT_STEP_TIMEOUT_MS = 45_000;
