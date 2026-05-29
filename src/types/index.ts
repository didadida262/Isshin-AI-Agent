/** 对话模式：普通直连 LLM / 启用本地 Agent 工具链 */
export type ChatMode = "chat" | "agent";

export interface AppConfig {
  baseUrl: string;
  apiKey: string;
  models: string[];
}

export type MessageRole = "user" | "assistant" | "agent-status";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agentPhase?: "thought" | "action" | "observation" | "done";
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export interface AgentFileResult {
  filename: string;
  content: string;
  path: string;
}
