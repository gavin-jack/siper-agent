# SiPer AI Agent

<p align="center">
  <strong>一个独立的 AI Agent 框架 — 多模型 · 多技能 · Web UI</strong>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#架构设计">架构设计</a> ·
  <a href="#配置说明">配置说明</a> ·
  <a href="#Web UI">Web UI</a>
</p>

---

## 简介

SiPer 是一个**独立运行的 AI Agent 框架**，不依赖任何外部 Agent 平台。只需 Python 3.10+ 和三个轻量依赖，即可在本地启动一个功能完整的 AI Agent 服务。

**核心理念**：Agent 应该像数据库一样——安装、配置、运行。不需要复杂的编排平台，不需要云依赖。

### 为什么选择 SiPer？

- **零外部依赖**：核心仅依赖 `openai` + `websockets` + `jinja2`，23 个工具中 21 个纯 stdlib
- **多模型支持**：OpenAI 兼容接口，支持任意兼容模型
- **多智能体**：每个智能体独立配置、独立会话数据库
- **Web UI**：内置完整的 Web 管理界面，支持实时聊天、配置管理、会话查看
- **技能系统**：自动加载、预筛选、上下文注入、使用统计
- **生产级**：WS 心跳重连、指数退避重试、会话持久化、Token 统计

---

## 快速开始

### 1. 下载安装

```bash
# 从 GitHub Release 下载
wget https://github.com/gavin-jack/siper-agent/releases/latest/download/siper-agent-*.tar.gz
tar xzf siper-agent-*.tar.gz
cd siper-agent
```

### 2. 安装依赖

```bash
pip3 install -r requirements.txt
# 仅 3 个包：openai, websockets, jinja2
```

### 3. 配置

```bash
# API Key
cp .env.template .env
# 编辑 .env，填入你的 API Key

# 模型配置
cp models.json.template models.json
# 编辑 models.json，填入 base_url、api_key、模型 ID

# 智能体配置（可选）
cp agents/default/config.json.template agents/default/config.json
```

### 4. 启动

```bash
nohup python3 siper_web.py > /dev/null 2>&1 &
echo $! > .siper.pid
```

### 5. 访问

打开浏览器访问 **http://localhost:9724**

---

## 功能特性

### 🤖 Agent 核心

| 功能 | 说明 |
|------|------|
| 多模型 LLM | OpenAI 兼容接口，支持多 Provider、多模型切换 |
| 流式响应 | WebSocket 实时流式输出，支持 stream_delta 聚合渲染 |
| 工具调用 | 23 个内置工具，支持并行执行、轮次限制、超时控制 |
| 技能系统 | 自动加载 SKILL.md、语义预筛选、上下文注入、使用反馈 |
| 会话管理 | SQLite 持久化、WAL 模式、自动恢复、历史加载 |
| 记忆系统 | 跨会话记忆、相关性筛选、Token 感知截断 |
| 多智能体 | 独立配置、独立会话、独立 SOUL/Agent 定义 |

### 🛠️ 内置工具（23 个）

| 分类 | 工具 |
|------|------|
| 文件操作 | read_file, write_file, search_files, patch, list_dir |
| 代码执行 | execute_code, execute_command |
| 网络 | web_search, web_fetch |
| Agent | memory, session_search, todo |
| 技能 | skills, skills_list, skills_view |
| 浏览器 | browser (snapshot, click, type, navigate, console, back, press, scroll) |
| AI 能力 | vision, image_gen, text_to_speech |
| 系统 | cronjob, delegate_task, clarify, send_message |

### 💬 Web UI

| 页面 | 功能 |
|------|------|
| 聊天 | 实时流式对话、消息气泡、工具调用展示、响应字典查看 |
| 智能体配置 | 4 个 Tab：关于/配置文件/模型配置/回复限制 |
| 全局设置 | 系统参数、服务端口、日志级别、保存并重启 |
| 会话管理 | 会话列表、历史搜索、预览、删除 |
| 技能管理 | 技能列表、详情查看、启用/禁用 |
| 日志 | 实时日志流、级别过滤、搜索 |
| Token 统计 | 使用量图表、模型分布 |
| 主题 | 9 种预设 + 12 色自定义、实时预览 |

