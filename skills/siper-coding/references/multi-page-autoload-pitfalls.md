# 多页面架构自动加载陷阱

## 问题：独立页面模式下数据不自动加载

**现象**：进入 sessions/logs/models 等页面后，主内容为空，点击"刷新"按钮后才显示数据。

**根因**：SPA 模式下 `navigateToPage()` 在切换页面时触发刷新函数，但独立页面模式每个页面独立加载，没有页面切换机制，刷新函数不会被自动调用。

## 解决方案

每个需要从 API 加载数据的页面 JS 文件末尾添加：

```javascript
// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshXxx);
```

## 已修复的页面

| 页面 | JS 文件 | 自动加载函数 |
|------|---------|-------------|
| 会话管理 | page-sessions.js | refreshSessions |
| 日志查看 | page-logs.js | refreshLogs |
| 模型管理 | page-models.js | refreshModelsPage |
| 定时任务 | page-tasks.js | refreshTasks |
| 记忆管理 | page-memory.js | refreshMemoryPage + refreshMemoryConfig |
| 技能管理 | page-skills.js | refreshSkills |
| Token 用量 | page-token.js | refreshTokenStats |
| 网关控制 | page-gateway.js | refreshGateway |
| 智能体配置 | page-agent.js | refreshAgentConfig |
| 全局设置 | page-settings.js | refreshGlobalSettings |

## 不需要自动加载的页面

- **page-chat.js** — 数据通过 WS connected 消息触发 loadRecentSession
- **page-theme.js** — 纯本地主题编辑，无远程数据

## 相关陷阱

- #121: 共享工具函数必须放在 core.js
- #123: addMsg 是 chat-only 函数
- #117: 多页面路由初始化需要 meta 标签
- #120: nav-item 点击必须整页跳转
