# Tool Calls Toggle & Meta Display Pattern (v0.9.12+)

## Architecture

`renderToolCalls(steps)` now **returns** the wrap element instead of appending to a container. The caller (`appendMeta`) controls placement and visibility.

## Flow

1. `appendMeta(container, meta)` creates the meta bar (tokens, tools, skills, time)
2. Tools line shows `🔧 tools × N` with class `.meta-tools-link` (clickable, underlined, accent color)
3. If `cfg.showToolSteps && steps.length > 0`:
   - `renderToolCalls(steps)` creates the wrap (toggle + panel)
   - wrap is appended to container with `style.display = 'none'` (hidden by default)
   - Clicking `.meta-tools-link` toggles `wrap.style.display` between `''` and `'none'`

## Key CSS

```css
.meta-tools-link { cursor: pointer; text-decoration: underline; color: var(--accent); }
.meta-tools-link:hover { color: var(--text); }
.tool-step { background: rgba(0,0,0,0.15); border: 1px solid var(--border); }
.tool-step-header:hover { background: var(--bg-hover); }
.tool-step-arrow { transition: transform 0.2s; display: inline-block; }
.tool-step-arrow.open { transform: rotate(90deg); }
.tool-step-code { border: 1px solid var(--border); }
.tool-step-result { border: 1px solid var(--border); }
.tool-step-result.success { border-left: 2px solid var(--green); }
.tool-step-result.error { border-left: 2px solid var(--red); }
```

## Duplicate Bug Fix

**Root cause**: stream_end called `renderToolCalls(wrap, steps)` directly AND then called `appendMeta(wrap, meta)` which internally called `renderToolCalls` again → two tool-calls-wrap elements.

**Fix**: Removed the direct `renderToolCalls` call in stream_end. Now only `appendMeta` handles it, and it creates the wrap hidden, toggled by the meta tools link.

## Meta Format (v0.9.13+)

```
⬆️ 1.2K · ⬇️ 0.3K │ 🔧 tools：web_search × 2 │ terminal × 1 │ 🧩 skills × 0 │ ⏱️ 3.2s
```

- Tools line now shows **tool name frequency** from `tool_call_steps`:
  - `🔧 tools：toolName × count │ toolName2 × count2`
  - Extracted by iterating `meta.tool_call_steps`, counting `step.tool_name` occurrences
  - Fallback to `🔧 tools × N` when no steps available
- `skills_active.length` → `🧩 skills × N`
- Inline separator: ` │ ` (class `.msg-meta-sep-inline`)

## Tool Name Aggregation Code

```javascript
const steps = meta.tool_call_steps || [];
const nameCount = {};
for (const s of steps) {
  const n = s.tool_name || 'unknown';
  nameCount[n] = (nameCount[n] || 0) + 1;
}
const parts = Object.entries(nameCount).map(([name, cnt]) => `${name} × ${cnt}`);
const toolsText = parts.length > 0
  ? `🔧 tools：${parts.join(' │ ')}`
  : `🔧 tools × ${toolsCount}`;
```
