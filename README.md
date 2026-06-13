# SiPer AI Agent

一个独立的 AI Agent 框架 — 多模型 · 多技能 · 多智能体 · Web UI。

核心仅依赖 `openai` + `websockets` + `jinja2`，28 个工具中 25 个纯 stdlib。

## 功能

### 🧠 多模型 LLM
- OpenAI 兼容接口，支持多 Provider、多模型切换
- 模型配置 SQLite 持久化（WAL 模式，并发安全）
- 15 种模型能力标签（chat/reasoning/code/vision/long_context 等）
- Provider 预设（OpenAI/Anthropic/DeepSeek/Qwen/智谱/MiniMax/Groq/OpenRouter/Ollama 等 12 个）
- 模型管理：独立页面，搜索/筛选/排序/分组切换，卡片 UI，TTFT/latency 实时测量
- 模型发现：从 Provider API 批量获取模型列表，支持筛选和批量添加
- Provider 和模型支持自定义别名（provider_alias / model_alias）

### 💬 流式响应
- WebSocket 实时流式输出
- 流式光标指示（闪烁 ▊）
- 思考面板（CoT 步骤可视化）
- 打字指示器（弹性圆点动画）
- 停止生成（stop_event 机制，防止竞态）

### 🔧 28 个内置工具
- **文件操作**：读/写/编辑/搜索/批量操作
- **代码执行**：Python 沙箱、Shell 命令
- **网络搜索**：SearXNG 本地实例、DuckDuckGo
- **浏览器控制**：完整浏览器自动化（导航/点击/输入/截图）
- **技能系统**：自动加载 SKILL.md、语义预筛选、上下文注入
- **记忆系统**：跨会话持久化记忆、知识空间管理
- **图像生成**：AI 图片生成
- **TTS**：文字转语音
- **会话管理**：创建/切换/重命名/删除会话
- **定时任务**：cron 调度
- **子代理**：delegate_task 并行委派、结果汇总
- **Web 抓取**：URL 内容提取（Markdown 格式）
- **Todo 管理**：任务列表持久化

### 🤖 多智能体
- 独立配置（config.json + soul.md + agent.md）
- 独立会话（per-agent sessions.db）
- 独立 SOUL/Agent 定义
- Agent 切换、新增、删除、头像上传
- Agent 配置页面：标签页管理、模型选择、技能配置

### 🖥️ Web UI
- **实时聊天**：流式输出、消息气泡入场动画、hover 微交互
- **模型管理**：独立页面、搜索/筛选/排序、分组/平铺切换、卡片 UI
- **会话管理**：列表折叠/展开、重命名、未读标记、波浪背景
- **Token 统计**：echarts 图表（分模型/24小时/每日趋势/效率对比/热力图）
- **系统设置**：运行时参数、Agent 管理、全局配置
- **主题系统**：9 种预设 + 自定义主题
- **技能管理**：技能卡片、搜索筛选
- **记忆管理**：Markdown 编辑器、知识空间浏览
- **系统日志**：多级别过滤、分页、自动刷新
- **Dict Modal**：完整响应数据查看，语法高亮
- **14 项前端动效**：消息入场、流式光标、弹性按钮、代码块展开、工具调用折叠、Toast 滑入、输入框聚焦光环、页面切换淡入、气泡 hover 上浮、连接状态脉冲、滚动按钮弹性入场、打字指示器弹性圆点、会话列表错开入场、prefers-reduced-motion 支持

### 💾 数据持久化
- SQLite + WAL 模式（会话、记忆、模型配置、技能调用记录）
- 乐观更新会话列表
- 快速重启脚本（1 秒重启）
- sessions.db 防膨胀：tool_call_steps 结果自动截断（≤200 字符）

### 🔒 安全
- 所有用户输入 HTML 转义（escapeHtml）
- 路径安全检查（防止路径穿越）
- WS 消息类型校验（未知类型忽略）
- API Key 脱敏显示（`****` 掩码）
- RateLimitError 指数退避重试

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
├── CHANGELOG.md              # 详细变更记录
├── ai_agent/                 # Agent 核心
│   ├── core/                 #   agent.py + llm_client.py
│   ├── models_db.py          #   模型数据库（SQLite）
│   ├── tools/                #   28 个工具实现
│   ├── skills/               #   技能系统
│   ├── sessions/             #   会话管理（SQLite + WAL）
│   └── utils/                #   工具类
├── agents/                   # 智能体数据（运行时自动生成）
│   ├── default/              #   默认智能体配置
│   ├── token.db              #   Token 统计 DB
│   └── company-researcher/   #   企业研究智能体
│   └── tv-recommender/       #   电视推荐智能体
├── webui/                    # Web 前端
│   ├── index.html            #   SPA 入口
│   ├── js/                   #   ESM 模块化 JS（21 个文件）
│   │   ├── app.js            #   唯一 ESM 入口
│   │   ├── chat/             #   聊天模块（message/stream/input/sidebar/state/toast/lang）
│   │   ├── pages/            #   页面模块（9 个页面）
│   │   ├── components/       #   公共组件（toast/model-test/agent-models）
│   │   └── utils/            #   工具函数（dom/escape/api/i18n）
│   ├── css/style.css         #   全局样式（~5400 行，17 个 @keyframes）
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

