import { fetch } from "@tauri-apps/plugin-http";

const MODELS_API =
  "https://aiplatform.njsrd.com/nexus/api/api-keys/models";

function extractModelId(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    for (const key of ["id", "model", "model_id", "modelId", "name"]) {
      if (typeof o[key] === "string" && o[key]) return (o[key] as string).trim();
    }
  }
  return "";
}

function parseModelsPayload(data: unknown): string[] {
  if (Array.isArray(data)) {
    const ids = data.map(extractModelId).filter(Boolean);
    return [...new Set(ids)];
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (typeof obj.detail === "string") {
      throw new Error(obj.detail);
    }

    for (const key of ["models", "data", "items", "list", "result"]) {
      if (key in obj) return parseModelsPayload(obj[key]);
    }
  }

  throw new Error("无法解析模型列表响应");
}

function parseErrorMessage(text: string): string {
  try {
    const json = JSON.parse(text) as { detail?: unknown };
    if (typeof json.detail === "string") return json.detail;
    if (Array.isArray(json.detail)) {
      const first = json.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  } catch {
    /* use raw text */
  }
  return text || "请求失败";
}

/** 从 Nexus 平台拉取当前 API Key 可用的模型列表 */
export async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  const key = apiKey.trim();
  if (!key) throw new Error("请先填写 API Key");

  const url = `${MODELS_API}?api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseErrorMessage(text) || `HTTP ${res.status}`);
  }

  const data = JSON.parse(text) as unknown;
  const models = parseModelsPayload(data);
  if (models.length === 0) {
    throw new Error("接口未返回可用模型");
  }
  return models;
}
