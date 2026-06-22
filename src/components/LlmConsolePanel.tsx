import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  clearLlmLogs,
  getLlmLogEntries,
  subscribeLlmLogs,
  type LlmLogEntry,
  type LlmLogStatus,
} from "../services/llmLog";

interface LlmConsolePanelProps {
  standalone?: boolean;
}

const STATUS_LABEL: Record<LlmLogStatus, string> = {
  pending: "请求中",
  streaming: "流式响应",
  success: "成功",
  error: "失败",
  cancelled: "已取消",
};

const STATUS_CLASS: Record<LlmLogStatus, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  streaming: "bg-sky-500/15 text-sky-300",
  success: "bg-emerald-500/15 text-emerald-300",
  error: "bg-red-500/15 text-red-300",
  cancelled: "bg-white/10 text-text-muted",
};

const LEFT_WIDTH_KEY = "isshin-llm-console-left-width";
const MIN_LEFT = 240;
const MIN_RIGHT = 320;

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function loadLeftWidth(): number {
  try {
    const raw = localStorage.getItem(LEFT_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= MIN_LEFT) return n;
  } catch {
    /* ignore */
  }
  return 320;
}

function JsonBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-text-muted">{title}</div>
      <pre className="overflow-auto rounded-lg border border-white/5 bg-black/40 p-3 text-xs leading-relaxed whitespace-pre-wrap text-white/90">
        {content}
      </pre>
    </div>
  );
}

function RequestListItem({
  entry,
  selected,
  onSelect,
}: {
  entry: LlmLogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border-b border-white/5 px-3 py-3 text-left transition ${
        selected
          ? "bg-accent/10 border-l-2 border-l-accent"
          : "hover:bg-white/[0.03] border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-sm font-medium text-white">
          {entry.label}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_CLASS[entry.status]}`}
        >
          {STATUS_LABEL[entry.status]}
        </span>
      </div>
      <div className="mt-1 truncate text-xs text-text-muted">
        {entry.request.method} {entry.request.url}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-text-dim">
        <span>{formatTime(entry.timestamp)}</span>
        {entry.durationMs != null && <span>{entry.durationMs}ms</span>}
      </div>
    </button>
  );
}

function RequestDetail({ entry }: { entry: LlmLogEntry }) {
  const responseBody =
    entry.response?.assembledContent ??
    entry.response?.body ??
    (entry.response?.streamChunks?.length
      ? entry.response.streamChunks.join("\n")
      : "");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">{entry.label}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span
            className={`rounded-full px-2 py-0.5 ${STATUS_CLASS[entry.status]}`}
          >
            {STATUS_LABEL[entry.status]}
          </span>
          <span>{formatTime(entry.timestamp)}</span>
          {entry.durationMs != null && <span>{entry.durationMs}ms</span>}
          {entry.error && (
            <span className="text-red-300">· {entry.error}</span>
          )}
        </div>
      </div>

      <JsonBlock
        title="请求"
        content={formatJson({
          url: entry.request.url,
          method: entry.request.method,
          headers: entry.request.headers,
          body: entry.request.body,
        })}
      />

      {entry.response ? (
        <>
          <JsonBlock
            title="响应状态"
            content={formatJson({
              status: entry.response.status,
              statusText: entry.response.statusText,
            })}
          />
          {entry.response.streamChunks &&
            entry.response.streamChunks.length > 0 && (
              <JsonBlock
                title={`SSE 原始块 (${entry.response.streamChunks.length})`}
                content={entry.response.streamChunks.join("\n")}
              />
            )}
          {responseBody && (
            <JsonBlock title="响应内容" content={responseBody} />
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-text-muted">
          {entry.status === "pending" || entry.status === "streaming"
            ? "请求进行中，详情将实时更新…"
            : "暂无响应数据"}
        </div>
      )}
    </div>
  );
}

export function LlmConsolePanel({ standalone = false }: LlmConsolePanelProps) {
  const [entries, setEntries] = useState<LlmLogEntry[]>(getLlmLogEntries);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => getLlmLogEntries()[0]?.id ?? null,
  );
  const [filter, setFilter] = useState<"all" | LlmLogStatus>("all");
  const [leftWidth, setLeftWidth] = useState(loadLeftWidth);
  const splitRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    return subscribeLlmLogs((event) => {
      if (event.type === "init" || event.type === "clear") {
        const next = event.type === "clear" ? [] : event.entries;
        setEntries(next);
        setSelectedId(next[0]?.id ?? null);
        return;
      }
      if (event.type === "append") {
        setEntries((prev) => {
          const without = prev.filter((e) => e.id !== event.entry.id);
          return [event.entry, ...without];
        });
        setSelectedId(event.entry.id);
        return;
      }
      if (event.type === "update") {
        setEntries((prev) =>
          prev.map((e) => (e.id === event.entry.id ? event.entry : e)),
        );
      }
    });
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.status === filter);
  }, [entries, filter]);

  const selectedEntry = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!filtered.some((e) => e.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const handleClear = useCallback(() => {
    clearLlmLogs();
    setSelectedId(null);
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const next = e.clientX - rect.left;
      const max = rect.width - MIN_RIGHT;
      setLeftWidth(Math.min(Math.max(MIN_LEFT, next), max));
    },
    [],
  );

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth));
    },
    [leftWidth],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold tracking-wide">
            LLM 请求控制台
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">
            记录所有大模型 API 的请求与响应详情
            {standalone ? "" : "（独立窗口）"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">{entries.length} 条</span>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-muted transition hover:border-white/20 hover:text-white"
          >
            <FontAwesomeIcon icon={faTrash} />
            清空
          </button>
        </div>
      </header>

      <div
        ref={splitRef}
        className="flex min-h-0 flex-1"
      >
        <aside
          className="flex min-h-0 shrink-0 flex-col border-r border-white/5 bg-[#0a0a0a]"
          style={{ width: leftWidth }}
        >
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-white/5 px-3 py-2">
            {(
              ["all", "pending", "streaming", "success", "error", "cancelled"] as const
            ).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-2 py-0.5 text-[11px] transition ${
                  filter === key
                    ? "bg-white/10 text-white"
                    : "text-text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                {key === "all" ? "全部" : STATUS_LABEL[key]}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-text-muted">
                暂无请求记录
              </div>
            ) : (
              filtered.map((entry) => (
                <RequestListItem
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={() => setSelectedId(entry.id)}
                />
              ))
            )}
          </div>
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左右分栏宽度"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-white/[0.03] transition hover:bg-accent/20 active:bg-accent/30"
        >
          <div className="h-10 w-0.5 rounded-full bg-white/15 group-hover:bg-accent/60" />
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          {selectedEntry ? (
            <RequestDetail entry={selectedEntry} />
          ) : (
            <div className="flex h-full min-h-48 items-center justify-center text-sm text-text-muted">
              发送对话或同步模型后，在左侧选择请求查看详情
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
