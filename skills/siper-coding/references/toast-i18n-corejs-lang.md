# Toast i18n Key 必须在 core.js 的 LANG 中

## 问题现象

Toast 通知显示英文 key 本身（如 `lang.switched`、`skills.refreshed`）而非中文/英文翻译。

## 根因

core.js 有自己独立的 `LANG` 对象定义（第 2 行 `const LANG = {`），`t()` 函数使用 `LANG[currentLang][key]`。

**app.js 不被 index.html 加载**（没有 `<script src="app.js">` 标签），所以在 app.js 中添加 i18n key 完全无效。

## 修复方法

所有 toast 相关的 i18n key 必须在 core.js 的 `LANG.zh`、`LANG.en`、`LANG.tw` 三语区块中同步添加。

典型位置：在 `token.noHistory` 附近（搜索 `'token.noHistory'` 定位）。

```javascript
// LANG.zh 区块
'token.noHistory': '暂无使用记录',
'lang.switched': '已切换语言至',
'skills.refreshed': '技能已刷新',
'logs.refreshed': '日志已刷新',
'settings.refreshed': '设置已刷新',
'settings.refreshFailed': '刷新失败',

// LANG.en 区块
'token.noHistory': 'No usage history',
'lang.switched': 'Language switched to',
'skills.refreshed': 'Skills refreshed',
'logs.refreshed': 'Logs refreshed',
'settings.refreshed': 'Settings refreshed',
'settings.refreshFailed': 'Failed to refresh settings',

// LANG.tw 区块
'token.noHistory': '暫無使用記錄',
'lang.switched': '已切換語言至',
'skills.refreshed': '技能已刷新',
'logs.refreshed': '日誌已刷新',
'settings.refreshed': '設置已刷新',
'settings.refreshFailed': '刷新失敗',
```

## 验证方法

浏览器控制台：
```javascript
currentLang = 'zh'; t('lang.switched')  // 应返回 "已切换语言至" 而非 "lang.switched"
currentLang = 'en'; t('lang.switched')  // 应返回 "Language switched to"
```

## ⚠️ Toast 系统完全缺失的场景（v0.9.62+）

i18n key 缺失只是 toast 问题的**一种**情况。更严重的情况是：**整个 `window.toast` 对象不存在**。

### 诊断

```javascript
typeof toast === 'undefined'  // true = 系统完全缺失
typeof window.toast === 'undefined'  // true = 系统完全缺失
```

### 根因

所有 page-*.js 文件（page-chat.js、page-sessions.js、page-agent-config.js、page-skills.js、page-memory.js、page-token.js）都调用了 `toast.info()`/`toast.error()`/`toast.success()`/`toast.warning()`，但 core.js 中完全没有 `window.toast` 的定义。

### 修复

在 core.js 中添加完整的 toast 系统实现（IIFE 或 const 对象），包含：
- `toast._container` 延迟创建
- `toast._show(message, type, duration)` 核心方法
- `toast.info()`/`toast.success()`/`toast.error()`/`toast.warning()` 四个便捷方法
- `window.toast = toast` 暴露到全局

同时在 style.css 中添加 `.toast-container`/`.toast`/`.toast-in`/`.toast-out` 样式。

### 区分两种问题

| 问题 | 现象 | 修复 |
|------|------|------|
| toast 系统完全缺失 | `typeof toast === 'undefined'`，任何 toast 调用报 ReferenceError | 添加 toast 系统实现 |
| i18n key 缺失 | toast 显示但文字是 key 本身（如 `skills.refreshed`） | 在 core.js LANG 中添加翻译 key |

## 常见陷阱

1. **只在 app.js 中添加 key**：app.js 不被加载，key 永远不生效
2. **只加中文不加英文/繁体**：切换语言后 fallback 到 key 本身
3. **browser tool 缓存**：修改 core.js 后需更新 index.html 中的 `?v=` 版本号
