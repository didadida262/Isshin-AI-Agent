import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faCircleCheck,
  faCircleExclamation,
  faEye,
  faEyeSlash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { AppConfig } from "../types";
import { testConnection } from "../services/chat";
import { fetchAvailableModels } from "../services/models";

const DEFAULT_BASE_URL = "https://aiplatform.njsrd.com/llm/v1";

interface SettingsDrawerProps {
  open: boolean;
  config: AppConfig;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onClose: () => void;
  onSave: (config: AppConfig) => void;
}

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

export function SettingsDrawer({
  open,
  config,
  selectedModel,
  onSelectModel,
  onClose,
  onSave,
}: SettingsDrawerProps) {
  const [draft, setDraft] = useState<AppConfig>(config);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [testError, setTestError] = useState("");
  const [modelsStatus, setModelsStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [modelsError, setModelsError] = useState("");

  const syncModels = useCallback(async (apiKey: string) => {
    setModelsStatus("loading");
    setModelsError("");
    try {
      const models = await fetchAvailableModels(apiKey);
      setDraft((d) => ({ ...d, models }));
      setModelsStatus("ok");
    } catch (e) {
      setModelsStatus("error");
      setModelsError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setDraft({
        ...config,
        baseUrl: config.baseUrl.trim() || DEFAULT_BASE_URL,
      });
      setTestStatus("idle");
      setTestError("");
      setModelsStatus("idle");
      setModelsError("");
      if (config.apiKey.trim()) {
        void syncModels(config.apiKey);
      }
    }
  }, [open, config, syncModels]);

  useEffect(() => {
    setTestStatus("idle");
    setTestError("");
  }, [selectedModel]);

  const handleClose = () => {
    onSave(draft);
    onClose();
  };

  const removeModel = (id: string) => {
    const remaining = draft.models.filter((m) => m !== id);
    setDraft((d) => ({ ...d, models: remaining }));
    if (id === selectedModel) {
      onSelectModel(remaining[0] ?? "");
    }
  };

  const runTest = async () => {
    if (!selectedModel) return;
    setTestStatus("loading");
    setTestError("");
    try {
      await testConnection(draft, selectedModel);
      setTestStatus("ok");
    } catch (e) {
      setTestStatus("error");
      setTestError(e instanceof Error ? e.message : String(e));
    }
  };

  const canTestConnection =
    Boolean(selectedModel) &&
    draft.models.includes(selectedModel) &&
    draft.apiKey.trim() &&
    draft.baseUrl.trim();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#121212]/95 shadow-2xl backdrop-blur-xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring}
          >
            <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-lg font-semibold">模型配置中心</h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-white"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </header>

            <motion.div
              className="flex-1 space-y-6 overflow-y-auto px-6 py-6"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, ...spring }}
            >
              <label className="block space-y-2">
                <span className="text-sm text-text-muted">API 基础路径</span>
                <input
                  type="url"
                  value={draft.baseUrl}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, baseUrl: e.target.value }))
                  }
                  placeholder="https://aiplatform.njsrd.com/llm/v1"
                  className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent/50"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-text-muted">API 密钥</span>
                <motion.div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={draft.apiKey}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, apiKey: e.target.value }))
                    }
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2.5 pr-10 text-sm outline-none focus:border-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
                  >
                    <FontAwesomeIcon icon={showKey ? faEyeSlash : faEye} />
                  </button>
                </motion.div>
              </label>

              <motion.div className="space-y-3">
                <motion.div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-text-muted">可用模型</span>
                  <button
                    type="button"
                    onClick={() => void syncModels(draft.apiKey)}
                    disabled={modelsStatus === "loading" || !draft.apiKey.trim()}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-xs text-text-muted transition hover:border-white/20 hover:text-white disabled:opacity-40"
                  >
                    <FontAwesomeIcon
                      icon={faArrowsRotate}
                      spin={modelsStatus === "loading"}
                    />
                    {modelsStatus === "loading" ? "拉取中…" : "刷新列表"}
                  </button>
                </motion.div>
                <p className="text-xs text-text-dim">
                  通过平台接口自动同步：
                  aiplatform.njsrd.com/nexus/api/api-keys/models
                </p>
                {modelsStatus === "ok" && draft.models.length > 0 && (
                  <p className="flex items-center gap-2 text-xs text-accent">
                    <FontAwesomeIcon icon={faCircleCheck} />
                    已加载 {draft.models.length} 个模型
                  </p>
                )}
                {modelsStatus === "error" && (
                  <p className="flex items-start gap-2 text-xs text-red-400">
                    <FontAwesomeIcon
                      icon={faCircleExclamation}
                      className="mt-0.5 shrink-0"
                    />
                    {modelsError}
                  </p>
                )}
                {modelsStatus === "loading" && draft.models.length === 0 && (
                  <p className="text-xs text-text-muted">正在获取模型列表…</p>
                )}
                {draft.models.length > 0 && (
                  <ul className="h-48 overflow-y-auto rounded-lg border border-white/10 bg-surface/50">
                    {draft.models.map((m) => {
                      const isActive = m === selectedModel;
                      return (
                        <li
                          key={m}
                          className={`flex items-center gap-2 border-b border-white/5 last:border-b-0 ${
                            isActive ? "bg-accent/10" : "hover:bg-white/5"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectModel(m)}
                            title={m}
                            className={`min-w-0 flex-1 truncate px-3 py-2.5 text-left text-xs transition ${
                              isActive
                                ? "font-medium text-accent"
                                : "text-white"
                            }`}
                          >
                            {isActive && (
                              <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            )}
                            {m}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeModel(m)}
                            className="shrink-0 px-2 py-2.5 text-text-dim transition hover:text-white"
                            title="从列表移除"
                          >
                            <FontAwesomeIcon
                              icon={faXmark}
                              className="text-[10px]"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!draft.apiKey.trim() && (
                  <p className="text-xs text-text-dim">
                    填写 API Key 后将自动拉取可用模型
                  </p>
                )}
              </motion.div>

              <motion.div className="space-y-2">
                <button
                  type="button"
                  onClick={runTest}
                  disabled={testStatus === "loading" || !canTestConnection}
                  className="rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testStatus === "loading" ? "测试中…" : "连接测试"}
                </button>
                {!selectedModel && draft.models.length > 0 && (
                  <p className="text-xs text-text-dim">请先选择一个模型</p>
                )}
                {testStatus === "ok" && (
                  <p className="flex items-center gap-2 text-sm text-accent">
                    <FontAwesomeIcon icon={faCircleCheck} />
                    连接成功
                  </p>
                )}
                {testStatus === "error" && (
                  <p className="flex items-start gap-2 text-sm text-red-400">
                    <FontAwesomeIcon
                      icon={faCircleExclamation}
                      className="mt-0.5"
                    />
                    {testError}
                  </p>
                )}
              </motion.div>
            </motion.div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
