个人桌面端 AI Agent (V1.0) 产品需求文档 (PRD)
1. 项目概述 & 愿景
定位：一款面向个人的、极致轻量且视觉炫酷的桌面端 AI 智能体（Agent）终端。

首版目标 (V1.0)：实现基础的“全局模型配置”、“模型切换”与“对话沟通”，并搭载最简易的本地 Agent 闭环逻辑，作为后续深度开发的脚手架，同时兼顾底层跨端技术的学习。

2. 技术栈架构 & 基础配置
2.1 核心架构
前端框架：React 18+ & TypeScript (TSX)

构建工具：Vite

样式控制：Tailwind CSS

动画库：Framer Motion (用于细腻、丝滑的微交互)

跨端底层：Rust & Tauri (利用 Tauri 作为桌面壳体，负责底层 OS 交互、文件系统访问与窗口管理)

视觉图标：FontAwesome 6 (使用 Solid / Regular / Brands 图标库)

2.2 环境配置 (.gitignore)
代码段
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Output directory
dist/
dist-tauri/

# IDEs and editors
.idea/
.vscode/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Operating system files
.DS_Store
Thumbs.db

# Local env files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Rust/Tauri specific
/src-tauri/target/
/src-tauri/Cargo.lock
3. 视觉与 UI/UX 风格指南
整体视觉风格参考海外主流尖端 SaaS 及 AI 工具（如 Vercel, Linear, Cursor, Raycast），呈现暗黑科技感（Futuristic Dark Aesthetics）。

色板 (Palette)：

背景色 (Background)：纯黑 (#000000) 到 极深灰 (#0A0A0A, #121212)，利用微弱的深浅变化划分区域。

面板/卡片 (Surface)：深灰 (#161616 / #1E1E1E)，配以极细的半透明边框 (border-white/5 或 border-neutral-800)。

文字色 (Typography)：主文字纯白 (#FFFFFF)，次要文字中灰 (#999999)，禁用/提示文字暗灰 (#555555)。

点缀色 (Accent)：极简极客风（如荧光绿 #00FF66 或纯白高亮），用于时光轴、输入框聚焦、Agent 激活状态。

交互动画 (Framer Motion)：

窗口与面板展开：采用弹性物理动画（type: "spring", stiffness: 300, damping: 30）。

对话气泡生成：自下而上微弱位移 + 淡入（Fade-in & Slide-up）。

面板抽屉：支持磨砂玻璃（Backdrop Blur）滤镜效果的顺滑滑出与淡入。

4. 功能需求 (Functional Requirements)
4.1 全局布局 (Layout)
桌面端采用非对称的双栏/三栏极简布局：

左侧窄侧边栏 (Sidebar)：包含历史会话列表、设置面板入口图标（fa-gear）、当前 Agent 运行状态指示器。

右侧主对话区 (Chat Area)：顶部为模型选择器，中部为滚动对话流，底部为智能输入框。

4.2 模型选择模块 (Model Selector)
功能描述：用户可在界面顶部快速切换当前对话使用的 LLM。

产品细节：

点击下拉菜单，伴随 Framer Motion 的磨砂玻璃展开效果。

下拉菜单中的模型列表由配置面板中用户自定义输入的模型 ID 数组动态决定。

选中模型后，输入框上方同步更新当前“活跃模型”的状态标签。

4.3 沟通与对话流 (Chat Interface)
信息展示：

用户气泡：靠右，深灰背景，白色文字。

AI/Agent 气泡：靠左，无背景色（或极淡背景），配备 AI 头像/图标。

流式传输 (Streaming)：前端必须支持打字机式的文本流式渲染（解析 Server-Sent Events 流），保证交互的即时性。

智能输入框 (Smart Input Component)：

支持多行输入（textarea），Shift + Enter 换行，Enter 发送。

聚焦（Focus）时，外边框伴随光晕渐变动画（Accent Color Border Glow）。

发送请求前，自动校验配置中心是否存在有效的 Base URL 与 API Key，若无则弹窗拦截并引导至设置面板。

4.4 模型层配置中心 (Settings Panel)
展现形式：点击侧边栏齿轮图标（fa-gear），从右侧滑出一个半透明磨砂玻璃质感的抽屉面板（Modal/Drawer）。点击面板外部空白处（Scrim）或右上角叉号（fa-xmark）自动保存并关闭。

配置项表单设计：

API 基础路径 (Base URL)：支持自定义输入。例如输入 [https://api.deepseek.com/v1](https://api.deepseek.com/v1) 或 [https://api.openai.com/v1](https://api.openai.com/v1)。

API 密钥 (API Key)：密码输入框（默认隐藏明文，尾部带有 fa-eye / fa-eye-slash 图标可切换显隐）。

连接测试按钮 (Test Connection)：点击后向配置的 Base URL 发送最简的对话或模型查询请求。成功显示绿色打勾（fa-circle-check），失败显示红色感叹号（fa-circle-exclamation）并抛出错误原因。

模型注册列表 (Model List Registry)：标签添加器（Tag Input）。用户输入模型官方 ID（如 deepseek-chat, gpt-4o）按回车即可加入可用模型白名单。每个标签右侧带小叉号可随时删除。此处注册的模型实时同步至主界面顶部的下拉菜单。

4.5 最简 Agent 逻辑 (Minimalist Agent Loop)
首版引入一个最简闭环逻辑（Thought-Action-Observation），作为终端型 Agent 的脚手架：

意图识别 (Thought)：当用户输入包含特定关键词（如 “查看文件”、“读取项目”）时，触发 Agent 行为。

执行动作 (Action)：前端通过 Tauri 的 IPC 管道（tauri::command），调用 Rust 原生函数安全地读取当前项目目录下的特定文件（如 package.json 或 .gitignore）。

状态反馈 (Observation)：在对话流中插入一个特殊的“思考/执行中”状态卡片（伴随 FontAwesome 图标旋转动画），执行完毕后，将 Rust 返回的真实文件内容以 Markdown Code Block 的形式拼接到 AI 的回答中输出。

5. 数据持久化与安全性
持久化方案：配置面板中的 Base URL、API Key 以及模型列表数据由前端实时写入存储，并由 Tauri 配合 Rust 写入本地用户目录下的 config.json 文件中。

安全性：所有大模型请求由本地客户端直接发起直连，严禁向任何第三方中转服务器传输用户的 API Key。

6. 运行时核心通信逻辑
[用户输入消息] 
      │
      ▼
[读取本地配置] ────► 检查 Base URL / API Key 是否存在？
      │
      ▼
[构造标准请求] ────► 采用 OpenAI 标准的 Chat Completions 格式
      │               {
      │                 "model": "主界面当前选中的模型ID",
      │                 "messages": [ 历史上下文 + 当前消息 ],
      │                 "stream": true
      │               }
      │
      ▼
[流式发起请求] ────► 前端发起 Streaming 请求 (使用 fetch 或 Tauri http 模块绕过跨域)
      │
      ▼
[打字机渲染]   ────► 解析 EventSource 流，逐字更新前端对话气泡并触发 Framer Motion 动效