# i18n applyLang() 图标丢失 Bug（v0.9.87z）

## 现象

切换语言（中/英/繁）后，侧边栏 nav-item 的 emoji 图标（💬、📋、⚡ 等）消失，只剩文字。

## 根因

`core.js` 的 `applyLang()` 函数中，用 `el.querySelector('.icon')` 查找图标元素。
但 nav-item 的 HTML 结构是：

```html
<div class="nav-item icon" data-page="chat" data-i18n="nav.chat">
  <span>💬</span>
  <span>对话</span>
</div>
```

图标是第一个 `<span>`，没有 `.icon` 类（`.icon` 在 div 上）。
`querySelector('.icon')` 返回 null → `innerHTML = ''` 清空后图标丢失。

## 修复

```js
// ❌ 错误：按 class 查找图标
const icon = el.querySelector('.icon');

// ✅ 正确：按位置查找第一个 span（图标 span）
const icon = el.querySelector('span:first-child');
const iconHtml = icon ? icon.outerHTML : '';
const badgeHtml = badge ? badge.outerHTML : '';
el.innerHTML = iconHtml + ' ' + t(key) + badgeHtml;
```

## 通用模式

**重建 i18n 元素内容时，必须保留非文本子元素（图标、badge）**：
1. 用 `querySelector` 按位置/特征查找图标和 badge（不依赖 class）
2. 用 `outerHTML` 序列化保留
3. 用 `innerHTML = iconHtml + text + badgeHtml` 重新拼接
4. 图标和文本之间加空格分隔

## 诊断

1. 切换语言后 `document.querySelector('.nav-item[data-page="chat"]').textContent` 不含 emoji
2. `document.querySelector('.nav-item[data-page="chat"]').querySelectorAll('span')` 只剩 1 个 span

## 关联

- `selectLang()` 函数（core.js:2629）调用 `applyLang()` 后刷新文本
- 所有 nav-item 都有 `data-i18n` 属性，是 `applyLang()` 的处理目标
