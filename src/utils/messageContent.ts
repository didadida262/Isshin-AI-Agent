const THINK_OPEN_TAGS = ["<" + "think" + ">", "<" + "redacted_thinking" + ">"] as const;
const THINK_CLOSE_TAGS = ["</" + "think" + ">", "</" + "redacted_thinking" + ">"] as const;

function hasThinkMarker(raw: string): boolean {
  return (
    THINK_OPEN_TAGS.some((tag) => raw.includes(tag)) ||
    THINK_CLOSE_TAGS.some((tag) => raw.includes(tag))
  );
}

function findThinkClose(raw: string): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const tag of THINK_CLOSE_TAGS) {
    const index = raw.lastIndexOf(tag);
    if (index !== -1 && (best === null || index > best.index)) {
      best = { index, length: tag.length };
    }
  }
  return best;
}

function findThinkOpen(raw: string): number {
  let best = -1;
  for (const tag of THINK_OPEN_TAGS) {
    const index = raw.indexOf(tag);
    if (index !== -1 && (best === -1 || index < best)) {
      best = index;
    }
  }
  return best;
}

function removeThinkBlocks(raw: string): string {
  let result = raw;
  for (const open of THINK_OPEN_TAGS) {
    for (const close of THINK_CLOSE_TAGS) {
      const pattern = new RegExp(
        `${open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "gi",
      );
      result = result.replace(pattern, "");
    }
  }
  return result;
}

/** 过滤 DeepSeek 等模型的思考内容，仅保留对用户可见的回复 */
export function stripThinkingContent(raw: string): string {
  if (!hasThinkMarker(raw)) {
    return raw.trimStart();
  }

  const close = findThinkClose(raw);
  if (close) {
    const after = raw.slice(close.index + close.length);
    return removeThinkBlocks(after).trimStart();
  }

  const openIdx = findThinkOpen(raw);
  if (openIdx !== -1) {
    return raw.slice(0, openIdx).trimStart();
  }

  return raw.trimStart();
}

/** 过滤 minimax 等模型幻觉输出的假工具调用标记 */
export function stripFakeToolCalls(raw: string): string {
  return raw
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
    .replace(/\{tool\s*=>\s*"[^"]*"[\s\S]*?\}/g, "")
    .replace(/我来帮你查看[^。\n]*[：:]\s*$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 展示用：去除思考块与假工具调用 */
export function sanitizeAssistantContent(raw: string): string {
  return stripFakeToolCalls(stripThinkingContent(raw));
}
