# renderMarkdown inline() 函数：行内格式处理顺序与 URL 自动链接

## inline() 函数处理顺序（关键）

`inline()` 函数在 `renderMarkdown` 内部定义，处理行内格式。**顺序至关重要**：

```
1. esc(s) — HTML 转义（最先执行）
2. code span 提取 — 用占位符 \x00C...\x00 替换（保护代码内容）
3. bold+italic — ***text*** / **text** / *text*
4. strikethrough — ~~text~~
5. 裸网址自动链接 — https?://...（必须在 Markdown 链接之前）
6. Markdown 链接 — [text](url)
7. code span 占位符恢复
```

## 裸网址自动链接（v0.9.40+）

### 问题

LLM 输出中经常包含裸网址（如 `https://example.com`），需要自动转为可点击链接。

### 核心难点

**不能简单地在 Markdown 链接之后添加裸网址正则**，因为：
- `esc(s)` 把 `<` 转成 `&lt;`，所以 `<a href="url">` 变成 `&lt;a href="url"&gt;`
- 裸网址正则排除 `<` 无法阻止匹配 `&lt;a href="url"&gt;` 中的 URL

**也不能简单地在 Markdown 链接之前添加**，因为：
- `[text](https://example.com)` 中的 URL 前面是 `(`，不是空白
- 如果正则排除 `)`，URL 在 `)` 前停止，仍然匹配到 URL 本身

### 解决方案：负向后行断言

```js
// ✅ 正确：在 Markdown 链接之前，用 (?<!\\() 排除 ( 前面的 URL
s = s.replace(/(?<!\\()(https?:\/\/[^\s<>"'\uff0c\u3002\uff1b\u3001)]+)/g,
  '<a href="$1" target="_blank" rel="noopener" class="md-link">$1</a>');

// Markdown 链接（在裸网址之后处理）
s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,
  '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
```

**关键**：
- `(?<!\\()` — 负向后行断言，确保 URL 前面不是 `(`（即不在 `[text](url)` 中）
- `[^\s<>"'\uff0c\u3002\uff1b\u3001)]` — 排除空白、尖括号、引号、中文标点、右括号
- 捕获组 `(https?:\/\/[^\s<>"'\uff0c\u3002\uff1b\u3001)]+)` — 用 `$1` 引用

### 为什么这个顺序有效

1. **裸网址在 Markdown 链接之前**：裸网址正则先处理 `https://example.com`，Markdown 链接正则后处理 `[text](url)`
2. **`(?<!\\()` 排除 Markdown 链接中的 URL**：`[text](url)` 中 URL 前面是 `(`，负向后行断言阻止匹配
3. **code span 已被占位符替换**：code span 中的 URL 已经是 `\x00C...\x00` 形式，不会被误匹配
4. **Markdown 链接处理后的 `<a>` 标签**：由于裸网址先处理，Markdown 链接后处理，不会产生嵌套 `<a>` 标签

### 边界情况处理

| 场景 | 输入 | 输出 | 说明 |
|------|------|------|------|
| 裸网址 | `访问 https://example.com` | `访问 <a href="...">https://example.com</a>` | ✅ 正常 |
| Markdown 链接 | `[点击](https://example.com)` | `<a href="...">点击</a>` | ✅ 正常 |
| code span | `` `https://api.com` `` | `<code>https://api.com</code>` | ✅ 不转换 |
| 多个裸网址 | `https://a.com 和 https://b.com` | 两个 `<a>` 标签 | ✅ 正常 |
| 带参数 URL | `https://a.com?q=1&r=2` | `<a href="...?q=1&r=2">` | ✅ & 不在排除字符中 |
| URL 后跟中文标点 | `https://a.com。` | `<a href="...a.com">` | ✅ 中文句号在排除字符中 |
| URL 后跟括号 | `(https://a.com)` | `<a href="...a.com">` | ✅ `)` 在排除字符中 |

### ⚠️ 常见陷阱

1. **忘记捕获组**：`/(?<!\\()https?:\/\/[^\s]+/g` 没有 `()` 捕获组，`$1` 是 undefined
2. **排除 `&` 字符**：URL 中的 `&`（如 `?a=1&b=2`）不应被排除
3. **browser tool 缓存**：修改 core.js 后，browser tool 可能加载旧版。验证方法：
   ```js
   // 检查加载的 core.js 版本
   document.querySelector('script[src*="core.js"]').src
   // 强制刷新：直接导航到 core.js URL 再返回
   ```

## CSS 样式

`.md-link` 样式已在 `style.css` 中定义：

```css
.msg-body .md-link {
  color: var(--accent, #60a5fa);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.msg-body .md-link:hover {
  color: var(--accent2, #c084fc);
}
```

## 文件变更记录

- `core.js:inline()` — 添加裸网址自动链接（v0.9.40）
- `style.css` — `.md-link` 样式已存在，无需修改
