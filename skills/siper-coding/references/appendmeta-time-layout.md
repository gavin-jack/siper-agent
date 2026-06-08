# appendMeta 时间布局模式（v0.9.52+）

## 场景

将消息气泡的 `⏱️ 用时` 从 meta 行末尾移到 token 统计旁边，同行显示。

## 修改位置

`page-chat.js` 中的 `appendMeta()` 函数（约第 309-379 行）。

## 修改方案

### items 数组构建

```js
// items 数组中 time 的插入位置：紧跟 tokens 之后
const items = [];

// tokens
if (showTokens && meta.tokens != null) {
  items.push({ type: 'tokens', label: `💬 ${meta.tokens}`, newline: hasTime ? false : origNewline });
}

// time — 紧跟 tokens，不换行
if (showTime && meta.time != null) {
  items.push({ type: 'time', label: `⏱️ ${meta.time}`, newline: false });
}

// tools
if (showTools && meta.tools) { items.push({ type: 'tools', ... }); }

// skills
if (showSkills && meta.skills) { items.push({ type: 'skills', ... }); }
```

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `tokens.newline` | `false`（当 time 存在时） | 防止 tokens 后换行 |
| `time.newline` | `false` | 与 tokens 同行 |
| `time` 插入位置 | tokens 之后，tools 之前 | 视觉顺序：tokens → time → tools → skills |

### 渲染结果

```
💬 1,234 tokens │ ⏱️ 3.2s │ 🔧 search_files × 1
```

## 关键陷阱

1. **`newline` 控制**：tokens 的 `newline` 必须根据 time 是否存在动态设置
2. **移除旧逻辑**：删除之前在 items 末尾插入 time 的旧代码，避免重复
3. **`getMetaConfig()` 默认值**：`brTokens: false`, `brTime: false`，所以默认全部同行
4. **兼容性**：当 `meta.time` 为 null 时，不插入 time 项，tokens 恢复原始 newline 行为

## 相关文件

- `webui/static/pages/page-chat.js` — `appendMeta()` 函数
- `webui/static/style.css` — `.msg-meta` 样式
