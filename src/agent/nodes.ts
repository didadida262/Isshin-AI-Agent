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
  "有哪些项目",
  "文件夹",
  "文件夹下",
];
const FOLLOWUP_LIST_PATTERNS =
  /列给我|列出来|列出|帮我列|给我列|列一下|我要你列|读取该目录|看一下|给我看看|继续列|查看一下|让我查看|帮我看看|去读|读取该/;
const PROJECT_INQUIRY_PATTERNS =
  /干嘛|做什么|干什么|是什么|介绍|用途|功能|主要|干啥|做什么用|什么项目|了解|看看|查看|讲讲|说说/;
const PROJECT_NAME_PATTERN =
  /([A-Za-z0-9][A-Za-z0-9_-]{1,64})\s*(?:这个|那个)?项目|(?:介绍|了解|看看|查看|说说|讲讲)(?:一下)?\s*([A-Za-z0-9][A-Za-z0-9_-]{1,64})|([A-Za-z0-9][A-Za-z0-9_-]{1,64})\s*(?:是|干|做)什么/;
const LOGIC_INQUIRY_PATTERNS =
  /如何|怎么|怎样|为何|为什么|流程|逻辑|实现|原理|机制|工作方式|怎么做的|如何实现|是如何|怎样实现|怎么实现|调用链|数据流/;
const THIS_PROJECT_PATTERNS = /这个项目|此项目|该项目的|当前项目/;

function isSourceCodeRequest(message: string): boolean {
  return /源码|源代码|source\s*code|读.*代码|看.*代码|读取文件|直接读取/i.test(
    message,
  );
}

function isLogicInquiry(message: string): boolean {
  return LOGIC_INQUIRY_PATTERNS.test(message);
}

function extractLogicSearchTerms(message: string): string[] {
  const terms: string[] = [];

  const featurePhrases = message.match(
    /[\u4e00-\u9fff]{2,10}(?:卡片|功能|模块|流程|逻辑|接口|组件|页面|服务|生成|处理|列表|表单)/g,
  );
  if (featurePhrases) terms.push(...featurePhrases);

  const english = message.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g);
  if (english) {
    terms.push(
      ...english.filter(
        (w) => !/^(this|project|agent|readme)$/i.test(w),
      ),
    );
  }

  if (terms.length === 0) {
    const cleaned = message
      .replace(
        /这个|该|此|项目|目前|现在|请问|一下|吗|呢|如何|怎么|怎样|是|的|了|有|在/g,
        "",
      )
      .trim();
    if (cleaned.length >= 2) terms.push(cleaned.slice(0, 24));
  }

  return [...new Set(terms.filter((t) => t.length >= 2))];
}

/** 将 Desktop/work、~/work 等工作区别名归一化为相对路径（空字符串 = 工作区根目录） */
function normalizeTargetPath(path: string | null): string {
  if (!path) return "";
  const p = path.trim().replace(/^\/+/, "");
  const workspaceRootPatterns = [
    /^~\/Desktop\/work\/?$/i,
    /^~\/work\/?$/i,
    /^Desktop\/work\/?$/i,
    /^Users\/[^/]+\/Desktop\/work\/?$/i,
    /^work\s*文件夹\/?$/i,
    /^work\s*目录\/?$/i,
    /^work\/?$/i,
    /^工作文件夹\/?$/i,
    /^工作区\/?$/i,
    /^work\s*folder\/?$/i,
  ];
  if (workspaceRootPatterns.some((re) => re.test(p))) return "";
  return p;
}

