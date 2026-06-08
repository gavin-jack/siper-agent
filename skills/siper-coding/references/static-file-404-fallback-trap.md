# SPA 静态文件路由 Fallback 陷阱

## 问题描述

SiPer 的静态文件路由（`/static/`）在处理不存在的文件时，没有返回 404，而是 fallthrough 到页面渲染逻辑，返回了 `index.html`（SPA fallback 行为）。

## 影响

当 `index.html` 引用了不存在的 JS 文件（如 `page-agent.js`）时：
1. 浏览器请求 `/static/pages/page-agent.js`
2. SiPer 返回 `index.html`（32KB）作为响应
3. 浏览器尝试将 HTML 内容解析为 JS，导致 JS 解析崩溃
4. 页面完全空白，所有 JS 功能失效，浏览器无响应

## 诊断方法

```bash
# 检查静态文件是否返回了 index.html（200 = 有问题，404 = 正常）
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9724/static/pages/missing.js

# 检查 index.html 引用的所有 JS 文件是否实际存在
for f in $(grep -oP 'src="/static/pages/\K[^"]+' webui/templates/index.html); do
  [ -f "webui/static/pages/$f" ] && echo "OK: $f" || echo "MISSING: $f"
done
```

## 修复方案

在 `siper_web.py` 的 `/static/` 路由处理中，文件不存在时返回 404：

```python
if resolved and str(resolved).startswith(str(static_root)) and resolved.is_file():
    # ... serve file ...
    return
# Static file not found — return 404, do NOT fall through to index.html
body_404 = b"Not Found"
headers_404 = [
    "HTTP/1.1 404 Not Found",
    "Content-Type: text/plain",
    f"Content-Length: {len(body_404)}",
    "Connection: close",
    "",
    "",
]
writer.write("\r\n".join(headers_404).encode("utf-8") + body_404)
await writer.drain()
writer.close()
return
```

## 预防措施

1. **新建 page-*.js 文件时**，必须同步在 `index.html` 中添加对应的 `<script>` 标签
2. **删除 page-*.js 文件时**，必须同步删除 `index.html` 中的 `<script>` 标签
3. **定期运行文件存在性检查**（见诊断方法）
4. **不要依赖 SPA fallback 来处理静态文件**——静态文件应该精确匹配，不存在就是 404

## 历史案例

- **2026-05-27（v20260803q）**: `page-agent.js` 被 `index.html` 引用但文件不存在。SPA fallback 返回 index.html 作为 JS 内容，导致浏览器崩溃。修复：创建 `page-agent.js` 占位文件 + 静态文件路由返回 404。
