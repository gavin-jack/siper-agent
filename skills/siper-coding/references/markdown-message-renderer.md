# Markdown 消息渲染引擎（v0.9.20+）

## 概述

SiPer 消息气泡 `msg-body` 现在支持完整 Markdown 渲染，零外部依赖。核心函数 `renderMarkdown(text)` 定义在 `webui/static/pages/core.js` 末尾，返回 `DocumentFragment`。

## 支持的 Markdown 特性

| 特性 | 语法 | 说明 |
|------|------|------|
| 代码块 | ` ```lang ... ``` ` | 带语法高亮 + 语言标签 + 复制按钮 |
| 行内代码 | `` `code` `` | 背景色 + 等宽字体 |
| 标题 | `# h1` ~ `###### h6` | h1 有下划线 |
| 粗体 | `**text**` | |
| 斜体 | `*text*` | |
| 删除线 | `~~text~~` | |
| 链接 | `[text](url)` | 新窗口打开 |
| 无序列表 | `- item` / `* item` / `+ item` | |
| 有序列表 | `1. item` | |
| 引用块 | `> text` | 左边框 + 浅色背景 |
| 表格 | `\| col1 \| col2 \|` + 分隔行 | thead/tbody |
| 分割线 | `---` / `***` / `___` | |

## 语法高亮支持的语言

- **python/py**: `#` 注释、关键字(def/class/import/return/if/else/for/while/try/except/with/yield/lambda/async/await等)
- **javascript/js/typescript/ts**: `//` 和 `/* */` 注释、关键字(const/let/var/function/return/if/else/for/while/class/import/export/async/await等)
- **html/xml**: `<!-- -->` 注释
- **bash/sh/shell/zsh**: `#` 注释、关键字(if/then/else/for/while/do/function/return/export/echo等)
- **json**: true/false/null 关键字

通用高亮：字符串（引号包裹）、数字。

## 渲染架构

### 文件职责

| 文件 | 职责 |
|------|------|
| `core.js` | `renderMarkdown()` 定义、`ws.onmessage` 流式渲染(stream_delta/stream_end)、response 类型消息渲染 |
| `page-chat.js` | `addMsg()` 函数：构建消息行 DOM，agent 消息调用 `renderMarkdown(text)` |
| `style.css` | `.msg-body .md-*` 系列样式 |

### 渲染流程

```
用户发送消息
  → ws.send({type:"message"})
  → 后端处理
  → ws.onmessage 接收:
    stream_delta × N → _streamAcc 累加, textNode 追加到 _streamBubble
    stream_end       → _streamBubble.textContent='', appendChild(renderMarkdown(_streamAcc))
                    → appendMeta + actions-below
    response         → addMsg(content, 'agent', meta) → body.appendChild(renderMarkdown(text))
```

### 流式渲染策略

- **delta 阶段**: `document.createTextNode(d.delta)` 追加到 msg-body（性能最优，无需重复解析 Markdown）
- **stream_end 阶段**: 清空 msg-body，用 `renderMarkdown(_streamAcc)` 重新渲染完整 Markdown
- **权衡**: delta 阶段显示纯文本（无格式），stream_end 后变为格式化 Markdown。

## CSS 类命名规范

所有 Markdown 元素使用 `md-` 前缀，嵌套在 `.msg-body` 下：

```
.msg-body .md-para         段落
.msg-body .md-heading      标题 (h1-h6)
.msg-body .md-code-block   代码块容器
.msg-body .md-code-inline  行内代码
.msg-body .md-code-lang    语言标签
.msg-body .md-code-copy    复制按钮
.msg-body .md-kwd          关键字(紫色)
.msg-body .md-str          字符串(绿色)
.msg-body .md-num          数字(蓝色)
.msg-body .md-cmt          注释(灰色斜体)
.msg-body .md-link         链接
.msg-body .md-list         列表(ul/ol)
.msg-body .md-blockquote   引用块
.msg-body .md-table        表格
.msg-body .md-hr           分割线
```

## 修改 msg-body 渲染的 checklist

当需要修改消息内容渲染时，需同步检查以下位置：

1. **core.js stream_delta/stream_end** — 流式消息渲染
2. **core.js response 分支** — 非流式消息渲染（调用 addMsg）
3. **page-chat.js addMsg()** — agent 消息 body 渲染
4. **app.js addMsg()** — 旧版消息渲染（page-chat.js 后加载，同名函数覆盖此版本）
5. **style.css .msg-body .md-*** — Markdown 元素样式

## 注意事项

- `renderMarkdown()` 返回 `DocumentFragment`，必须用 `appendChild()` 挂载，不能直接赋值给 `innerHTML`
- 流式 delta 阶段不使用 renderMarkdown（性能原因），只在 stream_end 时渲染一次
- CSS 样式全部限定在 `.msg-body` 下，不会影响页面其他部分
- 代码块复制按钮使用 `navigator.clipboard.writeText()`，需要 HTTPS 或 localhost
