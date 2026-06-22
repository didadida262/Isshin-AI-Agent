# Isshin AI Agent

个人桌面端 AI Agent (V1.0) — 基于 **Tauri 2 + React + TypeScript** 的轻量智能体终端。

## 功能

- 全局模型配置（Base URL、API Key、模型白名单）
- 模型切换与 OpenAI 兼容流式对话
- Thought → Action → Observation 本地 Agent（读取 / 列目录 / 搜索 `~/Desktop/work` 工作区）
- 配置持久化至本地 `config.json`（由 Rust 写入用户目录）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19、TypeScript、Vite、Tailwind CSS 4、Framer Motion |
| 图标 | Font Awesome 6 |
| 桌面 | Tauri 2、Rust |
| HTTP | `@tauri-apps/plugin-http`（绕过 CORS，直连 LLM API） |

## 开发

```bash
npm install
npm run dev
```

仅调试前端（浏览器，无 Tauri 能力）：

```bash
npm run dev:web
```

## 构建

```bash
npm run build:app
```

## Agent 触发示例

工作区限定为 **`/Users/miles_wang/Desktop/work`**，自动排除 `node_modules`、`.git`、`Library` 等目录。

| 能力 | 示例 |
|------|------|
| 读文件 | `读取 src/agent/nodes.ts`、`查看 README.md` |
| 列目录 | `列出目录 src/agent` |
| 搜索 | `搜索 read_work_file`、`查找 AGENT_KEYWORDS` |

Agent 将通过 Tauri IPC 访问沙箱工作区，并将结果注入 LLM 上下文。

## 项目结构

```
src/
  agent/          # Agent 状态机（对应 Week1 的 graph / nodes / schema）
  components/     # UI 组件
  hooks/          # 应用状态
  services/       # 配置与流式聊天
src-tauri/        # Rust 命令与持久化
```

## 配置存储位置

- macOS: `~/Library/Application Support/isshin-ai-agent/config.json`
- Linux: `~/.config/isshin-ai-agent/config.json`
- Windows: `%APPDATA%\isshin-ai-agent\config.json`
