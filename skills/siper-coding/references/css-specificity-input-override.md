# CSS 选择器特异性陷阱：generic element 规则覆盖 class 规则

## 问题描述

在 `style.css` 中，泛型元素选择器（如 `input[type="text"]`）与类选择器（如 `.my-class`）具有相同的特异性（specificity 0,1,0），当泛型规则出现在类规则**之后**时，会覆盖类规则的样式。

## 复现路径

在 SiPer 项目中：
```css
/* 第 527 行：类选择器 */
.session-quick-input-field {
  width: 90px; padding: 3px 6px; font-size: 11px;
}

/* 第 564 行：泛型选择器（后出现，覆盖上面的规则） */
input[type="text"], input[type="number"], select {
  width: 260px; padding: 6px 10px; font-size: 13px;
}
```

结果：`.session-quick-input-field` 的实际 computed style 是 width:260px, padding:6px 10px, font-size:13px — 类规则完全失效。

## 诊断方法

browser_console 中检查：
```js
const s = window.getComputedStyle(document.querySelector('.session-quick-input-field'));
console.log(s.width, s.padding, s.fontSize);
// 如果与 CSS 文件中的值不符，说明被覆盖
```

查找覆盖源：
```js
const inp = document.querySelector('.session-quick-input-field');
for (const sheet of document.styleSheets) {
  for (const rule of sheet.cssRules) {
    if (rule.selectorText && inp.matches(rule.selectorText)) {
      console.log(rule.selectorText, rule.cssText);
    }
  }
}
```

## 修复方案

**方案 A（推荐）**：增加特异性，使用复合选择器：
```css
/* 特异性 0,2,0 — 高于 input[type="text"] 的 0,1,0 */
.session-quick-input .session-quick-input-field {
  width: 90px; padding: 3px 6px; font-size: 11px;
}
```

**方案 B**：使用 `!important`（不推荐，难以维护）：
```css
.session-quick-input-field {
  width: 90px !important; padding: 3px 6px !important;
}
```

**方案 C**：在泛型规则中排除特定类（繁琐）：
```css
input[type="text"]:not(.session-quick-input-field) { ... }
```

## 适用场景

在 SiPer 项目中，为 session 列表、侧边栏等区域添加自定义输入框时，务必使用复合父选择器来避免被全局 `input[type="text"]` 规则覆盖。

## 相关文件

- `webui/static/style.css`：第 564 行 `input[type="text"]` 泛型规则
- `references/html-class-attribute-pitfall.md`：HTML class 属性相关的其他陷阱
