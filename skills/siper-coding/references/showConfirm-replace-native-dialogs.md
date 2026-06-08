# showConfirm 增强与原生弹窗统一替换模式

> v0.9.82+ — 所有 `confirm()`/`alert()` 替换为 SiPer 自定义 `showConfirm` 弹窗

## showConfirm API

```js
showConfirm({
  title: '弹窗标题',
  msg: '确认消息内容',
  impact: '⚠ 操作影响警告（红色区域，可选）',
  scope: '附加上下文信息（灰色区域，可选）',
  danger: true,          // true = 红色确认按钮
  okText: '确认删除',     // 确认按钮文字
  cancelText: '取消',     // 取消按钮文字
  onConfirm: () => { /* 确认后执行 */ }
});
```

## 新增参数（v0.9.82+）

| 参数 | 类型 | 说明 |
|------|------|------|
| `impact` | string | 红色警告区域，显示操作后果（⚠ 图标 + 红色边框） |
| `cancelText` | string | 取消按钮文字（默认"取消"） |

## HTML 模板（index.html）

```html
<div class="modal-overlay-base" id="confirmOverlay" onclick="cancelConfirm(event)">
  <div class="confirm-dialog modal-dialog-base" onclick="event.stopPropagation()">
    <div class="modal-header-base">
      <span class="title-text"><span class="warn-icon">⚠️</span><span id="confirmTitle">确认操作</span></span>
      <button class="modal-close-base" onclick="cancelConfirm()">×</button>
    </div>
    <div class="modal-body-base">
      <div id="confirmMsg"></div>
      <div class="modal-scope-base hidden" id="confirmScope"></div>
      <div class="modal-impact-base hidden" id="confirmImpact"></div>
    </div>
    <div class="modal-footer-base">
      <button id="confirmCancelBtn" onclick="cancelConfirm()">取消</button>
      <button id="confirmOkBtn" class="primary" onclick="execConfirm()">确认</button>
    </div>
  </div>
</div>
```

## CSS 样式

```css
.modal-impact-base {
  font-size: 12px; color: var(--red); line-height: 1.5;
  margin: 8px 0 0; padding: 8px 12px;
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 6px;
}
```

## 已替换的原生弹窗（v0.9.82 完整清单）

| 场景 | 文件 | 原代码 | 替换后 |
|------|------|--------|--------|
| 删除会话 | page-sessions.js | `confirm(t('sessions.confirmDelete')+sid.slice(0,8)+'...?')` | showConfirm + impact |
| 删除任务 | page-tasks.js | `confirm(t('tasks.confirmDelete'))` | showConfirm + impact |
| 删除主题模板 | page-theme.js | `confirm(t('theme.confirmDelete').replace('{0}', name))` | showConfirm + impact |
| 重置设置 | core.js | `confirm(t('settings.confirmReset'))` + `alert(t('settings.resetDone'))` | showConfirm + toast |
| 重置模型列表 | page-settings.js | `confirm(t('settings.confirmReset'))` | showConfirm + toast |
| 重启网关 | page-gateway.js | `confirm(t('gateway.confirmRestart'))` | showConfirm + impact |
| 停止服务 | page-gateway.js | `confirm(t('gateway.confirmStop', service))` | showConfirm + impact |
| 保存设置 | core.js | `alert(t('settings.saved'))` | `toast.success()` |

## 替换模式模板

### confirm → showConfirm（危险操作）

```js
// 之前
if (!confirm(t('xxx.confirmDelete'))) return;
doDelete();

// 之后
showConfirm({
  title: '删除xxx',
  msg: '确定删除xxx？',
  impact: '⚠ 操作后果描述',
  danger: true,
  okText: '确认删除',
  onConfirm: () => { doDelete(); }
});
```

### confirm + alert → showConfirm + toast（重置操作）

```js
// 之前
if (!confirm(t('xxx.confirmReset'))) return;
doReset();
alert(t('xxx.resetDone'));

// 之后
showConfirm({
  title: '重置xxx',
  msg: '确定要重置吗？',
  impact: '⚠ 重置后果描述',
  danger: true,
  okText: '确认重置',
  onConfirm: () => {
    doReset();
    toast.success(t('xxx.resetDone'), 1500);
  }
});
```

### alert → toast.success（纯成功提示）

```js
// 之前
alert(t('xxx.saved'));

// 之后
toast.success(t('xxx.saved'), 1500);
```

## 注意事项

1. **异步 onConfirm**：`onConfirm` 可以是 `async` 函数，`execConfirm()` 调用后 modal 会先关闭，异步操作在后台执行
2. **双重 toast**：如果 `onConfirm` 内部已有 `toast.success`，不要再在 showConfirm 外部加 toast
3. **app.js 是死代码**：app.js 中的 confirm/alert 无需替换（index.html 未加载 app.js）
4. **showConfirm 在 core.js 中定义**：确保 core.js 已加载（index.html 中 `<script src="/static/pages/core.js">` 在 page-*.js 之前）
5. **impact 参数**：仅在危险操作时使用，描述不可逆后果；普通确认不需要
6. **确认按钮文字**：危险操作用"确认删除"/"确认重置"等明确动词，不要用泛化的"确认"
