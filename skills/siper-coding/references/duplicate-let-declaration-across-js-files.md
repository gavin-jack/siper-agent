# Duplicate `let`/`const` Declarations AND Function Name Collisions Across JS Files

## Problem

When multiple `page-*.js` files are loaded via `<script>` tags in the same HTML page, they share a **single global scope**. This means:

1. **`let`/`const` variables** must be unique across ALL loaded files
2. **`function` declarations** must also be unique — a later file's function silently overwrites the earlier one

### Variable Collision Symptom
```
Uncaught SyntaxError: Identifier 'agentData' has already been declared (at page-agent-config.js:1:1)
```
The second file's script tag throws, breaking ALL functions defined after the duplicate declaration. Event handlers silently fail.

### Function Collision Symptom
No error at all — the later file's function simply replaces the earlier one. If the two functions have different behavior, the page behaves unpredictably with no console error.

## Real Cases (v0.9.9 — page-agent.js vs page-agent-config.js)

**Variable collisions found (8 total):**
- `let agentSettingsData` — both files line 4
- `let agentData` — page-agent.js:207, page-agent-config.js:150
- `let currentViewAgent` — both files
- `let currentAgentTab` — both files
- `let cachedSoulContent` — both files
- `let cachedConfigContent` — both files
- `let cachedMemoryContent` — both files
- `let selectedAvatarFile` — both files

**Function collisions found (7 total):**
- `function refreshAgentConfig()` — both files
- `function onAgentSelectorChange()` — both files
- `function selectAgent()` — both files
- `function switchAgentPageTab()` — both files
- `function switchAgentTab()` — both files
- `function doSwitchAgent()` — both files
- `function showAvatarStatus()` — both files

Result: "智能体配置文件" tab showed blank. Console showed `SyntaxError: Identifier 'agentSettingsData' has already been declared`, then after fixing that, `SyntaxError: Identifier 'agentData' has already been declared`. Each error blocked all subsequent function definitions in the file.

## Diagnosis

### Check variable collisions between two files:
```bash
comm -12 \
  <(grep -oP '^(?:let|var|const) \K\w+' page-agent-config.js | sort -u) \
  <(grep -oP '^(?:let|var|const) \K\w+' page-agent.js | sort -u)
```

### Check function collisions between two files:
```bash
comm -12 \
  <(grep -oP '^function \K\w+' page-agent-config.js | sort -u) \
  <(grep -oP '^function \K\w+' page-agent.js | sort -u)
```

### Check against ALL loaded scripts:
```bash
for f in webui/static/pages/core.js webui/static/pages/page-*.js webui/static/app.js; do
  echo "=== $f ==="
  grep -oP '^(?:let|var|const|function) \K\w+' "$f" | sort -u
done
```

### Browser console check:
1. Open F12 -> look for `SyntaxError: Identifier 'X' has already been declared`
2. If no error but behavior is wrong, check for silent function overwrites

## Fix Pattern (Systematic Rename)

When two page-*.js files collide, rename ALL globals in the **newer/specific** file:

### Step 1: Rename variables with page-specific prefix
```bash
cd webui/static/pages
sed -i 's/\bagentData\b/agentConfigData/g' page-agent-config.js
sed -i 's/\bcurrentViewAgent\b/currentConfigAgent/g' page-agent-config.js
sed -i 's/\bcurrentAgentTab\b/configAgentTab/g' page-agent-config.js
sed -i 's/\bcachedSoulContent\b/cachedConfigSoulContent/g' page-agent-config.js
sed -i 's/\bcachedConfigContent\b/cachedConfigAgentContent/g' page-agent-config.js
sed -i 's/\bcachedMemoryContent\b/cachedConfigMemoryContent/g' page-agent-config.js
sed -i 's/\bselectedAvatarFile\b/selectedConfigAvatarFile/g' page-agent-config.js
```

### Step 2: Rename functions with page-specific prefix
```bash
sed -i 's/\brefreshAgentConfig\b/refreshConfigAgentPanel/g' page-agent-config.js
sed -i 's/\bonAgentSelectorChange\b/onConfigAgentSelectorChange/g' page-agent-config.js
sed -i 's/\bselectAgent\b/selectConfigAgent/g' page-agent-config.js
sed -i 's/\bswitchAgentPageTab\b/switchConfigAgentPageTab/g' page-agent-config.js
sed -i 's/\bswitchAgentTab\b/switchConfigAgentTab/g' page-agent-config.js
sed -i 's/\bdoSwitchAgent\b/doSwitchConfigAgent/g' page-agent-config.js
sed -i 's/\bshowAvatarStatus\b/showConfigAvatarStatus/g' page-agent-config.js
```

### Step 3: Update HTML onclick handlers
```bash
grep -n 'oldFunctionName' webui/templates/index.html
# Patch each reference in onclick="..." attributes
```

### Step 4: Verify no overlap remains
```bash
comm -12 \
  <(grep -oP '^(?:let|var|const|function) \K\w+' page-agent-config.js | sort -u) \
  <(grep -oP '^(?:let|var|const|function) \K\w+' page-agent.js | sort -u)
# Must return empty
```

### Step 5: Touch file and restart SiPer
```bash
touch page-agent-config.js
# Then restart siper_web.py and hard-refresh browser
```

## Prevention Checklist

When adding a new `page-*.js` file:
1. List all global declarations: `grep -oP '^(?:let|var|const|function) \K\w+' page-<new>.js | sort -u`
2. Check against ALL other loaded scripts using `comm -12` pattern above
3. Prefer unique prefixes for each page (e.g., `configAgent*` for agent-config page)
4. Never use generic names like `agentData`, `selectAgent`, `refreshConfig` without checking
5. After renaming, grep HTML for old function names: `grep -n 'oldName' webui/templates/index.html`

## Related

- `references/missing-script-tag-pitfall.md` -- script tag loading order
- `references/partial-code-removal-orphan-reference-pitfall.md` -- removing variable definitions
