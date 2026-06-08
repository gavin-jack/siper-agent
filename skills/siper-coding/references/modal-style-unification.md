# 弹窗样式统一化模式（v0.9.28+）

## 概述

Siper 前端所有弹窗统一使用一套基础 CSS 类，消除各自独立的 overlay/dialog 规则，实现视觉风格一致。

## 弹窗清单

| 弹窗 | HTML 类 | 控制 JS | 特点 |
|------|---------|---------|------|
| 确认对话框 | `.modal-overlay-base` + `.confirm-dialog` | `showConfirm()` in core.js | 有 scope 区域、danger 按钮 |
| 全局设置 | `.settings-modal-overlay` + `.settings-modal` | `toggleSidebarSettings()` in core.js | 有 tabs、form fields、模型管理 |
| 提示词查看 | `.prompt-modal-overlay` + `.prompt-modal` | `showPromptModal()` in page-chat.js | 有 pre/code 区域、复制按钮 |
| 任务历史 | `.modal-overlay-base` + `.modal-dialog-base` | `closeTaskHistory()` in app.js | 简单 header+body |
| Dict 数据 | `.dict-modal-overlay` + `.dict-modal-dialog` | `showDictModal()` in core.js (动态创建) | 搜索+复制+格式化、暗色背景 |
| LLM 配置提示 | 复用 confirm 弹窗 | `showLlmConfigPrompt()` in main.js | 页面加载时检查 `llm_configured` |

## 统一基础 CSS 类

### 遮罩层 (Overlay)

```css
.modal-overlay-base,
.confirm-overlay,
.settings-modal-overlay,
.prompt-modal-overlay,
.dict-modal-overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.5); z-index: 10000;
  align-items: center; justify-content: center;
  animation: modalFadeIn 0.15s ease;
}
```

特殊覆盖：
- `.dict-modal-overlay` — 更深遮罩 `rgba(0,0,0,0.65)` + `backdrop-filter: blur(3px)`
- `.settings-modal-overlay` — `z-index: 9999`（低于 confirm 的 10000）

显示方式：统一用 `.open` 类（confirm 旧代码用 `.show`，已改为 `.open`）

### 对话框 (Dialog)

```css
.modal-dialog-base,
.confirm-dialog,
.settings-modal,
.prompt-modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  display: flex; flex-direction: column;
  animation: modalSlideIn 0.2s ease;
}
```

### 统一头部

```css
.modal-header-base,
.settings-modal-header,
.prompt-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
```

### 统一关闭按钮

```css
.modal-close-base,
.settings-modal-close,
.prompt-modal-close {
  background: none; border: none; font-size: 20px; cursor: pointer;
  color: var(--text-dim); padding: 0 4px; line-height: 1;
  border-radius: 4px; transition: color 0.15s, background 0.15s;
}
.modal-close-base:hover { color: var(--text); background: var(--bg-hover); }
```

### 统一内容区

```css
.modal-body-base,
.settings-modal-body,
.prompt-modal-body {
  padding: 16px 20px;
  overflow-y: auto; flex: 1;
  font-size: 13px; color: var(--text-dim); line-height: 1.6;
}
```

### 统一底部操作区

```css
.modal-footer-base,
.settings-modal-actions,
.prompt-modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
```

### 统一按钮样式

```css
.modal-footer-base button {
  padding: 8px 20px; border-radius: 6px; font-size: 13px;
  cursor: pointer; transition: background 0.15s;
  border: 1px solid var(--border); background: transparent; color: var(--text-dim);
}
.modal-footer-base button:hover { background: var(--bg-hover); }
.modal-footer-base button.primary {
  background: var(--accent); color: #fff; border-color: var(--accent);
}
.modal-footer-base button.danger {
  background: var(--red); color: #fff; border-color: var(--red);
}
```

### 统一动画

```css
@keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalSlideIn { from { opacity: 0; transform: translateY(-12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
```

## 交互规范

- 点击 overlay 区域关闭弹窗：`onclick="if(event.target===this)closeFn()"`
- 点击 dialog 区域阻止冒泡：`onclick="event.stopPropagation()"`
- 显示/隐藏用 CSS 类（`.open`），不用 `style.display`
- 动态创建的弹窗（dict modal）直接加 `open` 类显示

## CSS 精简规则

- 各弹窗特有 CSS 只保留特有属性（如 `.confirm-dialog` 的 `padding/min-width`）
- 已被基础样式覆盖的规则必须删除，避免重复
- 修改后用 `grep -n 'selector' style.css` 验证无重复规则
- CSS 颜色必须通过 var() 引用，禁止硬编码

## HTML 结构模板

所有弹窗统一使用以下结构：

```html
<div class="[type]-modal-overlay modal-overlay-base" id="[id]" onclick="if(event.target===this)closeFn()">
  <div class="[type]-modal modal-dialog-base" onclick="event.stopPropagation()">
    <div class="[type]-modal-header modal-header-base">
      <span class="[type]-modal-title">标题</span>
      <button class="[type]-modal-close modal-close-base" onclick="closeFn()">×</button>
    </div>
    <div class="[type]-modal-body modal-body-base">
      <!-- 内容 -->
    </div>
    <div class="[type]-modal-footer modal-footer-base">
      <button onclick="closeFn()">取消</button>
      <button class="primary" onclick="confirmFn()">确认</button>
    </div>
  </div>
</div>
```

## 注意事项

- 基础样式类（`modal-overlay-base` 等）必须与特有类同时写在 class 中
- 动态创建的弹窗（dict modal）使用 `className = 'dict-modal-overlay modal-overlay-base open'`
- 旧的 `.show` 类已改为 `.open`，确保 JS 中 `classList.add('open')` / `classList.remove('open')`
- confirm dialog 的 HTML 结构已改为使用 `modal-header-base`/`modal-body-base`/`modal-footer-base`
