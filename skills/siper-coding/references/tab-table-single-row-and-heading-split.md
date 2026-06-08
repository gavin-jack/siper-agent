# Tab 单行表格 + \t### 标题分割（v0.9.78+）

## 问题描述

LLM 输出常用 tab 分隔伪表格，且标题（`###`）可能与表格行连在一起（无换行）。典型模式：

```
改编	忘语同名小说	---### 优点
非专业演员	素人	###讲什么？讲一群街头骗子...
```

渲染结果：表格和内容挤在一起，没有换行/分隔线；`###` 标题未被识别。

## 根因

1. 单行 tab 表格无相邻 tab 行，tab-to-pipe 不触发
2. `---###` 在行中间，行首正则不匹配
3. `\t###`（tab 后直接跟标题）未处理
4. 单行 pipe 表格（tab 转换后）无相邻表格行，表格检测跳过

## 修复

### 1. `\t###` 分割（预处理阶段）

```js
var tabHeadingMatch = l.match(/^(.*\S)\t+(#{1,6}\s*.*)$/);
if (tabHeadingMatch) {
  expanded.push(tabHeadingMatch[1].trim());
  expanded.push(tabHeadingMatch[2].trim());
  continue;
}
```

### 2. `---###` 行中间分割

正则从 `/^---+\s*#{1,6}\s*/` 改为 `/^(.*?)---+\s*(#{1,6}\s*.*)$/`（匹配任意位置）。

### 3. 单行 tab key-value 转表格

条件放宽：`cols.length === 2 && cols.every(c => c.trim().length < 30)` 时即使无相邻 tab 行也转换。

### 4. 单行 pipe 表格渲染

条件扩展：`isSingleRowTable = pipeCols.length >= 2 && 只有1个非分隔行`。

## 测试

```
改编\t忘语同名小说\t---### 优点\n\n内容
→ TABLE + HR + H3 + P ✅

非专业演员\t素人\t###讲什么？
→ TABLE + H3 ✅

改编\t忘语同名小说\n类型\t仙侠剧\n---### 优点\n- 特效不错\n---### 缺点\n- 节奏慢
→ TABLE + HR + H3 + UL + HR + H3 + UL ✅
```
