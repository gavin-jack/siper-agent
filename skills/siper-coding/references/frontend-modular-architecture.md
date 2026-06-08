# 前端模块化架构（v0.4.19+）

## 背景

v0.4.19 将 app.js（4055行/161KB）拆分为 15 个独立 JS 文件，提升可维护性。

## 文件结构

```
web/static/pages/
├── core.js           # 核心模块：i18n、全局状态、导航、WebSocket、工具函数
├── page-chat.js      # 聊天页面：消息渲染、图片上传、工具调用展示
├── page-sessions.js  # 会话管理
├── page-tasks.js     # 定时任务
├── page-agent.js     # 智能体配置（合并了原 app.js 中两处 agent 代码）
├── page-skills.js    # 技能列表
├── page-logs.js      # 日志查看、过滤、分页
├── page-token.js     # Token 统计
├── page-settings.js  # 全局设置
├── page-gateway.js   # 网关控制（只保留新版代码）
├── page-files.js     # 文件浏览器
├── page-meeting.js   # 会议室
├── page-theme.js     # 外观设置
├── page-memory.js    # 记忆管理
└── main.js           # 初始化入口（DOMContentLoaded 后调用 init）
```

## 加载顺序

index.html 中 script 标签顺序（重要）：

1. core.js（最先加载，提供全局工具和状态）
2. page-*.js 按字母/功能顺序（不互相依赖）
3. main.js（最后加载，初始化入口）

## 拆分原则

- 原 app.js 中 `// ===== Section Name =====` 注释标记了各页面边界
- 每个页面的所有函数（含事件处理、渲染、API 调用）放入对应的 page-*.js
- 跨页面共享的工具函数（formatBytes、escapeHtml、showToast 等）放入 core.js
- 全局变量（state、ws、i18n）定义在 core.js，其他文件通过全局作用域访问
- 无需修改函数代码，仅物理拆分到不同文件

## 验证方法

1. 所有文件 HTTP 200：`for f in web/static/pages/*.js; do curl -s -o /dev/null -w "%{http_code}" http://localhost:7240/static/pages/$(basename $f); done`
2. 浏览器控制台零 JS 错误
3. 页面切换功能正常（点击侧边栏各菜单）
4. 聊天发送消息正常

## 注意事项

- 修改 page-*.js 不需要重启服务，浏览器硬刷新即可
- 修改 core.js 中的全局状态结构可能影响所有页面
- 新增页面需同步更新 index.html 的 script 标签和 core.js 的导航注册
- 原 app.js 保留为备份引用，不再维护

## ⚠️ app.js 未被 index.html 引用（关键陷阱）

**app.js 不在 index.html 的 `<script>` 标签列表中，其定义的函数不会被浏览器加载。**

验证方法：
```javascript
// 浏览器控制台检查已加载的 script
document.querySelectorAll('script[src]').forEach(s => console.log(s.src));
```

当前实际加载的 JS 文件：core.js → page-*.js（按 index.html 中的顺序）→ main.js

**影响：**
- app.js 中定义的函数（如 `showConfirm`、`cancelConfirm`、`execConfirm` 等）在浏览器中不可用
- 如果 core.js 中定义了同名函数，app.js 中的版本不会覆盖它（因为 app.js 根本没加载）
- 如果 core.js 中删除了某个函数，不能假设 app.js 中的版本会兜底

**修复模式：**
- 如果需要在浏览器中使用的函数，必须在 core.js 或某个 page-*.js 中定义
- 删除 core.js 中的函数前，确认没有 app.js 兜底（app.js 不加载！）
- 如需从 app.js 迁移函数到 core.js，直接复制函数体即可
