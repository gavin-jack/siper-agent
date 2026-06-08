# CLI Banner 格式对齐修复（v0.4.40+）

## 问题描述

`siper_cli.py` 的 `make_banner()` 函数输出的 CLI 启动横幅存在多个格式问题：

1. **ASCII Banner 宽度不匹配**：Banner 仅 35-39 字符，边框框 83 字符，视觉严重不对齐
2. **内容行长度不一**：各 `│...│` 行从 73 到 105 字符不等
3. **core 工具行溢出**：8 个工具名超过 padding 限制，达到 105 字符
4. **padding 计算错误**：各行硬编码的 `<62`、`<71`、`>58` 等未对齐到统一内容区宽度
5. **字母间距太小**：原始 banner 字母紧密排列，i 太小看不清
6. **模型名称右对齐太靠右**：用户要求左对齐
7. **小写字母不可辨认**（v0.4.43+）：i、e、r 用 █ 方块风格与大写字母无法区分

## 根因分析

- **原始 banner 字母边界每行不一致**：gap 位置在不同行错开，直接按固定列切割会导致字形破损
- 各行硬编码的 padding 未对齐到统一内容区宽度
- 长内容没有换行逻辑
- **核心问题**：在 6 行点阵中，纯 █ 方块风格无法区分大小写字母

## 修复方案

### 1. 定义统一宽度常量

```python
_FRAME_WIDTH = 83   # 总宽度（含 │ 边框）
_CONTENT_WIDTH = 81  # 内容区宽度（│ 之间）
```

### 2. 引入 make_line() 辅助函数

```python
def make_line(content: str) -> str:
    padded = content[:_CONTENT_WIDTH].ljust(_CONTENT_WIDTH)
    return f"│{padded}│"
```

### 3. 边框用 f-字符串直接构造

```python
f"┌{'─' * _CONTENT_WIDTH}┐"
f"├{'─' * _CONTENT_WIDTH}┤"
f"└{'─' * _CONTENT_WIDTH}┘"
```

不要用 `.replace()` 技巧转换边框字符。

### 4. 长内容换行显示（非截断）

用户明确要求"不用截断，换行显示"：

```python
prefix = f"    {ts_label}: "
if len(prefix + tool_str) <= _CONTENT_WIDTH:
    lines.append(make_line(prefix + tool_str))
else:
    first = prefix + tool_str[:_CONTENT_WIDTH - len(prefix)]
    lines.append(make_line(first))
    remaining = tool_str[_CONTENT_WIDTH - len(prefix):]
    while remaining:
        chunk = remaining[:_CONTENT_WIDTH]
        remaining = remaining[_CONTENT_WIDTH:]
        lines.append(make_line(f"      {chunk}"))  # 缩进 6 空格
```

### 5. ASCII Banner 字母设计

**关键教训**：原始 banner 的字母边界每行不一致，不能直接切割。必须手动重新定义每个字母的形状。

#### 设计原则（v0.4.44 最终方案）

- **所有字母统一用 █╗╚═╔╝ 方块风格**，不引入混合风格
- 字母之间用 4 个空格拉开
- banner 在框架内居中：`banner_pad = (_CONTENT_WIDTH - banner_max_w) // 2`
- 接受"小写字母在方块字体中天然难以完美区分"的限制，通过间距和上下文让用户自然辨认

#### 失败方案（不要再用）

- **混合风格**（大写 █ + 小写 ═║╔╗╚╝）：用户反馈"太难看了"，e 和 r 在细线风格下仍然不好区分
- **缩小小写字母尺寸**（只占中间 4 行）：视觉上不够协调
- **多种字符风格混合**：整体不统一，用户明确拒绝

#### 最终字母定义（v0.4.44，GAP = 4 空格）

```
S (uppercase):            i (lowercase):            P (uppercase):
 ██████╗                    ██                        ██████╗
██╔════╝                    █                         ██╔══██╗
╚█████╗                     █                         ██████╔╝
 ╚═══██╗                    █                         ██║  ██║
██████╔╝                    █                         ██║  ██║
╚═════╝                     ╚╝                        ╚═╝  ╚═╝

e (lowercase):            r (lowercase):
 █████╗                    █████╗
██╔══██╗                   ██╔═══╝
██████║                    ██║
██╔═══╝                    ██║
╚██████╗                   ██║
 ╚════╝                    ╚═╝
```

**为什么这个方案可行**：
- e 和 r 形状不同：e 有中间横线和底部封闭曲线，r 是顶部收窄后变竖线
- 4 空间距足够大，每个字母清晰分离
- 统一方块风格，视觉协调

#### Python 定义

```python
S = [" ██████╗","██╔════╝","╚█████╗ "," ╚═══██╗","██████╔╝","╚═════╝ "]
i = ["  ██  ","  █   ","  █   ","  █   ","  █   ","  ╚╝  "]
P = ["██████╗ ","██╔══██╗","██████╔╝","██║  ██║","██║  ██║","╚═╝  ╚═╝"]
e = ["█████╗ ","██╔══██╗","██████║","██╔═══╝","╚██████╗"," ╚════╝"]
r = ["█████╗ ","██╔═══╝ ","██║    ","██║    ","██║    ","╚═╝    "]

GAP = "    "  # 4 spaces

lines = []
for row in range(6):
    parts = [S[row], i[row], P[row], e[row], r[row]]
    line = GAP.join(parts)
    lines.append(line)
```

### 6. Banner 居中

```python
banner_lines = BANNER.strip().split('\n')
banner_max_w = max(len(l) for l in banner_lines)
banner_pad = (_CONTENT_WIDTH - banner_max_w) // 2

lines = []
for bl in banner_lines:
    centered = ' ' * banner_pad + bl
    lines.append(make_line(centered))  # banner 行也用 │ 包裹
```

### 7. 模型名称左对齐

```python
lines.append(make_line(f"  {model_name}"))
```

不要右对齐（`rjust`）。

## 常见陷阱

1. **原始 banner 不能直接切割**：gap 位置每行不同，手动定义每个字母
2. **不要用 `.replace()` 转换边框字符**
3. **长内容换行而非截断**
4. **模型名称左对齐**
5. **不要为了区分大小写而引入混合风格**：用户更看重整体风格统一，混合风格（大写 █ + 小写 ═║）被用户明确拒绝
6. **e 和 r 的区分**：在纯方块风格中，e 有中间横线（第3行 `██████║`）和底部外扩（第5-6行），r 是顶部收窄后保持竖线
7. **banner 行也要用 make_line() 包裹**：否则 banner 不在 │ 边框内
8. **验证方法**：写测试脚本验证每行恰好 83 字符，不要凭肉眼判断

## 迭代历史

| 版本 | 方案 | 结果 |
|------|------|------|
| v0.4.40 | 2 空格间距，全 █ 风格 | 间距太小，i 看不清 |
| v0.4.41 | 4 空格间距，全 █ 风格 | i 和 e 仍不可辨认（用户反馈） |
| v0.4.42 | 5 空格间距，统一 7-col | 用户反馈"i 看不出来小写，e 看不出来" |
| v0.4.43 | 混合风格（大写 █ + 小写 ═║），e/r 形状差异 | 用户反馈"太难看了"，拒绝混合风格 |
| v0.4.44 | 回到纯方块风格，4 空间距，原始字母形状 | 通过 ✓ |

## 相关文件

- 修改文件：`/home/gavin/.siper/siper_cli.py`
- BANNER 常量位置：第 46 行
- make_banner() 函数位置：第 79 行
