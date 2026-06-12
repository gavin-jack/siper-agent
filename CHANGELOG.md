# Changelog

> 所有版本变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)。

---

## v0.1.3 (2026-06-12)

### 新功能 (feat)

- **模型存储 SQLite 化**：模型配置从 models.json 迁移到 SQLite（models.db），WAL 模式，并发安全，数据完整性保障
- **模型能力 15 种**：chat/reasoning/code/function_calling/vision/long_context/translation/ocr/summarization/sentiment/ner/math/chart/document
- **模型配置 API 简化**：api_get_global_models 从 40 行 JSON 解析简化为 3 行 SQLite 查询，api_save_global_models 从 140 行简化为 SQLite 写入

### Bug 修复 (fix)

- **添加模型后数据丢失**：settings.js 中 doAddDiscoveredModel/addAllDiscoveredModels 改为 async，添加后立即保存（不等 debounce），防止刷新页面丢失数据
- **api_test_model 错误消息过时**："请在 models.json 中配置" → "请在 Web UI 配置页面设置"

### 重构 (refactor)

- **删除 models.json**：模型存储完全 SQLite 化，删除 models.json 文件和 models_migration.py 迁移脚本
- **删除遗留函数**：`_global_models_path()` 和 `_save_models_to_json()` 从 siper_web.py 移除
- **更新部署脚本**：create_deploy.py 删除 models.json 引用和 TEMPLATE_MODELS 常量
- **统一注释/日志**：所有 models.json 引用更新为 models.db

---

## v0.1.1 (2026-06-11)

### 新功能 (feat) — 16 项

- **中栏会话列表折叠**：agent 会话列表最多显示 3 个，多余隐藏，展开/收起按钮控制
- **会话重命名**：双击会话名称弹出输入框，支持重命名
- **Agent 配置自动保存**：修改 agent.md/soul.md 后自动触发保存，无需手动点击
- **头像上传自动同步**：上传头像后自动更新 sidebar 显示，默认头像自动复制
- **乐观更新会话列表**：点 + 号创建会话后立即插入列表顶端，不重新渲染中栏
- **Agent 删除 + 新增弹窗**：删除按钮移至身份行下方，新增 agent 统一弹窗
- **波浪背景**：跨会话/跨 agent 保持波浪背景状态，选中/未选中颜色区分
- **对话页面常驻 DOM**：聊天页 DOM 不再销毁重建，独立页面容器按需挂载
- **dict 按钮保存完整响应数据**：点击 {} 按钮保存完整 JSON 到 sessions.db，支持代码模式切换
- **dict modal UI/UX 优化**：sticky header、代码模式切换、结构化视图
- **统一通知系统 v1**：toast/confirm/dict 合并为 siper-notif 体系
- **统一通知系统 v2**：所有弹窗统一到 #siperNotifRoot，消除散落 DOM
- **Agent 管理选项卡**：卡片模式、属性文件编辑、详情面板（重命名+编辑文件）
- **Agent 选项卡**：系统参数/模型设置修改后自动刷新 UI
- **移除网关页面**：删除独立网关管理页
- **Token 限制分组**：limits tab 分为 LLM 调用/会话/其他三个 section

### Bug 修复 (fix) — 78 项

#### 会话管理（18 项）
- 记住中栏会话列表展开状态，选会话后不再折叠
- 会话列表展开状态用 Map 存储，避免 loadChatAgents 重建后丢失
- 新会话显示在 agent 列表顶端，不参与 agent 排序
- stream_end/response 中只更新对应会话 DOM，不再全量渲染中栏
- chatHandleStreamEnd 中不再全量渲染中栏
- 占位会话不设 updated_at，保持新会话身份
- session_created 中更新右栏 header 为 agent 名称
- session_created 中重新渲染右栏显示输入框
- renderChatPage 中显示 agent 名称作为右栏标题
- renderChatPage 中调用 updateChatHeader 显示完整标题（会话@Agent:模型+能力图标）
- agent 排序只考虑有 updated_at 的会话
- 删除按钮从头像容器移到 identity-avatar-row 下方
- 删除按钮增加下端间距，靠右显示
- 去掉中栏会话收起按钮；右栏标题加页面守卫
- input.js 导入 chatCurrentPage
- 展开状态下不显示查看更多按钮
- session_created 自动切换到新会话
- 新会话创建后自动切换 + 点击会话后右栏正确渲染

