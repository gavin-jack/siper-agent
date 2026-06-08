# Hash 路由实现模式（v0.4.32）

## 背景

Siper 是纯静态 HTML + JS 单页应用，没有前端路由框架。页面切换通过 `data-page` 属性 + `classList.add/remove` 实现，URL 不变，刷新后回到默认 chat 页面。

## 方案：Hash Router

用 `location.hash` 记录当前页面（如 `#logs`、`#sessions`），实现刷新后恢复页面状态。

## 实现代码

### 1. 导航点击写入 hash

在 core.js 的 nav-item 点击事件中，`currentPage = page;` 后加一行：

```javascript
location.hash = page;
```

### 2. navigateToPage() 函数

```javascript
function navigateToPage(page) {
  if (!page) return;
  const navItem = document.querySelector('.nav-item[data-page="' + page + '"]');
  if (navItem) navItem.click();
}
```

**注意**：不能跳过 chat（`if (!page || page === 'chat') return`），否则从其他页面后退到 #chat 时无法切换。应改为 `if (!page) return`，让 chat nav-item 的 click 事件自然处理。

### 3. navigateToGlobalSettings() 函数

全局设置按钮不走 nav-item，需单独封装：

```javascript
function navigateToGlobalSettings() {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-global-settings').classList.add('active');
  currentPage = 'global-settings';
  location.hash = 'global-settings';
  refreshGlobalSettings();
}
```

### 4. restoreFromHash() + DOMContentLoaded

```javascript
function restoreFromHash() {
  const hash = location.hash.slice(1);
  if (hash && hash !== 'chat') {
    navigateToPage(hash);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setLang(currentLang);
  restoreFromHash();
});
```

**注意**：旧的 `DOMContentLoaded` 只有 `setLang(currentLang)`，需要合并到新位置，避免重复注册。

### 5. hashchange 监听

```javascript
window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  if (hash && hash !== currentPage) {
    navigateToPage(hash);
  }
});
```

`hash !== currentPage` 防止重复切换（navigateToPage 内部会更新 currentPage）。

## 与 Vue Router hash 模式对比

| 特性 | Siper Hash Router | Vue Router (hermes-web-ui) |
|------|-------------------|---------------------------|
| URL 格式 | `#logs` | `#/hermes/jobs` |
| 路由匹配 | 手动 querySelector | 框架自动匹配 |
| 组件加载 | CSS class toggle | 懒加载 import() |
| 前进后退 | hashchange 事件 | 框架内置 |
| 实现复杂度 | ~30 行代码 | 框架封装 |

两者核心原理相同：hash 部分在刷新时保留，启动时读取 hash 恢复页面。

## 调试方法

1. 检查 hash 是否正确写入：`location.hash` 应返回 `#logs` 等
2. 检查页面是否正确切换：`currentPage` 应返回对应页面名
3. 检查 nav-item 高亮：对应的 `.nav-item` 应有 `active` class
4. 刷新测试：在日志页按 F5，刷新后应仍在日志页
5. 后退测试：从日志页切到会话页，按浏览器后退，应回到日志页且 hash 变为之前的值