---

## 架构设计

### 目录结构

```
siper-agent/
├── siper_web.py              # 主入口（WS 服务器 + HTTP + 路由）
├── settings.json             # 系统级配置
├── models.json               # LLM 提供商和模型定义
├── .env                      # API Key（不入库）
├── requirements.txt          # Python 依赖（仅 3 个）
│
├── ai_agent/                 # Agent 核心
│   ├── core/
│   │   ├── agent.py          # Agent 主循环、工具调用、技能注入
│   │   └── llm_client.py     # LLM 客户端、多模型适配、重试逻辑
│   ├── tools/                # 23 个工具实现
│   │   ├── tool_registry.py  # 工具注册中心
│   │   ├── toolsets.py       # 工具集分组
│   │   └── ...               # 各工具实现
│   ├── skills/               # 技能系统
│   │   ├── skill_loader.py   # SKILL.md 加载
│   │   ├── skill_pre_filter.py  # 语义预筛选
│   │   ├── skill_registry.py # 技能注册
│   │   └── skill_feedback.py # 使用统计反馈
│   ├── sessions/             # 会话管理
│   │   └── session_manager.py # SQLite 持久化
│   └── utils/                # 工具类
│       └── metrics.py        # Token 估算
│
├── agents/                    # 智能体定义
│   ├── default/              # 默认智能体
│   │   ├── soul.md           # 系统提示词（SOUL）
│   │   ├── agent.md          # 行为规则
│   │   ├── config.json       # 运行时配置
│   │   └── sessions.db       # 会话数据库（运行时生成）
│   └── company-researcher/   # 示例：企业研究智能体
│
├── webui/                    # Web 前端
│   ├── static/
│   │   ├── style.css         # 主题系统、响应式布局
│   │   ├── pages/            # 页面 JS（原生 ES Module）
│   │   │   ├── core.js       # 核心：WS 通信、i18n、路由
│   │   │   ├── page-chat.js  # 聊天页面
│   │   │   └── ...           # 其他页面
│   │   ├── i18n/             # 国际化（zh/en/tw）
│   │   └── *.min.js          # 第三方库（KaTeX, Mermaid, Prism）
│   └── templates/
│       └── index.html        # 单页应用入口
│
└── skills/                   # 内置技能
    ├── code-review/          # 代码审查
    ├── file-operations/      # 文件操作
    └── web-search/           # 网络搜索
```

### 通信协议

```
浏览器 ──WebSocket──▶ siper_web.py ──▶ ai_agent/core/agent.py
                         │                       │
                         ▼                       ▼
                    HTTP REST API          LLM Client
                    (配置/会话/技能)        (OpenAI API)
```

- **WebSocket**：实时聊天、日志推送、状态通知
- **HTTP REST**：配置管理、会话 CRUD、技能管理、文件上传
- **LLM API**：OpenAI 兼容接口，支持流式/非流式

### 数据流

```
用户消息
  → WS → siper_web.py → agent.process_message()
    → 构建系统提示词（SOUL + Skills + Memory）
    → LLM Client.chat_completion_stream()
      → stream_delta → WS → 浏览器渲染
      → tool_call → 执行工具 → 追加结果 → 继续 LLM
    → stream_end → 持久化会话 → 返回完整响应
```

---

## 配置说明

### 配置文件体系

| 文件 | 用途 | 模板 |
|------|------|------|
| `.env` | API Key | `.env.template` |
| `models.json` | LLM 提供商和模型 | `models.json.template` |
| `settings.json` | 系统参数（心跳、日志、会话等） | `settings.json.template` |
| `agents/{name}/config.json` | 智能体配置（名称、外观、限制等） | `config.json.template` |
| `agents/{name}/skill_config.json` | 技能系统配置 | `skill_config.json.template` |

### Per-Agent 配置（agents/{name}/config.json）

