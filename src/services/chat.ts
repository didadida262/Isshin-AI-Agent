import { fetch } from "@tauri-apps/plugin-http";
import type { AppConfig } from "../types";
import { resolveApiUrl } from "./api";

export interface ChatCompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function testConnection(
  config: AppConfig,
  model: string,
): Promise<void> {
  const url = resolveApiUrl(config.baseUrl, "/chat/completions");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function* streamChatCompletion(
  config: AppConfig,
  model: string,
  messages: ChatCompletionMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const url = resolveApiUrl(config.baseUrl, "/chat/completions");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
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
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
          }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        // reasoning_content 为模型思考过程，不展示给用户
        if (delta) yield delta;
      } catch {
        /* skip malformed SSE chunk */
      }
    }
  }
}
