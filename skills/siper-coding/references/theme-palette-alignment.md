# 主题配色选择器弹出框左对齐 + 配色删除

## 弹出框左对齐

### 问题

`.theme-palette-menu` 弹出框使用 `left: 50%; transform: translateX(-50%)` 居中显示，但需求要求与 trigger 按钮左对齐。

### 修复

```css
/* 修复前 */
.theme-palette-menu {
  position: absolute; bottom: 32px; left: 50%; transform: translateX(-50%) scale(0.9);
}
.theme-palette-menu.open { display: flex; opacity: 1; transform: translateX(-50%) scale(1); }

/* 修复后 */
.theme-palette-menu {
  position: absolute; bottom: 32px; left: 0; transform: scale(0.9);
}
.theme-palette-menu.open { display: flex; opacity: 1; transform: scale(1); }
```

## 配色方案删除（ocean）

### 删除位置（3 处）

1. **core.js LANG i18n** — 删除 `'theme.presetOcean': '海洋'`（zh 和 en 两处）
2. **core.js THEME_PRESETS** — 删除 `ocean: { ... }` 整个主题定义块
3. **core.js PALETTE_PRESETS** — 删除 `ocean: { label: '海洋', ... }` 条目

### 验证

```bash
grep -n 'ocean' webui/static/pages/core.js
# 应无结果
```

### 注意事项

- `page-theme.js` 的 THEME_PRESETS 不含 ocean（只有 light/dark/forest/rose/midnight/sakura/slate/black），无需修改
- 删除配色后 `buildThemePaletteMenu()` 会自动从 `PALETTE_PRESETS` 重新生成菜单，无需手动更新 HTML
- `color-mix()` 函数用于生成编辑器背景色时，删除 ocean 不影响其他配色

## 相关参考

- `references/theme-defaults-pitfall.md` — 主题默认值陷阱
