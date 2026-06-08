# 去掉保存按钮改为自动保存模式（v0.9.82+）

> 涉及文件：`page-agent-config.js`、`page-settings.js`、`core.js`

## 触发场景

用户要求"去掉保存按钮，改为自动保存"或"保存后显示一次toast提醒"。

## 完整改动清单

### 1. 移除保存按钮

```javascript
// 之前
<div class="flex-end-mt">
  <button class="btn-sm primary" onclick="saveXxx()">保存模型设置</button>
</div>

// 之后
<div class="flex-end-mt" style="font-size:11px;color:var(--text-dim)">✦ 自动保存</div>
```

### 2. 给表单元素加 onchange

```javascript
// select 元素
<select id="xxx" onchange="autoSaveXxx()" ...>

// checkbox 元素
<input type="checkbox" class="xxx" onchange="autoSaveXxx()" ...>
```

### 3. 新增防抖自动保存函数

```javascript
let _autoSaveTimer = null;

function autoSaveXxx() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    if (!currentConfigAgent) return;  // 守卫条件
    // 收集表单数据
    const body = { ... };
    try {
      const r = await fetch('/api/xxx', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) toast.success(t('xxx.saved'), 1500);
      else toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
    } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
  }, 300);
}
```

### 4. 修改现有 autoSave 函数加成功 toast

```javascript
// 之前：只有失败提示
if (!d.success) toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));

// 之后：成功也提示
if (!d.success) toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
else toast.success(t('settings.modelSaved'), 1500);
```

### 5. 添加 i18n key

在 core.js 的 zh/en/tw 三语言包中添加：
```javascript
'xxx.saved': 'xxx已保存',       // zh
'xxx.saved': 'xxx saved',       // en
'xxx.saved': 'xxx已儲存',       // tw
```

## ⚠️ 避免双重 toast

**核心原则：autoSave 函数内联保存逻辑，不要调用原有的 saveXxx() 函数。**

如果 `saveXxx()` 内部已有 `toast.success(t('xxx.saved'))`，而 `autoSaveXxx()` 调用 `saveXxx()` 后又加一次 toast，用户会看到两个 toast。

**解决方案：** autoSave 函数直接内联 API 调用 + toast，不调用 saveXxx()。

**典型案例（v0.9.82+）：** `saveModelEdit()` 编辑模型弹窗保存时，调用 `autoSaveModels()`（300ms 防抖，成功后自动 toast），然后又手动 `toast.success(t('settings.modelSaved'))`，导致双重 toast。修复：移除 `saveModelEdit` 中的手动 toast，只保留 `autoSaveModels()` 的。

## ⚠️ toast 系统防重复机制（v0.9.82+）

`core.js` 的 `toast._show()` 方法内置了防重复逻辑：

```javascript
// toast 对象中
_recent: new Map(), // anti-dup: message -> timestamp

_show(message, type, duration) {
  // Anti-dedup: same message within 1s is ignored
  const now = Date.now();
  const key = type + ':' + message;
  if (this._recent.has(key) && now - this._recent.get(key) < 1000) return null;
  this._recent.set(key, now);
  // Cleanup old entries
  if (this._recent.size > 50) {
    for (const [k, v] of this._recent) { if (now - v > 5000) this._recent.delete(k); }
  }
  // ... 正常创建 toast DOM
}
```

**效果：** 相同 `type:message` 组合在 1 秒内只显示一次。即使代码路径意外多次调用 `toast.success('xxx')`，用户只会看到一个。

**注意：** key 是 `type + ':' + message`，翻译后的文本不同不会误拦。

## ⚠️ autoSaveModels 和 autoSaveRuntimeSettings 共用 timer

`page-settings.js` 中 `autoSaveModels()` 和 `autoSaveRuntimeSettings()` 共用同一个 `_autoSaveTimer`。快速连续调用时，后一个会 cancel 前一个的 timer，导致前一个的保存被吞掉。

**当前行为：** 不会产生重复 toast（因为只有一个会执行），但可能导致 runtime settings 保存丢失。

**修复方案（未实施）：** 给各自独立的 timer 变量。

## ⚠️ 防抖时间选择

- 模型配置（select/checkbox onchange）：300ms
- 文本输入（input onchange）：500ms
- 全局设置（多个字段）：500ms

### 6. 保存成功后刷新对话栏模型选择

在 `autoSaveModels()` / `autoSaveAgentModels()` 成功后，调用 `loadAvailableModels()` 刷新对话栏的模型下拉框：

```javascript
// 在 autoSave 函数的 else 分支中加：
if (d.success) {
  toast.success(t('xxx.saved'), 1500);
  if (typeof loadAvailableModels === 'function') loadAvailableModels();
}
```

**原理：** `loadAvailableModels()` 定义在 `page-chat.js` 中，`function` 声明自动挂到 `window` 上，跨文件可直接调用。它从 `/api/models/global` 和 `/api/config` 重新拉取模型列表和 agent available_models，更新 `#chatModelSelect` 下拉框。

**安全守卫：** 用 `typeof loadAvailableModels === 'function'` 确保 page-chat.js 已加载（对话栏可能未打开）。

**适用场景：**
- 设置页面（全局模型增删/默认模型切换）→ `autoSaveModels()` 成功后调用
- 智能体配置页面（per-agent available_models 修改）→ `autoSaveAgentModels()` 成功后调用
- 两者都影响对话栏模型选择

## 验证

1. 切换 select 选项 → 1.5s 后出现绿色 toast "模型设置已保存"
2. 勾选/取消 checkbox → 同上
3. 刷新页面 → 设置已持久化
4. 断网状态下操作 → 出现红色 toast "保存失败"
5. **打开对话栏 → 模型下拉框自动同步最新模型列表（无需手动刷新页面）**
