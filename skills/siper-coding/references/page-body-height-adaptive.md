# page-body 高度自适应模式（v0.9.34+）

## 问题现象

内容少的页面（如空任务列表、空记忆页）出现大片空白——page-body 占满了整个视口，但内容只占一小部分。

## 根因

`.page-body` 设置了 `flex: 1`，在 flex 容器（`.page`）中会**强制占满剩余空间**。当内容少时，空白出现在 page-body 下方。

```css
/* 旧版 — 强制撑满 */
.page-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
```

## 修复方案

```css
/* 新版 — 内容自适应 + 最大高度限制 */
.page-body {
  flex: 0 0 auto;              /* 不强制撑满，根据内容自适应 */
  overflow-y: auto;             /* 内容多时可滚动 */
  padding: 12px 16px;
  max-height: calc(100vh - 64px); /* 限制最大高度，64px ≈ page-header */
}
```

## 特殊页面覆盖

Sessions 等需要撑满高度的页面（`page-body-flex`）单独设置：

```css
.page-body-flex {
  flex: 1;                      /* 恢复撑满 */
  display: flex;
  gap: 16px;
  overflow: hidden;
  min-height: 0;                /* 允许 flex 子项收缩 */
}
```

## 诊断方法

1. **检查空白**：`body.offsetHeight` 远大于内容实际高度
2. **检查内容是否全部可见**：`maxBottom <= clientH`
   ```js
   const pb = document.querySelector('.page-body');
   let maxBottom = 0;
   pb.querySelectorAll('*').forEach(el => {
     const rect = el.getBoundingClientRect();
     const bottom = rect.bottom - pb.getBoundingClientRect().top;
     if (bottom > maxBottom) maxBottom = bottom;
   });
   const allVisible = maxBottom <= pb.clientHeight;
   ```
3. **注意**：`scrollH > clientH` 不一定是溢出——scrollH 包含 padding，clientH 不包含

## 浏览器 CSS 缓存陷阱

browser tool 有独立 CSS 缓存机制。修改 style.css 后，即使服务器文件已更新，browser tool 仍可能加载旧版。

**强制刷新方法**：
```js
document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
  const href = l.href.split('?')[0];
  l.href = href + '?t=' + Date.now();
});
```

## 压缩间距配合

page-body 高度自适应后，配合以下间距压缩避免内容溢出：

| CSS 属性 | 旧值 | 新值 |
|---|---|---|
| `.page-body` padding | `20px 24px` | `12px 16px` |
| `.card` padding | `16px` | `12px` |
| `.card` margin-bottom | `12px` | `0`（用 `.card+.card { margin-top: 8px }` 替代）|
| `.card-title` margin-bottom | `10px` | `6px` |
| `.form-row` margin-bottom | `10px` | `6px` |
| `.settings-divider` margin | `16px 0 10px` | `10px 0 6px` |
| `.stat-card` padding | `14px 16px` | `10px 12px` |
| `.stat-card .value` font-size | `24px` | `18px` |
