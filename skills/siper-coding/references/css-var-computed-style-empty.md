# getComputedStyle 读取 CSS 变量返回空字符串

## 问题
在 SiPer 中，`getComputedStyle(document.documentElement).getPropertyValue('--accent')` 返回空字符串，即使 CSS 变量在 `:root` 中定义。

## 原因
SiPer 的 style.css 是压缩格式，浏览器可能无法正确解析 `:root` 中的 CSS 变量（具体原因可能与压缩后的 CSS 文件格式有关）。

## 可靠方案（三级降级）

```javascript
function getCssVar(name, fallback) {
  // 1. 优先读 inline style（applySidebarTheme 通过 setProperty 设置）
  const inline = document.documentElement.style.getPropertyValue(name).trim();
  if (inline) return inline;
  // 2. fallback 到 computed style
  const computed = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (computed) return computed;
  // 3. 最终 fallback 到硬编码默认值
  return fallback;
}

// 使用
const accent = getCssVar('--accent', '#2d9e8a');
const text = getCssVar('--text', '#e6edf3');
```

## 主题切换同步
在 `applySidebarTheme` 末尾触发自定义事件：
```javascript
document.documentElement.dispatchEvent(new CustomEvent('siper-theme-changed'));
```

page-token.js 监听此事件重绘图表：
```javascript
document.documentElement.addEventListener('siper-theme-changed', () => {
  if (document.getElementById('page-token').classList.contains('active')) {
    refreshTokenStats();
  }
});
```
