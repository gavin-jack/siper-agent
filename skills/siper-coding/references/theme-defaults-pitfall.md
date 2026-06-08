# THEME_DEFAULTS 配色不一致陷阱（v0.4.27，v0.4.29 彻底修复）

## 问题描述
`page-theme.js` 中的 `THEME_DEFAULTS` 常量与 `style.css` `:root` 默认值不一致，导致点击"外观→重置默认"后界面变色（如变成蓝黑色或深色）。

## 根因
THEME_DEFAULTS、THEME_PRESETS.light、THEME_SIZES 三处默认值必须与 style.css `:root` 和 `html` 块的 CSS 变量完全同步。任何不一致都会导致重置后恢复为错误配色。

## 正确配色（与 style.css :root 完全一致）

```js
const THEME_DEFAULTS = {
  '--bg': '#c8ebe5', '--bg-sidebar': '#b8ddd6', '--bg-card': '#ddf0ec',
  '--bg-hover': '#a8d5cc', '--border': '#8bbfb5', '--text': '#0a1f1a',
  '--text-dim': '#3a6b5e', '--accent': '#2d9e8a', '--accent2': '#6b5ca8',
  '--green': '#2d9e6a', '--red': '#c0392b', '--yellow': '#b7950b',
  '--orange': '#ca6f1e', '--cyan': '#1abc9c',
  '--sidebar-width': '220px', '--border-radius': '8px',
  '--font-size-base': '18px', '--msg-max-width': '75%', '--chat-padding': '24px',
  '--line-height-base': '1.6', '--font-family-base': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
  '--agent-msg-bg': '#ddf0ec', '--agent-msg-border': '#8bbfb5', '--agent-msg-text': '#0a1f1a',
  '--user-msg-bg': '#2d9e8a', '--user-msg-text': '#ffffff',
};
```

## THEME_PRESETS.light 也必须同步
`THEME_PRESETS.light.colors` 应与 THEME_DEFAULTS 使用相同的值。

## THEME_SIZES def 值也需一致
`--font-size-base` 的 def 值在 THEME_SIZES 中是 `18px`（不是 14px）。

## 修复记录
- v0.4.27: 首次修复，将 THEME_DEFAULTS 从 GitHub 暗色改为青绿色系（但不彻底，THEME_PRESETS.light 和 THEME_SIZES 未同步）
- v0.4.29: 彻底修复，THEME_DEFAULTS/THEME_PRESETS.light/THEME_SIZES 全部与 style.css :root 对齐，补充 --orange/--cyan 变量

## 预防规则
修改 style.css `:root` 或 `html` 块的 CSS 变量默认值时，必须同步更新：
1. `THEME_DEFAULTS`
2. `THEME_PRESETS.light.colors`
3. `THEME_SIZES`（def 值）

新增 CSS 变量时，还需在 `THEME_COLORS` 数组添加条目并在 core.js 中添加 i18n 翻译。

## 注意事项
- 修改后用户 localStorage 中可能仍有旧暗色主题缓存，需提醒硬刷新（Ctrl+Shift+R）
- 所有 CSS 颜色必须通过 var() 引用，禁止硬编码
