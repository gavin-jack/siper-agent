# 配置值覆盖陷阱：config.json 优先于代码默认值

## 问题现象

修改 `AgentConfig` 中的 `max_tools` 或 `max_tool_rounds` 默认值后，API 返回的配置仍然是旧值。

## 根因

`agents/default/config.json` 中硬编码了这些配置项，**优先级高于代码默认值**。

```json
{
  "max_tools": 30,
  "max_tool_rounds": 200
}
```

当 `AgentConfig` 实例化时，如果 `config.json` 提供了值，会覆盖 `AgentConfig` 的默认值。

## 修复模式

修改工具/轮次上限时，**必须同时更新两个位置**：

1. **代码默认值**：`ai_agent/core/agent.py` → `AgentConfig` 数据类
   ```python
   max_concurrent_tools: int = 300
   max_tool_rounds: int = 100
   ```

2. **配置文件**：`agents/default/config.json`
   ```json
   "max_tools": 300,
   "max_tool_rounds": 100
   ```

## 验证方法

```bash
# 重启服务后检查 API 返回
curl -s http://127.0.0.1:9724/api/config | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'max_tools: {d.get(\"max_tools\")}'); print(f'max_tool_rounds: {d.get(\"max_tool_rounds\")}')"
```

## 相关配置项

以下配置项在 `config.json` 中同样会覆盖代码默认值：
- `max_tools`
- `max_tool_rounds`
- `session_timeout`
- `log_level`
- `port`

修改任何运行时参数时，都应检查 `config.json` 是否存在对应字段。

---
*2026-07-25: 调整 max_tool_rounds 和 max_tools 时发现*