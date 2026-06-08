# 统计信息重复显示排查模式

## 问题场景
AI 回复气泡中出现两份相同的统计信息（token、工具、技能、时间）。

## 排查路径

### Step 1: 检查系统提示词
检查 `agents/<name>/soul.md` 和 `agents/<name>/agent.md` 是否要求 LLM 输出调用追踪。

```bash
grep -rn "⬆️\|⬇️\|🔧\|🧩\|⏱️\|调用追踪\|trace" agents/*/soul.md agents/*/agent.md
```

**关键判断**：
- 如果系统提示词**没有**要求 LLM 输出统计 → LLM 输出的 trace 是模型自身行为，前端无需特意 strip
- 如果系统提示词**有**要求 → 前端需要 stripTrace 去除 LLM trace，用程序计算的统计渲染

### Step 2: 检查后端 stats_line 构建
查看 `siper_web.py` 中 stats_line 的构建位置（约 2252-2257 行）：

```python
stats_line = (
    f"\n\n⬆️ {fmt_tokens(prompt_tokens)} · ⬇️ {fmt_tokens(completion_tokens)}"
    f" │ 🔧 {tools_used} tools"
    f" │ 🧩 {skills_count} skills"
    f" │ ⏱️ {time_str}"
)
```

**流式模式**：`content` 是 LLM 原始输出，`stats_line` 通过 `stream_end` 的单独字段传递 → 前端 `appendMeta` 渲染
**非流式模式**：`response_with_stats = response + stats_line` → stats_line 拼入 content

### Step 3: 检查前端处理
查看 `core.js` 的 `_finalizeStreamMsg` 和 `page-chat.js` 的 `appendMeta`：

- `_finalizeStreamMsg`：stripTrace（如果存在）→ appendMeta
- `appendMeta`：从 `data.usage`、`data.tools_used`、`data.skills_active`、`data.processing_time_ms` 读取程序计算的统计

### Step 4: 区分来源
| 来源 | 数据 | 位置 |
|------|------|------|
| LLM trace | LLM 自己输出的 `⬆️ X · ⬇️ X │ 🔧 X │ 🧩 X │ ⏱️ X` | LLM response content 末尾 |
| 程序统计 | `usage.prompt_tokens`、`tools_used`、`skills_count`、`processing_time_ms` | 后端计算 → WS meta 字段 → 前端 appendMeta |

## 修复原则

1. **如果系统提示词未要求 LLM 输出 trace**：
   - 前端 stripTrace 处理**不需要**
   - LLM 输出的 trace 原样显示（如果有的话）
   - 统计信息完全由程序计算，通过 appendMeta 渲染

2. **如果系统提示词要求 LLM 输出 trace**：
   - 前端需要 stripTrace 去除 LLM trace
   - 用程序计算的统计通过 appendMeta 渲染

3. **非流式模式**：
   - 如果 LLM 输出 trace + 后端拼接 stats_line → 两份统计
   - 修复：后端改为和流式模式一致，stats_line 走 meta 字段而非拼入 content

## 验证方法
- `document.querySelectorAll('.msg-meta').length` 应为 1（正常）或 0（无统计）
- `bodyEl.textContent` 末尾是否包含 `⬆️...⏱️` 格式的 trace
- 对比 LLM trace 和 appendMeta 渲染的统计是否一致

## 注意事项
- `browser_console` 工具会清空消息缓冲区，console.log 调试不可靠
- 应通过检查 DOM 结构验证修复效果
- LLM trace 格式：`\n\n⬆️ X · ⬇️ X │ 🔧 X tools │ 🧩 X skills │ ⏱️ Xms`（无 `---` 分隔符）
