# LLM Client None 守卫 — 完整清单（v0.9.28+）

## 问题模式

当 `agent.llm_client` 为 `None`（无 API Key / 首次启动）时，直接访问其属性会导致 `AttributeError`。

## 受影响的代码位置

| 位置 | 函数 | 错误代码 | 修复 |
|------|------|----------|------|
| `siper_web.py:~L910` | `api_update_config()` | `cur.model` / `cur.base_url` / `cur.api_key` | `cur.model if cur else ""` |
| `siper_web.py:~L1038` | `api_update_agent_meta()` | 同上 | 同上 |
| `siper_web.py:~L874` | `api_get_config()` | `agent.llm_client.model` 等 | `llm_client.model if llm_client else ""` |

## 修复模板

```python
# 修复前（崩溃）
cur = agent.llm_client
rebuild_model = new_model or cur.model  # AttributeError if cur is None

# 修复后（安全）
cur = agent.llm_client
rebuild_model = new_model or (cur.model if cur else "")
rebuild_base_url = new_base_url or (cur.base_url if cur else "")
rebuild_api_key = new_api_key or (cur.api_key if cur else "")

# 关键：用 if/else 跳过 configure_llm，不要用 return 提前退出
if rebuild_api_key:
    agent.configure_llm(api_key=rebuild_api_key, ...)
else:
    logger.warning("未提供 API Key，跳过 LLM 客户端重建")
# ← 继续执行后续字段更新（agent_name, max_tools 等）
```

## 禁止模式

```python
# ❌ 错误：return 会跳过后续所有字段更新
if not rebuild_api_key:
    return {"success": False, "error": "API Key 不能为空"}
```

## api_get_config 额外要求

1. 访问 `agent.llm_client` 前必须检查 `is not None`
2. 返回的 `api_key` 字段必须屏蔽：`"****" if llm_client and llm_client.api_key else ""`
3. 返回 `llm_configured: llm_client is not None` 布尔标志

## 前端配合

`main.js` 页面加载时：
```javascript
fetch('/api/status').then(r => r.json()).then(d => {
  if (d.agent && !d.agent.llm_configured) {
    showLlmConfigPrompt();  // 弹出配置提示
  }
});
```

`agent.get_status()` 必须返回 `llm_configured` 字段：
```python
'llm_configured': self.llm_client is not None,
```
