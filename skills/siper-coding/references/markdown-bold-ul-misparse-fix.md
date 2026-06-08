# MD 渲染器：`**加粗**` 被误判为无序列表的根因与修复

## 问题现象

```
输入: **修炼体系**
期望: <strong>修炼体系</strong>
实际: <em>修炼体系</em>*  （被渲染为列表项，加粗变斜体+星号）
```

## 根因

主循环无序列表检测正则：
```js
if (/^[-*+]\s*/.test(line.trim()) && !/^---+$/.test(line.trim()))
```

`**修炼体系**` 以 `*` 开头，匹配了 `[*+]` 模式，被误判为无序列表项。

进入 ul 分支后，`inline()` 把 `**` 解析为单个 `*`（斜体），输出 `<em>修炼体系</em>*`。

## 受影响的场景

1. 独立加粗行：`**修炼体系**` → 被渲染为列表项
2. 加粗+列表：`**高潮**：- 沈夜白...` → 整行被 ul 捕获，加粗丢失
3. 加粗+标号：`**要开始写正文吗？**告诉我：1. ...` → 同上

## 修复

在 ul 分支的 `if` 和 `while` 条件中都加 `!/^\*\*/.test(line.trim())`：

```js
if (/^[-*+]\s*/.test(line.trim()) && !/^---+$/.test(line.trim()) && !/^\*\*/.test(line.trim())) {
  const ul = document.createElement('ul');
  ul.className = 'md-list';
  while (i < lines.length && /^[-*+]\s*/.test(lines[i].trim()) && !/^---+$/.test(lines[i].trim()) && !/^\*\*/.test(lines[i].trim())) {
```

## 关联修复

`*filename` 转换正则也可能破坏 `**bold**`（虽然测试证明不是主因，但防御性修复仍有价值）：

```js
l = l.replace(/(^|(?<=[^a-zA-Z0-9*]))\*(?!\*)([\w\u4e00-\u9fff][\w\u4e00-\u9fff._\-~$\s]*\()/g, '$1- $2');
l = l.replace(/(^|(?<=[^a-zA-Z0-9*]))\*(?!\*)([\w\u4e00-\u9fff][\w\u4e00-\u9fff._\-~$]+)/g, '$1- $2');
```

添加 `(?!\*)` negative lookahead 避免匹配 `**` 中的第二个 `*`。

## 验证

```js
renderMarkdown('**修炼体系**')  // → <strong>修炼体系</strong> ✓
renderMarkdown('**高潮**：- 沈夜白\n- 突破瓶颈')  // → <strong>高潮</strong>：- ... (段落) + 列表 ✓
renderMarkdown('**要开始写正文吗？**告诉我：1. ...\n2. ...')  // → <strong>...</strong> (段落) + ol ✓
```

## 历史

- v0.9.51：修复了 ulRe 正则和 heading+table 分割，但未在主循环 ul 分支入口排除 `**`
- v0.9.85e：在主循环 ul 分支入口添加 `!/^\*\*/.test()` 排除条件
