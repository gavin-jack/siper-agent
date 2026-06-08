# Settings Modal 实现参考

## 概述

侧边栏 ⚙️ 按钮打开全局设置弹窗（modal），替代了原来的侧边栏滑动面板。

## HTML 结构

```
body
  └─ .sidebar
       └─ .sidebar-footer
            └─ button#sidebarSettingsToggle  ← 触发按钮
  └─ .settings-modal-overlay#settingsModalOverlay  ← 遮罩层（body 直接子元素）
       └─ .settings-modal
            ├─ .settings-modal-header
            │    ├─ .settings-modal-title
            │    └─ .settings-modal-close (×)
            ├─ .settings-modal-body
            │    ├─ .settings-field (label + input，纵向)
            │    ├─ .settings-divider (分组标题)
            │    └─ .settings-field-inline (label + checkbox，横向)
            └─ .settings-modal-actions
                 ├─ .settings-modal-btn-save
                 └─ .settings-modal-btn-reset
```

**关键**：modal 必须是 body 的直接子元素，不是 sidebar 的子元素。

## CSS 类命名映射

| 旧（面板） | 新（弹窗） |
|---|---|
| `.sidebar-settings-panel` | `.settings-modal-overlay` |
| `.ssp-header` | `.settings-modal-header` |
| `.ssp-title` | `.settings-modal-title` |
| `.ssp-close` | `.settings-modal-close` |
| `.ssp-body` | `.settings-modal-body` |
| `.ssp-field` | `.settings-field` |
| `.ssp-actions` | `.settings-modal-actions` |
| `.ssp-btn` | `.settings-modal-btn` |

## 关键 CSS 模式

### 遮罩层
```css
.settings-modal-overlay {
  display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 9999;
  align-items: center; justify-content: center;
  animation: cfadeIn 0.15s ease forwards;
}
.settings-modal-overlay.open { display: flex; }
```

### 弹窗卡片
```css
.settings-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 16px; padding: 0; width: 980px; max-width: 90vw;
  box-shadow: 0 12px 48px rgba(10,31,26,0.15);
  animation: cslideIn 0.2s ease forwards;
  display: flex; flex-direction: column;
}
```
> 宽度从 420px 改为 980px（v0.7.4+），以容纳更多设置项。

### 分组标题（分割线）
```css
.settings-divider {
  font-size: 11px; font-weight: 600; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin: 16px 0 10px; padding-top: 12px;
  border-top: 1px solid var(--border);
}
```

### 横向 checkbox 行
```css
.settings-field-inline {
  display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
}
.settings-field-inline label:first-child {
  flex: 1; margin-bottom: 0; font-size: 12px; color: var(--text);
}
.toggle-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--text-dim); cursor: pointer; white-space: nowrap;
}
.toggle-label input[type="checkbox"] {
  accent-color: var(--accent); cursor: pointer;
}
```

## JS 函数

### toggleSidebarSettings()
```javascript
function toggleSidebarSettings() {
  const overlay = document.getElementById('settingsModalOverlay');
  const btn = document.getElementById('sidebarSettingsToggle');
  if (!overlay) return;
  const isOpen = overlay.classList.contains('open');
  if (isOpen) {
    overlay.classList.remove('open');
    if (btn) btn.classList.remove('active');
  } else {
    overlay.classList.add('open');
    if (btn) btn.classList.add('active');
    loadSidebarSettings();
  }
}
```

### loadSidebarSettings() 中加载 meta config
在 `loadSidebarSettings()` 的末尾（fetch 之后）添加：
```javascript
if (typeof loadMetaConfig === 'function') loadMetaConfig();
```

### resetSidebarSettings() 中重置 meta config
在重置函数中添加：
```javascript
localStorage.removeItem('siper_meta_config');
const metaDefaults = {
  cfgMetaTokens: true, cfgMetaTokensBr: false,
  cfgMetaCached: true, cfgMetaCachedBr: false,
  cfgMetaTools: true, cfgMetaToolsBr: false,
  cfgMetaSkills: true, cfgMetaSkillsBr: false,
  cfgMetaTime: true, cfgMetaTimeBr: false,
  cfgMetaToolSteps: true, cfgMetaDebug: false,
};
Object.keys(metaDefaults).forEach(id => {
  const el = document.getElementById(id);
  if (el) el.checked = metaDefaults[id];
});
```

## 关闭方式
1. 点击 × 按钮
2. 点击遮罩层（`onclick="if(event.target===this)toggleSidebarSettings()"`）

## 注意事项
- modal 打开时 body 不应滚动（当前未加 overflow: hidden，如需要可加）
- 弹窗内 input 的 id 与页面设置页（page-global-settings）的 id 不同（sbCfg* vs cfg*），避免冲突
- saveSidebarSettings() 保存到 `/api/config`，saveMetaConfig() 保存到 localStorage

---

## Debug 模式（v0.7.4+）

### 功能
在设置弹窗的"开发者选项"分区中，有一个"Debug 模式"开关。开启后，每条 Agent 消息的气泡下方会显示完整的 LLM 响应数据（JSON dict），包含 response、session_id、usage、tool_calls 等所有字段。

### 实现要点

**1. Meta config 新增 `showDebug` 字段**
- `saveMetaConfig()` 中读取 `cfgMetaDebug` checkbox 状态
- `loadMetaConfig()` 中恢复 `cfgMetaDebug` checkbox 状态
- `getMetaConfig()` 默认值：`showDebug: false`

**2. 后端数据传递**
- `core.js` 的 `stream_end` 处理：将 `d.data` 保存到 `_streamRawData`，stream_end 时追加 debug 区块到最后一个 agent bubble
- `core.js` 的 `response` 处理：在 meta 对象中加 `_raw: _data`
- `page-chat.js` 的 `appendMeta()`：当 `cfg.showDebug && meta._raw` 时，创建 `.msg-debug-block > .msg-debug-pre` 渲染 JSON

**3. CSS 样式**
```css
.msg-debug-block { margin-top: 8px; }
.msg-debug-pre {
  font-size: 11px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  color: var(--text-dim);
  background: rgba(0,0,0,0.06);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  line-height: 1.5;
}
```

**4. i18n 键**
- `settings.debug`: "Debug 模式" / "Debug Mode" / "Debug 模式"
- `settings.debugDesc`: "在消息下方显示完整响应数据" / "Show full response data below messages" / "在訊息下方顯示完整回應資料"

**5. 行为**
- Debug 模式开启后，仅影响新收到的消息（已渲染的消息不会自动更新）
- 关闭 Debug 模式后，新消息不再显示 debug 区块
- Debug 区块使用 `<pre>` 格式化 JSON，`max-height: 300px` + `overflow-y: auto` 防止超长响应撑破布局
