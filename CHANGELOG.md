# Changelog

> 所有版本变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)。

---

## v0.1.5 (2026-07-30)

### 新功能 (feat)

- **14 项前端动效**：消息气泡入场（slide up + fade in）、流式光标（闪烁 ▊）、打字指示器弹性圆点（scale bounce）、发送按钮弹性回弹（cubic-bezier 回弹）、连接状态脉冲（box-shadow 扩散）、代码块左侧边框展开、工具调用折叠动画、Toast 滑入/滑出、输入框聚焦光环（box-shadow 扩散）、页面切换淡入、气泡 hover 上浮、滚动按钮弹性入场、会话列表错开入场（stagger 40ms）、prefers-reduced-motion 全局支持
- **会话 item UI 优化**：ID 显示 12 字符、时间显示、× 按钮 active 状态显示、左右 35px 留白
- **历史消息补全 meta 信息**：token 用量、模型名、处理时间、工具调用、技能使用
- **快速重启脚本**：`siper_restart.sh`，1 秒重启，替代手动 kill + 等待
- **前端消息渲染统一**：stream_end 复用 DOM，避免移除重建闪烁

### Bug 修复 (fix)

- **会话排序竞态**：`renderMiddleList` 去掉 debounce，改为同步执行，修复 `updateSessionPreview` 和 `chatLoadAllSessions` 竞态导致排序不稳定
- **波浪背景不停止**：`selectChatSession` 只在 `_chatStreamAcc` 非空（仍在 streaming）时才开启 badge
- **回复结束 thinking panel 未隐藏**
- **会话排序字段更新**
- **非 chat 路径波浪停止**
- **前端消息渲染统一 + 后端 import 优化**
- **`updateSessionPreview` 同步更新 DOM 时间显示**

### 重构 (refactor)

- 前端消息渲染统一：stream_end 路径和历史消息路径共享 DOM 更新逻辑
- 后端 import 优化

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

（详见 README.md）

### 重构 (refactor) — 20 项

（详见 README.md）

---

## v0.1.0 (2026-06-07)

首个正式版本发布。

- **后端**：agent.py + llm_client.py + 28 个工具 + 技能系统 + 会话管理
- **WebUI**：27 个文件，流式聊天、配置管理、Token 统计、主题系统、9 个管理页面
- **内置技能**：代码审查、企业研究、文件操作
