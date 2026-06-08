# Model Selector 自定义下拉框重设计

## 背景

聊天输入区的模型选择器从原生 `<select>` 替换为自定义下拉框，以支持：
- 按钮只显示模型名（简洁）
- 展开项显示能力 badge（颜色编码）和提供商名
- 完全可控的样式（原生 `<select>` 无法跨浏览器样式化 option 内容）

## HTML 结构（index.html）

```html
<!-- 旧：原生 select -->
<select id="chatModelSelect" class="chat-model-select">
  <option value="model-name">model-name</option>
</select>

<!-- 新：自定义下拉框 -->
<div class="chat-model-dropdown" id="chatModelDropdown">
  <button class="chat-model-btn" id="chatModelBtn" onclick="toggleModelDropdown()">
    <span id="chatModelBtnText">Model Name</span>
    <svg class="chat-model-arrow" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>
  </button>
  <div class="chat-model-menu" id="chatModelMenu">
    <!-- JS 动态填充 .chat-model-item -->
  </div>
</div>
```

## CSS 类（style.css）

```css
.chat-model-dropdown { position: relative; }
.chat-model-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 6px; border-radius: 6px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  font-size: 11px; cursor: pointer;
}
.chat-model-arrow { width: 10px; height: 10px; fill: none; stroke: currentColor; }
.chat-model-dropdown.open .chat-model-arrow { transform: rotate(180deg); }

.chat-model-menu {
  position: absolute; bottom: 100%; left: 0;
  min-width: 200px; max-height: 300px; overflow-y: auto;
  background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 100; display: none;
}
.chat-model-dropdown.open .chat-model-menu { display: block; }

.chat-model-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; cursor: pointer; font-size: 12px;
}
.chat-model-item:hover { background: var(--bg-hover); }

.chat-model-cap-badge {
  font-size: 9px; padding: 1px 4px; border-radius: 3px;
  font-weight: 600; white-space: nowrap;
}
/* 能力 badge 颜色 */
.chat-model-cap-badge.vision { background: color-mix(in srgb, #3b82f6 20%, transparent); color: #60a5fa; }
.chat-model-cap-badge.reasoning { background: color-mix(in srgb, #a855f7 20%, transparent); color: #c084fc; }
.chat-model-cap-badge.code { background: color-mix(in srgb, #22c55e 20%, transparent); color: #4ade80; }
.chat-model-cap-badge.tts { background: color-mix(in srgb, #f97316 20%, transparent); color: #fb923c; }

.chat-model-item-provider { font-size: 10px; color: var(--text-dim); margin-left: auto; }
```

## JS 函数（page-chat.js）

### renderModelDropdown()
替换旧的 `loadAvailableModels()` 中 `<select>` option 构建循环：

```javascript
function renderModelDropdown() {
  const menu = document.getElementById('chatModelMenu');
  if (!menu) return;
  menu.innerHTML = '';
  const models = availableModels || [];
  models.forEach(m => {
    const item = document.createElement('div');
    item.className = 'chat-model-item';
    item.onclick = () => { currentModel = m.name; updateCurrentModel(m.name); closeModelDropdown(); };
    const nameSpan = document.createElement('span');
    nameSpan.textContent = m.alias || m.name;
    item.appendChild(nameSpan);
    const caps = m.capabilities || {};
    ['vision','reasoning','code','tts'].forEach(cap => {
      if (caps[cap]) {
        const badge = document.createElement('span');
        badge.className = `chat-model-cap-badge ${cap}`;
        badge.textContent = capBadgeLabels[cap] || cap;
        item.appendChild(badge);
      }
    });
    if (m.provider) {
      const prov = document.createElement('span');
      prov.className = 'chat-model-item-provider';
      prov.textContent = m.provider;
      item.appendChild(prov);
    }
    menu.appendChild(item);
  });
}
```

### toggleModelDropdown() / closeModelDropdown()
```javascript
function toggleModelDropdown() {
  document.getElementById('chatModelDropdown').classList.toggle('open');
}
function closeModelDropdown() {
  document.getElementById('chatModelDropdown').classList.remove('open');
}
// 点击外部关闭
document.addEventListener('click', (e) => {
  const dd = document.getElementById('chatModelDropdown');
  if (dd && !dd.contains(e.target)) closeModelDropdown();
});
```

### updateCurrentModel(name)
```javascript
function updateCurrentModel(name) {
  const btnText = document.getElementById('chatModelBtnText');
  if (btnText) {
    const model = (availableModels || []).find(m => m.name === name);
    btnText.textContent = (model && model.alias) || name;
  }
} // ← 注意：必须有闭合 }
```

## 关键陷阱

### 1. updateCurrentModel 缺少闭合 `}`
多次 patch 同一函数后容易丢失闭合 `}`。patch 后必须 `node -c page-chat.js` 验证。

### 2. 旧 `chatModelSelect` 引用清理
替换 `<select>` 后必须全局清理所有引用：
```bash
grep -rn 'chatModelSelect' webui/
```
包括 loadAvailableModels 中的 option 构建、vision warning modal 中的 selectedIndex 切换等。

### 3. 能力三路同步
verifyModel 能力更新后必须同步到：settingsModelsCache、allGlobalModels、globalModelsList。

### 4. Cache-Buster 版本号
修改 page-chat.js 和 style.css 后必须更新 index.html 中的 `?v=` 版本号。

## 历史

- **commit 5aa0b6e** (2026-08-08): 模型选择器从 `<select>` 替换为自定义下拉框
