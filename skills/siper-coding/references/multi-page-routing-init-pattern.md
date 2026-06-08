# 多页面路由初始化模式

## 问题背景

将 SPA 架构拆分为多页面后，`core.js` 的 `DOMContentLoaded` 事件仅依赖 URL hash 判断当前页面：

```javascript
const pgHash = location.hash.slice(1);
if (pgHash && pgHash !== 'chat') {
    navigateToPage(pgHash, true);
} else {
    // 默认显示 chat
}
```

独立页面（如 `/models`）访问时 URL 无 hash，`pgHash` 为空字符串，条件为 false，执行 else 分支默认显示 chat 页面，导致所有非 chat 页面主内容区域空白。

## 症状

- 访问 `/models`、`/tasks` 等独立页面时只显示侧边栏
- 主内容区域完全空白
- `document.querySelector('.page')` 的 `display` 为 `none`
- `.page` 元素没有 `active` 类

## 根因

SPA 架构中页面通过 JS 切换，URL 不变（始终为 `/`），hash 用于记录状态。独立页面 URL 变化（如 `/models`），但 JS 初始化逻辑未适配——`location.hash` 始终为空。

## 修复方案

### 1. 后端：在 `_base.html` 中添加页面元数据

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }} - Siper AI Agent</title>
    <meta name="current-page" content="{{ page }}">
    <link rel="stylesheet" href="/static/style.css">
</head>
```

`page` 变量由 `_render_page()` 从 `_PAGE_ROUTES` 映射中获取。

### 2. 前端：修改 `core.js` 的 `DOMContentLoaded` 逻辑

```javascript
const metaPage = document.querySelector('meta[name="current-page"]')?.content;
const pgHash = location.hash.slice(1);
// 优先从 meta 标签获取当前页面（独立页面），其次从 hash 获取（SPA）
const pageToShow = metaPage || (pgHash && pgHash !== 'chat' ? pgHash : null);

if (pageToShow) {
    navigateToPage(pageToShow, true);
} else if (pgHash && pgHash !== 'chat') {
    navigateToPage(pgHash, true);
} else {
    // No hash or hash is 'chat': show chat page
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const chatNav = document.querySelector('.nav-item[data-page="chat"]');
    if (chatNav) chatNav.classList.add('active');
    document.getElementById('page-chat').classList.add('active');
    currentPage = 'chat';
}
```

## 验证步骤

1. 访问每个独立页面 URL（`/models`、`/tasks`、`/memory` 等）
2. 确认主内容区域正常显示
3. 确认侧边栏对应 nav-item 高亮（`active` 类）
4. 浏览器控制台零 JS 错误
5. 测试 SPA 兼容：访问 `/#sessions` 带 hash 的 URL，确认 hash 路由仍正常工作

## 设计原则

- **meta 标签优先**：独立页面有明确的页面标识，应优先使用
- **hash 兼容 SPA**：保留 hash 路由支持，确保 SPA 备份和深度链接可用
- **默认行为不变**：无 meta 无 hash 时默认显示 chat，保持向后兼容

## 相关文件

- `_base.html`：添加 `<meta name="current-page">`
- `core.js`：修改 `DOMContentLoaded` 初始化逻辑
- `siper_web.py`：`_render_page()` 传递 `page` 模板变量

## 参考

- 陷阱 #117（siper-maintenance SKILL.md）
- HTML 模板拆分模式（siper-maintenance SKILL.md 第 6 节注意事项）
