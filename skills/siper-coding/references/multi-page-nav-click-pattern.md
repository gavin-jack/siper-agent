# 独立页面 nav-item 点击跳转模式

多页面架构中，nav-item 点击必须使用整页跳转（`window.location.href`），不能经过 SPA 的 `navigateToPage`/`hash` 路由逻辑。

详见主 SKILL.md 陷阱 #120。

---

另见：`references/multi-page-autoload-pitfalls.md`（auto-load、共享函数、switchSession 等补充陷阱）

## 解决方案

nav-item 点击改为整页跳转：

```javascript
// ===== Navigation =====
// Independent page mode: nav clicks do full page loads via URL routing
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (!page) return;
    const urlMap = {
      'chat': '/chat',
      'sessions': '/sessions',
      'models': '/models',
      'tasks': '/tasks',
      'memory': '/memory',
      'skills': '/skills',
      'logs': '/logs',
      'token': '/token',
      'global-settings': '/settings',
      'gateway': '/gateway',
      'agent-config': '/agent-config',
      'theme-settings': '/theme-settings',
    };
    const url = urlMap[page] || '/' + page;
    window.location.href = url;
  });
});
```

## 同时必须修改

1. **hashchange 监听器** — 独立页面模式下忽略：
```javascript
window.addEventListener('hashchange', () => {
  if (document.querySelector('meta[name="current-page"]')) return;
  const hash = location.hash.slice(1);
  if (hash && hash !== currentPage) {
    navigateToPage(hash);
  }
});
```

2. **DOMContentLoaded** — 独立页面模式不调用 navigateToPage：
```javascript
const metaPage = document.querySelector('meta[name="current-page"]')?.content;
if (metaPage) {
  currentPage = metaPage;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navItem = document.querySelector('.nav-item[data-page="' + metaPage + '"]');
  if (navItem) navItem.classList.add('active');
  const pgEl = document.getElementById('page-' + metaPage);
  if (pgEl) pgEl.classList.add('active');
  if (metaPage === 'theme-settings') showThemeSettings();
  return;
}
```

## 验证

- 在任意页面点击侧边栏每个 nav-item
- URL 变化为 `/xxx`（非 `#xxx`）
- 目标页面主内容正确渲染
- 侧边栏对应 nav-item 高亮

## 常见陷阱

- nav-item 点击用 hash 切换而非整页跳转 → 目标页面 div 不存在导致空白
- 忘记修改 hashchange 监听器 → URL hash 变化时仍尝试 SPA 切换
- DOMContentLoaded 中独立页面分支调用了 navigateToPage → 触发不必要的 refresh 函数
