# 多页面路由调试指南

多页面架构的调试方法和常见陷阱。

详见主 SKILL.md 陷阱 #117、#119、#120。

---

另见：
- `references/multi-page-autoload-pitfalls.md`（auto-load、共享函数、switchSession 等补充陷阱 #121-#124）
- `references/multi-page-nav-click-pattern.md`（nav-item 整页跳转模式）

## 根因分析

SPA 架构中，所有页面在同一个 `index.html` 中通过 JS 切换，URL 不变（只有 hash 变化）。`core.js` 的 `DOMContentLoaded` 事件通过读取 `location.hash` 判断当前页面。

独立页面架构中，每个页面有独立的 URL（如 `/models`），但 URL 没有 hash。`pgHash = location.hash.slice(1)` 返回空字符串，导致 `core.js` 执行默认分支显示 chat 页面。

## 修复方案

### 1. 添加 meta 标签传递页面标识

在 `_base.html` 的 `<head>` 中添加：

```html
<meta name="current-page" content="{{ page }}">
```

其中 `page` 是后端渲染模板时传入的页面标识（如 `chat`、`models`、`sessions` 等）。

### 2. 修改 core.js DOMContentLoaded 逻辑

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // 优先从 meta 标签获取当前页面（独立页面）
  const metaPage = document.querySelector('meta[name="current-page"]')?.content;
  // 其次从 hash 获取（SPA 兼容）
  const pgHash = location.hash.slice(1);
  
  let pageToShow = null;
  if (metaPage) {
    pageToShow = metaPage;
  } else if (pgHash && pgHash !== 'chat') {
    pageToShow = pgHash;
  }
  
  if (pageToShow) {
    navigateToPage(pageToShow, true);
  } else {
    // 默认显示 chat 页面
    currentPage = 'chat';
    document.getElementById('page-chat')?.classList.add('active');
    document.querySelector('.nav-item[data-page="chat"]')?.classList.add('active');
  }
  
  // ... 其他初始化代码
});
```

### 3. 验证步骤

1. 访问每个独立页面 URL（`/chat`、`/sessions`、`/models` 等）
2. 确认主内容区域正常显示
3. 确认侧边栏对应 nav-item 高亮
4. 检查浏览器控制台无 JS 错误
5. 用 `browser_console(expression="document.querySelector('meta[name=\"current-page\"]').content")` 验证 meta 标签值

## 注意事项

- **page-*.js 引用**：每个页面模板必须在 `{% block scripts %}` 中引用对应的 JS 文件，否则页面功能不完整
- **cache-buster**：每个页面模板需要在 `_render_page()` 中注入 JS cache-buster（`?v=<mtime>`），否则 JS 文件会被浏览器缓存旧版本
- **导航高亮**：通过 `page` 变量匹配自动添加 `active` 类到对应 nav-item

## 排查命令

```bash
# 检查所有页面模板的 scripts 引用
grep -l 'block scripts' /home/gavin/.siper/webui/templates/*.html

# 检查 page-*.js 文件是否存在
ls -la /home/gavin/.siper/webui/static/pages/page-*.js

# 测试所有路由
for page in / /chat /sessions /models /tasks /memory /skills /logs /token /settings /gateway /agent-config /theme-settings; do
  curl -s -o /dev/null -w "$page: %{http_code}\n" "http://127.0.0.1:19724$page"
done
```
