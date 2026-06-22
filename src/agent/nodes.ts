import { invoke } from "@tauri-apps/api/core";
import {
  AGENT_KEYWORDS,
  FILE_KEYWORD_MAP,
  WORKSPACE_ROOT,
  type AgentActionType,
  type AgentGraphState,
} from "./schema";

const SEARCH_KEYWORDS = ["搜索", "查找", "search", "grep", "find"];
const LIST_KEYWORDS = [
  "列出目录",
  "目录",
  "list",
  "有哪些文件",
  "文件列表",
  "列给我",
  "列出来",
  "列出",
  "帮我列",
  "给我列",
  "有哪些",
  "多少个项目",
  "几个项目",
  "列一下",
];
const FOLLOWUP_LIST_PATTERNS =
  /列给我|列出来|列出|帮我列|给我列|列一下|我要你列|读取该目录|看一下|给我看看|继续列|查看一下|让我查看|帮我看看|去读|读取该/;
const PROJECT_INQUIRY_PATTERNS =
  /干嘛|做什么|干什么|是什么|介绍|用途|功能|主要|干啥|做什么用|什么项目|了解|看看|查看|讲讲|说说/;
const PROJECT_NAME_PATTERN =
  /([A-Za-z0-9][A-Za-z0-9_-]{1,64})\s*(?:这个|那个)?项目|(?:介绍|了解|看看|查看|说说|讲讲)(?:一下)?\s*([A-Za-z0-9][A-Za-z0-9_-]{1,64})|([A-Za-z0-9][A-Za-z0-9_-]{1,64})\s*(?:是|干|做)什么/;

/** 将 Desktop/work、~/work 等工作区别名归一化为相对路径 */
function normalizeTargetPath(path: string | null): string {
  if (!path) return "";
  let p = path.trim().replace(/^\/+/, "");
  const aliases = [
    /^~\/Desktop\/work\/?$/i,
    /^~\/work\/?$/i,
    /^Desktop\/work\/?$/i,
    /^Users\/[^/]+\/Desktop\/work\/?$/i,
  ];
  if (aliases.some((re) => re.test(p))) return "";
  return p;
}

