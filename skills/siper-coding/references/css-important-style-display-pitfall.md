# classList.toggle() 第二参数兼容性与 CSS !important 陷阱

## classList.toggle(name, force) 第二参数兼容性问题

### 问题描述
`classList.toggle('hidden', condition)` 的第二个参数（force）在某些浏览器/环境下不生效：
- 条件为 `false` 时应该移除类，但类仍然保留
- 条件为 `true` 时应该添加类，但类仍然缺失

### 实际案例
SiPer Web UI 的 `switchAgentPageTab()` 在 browser tool 的 WebKit 环境中：
```javascript
// ❌ 不可靠 — 第二参数在某些环境下不工作
el.classList.toggle('hidden', tab !== 'files');
```
手动测试：`toggle('hidden', false)` 多次调用后元素仍有 `hidden` 类。

### 安全替代方案
```javascript
// ✅ 可靠 — 用数组下标操作 add/remove
el.classList[condition ? 'add' : 'remove']('hidden');

// 或者显式 if/else
if (condition) el.classList.add('hidden');
else el.classList.remove('hidden');
```

### 规则
**永远不要依赖 `classList.toggle()` 的第二参数。** 始终使用三元表达式或 if/else。

---

## CSS !important 与 JS style.display 冲突

### 问题描述
当 CSS 中某类定义了 `display: none !important`（如 `.hidden { display: none !important; }`），
JS 中用 `element.style.display = ''` 或 `element.style.display = 'block'` **无法覆盖** `!important`。

### 实际案例
SiPer Web UI 的 `switchAgentPageTab()` 旧版实现：
```javascript
// ❌ 错误写法 — style.display 无法覆盖 !important
function switchAgentPageTab(tab) {
  document.getElementById('agentTabContentAbout').style.display = (tab === 'about' ? '' : 'none');
  document.getElementById('agentTabContentFiles').style.display = (tab === 'files' ? '' : 'none');
}
```
结果：切换标签后内容区域始终空白。

### 正确写法
```javascript
// ✅ 正确写法 — 用 classList 操作 CSS 类（不用 toggle 第二参数）
function switchAgentPageTab(tab) {
  document.getElementById('agentTabContentAbout').classList[tab !== 'about' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentFiles').classList[tab !== 'files' ? 'add' : 'remove']('hidden');
}
```

## 通用规则

1. CSS 有 `!important` 时，JS 必须用 `classList.add/remove` 操作类，不能用 `style.display`
2. `style.display = ''` 只是清空内联样式，不会移除 CSS 类
3. `classList.toggle(name, force)` 的第二参数不可靠，用 `classList[condition?'add':'remove'](name)` 替代
4. **替代方案**：如果无法修改 JS，可以从 CSS 中移除 `!important`，让 `style.display` 能正常工作。但需注意：移除 `!important` 后，其他依赖 `.hidden` 的规则可能受影响。**推荐用 `classList.add/remove` 而非修改 CSS。**

## 实际案例（v0.9.7）

`page-agent-config.js` 的 `switchAgentPageTab()` 用 `style.display` 切换标签页内容，但 `.hidden { display: none !important; }` 导致失败。
同时 `classList.toggle('hidden', condition)` 的第二参数在 browser tool 中不生效。

**修复**：
1. JS: `style.display` → `classList[condition?'add':'remove']('hidden')`
2. CSS: `.hidden { display: none !important; }` → `.hidden { display: none; }`（防御性修改，确保即使旧版JS也能工作）

**注意**：修改 CSS 后需要 `touch style.css` 更新 mtime，重启 Siper，用户硬刷新浏览器。

## v0.9.8 实际案例：三重保险修复

**场景**：`switchAgentPageTab()` 标签页切换空白，browser tool 缓存旧版 JS 导致修复验证困难。

**三重保险修复**：
1. JS: `style.display` → `classList[condition?'add':'remove']('hidden')`
2. CSS: `.hidden { display: none !important; }` → `.hidden { display: none; }`
3. 模板: 去掉硬编码 `?v=2`，让服务器 mtime 自动注入

**关键教训**：
- browser tool 的 JS 引擎缓存比 HTTP 缓存更顽固——`script.src` 是新版但 `fn.toString()` 是旧版
- 用 `curl` 验证服务器输出，不要依赖 browser tool 的 JS 执行结果
- `Ctrl+Shift+R` 是用户端最终解决方案

## 调试方法
```javascript
var el = document.getElementById('xxx');
'display:' + el.style.display + ' | class:' + el.className + ' | hidden?' + el.classList.contains('hidden')
```
