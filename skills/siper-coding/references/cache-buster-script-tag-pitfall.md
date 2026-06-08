# cache-buster 正则替换 HTML 标签完整性陷阱

## 问题描述

siper_web.py 启动时将 index.html 加载到内存，通过正则替换为 script 标签注入基于文件 mtime 的 cache-buster。

## Bug 模式

正则 `r'<script src="(/static/pages/[^"]+)"></script>'` 匹配整个 script 标签（含闭合部分），但替换返回值 `f'<script src="{path}?v={mtime}">'` 缺少 `</script>`，导致：

1. 所有 page-*.js 的闭合标签被吃掉
2. HTML 解析器将所有 script 标签合并
3. 浏览器只加载 core.js，其余 14 个 JS 文件全部失败
4. sendMessage/addMsg 等函数全部 undefined

## 正确写法

```python
return f'<script src="{js_path}?v={int(os.path.getmtime(full))}"></script>'
```

## 通用规则

**正则替换 HTML 标签时，替换结果必须是完整的、可独立解析的 HTML。** 正则替换的是整个匹配区域，不是只替换开头部分。

## 验证方法

重启后浏览器控制台执行：`Array.from(document.querySelectorAll('script[src]')).length`，应返回 15。

---

# CSS Cache-Buster 缺失陷阱（v0.7.3 修复）

## 问题描述

siper_web.py 只给 `/static/pages/*.js` 注入了 `?v=` 版本戳，但 `<link href="/static/style.css">` 没有版本戳。浏览器缓存旧 CSS 导致：

1. 修改 style.css 后浏览器不拉取新版本
2. 页面渲染异常（如 PRE 标签包裹全部内容、样式错乱）
3. `curl` 返回正确 HTML 但浏览器显示 broken layout

## 症状

- `curl -s http://127.0.0.1:9724/ | grep style.css` 没有 `?v=` 参数
- 浏览器 `document.body.children.length` 返回 1，内容是 PRE 标签
- `document.querySelectorAll('script[src]')` 返回空（JS 没加载是因为 HTML 解析失败）

## 修复

在 `_render_index()` 中，在 JS 正则替换之后添加 CSS 版本注入：

```python
css_path = PROJECT_ROOT / "webui" / "static" / "style.css"
if css_path.exists():
    html = html.replace(
        'href="/static/style.css"',
        f'href="/static/style.css?v={int(os.path.getmtime(css_path))}"',
    )
```

## 验证方法

1. `curl -s http://127.0.0.1:9724/ | grep style.css` 应显示 `style.css?v=XXXXXXXX`
2. 浏览器 Ctrl+Shift+R 硬刷新后，`getComputedStyle(document.body).display` 不应是 `'block'`（正常应为 flex/grid）
3. `document.querySelector('.sidebar')` 应返回非 null

---

# ⚠️ Hardcoded ?v= 绕过 mtime 替换陷阱（v0.9.8 发现）

## 问题描述

`siper_web.py` 的 `_render_index()` 使用正则替换为 `<script>` 标签注入 mtime 版本号：

```python
html = _re.sub(r'<script src="(/static/pages/[^\"]+)"></script>', _js_mtime, html)
```

**关键**：正则匹配的是**不带查询参数**的 script 标签（`[^"]+` 匹配到 `>` 为止，遇到 `?` 也继续匹配，但要求结尾是 `"></script>"`）。

**陷阱**：如果在 `index.html` 模板中硬编码了 `?v=2`（或其他版本号），如：
```html
<script src="/static/pages/page-agent-config.js?v=2"></script>
```

正则**仍然匹配**这个 URL（因为 `[^"]+` 会匹配 `page-agent-config.js?v=2`），但替换结果变成：
```html
<script src="/static/pages/page-agent-config.js?v=2?v=1779097970"></script>
```

这会产生**双版本号**的无效 URL，浏览器请求时服务器可能忽略第二个 `?v=`，导致永远加载旧版。

**实际案例（v0.9.8）**：`?v=2` 被硬编码在模板中，正则替换后变成 `?v=2?v=1779097970`，但 browser tool 显示的 script.src 仍然是 `?v=2`，说明正则匹配行为与预期不同——实际上正则 `[^"]+` 确实会匹配带 `?` 的 URL，但替换后的结果取决于 `_js_mtime` 函数的返回值。如果 `_js_mtime` 直接拼接 `?v=mtime`，结果就是 `?v=2?v=1779097970`。

**更安全的正则**应该排除已有 `?v=` 的情况，或者模板中永远不硬编码版本号。

## 修复

**方案 A（推荐）**：模板中永远不写 `?v=`，让服务器自动注入：
```html
<!-- ✅ 正确 -->
<script src="/static/pages/page-agent-config.js"></script>

<!-- ❌ 错误 — 硬编码版本号 -->
<script src="/static/pages/page-agent-config.js?v=2"></script>
```

**方案 B**：修改正则，跳过已有 `?v=` 的标签：
```python
# 匹配不带查询参数的 script 标签
html = _re.sub(r'<script src="(/static/pages/[^"?]+)"></script>', _js_mtime, html)
```

## 验证方法

1. `grep -n '\?v=' webui/templates/index.html` — 应该无结果（没有硬编码版本号）
2. `curl -s http://127.0.0.1:9724/ | grep -o 'page-agent-config[^"]*'` — 应显示 `page-agent-config.js?v=XXXXXXXX`（mtime 值）
3. 修改 JS 文件后 `touch` 更新 mtime，重启服务，curl 检查版本号是否变化

## 规则

**在 `index.html` 中，永远不要给 `/static/pages/*.js` 或 `/static/style.css` 硬编码 `?v=` 版本号。** 服务器的 mtime 机制会自动注入。硬编码会导致版本号永远不变，浏览器缓存无法更新。
