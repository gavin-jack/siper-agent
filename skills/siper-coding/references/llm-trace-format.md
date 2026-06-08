# LLM 响应末尾 Trace 格式参考

## 问题背景

Siper 的 SOUL.md 要求所有回复末尾附加调用追踪信息（`⬆️ X · ⬇️ X │ 🔧 X │ 🧩 X │ ⏱️ X`）。
LLM 响应中的 trace 格式可能变化，导致前端的 stripTrace 正则匹配失败，产生重复显示。

## 实际观测到的 Trace 格式

### 格式 1：标准格式（最常见）
```
\n\n⬆️ 1.9K · ⬇️ 16 · 💾 1.8K │ 🔧 none │ 🧩 3 skills │ ⏱️ 9.0s
```
- 前缀：`\n\n`（两个换行）
- 内容：emoji + 数字/文本，用 `·` 和 `│` 分隔
- 后缀：时间单位（ms/s/m）

### 格式 2：带工具调用
```
\n\n⬆️ 2.1K · ⬇️ 156 · 🔧 2 tools │ 🧩 3 skills │ ⏱️ 12.3s
```

### 格式 3：极简格式（短回复）
```
\n\n⬆️ 0 · ⬇️ 0 │ 🔧 0 tools │ 🧩 3 skills │ ⏱️ 429ms
```

## 关键发现

1. **没有 `---` 分隔符**：LLM 输出末尾 trace 从不包含 `\n---\n` 分隔符。v0.4.36 用 `lastIndexOf('\n---\n')` 匹配失败。
2. **前缀是 `\n\n`**：后端 stats_line 用 `\n\n` 拼接（siper_web.py 2252行：`f"\n\n⬆️ {fmt_tokens(prompt_tokens)}`），但流式模式下 content 字段是 LLM 原始输出，stats_line 是单独字段。LLM 自己在响应末尾输出 trace 时也用 `\n\n` 前缀。
3. **emoji 是固定特征**：⬆️（U+2B06）开头，⏱️（U+23F1）结尾，中间必有 🔧 和 🧩。

## stripTrace 正则（v0.4.37 最终版）

```js
const traceMatch = raw.match(/\n+⬆️\s+.+⏱️\s*\w+$/);
if (traceMatch) {
    bodyEl.textContent = raw.slice(0, raw.lastIndexOf(traceMatch[0])).trimEnd();
}
```

## 调试方法

当 stripTrace 疑似失败时，在浏览器控制台检查：

```js
// 检查 body 内容末尾
const rows = document.querySelectorAll('.msg-row.agent');
const last = rows[rows.length-1];
const body = last.querySelector('.msg-body');
JSON.stringify(body.textContent.slice(-200));

// 检查 msg-meta 数量（应为 1）
last.querySelectorAll('.msg-meta').length;

// 检查是否有重复（body 含 trace + meta 各一份）
body.textContent.includes('⬆️') && last.querySelector('.msg-meta') ? 'DUPLICATE!' : 'OK';
```

## 相关陷阱

- #95：AI 消息气泡统计信息重复显示（v0.4.36/v0.4.37）
- browser_console 工具会清空消息缓冲区，console.log 调试不可靠（陷阱 #97）