function extractRelativePath(message: string): string | null {
  const backtick = message.match(/`([^`]+)`/);
  if (backtick?.[1]) return normalizeTargetPath(backtick[1].trim());

  const workspaceAlias =
    message.match(
      /(?:~\/(?:Desktop\/)?work|Desktop\/work|\/Users\/[^/\s]+\/Desktop\/work)\/?/i,
    )?.[0] ?? null;
  if (workspaceAlias) return normalizeTargetPath(workspaceAlias);

  const pathLike =
    message.match(
      /(?:[\w.-]+\/)+[\w.-]+(?:\.[\w.-]+)?|[\w.-]+\.(?:tsx?|jsx?|rs|md|json|toml|yaml|yml|css|html|py|go)/i,
    )?.[0] ?? null;
  if (pathLike) return normalizeTargetPath(pathLike);

  const lower = message.toLowerCase();
  for (const [key, file] of Object.entries(FILE_KEYWORD_MAP)) {
    if (lower.includes(key.toLowerCase())) return file;
  }

  return null;
}

function extractProjectName(message: string): string | null {
  const match = message.match(PROJECT_NAME_PATTERN);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? "").trim() || null;
}

function isProjectInquiry(message: string): boolean {
  return (
    (/项目/.test(message) && PROJECT_INQUIRY_PATTERNS.test(message)) ||
    /(?:介绍|了解|看看|查看|说说|讲讲)(?:一下)?\s*[A-Za-z0-9]/.test(message) ||
    /[A-Za-z0-9][A-Za-z0-9_-]+\s*(?:是|干|做)什么/.test(message)
  );
}

function isProjectFolderTarget(path: string): boolean {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.length > 0 && !trimmed.includes(".") && !trimmed.includes("/");
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

async function readProjectOverview(projectName: string) {
  const dir = await resolveProjectDir(projectName);
  const candidates = [
    `${dir}/README.md`,
    `${dir}/readme.md`,
    `${dir}/Readme.md`,
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
      // try next candidate
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

function inferIntentFromHistory(
  current: string,
  recent: string[],
): { actionType: AgentActionType; targetPath: string; searchQuery?: string } | null {
  if (recent.length === 0) return null;

  const context = recent.join("\n");
  const projectName =
    extractProjectName(current) ?? extractProjectName(context);
  if (
    projectName &&
    (isProjectInquiry(current) ||
      isProjectInquiry(context) ||
      FOLLOWUP_LIST_PATTERNS.test(current))
  ) {
    return { actionType: "read", targetPath: projectName };
  }

  if (!FOLLOWUP_LIST_PATTERNS.test(current)) {
    return null;
  }

  const pathHint = extractRelativePath(context) ?? extractRelativePath(current);
  const wantsList =
    LIST_KEYWORDS.some((kw) => context.includes(kw)) ||
    /项目|列|目录|list/i.test(context);
  const wantsSearch = SEARCH_KEYWORDS.some((kw) =>
    context.toLowerCase().includes(kw.toLowerCase()),
  );

  if (wantsSearch && !wantsList) {
    return {
      actionType: "search",
      targetPath: "",
      searchQuery: extractSearchQuery(context),
    };
  }

  if (wantsList || pathHint !== null) {
    return {
      actionType: "list",
      targetPath: pathHint ?? "",
    };
  }

  return null;
}

function extractSearchQuery(message: string): string {
  const quoted = message.match(/["「『](.+?)["」』]/);
  if (quoted?.[1]) return quoted[1].trim();

  for (const kw of SEARCH_KEYWORDS) {
    const idx = message.toLowerCase().indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const rest = message.slice(idx + kw.length).trim();
      if (rest) return rest.replace(/^[：:]\s*/, "");
    }
  }

  return message.trim();
}

/** 节点一：Thought — 意图识别 */
export async function thoughtNode(
  state: AgentGraphState,
): Promise<Partial<AgentGraphState>> {
  const pathHint = extractRelativePath(state.userMessage);
  const projectName = extractProjectName(state.userMessage);
  const projectInquiry =
    projectName !== null && isProjectInquiry(state.userMessage);
  const lower = state.userMessage.toLowerCase();
  const matched = AGENT_KEYWORDS.some((kw) => state.userMessage.includes(kw));

  const fromHistory = inferIntentFromHistory(
    state.userMessage,
    state.recentMessages,
  );

  if (!matched && !pathHint && !fromHistory && !projectInquiry) {
    return {
      thought: "用户消息未触发 Agent 工具链，走普通对话。",
      shouldAct: false,
      phase: "done",
    };
  }

  if (fromHistory && !matched && !pathHint && !projectInquiry) {
    if (fromHistory.actionType === "search" && fromHistory.searchQuery) {
      return {
        thought: `将延续上文，在工作区 \`${WORKSPACE_ROOT}\` 中搜索：${fromHistory.searchQuery}`,
        shouldAct: true,
        actionType: "search",
        searchQuery: fromHistory.searchQuery,
        targetPath: null,
        phase: "thought",
      };
    }

    if (
      fromHistory.actionType === "read" &&
      isProjectFolderTarget(fromHistory.targetPath)
    ) {
      return {
        thought: `将延续上文，读取项目 \`${fromHistory.targetPath}\` 的说明文件`,
        shouldAct: true,
        actionType: "read",
        targetPath: fromHistory.targetPath,
        searchQuery: null,
        phase: "thought",
      };
    }

    return {
      thought: `将延续上文，列出目录：${fromHistory.targetPath || "工作区根目录"}`,
      shouldAct: true,
      actionType: "list",
      targetPath: fromHistory.targetPath,
      searchQuery: null,
      phase: "thought",
    };
  }

  if (projectInquiry && projectName) {
    return {
      thought: `将读取项目 \`${projectName}\` 的 README / package.json 等说明文件`,
      shouldAct: true,
      actionType: "read",
      targetPath: projectName,
      searchQuery: null,
      phase: "thought",
    };
  }

  let actionType: AgentActionType = "read";
  if (SEARCH_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
    actionType = "search";
  } else if (LIST_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
    actionType = "list";
  } else if (
    /项目|有多少|几个|哪些/.test(state.userMessage) &&
    /work|工作区|目录/.test(state.userMessage)
  ) {
    actionType = "list";
  }

  if (actionType === "search") {
    const searchQuery = extractSearchQuery(state.userMessage);
    return {
      thought: `将在工作区 \`${WORKSPACE_ROOT}\` 中搜索：${searchQuery}`,
      shouldAct: true,
      actionType,
      searchQuery,
      targetPath: null,
      phase: "thought",
    };
  }

  if (actionType === "list") {
    const targetPath = pathHint ?? "";
    return {
      thought: `将列出目录：${targetPath || "工作区根目录"}`,
      shouldAct: true,
      actionType,
      targetPath,
      searchQuery: null,
      phase: "thought",
    };
  }

  const targetPath = pathHint ?? "package.json";
  return {
    thought: `将读取文件：${targetPath}`,
    shouldAct: true,
    actionType: "read",
    targetPath,
    searchQuery: null,
    phase: "thought",
  };
}

