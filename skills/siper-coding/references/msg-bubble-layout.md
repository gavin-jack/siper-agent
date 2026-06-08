# 消息气泡布局（v0.6.2 最终）

## 布局模式：Grid 三行横向布局 + 时间外置顶 + 操作栏在气泡下方

v0.6.0 起，时间显示在气泡**外部上方**，grid 从两行扩展为三行。
v0.6.2 起，agent 消息额外显示开始时间（流式消息开始时记录）。

### DOM 结构

```
.msg-row.msg-row-horizontal          (Agent: 头像在左)
.msg-row.msg-row-horizontal.msg-row-user-horizontal  (User: 头像在右)
  ├── .msg-start-time                (grid-row:1, agent 专属，开始时间，左对齐)
  ├── .msg-time                      (grid-row:1, 发送/结束时间)
  ├── .msg-avatar-wrap               (grid-row:2, 头像)
  ├── .msg.agent-bubble / .msg.user  (grid-row:2, 气泡)
  │     ├── .msg-body
  │     ├── .msg-meta                (统计信息，气泡内底部，条件渲染)
  │     └── .tool-calls-wrap         (工具调用，气泡内底部)
  └── .msg-actions.msg-actions-below (grid-row:3, 操作栏在气泡下方)
        ├── button.msg-action-btn 📋 (复制)
        └── button.msg-action-btn ↩ (填入输入框)
```

### 时间样式（v0.6.2）

```css
/* 时间字号 12px */
.msg-row-horizontal .msg-time {
  grid-row: 1; grid-column: 1 / -1;
  font-size: 12px; color: var(--text-dim);
  margin-bottom: 2px; opacity: 0.6;
  text-align: left;
}
.msg-row-horizontal.msg-row-user-horizontal .msg-time {
  text-align: right;
  justify-self: end;
}

/* Agent 开始时间（流式消息） */
.msg-row-horizontal .msg-start-time {
  grid-row: 1; grid-column: 1;
  font-size: 12px; color: var(--text-dim);
  margin-bottom: 2px; opacity: 0.6;
  text-align: left;
}
```

### 时间格式

```javascript
// User 消息时间（右对齐，与气泡视觉对齐）
const timeEl = document.createElement('div');
timeEl.className = 'msg-time';
timeEl.textContent = new Date().toLocaleTimeString([], {
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});

// Agent 开始时间（流式消息开始时记录）
const startTimeEl = document.createElement('div');
startTimeEl.className = 'msg-start-time';
startTimeEl.textContent = new Date().toLocaleTimeString([], {
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});
```

### 对齐规则

| 消息类型 | .msg-time | .msg-start-time |
|----------|-----------|-----------------|
| User     | 右对齐（justify-self: end, text-align: right） | 无 |
| Agent    | 左对齐 | 左对齐（流式消息专属） |

### 关键陷阱

1. **position: absolute 继承**：`.msg-actions-below` 必须显式 `position: static`
2. **grid-template-rows 必须与行数匹配**：三行布局必须显式定义三行
3. **不能用 display:none 隐藏操作栏**：用 opacity + pointer-events
4. **meta 分割线条件渲染**：items.length > 0 时才创建
5. **时间元素在 bubble 之前 append**：确保是 row 第一个子元素
6. **user 时间右对齐**：需要同时设置 `justify-self: end` 和 `text-align: right`

### 操作栏按钮样式（v0.9.13+）

```css
.msg-action-btn {
  padding: 3px 8px;
  border-radius: 6px;
  font: inherit;          /* 继承消息内容字号，不再硬编码 12px */
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-sidebar);
  color: inherit;         /* 继承消息内容颜色，不再硬编码 text-dim */
  transition: all 0.15s;
  white-space: nowrap;
  line-height: 1.3;
  min-width: 28px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;           /* 默认半透明，hover 时变不透明 */
}
.msg-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--accent);
  opacity: 1;
}
```

**关键变更（v0.9.13）**：
- `font: inherit` 替代 `font-size: 12px; font-weight: normal` — 按钮文字大小跟随消息气泡
- `color: inherit` 替代 `color: var(--text-dim)` — 按钮文字颜色跟随消息气泡
- 新增 `opacity: 0.7` 默认半透明，hover 时 `opacity: 1`
- 去掉了 `box-shadow: rgba(45,158,138,0.15)` 硬编码阴影

### 演变历史

- v0.5.2: 两行 grid（bubble + actions）
- v0.5.4: 时间放在 bubble 内部
- v0.6.0: 时间移到 bubble 外部上方，三行 grid
- v0.6.2: 时间字号 12px，user 时间右对齐，agent 加开始时间
- v0.9.12: msg-action-btn 统一样式（padding/font-size/min-width/min-height）
- v0.9.13: msg-action-btn 改为 font:inherit + color:inherit + opacity:0.7
