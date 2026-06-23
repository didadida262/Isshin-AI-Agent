import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "../types";

export const DEFAULT_MODEL = "deepseek-r1-distill-qwen-32b";

const DEFAULT_CONFIG: AppConfig = {
  baseUrl: "https://aiplatform.njsrd.com/llm/v1",
  apiKey: "",
  models: [],
};

export function pickDefaultModel(models: string[]): string {
  if (models.length === 0) return "";
  if (models.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  return models[0];
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const cfg = await invoke<AppConfig>("load_config");
    const merged = { ...DEFAULT_CONFIG, ...cfg };
    if (!merged.baseUrl.trim()) {
      merged.baseUrl = DEFAULT_CONFIG.baseUrl;
    }
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await invoke("save_config", { config });
}

export function isConfigValid(config: AppConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.apiKey.trim());
}
