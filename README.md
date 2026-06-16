# SiPer AI Agent

> **一个独立的 AI Agent 框架 — 有状态 UI · 多模型 · 多 Agent · 25 个内置工具 · 三语言**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://python.org) [![Version](https://img.shields.io/badge/Version-v0.2.1-green.svg)](https://github.com/gavin-jack/siper-agent/releases)

**核心仅依赖 `openai` + `websockets` + `jinja2`，25 个工具中大部分纯 stdlib。**

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

后端维护前端页面状态的完整镜像（DOM 快照），前端只负责把快照渲染成 DOM。状态变化 → 计算 delta → 推送到前端 → 精确更新。

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
| 前端 | 原生 JS (ESM) | 无框架依赖，38 个模块 |
| 样式 | CSS 变量 + 自定义主题 | 1 种预设 + 自定义导入/导出 |
| 通信 | WebSocket + HTTP | 双通道，实时 + 按需 |
| 持久化 | SQLite + WAL | 多数据库，并发安全 |
| 渲染 | DOM 快照 | 后端驱动，前端纯展示 |

### 代码统计

| 模块 | 文件数 | 行数 |
|------|--------|------|
| Python 后端 | 64 个 .py | ~21,000 行 |
| JS 前端 | 38 个 .js | ~8,600 行 |
| CSS | 3 个 | ~4,900 行 |
| HTML | 1 个 | ~44 行 |
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
│        状态管理层                      │
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
│        持久化层                      │
│  sessions.db │ token.db │ models.db │
│  memory.db   │ skill_call_log.db    │
│  snapshot.db │ 配置文件             │
└─────────────────────────────────────┘
```

---

## 功能特性

### 🧠 多模型 LLM 管理

- **OpenAI 兼容接口**：支持任意 OpenAI API 兼容的 LLM Provider，统一调用链路
- **多 Provider 管理**：同时配置多个 Provider，独立 base_url / api_key，SQLite WAL 持久化
- **模型发现**：输入 Provider 信息 → 批量拉取模型列表 → 筛选 → 批量添加
- **模型能力标签**：chat / reasoning / code / vision / long_context / translation / function_calling / tts 等
- **12 个 Provider 预设**：OpenAI / Anthropic / DeepSeek / Qwen / 智谱 / MiniMax / Groq / OpenRouter / Ollama / Moonshot / LongCat / 自定义
- **模型管理独立页面**：搜索（名称/能力）/ 筛选（多能力复选）/ 排序（名称/TTFT/延迟/上下文/能力数）
- **模型卡片 UI**：TTFT 颜色编码（<500ms 蓝 / 500-1500ms 橙 / >1500ms 红）、能力 badge、验证状态
- **模型验证**：单模型验证 / 批量验证，实时反馈

### 💬 流式响应

- **WebSocket 实时流式输出**：token 级流式推送，低延迟
- **流式光标指示**：闪烁 ▊ 光标，实时反馈生成状态
- **思考面板（CoT）**：Chain-of-Thought 步骤可视化，折叠展开
- **停止生成**：stop_event 机制，立即中断 LLM 调用
- **streaming 重试**：APIConnectionError / JSONDecodeError / 空流自动重试（1s/2s/4s 指数退避）
- **双层重试架构**：SDK 内置 max_retries=3（网络层）+ 手动 3 次（应用层）
- **max_tokens 截断检测**：finish_reason=="length" 时自动追加截断提示
- **RateLimitError (429) 重试**：指数退避，应用层 + SDK 双重保障

### 🔧 27 个内置工具

| 类别 | 工具 | 说明 |
|------|------|------|
| **文件操作** | `read_file` / `write_file` / `patch` / `search_files` / `list_dir` | 读写编辑搜索，批量操作 |
| **代码执行** | `execute_code` / `execute_command` | Python 沙箱 + Shell 命令 |
| **网络搜索** | `web_search` / `web_fetch` | SearXNG + DuckDuckGo + URL 提取 |
| **浏览器控制** | `browser_*`（导航/点击/输入/截图/滚动/JS执行） | 全功能浏览器自动化 |
| **技能系统** | `skills_list` / `skill_view` / `skill_manage` | 自动加载、语义预筛选、上下文注入 |
| **记忆系统** | `memory` / `session_search` | 跨会话持久化、知识空间、FTS5 全文搜索 |
| **图像视觉** | `vision_analyze` / `image_gen` | 图片理解 + AI 图片生成 |
| **语音合成** | `text_to_speech` | TTS，多 Provider 支持 |
| **子代理** | `delegate_task` | 并行委派、结果汇总、多代理协作 |
| **任务管理** | `todo` / `cronjob` / `clarify` | 任务列表 + 定时任务 + 主动询问 |
| **通信** | `send_message` / `clarify` | 消息推送、用户交互 |
| **元操作** | `session_search` / `skills_manage` | 跨会话搜索、技能生命周期管理 |

### 🤖 多 Agent 系统

- **独立配置**：每个 Agent 拥有 `config.json`（配置）+ `soul.md`（人格）+ `agent.md`（行为指令）
- **独立会话**：per-agent `sessions.db`，会话数据完全隔离
- **独立记忆**：per-agent `memory.db`，跨会话持久化
- **Agent CRUD**：创建 / 切换 / 新增 / 删除 / 头像上传
- **Agent 配置页面**：6 个标签页（关于 / 属性文件 / 记忆 / 限制 / 模型 / 头像）
- **Agent 限制配置**：超时 / 重试 / max_tokens / 工具轮次 / 工具数量 / 会话超时 / 历史消息数
- **Agent 模型选择**：默认对话模型 / 默认视觉模型，从全局模型加载

### 🖥️ Web UI

- **实时聊天**：WebSocket 流式输出、消息气泡入场动画（slide up + fade in）
- **模型管理**：独立页面、搜索/筛选/排序、卡片 UI、批量验证
- **会话管理**：列表折叠/展开、重命名（双击编辑）、未读标记、波浪背景动画
- **Token 统计**：ECharts 图表 — 分模型 / 24h 趋势 / 每日趋势 / 热力图
- **系统监控**：运行时参数、内存/CPU、DB 大小、运行时长
- **主题系统**：自定义颜色 + 布局滑块 + 模板保存/导入/导出
- **技能管理**：技能卡片、搜索筛选、技能详情、调用统计
- **记忆管理**：Markdown 编辑器、记忆整合配置
- **系统日志**：多级别过滤（DEBUG/INFO/WARN/ERROR）、分页、自动刷新
- **Dict Modal**：完整响应数据查看，语法高亮，搜索/导航
- **侧边栏**：可折叠、Agent 分组、会话列表、未读标记
- **三语言 i18n**：简体中文 / English / 繁體中文，运行时切换
- **14 项前端动效**：消息入场、流式光标、弹性按钮、代码块展开、工具调用折叠、Toast 滑入、输入框聚焦光环、页面切换淡入、连接状态脉冲、打字指示器弹性圆点、会话列表错开入场、prefers-reduced-motion 支持

### 💾 数据持久化

- **SQLite + WAL 模式**：sessions.db / memory.db / models.db / token.db / skill_call_log.db / snapshot.db
- **乐观更新**：会话列表操作后立即更新 UI，后台同步数据库
- **快速重启**：`siper.sh restart` 脚本，重启服务保留 session
- **内存控制**：active_sessions LRU（MAX=200）、active_tasks deque(maxlen=1000）、page_cache TTL + 大小限制
- **快照持久化**：`SnapshotManager` 定期保存页面状态到 SQLite，重启恢复

### 🔒 安全

- **HTML 转义**：所有用户输入经 `escapeHtml` 处理，防止 XSS
- **路径安全检查**：防止路径穿越攻击
- **WS 消息校验**：未知消息类型静默忽略，防止注入
- **API Key 脱敏**：前端显示 `***` 掩码，不暴露真实密钥
- **RateLimitError 重试**：429 错误指数退避重试（1s/2s/4s）
- **请求大小限制**：HTTP 请求大小限制，防止 DoS

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
│   │   └── llm_client.py      #   LLM 客户端（OpenAI 兼容/重试/超时）
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
│   ├── default/               #   默认 Agent
│   │   ├── config.json        #     配置
│   │   ├── soul.md            #     人格定义
│   │   ├── sessions.db        #     会话 DB
│   │   └── memory.db          #     记忆 DB
│   └── {agent_name}/          #   自定义 Agent（同上结构）
│
├── webui/                     # Web 前端
│   ├── index.html             #   SPA 入口（44 行，纯容器）
│   ├── css/
│   │   ├── chat.css           #   聊天页面样式
│   │   ├── page.css           #   独立页面样式
│   │   └── base.css           #   基础样式
│   └── js/                    #   ESM 模块化 JS（38 个文件）
│       ├── app.js             #     唯一 ESM 入口 + 路由 + 页面管理
│       ├── core.js            #     WebSocket 连接 + 消息收发
│       ├── renderer.js        #     统一 DOM 渲染
│       ├── chat/              #     聊天模块（message/stream/input/state/sidebar/thinking）
│       ├── pages/             #     页面模块（含 chat-pages/ 子目录）
│       ├── components/        #     公共组件（toast/model-test/agent-models）
│       └── utils/             #     工具函数（escape/i18n/api/dom）
│
├── skills/                    # 内置技能目录
│
├── docs/                      # 架构文档
│
├── *.db                       # 数据库（运行时生成）
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

### v0.2.1 (2026-07-28)

- **README 全面更新**：代码统计与实际对齐（~21K Python + ~8.6K JS + ~4.9K CSS + ~44 HTML）
- CSS 文件结构审计：清理死文件 `style.css`（~160KB 从未加载）+ 未引用大图 `default_avatar.png`
- 前端模块数量与实际对齐（38 个 .js 文件）

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
