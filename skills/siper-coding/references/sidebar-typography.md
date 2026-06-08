# Sidebar Typography Adjustment Pattern

## Context
When adjusting sidebar font sizes, three elements must be modified together for visual consistency:

| Element | Selector | Typical Change | Location |
|---------|----------|----------------|----------|
| Top "SiPer" brand | `.sidebar-brand` | 36px → 34px | style.css line ~96 |
| Section titles | `.nav-section-title` | 18px → 16px | style.css line ~105 |
| Page headers | `.page-header h2` | 18px → 16px | style.css line ~377 |

## Pattern

```css
/* Top SiPer brand - reduce by 2px */
.sidebar-brand {
  font-size: 34px;  /* was 36px */
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
  letter-spacing: -1px;
}

/* Section titles (主要功能/智能体/系统) - reduce by 2px */
.nav-section-title {
  font-size: 16px;  /* was 18px */
  font-weight: 600;
  color: var(--text-dim);
  letter-spacing: 0.5px;
  padding: 8px 16px 4px;
}

/* Page headers (对话/会话/任务/etc.) - reduce by 2px */
.page-header h2 { font-size: 16px;  /* was 18px */ font-weight: 600; }
```

## Verification
```bash
grep -n "font-size.*sidebar-brand\|font-size.*nav-section-title\|font-size.*page-header h2" webui/static/style.css
```

## Files Modified
- `webui/static/style.css` (3 locations)

## Related
- No JavaScript changes needed (pure CSS)
- No restart required (CSS is versioned with mtime, browser auto-updates)
