# JS 正则表达式灾难性回溯导致浏览器卡死

## 问题描述

复杂的正则表达式在特定输入下可能产生灾难性回溯（catastrophic backtracking），导致浏览器 JS 引擎陷入无限循环，页面完全无响应。

## 本次案例

正则：`/(?:[\w\u4e00-\u9fff._\-~$]|\s(?!\())+\(\s*[\d.]+\s*[KMGT]?B\s*\)/g`

用途：匹配 `文件名(size)` 模式，如 `hello.pdf(709KB)`

问题：嵌套量词 `(?:...|\s(?!\())+` 在匹配失败时产生指数级回溯。

症状：
- browser_navigate 超时
- browser_console 超时
- browser_snapshot 超时
- 服务器正常（curl 返回 200）
- 需要 kill Chrome 进程才能恢复

## 根因

嵌套量词 `(?:A|B)+` 其中 A 和 B 有重叠匹配范围时，引擎在失败时会尝试所有可能的分割方式。

## 安全替代方案

**用 `indexOf` 字符串扫描代替复杂正则：**

```js
// ❌ 危险：嵌套量词导致回溯
const re = /(?:[\w\u4e00-\u9fff._\-~$]|\s(?!\())+\(\s*[\d.]+\s*[KMGT]?B\s*\)/g;
const matches = [...l.matchAll(re)];

// ✅ 安全：indexOf 扫描
const positions = [];
let searchIdx = 0;
while (searchIdx < l.length) {
  const parenIdx = l.indexOf('(', searchIdx);
  if (parenIdx < 0) break;
  const after = l.substring(parenIdx + 1, parenIdx + 15);
  if (/^\s*[\d.]+\s*[KMGT]?B\s*\)/.test(after)) {
    const closeIdx = l.indexOf(')', parenIdx);
    if (closeIdx > parenIdx) {
      positions.push({ start: parenIdx, end: closeIdx + 1 });
      searchIdx = closeIdx + 1;
      continue;
    }
  }
  searchIdx = parenIdx + 1;
}
```

## 正则安全规则

1. **避免嵌套量词**：`(?:A|B)+` 其中 A 和 B 有重叠
2. **用具体字符类替代宽泛匹配**：`[^\s()]` 比 `.` 更安全
3. **测试最坏情况**：用长字符串（>1000字符）测试正则性能
4. **优先使用 indexOf**：对于固定模式匹配，字符串扫描比正则更安全
5. **注意字符类中的 `[]`**：`[^\s(){}[]` 中的 `[]` 被解析为空字符类，不是字面量括号

## 字符类 `[]` 解析陷阱

```js
// ❌ 错误：[^\s(){}[] 中的 [] 是空字符类
/[^\s(){}[]]+/g

// ✅ 正确：转义 ] 或简化字符类
/[^\s(){}]+/g
```

在 JS 正则中，字符类 `[...]` 内的 `]` 如果是第一个字符（紧接 `[^` 之后）或被转义，才是字面量 `]`。否则 `]` 结束字符类。

`[^\s(){}[]` 的解析：
- `[^` — 否定字符类开始
- `\s(){}` — 匹配空白、`(`、`)`、`{`、`}`
- `[]` — 空字符类（无效/匹配失败）
- 整个正则无法匹配任何字符

## 调试方法

1. **browser_console 超时** = 可能 JS 引擎卡死
2. **检查 CPU 使用**：`top -p <chrome_pid>` 看是否 100%
3. **kill 进程恢复**：`kill -9 <chrome_pid>`
4. **验证正则**：在 Node.js 中用 `node -e "console.time('re'); 'long string'.match(/regex/); console.timeEnd('re')"` 测试
