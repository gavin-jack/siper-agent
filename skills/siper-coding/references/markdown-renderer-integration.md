# Markdown 渲染器集成指南

## 概述

SiPer 前端 Markdown 渲染的演进路径：
1. **手写 regex 渲染器**（已废弃）：0 依赖，~540 行，维护成本高
2. **marked.js**（已废弃）：轻量（40KB UMD），GFM 支持，API 简单
3. **markdown-it**（当前，v0.9.59+）：功能最全（123KB min），14.1.0

## 下载到本地

SiPer 离线运行，不能用 CDN。

```bash
cd /tmp && npm pack markdown-it@14.1.0
tar xzf markdown-it-14.1.0.tgz
cp package/dist/markdown-it.min.js /home/gavin/.siper/webui/static/
```

文件大小：123KB（minified），gzip 后约 35KB。

## 引入方式

markdown-it.min.js 是 UMD 格式，用普通 `<script>` 加载：

```html
<!-- index.html 中，在 core.js 之前引入 -->
<script src="/static/markdown-it.min.js"></script>
<script src="/static/pages/core.js"></script>
```

全局变量：`window.markdownit`

⚠️ **不要**用 `type="module"`，会破坏 core.js 的全局函数导出。

## ⚠️ markdown-it 14.x Renderer Rules 关键限制

**只有 9 个 rules 可 hook**：`code_inline`, `fence`, `image`, `hardbreak`, `softbreak`, `text`, `html_block`, `html_inline`

**不存在**：`table_open`, `heading_open`, `paragraph_open`, `bullet_list_open`, `ordered_list_open`, `blockquote_open`, `hr`, `link_open`

**结论**：table/heading/list/blockquote/hr/link/p 等元素无法通过 renderer rules 添加 CSS 类名。必须用 **CSS 标签选择器**（`.msg-body table`, `.msg-body h1` 等）替代类名选择器。

## 自定义渲染规则（仅 code_inline 有效）

```javascript
const _prevCodeInline = _md.renderer.rules.code_inline;
_md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
  tokens[idx].attrPush(['class', 'md-code-inline']);
  return _prevCodeInline(tokens, idx, options, env, self);
};
```

**⚠️ 用 `attrPush(['class', 'name'])`，不能用 `attrJoin`**。

## 预处理（preprocessMarkdown / _preprocessMd）

LLM 输出的非标准格式需要预处理：
- Tab 分隔数据行 → pipe 格式表格
- `text | table |` 混合行分割
- 跨行 bold 合并

预处理函数独立于渲染器，可复用。

## CSS 适配（必须同步修改）

从类名选择器改为标签选择器：

| 类名选择器（旧） | 标签选择器（新） |
|---|---|
| `.msg-body .md-table` | `.msg-body table` |
| `.msg-body .md-heading` | `.msg-body h1, .msg-body h2, ...` |
| `.msg-body .md-para` | `.msg-body p` |
| `.msg-body .md-list` | `.msg-body ul, .msg-body ol` |
| `.msg-body .md-blockquote` | `.msg-body blockquote` |
| `.msg-body .md-hr` | `.msg-body hr` |
| `.msg-body .md-link` | `.msg-body a` |
| `.msg-body .md-code-block` | `.msg-body pre` |
| `.msg-body .md-code-inline` | `.msg-body .md-code-inline`（renderer 添加） |

## 关键陷阱

1. **先分析，后执行**：用户明确要求先给方案，确认后再改代码
2. **不要 `type="module"`**：UMD 格式用普通 `<script>` 即可
3. **保留预处理**：LLM 非标准输出必须预处理
4. **删除旧函数**：替换后删除 `syntaxHighlight`、`inline`、`esc` 等内部函数
5. **同步到 Windows**：改完后同步到 `/mnt/e/SiPer agent/`
6. **renderer rules 极少**：不要尝试 hook table_open/heading_open 等不存在的 rules
7. **`attrJoin` 不存在**：必须用 `attrPush`

## marked.js vs markdown-it 对比

| | marked.js | markdown-it |
|---|---|---|
| 体积（min） | 35KB | 123KB |
| 体积（gzip） | ~12KB | ~35KB |
| GFM 表格 | ✅ | ✅ |
| 任务列表 | ✅ | ✅（需插件） |
| 删除线 | ✅ | ✅ |
| 自定义渲染 | 回调函数 | Token 流 + renderer 规则（仅 9 个） |
| 插件生态 | 中等 | 丰富 |
