# System Prompt 动态注入当前模型名 — soul.md 静态配置陷阱

**发现日期**: 2026-08-04
**修复 commit**: 7007c2b

## 问题现象

用户在对话页切换模型后，问 SiPer "你现在使用的是什么模型"，SiPer 始终回答 "LongCat-2.0-Preview"（即 soul.md 中写死的模型名），而非实际切换后的模型。

## 根因

`soul.md` 中的「模型配置」章节写死了模型名：

```markdown
### 模型配置
- 默认模型: LongCat-2.0-Preview
- API 地址: https://api.longcat.chat/openai
```

LLM 被问到"你用什么模型"时，从 system prompt（即 soul.md）中读取这个静态值回答。

即使 `agent.py` 中模型切换逻辑正确（`configure_llm()` 重建了 LLMClient），LLM 也无法感知实际切换后的模型名，因为 system prompt 是静态文本。

## 修复方案

在 `_get_system_prompt()` 返回前，动态注入当前模型信息：

```python
# agent.py _get_system_prompt() 末尾，在 return base 之前
if self.llm_client:
    model_name = self.llm_client.model
    base += f"\n\n## 当前运行模型\n- 你当前使用的模型是：**{model_name}**\n- 当用户询问你使用什么模型时，回答上述模型名，不要猜测。"
```

关键点：注入在 `return base` 之前，在所有 skills/memory 注入之后。

## 通用模式：soul.md 静态配置 vs 运行时状态

**规则**：soul.md 中不应写死任何可能随运行时变化的值（模型名、API 地址、端口号等）。

如果 LLM 需要知道某个运行时状态，必须在 `_get_system_prompt()` 中动态注入。

**需要动态注入的信息**：
- 当前模型名 (`self.llm_client.model`)
- 当前 API 地址 (`self.llm_client.base_url`)
- 当前 agent 名称 (`self.config.name`)
- 当前时间/日期（如果 LLM 需要知道）

**可以静态写死的信息**：
- 工具列表（除非工具是动态注册的）
- 行为规则
- 输出风格要求

## 相关文件

| 文件 | 作用 |
|------|------|
| `agents/default/soul.md:40-43` | 静态模型配置（写死 LongCat-2.0-Preview） |
| `agent.py:1098-1202` | `_get_system_prompt()` — system prompt 构建入口 |
| `agent.py:1202` | 动态注入点（`return base` 之前） |
| `agent.py:269-283` | `process_message()` 中模型切换逻辑 |
