# 动态 Modal 创建模式

## 概述

Siper 前端通过纯 JS 动态创建弹窗（modal），无需在 index.html 中预写 HTML。
已使用的场景：
- 设置弹窗（`settings-modal-overlay`，静态 HTML + CSS class 切换）
- 提示词查看弹窗（`prompt-modal-overlay`，纯 JS 动态创建，v0.6.3+）

## 动态创建模式

```javascript
function showFooModal(content) {
  const existing = document.getElementById('fooModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'fooModal';
  overlay.className = 'foo-modal-overlay';
  overlay.innerHTML = `
    <div class="foo-modal">
      <div class="foo-modal-header">
        <span class="foo-modal-title">标题</span>
        <button class="foo-modal-close" onclick="document.getElementById('fooModal').remove()">✕</button>
      </div>
      <div class="foo-modal-body">
        <pre class="foo-modal-text">${escapeHtml(content)}</pre>
      </div>
      <div class="foo-modal-footer">
        <button class="foo-modal-close-btn" onclick="document.getElementById('fooModal').remove()">关闭</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
```

## CSS 模式

```css
.foo-modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.15s ease;
}
.foo-modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  width: 90%; max-width: 640px; max-height: 80vh;
  display: flex; flex-direction: column;
  animation: slideUp 0.2s ease;
}
```

## 注意事项

- `z-index` 必须高于侧边栏（9999），建议 10000
- 弹窗内容中的用户输入必须用 `escapeHtml()` 转义
- 遮罩层点击关闭：`if (e.target === overlay)` 精确判断
- 多次打开前先 `remove()` 旧的，避免重复挂载
- 所有颜色用 var()，禁止硬编码

## User 消息 Action 按钮模式

### 基本模式（buildActions 中）

在 `page-chat.js` 的 `buildActions()` 中，user 消息的 actions 区域（`msg-actions-below`）可添加自定义按钮：

```javascript
if (cls === 'user' && text) {
  const promptBtn = document.createElement('button');
  promptBtn.className = 'msg-action-btn';
  promptBtn.innerHTML = '📝';
  promptBtn.title = '查看提示词';
  promptBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showPromptModal(text, e.currentTarget);
  });
  actions.appendChild(promptBtn);
}
```

**关键**：传入 `e.currentTarget`（按钮元素）而非仅传 text，使 modal 能通过 DOM 遍历获取关联数据。

### 同样适用于 addMsgHtml

`addMsgHtml()` 有独立的 actions 构建逻辑（不用 `buildActions()`），需要同步添加相同按钮：

```javascript
// insertBtn 之后
if (cls === 'user') {
  const promptBtn = document.createElement('button');
  promptBtn.className = 'msg-action-btn';
  promptBtn.innerHTML = '📝';
  promptBtn.title = '查看提示词';
  promptBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const row2 = e.currentTarget.closest('.msg-row');
    const bubble2 = row2 ? row2.querySelector('.msg-body') : null;
    showPromptModal(bubble2 ? bubble2.textContent : '', e.currentTarget);
  });
  actions.appendChild(promptBtn);
}
```

## 从 Row 属性读取关联数据

当弹窗需要显示后端返回的关联数据时，将数据挂在 row 元素的自定义属性上：

### 后端 → 前端数据流

1. `agent.py` `process_message` 返回 `prompt_context`（JSON 序列化的 messages 列表）
2. `siper_web.py` `stream_end` 消息中加入 `prompt_context` 字段
3. `core.js` `stream_end` 处理中，找到最近一条 user 消息 row，挂载 `data-prompt-context`：

```javascript
if (d.prompt_context) {
  try {
    const chatEl = document.getElementById('chatMessages');
    if (chatEl) {
      const rows = chatEl.querySelectorAll('.msg-row.user');
      if (rows.length > 0) {
        const lastUserRow = rows[rows.length - 1];
        lastUserRow.setAttribute('data-prompt-context', d.prompt_context);
      }
    }
  } catch(e) {}
}
```

### 前端读取并分段显示

```javascript
function showPromptModal(userText, btn) {
  const row = btn ? btn.closest('.msg-row') : null;
  const promptContext = row ? row.getAttribute('data-prompt-context') : '';

  if (promptContext) {
    const msgs = JSON.parse(promptContext);
    // msgs 是 [{role, content}, ...] 数组
    for (const m of msgs) {
      const roleLabel = m.role === 'system' ? '🔧 System' :
                        m.role === 'user' ? '👤 User' :
                        m.role === 'assistant' ? '🤖 Assistant' : m.role;
      // 渲染 roleLabel + content
    }
  } else {
    // 无 context（AI 未回复），仅显示 userText
  }
}
```

### 分段显示 CSS

```css
.prompt-modal-section { margin-bottom: 14px; }
.prompt-modal-role {
  font-size: 12px; font-weight: 600;
  color: var(--accent); margin-bottom: 6px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.prompt-modal-pre {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px; line-height: 1.5;
  color: var(--text); white-space: pre-wrap; word-break: break-word;
  margin: 0; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 6px;
  max-height: 200px; overflow-y: auto;
}
```
