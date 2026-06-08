# ECharts Theme Sync Pattern

## Problem
`getComputedStyle(document.documentElement).getPropertyValue('--accent')` returns empty string in SiPer, even though CSS variables are defined in `:root`. This is because SiPer's style.css is compressed (single-line per block) and the browser can't resolve CSS variables from `:root` via `getComputedStyle` in this context.

## Three-Tier Fallback Solution
```javascript
function _readCssVar(name, fallback) {
  // Tier 1: inline style (set by applySidebarTheme via setProperty)
  const inline = document.documentElement.style.getPropertyValue(name).trim();
  if (inline) return inline;
  // Tier 2: computed style
  const computed = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (computed) return computed;
  // Tier 3: hardcoded default
  return fallback;
}

const colors = {
  accent: _readCssVar('--accent', '#2d9e8a'),
  text: _readCssVar('--text', '#e6edf3'),
  bgCard: _readCssVar('--bg-card', '#161b22'),
  border: _readCssVar('--border', '#30363d'),
  red: _readCssVar('--red', '#e53e3e'),
  yellow: _readCssVar('--yellow', '#d29922'),
  cyan: _readCssVar('--cyan', '#06b6d4'),
  green: _readCssVar('--green', '#3fb950'),
  orange: _readCssVar('--orange', '#f0883e'),
};
```

## Theme Switch Sync
In `core.js`, `applySidebarTheme()` sets CSS variables via `document.documentElement.style.setProperty()`. At the end of that function, dispatch a custom event:

```javascript
document.documentElement.dispatchEvent(new CustomEvent('siper-theme-changed'));
```

In `page-token.js`, listen for this event and re-render charts:

```javascript
document.documentElement.addEventListener('siper-theme-changed', () => {
  if (document.getElementById('page-token').classList.contains('active')) {
    refreshTokenStats();
  }
});
```

## Chart Color Schemes
- **Pie chart (model distribution)**: Use `_palette()` — 10 colors derived from theme
- **Line chart (daily trend)**: `colors.accent` for line, `colors.accent` with opacity for area
- **Bar chart (hourly)**: Gradient based on data intensity:
  - 0 → `colors.border` (empty)
  - <20K → `colors.cyan`
  - <50K → `colors.accent`
  - ≥50K → `colors.orange` → `colors.red`
