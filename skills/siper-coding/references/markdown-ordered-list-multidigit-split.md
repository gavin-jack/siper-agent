# 多位数字有序列表号被预处理错误分割

## 现象

LLM 输出包含 `10. xxx`、`11. xxx`、`12. xxx` 等多位数字有序列表时：
- 列表被拆散成多个小列表（如 5+4 变成 5+1+1+1+1）
- 产生内容为 `"1"` 的孤立段落
- 列表项内容被截断（如 `0. **《Mr. Robot》**`）

## 根因

预处理阶段有序列表边界分割正则：

```js
const olRe = /(?<=\S)(?=\d+\.\s\S)/g;
```

在 `10. **《Mr. Robot》**` 中：
- index 1 处：`(?<=\S)` 匹配（`1` 是 `\S`），`(?=\d+\.\s\S)` 匹配（`0. **` 中 `0`=`\d+`，`.`=`\.`，` `=`\s`，`*`=`\S`）
- 于是在 index 1 处分割 → `"1"` + `"0. **《Mr. Robot》**"`

同理 `11. xxx` 在 index 1 分割 → `"1"` + `"1. xxx"`，`12. xxx` → `"1"` + `"2. xxx"`。

## 修复

将 lookbehind 从 `(?<=\S)` 改为 `(?<=\D|^)`：

```js
// 修复前
const olRe = /(?<=\S)(?=\d+\.\s\S)/g;
// 修复后
const olRe = /(?<=\D|^)(?=\d+\.\s\S)/g;
```

**效果**：
- `10. xxx`：`1` 前面是行首（`^`），匹配并在 index 0 分割 → 但 `if (olMatch.index > 0)` 守卫忽略 index 0 → 不分割 ✓
- `text1. text2`：`1` 前面是 `t`（`\D`），匹配并分割 ✓
- `abc 1. def`：`1` 前面是空格（`\D`），匹配并分割 ✓

## 零宽断言正则的无限循环陷阱

零宽断言（lookbehind/lookahead）匹配成功后 `lastIndex` 不前进，导致 `exec()` 无限循环：

```js
const re = /(?<=\S)(?=\d+\.\s\S)/g;
let m;
while ((m = re.exec(l)) !== null) {
  splits.push(m.index);
  // 必须加此守卫！
  if (re.lastIndex === m.index) re.lastIndex++;
}
```

**影响范围**：Node.js 和 Chrome 都会无限循环。症状是 Node.js 进程 CPU 100% 且无输出，浏览器 tab 卡死。

## 测试用例

```
输入："10. text\n11. text\n12. text"
期望：3 个列表项，不被分割

输入："text1. text2"
期望：在 index 4 处分割（t 和 1 之间）
```

## 版本历史

- v0.9.74 (2026-07-31)：修复多位数字有序列表号被错误分割
