# page-agent.js 文件缺失导致浏览器崩溃

## 问题描述

`index.html` 中引用了 `/static/pages/page-agent.js`，但该文件长期不存在。

## 根因

SiPer 的静态文件路由对不存在的文件返回 `index.html`（SPA fallback），而非 404。浏览器将 HTML 内容当作 JS 解析，导致崩溃。

## 修复

1. 创建 `page-agent.js` 占位文件（最小化内容）
2. 在 `siper_web.py` 静态文件路由中添加 404 返回（参见 `static-file-404-fallback-trap.md`）

## 占位文件内容

```javascript
// ===== Agent Page =====
// Agent profile configuration page
// (Placeholder - agent config is handled by page-agent-config.js)

console.log('[page-agent] loaded');
```

## 预防措施

- 新建 `page-*.js` 时，必须同步在 `index.html` 添加 `<script>` 标签
- 删除 `page-*.js` 时，必须同步删除 `index.html` 中的 `<script>` 标签
- 定期检查：`for f in $(grep -oP 'src="/static/pages/\K[^"]+' webui/templates/index.html); do [ -f "webui/static/pages/$f" ] && echo "OK: $f" || echo "MISSING: $f"; done`
