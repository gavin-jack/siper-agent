# Debug JSON Syntax Highlighting

## Summary

Debug 模式（v0.7.4）在消息气泡下方显示完整 LLM 响应 JSON dict。v0.7.5 新增语法高亮，增强可读性。

## Visual Structure

```
┌─ .msg-debug-block ─────────────────────────────┐
│ ┌─ .msg-debug-header ────────────────────────┐ │
│ │ 🔍 Response                    [📋]        │ │
│ └────────────────────────────────────────────┘ │
│ ┌─ .msg-debug-pre ───────────────────────────┐ │
│ │ {                                          │ │
│ │   "response": "你好！",                     │ │
│ │   "success": true,                         │ │
│ │   "usage": {                               │ │
│ │     "prompt_tokens": 1822,                 │ │
│ │     "completion_tokens": 15                │ │
│ │   }                                        │ │
│ │ }                                          │ │
│ └────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

## Color Scheme (CSS Variables)

| Token | CSS Variable | Fallback | Color |
|-------|-------------|----------|-------|
| key   | `--accent2` | `#7c3aed` | Purple |
| string | `--green` | `#16a34a` | Green |
| number | `--accent` | `#2563eb` | Blue |
| bool/null | `--red` | `#dc2626` | Red |

Using CSS variables ensures colors adapt to all themes (light/dark/black/etc).

## Core Function: `debugHighlight(json)`

Defined at end of `page-chat.js`:

```javascript
function debugHighlight(json) {
  const E = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return json.replace(/"([^"]+)":/g, (m, k) => '<span class="dbg-key">"' + E(k) + '"</span>:')
    .replace(/:\s*"([^"]*)"/g, (m, v) => ': <span class="dbg-str">"' + E(v) + '"</span>')
    .replace(/:\s*(\b\d+\.?\d*\b)/g, (m, v) => ': <span class="dbg-num">' + v + '</span>')
    .replace(/:\s*(\b(?:true|false|null)\b)/g, (m, v) => ': <span class="dbg-bool">' + v + '</span>');
}
```

## Key Gotcha: Tokenize BEFORE Escaping

**WRONG approach** (escape first, then regex):
```javascript
const escaped = escapeHtml(json);  // " → &quot;
escaped.replace(/"([^"]+)":/g, ...)  // Never matches! &quot; ≠ "
```

**CORRECT approach** (regex first, then escape each captured group):
```javascript
json.replace(/"([^"]+)":/g, (m, k) => '<span>' + E(k) + '</span>')
```

The regex runs on raw JSON where `"` is still `"`. Each captured group is individually HTML-escaped before being inserted into the replacement string.

## Simplified Regex Patterns

The regex uses simple patterns rather than complex ones:

- Key: `"([^"]+)"` — matches `"anything"` (no escaped quotes in JSON keys)
- String value: `"([^"]*)"` — matches `"anything"` (including empty)
- Number: `\b\d+\.?\d*\b` — matches integers and decimals
- Bool/null: `\b(?:true|false|null)\b`

Earlier attempt used `"(?:[^"\\]|\\.)*"` (handles escaped quotes in strings) but this caused issues when passed through browser_console where backslashes get double-escaped. The simpler pattern works because JSON.stringify output for LLM responses rarely contains escaped quotes in string values.

## Files Involved

| File | Role |
|------|------|
| `page-chat.js` | `debugHighlight()` function definition; `appendMeta()` calls it for non-streaming responses |
| `core.js` | `stream_end` branch calls `debugHighlight()` directly for streaming responses |
| `style.css` | `.msg-debug-block`, `.msg-debug-header`, `.msg-debug-copy`, `.msg-debug-pre`, `.dbg-key`, `.dbg-str`, `.dbg-num`, `.dbg-bool` |
| `page-settings.js` | `saveMetaConfig`/`loadMetaConfig` — `showDebug` field |
| `index.html` | Debug mode checkbox (`cfgMetaDebug`) |

## Dual Rendering Paths

Debug blocks are rendered in two places:

1. **Non-streaming (response type)**: `page-chat.js` → `appendMeta()` → reads `meta._raw`
2. **Streaming (stream_end type)**: `core.js` → inline code → reads `_streamRawData`

Both paths create the same DOM structure: `.msg-debug-block > .msg-debug-header + .msg-debug-pre`.
