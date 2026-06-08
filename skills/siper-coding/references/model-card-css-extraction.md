# Model Card 样式提取到 CSS

## 背景

page-settings.js 中 `renderSettingsModelsList()` 的 model-card HTML 大量使用内联 style，导致：
- JS 代码冗长难维护
- 无法复用样式
- 修改样式需要改 JS 而非 CSS

## 模式：从内联样式提取到 CSS 类

### 步骤

1. **识别所有内联 style 属性**：`grep -n 'style="' page-settings.js`
2. **为每个唯一的样式组创建 CSS 类**：
   - `.model-card` — 基础卡片（padding, border, radius, flex）
   - `.model-card-header` — 头部 flex 布局
   - `.model-name-scroll` — 名称滚动容器
   - `.model-name-text` — 名称文字
   - `.model-default-badge` — 默认标签
   - `.model-card-provider` — 提供商/上下文行（12px）
   - `.model-card-caps` — 能力 badges 行（高度 18px）
   - `.cap-badge` — 能力标签
   - `.model-card-actions` — 操作按钮行
   - `.model-card-pending` — 验证中状态
   - `.model-verify-icon` / `.model-verify-pass` / `.model-verify-fail` / `.model-verify-pending` — 验证图标
   - `.btn-sm-disabled` — 禁用按钮
   - `.btn-copy-model` — 复制按钮
3. **在 style.css 中添加对应 CSS**
4. **替换 JS 中的内联 style 为 class**
5. **版本号更新**：style.css 添加 `?v=` 版本号

### CSS 技巧

**半透明背景**：使用 `color-mix()` 而非带透明度的 hex

```css
/* ❌ 错误：CSS 不支持 */
background: var(--text-dim, #6b7280) 22;

/* ✅ 正确：使用 color-mix */
background: color-mix(in srgb, var(--text-dim, #6b7280) 22%, transparent);
border: 1px solid color-mix(in srgb, var(--text-dim, #6b7280) 44%, transparent);
```

### 注意事项

- CSS 修改后必须添加/更新 `?v=` 版本号，否则浏览器缓存旧版
- 每次修改 style.css 后更新 index.html 中的版本号
- model-card 的 discover 列表和 settings 列表样式不同，用 `.model-card-discover` 区分
