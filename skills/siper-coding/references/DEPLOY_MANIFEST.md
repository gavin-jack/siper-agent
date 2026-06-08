# SiPer 部署包文件清单

> 由 `scripts/create_deploy.py` 的 MANIFEST 自动生成，不要手动编辑。
> 路径前缀：`/home/gavin/.siper/`（源）→ `E:\SiPer-Deploy\`（目标）

## 根目录（5 文件）

| 文件 | 用途 |
|------|------|
| `siper_web.py` | 主入口：HTTP+WS 服务器、路由、LLM 调用、前端页面 |
| `siper_cli.py` | CLI 工具：start/stop/status 管理 siper 服务 |
| `start.bat` | Windows 双击启动脚本 |
| `start.sh` | Linux/Mac 一键启动脚本 |
| `requirements.txt` | Python 依赖清单（websockets + jinja2） |
| `settings.json` | 服务配置：端口号等 |

## ai_agent — 核心框架（28 文件）

### ai_agent/ 根（1 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/__init__.py` | ai_agent 包入口，导出核心类 |

### ai_agent/core/ — 核心逻辑（3 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/core/__init__.py` | core 子包入口，导出 AIAgent/AgentConfig |
| `ai_agent/core/agent.py` | Agent 核心：process_message、工具调用、会话管理 |
| `ai_agent/core/llm_client.py` | LLM 客户端：HTTP 调用 LongCat API、流式解析 SSE |

### ai_agent/sessions/ — 会话管理（2 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/sessions/__init__.py` | sessions 子包入口 |
| `ai_agent/sessions/session_manager.py` | 会话管理：创建/保存/恢复对话历史 |

### ai_agent/skills/ — 技能系统（2 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/skills/__init__.py` | skills 子包入口 |
| `ai_agent/skills/skill_loader.py` | 技能加载：从 skills/ 目录加载 Python 技能模块 |

### ai_agent/tools/ — 工具集（11 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/tools/__init__.py` | tools 子包入口，注册所有工具 |
| `ai_agent/tools/tool_registry.py` | 工具注册表：ToolRegistry、BaseTool、ToolCall、ToolResult |
| `ai_agent/tools/toolsets.py` | 工具集：预定义工具组合 |
| `ai_agent/tools/url_safety.py` | URL 安全检查：SSRF 防护 |
| `ai_agent/tools/read_file_tool.py` | 工具：读取文件内容 |
| `ai_agent/tools/write_file_tool.py` | 工具：写入/创建文件 |
| `ai_agent/tools/list_dir_tool.py` | 工具：列出目录内容 |
| `ai_agent/tools/search_files_tool.py` | 工具：搜索文件内容 |
| `ai_agent/tools/execute_command_tool.py` | 工具：执行 shell 命令 |
| `ai_agent/tools/memory_tool.py` | 工具：读取/写入 agent 记忆 |
| `ai_agent/tools/web_search_tool.py` | 工具：网络搜索 |
| `ai_agent/tools/web_fetch_tool.py` | 工具：抓取网页内容 |
| `ai_agent/tools/budget_config.py` | 工具：预算/配额配置 |
| `ai_agent/tools/_echo_tool.py` | 工具：echo 调试用 |

### ai_agent/utils/ — 工具函数（2 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/utils/__init__.py` | utils 子包入口 |
| `ai_agent/utils/metrics.py` | 指标统计：token 用量、延迟等 |

### ai_agent/gateway/ — 消息网关（5 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/gateway/__init__.py` | gateway 子包入口 |
| `ai_agent/gateway/message_gateway.py` | 消息网关：多渠道消息路由 |
| `ai_agent/gateway/web_server.py` | Web 服务器：HTTP 请求处理 |
| `ai_agent/gateway/adapters/__init__.py` | adapters 子包入口 |
| `ai_agent/gateway/adapters/base_adapter.py` | 适配器基类 |
| `ai_agent/gateway/adapters/cli_adapter.py` | CLI 适配器 |
| `ai_agent/gateway/adapters/web_adapter.py` | Web 适配器 |