#### Agent 管理（12 项）
- agent 点击中栏闪烁 — template 只注入一次 + 去重 fetch + 防重复绑定
- selectChatAgent DOM 被 chatSwitchPage 清空后重新注入模板
- list_agents 只返回有 config.json 的目录，过滤 __pycache__
- api_get_agents 对无 config.json 的 agent 目录加 None 保护
- P0 — chatApplyProviderPreset 未 mount + showAddAgentModal 无样式
- 全局设置页不再覆盖 agent 配置
- 端口和日志级别从 agent 设置页迁移到全局设置页
- agent 目录结构优化 — sessions/memory/skill 子目录
- 删除 skills/siper-coding/ + token DB 增加 source 列
- 清理冗余数据 + 迁移 skill_call_log
- 主题精简为单一默认主题
- 修复日志页面 chatLogLogLevel 级别筛选功能

#### 头像上传（10 项）
- 头像上传失败 — uploadAgentAvatar 从 input 元素读取文件
- selectConfigAgent 设置 currentConfigAgent 变量
- 移除 initAvatarAutoUpload 重复上传逻辑
- rebind avatarFileInput change event after cloneNode
- save_agent_config_file returns None 导致 auto-save 失败（2 个 commit 修复）
- model selects in agent config page not populated
- 头像上传 multipart 解析失败
- 头像上传 agent 识别 + sidebar 同步
- /api/avatar GET 路由查找 avatar.webp（之前只找 avatar.png）
- 前端所有 agent 头像统一使用 /api/avatar?agent= 路由

#### 前端渲染（10 项）
- 会话切换闪烁 — selectChatSession 按需重建右栏
- 独立页面 DOM 模板恢复 + navigateToPage clone 逻辑
- 日志页面模板缺失 DOM 元素导致 innerHTML null 崩溃
- chatToggleAgent 添加防重入锁
- startNewChat 立即切换右栏 + selectChatSession 始终展开 agent
- sidebar 模型配置加载中不消失
- ESM cache-buster 覆盖所有 JS 依赖 + sidebar 模型加载修复
- ESM cache-buster regex 支持 ../ 路径
- 修复 ESM import 只读绑定赋值错误
- 删除 app.js 中未声明函数挂载 + 消除重复函数定义

#### 通知/弹窗（6 项）
- 修复 toast 进度条动画不生效
- dict 按钮缺失 + modal 宽度问题
- dict modal 按钮无法点击 — overlay 继承 pointer-events:none
- toast 通知不显示 — 将 window.toast 替换为 ESM import
- settings.js 中 window.showConfirm 改为 ESM import
- 统一 openImageLightbox/closeImageLightbox 到 toast.js

#### 配置/设置（5 项）
- api_update_config 写入 settings.json 后同步更新模块级变量
- 系统参数 auto-save 事件绑定时机错误
- 内联系统参数 auto-save 到 chat.js
- 修复 3 个同类问题 — DOMContentLoaded 时机/HTML onclick 引用缺失
- showInput 默认单行输入，multiline 参数控制多行

#### UI/UX 审计（4 项）
- CSS 分区标题格式导致浏览器跳过 :root 规则
- 侧边栏展开/折叠时 avatar 左边缘间距不一致
- 将 --z-base 等 CSS 变量从 html 块外移到块内
- UI/UX 审查修复 9 项 + UI/UX Pro Max 审查修复（P1/P2/P3/P5/P7/P8）

