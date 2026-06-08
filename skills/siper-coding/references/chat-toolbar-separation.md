# Chat Toolbar Separation Pattern

## Overview
Model select dropdown and file upload button are separated from the chat input area into an independent `.chat-toolbar` div above the textarea.

## HTML Structure
```html
<div class="chat-toolbar">
  <button class="attach-btn" onclick="document.getElementById('fileInput').click()" title="上传文件">📎</button>
  <input type="file" id="fileInput" multiple class="hidden" onchange="handleFileSelect(event)">
  <div class="chat-model-dropdown" id="chatModelDropdown">
    <button class="chat-model-btn" id="chatModelBtn" onclick="toggleModelDropdown()">
      <span class="chat-model-btn-name" id="chatModelBtnName">默认模型</span>
      <span class="chat-model-btn-arrow">▾</span>
    </button>
    <div class="chat-model-menu" id="chatModelMenu"></div>
  </div>
</div>
<div class="chat-input-area">
  <div class="chat-input-wrapper">
    <div id="filePreviewContainer" class="file-preview-container hidden"></div>
    <textarea id="chatInput" ...></textarea>
  </div>
  <button id="sendBtn" onclick="sendMessage()">发送</button>
  <button id="stopBtn" class="hidden" onclick="stopGeneration()">■</button>
</div>
```

## Key Design Decisions (v20260805)
1. **Order**: Attach button on LEFT, model dropdown on RIGHT
2. **No border-top**: `.chat-toolbar` has NO `border-top` — seamless with chat area
3. **Button height**: Both buttons use `height: 28px; box-sizing: border-box; padding: 2px 8px`

## ⚠️ Padding 精确控制经验（v20260805+）

用户会反复微调 padding 值，每次只改一个变量。关键经验：
- 工具栏和输入框的 padding 必须分别控制
- 视觉上的"分割线"可能来自 `.chat-input-area` 的 `border-top`，需同时检查两个元素
- 按钮高度对齐需要 `box-sizing: border-box`

当前最终值：
- 工具栏：`padding: 8px 24px 3px 10px`
- 输入框：`padding: 3px 10px 6px`
   - `.attach-btn`: `height: 28px; padding: 2px 8px; box-sizing: border-box`
4. **No inline styles**: All toolbar styles in style.css under `.chat-toolbar` namespace

## CSS
```css
.chat-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 24px; background: var(--bg-sidebar);
}
.chat-toolbar .chat-model-dropdown { flex-shrink: 0; }
.chat-toolbar .chat-model-btn { height: 28px; padding: 2px 8px; font-size: 12px; }
.chat-toolbar .attach-btn {
  background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  padding: 2px 8px; border-radius: 6px; cursor: pointer; font-size: 14px;
  transition: all 0.15s; flex-shrink: 0; height: 28px; box-sizing: border-box;
}
.chat-toolbar .attach-btn:hover { border-color: var(--accent); color: var(--accent); }
```

## Common Pitfalls
- Height mismatch: attach-btn needs `box-sizing: border-box` to include border in height
- If toolbar not found via JS, page may be cached — hard refresh (Ctrl+Shift+R)
