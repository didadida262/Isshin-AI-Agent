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