### v0.1.6 (2026-06-13)

**新功能**：
- **模型数据库 v6**：`provider_name` → `provider`，新增 `provider_alias` 记录用户改名；`model_name` → `model`，`alias` → `model_alias` 记录用户改名；删除 `created_at`，仅保留 `updated_at`
- **tool_call_steps 防膨胀**：sessions.db 中 assistant 消息的 `meta.tool_call_steps` 结果自动截断（result ≤200 字符，参数值 ≤100 字符），预计新会话 DB 大小从 ~676MB 降到 <1MB
- **模型选择器空库跳转**：DB 为空时按钮点击跳转 model-settings 页面，agent 未配置时跳转 agent-config 页面
- **选择器文字优化**：空库/无可用模型时显示"未设置可选模型"（非"无可用模型"）
- **"发现模型"简化**：UI 标题从"🔍 自动发现模型"改为"🔍 发现模型"
- **前端消息气泡布局统一**：stream_delta 渲染改为 grid 布局，tool-calls-wrap 由 appendMeta 统一管理
- **Dict Modal**：新增 `showDictModal(data)`，agent 消息 actions-below 加 {} 按钮显示完整响应 dict，语法高亮
- **JS 语法检查**：`node -c` 被安全策略拦截，改用 `write_file + new Function(code)` 模式
- **sessions.db per-agent 目录**：会话库从 `data/sessions.db` 迁移到 `agents/default/sessions.db`

**Bug 修复**：
- **RateLimitError 重试**：429 错误改为指数退避重试（1s/2s/4s），不再立即返回
- **模型配置保存链路**：前端 saveAllModels 补全 {model, base_url, api_key} 字段，后端调 configure_llm() 重建 LLMClient
- **agent 配置页面加载中修复**：modelsLoaded=true 但列表为空时也渲染空 select
- **skill-caps CSS 冲突**：`.cap-badge` 加 `.siper-model-caps` 前缀限定作用域
- **chatSwitchPage 引用修复**：ES module 中 `chatSwitchPage` 改为 `window.chatSwitchPage` 避免 ReferenceError
- **模型验证 provider_id 传递**：前端 testModel 传 providerId，后端 api_test_model 精确查找
- **前端全局命名空间污染修复**：多个 page-*.js 共享全局作用域导致 SyntaxError，重命名冲突变量

**重构**：
- 模型数据库 v5→v6 迁移：RENAME COLUMN + DROP COLUMN，兼容旧库
- 前端 ESM 缓存策略：ETag + Last-Modified 头，解决 Chromium 缓存不更新

### v0.1.5 (2026-07-30)

**新功能**：
- **14 项前端动效**：消息气泡入场（slide up + fade in）、流式光标（闪烁 ▊）、打字指示器弹性圆点（scale bounce）、发送按钮弹性回弹（cubic-bezier 回弹）、连接状态脉冲（box-shadow 扩散）、代码块左侧边框展开、工具调用折叠动画、Toast 滑入/滑出、输入框聚焦光环（box-shadow 扩散）、页面切换淡入、气泡 hover 上浮、滚动按钮弹性入场、会话列表错开入场（stagger 40ms）、prefers-reduced-motion 全局支持
- **会话 item UI 优化**：ID 显示 12 字符、时间显示、× 按钮 active 状态显示、左右 35px 留白
- **历史消息补全 meta 信息**：token 用量、模型名、处理时间、工具调用、技能使用
- **快速重启脚本**：`siper_restart.sh`，1 秒重启，替代手动 kill + 等待
- **前端消息渲染统一**：stream_end 复用 DOM，避免移除重建闪烁

**Bug 修复**：
- 会话排序竞态：`renderMiddleList` 去掉 debounce，改为同步执行，修复 `updateSessionPreview` 和 `chatLoadAllSessions` 竞态导致排序不稳定
- 波浪背景不停止：`selectChatSession` 只在 `_chatStreamAcc` 非空（仍在 streaming）时才开启 badge
- 回复结束 thinking panel 未隐藏
- 会话排序字段更新
- 非 chat 路径波浪停止
- 前端消息渲染统一 + 后端 import 优化
- `updateSessionPreview` 同步更新 DOM 时间显示

**重构**：
- 前端消息渲染统一：stream_end 路径和历史消息路径共享 DOM 更新逻辑
- 后端 import 优化

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
