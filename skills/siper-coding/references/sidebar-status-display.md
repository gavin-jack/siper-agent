# Sidebar 连接状态显示

## 结构

```html
<div class="sidebar-status" id="sidebarStatus">
  <span class="status-dot" id="statusDot"></span>
  <span class="status-text" id="statusText">Disconnected</span>
</div>
```

## JS 控制函数

`setConnected(connected)` 在 core.js 中定义，WS onopen/onclose 调用：

```javascript
function setConnected(connected) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const wrap = document.getElementById('sidebarStatus');
  if (dot) dot.classList.toggle('connected', connected);
  if (txt) {
    txt.textContent = connected ? t('status.connected') : t('status.disconnected');
    txt.classList.toggle('connected', connected);
  }
  if (wrap) wrap.classList.toggle('connected', connected);
}
```

## CSS 规则

```css
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--red); }
.status-dot.connected { background: var(--green); box-shadow: 0 0 6px rgba(45,158,106,0.4); }
.sidebar-status.connected { color: var(--green); }
.sidebar-status.disconnected { color: var(--red); }
```

## Pitfall: 函数缺失（v0.7.3 修复）

在 v0.7.3 之前，`setConnected` 函数完全未定义。WS onopen/onclose 调用它时抛 JS 错误，导致：
1. Sidebar 状态永远停留在 "Disconnected"
2. 错误可能中断后续 JS 执行

**排查：** `typeof setConnected` 应为 `'function'`。

## i18n 键

- `status.connected`: "已连接" (zh) / "Connected" (en) / "已連接" (tw)
- `status.disconnected`: "未连接" (zh) / "Disconnected" (en) / "未連接" (tw)
