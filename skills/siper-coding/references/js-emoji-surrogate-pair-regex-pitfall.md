# JS Emoji Surrogate Pair 正则误匹配陷阱

## 问题描述

在 JS 正则中使用字符类 `[emoji1 emoji2]` 时，JS 引擎将 emoji 拆分为 UTF-16 码元（surrogate pair halves）进行匹配。如果两个 emoji 共享相同的高代理项（high surrogate），字符类会误匹配。

## 经典案例：stripTrace 内容截断

### 现象
- LLM 回复内容在 `---` 后全部丢失
- 540 字符的完整回复被截断到 178 字符
- renderMarkdown 本身测试正常（14 个子元素正确）

### 根因
```javascript
// page-chat.js stripTrace 旧正则
const traceEmoji = /[⬆️⬇️🔧🧩⏱️]/;
```

UTF-16 代理对拆分：
| Emoji | Unicode | UTF-16 代理对 |
|-------|---------|---------------|
| 🔧 | U+1F527 | U+D83D U+DD27 |
| 📖 | U+1F4D6 | U+D83D U+DD46 |

**两者共享高代理项 U+D83D。** JS `[...]` 字符类匹配码元而非码点，所以 `[🔧]` 实际上匹配任何包含 UxD83D 的字符——包括 `📖` 的高代理项。

当 LLM 回复中包含 `📖`（或任何高代理项为 U+D83D 的字符）时，stripTrace 的正则匹配位置错误，导致 `split()` 在错误位置截断内容。

### 修复
```javascript
// 方案 A：用 Unicode 转义序列 + u flag（推荐）
const traceEmoji = /(?:\u2B06|\u2B07|\u{1F527}|\u{1F9E9}|\u{23F1})/u;

// 方案 B：用 alternation 替代字符类
const traceEmoji = /(?:⬆️|⬇️|🔧|🧩|⏱️)/;
```

方案 A 使用 `u` flag 强制码点模式匹配，彻底避免代理对问题。

### 通用规则

**在 JS 正则中，永远不要用字符类 `[...]` 匹配 emoji 或任何 U+10000 以上的字符。** 使用：
1. Unicode 转义 `\u{XXXXX}` + `u` flag（最可靠）
2. Alternation `(?:A|B|C)`（次选）
3. 如果必须用字符类，确保所有字符在 BMP 范围内（U+0000-U+FFFF）

### 诊断方法
```javascript
// 检查字符的 UTF-16 码元
'🔧'.charCodeAt(0).toString(16)  // d83d (high surrogate)
'🔧'.charCodeAt(1).toString(16)  // dd27 (low surrogate)

// 检查正则是否误匹配
/[🔧]/.test('📖')  // true! (bug)
/\u{1F527}/u.test('📖')  // false (correct)

// 检查代理对共享
'🔧'[0] === '📖'[0]  // true (both U+D83D)
```

### 受影响范围
- `page-chat.js:69-81` stripTrace 函数（已修复，commit 59992c3）
- 任何在字符类中包含 emoji 的正则表达式

### 历史案例
- commit `59992c3`: 'fix: 修复 stripTrace 正则代理对误匹配导致内容截断'