/** 节点二：Action — 通过 Tauri IPC 访问沙箱工作区 */
export async function actionNode(
  state: AgentGraphState,
): Promise<Partial<AgentGraphState>> {
  if (!state.shouldAct || !state.actionType) {
    return { phase: "done" };
  }

  try {
    if (state.actionType === "read" && state.targetPath) {
      const result = isProjectFolderTarget(state.targetPath)
        ? await readProjectOverview(state.targetPath)
        : await invoke<{
            filename: string;
            content: string;
            path: string;
          }>("read_work_file", { relativePath: state.targetPath });

      return {
        fileResult: result,
        listResult: null,
        searchResult: null,
        errorMessage: null,
        phase: "action",
      };
    }

    if (state.actionType === "list") {
      const result = await invoke<{
        path: string;
        entries: Array<{ name: string; path: string; isDir: boolean }>;
      }>("list_work_dir", { relativePath: state.targetPath ?? "" });

      return {
        listResult: {
          path: result.path,
          entries: result.entries.map((e) => ({
            name: e.name,
            path: e.path,
            isDir: e.isDir,
          })),
        },
        fileResult: null,
        searchResult: null,
        errorMessage: null,
        phase: "action",
      };
    }

    if (state.actionType === "search" && state.searchQuery) {
      const result = await invoke<{
        query: string;
        matches: Array<{ path: string; line: number; text: string }>;
        truncated: boolean;
      }>("search_work_text", { query: state.searchQuery, limit: 30 });

      return {
        searchResult: result,
        fileResult: null,
        listResult: null,
        errorMessage: null,
        phase: "action",
      };
    }

    return { phase: "done" };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return {
      fileResult: null,
      listResult: null,
      searchResult: null,
      errorMessage: err,
      phase: "action",
    };
  }
}

/** 节点三：Observation — 将执行结果格式化为可拼入对话的 Markdown */
export function observationNode(
  state: AgentGraphState,
): Partial<AgentGraphState> {
  if (!state.shouldAct) {
    return { observation: null, phase: "done" };
  }

  if (state.errorMessage) {
    return {
      observation: `**Agent 执行失败**\n\n\`\`\`\n${state.errorMessage}\n\`\`\``,
      phase: "observation",
    };
  }

  if (state.fileResult) {
    const { filename, content, path } = state.fileResult;
    const ext = filename.includes(".") ? filename.split(".").pop() : "text";
    const observation = [
      `**Agent 观察结果** — 已读取 \`${path}\``,
      `工作区：\`${WORKSPACE_ROOT}\``,
      "",
      `\`\`\`${ext}`,
      content,
      "```",
    ].join("\n");
    return { observation, phase: "done" };
  }

  if (state.listResult) {
    const lines = state.listResult.entries.map(
      (e) => `- ${e.isDir ? "📁" : "📄"} \`${e.path}\``,
    );
    const observation = [
      `**Agent 观察结果** — 目录 \`${state.listResult.path}\``,
      `工作区：\`${WORKSPACE_ROOT}\``,
      "",
      lines.length > 0 ? lines.join("\n") : "_（空目录）_",
    ].join("\n");
    return { observation, phase: "done" };
  }

  if (state.searchResult) {
    const lines =
      state.searchResult.matches.length > 0
        ? state.searchResult.matches.map(
            (m) => `- \`${m.path}:${m.line}\` — ${m.text}`,
          )
        : ["_未找到匹配项_"];
    const observation = [
      `**Agent 观察结果** — 搜索 \`${state.searchResult.query}\``,
      `工作区：\`${WORKSPACE_ROOT}\``,
      state.searchResult.truncated ? "_（结果已截断，仅显示前 30 条）_" : "",
      "",
      lines.join("\n"),
    ]
      .filter(Boolean)
      .join("\n");
    return { observation, phase: "done" };
  }

  return {
    observation: "**Agent 执行完成**，但未返回结果。",
    phase: "done",
  };
}
