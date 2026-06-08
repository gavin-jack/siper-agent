# 工具调用进度可视化（v0.9.49+，v0.9.62 更新）

> 涉及文件：`siper_web.py`, `core.js`, `style.css`

## 双重展示机制

| 时机 | 位置 | 内容 |
|------|------|------|
| 工具执行中 | `.msg-tool-panel`（气泡内顶部） | 工具名 + 实时状态图标（⟳/✓/✗） |
| 工具执行后 | `.tool-calls-wrap`（meta 折叠面板） | 工具名 + 参数 + 结果 + 耗时 + 成功/失败 |

## tool_progress 消息格式（后端）

```python
await self._send(conn_id, {
    "type": "tool_progress",
    "tool_name": "search_files",
    "status": "running",  # "running" | "done" | "error"
})
```

## 前端渲染（core.js）

```javascript
} else if (d.type === 'tool_progress') {
    if (_streamBubbleWrap) {
      let toolPanel = _streamBubbleWrap.querySelector('.msg-tool-panel');
      if (!toolPanel) {
        toolPanel = document.createElement('div');
        toolPanel.className = 'msg-tool-panel';
        _streamBubbleWrap.insertBefore(toolPanel, _streamBubbleWrap.firstChild);
      }
      const step = document.createElement('div');
      step.className = 'msg-tool-step';
      // ... 渲染工具名 + 状态 ...
      // 同名工具去重
      const existing = toolPanel.querySelectorAll('.msg-tool-step');
      for (const el of existing) {
        const nameEl = el.querySelector('.tool-step-name');
        if (nameEl && nameEl.textContent === toolName) el.remove();
      }
      toolPanel.appendChild(step);
    }
```

## CSS 类（style.css）

```css
.msg-tool-panel { padding: 6px 10px 8px; border-bottom: 1px solid var(--border); }
.msg-tool-step { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.tool-step-done { color: var(--green); }
.tool-step-error { color: var(--red); }
.tool-step-running { color: var(--accent); }
.tool-step-name { color: var(--accent2); font-family: monospace; font-size: 11px; }
```

## 完整工具详情（stream_end 后）

通过 `appendMeta()` 的 `tool-calls-wrap` 面板展示，使用 `renderToolCalls()` 渲染。用户点击 meta 行中的 `🔧 tools` 链接展开/折叠。详见 `references/tool-calls-toggle-pattern.md`。
