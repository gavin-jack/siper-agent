# SiPer v1.0.0-origin 修复方案 v4 — Phase 2

> 制定日期：2026-05-19
> 基于 v3（origin-fix-plan-v3.md）Phase 1 完成后的迭代
> 原则：保留优于原方案、基于内存和数据库、代码结构清晰、删除前验证

---

## 一、Phase 1 完成后的当前状态

### 已完成的修改

| 修改 | 状态 |
|------|------|
| 删除 loadChatAgents() / chatLoadAllSessions() | ✅ |
| 删除 renderAgentPage() / loadAgentsForConfig() / _agentConfigHtmlTemplate | ✅ |
| selectChatSession HTTP 兜底 300ms | ✅ |
| switchToAgent 移除 loadChatAgents 调用 | ✅ |
| 6 个文件的 loadChatAgents 引用全部清理 | ✅ |
| 浏览器控制台 0 错误 | ✅ |

### 当前文件行数

| 文件 | 行数 | 目标 | 说明 |
|------|------|------|------|
| sidebar.js | 498 | < 300 | 会话列表 + 搜索 + 右键菜单 + CRUD |
| state.js | 228 | < 180 | 状态变量 + getter/setter + legacy aliases |
| pages/chat.js | 1017 | < 200 | 入口 + 页面路由 + 9 个页面渲染 |
| agent-config.js | 795 | < 500 | 智能体配置面板 |
| message.js | 400 | 保持 | 消息渲染（已合理） |
| input.js | 432 | < 300 | 输入框 + 模型选择 + 文件上传 |
| stream.js | 279 | 保持 | 流式处理（已合理） |
| session.js | 135 | 保持 | 会话管理（已合理） |
| core.js | 126 | 保持 | WS 连接（已合理） |
| renderer.js | 228 | 保持 | 统一渲染（已合理） |

---

## 二、Phase 2 问题清单

### P1 — pages/chat.js 1017 行，职责过重

**现象**：`pages/chat.js` 是"薄入口"，但实际包含：
- `renderChatPage()` — 聊天页渲染（~110行）
- `renderTasksPageChat()` — 任务页渲染
- `renderSkillsPageChat()` — 技能页渲染
- `renderPluginsPageChat()` — 插件页渲染
- `renderTokenPageChat()` — Token 页渲染
- `renderSettingsPageChat()` — 全局设置页渲染
- `renderModelSettingsPageChat()` — 模型设置页渲染
- `renderLogsPageChat()` — 日志页渲染
- `renderMonitorPageChat()` — 监控页渲染
- 9 个 `window.xxx` 挂载
- `CHAT_PAGES` 常量
- `Input.bindChatInput()` 顶层调用

**问题**：
1. 9 个页面渲染函数全在一个文件，每次修改都有破坏其他页面的风险
2. 页面渲染逻辑独立于入口/路由，应该分离
3. `chatSwitchPage()` 的 switch 分支是页面路由的核心，应该精简

**方案**：拆分为独立文件

```
pages/chat.js              — 入口 + 路由表 + window 挂载（~80行）
pages/chat-pages/chat.js         — renderChatPage()
pages/chat-pages/tasks.js        — renderTasksPageChat()
pages/chat-pages/skills.js       — renderSkillsPageChat()
pages/chat-pages/plugins.js      — renderPluginsPageChat()
pages/chat-pages/token.js         — renderTokenPageChat()
pages/chat-pages/settings.js     — renderSettingsPageChat()
pages/chat-pages/model-settings.js — renderModelSettingsPageChat()（从 pages/model-settings.js 迁移）
pages/chat-pages/logs.js         — renderLogsPageChat()
pages/chat-pages/monitor.js      — renderMonitorPageChat()
```

**风险**：中。需要更新 import 路径和 `chatSwitchPage` 的 switch 分支。

### P2 — state.js 228 行，legacy aliases 过多

**现象**：20+ 个 `_xxx` 变量 + getter/setter + legacy aliases。有些可能已无消费者。

**清理规则**：
1. grep 每个变量的消费者
2. 只保留有消费者的变量
3. 删除无消费者的变量和 alias

**注意**：state.js 的变量被大量文件引用，必须精确验证。

### P3 — input.js 432 行，职责过多

**现象**：包含输入框绑定、模型选择下拉、文件上传、语音输入、emoji picker 等。

**方案**：拆分为：
```
chat/input.js          — 输入框绑定 + 发送逻辑（~200行）
chat/input-models.js   — 模型选择下拉（~100行）
chat/input-files.js    — 文件上传 + 预览（~100行）
```

### P4 — agent-config.js 795 行，配置面板过重

**现象**：包含 agent 列表选择、基本设置、模型配置、文件编辑、记忆配置、限制设置等。

**方案**：拆分为：
```
pages/agent-config.js         — 配置面板入口 + 路由（~200行）
pages/agent-config-basic.js   — 基本设置 + 限制（~200行）
pages/agent-config-models.js  — 模型配置（从 agent-models.js 迁移，~150行）
pages/agent-config-files.js   — 文件编辑（soul.md/agent.md/memory.md，~150行）
```

