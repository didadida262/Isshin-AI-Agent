/** Agent ReAct 状态 */

export type AgentPhase = "idle" | "thought" | "action" | "observation" | "done";

export interface AgentStep {
  step: number;
  toolName: string;
  args: Record<string, unknown>;
  resultMarkdown: string;
  error?: string;
}

export interface AgentGraphState {
  userMessage: string;
  recentMessages: string[];
  thought: string | null;
  shouldAct: boolean;
  steps: AgentStep[];
  observation: string | null;
  phase: AgentPhase;
  errorMessage: string | null;
  /** 实际执行的 ReAct 步数 */
  stepCount: number;
  routedBy: "llm" | "none";
}

export const WORKSPACE_ROOT = "/Users/miles_wang/Desktop/work";
