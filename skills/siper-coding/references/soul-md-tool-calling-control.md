# soul.md 是工具调用行为的关键控制点

## 问题现象

用户问"siper 消息的token限制是多少？"，LLM 回复"让我查看一下 SiPer 的代码或文档来获取 token 限制信息。"然后就没有后续了——没有工具调用，没有搜索结果，对话中断。

## 根因分析

检查 `llm_response`：
- `content` = "让我查看一下..." （有文字）
- `tool_calls` = null （没有实际调用）

LLM 的 system prompt（soul.md）太弱：
1. 没有告诉 LLM **必须**用工具获取信息
2. 没有告诉 LLM 工具调用的强制格式要求
3. 没有包含 SiPer 自身的系统配置信息

LLM 只是"礼貌性地声明意图"，但没有实际发出 tool_call。

## Hermes 的借鉴

对比 Hermes 的 SOUL.md 设计：
- **SOUL.md 即配置源**：所有系统级约束都写在 soul.md 里，agent 不能通过工具修改它（只读锚点）
- **强制工具调用格式**：明确"当需要调用工具时，必须返回 tool_calls"，不是模糊的"你可以使用工具"
- **系统配置内嵌**：token 限制、模型参数等直接写在 system prompt 里，LLM 无需搜索即可回答

## 修复方案

在 soul.md 中新增三大部分：

### 1. System Configuration
把 SiPer 自身的配置信息直接写入：
- max_tokens: 8192
- context_window: 1,000,000
- timeout: 120s
- max_tool_rounds: 3
- 工具列表（23个工具，按 toolset 分组）
- 项目路径

### 2. Tool Usage Rules（核心）
明确规定：
- 查询代码/配置/文件 → **必须**先调用对应工具
- 禁止只说"让我查看一下"但不实际调用
- 需要调用工具时，tool_calls 必须非空
- content 不要写大段声明性文字
- 工具调用失败后要尝试替代方案

### 3. 工具调用流程说明
让 LLM 理解 SiPer 是"两步走"：
1. 先返回 tool_calls → agent 执行
2. 工具结果拼入上下文 → 再次调用 LLM 生成文本

不是一边说一边做。

### 6. 查询 Web UI 元素的 CSS/HTML/JS（v0.9.51+）
当用户询问某个 CSS 类名、HTML 元素、JS 函数或样式属性时：
- **必须**先用 `search_files` 在 `webui/static/` 目录搜索相关选择器或元素名
- 再用 `read_file` 读取完整定义
- 然后基于实际内容回答

**示例触发**：
- "class=chat-model-select 所有css属性"
- "showDictModal 函数在哪里"
- "msg-row 的 hover 效果是什么"

**Pitfall**：LLM 可能把 CSS 类名查询当成普通消息回复（"I received your message..."），因为 soul.md 中没有明确这类查询需要调用工具。必须在强制工具调用场景中显式列出。

修改 soul.md 后，重启 SiPer，问"token限制是多少"：
- 正确：LLM 直接从 system prompt 读取并回答
- 如果问的是代码行为：LLM 应先调用 search_files/read_file，再基于结果回答

## 相关文件
- `/home/gavin/.siper/agents/default/soul.md` — LLM system prompt
- `/home/gavin/.siper/ai_agent/core/agent.py` — 工具调用处理逻辑
- `/home/gavin/.siper/ai_agent/core/llm_client.py` — LLM API 客户端
