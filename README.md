# SiPer AI Agent

一个独立的 AI Agent 框架 — 多模型 · 多技能 · 多智能体 · Web UI。

核心仅依赖 `openai` + `websockets` + `jinja2`，28 个工具中 25 个纯 stdlib。

## 功能

- **多模型 LLM**：OpenAI 兼容接口，支持多 Provider、多模型切换，模型配置 SQLite 持久化
- **流式响应**：WebSocket 实时流式输出
- **28 个内置工具**：文件操作、代码执行、网络搜索、浏览器控制、技能系统、记忆系统、图像生成、TTS 等
- **技能系统**：自动加载 SKILL.md、语义预筛选、上下文注入
- **多智能体**：独立配置、独立会话、独立 SOUL/Agent 定义
- **Web UI**：内置完整管理界面，实时聊天、配置管理、Token 统计
- **数据持久化**：SQLite + WAL 模式（会话、记忆、模型配置、技能调用记录）

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

## 目录结构

```
siper-agent/
├── siper_web.py              # 主入口（WS 服务器 + HTTP + 路由）
├── requirements.txt          # Python 依赖
├── setup.py                  # pip 安装配置
├── LICENSE                   # MIT License
├── README.md                 # 项目说明
├── ai_agent/                 # Agent 核心
│   ├── core/                 #   agent.py + llm_client.py
│   ├── models_db.py          #   模型数据库（SQLite）
│   ├── tools/                #   28 个工具实现
│   ├── skills/               #   技能系统
│   ├── sessions/             #   会话管理（SQLite + WAL）
│   └── utils/                #   工具类
├── agents/                   # 智能体数据（运行时自动生成）
│   ├── default/              #   默认智能体配置
│   ├── token.db              #    token 统计 DB
│   └── company-researcher/   #   企业研究智能体
│   └── tv-recommender/       #   电视推荐智能体
├── webui/                    # Web 前端
│   ├── index.html            #   SPA 入口
│   ├── js/                   #   ESM 模块化 JS（21 个文件）
│   │   ├── app.js            #   唯一 ESM 入口
│   │   ├── chat/             #   聊天模块
│   │   ├── pages/            #   页面模块（9 个页面）
│   │   ├── components/       #   公共组件
│   │   └── utils/            #   工具函数
│   ├── css/style.css         #   全局样式
│   └── static/               #   静态资源（echarts、头像等）
├── skills/                   # 内置技能
│   ├── code-review/          #   代码审查
│   ├── company-research/     #   企业研究
│   └── file-operations/      #   文件操作
└── scripts/                  # 部署脚本
```

## 配置文件

首次启动时自动生成，无需手动创建：

| 文件 | 说明 |
|------|------|
| `models.db` | 模型和提供商配置（SQLite，项目根目录） |
| `settings.json` | 系统参数（端口、心跳、日志等） |
| `agents/{name}/sessions.db` | 会话数据库（运行时生成） |
| `agents/{name}/config.json` | 智能体配置 |
| `agents/{name}/soul.md` | 智能体人格定义 |

## 更新日志

### v0.1.4 (2026-07-30)

**新功能**：
- **模型管理独立页面**：从全局设置页拆分为独立页面，更专注的模型管理体验
- **模型卡片 UI 优化**：统一按钮尺寸 28×24px、删除按钮 hover 浅红色、验证按钮 outline 样式 + 🔍 图标
- **验证状态整合**：点击验证后清空功能图标，在 model-caps-inner 中显示橙色"正在更新模型能力..."提示
- **搜索/筛选/排序增强**：多能力筛选（8 种能力多选）、5 种排序方式（名称/TTFT/延迟/上下文/能力数）、分组/平铺切换
- **"恢复分组"按钮**：搜索/筛选/排序后一键恢复分组视图
- **Provider 预设**：12 个预设（OpenAI/Anthropic/DeepSeek/MoonCat/Qwen/智谱/MiniMax/Groq/OpenRouter/Ollama 等）
- **模型发现**：从 Provider API 批量获取模型列表，支持筛选和批量添加
- **latency 持久化**：DB 新增 latency 列，前端→后端→DB 全链路打通
- **TTFT 颜色编码**：<500ms 蓝色、500-1500ms 橙色、>1500ms 红色
- **复制按钮**：SVG 图标 + 事件委托 + 三级 fallback（Clipboard API → execCommand → modal）
- **复选框穿透修复**：pointer-events:none 防止 double-toggle
- **入场动画**：模型卡片交错动画，仅首次加载触发
- **名称走马灯**：模型名超长时 hover 自动滚动