#### 其他修复（13 项）
- side 栏展开/折叠时头像顶部间距不一致
- CSS 审计修复 — 未定义变量、重复选择器、硬编码颜色
- 审计修复 — addDiscoveredModel window mount + z-index 标量统一
- 移除记忆页重复按钮 + refreshSessions 重复 mount
- 删除 sidebar.js 中重复的 renameChatSession 定义
- 清理 CSS 遗留重复 — legacy sidebar + md-code-block 简化版
- 弹窗按钮可用性修复 + settings.js 优化 + 死代码清理
- 优化 agent 属性文件 — 整合 Karpathy 编程哲学
- 数据库全量优化 — N+1 修复/批量写入/索引补齐/统一 schema
- 键盘可访问性 — onclick 按钮支持 Enter/Space 触发
- P1 catch 块添加用户可见反馈（8 处）
- P2 fetch 无 loading 添加按钮 disabled 状态（7 处）
- 删除系统升级功能 + 修复 error 状态清理 + 修复删除按钮 this 绑定

### 重构 (refactor) — 20 项

- **统一弹窗系统**：消除所有绕过 toast 的自建 modal，全部走 siper-notif
- **CSS 分区重排**：base → sidebar → layout → components → chat-base → pages → utility
- **HTML 简化**：内联 style 提取为 CSS class + 冗余 class 清理
- **HTML/CSS 结构优化**：空注释清理 + 冗余 div 清理 + CSS 分区注释
- **主题精简**：删除多预设主题，只保留默认主题
- **Agent 目录结构**：sessions/memory/skill 子目录，删除废弃 data/ 目录，skill 全局共享
- **数据库全量优化**：N+1 修复、批量写入、索引补齐、统一 schema
- **清理冗余数据**：迁移 skill_call_log，删除 skills/siper-coding/
- **头像上传简化**：移除重复上传逻辑，统一 HTML onchange 触发
- **消除重复函数**：agent-config.js 删除 loadGlobalModelsForAgent，dom.js 删除 toggleChatModelDropdown
- **统一 openImageLightbox**：迁移到 toast.js
- **消除 render 重复**：renderAgentModelSection/renderAgentModelsForAgent 合并 + 语言函数重命名
- **settings.js 优化**：ESM import 替代 window 全局引用
- **端口/日志级别迁移**：从 agent 设置页迁移到全局设置页
- **删除 auto-save-hint 元素**：全部移除
- **清理 CSS 遗留**：legacy sidebar + md-code-block 简化版
- **优化 agent 属性文件**：整合 Karpathy 编程哲学
- **简化 avatar upload**：添加 auto-save toast
- **会话数据库路径**：sessions.db → sessions/sessions.db

### 性能优化 (perf)

- transition: all → 明确属性名 + a11y role/aria-label

### 杂务 (chore)

- 清理不应上传的文件，完善 .gitignore
- 移除非 default agent 的 tracked 文件
- skills/ 整体从 git 移除，运行时自动创建
- 技能页面 API 防御性创建 skills/ 目录
- 版本号更新 0.1.0 → 0.1.1

### 无障碍 (a11y)

- onclick 按钮支持 Enter/Space 触发（WCAG 2.1）
- 所有 form 字段添加 label + aria-label
- 键盘导航支持

### 发布

- 版本号更新 0.1.0 → 0.1.1
- GitHub Release: https://github.com/gavin-jack/siper-agent/releases/tag/v0.1.1
- 孤儿分支精确上传 89 个发布文件

---

## v0.1.0 (2026-06-07)

首个正式版本发布。

### 后端（45 个 .py 文件）
- **Agent 核心**：agent.py — Agent 主循环（工具调用、多轮对话、流式输出）
- **LLM 客户端**：llm_client.py — OpenAI 兼容，重试、超时、流式
- **28 个内置工具**：文件操作、代码执行、搜索、浏览器、技能、记忆、TTS、图像生成等
- **技能系统**：自动加载、语义预筛选、上下文注入
- **会话管理**：SQLite + WAL、per-agent 隔离

### WebUI（27 个文件）
- 实时流式聊天（WebSocket）
- 智能体配置、全局设置、会话管理
- Token 统计图表（echarts）
- 主题系统（默认 + 自定义）
- 9 个管理页面（聊天/会话/配置/设置/主题/Token/日志/记忆/技能）

### 内置技能
- 代码审查、企业研究、文件操作

---

## v0.0.1 (2026-05-17 ~ 2026-06-07)

初始开发阶段，从 0 到 1 构建完整 AI Agent 框架。

