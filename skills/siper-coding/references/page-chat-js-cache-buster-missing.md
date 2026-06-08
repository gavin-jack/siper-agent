# page-chat.js 无 Cache-Buster 陷阱

## 问题描述

`index.html` 中 `core.js` 有 `?v=` 版本号（通过 siper_web.py mtime 自动注入），但 `page-chat.js` **没有版本号参数**：

```html
<!-- core.js 有版本号 -->
<script src="/static/pages/core.js?v=20260523d"></script>

<!-- page-chat.js 无版本号 -->
<script src="/static/pages/page-chat.js"></script>
```

## 后果

修改 `page-chat.js` 后，浏览器可能持续使用缓存的旧版本，导致：
1. 修复看起来"没有生效"
2. 用户硬刷新后才能看到修改
3. 如果用户没有硬刷新，bug 会持续存在

## 修复方案

**方案 A（推荐）**：在 `index.html` 中为 `page-chat.js` 也添加 `?v=` 版本号，并确保 siper_web.py 的 mtime 替换正则覆盖所有 page-*.js 文件。

验证 siper_web.py 的正则是否覆盖 page-chat.js：
```python
# 当前正则（只匹配 /static/pages/*.js）
r'<script src="(/static/pages/[^"]+)"></script>'
```

这个正则**应该**匹配 page-chat.js（因为它在 `/static/pages/` 下）。检查 curl 输出确认：
```bash
curl -s http://127.0.0.1:9724/ | grep page-chat
# 期望: /static/pages/page-chat.js?v=XXXXXXXX
```

**方案 B**：如果 mtime 替换没有覆盖 page-chat.js，手动在 index.html 中添加版本号并随修改更新。

## 诊断方法

1. 修改 page-chat.js 后，用户报告"没生效"
2. `curl -s http://1.0.0.1:9724/ | grep page-chat` 检查是否有 `?v=`
3. 浏览器 DevTools Network 面板查看 page-chat.js 的响应头 `Cache-Control`
4. 浏览器控制台 `fetch('/static/pages/page-chat.js').then(r=>r.text()).then(t=>console.log(t.substring(0,100)))` 检查实际加载的内容

## 相关规则

- 修改任何 `page-*.js` 后，确认 `curl -s http://localhost:9724/ | grep <filename>` 中的版本号已变化
- 如果版本号没变，说明 mtime 替换正则没有匹配到该文件
- 用户硬刷新（Ctrl+Shift+R）是最可靠的验证方式
