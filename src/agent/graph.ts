import { actionNode, observationNode, thoughtNode } from "./nodes";
import type { AgentGraphState } from "./schema";

/** 最简 Agent 闭环：Thought → Action → Observation（对应 Week1 的 StateGraph 串联） */

export async function runAgentLoop(
  userMessage: string,
  onPhase?: (phase: AgentGraphState["phase"], detail?: string) => void,
  recentMessages: string[] = [],
): Promise<AgentGraphState> {
  let state: AgentGraphState = {
    userMessage,
    recentMessages,
    thought: null,
    shouldAct: false,
    actionType: null,
    targetPath: null,
    searchQuery: null,
    fileResult: null,
    listResult: null,
    searchResult: null,
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

  const actionDetail =
    state.actionType === "search"
      ? state.searchQuery ?? undefined
      : state.targetPath ?? undefined;
  onPhase?.("action", actionDetail);
  state = { ...state, ...(await actionNode(state)) };
  onPhase?.(state.phase);

  onPhase?.("observation");
  state = { ...state, ...observationNode(state) };
  onPhase?.("done");

  return state;
}