### P5 — message.js 400 行，消息渲染可优化

**现象**：包含消息渲染、工具调用渲染、思考面板消息、上下文信息、markdown 渲染等。

**当前合理**：400 行不算过分，暂不拆分，但需要清理冗余函数。

---

## 三、Phase 2 详细计划

### Step 2.1: pages/chat.js 拆分（P1）

**当前**：1017 行
**目标**：< 100 行（入口 + 路由表）

**拆分方案**：

1. 创建 `pages/chat-pages/` 目录
2. 迁移 9 个 renderXxxPageChat 函数到独立文件
3. pages/chat.js 只保留：
   - `CHAT_PAGES` 常量
   - `chatSwitchPage()` 路由函数
   - `Input.bindChatInput()` 顶层调用
   - `window.xxx` 挂载

**具体迁移**：

```
pages/chat-pages/chat.js         ← renderChatPage(container, skipSidebar)
pages/chat-pages/tasks.js        ← renderTasksPageChat(container)
pages/chat-pages/skills.js       ← renderSkillsPageChat(container)
pages/chat-pages/plugins.js      ← renderPluginsPageChat(container)
pages/chat-pages/token.js         ← renderTokenPageChat(container)
pages/chat-pages/settings.js     ← renderSettingsPageChat(container)
pages/chat-pages/model-settings.js ← renderModelSettingsPageChat(container)
pages/chat-pages/logs.js         ← renderLogsPageChat(container)
pages/chat-pages/monitor.js      ← renderMonitorPageChat(container)
```

**验证**：
1. 切换 9 个页面，确认渲染正常
2. 控制台无 JS 错误
3. 聊天页发送消息正常

### Step 2.2: state.js 清理 legacy aliases（P2）

**当前**：228 行
**目标**：< 200 行

**清理步骤**：
1. 列出所有 `_xxx` 变量
2. grep 每个变量的消费者（排除 state.js 自身和 getter/setter）
3. 删除无消费者的变量
4. 删除对应的 getter/setter
5. 删除对应的 import/export

**注意**：
- sidebar.js 从 state.js import 了大量变量（line 3-11），修改 import 时需要同步
- 删除变量后需要更新所有 import 该变量的文件

### Step 2.3: input.js 拆分（P3）

**当前**：432 行
**目标**：input.js < 250 行

**拆分方案**：
```
chat/input.js          — 核心输入 + 发送逻辑
chat/input-models.js   — 模型选择下拉（导出 loadChatModels/toggleChatModelDropdown）
```

### Step 2.4: agent-config.js 拆分（P4）

**当前**：795 行
**目标**：< 400 行

**拆分方案**：
```
pages/agent-config.js         — 配置面板入口 + tab 切换
pages/agent-config-basic.js   — 基本设置（名称/头像/限制）
pages/agent-config-files.js   — 文件编辑（soul.md/agent.md/memory.md）
```

---

## 四、执行顺序

```
Step 2.1: pages/chat.js 拆分（影响最大，先做）
  → 创建 pages/chat-pages/ 目录
  → 迁移 9 个页面渲染函数
  → 精简 pages/chat.js
  → 验证：9 个页面切换正常 + 控制台 0 错误

Step 2.2: state.js 清理（风险最高，第二步）
  → 逐变量 grep 验证消费者
  → 删除无消费者变量
  → 验证：所有页面功能正常 + 控制台 0 错误

Step 2.3: input.js 拆分
  → 拆出 input-models.js
  → 验证：模型选择 + 发送消息正常

Step 2.4: agent-config.js 拆分
  → 拆出 agent-config-basic.js + agent-config-files.js
  → 验证：配置面板所有 tab 正常
```

---

## 五、保留清单（不动）

| 文件 | 行数 | 保留原因 |
|------|------|---------|
| core.js | 126 | WS 连接 + 消息分发，已合理 |
| renderer.js | 228 | 统一 DOM 渲染，已合理 |
| stream.js | 279 | 流式处理，已合理 |
| session.js | 135 | 会话管理，已合理 |
| nav.js | 82 | 页面导航，已合理 |
| thinking.js | 87 | 思考面板，已合理 |
| badge.js | 49 | 徽章/指示器，已合理 |
| lang.js | 48 | 国际化，已合理 |
| toast.js (chat/) | 17 | Toast 提示，已合理 |

---

## 六、预期结果

| 文件 | 当前 | Phase 2 后 | 减少 |
|------|------|-----------|------|
| pages/chat.js | 1017 | ~80 | -937 (-92%) |
| chat/sidebar.js | 498 | 498 | 不变（Phase 1 已精简） |
| chat/state.js | 228 | ~180 | -48 (-21%) |
| chat/input.js | 432 | ~200 | -232 (-54%) |
| pages/agent-config.js | 795 | ~300 | -495 (-62%) |
| **新增文件** | 0 | ~1200 | 拆分出的新文件 |
| **净减少** | | | **~1500 行** |

Phase 2 完成后，前端代码结构清晰，每个文件职责单一，维护成本大幅降低。
