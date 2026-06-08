# CSS 解析失败诊断指南

## 症状
- 页面元素样式丢失（如登录模态框始终显示、网关页面无样式）
- `document.styleSheets[0].cssRules` 数量远少于预期
- 浏览器开发者工具 Styles 面板中部分规则被划掉或不显示

## 根本原因
CSS 语法错误（如 `@keyframes` 缺少闭合括号 `}`）会导致浏览器**丢弃该规则之后的所有 CSS 规则**。

### 典型案例（v0.4.4 修复）
```css
/* 错误：to 块缺少 } 闭合 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0);  /* ← 缺少 } */
}
/* 此后的所有 CSS 规则都被浏览器丢弃 */
```

修复：
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

## 诊断步骤

### 1. 检查 CSS 解析数量
```javascript
// 浏览器控制台
document.styleSheets[0].cssRules.length
// 如果数量远少于预期（如 68 vs 301），说明有解析错误
```

### 2. 定位解析失败位置
```javascript
var sheet = document.styleSheets[0];
var rules = sheet.cssRules;
// 最后一条成功解析的规则
rules[rules.length - 1].selectorText
// 在 style 标签内容中查找该规则之后的内容
```

### 3. 检查语法错误
- 检查 `@keyframes` 规则的 `from`/`to` 块是否都有 `}` 闭合
- 检查所有 `{` 和 `}` 是否配对
- 检查是否有未闭合的注释 `/* ... */`

### 4. 常见错误模式
| 错误模式 | 症状 |
|---------|------|
| `@keyframes` 缺少 `}` | 后续所有规则失效 |
| 选择器中缺少 `}` | 后续部分规则失效 |
| 注释未闭合 `/* ...` | 后续全部规则被注释掉 |
| 字符串未闭合 `"...` | 属性值解析错误 |

## 预防
- 修改 CSS 后立即在浏览器控制台检查 `cssRules.length`
- 使用 CSS 验证器（如 W3C CSS Validator）检查语法
- patch 替换后检查是否破坏了花括号配对

## 关联修复（v0.4.4）
- 修复了两处 `@keyframes fadeIn` 缺少闭合括号
- CSS 规则从 68 条恢复到 301 条
- 登录模态框、网关页面等后续添加的 CSS 规则恢复正常