```json
{
  "name": "default",
  "icon": "🎭",
  "memory_integration": {
    "mode": "append",
    "position": "after_system",
    "max_tokens": 20000
  },
  "appearance": {
    "msg_font_size": "18px",
    "msg_bg": "#1c2333",
    "msg_text": "#e6edf3"
  },
  "session_timeout": 3600,
  "max_tools": 300,
  "max_tool_rounds": 100,
  "available_models": ["your-model-id"],
  "default_chat_model": "your-model-id"
}
```

### Global 配置（settings.json）

```json
{
  "system": {
    "ws_heartbeat_timeout": 300,
    "session_list_limit": 50,
    "log_buffer_size": 2000,
    "token_usage_max": 500,
    "context_window_default": 8192
  },
  "gateway": {
    "webui": { "enabled": true, "host": "localhost", "port": 9724 }
  }
}
```

---

## 技能系统

技能是 SiPer 的核心扩展机制。每个技能是一个包含 `SKILL.md` 的目录：

```
skills/my-skill/
├── SKILL.md          # 技能定义（名称、描述、能力、使用场景）
└── references/       # 参考文档（可选）
```

### 技能生命周期

1. **加载**：启动时扫描 `skills/` 目录，解析所有 SKILL.md
2. **预筛选**：每次对话前，根据用户消息语义筛选 top_k 个相关技能
3. **注入**：将选中技能的描述注入系统提示词
4. **追踪**：记录实际使用的技能（通过工具调用匹配）
5. **反馈**：根据使用频率调整技能排序

### 内置技能

| 技能 | 描述 |
|------|------|
| code-review | 代码审查：检查风格、安全、性能 |
| file-operations | 文件操作：读写、搜索、批量处理 |
| web-search | 网络搜索：多引擎、结果解析 |

---

## API 参考

### WebSocket

```
ws://localhost:9724/ws
```

| 方向 | type | 说明 |
|------|------|------|
| C→S | `new_session` | 创建新会话 |
| C→S | `send_message` | 发送消息 |
| C→S | `stop_generation` | 停止生成 |
| S→C | `stream_delta` | 流式文本增量 |
| S→C | `stream_end` | 流式结束 |
| S→C | `tool_call` | 工具调用通知 |
| S→C | `error` | 错误通知 |

### HTTP REST

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | Web UI |
| GET | `/api/config` | 获取全局配置 |
| POST | `/api/config` | 更新全局配置 |
| GET | `/api/agents` | 列出所有智能体 |
| GET | `/api/agents/{name}` | 获取智能体配置 |
| POST | `/api/agents/{name}` | 更新智能体配置 |
| GET | `/api/sessions` | 列出会话 |
| GET | `/api/sessions/{id}` | 获取会话详情 |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| GET | `/api/skills` | 列出技能 |
| POST | `/api/gateway` | 重启服务 |

---

## 系统要求

- **Python**: 3.10+
- **OS**: Linux / macOS / Windows (WSL2)
- **内存**: ≥ 512 MB
- **磁盘**: ≥ 50 MB

### 依赖

```
openai>=1.0      # LLM 客户端
websockets>=15.0  # WebSocket 服务器
jinja2>=3.1       # 模板引擎
```

可选：`httpx`（HTTP 客户端）、`edge-tts`（TTS 引擎）

---

## 开发

### 启动开发模式

```bash
# 前台启动（看到日志）
python3 siper_web.py

# 后台启动
nohup python3 siper_web.py > siper.log 2>&1 &

# 停止
kill $(cat .siper.pid)
```

### 运行测试

```bash
python3 test_siper.py              # 完整测试
python3 test_siper.py --skip-llm   # 跳过 LLM 调用
```

### 打包发布

```bash
python3 scripts/create_deploy.py
# 输出: /mnt/e/SiPer/release/siper-agent-YYYYMMDD_HHMMSS.tar.gz
```

---

## 许可证

MIT License

---

## 链接

- **GitHub**: https://github.com/gavin-jack/siper-agent
- **Releases**: https://github.com/gavin-jack/siper-agent/releases
- **Issues**: https://github.com/gavin-jack/siper-agent/issues
