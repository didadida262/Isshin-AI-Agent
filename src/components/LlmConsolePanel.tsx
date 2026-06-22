import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
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

const FILTER_LABEL: Record<"all" | LlmLogStatus, string> = {
  all: "全部",
  pending: "请求中",
  streaming: "流式",
  success: "成功",
  error: "失败",
  cancelled: "取消",
};

const STATUS_CLASS: Record<LlmLogStatus, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  streaming: "bg-sky-500/15 text-sky-300",
  success: "bg-emerald-500/15 text-emerald-300",
  error: "bg-red-500/15 text-red-300",
  cancelled: "bg-white/10 text-text-muted",
};

const LEFT_WIDTH_KEY = "isshin-llm-console-left-width";
const MIN_LEFT = 280;
const MIN_RIGHT = 320;
const DEFAULT_LEFT_WIDTH = 380;
const FILTER_ROW_MIN_WIDTH = 360;

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
    if (Number.isFinite(n) && n >= MIN_LEFT) {
      return Math.max(n, FILTER_ROW_MIN_WIDTH);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LEFT_WIDTH;
}

function CodePanel({ content }: { content: string }) {
  return (
    <pre className="overflow-auto p-3 text-xs leading-relaxed whitespace-pre-wrap text-white/90">
      {content}
    </pre>
  );
}

function SubBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="border-t border-white/5">
      <div className="bg-black/20 px-3 py-1.5 text-[11px] font-medium tracking-wide text-text-muted uppercase">
        {label}
      </div>
      <CodePanel content={content} />
    </div>
  );
}

function DetailSection({
  variant,
  title,
  subtitle,
  children,
}: {
  variant: "request" | "response";
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const isRequest = variant === "request";
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border ${
        isRequest
          ? "border-sky-500/25 bg-sky-500/[0.04]"
          : "border-emerald-500/25 bg-emerald-500/[0.04]"
      }`}
    >
      <header
        className={`flex shrink-0 items-center gap-2 border-b px-3 py-2.5 ${
          isRequest
            ? "border-sky-500/20 bg-sky-500/10"
            : "border-emerald-500/20 bg-emerald-500/10"
        }`}
      >
        <FontAwesomeIcon
          icon={isRequest ? faArrowUp : faArrowDown}
          className={`text-xs ${isRequest ? "text-sky-400" : "text-emerald-400"}`}
        />
        <span
          className={`text-sm font-semibold ${isRequest ? "text-sky-300" : "text-emerald-300"}`}
        >
          {title}
        </span>
        {subtitle && (
          <span className="ml-auto text-[11px] text-text-muted">{subtitle}</span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
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

  const responseSubtitle = entry.response
    ? `HTTP ${entry.response.status}${entry.response.statusText ? ` ${entry.response.statusText}` : ""}${entry.durationMs != null ? ` · ${entry.durationMs}ms` : ""}`
    : entry.status === "pending" || entry.status === "streaming"
      ? "等待响应…"
      : "无响应";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <h2 className="text-sm font-semibold text-white">{entry.label}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span
            className={`rounded-full px-2 py-0.5 ${STATUS_CLASS[entry.status]}`}
          >
            {STATUS_LABEL[entry.status]}
          </span>
          <span>{formatTime(entry.timestamp)}</span>
          {entry.error && (
            <span className="text-red-300">· {entry.error}</span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <DetailSection
          variant="request"
          title="请求"
          subtitle={`${entry.request.method} ${entry.request.url}`}
        >
          <div className="bg-black/25 px-3 py-2 font-mono text-xs text-sky-200/90">
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-semibold text-sky-300">
              {entry.request.method}
            </span>
            <span className="ml-2 break-all">{entry.request.url}</span>
          </div>
          <SubBlock
            label="Headers"
            content={formatJson(entry.request.headers)}
          />
          {entry.request.body !== undefined && (
            <SubBlock label="Body" content={formatJson(entry.request.body)} />
          )}
        </DetailSection>

        <DetailSection variant="response" title="响应" subtitle={responseSubtitle}>
          {entry.response ? (
            <>
              <div className="flex items-center gap-2 border-b border-white/5 bg-black/25 px-3 py-2">
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-sm font-bold ${
                    entry.response.status >= 200 && entry.response.status < 300
                      ? "bg-emerald-500/20 text-emerald-300"
                      : entry.response.status >= 400
                        ? "bg-red-500/20 text-red-300"
                        : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {entry.response.status}
                </span>
                {entry.response.statusText && (
                  <span className="text-xs text-text-muted">
                    {entry.response.statusText}
                  </span>
                )}
                {entry.status === "streaming" && (
                  <span className="ml-auto animate-pulse text-[11px] text-sky-300">
                    流式接收中…
                  </span>
                )}
              </div>
              {entry.response.streamChunks &&
                entry.response.streamChunks.length > 0 && (
                  <SubBlock
                    label={`SSE 原始块 (${entry.response.streamChunks.length})`}
                    content={entry.response.streamChunks.join("\n")}
                  />
                )}
              {responseBody ? (
                <SubBlock label="Body" content={responseBody} />
              ) : (
                <div className="px-4 py-6 text-center text-xs text-text-muted">
                  {entry.status === "streaming"
                    ? "正在接收流式数据…"
                    : "响应体为空"}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-24 items-center justify-center px-4 py-8 text-center text-sm text-text-muted">
              {entry.status === "pending" || entry.status === "streaming"
                ? "请求进行中，响应将显示在此处…"
                : "暂无响应数据"}
            </div>
          )}
        </DetailSection>
      </div>
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
          <div className="flex shrink-0 flex-nowrap gap-1 border-b border-white/5 px-2 py-2">
            {(
              ["all", "pending", "streaming", "success", "error", "cancelled"] as const
            ).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-4 whitespace-nowrap transition ${
                  filter === key
                    ? "bg-white/10 text-white"
                    : "text-text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                {FILTER_LABEL[key]}
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

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
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
