# 启动耗时基准

## 实测数据（v0.4.17, WSL2 Ubuntu）

| 阶段 | 耗时 | 说明 |
|------|------|------|
| 模块导入（含 websockets） | ~50ms | 首次导入，后续有缓存更快 |
| Agent 初始化（工具+会话+技能） | 14ms | 8 个工具自注册 + 3 个技能加载 |
| 配置加载（config.json + LLM） | 0ms | 增量，Agent 初始化已完成 |
| 会话清理 | 3ms | 仅扫描无效会话 |
| HTTP 服务启动 | ~5ms | asyncio.start_server |
| WebSocket 服务启动 | ~5ms | ws_serve |
| **总计** | **~30ms** | 从 main() 入口到服务就绪 |

## 排查流程

如果用户反馈"启动慢"：

1. **先查日志**是否有 `[Errno 98] address already in use` → 端口冲突
2. **查计时日志**：各阶段耗时是否正常（入口/Agent初始化/配置加载/会话清理/HTTP启动/WS启动）
3. **查进程残留**：`lsof -i :7240` 和 `lsof -i :7241`
4. **查后台 session**：`process(action="list")` 看是否有遗留的 background session

## 常见误区

- 启动慢 ≠ 导入慢。Python 模块导入在 WSL2 上很快（<100ms）
- `while True` + `time.sleep(5)` 重启循环会被误认为"启动慢"，实际是端口冲突
- 修改 index.html 后必须重启服务（html_content 在启动时加载到内存）
- 修改 CSS/JS 不需要重启，但需要浏览器硬刷新
