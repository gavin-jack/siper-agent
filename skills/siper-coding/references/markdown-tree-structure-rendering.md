# Box-Drawing Tree Structure Rendering (v20260803i)

## Summary

LLM 输出中包含 box-drawing 字符（`│├└─`）的树形结构时，`renderMarkdown` 将其渲染为分层 `<ul><li>` 元素，而非纯文本段落。

## Detection

在段落收集之前（`while (i < lines.length)` 循环顶部），检测连续的行包含 box-drawing 字符：

```js
const TREE_RE = /[\u2502\u251C\u2514\u2500]/;
if (TREE_RE.test(line)) {
  // 收集连续 tree lines
  const treeLines = [];
  while (i < lines.length && TREE_RE.test(lines[i])) {
    treeLines.push(lines[i]);
    i++;
  }
  // 解析为 ul/li
  // ...
  continue;
}
```

## Parsing Algorithm

核心思路：**先 strip `│` prefix，再判断 `├─`/`└─`**。

```js
const isChild = (line) => {
  // 去掉开头的 │ 和空格
  const strippedPipe = line.replace(/^[\u2502\s]+/, '');
  return strippedPipe.startsWith('\u251C\u2500') ||  // ├─
         strippedPipe.startsWith('\u2514\u2500');     // └─
};
```

- **Parent node**（角色行）：`│角色名──...` → strip `│` 后不以 `├─`/`└─` 开头
- **Child node**（特征行）：`│├──特征` 或 `│└──特征` → strip `│` 后以 `├─`/`└─` 开头

### 渲染结构

```html
<ul class="md-tree">
  <li class="md-tree-node">
    角色名──...
    <ul class="md-tree-sub">
      <li class="md-tree-node">├──特征1</li>
      <li class="md-tree-node">└──特征2</li>
    </ul>
  </li>
</ul>
```

## CSS Classes

```css
.md-tree { list-style: none; padding: 0; margin: 8px 0; }
.md-tree-sub { list-style: none; padding-left: 16px; margin: 2px 0; }
.md-tree-node { padding: 1px 0; }
```

## Pitfalls

1. **不要用 pipe count 判断深度**：`│` 的数量不等于语义深度
2. **不要直接用 `startsWith('├─')`**：行可能有 `│` 前缀，必须先 strip
3. **两级层次足够**：parent = 角色，child = 特征，不需要深层嵌套
4. **`inline()` 处理节点文本**：树节点文本通过 `inline()` 处理行内 markdown 格式
5. **角色行被错误嵌套为 child（v20260803h bug）**：`│小宝（杨羽）── 第二季起成为领导者` 这类角色行（含 `────` 但不含 `├─`/`└─`）被错误挂到上一个角色的 li 内部。根因：`currentLi` 指针在遇到新 parent 行时没有正确关闭上一个 parent 的 `<ul>`。修复：检测到新 parent 行时，先将 `currentLi` 和 `currentSub` 归位到顶层 `treeUl`，再创建新的 parent li。

## Version

- core.js: v20260803i → v20260803j (trailing text fix)
- commit: ff125dc (tree rendering) → e6ada46 (look-ahead trailing text fix)
