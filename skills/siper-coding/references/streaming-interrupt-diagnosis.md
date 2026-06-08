# 回复中断诊断模式（v0.9.46）

## 症状

用户报告"回复中断"——对话页面中 agent 消息不完整，只显示部分内容。

## 诊断步骤

### 1. 查看运行时日志

```bash
curl -s 'http://127.0.0.1:9724/api/logs?limit=50' > /tmp/siper_logs.json
python3 -c "
import json
with open('/tmp/siper_logs.json') as f:
    data = json.load(f)
for entry in data.get('logs', []):
    t = entry.get('time','')
    lv = entry.get('level','')
    lg = entry.get('logger','')
    msg = entry.get('message','')
    print(f'[{t}] {lv:8s} {lg:20s} {msg}')
"
```

关键搜索词：
- `流式请求.*无响应` → 网络层 SSE 连接问题
- `HTTP 400.*Unsupported model` → 模型切换失败
- `finish_reason=error` → LLM 返回错误
- `流式 chunk 发送超时` → WS 发送超时

### 2. 常见原因对照表

| 日志特征 | 根因 | 解决方向 |
|---|---|---|
| `流式请求第 N/3 次尝试无响应` | LLM API SSE 连接空闲，urllib 读取超时 | 加 asyncio.wait_for 外层超时后降级非流式 |
| `HTTP 400: Unsupported model` | 模型切换到不支持的模型 | 切换前校验；失败自动回退 |
| `finish_reason=error` + `[LLM API 错误]` | API 返回错误被当作正常回复 | 前端 error 气泡处理 |
| `流式 chunk 发送超时` | WS 发送缓冲区满 | 检查 ws.send() 阻塞 |

### 3. 流式无响应深层原因

`llm_client.py` 的 `chat_completion_stream()` 使用 `urllib` 读取 SSE 流。`timeout=120` 是连接超时，但 SSE 长连接的读取超时由服务器 keepalive 间隔决定。首 chunk 延迟过高时 `_stream_inner()` 抛异常，触发 3 次重试。全部失败后返回 `finish_reason=error`。

### 4. 模型切换失败深层原因

`_find_model_in_global()` 从 `models.json` 查找模型。模型名存在但 API 不支持（如 `sensenova-6.7-flash-lite` 在 LongCat API 不可用）时，首次 LLM 调用返回 HTTP 400。

**修复建议**：捕获 HTTP 400 后自动回退到上一个可用模型。

### 5. Placeholder 路径导致工具返回空结果（v0.9.49+）

LLM 传入 `<项目目录>` 等占位符路径，文件不存在导致搜索/读取返回空。LLM 基于空结果反复调用工具，陷入死循环。

**诊断**：日志中 `search_files params={'path': '<项目目录>'}` 或 `read_file params={'path': '<项目目录>/...'}`

**修复**：在 `search_files_tool.py` 和 `read_file_tool.py` 中添加占位符替换 + 路径不存在回退到项目根。

详见 `references/placeholder-path-replacement.md`

### 6. stream_end response 字段为空（v0.9.49+）

前端只用 `_streamAcc`（流式前缀文本）渲染，工具调用后的 follow-up 答案丢失。

**诊断**：`stream_end` 的 `result.response` 为空，但 `tool_call_steps` 有数据。

**修复**：前端优先用 `response` 字段；后端最后一轮不传 tools 强制文本回复。

详见 `references/streaming-retry-and-response-priority.md`

## 关联参考

- `references/placeholder-path-replacement.md` — 占位符路径替换（v0.9.49）
- `references/streaming-retry-and-response-priority.md` — 流式重试优化与前端响应优先级（v0.9.49）
- `references/search-files-tool-behavior.md` — search_files 工具行为与陷阱
- `references/multi-message-reply-architecture.md` — ws_send 回调架构
- `references/model-config-architecture-v3.md` — 模型配置架构
- `references/maxtokens-truncation.md` — max_tokens 截断修复
