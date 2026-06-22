const THINK_OPEN_TAGS = ["<" + "think" + ">", "<" + "redacted_thinking" + ">"] as const;
const THINK_CLOSE_TAGS = ["</" + "think" + ">", "</" + "redacted_thinking" + ">"] as const;

function findThinkClose(raw: string): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const tag of THINK_CLOSE_TAGS) {
    const index = raw.indexOf(tag);
    if (index !== -1 && (best === null || index < best.index)) {
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
  const close = findThinkClose(raw);
  if (close) {
    const after = raw.slice(close.index + close.length);
    return removeThinkBlocks(after).trimStart();
  }

  const withoutBlocks = removeThinkBlocks(raw);
  const openIdx = findThinkOpen(withoutBlocks);
  if (openIdx !== -1) {
    return withoutBlocks.slice(0, openIdx).trimStart();
  }

  // 尚未出现结束标签，说明仍在思考阶段
  return "";
}
