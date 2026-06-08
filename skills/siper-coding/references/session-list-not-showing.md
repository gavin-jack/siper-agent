# 会话列表"不显示"诊断模式

## 症状
用户报告"会话列表不显示"，切换到 sessions 页面后看不到任何会话项。

## 诊断步骤（按顺序）

### 1. 检查后端 API
```bash
curl -s http://127.0.0.1:9724/api/sessions | python3 -m json.tool | head -30
```
- 如果返回 `{"sessions": []}` → 后端无数据，检查 session manager
- 如果返回带数据的数组 → 后端正常，问题在前端

### 2. 浏览器控制台检查
```javascript
// 检查 DOM 元素是否存在
document.getElementById('sessionsList') ? 'found' : 'NOT FOUND'

// 检查内容
(() => { const el = document.getElementById('sessionsList'); return {children: el.children.length, innerHTML_len: el.innerHTML.length} })()

// 检查可见性
(() => { const el = document.getElementById('sessionsList'); const s = window.getComputedStyle(el); return {display: s.display, visibility: s.visibility, opacity: s.opacity, height: el.offsetHeight, width: el.offsetWidth} })()

// 检查页面是否激活
document.getElementById('page-sessions').classList.contains('active')
```

### 3. 常见原因

| 原因 | 检查方法 | 修复 |
|------|---------|------|
| 浏览器缓存旧版 JS | `curl -s http://127.0.0.1:9724/ \| grep page-sessions.js` 检查版本戳 | Ctrl+Shift+R 硬刷新 |
| 用户停在 chat 页 | `location.hash` 和 `currentPage` | 点击导航"会话"图标 |
| `refreshSessions` 未定义 | `typeof refreshSessions` | 确认 page-sessions.js 已加载 |
| CSS 隐藏 | 检查 `.session-list` 和 `.page` 的 display | 检查 CSS 特异性冲突 |
| 页面未激活 | `page-sessions` 元素是否有 `active` class | 检查 navigateToPage 逻辑 |

### 4. 已知陷阱

- **app.js 和 page-sessions.js 双重定义**：`refreshSessions` 在两个文件中都有定义（app.js:1582, page-sessions.js:2），但模板只加载 page-sessions.js。如果 app.js 被意外引入，会静默覆盖。
- **search_files 对 JS 内容搜索返回 0**：JS 文件内容搜索必须用 `grep -rn`，search_files(target='content') 对 .js 文件无效。
- **session-list CSS 类**：`.session-list { flex: 1; overflow-y: auto; min-width: 0; max-width: 55%; }` — 正常情况不需要固定高度，flex 布局自动撑满。

## 历史案例（2026-05-18）
用户报告会话列表不显示。诊断发现：
- API 正常返回 48 个会话
- DOM 元素存在，innerHTML 有 50 个子元素
- computed styles 正常（display: block, visibility: visible, opacity: 1）
- 元素尺寸正常（520x473）
- **结论**：会话列表实际正常渲染，问题可能是用户浏览器缓存或未切换到 sessions 页面
