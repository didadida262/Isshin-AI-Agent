import { emit, listen } from "@tauri-apps/api/event";

export type LlmLogStatus =
  | "pending"
  | "streaming"
  | "success"
  | "error"
  | "cancelled";

export interface LlmLogRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface LlmLogResponse {
  status: number;
  statusText?: string;
  body?: string;
  streamChunks?: string[];
  assembledContent?: string;
}

export interface LlmLogEntry {
  id: string;
  timestamp: number;
  label: string;
  status: LlmLogStatus;
  request: LlmLogRequest;
  response?: LlmLogResponse;
  durationMs?: number;
  error?: string;
}

const STORAGE_KEY = "isshin-llm-logs";
const MAX_ENTRIES = 200;
const EVENT_NAME = "llm-log-updated";

type LlmLogEvent =
  | { type: "init"; entries: LlmLogEntry[] }
  | { type: "append"; entry: LlmLogEntry }
  | { type: "update"; entry: LlmLogEntry }
  | { type: "clear" };

const activeEntries = new Map<string, LlmLogEntry>();

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      const match = value.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) {
        const token = match[1];
        const preview =
          token.length > 12
            ? `${token.slice(0, 6)}…${token.slice(-4)}`
            : "••••••";
        masked[key] = `Bearer ${preview}`;
        continue;
      }
    }
    masked[key] = value;
  }
  return masked;
}

function loadEntries(): LlmLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LlmLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: LlmLogEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

function broadcast(event: LlmLogEvent) {
  void emit(EVENT_NAME, event).catch(() => {
    /* web-only dev */
  });
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
}

function upsertEntry(entry: LlmLogEntry) {
  const entries = loadEntries();
  const index = entries.findIndex((e) => e.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.unshift(entry);
  saveEntries(entries);
  activeEntries.delete(entry.id);
  return entries;
}

function getEntry(id: string): LlmLogEntry | undefined {
  return activeEntries.get(id) ?? loadEntries().find((e) => e.id === id);
}

export function getLlmLogEntries(): LlmLogEntry[] {
  return loadEntries();
}

export function clearLlmLogs() {
  activeEntries.clear();
  saveEntries([]);
  broadcast({ type: "clear" });
}

export function subscribeLlmLogs(
  listener: (event: LlmLogEvent) => void,
): () => void {
  listener({ type: "init", entries: loadEntries() });

  const onCustom = (e: Event) => {
    listener((e as CustomEvent<LlmLogEvent>).detail);
  };
  window.addEventListener(EVENT_NAME, onCustom);

  let unlistenTauri: (() => void) | undefined;
  void listen<LlmLogEvent>(EVENT_NAME, (e) => listener(e.payload))
    .then((unlisten) => {
      unlistenTauri = unlisten;
    })
    .catch(() => {
      /* not in Tauri */
    });

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unlistenTauri?.();
  };
}

export const llmLog = {
  start(input: {
    label: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
  }): string {
    const entry: LlmLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      label: input.label,
      status: "pending",
      request: {
        url: input.url,
        method: input.method,
        headers: maskHeaders(input.headers),
        body: input.body,
      },
    };
    upsertEntry(entry);
    broadcast({ type: "append", entry });
    return entry.id;
  },

  markStreaming(id: string, status: number, statusText?: string) {
    const current = getEntry(id);
    if (!current) return;
    const entry: LlmLogEntry = {
      ...current,
      status: "streaming",
      response: {
        status,
        statusText,
        streamChunks: [],
        assembledContent: "",
      },
    };
    activeEntries.set(id, entry);
    upsertEntry(entry);
    broadcast({ type: "update", entry });
  },

  appendStreamChunk(id: string, rawLine: string, delta?: string) {
    const current = activeEntries.get(id) ?? getEntry(id);
    if (!current) return;
    const chunks = [...(current.response?.streamChunks ?? []), rawLine];
    const assembled =
      (current.response?.assembledContent ?? "") + (delta ?? "");
    const entry: LlmLogEntry = {
      ...current,
      status: "streaming",
      response: {
        status: current.response?.status ?? 200,
        statusText: current.response?.statusText,
        streamChunks: chunks,
        assembledContent: assembled,
      },
    };
    activeEntries.set(id, entry);
    broadcast({ type: "update", entry });
  },

  complete(
    id: string,
    patch: {
      status: number;
      statusText?: string;
      body?: string;
      streamChunks?: string[];
      assembledContent?: string;
      durationMs: number;
    },
  ) {
    const current = activeEntries.get(id) ?? getEntry(id);
    if (!current) return;
    const entry: LlmLogEntry = {
      ...current,
      status: "success",
      durationMs: patch.durationMs,
      response: {
        status: patch.status,
        statusText: patch.statusText,
        body: patch.body,
        streamChunks: patch.streamChunks ?? current.response?.streamChunks,
        assembledContent:
          patch.assembledContent ?? current.response?.assembledContent,
      },
    };
    upsertEntry(entry);
    broadcast({ type: "update", entry });
  },

  fail(
    id: string,
    patch: { status?: number; body?: string; durationMs: number },
    error: string,
  ) {
    const current = activeEntries.get(id) ?? getEntry(id);
    if (!current) return;
    const entry: LlmLogEntry = {
      ...current,
      status: "error",
      durationMs: patch.durationMs,
      error,
      response: patch.status
        ? {
            status: patch.status,
            body: patch.body,
          }
        : current.response,
    };
    upsertEntry(entry);
    broadcast({ type: "update", entry });
  },

  cancel(id: string, durationMs: number) {
    const current = activeEntries.get(id) ?? getEntry(id);
    if (!current) return;
    const entry: LlmLogEntry = {
      ...current,
      status: "cancelled",
      durationMs,
    };
    upsertEntry(entry);
    broadcast({ type: "update", entry });
  },
};