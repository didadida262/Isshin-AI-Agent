import { fetch } from "@tauri-apps/plugin-http";
import type { AppConfig } from "../types";
import { resolveApiUrl } from "./api";
import { llmLog } from "./llmLog";

export interface ChatCompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function testConnection(
  config: AppConfig,
  model: string,
): Promise<void> {
  const url = resolveApiUrl(config.baseUrl, "/chat/completions");
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const body = {
    model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    stream: false,
  };
  const logId = llmLog.start({
    label: "连接测试",
    url,
    method: "POST",
    headers,
    body,
  });
  const startedAt = performance.now();

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const durationMs = Math.round(performance.now() - startedAt);

  if (!res.ok) {
    llmLog.fail(
      logId,
      { status: res.status, body: text, durationMs },
      text || `HTTP ${res.status}`,
    );
    throw new Error(text || `HTTP ${res.status}`);
  }

  llmLog.complete(logId, {
    status: res.status,
    statusText: res.statusText,
    body: text,
    durationMs,
  });
}

export interface ChatCompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type RouterMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionWithToolsResult {
  content: string | null;
  tool_calls: ToolCall[] | null;
  finish_reason: string | null;
}

function normalizeToolCalls(message: Record<string, unknown>): ToolCall[] | null {
  const raw = message.tool_calls;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((tc, i) => {
      const item = tc as Record<string, unknown>;
      const fn = item.function as Record<string, unknown> | undefined;
      return {
        id: String(item.id ?? `call_${i}`),
        type: "function" as const,
        function: {
          name: String(fn?.name ?? ""),
          arguments: String(fn?.arguments ?? "{}"),
        },
      };
    });
  }

  const legacy = message.function_call as Record<string, unknown> | undefined;
  if (legacy?.name) {
    return [
      {
        id: "call_legacy",
        type: "function",
        function: {
          name: String(legacy.name),
          arguments: String(legacy.arguments ?? "{}"),
        },
      },
    ];
  }

  return null;
}

export async function chatCompletionWithTools(
  config: AppConfig,
  model: string,
  messages: RouterMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal,
): Promise<ChatCompletionWithToolsResult> {
  const url = resolveApiUrl(config.baseUrl, "/chat/completions");
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const body = {
    model,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
  };
  const logId = llmLog.start({
    label: "Agent 路由 (tools)",
    url,
    method: "POST",
    headers,
    body,
  });
  const startedAt = performance.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    const durationMs = Math.round(performance.now() - startedAt);

    if (!res.ok) {
      llmLog.fail(logId, { status: res.status, body: text, durationMs }, text);
      throw new Error(text || `HTTP ${res.status}`);
    }

    llmLog.complete(logId, {
      status: res.status,
      statusText: res.statusText,
      body: text,
      durationMs,
    });

    const parsed = JSON.parse(text) as {
      choices?: Array<{
        finish_reason?: string;
        message?: Record<string, unknown>;
      }>;
    };
    const choice = parsed.choices?.[0];
    const message = choice?.message ?? {};

    return {
      content: (message.content as string | null) ?? null,
      tool_calls: normalizeToolCalls(message),
      finish_reason: choice?.finish_reason ?? null,
    };
  } catch (e) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (signal?.aborted) {
      llmLog.cancel(logId, durationMs);
      throw e;
    }
    if (e instanceof Error) {
      llmLog.fail(logId, { durationMs }, e.message);
    }
    throw e;
  }
}

export async function* streamChatCompletion(
  config: AppConfig,
  model: string,
  messages: ChatCompletionMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const url = resolveApiUrl(config.baseUrl, "/chat/completions");
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const body = { model, messages, stream: true };
  const logId = llmLog.start({
    label: "对话补全 (流式)",
    url,
    method: "POST",
    headers,
    body,
  });
  const startedAt = performance.now();
  const streamChunks: string[] = [];
  let assembled = "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      const durationMs = Math.round(performance.now() - startedAt);
      llmLog.fail(
        logId,
        { status: res.status, body: text, durationMs },
        text || `HTTP ${res.status}`,
      );
      throw new Error(text || `HTTP ${res.status}`);
    }

    llmLog.markStreaming(logId, res.status, res.statusText);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        llmLog.cancel(logId, Math.round(performance.now() - startedAt));
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          llmLog.complete(logId, {
            status: res.status,
            statusText: res.statusText,
            streamChunks,
            assembledContent: assembled,
            durationMs: Math.round(performance.now() - startedAt),
          });
          return;
        }

        streamChunks.push(trimmed);

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string; reasoning_content?: string };
            }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          const reasoning = parsed.choices?.[0]?.delta?.reasoning_content;
          if (reasoning) {
            llmLog.appendStreamChunk(logId, trimmed);
          }
          if (delta) {
            assembled += delta;
            llmLog.appendStreamChunk(logId, trimmed, delta);
            yield delta;
          }
        } catch {
          llmLog.appendStreamChunk(logId, trimmed);
        }
      }
    }

    llmLog.complete(logId, {
      status: res.status,
      statusText: res.statusText,
      streamChunks,
      assembledContent: assembled,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (e) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (signal?.aborted) {
      llmLog.cancel(logId, durationMs);
      return;
    }
    if (e instanceof Error && e.name !== "AbortError") {
      llmLog.fail(logId, { durationMs }, e.message);
    }
    throw e;
  }
}
