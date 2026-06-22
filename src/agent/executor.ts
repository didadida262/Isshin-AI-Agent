import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceToolName } from "./tools";
import { WORKSPACE_ROOT } from "./schema";

export interface ToolExecutionContext {
  userMessage: string;
  recentMessages: string[];
}

function sanitizeRelativePath(path: unknown): string {
  if (typeof path !== "string") return "";
  return path
    .trim()
    .replace(/^\/+/, "")
    .split("/")
    .filter((seg) => seg !== ".." && seg !== ".")
    .join("/");
}

function sanitizeQuery(query: unknown): string {
  if (typeof query !== "string") return "";
  return query.trim().slice(0, 200);
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

async function resolveProjectDir(name: string): Promise<string> {
  const result = await invoke<{
    entries: Array<{ name: string; isDir: boolean }>;
  }>("list_work_dir", { relativePath: "" });

  const dirs = result.entries.filter((e) => e.isDir).map((e) => e.name);
  const lower = name.toLowerCase();
  const exact = dirs.find((d) => d.toLowerCase() === lower);
  if (exact) return exact;

  const contains = dirs.find(
    (d) => d.toLowerCase().includes(lower) || lower.includes(d.toLowerCase()),
  );
  if (contains) return contains;

  let best = name;
  let bestScore = Infinity;
  for (const d of dirs) {
    const score = levenshtein(d.toLowerCase(), lower);
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return bestScore <= 4 ? best : name;
}

function isProjectFolder(path: string): boolean {
  const t = path.replace(/\/+$/, "");
  return t.length > 0 && !t.includes(".");
}

async function readProjectOverview(projectName: string) {
  const dir = await resolveProjectDir(projectName);
  const candidates = [
    `${dir}/README.md`,
    `${dir}/package.json`,
    `${dir}/PRD.md`,
    `${dir}/Cargo.toml`,
  ];

  for (const relativePath of candidates) {
    try {
      return await invoke<{
        filename: string;
        content: string;
        path: string;
      }>("read_work_file", { relativePath });
    } catch {
      // try next
    }
  }

  const listed = await invoke<{
    path: string;
    entries: Array<{ name: string; path: string; isDir: boolean }>;
  }>("list_work_dir", { relativePath: dir });

  return {
    filename: dir,
    path: listed.path,
    content: listed.entries
      .map((e) => `${e.isDir ? "[dir]" : "[file]"} ${e.name}`)
      .join("\n"),
  };
}

async function analyzeProject(projectName: string, query: string) {
  const resolved = await resolveProjectDir(projectName);
  const queries = [query].filter((q) => q.length >= 2);
  const matchPaths = new Map<string, { path: string; line: number; text: string }>();

  for (const q of queries) {
    const result = await invoke<{
      matches: Array<{ path: string; line: number; text: string }>;
    }>("search_work_text", { query: q, limit: 40 });

    for (const m of result.matches) {
      if (
        (m.path === resolved || m.path.startsWith(`${resolved}/`)) &&
        !matchPaths.has(m.path)
      ) {
        matchPaths.set(m.path, m);
      }
    }
  }

  let pathsToRead = [...matchPaths.keys()].slice(0, 5);

  if (pathsToRead.length === 0) {
    for (const fallback of [
      `${resolved}/README.md`,
      `${resolved}/package.json`,
    ]) {
      try {
        await invoke("read_work_file", { relativePath: fallback });
        pathsToRead = [fallback];
        break;
      } catch {
        // continue
      }
    }
  }

  const files: Array<{ path: string; content: string }> = [];
  for (const p of pathsToRead) {
    try {
      const file = await invoke<{ content: string; path: string }>(
        "read_work_file",
        { relativePath: p },
      );
      files.push({ path: file.path, content: file.content });
    } catch {
      // skip
    }
  }

  if (files.length === 0) {
    throw new Error(
      `在项目 ${resolved} 中未找到与「${query}」相关的可读源码`,
    );
  }

  return { project: resolved, query, files };
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  return parseArgs(raw);
}

export async function executeWorkspaceTool(
  toolName: WorkspaceToolName,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<string> {
  switch (toolName) {
    case "list_work_dir": {
      const relativePath = sanitizeRelativePath(args.relativePath ?? "");
      const result = await invoke<{
        path: string;
        entries: Array<{ name: string; path: string; isDir: boolean }>;
      }>("list_work_dir", { relativePath });

      const lines = result.entries.map(
        (e) => `${e.isDir ? "[dir]" : "[file]"} ${e.path}`,
      );
      return JSON.stringify({
        ok: true,
        path: result.path,
        workspace: WORKSPACE_ROOT,
        entries: lines,
        count: result.entries.length,
      });
    }

    case "read_work_file": {
      const relativePath = sanitizeRelativePath(args.relativePath);
      if (!relativePath) {
        throw new Error("relativePath 不能为空");
      }

      if (isProjectFolder(relativePath)) {
        const overview = await readProjectOverview(relativePath);
        return JSON.stringify({
          ok: true,
          path: overview.path,
          content: overview.content,
          note: "目标是项目目录，已返回 README/package.json 或目录列表",
        });
      }

      const file = await invoke<{
        filename: string;
        content: string;
        path: string;
      }>("read_work_file", { relativePath });

      return JSON.stringify({
        ok: true,
        path: file.path,
        content: file.content,
      });
    }

    case "search_work_text": {
      const query = sanitizeQuery(args.query);
      if (!query) throw new Error("query 不能为空");
      const limit =
        typeof args.limit === "number"
          ? Math.min(Math.max(1, args.limit), 50)
          : 30;

      const result = await invoke<{
        query: string;
        matches: Array<{ path: string; line: number; text: string }>;
        truncated: boolean;
      }>("search_work_text", { query, limit });

      return JSON.stringify({
        ok: true,
        query: result.query,
        truncated: result.truncated,
        matches: result.matches.map(
          (m) => `${m.path}:${m.line} ${m.text}`,
        ),
        count: result.matches.length,
      });
    }

    case "analyze_project": {
      const projectName = sanitizeRelativePath(args.projectName);
      const query =
        sanitizeQuery(args.query) || ctx.userMessage.slice(0, 80);
      if (!projectName) throw new Error("projectName 不能为空");
      if (!query) throw new Error("query 不能为空");

      const result = await analyzeProject(projectName, query);
      return JSON.stringify({
        ok: true,
        project: result.project,
        query: result.query,
        files: result.files.map((f) => ({
          path: f.path,
          content:
            f.content.length > 8000
              ? `${f.content.slice(0, 8000)}\n…(已截断)`
              : f.content,
        })),
      });
    }

    default:
      throw new Error(`未知工具: ${toolName}`);
  }
}

/** 将工具 JSON 结果格式化为可拼入最终 LLM 的 Markdown */
export function formatToolResultMarkdown(
  toolName: string,
  _args: Record<string, unknown>,
  resultJson: string,
  error?: string,
): string {
  if (error) {
    return `### 工具 \`${toolName}\` 失败\n\n\`\`\`\n${error}\n\`\`\``;
  }

  try {
    const data = JSON.parse(resultJson) as Record<string, unknown>;

    if (toolName === "analyze_project" && Array.isArray(data.files)) {
      const files = data.files as Array<{ path: string; content: string }>;
      const sections = files.map((f) => {
        const ext = f.path.includes(".") ? f.path.split(".").pop() : "text";
        return [`#### \`${f.path}\``, "", `\`\`\`${ext}`, f.content, "```"].join(
          "\n",
        );
      });
      return [
        `### analyze_project — \`${data.project}\``,
        `查询：${data.query}`,
        "",
        sections.join("\n\n"),
      ].join("\n");
    }

    if (toolName === "read_work_file" && typeof data.content === "string") {
      const ext =
        typeof data.path === "string" && data.path.includes(".")
          ? String(data.path).split(".").pop()
          : "text";
      return [
        `### read_work_file — \`${data.path}\``,
        "",
        `\`\`\`${ext}`,
        data.content,
        "```",
      ].join("\n");
    }

    if (toolName === "list_work_dir" && Array.isArray(data.entries)) {
      return [
        `### list_work_dir — \`${data.path}\``,
        `共 ${data.count} 项：`,
        "",
        ...(data.entries as string[]).map((e) => `- ${e}`),
      ].join("\n");
    }

    if (toolName === "search_work_text" && Array.isArray(data.matches)) {
      const matches = data.matches as string[];
      return [
        `### search_work_text — \`${data.query}\``,
        data.truncated ? "_（结果已截断）_" : "",
        "",
        matches.length > 0
          ? matches.map((m) => `- ${m}`).join("\n")
          : "_未找到匹配_",
      ]
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    // fall through
  }

  return `### ${toolName}\n\n\`\`\`json\n${resultJson}\n\`\`\``;
}
