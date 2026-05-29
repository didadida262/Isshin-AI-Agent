import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "../types";

const DEFAULT_CONFIG: AppConfig = {
  baseUrl: "https://aiplatform.njsrd.com/llm/v1",
  apiKey: "",
  models: [],
};

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
