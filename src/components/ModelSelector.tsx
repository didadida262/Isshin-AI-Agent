import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

interface ModelSelectorProps {
  models: string[];
  selected: string;
  onSelect: (model: string) => void;
}

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

export function ModelSelector({
  models,
  selected,
  onSelect,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div className="relative shrink-0" layout>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[min(220px,40vw)] items-center gap-2 rounded-lg border border-white/10 bg-surface/80 px-3 py-1.5 text-sm backdrop-blur-md transition hover:border-white/20"
      >
        <span className="shrink-0 text-text-muted text-xs">模型</span>
        <span className="truncate font-medium">{selected || "未选择"}</span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`text-xs text-text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.ul
              className="absolute right-0 top-full z-50 mt-2 max-h-64 min-w-[220px] max-w-[min(320px,calc(100vw-8rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-[#161616]/95 shadow-2xl backdrop-blur-xl"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={spring}
              style={{ transformOrigin: "top right" }}
            >
              {models.length === 0 ? (
                <li className="px-4 py-3 text-sm leading-relaxed text-text-dim whitespace-normal">
                  暂无模型，请打开左侧「设置」填写 API Key 并同步模型列表
                </li>
              ) : (
                models.map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(m);
                        setOpen(false);
                      }}
                      title={m}
                      className={`w-full truncate px-4 py-2.5 text-left text-sm transition hover:bg-white/5 ${
                        m === selected ? "text-accent" : "text-white"
                      }`}
                    >
                      {m}
                    </button>
                  </li>
                ))
              )}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
