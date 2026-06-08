# Typing Indicator with Agent Avatar

## Architecture: Static Element with Sticky Positioning (v0.6.2+)

The `#typing` element is a **static HTML element** in `page-chat`, positioned between `chat-messages` and `chat-input-area`. It uses `position: sticky; bottom: 0` to stay fixed at the bottom of the chat area, visible above the input box, regardless of scroll position.

### HTML Structure (index.html)

```html
<div class="page" id="page-chat">
  <div class="chat-messages" id="chatMessages"></div>
  <div class="typing" id="typing">
    <span class="typing-avatar"></span>
    <span class="typing-text" data-i18n="chat.typing">AI 正在思考</span>
    <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
  </div>
  <div class="chat-input-area">...</div>
</div>
```

Key: `#typing` is a **sibling** of `chat-messages`, not a child. It sits between `chat-messages` and `chat-input-area` in the flex column.

### CSS

```css
.typing {
  display: none; align-items: center; gap: 10px;
  align-self: flex-start; color: var(--text-dim);
  font-size: 13px; font-style: italic;
  padding: 4px 24px;
  position: sticky; bottom: 0;
  background: var(--bg); z-index: 10;
}
.typing.active { display: flex; }
```

- `position: sticky; bottom: 0` — sticks to bottom of the flex container
- `background: var(--bg)` — covers messages scrolling behind it
- `z-index: 10` — above message bubbles
- `padding: 4px 24px` — aligns with message area horizontal padding

### JS: Showing Typing (page-chat.js sendMessage)

Simple className toggle — element is always in DOM:

```js
const typingEl = document.getElementById('typing');
if (typingEl) {
  typingEl.className = 'typing active';
  const avatarEl = typingEl.querySelector('.typing-avatar');
  if (avatarEl && agentAvatarUrl) {
    avatarEl.innerHTML = `<img src="${agentAvatarUrl}" alt="Agent" onerror="this.style.display='none';this.parentElement.textContent='🤖';">`;
  }
}
```

### JS: Hiding Typing (core.js WS handlers)

All 5 places use className toggle (not remove):

```js
const _te = document.getElementById('typing');
if (_te) _te.className = 'typing';
```

Locations: `ws.onclose`, `stream_start`, `stream_end`, `response`, `error`.

### JS: i18n Switch (core.js applyLang)

```js
const te = document.getElementById('typing');
if (te) {
  const textEl = te.querySelector('.typing-text');
  if (textEl) textEl.textContent = t('chat.typing');
}
```

### Evolution History

1. **Inside chat-messages (static)**: Always appeared at top of message list. Wrong.
2. **Dynamic appendChild to chat-messages**: Appeared at bottom but scrolled with messages. Wrong.
3. **Dynamic + RAF scroll**: Still scrolled with content. Wrong.
4. **Static + position: sticky (final)**: Fixed at bottom, doesn't scroll. Correct.

### Why Sticky Instead of Dynamic?

1. **No scroll coupling**: Dynamic elements inside `chat-messages` scroll with content.
2. **Simpler code**: No create/remove/appendChild/scroll logic. Just toggle a class.
3. **Sticky works because**: `page-chat` is `display: flex; flex-direction: column`. `chat-messages` is `flex: 1; overflow-y: auto`. The sticky element is a flex sibling — it sticks to the bottom of the flex container, not the scroll container.

### Common Pitfalls

1. **Don't put #typing inside `chat-messages`**: It will scroll with messages.
2. **Don't use `position: fixed`**: Fixed positions relative to viewport, not the chat area.
3. **Don't forget `background` on sticky element**: Without it, scrolling messages show through.
4. **Don't use dynamic create/remove**: Static + className toggle is simpler.