### 架构演进
- **ESM 迁移**：从传统 script 标签迁移到 ES Module（5 个阶段：基础设施 → 简单页面 → 核心页面 → 子模块拆分 → CSS 模块化）
- **目录重构**：templates/ + src/ → js/ + css/，统一前端代码结构
- **Agent 目录结构迁移**：sessions.db → sessions/sessions.db，memory 独立子目录，skill 全局共享，删除废弃 data/ 目录
- **CSS 分区重排**：base → sidebar → layout → components → chat-base → pages → utility
- **主题精简**：删除多预设主题（dark/midnight/cyberpunk 等），只保留默认主题

### 核心功能
- **模型管理**：模型选择器自定义 dropdown、模型能力探测（vision/function_calling/reasoning/tts）、自动验证、能力标签同步
- **模型验证**：从 API 响应提取能力、手动触发验证、loading 状态显示
- **会话管理**：per-agent 会话隔离、乐观更新、展开状态保持、重命名、删除
- **Agent 管理**：卡片模式、属性文件（soul.md/agent.md/config.json）、头像上传、删除/新增弹窗
- **工具系统**：28 个内置工具、工具调用进度显示、工具结果截断
- **上下文管理**：Token 估算、上下文压缩（滑动窗口 + 历史摘要）、per-session 字典
- **Dict Modal**：结构化视图（回复信息/Token 用量/工具调用/技能信息）、代码模式切换、sticky header
- **统一通知系统**：toast/confirm/dict 合并为 siper-notif 体系
- **技能系统 v2**：自动加载、语义预筛选、上下文注入、调用日志数据库
- **数据库优化**：N+1 修复、批量写入、索引补齐、WAL 模式、统一 schema
- **Markdown 渲染**：标题样式（h1-h6）、表格渲染、代码块、列表分割、树形结构、box-drawing
- **TTS**：前端播放修复、音频播放器气泡条
- **ECharts 主题同步**：图表配色跟随系统主题
- **Hash 路由**：#/page 格式、前端测试
- **头像上传**：点击头像选图即上传、PIL 压缩为 webp、agent 识别修复
- **会话历史**：批量渲染、跳过 tool 消息、meta 数据传递
- **流式响应**：per-session 流式状态、跨 agent 保持、停止生成
- **安全**：path_safety、url_safety、用户输入 escapeHtml、API Key 脱敏

### UI/UX
- **侧边栏**：展开/折叠动画、底部按钮竖排、头像大小统一、缩放改为点击头像触发
- **消息布局**：时间在上按钮在下、用户消息复制/插入按钮、hover 底色 + 操作按钮渐显
- **输入框**：实时上下文 token 估算、工具栏（模型选择/附件上传）、auto-resize
- **Token 页面**：每日趋势图、模型统计、上下文窗口百分比
- **技能页面**：调试器顶部 + 卡片网格布局
- **正在思考面板**：工具调用进度、流式完成后隐藏
- **波浪背景**：跨会话/跨 agent 保持、选中/未选中颜色区分
- **深色主题**：毛玻璃效果、按钮光晕、输入框发光、页面过渡动画
- **可拖拽面板**：侧边栏可拖拽调整宽度

### 无障碍
- onclick 按钮支持 Enter/Space 触发（WCAG 2.1）
- 所有 form 字段添加 label + aria-label
- 键盘导航支持

### 性能优化
- CSS 去重：删除 722 行重复规则（43.8% 减少）
- transition: all → 明确属性名
- 流式 Markdown 节流
- 会话列表增量更新
- 批量渲染避免阻塞主线程
- 升级检测改为后台线程缓存
- 模型验证超时保护（20s→60s 后端，25s→90s 前端）
- gzip 压缩静态文件
- ESM cache-buster 覆盖所有 JS 依赖

### 项目工具
- setup.py 打包配置
- requirements.txt 依赖管理
- create_deploy.py 部署脚本
- shorten_session_ids.py 会话 ID 缩短
- 测试程序（LLM 错误检测、WS 连接测试）

### 文档
- README.md 完整项目说明
- LICENSE (MIT)
