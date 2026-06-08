# i18n 架构：app.js 是死代码（v0.9.81+）

## 发现

SiPer 存在两套完全独立的 `LANG` 对象和 `t()` 函数：

| 文件 | 行数 | 被 index.html 加载 | 实际效果 |
|------|------|-------------------|----------|
| `webui/static/app.js` | ~2-679 行 | ❌ 否 | 死代码，页面运行时不会使用 |
| `webui/static/pages/core.js` | ~2-1188 行 | ✅ 是 | 唯一生效的 i18n 来源 |

## 验证方法

```bash
# 确认 index.html 只加载了 core.js
grep -n 'app.js\|core.js' /home/gavin/.siper/webui/templates/index.html
```

预期结果：只有 `core.js` 的 script 标签，没有 `app.js`。

## 影响

1. **修改 i18n 只需改 `core.js`** — app.js 中的 LANG 改动对运行时无影响
2. **app.js 保留同步修改** — 仅为了代码一致性，但不对页面产生任何效果
3. **诊断 toast 显示英文** — 只需检查 core.js 的 LANG.zh/LANG.tw，不用看 app.js

## 历史 Bug：chat.connected/disconnected 英文值

`core.js` 的 `LANG.zh` 和 `LANG.tw` 中，`chat.connected` 和 `chat.disconnected` 曾保留英文值：

```javascript
// ❌ 修复前（zh 包）
'chat.connected': 'WebSocket connected',
'chat.disconnected': 'WebSocket disconnected, reconnecting in 3s',

// ✅ 修复后（zh 包）
'chat.connected': 'WebSocket 已连接',
'chat.disconnected': 'WebSocket 已断开，3秒后重连',

// ✅ 修复后（tw 包）
'chat.connected': 'WebSocket 已連線',
'chat.disconnected': 'WebSocket 已斷線，3秒後重連',
```

## core.js 语言包位置

- `LANG.zh`：约 380-406 行（27 条 toast key）
- `LANG.en`：约 771-797 行（27 条 toast key）
- `LANG.tw`：约 1162+ 行（繁体中文）

## 添加新 i18n Key 的规则

1. 必须在 `core.js` 的 `LANG.zh`、`LANG.en`、`LANG.tw` 三处同步添加
2. key 名使用 `snake_case`，按功能分组（如 `toast.*`、`chat.*`、`token.*`）
3. 添加后用 `grep -n 'newKey' core.js` 确认三语都存在
4. 浏览器硬刷新后验证：`currentLang='zh'; t('newKey')` 返回中文而非 key 本身
