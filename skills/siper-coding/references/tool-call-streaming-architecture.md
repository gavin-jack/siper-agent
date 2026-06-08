# Tool Call 流式消息架构分析（v0.6.11）

## LLM 返回 dict 结构

以"桌面上哪些文件是有用的"为例：

第一次 LLM 调用（有 tool_calls）：
{
  "content": "让我先看看你桌面上有哪些文件。",
  "tool_calls": [{"name": "list_dir", "parameters": {"path": "C:/Users/gavin/Desktop"}, "id": "call_xxx"}],
  "usage": {"prompt_tokens": 47000, "completion_tokens": 500, "total_tokens": 47500},
  "finish_reason": "tool_calls"
}

第二次 LLM 调用（follow-up，传入 tool results）：
{
  "content": "你的桌面上有不少文件，我帮你梳理一下...",
  "tool_calls": None,
  "usage": {"prompt_tokens": 49000, "completion_tokens": 800, "total_tokens": 49800},
  "finish_reason": "stop"
}

## 前端气泡显示机制

- 一个气泡 = 一次 stream_start -> 多条 stream_chunk -> 一条 stream_end
- 第一次 LLM 的过渡文本通过 stream_callback 流式推送到气泡
- _handle_tool_calls 执行工具时，follow-up 的 _llm_call 也传了 stream_callback（v0.6.6 修复），最终回复也流式推送到同一个气泡
- 气泡内容 = 过渡文本 + 最终回复（直接拼接，无分隔）
- tool_call_steps 数据通过 stream_end 的 meta 传入，前端 renderToolCalls 渲染为气泡下方可折叠的工具调用步骤
- 统计信息（token/tools/skills/time）通过 appendMeta 渲染在气泡下方

## 关键结论

- 前端始终只显示一条 agent 消息气泡（单 bubble 设计）
- 工具调用步骤通过气泡下方的可折叠面板展示（page-chat.js renderToolCalls）
- 这是设计行为，不是 bug
- 如需拆分为多条独立消息，属于功能增强（需增加新的 WS 消息类型）

## 错误消息格式（v0.6.11 更新）

用户要求去掉 LLM 错误消息的方括号前缀，改为纯文本：

非流式空响应：连续 3 次返回空响应，请检查 API 服务或稍后重试
流式空响应：流式响应连续 3 次为空，请检查 API 服务或稍后重试

代码位置：llm_client.py 第 92 行和第 321 行
commit: 2afd449

## 完整错误处理链路

API 返回空 SSE 流
  -> llm_client 重试 3 次（指数退避 5->10->20s）
  -> 耗尽后 yield 错误 delta
  -> agent.py _llm_call 检测到空 content，降级到非流式
  -> 非流式也返回空响应
  -> result finish_reason = "error"
  -> process_message is_llm_error = True
  -> siper_web.py is_error = True
  -> 前端 core.js 应用错误样式（隐藏头像 + 浅红气泡）
