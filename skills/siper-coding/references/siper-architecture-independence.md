# SiPer 架构独立性参考

## 结论：SiPer 完全独立于 Hermes 运行

SiPer 是一个自包含的 Python 应用，有自己的入口、Agent 运行时、工具系统、WS/HTTP 服务。与 Hermes Agent 框架无任何代码级 import 依赖。

## 第三方 pip 依赖（3 个必须 + 2 个可选）

| 包名 | 用途 | 使用文件 | 必须？ |
|------|------|----------|--------|
| `openai` | LLM API SDK | `llm_client.py` | ✅ 必须 |
| `websockets` | WebSocket 服务器 | `siper_web.py`, `web_server.py` | ✅ 必须 |
| `jinja2` | HTML 模板渲染 | `siper_web.py` | ✅ 必须 |
| `httpx` | HTTP 客户端 | `image_gen_tool.py` | ⚪ 可选（图片生成） |
| `edge_tts` | TTS 文字转语音 | `tts_tool.py` | ⚪ 可选（语音功能） |

## 外部网络服务

| 服务 | 用途 | 调用方 | 必须？ |
|------|------|--------|--------|
| LongCat API | LLM 对话 | `llm_client.py` | ✅ 核心 |
| SearXNG (127.0.0.1:8888) | 网络搜索 | `web_search_tool.py` | ⚪ 可选 |
| DuckDuckGo | 搜索 fallback | `web_search_tool.py` | ⚪ 可选 |

## 本地数据存储

- `data/sessions.db` — SQLite 会话持久化（`session_manager.py`，stdlib sqlite3）
- `data/memory/` — 记忆文件
- `data/task_history/` — 任务历史
- `uploads/` — 上传文件

## 依赖审计方法

当需要验证"X 是否依赖 Y"时，使用以下流程：

1. **扫描所有 import**：遍历项目 `.py` 文件，提取 `import X` 和 `from X` 语句
2. **分类**：stdlib / 第三方包 / 项目内部模块 / 相对导入
3. **追踪调用链**：检查关键文件（入口、core、工具）的实际调用
4. **区分"代码依赖"和"注释/字符串引用"**：如 `execute_code_tool.py` 仅在 description 字符串中提到了 "hermes_tools"，实际代码不 import

## 项目启动命令

```bash
cd /home/gavin/.siper && /home/gavin/.hermes/hermes-agent/venv/bin/python3 -u siper_web.py
```

- HTTP: 9724, WS: 9725
- 必须用 hermes-agent venv 的 python（有 openai SDK）
- 不要用 `LONGCAT_API_KEY=""` 前缀（会覆盖 config.json 中的有效 key）

## 端口分配

| 应用 | 端口 |
|------|------|
| SiPer Web UI | 9724 (HTTP) + 9725 (WS) |
| Hermes Agent | 8643 |
| SearXNG | 8888 |
