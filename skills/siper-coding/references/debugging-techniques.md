# Siper 调试技巧参考（v0.4.34+）

## 陷阱 #91: AI 回复空消息

**现象**：AI 回复了消息气泡但内容为空，或只有统计行没有正文。

**排查路径**：
1. **确认后端是否发送了内容**：在 siper_web.py 的 `stream_end` ws.send 前加日志 `logger.info(f"发送 stream_end: content={response[:80]!r}")`，重启后发消息检查
2. **如果后端 content 为空**：问题在 LLM 层 — 检查 finish_reason 是否为 stop，检查 llm_client 重试日志
3. **如果后端 content 非空但前端显示空**：在浏览器 Console 拦截 WS 消息（见下方标准流程），检查 stream_end/response 中 content 字段
4. **如果 stream_chunk 有内容但 stream_end 后消息消失**：检查 _finalizeStreamMsg 是否正确处理 content
5. **如果 response 有 content 但 addMsg 未显示**：检查 addMsg 是否正确处理空/undefined content

**注意**：onmessage 中的 `catch (err) {}` 是空的，出错无输出，需先加 `console.error(err)` 暴露错误。

## 陷阱 #92: WS 消息拦截调试标准流程

当需要调试前后端 WS 通信时，在浏览器 Console 执行：

```javascript
const origSend=ws.send.bind(ws);
ws.send=function(d){console.log('[WS SEND]',d);return origSend(d);};
const origOn=ws.onmessage;
ws.onmessage=function(e){console.log('[WS RECV]',e.data.substring(0,200));if(origOn)origOn.call(this,e);};
```

然后正常操作前端，观察 Console 中的 SEND/RECV 记录：
- **SEND 了但后端日志没收到**：WS 连接断开（Windows→WSL2 网络问题）
- **后端发送了但 RECV 没显示**：前端 onmessage 处理出错（检查空 catch 块）
- **RECV 有内容但界面没更新**：前端渲染逻辑问题（addMsg/_finalizeStreamMsg/stripTrace 等）

## 陷阱 #93: Windows→WSL2 WS 连接不稳定

**现象**：ws.readyState=1（OPEN）但消息发送后后端没收到。

**根因**：Windows 的 localhost 与 WSL2 的 localhost 是不同网络命名空间。HTTP 页面可能通过代理加载，但 WebSocket 升级请求可能失败。

**排查**：
1. 在浏览器 Console 执行 `ws.url` 确认 WS 连接的实际 URL
2. 执行 `ws.send(JSON.stringify({type:'message', content:'test', session_id:'test'}))` 后检查后端日志
3. 如果后端没收到但 readyState=1：尝试用 WSL2 实际 IP 访问（`hostname -I` 获取）

**修复**：重启 siper 服务，让浏览器重新建立 WS 连接。大多数情况下重连后恢复正常。

## 陷阱 #94: onmessage 空 catch 块吞掉错误

**现象**：WS 消息收到后界面没反应，Console 无任何错误。

**根因**：core.js 的 `ws.onmessage` 中有 `} catch (err) {}` 空块，JSON.parse 失败或处理逻辑出错时静默吞掉。

**修复**：将空 catch 改为 `} catch (err) { console.error('WS message error:', err); }`

**预防**：所有 catch 块必须至少包含 console.error 输出，禁止空 catch。

## 陷阱 #96: 事件回调函数未定义（静默失败）

**现象**：事件触发了（WS onopen/onclose、按钮 click 等）但 UI 状态没变化，Console 有时有 `ReferenceError: setConnected is not defined`，有时完全静默（被外层 catch 吞掉）。

**根因**：调用的函数名存在但函数体从未定义，或定义在错误的作用域。典型场景：
- WS `onopen` 调用 `setConnected(true)` 但 `setConnected` 函数根本没写
- HTML `onclick="foo()"` 但 `foo` 不在全局作用域
- 函数名拼写不一致（`setConnected` vs `setconnected`）

**排查**：
1. 在浏览器 Console 直接调用 `typeof setConnected` — 返回 `"undefined"` 即确认
2. 在 Console 手动执行 `setConnected(true)` 看是否报错
3. 检查函数是否定义在闭包内（如 `$(function(){...})`）导致不在全局作用域
4. 如果外层有 `try/catch` 包裹了事件回调，ReferenceError 可能被吞掉 — 先加 `console.error`

**修复**：补全缺失的函数定义，确保在全局作用域（或事件回调可访问的作用域）。

**Siper 实例（v0.7.2）**：`ws.onopen` / `ws.onclose` 调用了 `setConnected()` 但该函数从未定义，导致 sidebar 连接状态永远停留在 "Disconnected"。补上 `setConnected()` 函数后修复。

## 陷阱 #95: 实时查看 agent.process_message 完整返回 dict（v0.6.9+）

**场景**：需要查看 LLM 实际返回给前端的完整数据结构（response、tool_calls、usage、tool_call_steps 等）。

**方法**：在 `siper_web.py` 第 ~1858 行，`result["response"]` 之后临时插入一行 DEBUG 日志：

```python
logger.info(f"DEBUG result dict: {json.dumps(result, ensure_ascii=False, default=str)}")
```

位置在 `response = result["response"]` 和 `usage = result.get("usage", {})` 之后，`# Persist session` 注释之前。

**验证流程**：
1. 添加日志 → 重启 siper → 刷新浏览器页面（重建 WS）
2. 在浏览器 Chat 页面发送消息（涉及工具调用的问题更容易暴露数据结构，如"桌面上有哪些文件"）
3. 等待 LLM 处理完成（工具调用可能需要 10-30 秒）
4. 查看 siper 进程 log：`process(action="log", session_id="<siper_session>", limit=200)`
5. 搜索 `DEBUG result dict` 行获取完整 JSON

**已知 result dict 结构（v0.6.9 实测）**：
```json
{
  "response": "最终回复文本",
  "session_id": "UUID",
  "tool_calls_executed": 1,
  "tool_call_steps": [
    {
      "tool_name": "list_dir",
      "call_id": "call_xxx",
      "parameters": {"path": "/mnt/c/Users/user/Desktop"},
      "result": "Error: Directory not found: ...",
      "success": false,
      "elapsed_ms": 6.8
    }
  ],
  "processing_time_ms": 5706.84,
  "success": true,
  "usage": {
    "effectiveCachedTokens": 1792,
    "completion_tokens": 52,
    "prompt_tokens": 3699,
    "total_tokens": 3751,
    "prompt_tokens_details": {...},
    "cache_write_tokens": 0,
    "cache_read_tokens": 0
  },
  "prompt_context": "[{\"role\":\"system\",\"content\":\"# SOUL.md...}]"
}
```

**关键发现（v0.6.9）**：
- `tool_call_steps` 包含每次工具调用的参数、结果、耗时、成功状态
- `prompt_context` 是完整的对话上下文 JSON 字符串（含 system prompt）
- `usage` 包含 `effectiveCachedTokens` 和详细的 token breakdown
- 当工具路径不存在时，`tool_call_steps[].result` 是错误信息，但顶层 `success` 仍为 true（agent 完成了处理流程，只是工具执行失败）

**清理**：调试完毕后用 patch 移除 DEBUG 日志行，重启 siper。

**注意**：
- siper 重启后必须刷新浏览器页面重建 WS，否则旧连接不会收到新消息
- 如果日志没有新消息，检查 `process(action="log")` 确认 siper 进程存活
- 涉及网络请求的 execute_code/terminal 测试可能被安全策略拦截，优先用浏览器 Console + `ws.send()` 直接发消息
