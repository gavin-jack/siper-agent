# HTML-JS Function Name Consistency Audit

## Problem

HTML `onclick="functionName()"` calls can reference functions that don't exist in any loaded JS file. This causes silent failures — clicking the button does nothing, no console error (the attribute is just a string, not validated at parse time).

## Real Cases (v0.9.10)

| HTML calls | Actual function in JS | Fix |
|---|---|---|
| `saveGlobalSettings()` | `saveSettingsModels()` in page-settings.js | Rename HTML to `saveSettingsModels()` |
| `addModelToList()` | `addModelToSettings()` in page-settings.js | Rename HTML to `addModelToSettings()` |
| `resetGlobalSettings()` | Did not exist at all | Create function in page-settings.js |

## Diagnosis: Find all HTML onclick calls

```bash
grep -oP 'onclick="(\w+)\(' webui/templates/index.html | grep -oP '(?<=")\w+' | sort -u
```

## Diagnosis: Verify each function exists in JS

```bash
for fn in $(grep -oP 'onclick="(\w+)\(' webui/templates/index.html | grep -oP '(?<=")\w+' | sort -u); do
  if ! grep -qrP "function\s+\b${fn}\b" webui/static/pages/; then
    echo "MISSING: $fn"
  fi
done
```

**Note:** The grep pattern `function\s+\b${fn}\b` matches both `function fn()` and `async function fn()`. Built-in functions like `showConfirm` live in `core.js`, page-specific ones in `page-*.js`.

## Fix Pattern

1. If function exists under a different name → update HTML `onclick`
2. If function doesn't exist at all → create it in the appropriate `page-*.js`
3. If function was removed → remove the HTML button or replace with working function

## Also Check: Duplicate Function Definitions

A function defined in two files doesn't throw an error — the later-loaded file silently overwrites the earlier one. Check with:

```bash
for fn in $(grep -oP '^function \K\w+' page-agent-config.js); do
  if grep -qP "function\s+\b${fn}\b" page-agent.js; then
    echo "DUPLICATE: $fn (defined in both page-agent-config.js and page-agent.js)"
  fi
done
```

## Prevention

- When renaming a JS function, always `grep -n 'oldName' webui/templates/index.html` to find HTML references
- When removing a JS function, check HTML for orphaned `onclick` references
- When adding a new button in HTML, verify the function name matches exactly (including case) with the JS definition
