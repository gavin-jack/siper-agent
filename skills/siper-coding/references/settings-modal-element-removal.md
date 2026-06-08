# Settings Modal Element Removal Pattern

## Context
When removing UI elements from the settings modal (e.g., moving model/API config to a separate tab), changes must be synchronized across multiple files.

## Affected Files

| File | Role | Changes Needed |
|------|------|----------------|
| `index.html` | HTML template | Remove `<div class="settings-field">` blocks |
| `page-settings.js` | Sidebar settings logic | Remove save/reset references to removed inputs |
| `core.js` | Core settings logic | Remove load/save/reset/apply references |

## Pattern

### Step 1: Remove HTML Elements
```html
<!-- Before -->
<div class="settings-field">
  <label data-i18n="settings.model">模型名称</label>
  <input type="text" id="sbCfgModel" placeholder="LongCat-2.0-Preview">
</div>

<!-- After -->
<!-- Element removed entirely -->
```

### Step 2: Update page-settings.js
```javascript
// saveSidebarSettings() - remove from body
const body = {
  // model: document.getElementById('sbCfgModel').value,  // REMOVE
  // base_url: document.getElementById('sbCfgBaseUrl').value,  // REMOVE
  // api_key: document.getElementById('sbCfgApiKey').value,  // REMOVE
  // port: document.getElementById('sbCfgPort').value,  // REMOVE
  models: settingsModelsCache,
  default_model: settingsCache ? settingsCache.default_model : '',
};

// resetSidebarSettings() - remove reset code
document.getElementById('sbCfgModel').value = 'LongCat-2.0-Preview';  // REMOVE
```

### Step 3: Update core.js
```javascript
// loadSidebarSettings() - remove fetch and setVal calls
fetch('/api/config').then(r => r.json()).then(d => {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('sbCfgModel', d.model);  // REMOVE
  setVal('sbCfgBaseUrl', d.base_url);  // REMOVE
  setVal('sbCfgApiKey', d.api_key);  // REMOVE
  setVal('sbCfgPort', d.port);  // REMOVE
  // ...
}).catch(() => {});

// applyAccentColor() - remove entire function if sbCfgAccent removed
function applyAccentColor(val) { ... }  // REMOVE

// saveSidebarSettings() - remove API call, only save theme
const body = { ... };  // REMOVE - just save theme to localStorage

// resetSidebarSettings() - remove config field resets
document.getElementById('sbCfgModel').value = 'LongCat-2.0-Preview';  // REMOVE
document.getElementById('sbCfgAccent').value = '#2d9e8a';  // REMOVE
```

### Step 4: Update related functions
```javascript
// applySidebarTheme() - remove accentEl sync if sbCfgAccent removed
const accentEl = document.getElementById('sbCfgAccent');
if (accentEl) accentEl.value = preset['--accent'];  // REMOVE
```

## Verification
```bash
# Check for残留 references
grep -rn "sbCfgModel\|sbCfgBaseUrl\|sbCfgApiKey\|sbCfgPort\|sbCfgAccent\|applyAccentColor" \
  webui/templates/index.html \
  webui/static/pages/core.js \
  webui/static/pages/page-settings.js

# Should return nothing if fully cleaned
```

## Example: Session 2026-05-17
Removed from Basic Settings tab:
- 模型名称 (`sbCfgModel`)
- API 地址 (`sbCfgBaseUrl`)
- API Key (`sbCfgApiKey`)
- 端口 (`sbCfgPort`)
- 主色调 (`sbCfgAccent`)

Moved to Models Management tab for model/API config.

## Files Modified
- `webui/templates/index.html`
- `webui/static/pages/page-settings.js`
- `webui/static/pages/core.js`