function extractRelativePath(message: string): string | null {
  const backtick = message.match(/`([^`]+)`/);
  if (backtick?.[1]) return normalizeTargetPath(backtick[1].trim());

  const workspaceAlias =
    message.match(
      /(?:~\/(?:Desktop\/)?work|Desktop\/work|\/Users\/[^/\s]+\/Desktop\/work|work\s*文件夹|work\s*目录|工作文件夹|工作区)\/?/i,
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

async function resolveProjectFromContext(recent: string[]): Promise<string | null> {
  const result = await invoke<{
    entries: Array<{ name: string; isDir: boolean }>;
  }>("list_work_dir", { relativePath: "" });

  const dirs = result.entries.filter((e) => e.isDir).map((e) => e.name);
  const context = recent.join("\n").toLowerCase();

  let bestDir: string | null = null;
  let bestScore = 0;

  for (const d of dirs) {
    const lower = d.toLowerCase();
    if (context.includes(lower) && lower.length > bestScore) {
      bestDir = d;
      bestScore = lower.length;
    }
  }

  if (bestDir) return bestDir;

  for (const d of dirs) {
    for (const part of d.split(/[_\-.]/)) {
      if (part.length >= 3 && context.includes(part.toLowerCase())) {
        const score = part.length + (d.includes(part) ? 2 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestDir = d;
        }
      }
    }
  }

  return bestDir;
}

async function analyzeProjectLogic(
  projectHint: string,
  userMessage: string,
  recentMessages: string[],
) {
  const project =
    projectHint ||
    extractProjectName(userMessage) ||
    (await resolveProjectFromContext([...recentMessages, userMessage])) ||
    "";

  if (!project) {
    throw new Error("无法确定要分析的项目，请说明项目名称或先介绍项目");
  }

  const resolvedProject = isProjectFolderTarget(project)
    ? await resolveProjectDir(project)
    : project;

  const searchTerms = extractLogicSearchTerms(userMessage);
  const queries =
    searchTerms.length > 0
      ? searchTerms
      : [userMessage.replace(/这个项目|如何|怎么|怎样/g, "").trim()].filter(
          (q) => q.length >= 2,
        );

  const matchPaths = new Map<string, { path: string; line: number; text: string }>();

  for (const q of queries.slice(0, 4)) {
    const result = await invoke<{
      matches: Array<{ path: string; line: number; text: string }>;
    }>("search_work_text", { query: q, limit: 40 });

    for (const m of result.matches) {
      const inProject =
        m.path === resolvedProject ||
        m.path.startsWith(`${resolvedProject}/`);
      if (inProject && !matchPaths.has(m.path)) {
        matchPaths.set(m.path, m);
      }
    }
  }

  let pathsToRead = [...matchPaths.keys()].slice(0, 5);

  if (pathsToRead.length === 0) {
    for (const fallback of [
      `${resolvedProject}/README.md`,
      `${resolvedProject}/package.json`,
      `${resolvedProject}/src`,
    ]) {
      try {
        if (fallback.endsWith("/src")) {
          const listed = await invoke<{
            entries: Array<{ path: string; isDir: boolean }>;
          }>("list_work_dir", { relativePath: fallback });
          pathsToRead = listed.entries
            .filter((e) => !e.isDir && /\.(tsx?|jsx?|rs|py|go|vue)$/i.test(e.path))
            .slice(0, 3)
            .map((e) => e.path);
        } else {
          pathsToRead = [fallback];
        }
        if (pathsToRead.length > 0) break;
      } catch {
        // try next fallback
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
      // skip unreadable paths
    }
  }

  if (files.length === 0) {
    throw new Error(
      `在项目 ${resolvedProject} 中未找到与「${queries.join("、")}」相关的源码`,
    );
  }

  return {
    project: resolvedProject,
    query: userMessage,
    files,
    searchTerms: queries,
  };
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

  if (
    isSourceCodeRequest(current) ||
    (THIS_PROJECT_PATTERNS.test(current) && isSourceCodeRequest(context))
  ) {
    const terms = extractLogicSearchTerms(current);
    return {
      actionType: "analyze",
      targetPath: "",
      searchQuery: terms.join("|") || "export function",
    };
  }

  if (
    isLogicInquiry(current) ||
    (THIS_PROJECT_PATTERNS.test(current) &&
      (isLogicInquiry(context) || /分析|代码|逻辑|生成|实现/.test(current)))
  ) {
    const terms = extractLogicSearchTerms(current);
    return {
      actionType: "analyze",
      targetPath: "",
      searchQuery: terms.join("|") || current,
    };
  }

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

function isWorkFolderListQuery(message: string): boolean {
  return (
    /work|工作区|文件夹|desktop\/work/i.test(message) &&
    /项目|哪些|列表|有什么|目录/i.test(message)
  );
}

/** 节点一：Thought — 意图识别 */
export async function thoughtNode(
  state: AgentGraphState,
): Promise<Partial<AgentGraphState>> {
  const pathHint = extractRelativePath(state.userMessage);
  const projectName = extractProjectName(state.userMessage);
  const projectInquiry =
    projectName !== null && isProjectInquiry(state.userMessage);
  const logicInquiry = isLogicInquiry(state.userMessage);
  const lower = state.userMessage.toLowerCase();
  const matched = AGENT_KEYWORDS.some((kw) => state.userMessage.includes(kw));

  const fromHistory = inferIntentFromHistory(
    state.userMessage,
    state.recentMessages,
  );

  const contextProject = await resolveProjectFromContext([
    ...state.recentMessages,
    state.userMessage,
  ]);

  if (
    !matched &&
    !pathHint &&
    !fromHistory &&
    !projectInquiry &&
    !logicInquiry &&
    !THIS_PROJECT_PATTERNS.test(state.userMessage) &&
    !isWorkFolderListQuery(state.userMessage) &&
    !isSourceCodeRequest(state.userMessage)
  ) {
    return {
      thought: "用户消息未触发 Agent 工具链，走普通对话。",
      shouldAct: false,
      phase: "done",
    };
  }

  if (fromHistory && !matched && !pathHint && !projectInquiry && !logicInquiry && !isSourceCodeRequest(state.userMessage)) {
    if (fromHistory.actionType === "analyze") {
      const terms =
        fromHistory.searchQuery?.split("|").filter(Boolean) ??
        extractLogicSearchTerms(state.userMessage);
      const project =
        contextProject ??
        extractProjectName(state.userMessage) ??
        fromHistory.targetPath;
      return {
        thought: project
          ? `将延续上文，在项目 \`${project}\` 中搜索并读取相关源码：${terms.join("、") || "功能逻辑"}`
          : `将延续上文，搜索并读取相关源码：${terms.join("、") || "功能逻辑"}`,
        shouldAct: true,
        actionType: "analyze",
        targetPath: project ?? "",
        searchQuery: terms.join("|") || state.userMessage,
        phase: "thought",
      };
    }

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

  if (
    isSourceCodeRequest(state.userMessage) ||
    logicInquiry ||
    (THIS_PROJECT_PATTERNS.test(state.userMessage) && contextProject)
  ) {
    const terms = extractLogicSearchTerms(state.userMessage);
    const project =
      projectName ??
      contextProject ??
      extractProjectName(state.recentMessages.join("\n")) ??
      "";
    return {
      thought: project
        ? `将在项目 \`${project}\` 的 src/ 等子目录中搜索并读取相关源码`
        : `将在工作区子目录中搜索并读取相关源码`,
      shouldAct: true,
      actionType: "analyze",
      targetPath: project,
      searchQuery: terms.join("|") || state.userMessage,
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
  } else if (
    LIST_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase())) ||
    isWorkFolderListQuery(state.userMessage)
  ) {
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
    const targetPath = normalizeTargetPath(pathHint);
    return {
      thought: `将列出目录：${targetPath || "工作区根目录"}`,
      shouldAct: true,
      actionType,
      targetPath,
      searchQuery: null,
      phase: "thought",
    };
  }

  if (pathHint) {
    return {
      thought: `将读取文件：${pathHint}`,
      shouldAct: true,
      actionType: "read",
      targetPath: pathHint,
      searchQuery: null,
      phase: "thought",
    };
  }

  if (contextProject) {
    const terms = extractLogicSearchTerms(state.userMessage);
    return {
      thought: `将在项目 \`${contextProject}\` 子目录中搜索并读取源码`,
      shouldAct: true,
      actionType: "analyze",
      targetPath: contextProject,
      searchQuery: terms.join("|") || "export",
      phase: "thought",
    };
  }

  return {
    thought: `将列出工作区根目录`,
    shouldAct: true,
    actionType: "list",
    targetPath: "",
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
    if (state.actionType === "analyze") {
      const result = await analyzeProjectLogic(
        state.targetPath ?? "",
        state.userMessage,
        state.recentMessages,
      );

      return {
        analyzeResult: result,
        fileResult: null,
        listResult: null,
        searchResult: null,
        errorMessage: null,
        phase: "action",
      };
    }

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
        analyzeResult: null,
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
        analyzeResult: null,
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
        analyzeResult: null,
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
      analyzeResult: null,
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

  if (state.analyzeResult) {
    const { project, query, files, searchTerms } = state.analyzeResult;
    const sections = files.map((f) => {
      const ext = f.path.includes(".") ? f.path.split(".").pop() : "text";
      return [`### \`${f.path}\``, "", `\`\`\`${ext}`, f.content, "```"].join(
        "\n",
      );
    });
    const observation = [
      `**Agent 观察结果** — 项目 \`${project}\` 功能逻辑分析`,
      `问题：${query}`,
      `搜索词：${searchTerms.join("、")}`,
      `工作区：\`${WORKSPACE_ROOT}\``,
      `已读取 ${files.length} 个相关源码文件：`,
      "",
      sections.join("\n\n"),
    ].join("\n");
    return { observation, phase: "done" };
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
