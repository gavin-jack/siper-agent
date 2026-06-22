# SiPer AI Agent

> **一个独立的 AI Agent 框架 — 有状态 UI · 多模型 · 多 Agent · 27 个内置工具 · 三语言 · 前后端隔离**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://python.org) [![Version](https://img.shields.io/badge/Version-v0.2.4-green.svg)](https://github.com/gavin-jack/siper-agent/releases)

**核心仅依赖 `openai` + `websockets` + `jinja2`，27 个工具中 25 个纯 stdlib。完全独立于任何 Agent 框架，不依赖 Hermes / LangChain / AutoGPT。**

启动后访问 **http://localhost:9724**

---

## 目录

- [设计理念](#设计理念)
- [核心架构](#核心架构)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [配置文件](#配置文件)
- [更新记录](#更新记录)
- [License](#license)

---

## 设计理念

### 一句话

```
前端页面 = f(后端快照)
```

后端维护前端页面状态的完整镜像（DOM 快照），前端只负责把快照渲染成 DOM。状态变化 → 计算 delta → 推送到前端 → 精确更新。**无需前端框架（React/Vue），纯原生 JS ESM 实现。**

### 两层存储

```
┌──────────────────────────── 后端进程 ────────────────────────────┐
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────────┐          │
│  │   DOM 快照 (内存) │  ←──→  │   数据库持久化 (SQLite)│          │
│  │                  │         │                      │          │
│  │ • 当前页面状态    │         │ • 会话消息历史        │          │
│  │ • 会话列表顺序    │         │ • 模型配置           │          │
│  │ • 流式输出文本    │         │ • Token 用量         │          │
│  │ • 表单输入内容    │         │ • 技能统计           │          │
│  │ • 页面缓存数据    │         │ • 全局配置           │          │
│  └──────────────────┘         └──────────────────────┘          │
│                                                                   │
│  快照更新流程：                                                    │
│  ① 状态变化 → 更新内存快照                                        │
│  ② 计算 delta → WS 推送给前端                                     │
│  ③ 关键变化 → 写入数据库                                          │
└───────────────────────────────────────────────────────────────────┘
```

### 通信双通道

| 通道 | 用途 | 触发时机 |
|------|------|---------|
| **WebSocket** | 推送实时状态变化 | 流式输出、新消息、配置变更 |
| **HTTP** | 拉取按需数据 | 页面切换、历史查询、文件操作 |

### 载体适配器

不同载体（Web UI / CLI / Desktop / Mobile）只需实现 5 个回调函数即可接入：

```
on_state_full()   → 接收全量快照
on_state_deltas() → 接收断线补发
on_stream_delta() → 接收流式文本
on_stream_end()   → 接收流式完成
on_tool_progress()→ 接收工具进度
```

---

## 核心架构

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端 | Python 3.8+ | 纯 stdlib + openai SDK |
| 前端 | 原生 JS (ESM) | 无框架依赖，38 个模块，595KB |
| 样式 | CSS 变量 + 自定义主题 | 1 种预设 + 自定义导入/导出 |
| 通信 | WebSocket + HTTP | 双通道，实时 + 按需 |
| 持久化 | SQLite + WAL | 多数据库，per-Agent 隔离 |
| 渲染 | DOM 快照 | 后端驱动，前端纯展示 |

### 代码统计

| 模块 | 文件数 | 行数 |
|------|--------|------|
| Python 后端 | 64 个 .py | ~21,000 行 |
| JS 前端 | 38 个 .js | ~8,600 行 |
| CSS | 3 个（base/chat/page） | ~4,900 行 |
| HTML | 1 个（index.html） | ~44 行 |
| **总计** | **106 个源文件** | **~34,500 行** |

### 架构图

```
┌─────────────── 载体层 ───────────────┐
│  ┌────────┐ ┌─────┐ ┌────────┐      │
│  │Web UI  │ │ CLI │ │Desktop │ ...  │
│  └───┬────┘ └──┬──┘ └───┬────┘      │
│      └─────────┼────────┘            │
│          ┌─────▼──────┐              │
│          │CarrierAdapter│ ← 5 回调   │
│          └─────┬──────┘              │
├────────────────┼─────────────────────┤
│          通信层                       │
│  WS: state_full / state_delta        │
│  HTTP: REST API (40+ 端点)           │
├────────────────┼─────────────────────┤
│         状态管理层                      │
│  ┌─────────────▼───────────┐         │
│  │   SnapshotManager       │         │
│  │   (内存快照 + delta)    │         │
│  └─────────────┬───────────┘         │
│    ┌───────────┼───────────┐         │
│  ┌─▼───┐   ┌──▼──┐   ┌───▼──┐      │
│  │Agent│   │Model│   │Skill │      │
│  │Config│  │Config│  │System│      │
│  └─────┘   └─────┘   └──────┘      │
├─────────────────────────────────────┤
│         持久化层                      │
│  sessions.db │ token.db │ models.db │
│  memory.db   │ skill_call_log.db    │
│  snapshot.db │ 配置文件             │
└─────────────────────────────────────┘
```

---

## 功能特性

### 🧠 多模型 LLM 管理

- **OpenAI 兼容接口**：支持任意 OpenAI API 兼容的 LLM Provider（包括 Anthropic、DeepSeek、Qwen、智谱、MiniMax、Groq、OpenRouter、Ollama、Moonshot、LongCat 等），统一调用链路
- **多 Provider 管理**：同时配置多个 Provider，独立 base_url / api_key，SQLite WAL 持久化，Provider 预设 12 个 + 自定义
- **模型发现**：输入 Provider 信息 → 批量拉取模型列表 → 筛选 → 批量添加，支持 Provider 名称自动匹配
- **模型能力标签**：chat / reasoning / code / vision / long_context / translation / function_calling / tts 等，自动检测模型能力
- **模型验证**：单模型 / 批量验证，实时反馈 TTFT / 延迟 / 上下文窗口 / streaming 状态，验证结果持久化到 DB
- **模型管理独立页面**：搜索（名称 / 能力标签）、筛选（多能力复选）、排序（名称 / TTFT / 延迟 / 上下文 / 能力数）、分组显示
- **模型卡片 UI**：TTFT 颜色编码（<500ms 蓝 / 500-1500ms 橙 / >1500ms 红）、能力 badge 走马灯、验证状态动画、入场动画
- **3 层重试架构**：SDK 内置 `max_retries=3`（网络层）+ 应用层手动 3 次（1s/2s/4s 指数退避）+ `RateLimitError` 双重重试
- **max_tokens 截断检测**：LLM 返回 `finish_reason="length"` 时自动追加截断提示

### 💬 流式对话

- **WebSocket 实时流式输出**：token 级流式推送，低延迟，支持多轮工具调用 + 文本混合输出
- **消息气泡 UI**：用户 / LLM 独立气泡，Markdown 渲染（代码高亮 / 表格 / 列表 / 数学公式）、复制 / 嵌入按钮、Dict 视图按钮
- **思考面板（CoT）**：Chain-of-Thought 步骤实时可视化，工具调用进度实时更新，折叠 / 展开
- **停止生成**：stop_event 机制，立即中断 LLM 调用，支持流式 / 非流式两种模式
- **消息双通道加载**：HTTP fetch DB 历史 → WS 推送增量新消息，切换会话无缝衔接
- **上下文用量监视**：实时显示当前会话 token 用量比率
- **消息入场动画**：slide up + fade in，`prefers-reduced-motion` 可访问性支持

### 🔧 27 个内置工具

| 类别 | 工具 | 说明 |
|------|------|------|
| **文件操作** | `read_file` / `write_file` / `patch` / `search_files` / `list_dir` | 读写编辑搜索，批量操作，路径安全校验 |
| **代码执行** | `execute_code` / `execute_command` | Python 沙箱 + Shell 命令，超时保护 |
| **网络搜索** | `web_search` / `web_fetch` | SearXNG + DuckDuckGo + URL 全文提取 |
| **浏览器控制** | `browser_*`（导航/点击/输入/截图/滚动/JS执行/控制台） | 全功能浏览器自动化 |
| **技能系统** | `skills_list` / `skill_view` / `skill_manage` | 自动加载、语义预筛选、上下文注入、skill call 跟踪 |
| **记忆系统** | `memory` / `session_search` | 跨会话持久化、FTS5 全文搜索、知识空间索引 |
| **图像视觉** | `vision_analyze` / `image_gen` | 图片本地理解 + AI 图片生成 |
| **语音合成** | `text_to_speech` | 多 Provider TTS（Edge / OpenAI 等） |
| **子代理** | `delegate_task` | 并行委派、结果汇总、多代理协作 |
| **任务管理** | `todo` / `cronjob` / `clarify` | 任务列表 + 定时任务 + 主动询问 |
| **通信** | `send_message` | 消息推送 |
| **元操作** | `session_search` / `skills_manage` | 跨会话搜索、技能生命周期管理 |

### 🤖 多 Agent 系统

- **独立配置**：每个 Agent 拥有 `config.json`（配置）+ `soul.md`（人格）+ `agent.md`（行为指令），首次启动自动生成默认 Agent
- **独立会话**：per-Agent `sessions.db`（SQLite WAL 模式），会话数据完全隔离，支持乐观更新 + 快速切换
- **独立记忆**：per-Agent `memory.db`，跨会话持久化，支持手动编辑 / 语义搜索
- **Agent 配置页面**：6 个标签页（关于 / 属性文件 / 记忆 / 限制 / 模型 / 头像），自动保存
- **Agent 限制配置**：超时 / 重试 / max_tokens / 工具轮次 / 工具数量 / 会话超时 / 历史消息数
- **Agent 模型选择**：默认对话模型 / 默认视觉模型，从全局模型列表加载
- **Agent CRUD**：创建 / 切换 / 新增 / 删除（含确认弹窗） / 头像上传（实时同步侧边栏）
- **Agent 分组**：侧边栏自动分组显示，展开 / 折叠，会话未读标记

### 🖥️ Web UI（SPA，纯原生 JS）

- **SPA 路由**：Hash-based 路由（`#/chat` / `#/model-settings` / `#/monitor` 等 12+ 页面），支持浏览器前进 / 后退 / 书签
- **三栏布局**：左侧可折叠侧边栏 + 中栏 Agent / 会话列表 + 右栏内容区
- **消息页面**：WebSocket 流式输出、Markdown 渲染、思考面板、工具调用可视化、复制 / 嵌入 / Dict 视图按钮
- **模型管理**：独立页面、搜索 / 筛选 / 排序、卡片 UI（能力标签走马灯 / TTFT 颜色编码 / 验证状态）、批量验证
- **会话管理**：列表折叠 / 展开、双击重命名、未读标记、波浪背景动画、删除确认、乐观更新
- **Token 统计**：3 个 ECharts 图表（分模型柱状图 / 24h 趋势折线图 / 每日趋势 + 热力图）
- **系统监控**：运行时参数（内存 RSS / CPU / 运行时长 / DB 大小）、内存趋势 600 点记录、系统信息（OS / CPU / GPU / 磁盘）
- **主题系统**：CSS 变量完全主题化、1 种预设 + 自定义导入 / 导出
- **技能管理**：技能卡片列表、搜索筛选、技能详情、调用统计
- **记忆管理**：Markdown 编辑器、记忆整合配置、记忆源文件编辑
- **工具列表**：工具分类展示（12 个类别）、能力描述、全局 / Agent 权限切换
- **系统日志**：多级别过滤（DEBUG / INFO / WARN / ERROR）、分页、自动刷新
- **全局设置**：运行参数（端口 / 心跳 / 日志 / 超时等）运行时调整
- **API 文档**：内置 Swagger UI 页面
- **进程管理**：`siper.sh` 启动 / 停止 / 重启 / 状态 / 日志
- **三语言 i18n**：简体中文 / English / 繁體中文，运行时即时切换（30+ 翻译键）
- **14 项前端动效**：消息入场 / 流式光标 / 弹性按钮 / 代码块展开 / 工具调用折叠 / Toast 滑入 / 输入框聚焦光环 / 页面切换淡入 / 连接状态脉冲 / 打字指示器弹性圆点 / 会话列表错开入场 / 模型卡片动画 / 波浪动画 / `prefers-reduced-motion` 支持

### 💾 数据持久化

- **多数据库 SQLite WAL**：`sessions.db` / `memory.db` / `models.db` / `token.db` / `skill_call_log.db` / `snapshot.db`，互不干扰，并发安全
- **per-Agent 数据库隔离**：每个 Agent 在 `agents/{name}/` 下拥有独立的 `sessions.db` + `memory.db`
- **内存控制**：active_sessions LRU（MAX=200）、active_tasks deque(maxlen=1000）、page_cache TTL + 大小限制
- **快照持久化**：`SnapshotManager` 每 5s 自动保存页面状态到 SQLite，启动时自动恢复，断线自动补发 delta
- **FTS5 全文搜索**：会话消息、记忆内容支持 FTS5 全文检索

### 🔒 安全

- **HTML 转义**：所有用户输入经 `escapeHtml` 处理，防止 XSS
- **路径安全检查**：防止路径穿越攻击（`path_safety.py`），所有文件操作工具统一校验
- **WS 消息校验**：所有 WS 消息通过 `d.type` 验证，未知类型静默忽略
- **API Key 脱敏**：前端显示 `***` 掩码，不暴露真实密钥
- **请求大小限制**：HTTP 请求大小限制，防止 DoS
- **URL 安全检查**：`url_safety.py` 阻止 SSRF / 内网地址等不安全请求

### 🧩 技能系统

- **自动加载**：启动时扫描 `skills/` 目录，自动加载所有技能
- **语义预筛选**：根据当前 prompt 上下文，通过关键词索引（600+ 关键词）预匹配相关技能
- **上下文注入**：匹配的技能描述 + 知识点自动注入到 LLM 上下文
- **技能生命周期管理**：创建 / 查看 / 修改 / 删除，调用统计
- **5 个内置技能**（持续扩充）：代码审查 / 企业研究 / 文件操作 / Web 搜索 / 自主学习

---

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/gavin-jack/siper-agent.git
cd siper-agent

# 安装依赖（仅 3 个包）
pip3 install -r requirements.txt

# 首次启动（自动生成配置文件）
python3 siper_web.py
```

启动后访问 **http://localhost:9724**

### 服务管理

```bash
./siper.sh start      # 启动
./siper.sh stop       # 停止
./siper.sh restart    # 重启
./siper.sh status     # 查看状态
./siper.sh log        # 查看日志
```

---

## 目录结构

```
siper/
├── siper_web.py              # 主入口（WS 服务器 + HTTP + 路由）
├── requirements.txt           # Python 依赖（3 个包）
├── siper.sh                   # 服务管理脚本
├── README.md                  # 本文件
├── CHANGELOG.md               # 详细变更记录
├── LICENSE                    # MIT License
│
├── ai_agent/                  # Agent 核心（64 个 .py）
│   ├── core/
│   │   ├── agent.py           #   Agent 主循环（工具调用/多轮对话/流式输出）
│   │   └── llm_client.py      #   LLM 客户端（OpenAI 兼容/3层重试/超时）
│   ├── state/                 #   状态管理
│   │   ├── snapshot_manager.py#   DOM 快照管理器
│   │   ├── session_sync.py    #   DB → 快照同步
│   │   └── carrier.py         #   载体适配器
│   ├── api/                   #   HTTP API（40+ 端点）
│   │   ├── router.py          #   路由注册器
│   │   └── handlers.py        #   API 处理器
│   ├── sessions/              #   会话管理（SQLite + WAL + LRU）
│   ├── tools/                 #   27 个工具实现
│   ├── skills/                #   技能系统（自动加载/预筛选/上下文注入）
│   └── memory/                #   记忆系统（跨会话持久化）
│
├── agents/                    # Agent 数据（运行时自动生成）
│   └── default/               #   默认 Agent
│       ├── config.json        #     配置
│       ├── soul.md            #     人格定义
│       ├── sessions.db        #     会话 DB
│       └── memory.db          #     记忆 DB
│
├── webui/                     # Web 前端
│   ├── index.html             #   SPA 入口（44 行，纯容器）
│   ├── css/
│   │   ├── chat.css           #   聊天页面样式
│   │   ├── page.css           #   独立页面样式
│   │   └── base.css           #   基础样式（变量/布局/动画）
│   └── js/                    #   ESM 模块化 JS（38 个文件）
│       ├── app.js             #     唯一 ESM 入口 + 路由 + 页面管理
│       ├── core.js            #     WebSocket 连接 + 消息收发
│       ├── renderer.js        #     统一 DOM 渲染引擎
│       ├── chat/              #     聊天模块（message/stream/input/state/sidebar/thinking）
│       ├── pages/             #     页面模块（含 chat-pages/ 子目录）
│       ├── components/        #     公共组件（toast/model-test/agent-models）
│       └── utils/             #     工具函数（escape/i18n/api/dom）
│
├── skills/                    # 内置技能目录
│   ├── code-review/           #   代码审查
│   ├── company-research/      #   企业研究
│   ├── file-operations/       #   文件操作
│   ├── web-search/            #   Web 搜索
│   └── siper-autonomous-learning/  # 自主学习
│
├── docs/                      # 架构文档
│
└── knowledge-space/           # 知识空间
```

---

## 配置文件

首次启动时自动生成，无需手动创建：

| 文件 | 说明 |
|------|------|
| `models.db` | 模型和提供商配置（SQLite，项目根目录） |
| `settings.json` | 系统参数（端口、心跳、日志等） |
| `agents/{name}/config.json` | Agent 配置 |
| `agents/{name}/soul.md` | Agent 人格定义 |
| `agents/{name}/sessions.db` | 会话数据库（运行时生成） |
| `agents/{name}/memory.db` | 记忆数据库（运行时生成） |

---

## 更新记录

### v0.2.2 (2026-06-17)

#### 新功能 (feat)
- **Toast 系统重构**：弹出位置从侧边栏左侧改为页面顶部居中，倒计时规则统一（success=1.5s / error=3s / warning=2s / info=2s），弹出框独立页面正中央
- **启动/停止 CLI 输出优化**：`siper.sh start` 按实际启动顺序显示进度（内存写入 → 启动验证 → 前端地址），`siper.sh stop` 显示关闭过程
- **跨平台 `siper` 命令**：WSL2 `~/.local/bin/siper` 软链接 + Windows `C:\Users\Gavin\bin\siper.bat` 转发 `wsl -e bash`
- **GitHub 推送规则**：推送前必须告知当前版本号，给出 3 个选项（patch/minor/major）让用户选择

#### Bug 修复 (fix)
- **startup.log 内容缺失**：Agent 初始化 `open("w")` 覆盖模型写入内存和 LLM 配置内容 → 改为 `open("a")` 追加
- **siper.sh 重启失败**：tee 管道过滤导致 Python stdout 丢失 → 去掉 tee，Python 直接 `>> "$LOG_FILE"`

#### 重构 (refactor)
- **CSS 架构迁移**：`style.css`（4,904 行死文件）彻底删除，内容完整迁移至 `base.css` / `chat.css` / `page.css`
- **Toast/弹出框容器解耦**：Toast 挂 `#siperNotifRoot`（fixed 顶部居中），弹出框 overlay 直挂 `document.body`（fixed inset:0），两者独立定位
- **69 个 `js-*` 工具类 CSS 补充**：工具页面 / 统计页面 / 目录页面 / 模型管理页面等独立页面样式完整迁移
- **原生 confirm/prompt 替换**：`model-settings.js` 3 处原生对话框全部替换为 `showConfirm` / `showInput`

### v0.2.1 (2026-06-17)

#### 新功能 (feat)
- **Hash 路由系统**：全面 SPA Hash 路由（`#/chat` / `#/model-settings` / `#/monitor?tab=token`），支持浏览器前进 / 后退
- **CSS 按需加载**：`base.css` / `chat.css` / `page.css` 三文件拆分，按页面动态加载，整体 CSS 从 246KB → 265KB（更有序）
- **SnapshotManager 内存容器**：启动预填充 + 增量同步 + 周期性 GC + 快照持久化（5s），断线自动补发 delta
- **三模板 SPA 架构**：`#page-chat` / `#page-standalone` / `#page-dynamic` 三容器路由，侧边栏常驻
- **模型卡片 UI 增强**：能力标签走马灯 / TTFT 速度颜色编码 / 入场动画 / 分组合并显示
- **模型验证结果持久化**：验证后自动保存到 `models.db`
- **模型删除 API 双端修复**：Router dispatch DELETE 参数化路由 body 覆盖路径参数问题修复，两种 path 格式兼容

#### Bug 修复 (fix)
- **消息页布局修复**：`.siper-content` CSS 缺失导致消息区无限增长 → 输入框被顶出页面（根因：`style.css` 含规则但 chat 页面不加载该文件）
- **消息页无滑块**：`.siper-messages` 缺 `min-height:0` → `overflow-y:auto` 不创建滚动条
- **「正在思考」面板始终可见**：`display:none` 规则仅存在于 `style.css`，chat 页面不加载 → 移除 `.open` 类后仍显示
- **复制/嵌入按钮失效**：`copyChatMsg` / `insertChatMsg` 函数随 ESM 重构丢失，未挂载到 `window`
- **模型验证按钮点击错位**：分组 / 筛选后 `data-idx` 索引错位 → 按 `data-name` 名称查找修复
- **模型删除 "model 不能为空"**：Router dispatch 对参数化 DELETE 路由传递 `body={}` 覆盖路径参数
- **会话切换后消息不显示**：`renderChatPage` 未挂载 `window`，切会话后无渲染
- **侧边栏点击 agent 不展开会话**：`chatToggleAgent` 更新状态后未调 `renderMiddleList()`
- **ESM 重构导入断裂**：`state.js` 批量加 `_` 前缀导致 3 个文件 295+ 行 import 断裂
- **CSS 动态加载无缓存破坏**：`loadCss()` 添 `?v=Date.now()`，修改 CSS 后浏览器立即生效

#### 重构 (refactor)
- **index.html 精简**：删除硬编码页面 HTML，只保留空容器（44 行），所有页面由 JS 渲染
- **CSS 拆分**：`style.css`（164KB，不被任何页面加载）→ `base.css`（82KB） + `chat.css`（16KB） + `page.css`（66KB）
- **三模板 SPA**：navigateToPage() 统一路由，`PAGE_LAZY` / `PAGE_TEMPLATE / PAGE_RENDER_FN` 三模式
- **页面代码清理**：删除废弃 `pages/settings.js` / `token.js` / `skills.js` / `logs.js`
- **CSS `transition` 时长补全**：20+ 处缺省时长 → `0.2s`

#### 架构改进
- **全面独立于 Hermes Agent 框架**：SiPer 是完全独立的 Python 应用，仅依赖 3 个 pip 包
- **per-Agent 数据库隔离**：sessions.db / memory.db 迁移到 `agents/{name}/` 目录
- **内存泄漏修复**：`active_tasks` → `deque(maxlen=1000)`、`page_cache` TTL + 大小限制
- **会话 FTS5 瘦身**：FTS5 表分离为独立虚拟表，主表瘦身 40%
- **Router GET full_path 传参修复**：`api_get_logs` / `api_theme_load` 依赖 query string 的场景修复

### v0.2.0 (2026-06-15)

- 起源架构 Phase 1-4 实施完成，README 全面重写
- sessions.db FTS 瘦身 + active_sessions LRU 淘汰（MAX=200）
- 快照同步完善（agents/sessions/expanded_agents）+ Skills 刷新 API
- 内存泄漏修复：active_tasks → deque(maxlen=1000)、page_cache TTL 限制

### v0.1.x 系列

- 131+ commits，详见 CHANGELOG.md

---

## License

MIT License — 详见 [LICENSE](LICENSE)
