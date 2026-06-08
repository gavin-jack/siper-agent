# Theme Settings 页面布局修复

## 问题描述

`theme-preset-bar`（预设主题按钮行）在 HTML 中被放置在 `page-header` 和 `page-body` 之间：

```html
<!-- 错误位置 -->
<div class="page-header">...</div>
<div class="theme-preset-bar" id="themePresetBar">...</div>  <!-- 在 page-body 外部 -->
<div class="page-body">...</div>
```

导致：
1. 按钮行与页面主体内容分离，布局错位
2. CSS 的 `margin: 8px 0 16px` 产生多余顶部间距

## 修复方案

### 1. HTML 结构调整

将 `theme-preset-bar` 移入 `page-body` 内部最上方：

```html
<div class="page-body">
  <div class="theme-preset-bar" id="themePresetBar">
    <span data-i18n="theme.presets" class="text-dim-mr13">预设主题：</span>
  </div>
  <div class="flex-wrap-24">
    ...
  </div>
</div>
```

### 2. CSS 边距调整

```css
/* 修复前 */
.theme-preset-bar { margin: 8px 0 16px; ... }

/* 修复后 */
.theme-preset-bar { margin: 0 0 16px; ... }
```

去掉 top margin（8px），因为现在元素在 `page-body` 内部，不需要额外顶部间距。

## 相关文件

- `webui/templates/index.html` — 第 707-709 行
- `webui/static/style.css` — `.theme-preset-bar` 规则

## 通用原则

所有 `page-*.js` 对应的页面布局中，`page-body` 内部应包含该页面的所有主要内容区域。任何在 `page-header` 和 `page-body` 之间的元素都可能导致布局分离问题。
