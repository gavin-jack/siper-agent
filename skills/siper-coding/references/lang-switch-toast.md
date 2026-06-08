# 语言切换 Toast 提示

## 场景

用户在侧边栏底部点击语言切换按钮（🇨🇳/🇹🇼/🇬🇧）后，需要显示 toast 提示确认语言已切换。

## 实现

在 `core.js` 的 `selectLang()` 函数末尾添加：

```javascript
// Toast notification
const langNames = { zh: '简体中文', tw: '繁體中文', en: 'English' };
if (typeof toast !== 'undefined' && toast.success) {
  toast.success((typeof t === 'function' ? t('lang.switched') : '语言已切换') + ' ' + (langNames[lang] || lang), 2000);
}
```

## ⚠️ i18n Key 位置陷阱（关键！）

**i18n key 必须在 core.js 的 `LANG` 对象中定义，不能只放在 app.js 中。**

原因：core.js 有自己独立的 `LANG` 定义（`const LANG = { zh: {...}, en: {...}, tw: {...} }`），`t()` 函数使用 `LANG[currentLang][key]`。app.js 中的 `LANG` 不会被加载（app.js 不在 index.html 的 `<script>` 标签中），所以只加 app.js **完全无效**。

在 `core.js` 的三语区块中添加（通常在 `token.noHistory` 附近）：

```javascript
// 中文区块（LANG.zh）
'lang.switched': '已切换语言至',

// 英文区块（LANG.en）
'lang.switched': 'Language switched to',

// 繁体中文区块（LANG.tw）
'lang.switched': '已切換語言至',
```

**所有 toast i18n key 同理**：`skills.refreshed`、`logs.refreshed`、`settings.refreshed`、`settings.refreshFailed` 等都必须在 core.js 的 `LANG` 三语区块中定义。

检查清单：
1. ✅ core.js LANG.zh 中有中文翻译
2. ✅ core.js LANG.en 中有英文翻译
3. ✅ core.js LANG.tw 中有繁体中文翻译
4. ❌ 不需要在 app.js 中添加（不被加载）
5. ✅ 用 `grep -n "key" core.js` 确认三语都存在

## 调试陷阱

1. **browser tool 缓存**：修改 core.js 后 browser tool 可能加载旧版 JS。验证时必须在浏览器中 Ctrl+Shift+R 硬刷新。
2. **toast 可用性**：`window.toast` 在 core.js 底部赋值（~3001 行），`selectLang` 在 2470 行。用户点击时两者均已加载完毕，无需担心顺序问题。
3. **i18n t() 返回 key**：如果 `applyLang()` 还没更新全局 `currentLang`，`t('lang.switched')` 可能返回 key 本身而非翻译值。fallback 用硬编码字符串。
4. **验证方法**：手动调用 `toast.success('test', 3000)` 确认 toast 系统正常，再排查 selectLang 中的条件判断。

## 相关文件

- `webui/static/pages/core.js` — `selectLang()` + `LANG` 对象（i18n key 的实际位置）
- `webui/static/app.js` — 不被 index.html 加载（修改无效）
- `references/toast-i18n-keys-complete.md` — 完整 i18n key 清单
