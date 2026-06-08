# LLM Client None 守卫 — 配置更新陷阱（v0.9.28+）

## 问题描述

当 `agent.llm_client` 为 `None` 时（首次启动无 API Key），Web UI 保存模型配置会触发：
```
AttributeError: 'NoneType' object has no attribute 'model'
```

## 影响位置

两处：
1. `api_update_config()` — `/api/config` POST 处理
2. `api_update_agent_meta()` — agent 元数据更新

## 正确修复模式

```python
cur = agent.llm_client
rebuild_model = new_model or (cur.model if cur else "")
rebuild_base_url = new_base_url or (cur.base_url if cur else "")
rebuild_api_key = new_api_key or (cur.api_key if cur else "")
if rebuild_api_key:
    agent.configure_llm(...)
else:
    logger.warning("配置更新：未提供 API Key，跳过 LLM 客户端重建")
```

## ⚠️ 禁止模式 — return 过早退出

**错误写法**（会跳过后续字段更新）：
```python
if not rebuild_api_key:
    return {"success": False, "error": "API Key 不能为空"}
# ❌ 后续 agent_name/max_tools/session_timeout 等字段全部被跳过
```

**正确写法**：用 `if/else` 仅跳过 `configure_llm` 调用，不 return。

## save_agent_config_file 参数陷阱

`save_agent_config_file(name, data)` 的 `name` 参数是 **agent 目录名**（如 `"default"`），不是显示名。
- ✅ `agent.config.agent_name` — 目录名（`"default"`）
- ❌ `agent.config.name` — 显示名（可能已被用户修改）

## 验证方法

1. 清空 config.json 的 models 为 `[]`
2. 启动 SiPer（无 API Key）
3. Web UI 配置页面填入模型信息点保存
4. 检查日志无 AttributeError
5. 确认 LLM Client 已初始化（/api/status 中 llm_client 不为 null）