### ai_agent/orchestration/ — 多 Agent 协作（3 文件）

| 文件 | 用途 |
|------|------|
| `ai_agent/orchestration/__init__.py` | orchestration 子包入口 |
| `ai_agent/orchestration/meeting_room.py` | 会议室：多 agent 协作空间 |
| `ai_agent/orchestration/multi_agent_coordinator.py` | 多 agent 协调器 |

## agents — Agent 人格（3 文件）

| 文件 | 用途 |
|------|------|
| `agents/__init__.py` | agents 包：加载 soul.md/agent.md/memory.md/config.json，运行时自动生成缺失文件 |
| `agents/default/__init__.py` | default agent 包入口 |
| `agents/default/meta.json` | Agent 元数据（向后兼容） |
| `agents/default/avatar.png` | Agent 头像图片 |

## skills — 内置技能（3 文件）

| 文件 | 用途 |
|------|------|
| `skills/core_tools.py` | 核心技能：基础工具集 |
| `skills/file_operations.py` | 文件操作技能：读写、搜索、列表 |
| `skills/web_search.py` | 网络搜索技能 |

## webui — 前端（18 文件）

| 文件 | 用途 |
|------|------|
| `webui/__init__.py` | webui 包入口 |
| `webui/task_manager.py` | 任务管理器：后台任务队列 |
| `webui/templates/index.html` | SPA 入口 HTML（唯一模板） |
| `webui/static/style.css` | 全局样式表 |
| `webui/static/app.js` | 前端应用入口（暂未使用） |
| `webui/static/default_avatar.png` | 默认头像图片 |
| `webui/static/favicon.ico` | 网站图标 |
| `webui/static/i18n/log-i18n.json` | 日志国际化翻译 |
| `webui/static/pages/core.js` | 核心：WS 连接、消息收发、页面路由、工具进度 |
| `webui/static/pages/main.js` | 入口：初始化、加载模型列表、版本号 |
| `webui/static/pages/page-chat.js` | 聊天页：addMsg、appendMeta、新会话、发送消息 |
| `webui/static/pages/page-sessions.js` | 会话列表页：会话历史管理 |
| `webui/static/pages/page-tasks.js` | 任务页：后台任务状态 |
| `webui/static/pages/page-agent.js` | Agent 配置页 |
| `webui/static/pages/page-skills.js` | 技能页：技能列表/详情 |
| `webui/static/pages/page-logs.js` | 日志页：实时日志查看 |
| `webui/static/pages/page-token.js` | Token 统计页 |
| `webui/static/pages/page-settings.js` | 设置页：模型/API/端口/消息统计 |
| `webui/static/pages/page-gateway.js` | 网关页：渠道状态 |
| `webui/static/pages/page-meeting.js` | 会议室页：多 agent 协作 |
| `webui/static/pages/page-theme.js` | 主题设置页：配色方案 |
| `webui/static/pages/page-memory.js` | 记忆页：查看/编辑 agent 记忆 |
| `webui/static/pages/page-agent-config.js` | Agent 配置编辑页 |

## 排除规则

### 排除目录
`__pycache__`, `.git`, `.git.bak`, `backups`, `tests`, `.pytest_cache`, `.venv`, `data`, `memory`, `scripts`, `.bak`

### 排除文件
`.siper.pid`, `sessions.db`, `_check_syntax.py`, `_start_siper.sh`, `.tmp_stop.py.bak`, `settings.yaml`, `README.md`, `CHANGELOG.md`, `.gitignore`, `memory.md`, `pasted-image`, `models.json`

### 排除模式
`.pyc`, `.pid`, 所有 `.bak` 和 `.bak.*` 文件

## 运行时生成文件（不打包）

| 文件 | 说明 |
|------|------|
| `agents/default/memory.md` | 运行时记忆，每次对话后更新 |
| `sessions.db` | SQLite 会话数据库 |
| `.siper.pid` | 进程 PID 文件 |
| `uploads/` | 上传文件目录（部署时创建空目录） |
