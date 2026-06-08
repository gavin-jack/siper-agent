# CSS display 属性覆盖 hidden 类陷阱

## 问题描述

当 CSS 类同时定义了 `display` 属性和 `.hidden { display: none }` 时，选择器优先级高的 `display` 会覆盖 `display: none`，导致元素无法被隐藏。

## 本次案例

`.agent-tab-content-flex` 定义了 `display: flex`，当它应用到 files tab 时，即使 files tab 有 `.hidden` class，`display: flex` 仍然生效，导致模型配置 tab 里显示了 soul.md 和 agent.md 的 textarea。

```css
/* 错误写法 */
.agent-tab-content.agent-tab-content-flex {
  display: flex; flex-direction: column; flex: 1; min-height: 0;
}
```

```css
/* 正确写法：display 只在非 hidden 时生效 */
.agent-tab-content.agent-tab-content-flex {
  flex: 1; min-height: 0; flex-direction: column;
}
.agent-tab-content.agent-tab-content-flex:not(.hidden) {
  display: flex;
}
```

## 通用规则

**当 CSS 类需要 `display: flex` 或 `display: grid` 但同时可能被 `.hidden` 隐藏时，必须将 `display` 属性拆分到 `:not(.hidden)` 选择器中。**

## 诊断方法

```javascript
// browser_console 中检查
const el = document.getElementById('xxx');
const style = getComputedStyle(el);
console.log('display:', style.display, 'hidden:', el.classList.contains('hidden'));
// 如果 hidden=true 但 display≠none，说明 display 被覆盖了
```

## 影响范围

- `.agent-tab-content-flex`（已修复）
- `#page-agent-config .page-body > .agent-tab-content-flex`（已修复）
- 其他同时使用 `display: flex/grid` 和 `.hidden` 的 CSS 类（需排查）
