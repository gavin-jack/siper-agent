# JS 跨文件变量声明与静态文件缓存陷阱

## 问题：跨文件 `let`/`const` 重复声明导致 SyntaxError

### 现象
- 浏览器控制台 `typeof addMsg` 返回 `undefined`，但函数确实在 page-chat.js 中定义
- `browser_console` 显示异常但 message 为空字符串
- 页面功能完全失效（如聊天发送按钮点击无响应）

### 根因
当多个 JS 文件通过 `<script>` 标签加载到同一 HTML 页面时，它们共享同一个全局作用域。如果两个文件都在顶层（非函数内部）用 `let` 或 `const` 声明了同名变量：

```javascript
// core.js 第 1251 行
let agentAvatarUrl = '/api/avatar';

// page-chat.js 第 4 行
let agentAvatarUrl = '/api/avatar';  // SyntaxError!
```

浏览器抛出 `SyntaxError: Identifier 'agentAvatarUrl' has already been declared`，导致**整个 page-chat.js 文件**执行失败，其中定义的所有函数（`addMsg`、`sendMessage`、`getAvatarHtml` 等）都变为 `undefined`。

### 排查步骤
1. 浏览器控制台检查关键函数：`typeof addMsg`、`typeof sendMessage`
2. 如果为 `undefined`，用 `fetch` 强制加载并执行：
   ```javascript
   fetch('/static/pages/page-chat.js', {cache:'no-store'})
     .then(r => r.text())
     .then(t => { try { eval(t); } catch(e) { console.error(e.message); } })
   ```
3. 检查是否有跨文件的 `let`/`const` 重复声明

### 修复原则
- 每个共享变量只在一个 JS 文件中声明（建议统一在 core.js 中）
- 其他文件直接使用，不重复声明
- 用脚本扫描跨文件重复：
  ```python
  import os, re
  declarations = {}
  for fname in os.listdir('webui/static/pages/'):
      if not fname.endswith('.js'): continue
      for i, line in enumerate(open(f'webui/static/pages/{fname}'), 1):
          if line == line.lstrip():  # top-level only
              m = re.match(r'^(let|const|var)\s+(\w+)', line.strip())
              if m:
                  key = f"{m.group(1)} {m.group(2)}"
                  declarations.setdefault(key, []).append(f"{fname}:{i}")
  for key, locs in declarations.items():
      if len(locs) > 1: print(f"DUPLICATE: {key} -> {locs}")
  ```

---

## 问题：静态文件缓存导致 JS 更新不生效

### 现象
- 修复了 JS 文件中的 bug，刷新页面后问题依旧
- 浏览器仍在使用缓存的旧版本 JS 文件

### 根因
siper_web.py 的静态文件服务设置了 `Cache-Control: public, max-age=86400`（24小时缓存）。浏览器在缓存过期前不会重新请求文件。

### 修复方案（双重保障）

#### 方案 1：区分缓存策略
在 siper_web.py 的静态文件服务中：
```python
# JS/CSS: no cache; images/fonts: 1 day
cache_hdr = "Cache-Control: public, max-age=86400" \
    if ct.startswith("image/") or ct.startswith("font/") \
    else "Cache-Control: no-cache, must-revalidate"
```

#### 方案 2：Cache-Buster（mtime 版本号）
在 siper_web.py 启动加载 index.html 到内存时，自动注入版本号：

```python
import re as _re, os as _os

def _js_mtime(match):
    js_path = match.group(1)
    full = PROJECT_ROOT / "webui" / js_path.lstrip("/")
    if full.exists():
        return f'<script src="{js_path}?v={int(_os.path.getmtime(full))}">'
    return match.group(0)

html_content = _re.sub(
    r'<script src="(/static/pages/[^"]+)"></script>',
    _js_mtime, html_content
)
```

效果：`/static/pages/core.js` → `/static/pages/core.js?v=1778773238`

每次修改 JS 文件后 mtime 变化，浏览器自动获取新版本。

### 注意事项
- 修改 index.html 后仍需重启服务（HTML 在启动时加载到内存）
- 修改 CSS/JS 不需要重启服务，但需要浏览器硬刷新（Ctrl+Shift+R）
- 如果用户报告"修了但没生效"，先确认浏览器是否在使用缓存版本

---

## 调试技巧：浏览器控制台异常消息为空

当 `browser_console` 返回的异常 message 为空时：

1. **检查函数是否定义**：`typeof functionName`
2. **强制加载并执行特定文件**：
   ```javascript
    fetch('/static/pages/page-chat.js', {cache:'no-store'})
      .then(r => r.text())
      .then(t => { try { eval(t); console.log('OK'); } catch(e) { console.error(e); } })

## 问题：applyLang() 通用 data-i18n 循环覆盖 nav-item 子元素（v0.4.26）

### 现象
- 页面加载后侧边栏导航项只显示纯文本，没有 emoji 图标
- HTML 源码中图标存在（Jinja2 渲染正常），但 JS 渲染后丢失
- `document.querySelectorAll('.nav-item .icon').length` 返回 0

### 根因
`core.js` 的 `applyLang()` 函数中，nav-item 专用处理（1204-1216行）先清空 innerHTML 再恢复 icon/badge，但通用 `[data-i18n]` 循环（1221-1229行）随后用 `el.textContent = t(key)` 再次覆盖 nav-item（因为它也有 data-i18n 属性）。`textContent` 会把元素的所有子元素替换为纯文本，图标 span 被清除。

### 修复
在通用循环中增加跳过逻辑：
```javascript
if (el.classList.contains('nav-item')) return;
if (el.classList.contains('nav-section-title')) return;
```

### 调试方法
```javascript
// 检查图标是否渲染
document.querySelectorAll('.nav-item .icon').length  // 应为 nav-item 数量
```
   ```
3. **创建新的 WS 连接测试后端**：
   ```javascript
   var ws = new WebSocket('ws://localhost:7241');
   ws.onopen = () => ws.send(JSON.stringify({type:'auth',key:'test'}));
   ws.onmessage = (e) => console.log('WS MSG:', e.data.substring(0,200));
   ```
