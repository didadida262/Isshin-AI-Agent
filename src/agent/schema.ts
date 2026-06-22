/** Agent 状态 — 对应 Week1 GraphState，适配 PRD Thought-Action-Observation */

export type AgentPhase = "idle" | "thought" | "action" | "observation" | "done";

export type AgentActionType = "read" | "list" | "search" | "analyze";

export interface AgentGraphState {
  userMessage: string;
  /** 最近几轮对话，用于跟进指令（如「列给我」） */
  recentMessages: string[];
  thought: string | null;
  shouldAct: boolean;
  actionType: AgentActionType | null;
  targetPath: string | null;
  searchQuery: string | null;
  fileResult: { filename: string; content: string; path: string } | null;
  listResult: {
    path: string;
    entries: Array<{ name: string; path: string; isDir: boolean }>;
  } | null;
  searchResult: {
    query: string;
    matches: Array<{ path: string; line: number; text: string }>;
    truncated: boolean;
  } | null;
  analyzeResult: {
    project: string;
    query: string;
    files: Array<{ path: string; content: string }>;
    searchTerms: string[];
  } | null;
  errorMessage: string | null;
  phase: AgentPhase;
  observation: string | null;
}

export const AGENT_KEYWORDS = [
  "查看文件",
  "读取项目",
  "读取文件",
  "查看项目",
  "搜索",
  "查找",
  "列出目录",
  "列给我",
  "列出来",
  "列出",
  "帮我列",
  "给我列",
  "有哪些",
  "有哪些项目",
  "文件夹",
  "work",
  "工作区",
  "多少个项目",
  "几个项目",
  "目录",
  "list",
  "search",
  "grep",
  "find",
  "如何",
  "怎么",
  "怎样",
  "逻辑",
  "实现",
  "生成",
  "流程",
  "原理",
  "源码",
  "源代码",
];

export const FILE_KEYWORD_MAP: Record<string, string> = {
  "package.json": "package.json",
  package: "package.json",
  gitignore: ".gitignore",
  ".gitignore": ".gitignore",
  readme: "README.md",
  prd: "PRD.md",
};

export const WORKSPACE_ROOT = "/Users/miles_wang/Desktop/work";