**Bug 修复**：
- 复选框 onclick + onchange 双触发导致状态翻转
- 复制按钮 JSON.stringify 双引号截断 onclick
- 验证按钮绿色背景被旧 CSS 规则覆盖
- 智能体配置标签页不显示（.hidden !important 覆盖）
- 排序后分组标题仍显示
- toggleSortDir 不重建 HTML 导致排序不分组

**重构**：
- 模型管理从 settings.js 拆出为独立 model-settings.js（929 行）
- settings.js 精简为系统参数 + Agent 管理（960 行删除）
- CSS 颜色全部通过 var() 引用，去掉硬编码

### v0.1.3 (2026-06-12)

**新功能**：
- 模型存储 SQLite 化：从 models.json 迁移到 SQLite（models.db），WAL 模式，并发安全
- 15 种模型能力标签：chat/reasoning/code/function_calling/vision/long_context/translation/ocr/summarization/sentiment/ner/math/chart/document
- 模型配置 API 大幅简化（40 行 → 3 行）

**Bug 修复**：
- 添加模型后刷新页面数据丢失（立即保存，不等 debounce）
- api_test_model 错误消息过时

**重构**：
- 删除 models.json 文件和迁移脚本
- 删除遗留函数 `_global_models_path()` / `_save_models_to_json()`
- 部署脚本 create_deploy.py 移除 models.json 引用

### v0.1.1 (2026-06-11)

完整变更记录（131 个 commit）：[CHANGELOG.md](CHANGELOG.md)

**新功能 (16 项)**：
- 会话重命名（双击名称编辑）、Agent 配置自动保存、头像上传自动同步
- 乐观更新会话列表、Agent 删除+新增弹窗、波浪背景跨会话保持
- 对话页面常驻 DOM、dict 按钮保存完整响应数据、dict modal UI 优化
- 统一通知系统（toast/confirm/dict 合并）、Agent 管理选项卡（卡片模式）
- Token 限制分组（LLM 调用/会话/其他）、移除网关页面

**Bug 修复 (78 项)**：
- 会话管理：记住展开状态、避免全量渲染中栏、session_created 自动切换、排序修复等 18 项
- Agent 管理：目录结构优化、config.json 过滤、样式审计修复等 12 项
- 头像上传：multipart 解析、agent 识别、sidebar 同步、路由查找等 10 项
- 前端渲染：会话切换闪烁、ESM cache-buster、防重入锁等 10 项
- 通知弹窗：toast 进度条、dict modal 按钮、统一 siper-notif 等 6 项
- 配置设置：auto-save 事件绑定、ESM import 修复、settings.json 同步等 5 项
- UI 审计：CSS 分区标题格式、侧边栏间距、CSS 变量作用域等 4 项
- 其他：键盘可访问性、P1 catch 反馈（8 处）、P2 loading disabled（7 处）、系统升级功能移除等 13 项

**重构 (20 项)**：
- 统一弹窗系统、CSS 分区重排（7 个功能分区）、HTML 简化
- 主题精简为默认主题、Agent 目录结构优化（sessions/memory/skill）
- 数据库全量优化（N+1 修复/批量写入/索引补齐）
- 头像上传简化、消除重复函数、ESM import 统一

**杂务**：skills/ 从 git 移除、开发临时文件清理、.gitignore 完善、版本号更新

### v0.1.0 (2026-06-07)

首个正式版本发布。

**后端（45 个 .py 文件）**：
- agent.py — Agent 主循环（工具调用、多轮对话、流式输出）
- llm_client.py — LLM 客户端（OpenAI 兼容，重试、超时、流式）
- 28 个内置工具（文件操作、代码执行、搜索、浏览器、技能、记忆、TTS、图像生成等）
- 技能系统（自动加载、语义预筛选、上下文注入）
- 会话管理（SQLite + WAL、per-agent 隔离）

**WebUI（27 个文件）**：
- 实时流式聊天（WebSocket）
- 智能体配置、全局设置、会话管理
- Token 统计图表（echarts）
- 主题系统（9 种预设 + 自定义）
- 9 个管理页面（聊天/会话/配置/设置/主题/Token/日志/记忆/技能）

**内置技能**：代码审查、企业研究、文件操作

## License

MIT License — 详见 [LICENSE](LICENSE)
