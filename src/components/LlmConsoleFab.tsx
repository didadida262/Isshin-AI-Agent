import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTerminal } from "@fortawesome/free-solid-svg-icons";
import {
  subscribeLlmConsoleVisibility,
  toggleLlmConsole,
} from "../services/llmConsoleWindow";

const POSITION_KEY = "isshin-llm-fab-position";
const FAB_SIZE = 44;
const DRAG_THRESHOLD = 5;

interface FabPosition {
  x: number;
  y: number;
}

function loadPosition(): FabPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FabPosition;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function defaultPosition(): FabPosition {
  return {
    x: Math.max(16, window.innerWidth - FAB_SIZE - 24),
    y: Math.max(16, window.innerHeight - FAB_SIZE - 160),
  };
}

function clampPosition(pos: FabPosition): FabPosition {
  const maxX = Math.max(16, window.innerWidth - FAB_SIZE - 16);
  const maxY = Math.max(16, window.innerHeight - FAB_SIZE - 16);
  return {
    x: Math.min(Math.max(16, pos.x), maxX),
    y: Math.min(Math.max(16, pos.y), maxY),
  };
}

export function LlmConsoleFab() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<FabPosition>(() => {
    const saved = loadPosition();
    return clampPosition(saved ?? defaultPosition());
  });

  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  useEffect(() => subscribeLlmConsoleVisibility(setVisible), []);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => clampPosition(prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleToggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await toggleLlmConsole();
    } catch (error) {
      console.error("切换 LLM 控制台失败:", error);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (busy) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        active: true,
        moved: false,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
      };
    },
    [busy, position.x, position.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    drag.moved = true;
    setPosition(
      clampPosition({
        x: drag.originX + dx,
        y: drag.originY + dy,
      }),
    );
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag.active || e.pointerId !== drag.pointerId) return;

      drag.active = false;
      e.currentTarget.releasePointerCapture(e.pointerId);

      if (drag.moved) {
        setPosition((prev) => {
          const next = clampPosition(prev);
          localStorage.setItem(POSITION_KEY, JSON.stringify(next));
          return next;
        });
        return;
      }

      void handleToggle();
    },
    [handleToggle],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag.active && e.pointerId === drag.pointerId) {
      drag.active = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      disabled={busy}
      title={visible ? "隐藏 LLM 控制台（可拖拽）" : "显示 LLM 控制台（可拖拽）"}
      aria-label={visible ? "隐藏 LLM 控制台" : "显示 LLM 控制台"}
      aria-pressed={visible}
      style={{
        left: position.x,
        top: position.y,
        width: FAB_SIZE,
        height: FAB_SIZE,
        touchAction: "none",
      }}
      className={`fixed z-[100] flex cursor-grab items-center justify-center rounded-full border shadow-lg transition-colors active:cursor-grabbing disabled:opacity-60 ${
        visible
          ? "border-accent/50 bg-accent/15 text-accent shadow-accent/20"
          : "border-white/10 bg-surface-elevated text-text-muted hover:border-white/20 hover:text-white"
      }`}
    >
      <FontAwesomeIcon icon={faTerminal} className="pointer-events-none text-sm" />
      {visible && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-black" />
      )}
    </button>
  );
}
