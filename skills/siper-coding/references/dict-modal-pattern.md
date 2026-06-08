# Dict Modal Pattern — Full Response Data Viewer

## Overview

Agent message bubbles have a `{}` (dict) button in the `msg-actions-below` area.
Clicking it opens a modal showing the complete LLM response dict (raw JSON with
response, usage, tool_calls, session_id, etc.).

## Files

| File | Role |
|------|------|
| `core.js` | `showDictModal(data)` function definition (line ~1938) |
| `core.js` | Stream mode: dict button added in stream_end handler |
| `page-chat.js` | Non-stream mode: dict button added in `buildActions()` |

## ⚠️ 简化模式（v20260805+）

Dict modal 已从三 tab（回复内容/处理结果/LLM原始响应）简化为**单视图**：

- **无 tab 栏** — 直接显示完整 JSON，无 tab 切换
- **标题** — 固定为 `📦 完整响应数据`（无动态 tab 标题）
- **按钮 hover** — `dictBtn.title = 'dict'`（简洁，非描述性文字）
- **保留功能** — 搜索（含高亮/导航）、复制全部、格式化（展开/压缩）
- **默认显示** — 格式化后的完整 JSON（非纯文本）
- **代码量** — 从 ~18400 字符精简到 ~12500 字符（减少 32%）
| `style.css` | Modal uses `.modal-overlay-base` / `.modal-dialog-base` classes |

## `showDictModal(data)` Implementation

### Structure

```
┌─────────────────────────────────────────────────────┐
│ 📦 完整响应数据                    1234 chars    ✕ │
├─────────────────────────────────────────────────────┤
│ 🔍 [搜索 key or value...    ] 3/15  ↑ ↓  │ 复制全部 │ 格式化 │
├─────────────────────────────────────────────────────┤
│ {                                                   │
│   "response": "hello",                              │
│   "usage": { "prompt_tokens": 123, ... }            │
│ }                                                   │
└─────────────────────────────────────────────────────┘
```

### Theme-Adaptive Colors (v0.9.50+)

The `renderValue()` function inside `showDictModal` uses CSS variables for colors
but must adapt for light themes where accent colors blend into the background.

**Light theme detection:**
```javascript
function isLightTheme() {
  const bg = cv('--bg') || '#0d1117';
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) > 128000;
}
const _light = isLightTheme();
```

**Color mapping (light vs dark):**

| Element | Dark theme | Light theme | Why |
|---------|-----------|-------------|-----|
| Strings | `C.accent` (#58a6ff blue) | `C.green` (#3fb950) | accent blends into light bg |
| Keys | `C.accent2` (#a371f7 purple) | `C.accent` (computed) | purple too dim on light |
| Numbers | `C.text` + font-weight:600 | same (with 600) | dark text works on both |
| Booleans | `C.red` (#f85149) | same | red has good contrast on both |
| Punctuation `{}[]:,` | `C.textDim` | same | acceptable on both |
| URLs | `C.green` + underline | same | green link color works on both |
| Paths | `C.cyan` | same | cyan distinguishable on both |

**Pitfall**: Without light theme adaptation, `--accent` (#2d9e8a teal on light theme)
is nearly identical to `--bg` (#c8ebe5 light teal), making string values invisible.
The light theme `--textDim` (#3a6b5e) also has low contrast against `--bg` (#c8ebe5).

### Search Features (v0.9.35+)

Search bar with result count and prev/next navigation:

- **Search count**: Shows `current/total` (e.g. `3/15`), `0/0` when no matches
- **Prev/Next buttons**: ↑ ↓ buttons to jump between matches
- **Current match highlight**: Orange background for current, yellow for others
- **Auto-scroll**: Smooth scroll to current match on navigation
- **Keyboard shortcuts**: Enter = next, Shift+Enter = prev, Esc = clear search
- **Cyclic navigation**: Wraps around at both ends

### Search State Variables

```javascript
let searchMatches = [];   // Array of <mark> DOM elements
let searchCurrent = -1;   // Index of current match (-1 = none)
const markStyle = 'background:' + C.yellow + ';...';       // Normal highlight
const markCurrentStyle = 'background:' + C.orange + ';...'; // Current highlight
```

### Key Functions

```javascript
function updateSearch() {
  // Re-render with <mark class="dict-search-hit"> highlights
  // Collect matches: pre.querySelectorAll('.dict-search-hit')
  // Update count display, show/hide nav buttons
  // Auto-scroll to first match
}

function scrollToMatch(idx) {
  // Update searchCurrent, update count text
  // Reset all marks to markStyle, set current to markCurrentStyle
  // el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function goNext() { scrollToMatch((searchCurrent + 1) % searchMatches.length); }
function goPrev() { scrollToMatch((searchCurrent - 1 + searchMatches.length) % searchMatches.length); }
```

### Important: renderValue/renderFormatted Placement

`renderValue()` and `renderFormatted()` are defined **inside** `showDictModal()`,
after the `pre` element is created. They must be defined **before** `updateSearch()`
is called (since `updateSearch` calls `renderValue`). The initial render uses
`renderFormatted(data)` (single argument).

**Pitfall**: When patching the search section, do NOT delete the `renderValue`/
`renderFormatted` function definitions — they are called by both the initial render
and `updateSearch()`. If patching the toolbar area, ensure the function definitions
remain in scope.

## Data Source

- **Stream mode**: `_data` from `d.data` in `stream_end` WS message
- **Non-stream mode**: `meta._raw` from the `addMsg` meta object
- Both contain the full backend response dict: `{response, success, usage, tool_calls_executed, tool_call_steps, skills_active, processing_time_ms, model, ...}`

## `buildActions(below)` Refactoring (v0.9.11+)

`buildActions()` now accepts a boolean `below` parameter:
- `below=false` (default): returns `msg-actions` (hover mode, absolute positioned)
- `below=true`: returns `msg-actions-below` (grid mode, below bubble)

Dict button is only added for agent messages (`isAgent && meta._raw`).

## Stream Mode Rendering Chain (v0.9.11+)

`stream_end` handler now renders directly without calling `addMsg`:
1. Build row with `msg-row-horizontal` grid layout
2. Add `msg-actions-below` with 📋 ↩ {} buttons
3. Call `appendMeta(_streamBubbleWrap, _meta)` for tokens/tools display
4. Reset streaming state

This ensures stream and non-stream messages have identical visual structure.
