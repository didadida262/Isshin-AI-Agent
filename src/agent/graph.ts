import { actionNode, observationNode, thoughtNode } from "./nodes";
import type { AgentGraphState } from "./schema";

/** 最简 Agent 闭环：Thought → Action → Observation（对应 Week1 的 StateGraph 串联） */

export async function runAgentLoop(
  userMessage: string,
  onPhase?: (phase: AgentGraphState["phase"], detail?: string) => void,
): Promise<AgentGraphState> {
  let state: AgentGraphState = {
    userMessage,
    thought: null,
    shouldAct: false,
    targetFile: null,
    fileResult: null,
    errorMessage: null,
    phase: "idle",
    observation: null,
  };

  onPhase?.("thought");
  state = { ...state, ...(await thoughtNode(state)) };
  onPhase?.(state.phase, state.thought ?? undefined);

  if (!state.shouldAct) {
    return state;
  }

  onPhase?.("action", state.targetFile ?? undefined);
  state = { ...state, ...(await actionNode(state)) };
  onPhase?.(state.phase);

  onPhase?.("observation");
  state = { ...state, ...observationNode(state) };
  onPhase?.("done");

  return state;
}
