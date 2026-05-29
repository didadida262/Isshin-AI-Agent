/** Agent 状态 — 对应 Week1 GraphState，适配 PRD Thought-Action-Observation */

export type AgentPhase = "idle" | "thought" | "action" | "observation" | "done";

export interface AgentGraphState {
  userMessage: string;
  thought: string | null;
  shouldAct: boolean;
  targetFile: string | null;
  fileResult: { filename: string; content: string; path: string } | null;
  errorMessage: string | null;
  phase: AgentPhase;
  observation: string | null;
}

export const AGENT_KEYWORDS = ["查看文件", "读取项目", "读取文件", "查看项目"];

export const FILE_KEYWORD_MAP: Record<string, string> = {
  "package.json": "package.json",
  package: "package.json",
  gitignore: ".gitignore",
  ".gitignore": ".gitignore",
};
