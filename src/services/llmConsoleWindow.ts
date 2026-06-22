const CONSOLE_LABEL = "llm-console";

type VisibilityListener = (visible: boolean) => void;
const listeners = new Set<VisibilityListener>();
let listenersAttached = false;

let webConsoleRef: Window | null = null;

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function notifyVisible(visible: boolean) {
  for (const listener of listeners) listener(visible);
}

export function subscribeLlmConsoleVisibility(
  listener: VisibilityListener,
): () => void {
  listeners.add(listener);
  void isLlmConsoleVisible().then(listener);
  return () => listeners.delete(listener);
}

export async function isLlmConsoleVisible(): Promise<boolean> {
  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(CONSOLE_LABEL);
    if (!existing) return false;
    return existing.isVisible();
  }
  return webConsoleRef != null && !webConsoleRef.closed;
}

async function ensureConsoleListeners(
  win: import("@tauri-apps/api/webviewWindow").WebviewWindow,
) {
  if (listenersAttached) return;
  listenersAttached = true;
  await win.onCloseRequested(async (event) => {
    event.preventDefault();
    await win.hide();
    notifyVisible(false);
  });
}

async function createConsoleWindow(): Promise<void> {
  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = new WebviewWindow(CONSOLE_LABEL, {
      url: "/llm-console.html",
      title: "LLM 请求控制台",
      width: 960,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      resizable: true,
      center: true,
    });
    await win.once("tauri://created", async () => {
      await ensureConsoleListeners(win);
      notifyVisible(true);
    });
    return;
  }

  const opened = window.open(
    "/llm-console.html",
    CONSOLE_LABEL,
    "width=960,height=720,resizable=yes",
  );
  webConsoleRef = opened;
  notifyVisible(!!opened);
}

export async function openLlmConsole(): Promise<void> {
  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(CONSOLE_LABEL);
    if (existing) {
      await ensureConsoleListeners(existing);
      await existing.show();
      await existing.setFocus();
      notifyVisible(true);
      return;
    }
    await createConsoleWindow();
    return;
  }

  if (webConsoleRef && !webConsoleRef.closed) {
    webConsoleRef.focus();
    notifyVisible(true);
    return;
  }
  await createConsoleWindow();
}

export async function hideLlmConsole(): Promise<void> {
  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(CONSOLE_LABEL);
    if (existing && (await existing.isVisible())) {
      await existing.hide();
      notifyVisible(false);
    }
    return;
  }

  if (webConsoleRef && !webConsoleRef.closed) {
    webConsoleRef.close();
    webConsoleRef = null;
    notifyVisible(false);
  }
}

/** 切换控制台显隐，返回切换后是否可见 */
export async function toggleLlmConsole(): Promise<boolean> {
  const visible = await isLlmConsoleVisible();
  if (visible) {
    await hideLlmConsole();
    return false;
  }
  await openLlmConsole();
  return true;
}
