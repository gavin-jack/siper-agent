# CSS flex: 1 覆盖 textarea 高度的调试指南

## 现象

通过 JS 设置 textarea 的 `style.height = '260px'` 后，`getComputedStyle(el).height` 仍返回最小高度（如 46px）。

## 根因

```css
.chat-input-area textarea {
  flex: 1;  /* 展开为 flex: 1 1 0% */
}
```

flex 容器的默认 `align-self: stretch` 覆盖了内联 `height`。`flex-basis: 0%` 使 flex 布局引擎重新计算子元素高度，忽略内联 height。

## 复现条件

1. textarea 的父容器是 `display: flex`
2. textarea 的 CSS 中有 `flex: 1`（或 `flex-grow: 1`）
3. 通过 JS 设置 `el.style.height = 'Npx'`

## 验证方法（浏览器控制台）

```javascript
const el = document.getElementById('chatInput');
el.style.height = '260px';
const cs = window.getComputedStyle(el);
console.log('inline:', el.style.height);     // "260px"
console.log('computed:', cs.height);          // "46px" ← 被覆盖
console.log('flex:', cs.flex);                // "1 1 0%" ← 根因
```

## 修复方案

### 方案 A：修改 CSS（推荐）

将 textarea 的 `flex: 1` 改为 `width: 100%`：

```css
.chat-input-area textarea {
  width: 100%;    /* 替代 flex: 1 */
  /* 保留其他属性 */
  min-height: 44px;
  max-height: 260px;
  overflow-y: auto;
  box-sizing: border-box;
}
```

**适用场景**：父容器是 `flex-direction: column`，textarea 不需要 flex-grow。

### 方案 B：JS 同步设置

```javascript
el.style.height = '260px';
el.style.alignSelf = 'flex-start';  // 覆盖 stretch
// 或
el.style.flex = 'none';             // 完全禁用 flex
```

## 注意事项

- `transition: height 0.1s ease` 对直接 JS 设置 height 无动画效果（因为不是 CSS 状态变化）
- `resize: none` 不影响此问题
- 如果父容器是 `flex-direction: row`，`flex: 1` 控制的是宽度而非高度，此时不能用 `width: 100%` 替代

## 实际案例（v0.4.35）

Siper 聊天输入框 auto-resize 失效：
- `.chat-input-wrapper` 是 `display: flex; flex-direction: column`
- textarea 有 `flex: 1`，导致 JS 设置的 height 被覆盖
- 修复：`flex: 1` → `width: 100%`，auto-resize 恢复正常
