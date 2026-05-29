/** 将 Base URL 与路径拼成绝对地址，避免相对路径落到 localhost */
export function resolveApiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("请先填写 API 基础路径");
  }
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("API 基础路径须以 http:// 或 https:// 开头");
  }
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
