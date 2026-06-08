# 工具调用进度显示模式 — 完整实现

> 版本：v0.9.87z3+ (2026-08-04 更新)
> 涉及文件：`agent.py`, `siper_web.py`, `core.js`, `page-chat.js`, `style.css`, `index.html`

## 核心原则：tool_progress 在 Typing 区域显示

**当前模式（v0.9.87z3+）**：`tool_progress` WebSocket 消息显示在 `#typing` 区域的 `#typingTools` 容器内，作为"SiPer 正在思考..."的一部分。用户看到工具调用过程在思考区域实时展开。

**旧模式（v0.9.62~v0.9.87z2，已废弃）**：`tool_progress` 在流式气泡内创建 `.msg-tool-panel`。

## 架构流程

```
用户发送消息
  → sendMessage() 显示 typing (class="typing active")
    → tool_progress(running) → 在 #typingTools 创建步骤 "⟳ web_search("query")"
    → tool_progress(completed) → 更新为 "✓ web_search("query") → 5 results"
    → stream_delta → 创建流式气泡，渲染回复文本
  → stream_end → 隐藏 typing，清空 #typingTools
```

## HTML 结构（index.html）

```html
<div class="typing" id="typing">
  <div class="typing-row">
    <span class="typing-avatar"></span>
    <span class="typing-text typing-dots" data-i18n="chat.typing">SiPer 正在思考</span>
    <span><span>.</span><span>.</span><span>.</span></span>
  </div>
  <div class="typing-tools" id="typingTools"></div>
</div>
```

## core.js 中的 tool_progress 处理

```javascript
} else if (d.type === 'tool_progress') {
    const typingTools = document.getElementById('typingTools');
    if (typingTools) {
      const toolName = d.tool_name || 'unknown';
      const status = d.status || 'running';
      let step = typingTools.querySelector('[data-tool="' + toolName + '"]');
      if (!step) {
        step = document.createElement('div');
        step.setAttribute('data-tool', toolName);
        typingTools.appendChild(step);
      }
      step.className = 'typing-tool-step';
      const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⟳';
      const statusClass = status === 'completed' ? 'tool-step-done' : status === 'failed' ? 'tool-step-error' : 'tool-step-running';
      let paramSummary = '';
      if (d.info && d.info.parameters) {
        const params = d.info.parameters;
        if (toolName === 'web_search' && params.query) {
          paramSummary = '("' + params.query.substring(0, 40) + '")';
        } else if (toolName === 'web_extract' && params.urls) {
          paramSummary = '(' + (Array.isArray(params.urls) ? params.urls.length : 1) + ' urls)';
        } else if (toolName === 'execute_code') {
          paramSummary = '(code)';
        } else if (toolName === 'read_file' && params.path) {
          paramSummary = '("' + params.path.split('/').pop() + '")';
        } else if (toolName === 'write_file' && params.path) {
          paramSummary = '("' + params.path.split('/').pop() + '")';
        } else if (toolName === 'patch' && params.path) {
          paramSummary = '("' + params.path.split('/').pop() + '")';
        } else {
          paramSummary = '(' + Object.keys(params).join(', ') + ')';
        }
      }
      let resultSummary = '';
      if (status === 'completed' && d.info) {
        if (toolName === 'web_search' && d.info.metadata && d.info.metadata.count) {
          resultSummary = ' → ' + d.info.metadata.count + ' results';
        } else if (d.info.result && typeof d.info.result === 'string') {
          const r = d.info.result.replace(/\n/g, ' ').substring(0, 60);
          resultSummary = ' → ' + r + (d.info.result.length > 60 ? '…' : '');
        }
      }
      step.innerHTML = '<span class="tool-step-icon ' + statusClass + '">' + icon + '</span>' +
        '<span class="tool-step-name">' + escapeHtml(toolName + paramSummary) + '</span>' +
        '<span class="tool-step-result-summary">' + escapeHtml(resultSummary) + '</span>';
      const chatEl = document.getElementById('chatMessages');
      if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
    }
```

## 清空时机

在 `stream_end`、`stopped`、`error` 三个分支中，隐藏 typing 后立即清空：

```javascript
const _te = document.getElementById('typing');
if (_te) _te.className = 'typing';
const _tt = document.getElementById('typingTools');
if (_tt) _tt.innerHTML = '';
```

## CSS 样式

```css
.typing {
  display: none;
  flex-direction: column;
  align-self: flex-start;
  padding: 4px 24px 8px;
  position: sticky;
  bottom: 0;
  background: var(--bg);
  z-index: 10;
}
.typing.active { display: flex; }
.typing-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-dim);
  font-size: 13px;
  font-style: italic;
}
.typing-tools {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  margin-left: 46px;
}
.typing-tool-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-style: normal;
  padding: 1px 0;
}
.tool-step-result-summary {
  color: var(--text-dim);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}
```

## 关键陷阱

1. **status 值不匹配**：后端发送 `completed`/`failed`，前端旧代码可能检查 `done`/`error`。确保前后端一致。
2. **data-tool 属性**：用于关联同一工具的 running→completed 更新。
3. **typing 布局**：typing 从水平 flex 改为 `flex-direction: column`，工具步骤在下方展开。
4. **清空遗漏**：`stream_end`、`stopped`、`error` 三个分支都必须清空 `#typingTools`。

## 相关参考

- `references/tool-calls-toggle-pattern.md` — tool-calls 折叠面板实现
- `references/typing-indicator-timing.md` — Typing 指示器显示/隐藏时机
