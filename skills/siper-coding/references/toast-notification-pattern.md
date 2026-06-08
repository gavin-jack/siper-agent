# Toast 通知系统实现（v0.9.42+，v0.9.82 更新）

> 涉及文件：`core.js`, `style.css`

## 实现位置

Toast 系统定义在 `core.js` 中（`playReplySound` 之前），通过 `window.toast` 暴露全局 API。

## API

```javascript
toast.info(msg, duration)     // 蓝色左边框，默认 2.5s
toast.success(msg, duration)  // 绿色左边框，默认 2.5s
toast.warning(msg, duration)  // 黄色左边框，默认 3s
toast.error(msg, duration)    // 红色左边框，默认 4s
```

`duration` 参数可选，传 `0` 表示不自动消失。

## 调用文件

以下文件均使用 `toast.*`：
- `page-chat.js` — 复制按钮反馈
- `page-sessions.js` — 刷新成功/失败
- `page-agent-config.js` — 自动保存成功/失败（v0.9.82+）
- `page-agent.js` — 保存反馈
- `page-settings.js` — 自动保存成功/失败（v0.9.82+）
- `page-memory.js` — 保存/加载反馈
- `page-tasks.js` — 任务操作反馈
- `page-theme.js` — 主题操作反馈
- `page-token.js` — 复制反馈

## ⚠️ 自动保存后必须 Toast 成功提示（v0.9.82+）

**规则：所有自动保存操作（防抖保存）成功后必须调用 `toast.success`，duration 建议 1500ms（短闪即消失）。**

模式：
```javascript
let _autoSaveTimer = null;

function autoSaveModels() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    try {
      // ... API 调用 ...
      const d = await r.json();
      if (!d.success) toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
      else toast.success(t('settings.modelSaved'), 1500);  // ← 必须加这行
    } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
  }, 300);
}
```

**常见错误：** 只在失败时 toast.error，成功时什么都不显示。用户需要确认保存已生效。

**i18n key：** 自动保存成功提示用的 key（如 `settings.modelSaved`、`agent.modelSaved`）必须在 core.js 三语言包中同步添加。

## ⚠️ 自动保存替换保存按钮模式（v0.9.82+）

当用户要求"去掉保存按钮，改为自动保存"时：

1. **移除保存按钮** — 删除 `<button onclick="saveXxx()">保存</button>`
2. **替换为自动保存提示** — 改为 `<div style="font-size:11px;color:var(--text-dim)">✦ 自动保存</div>`
3. **给表单元素加 onchange** — `<select onchange="autoSaveXxx()">`、`<input onchange="autoSaveXxx()">`
4. **防抖函数** — 300ms 防抖，避免频繁 API 调用
5. **成功 toast** — 保存成功后 `toast.success(t('xxx.saved'), 1500)`
6. **内联保存逻辑** — 不要调用原有的 `saveXxx()` 函数（避免双重 toast），直接在 autoSave 函数内联 API 调用

**⚠️ 避免双重 toast：** 如果 `saveXxx()` 内部已有 `toast.success`，不要让 `autoSaveXxx()` 调用 `saveXxx()` 后再 toast。应该内联保存逻辑。

## ⚠️ 禁止创建独立 showToast 函数（v20260805+）

**所有 toast 必须使用 core.js 中 `window.toast` API，禁止在 page-*.js 中创建独立的 showToast 函数。**

错误示例（page-chat.js 中曾出现）：
```javascript
// ❌ 禁止 — 独立实现
function showToast(msg) {
  let el = document.getElementById('toastEl');
  // ... 独立 DOM 操作 ...
}
```

正确做法：
```javascript
// ✅ 正确 — 复用 core.js 的 toast API
window.toast.success('模型切换为：' + modelName, 2000);
// 或简写（如果 window.toast 已挂载）
toast.success('模型切换为：' + modelName, 2000);
```

如果 page-*.js 中已有独立 showToast 函数，应删除并用 `window.toast.*` 替换所有调用点。

## CSS 样式

```css
.toast-container {
  position: fixed; top: 16px; right: 16px; z-index: 9999;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 8px;
  background: var(--bg-card); border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 13px; color: var(--text);
  opacity: 0; transform: translateY(-8px);
  transition: opacity 0.2s, transform 0.2s;
}
.toast-in { opacity: 1; transform: translateY(0); }
.toast-out { opacity: 0; transform: translateY(-8px); }
.toast-success { border-left: 3px solid var(--green); }
.toast-error { border-left: 3px solid var(--red); }
.toast-warning { border-left: 3px solid var(--yellow); }
.toast-info { border-left: 3px solid var(--accent); }
```

## i18n Key

Toast 相关的 i18n key 必须在 `core.js` 的 `LANG.zh`、`LANG.en`、`LANG.tw` 三语区块中同步添加。`app.js` 不被 index.html 加载，所以在 app.js 中添加 i18n key 无效。

## 验证

```javascript
// 浏览器控制台
toast.success('测试成功');
toast.error('测试错误');
toast.warning('测试警告');
toast.info('测试信息', 5000);  // 5秒后消失
```
