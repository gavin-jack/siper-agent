# Agent Config UI — 新增配置项协同修改清单

## 适用场景
给 `AgentConfig` 加新的可配置字段，并在智能体页面（agent-config）暴露为 UI 控制项。

## 必须同步修改的 6 个文件

### 1. `ai_agent/core/agent.py`
- `AgentConfig` dataclass：加字段，带合理的默认值（如 `max_tool_rounds: int = 100`）
- 使用处：从 `self.config.xxx` 读取，不要用硬编码常量

### 2. `webui/templates/index.html`
- 在"运行设置"区域（搜索 `agentCfgMaxTools` 附近）加 `<div class="setting-row">`
- 包含 `<div class="setting-label">` 和对应的 `<input>` 元素
- input 的 `id` 命名规范：`agentCfgXxx`（大驼峰）
- 设置合理的 `min`/`max` 值（max 要足够大，如 max_tools 设 500，max_tool_rounds 设 200）

### 3. `webui/static/pages/page-agent.js`
- `loadAgentSettings()`：从 `agent.xxx` 或全局 config 加载值到 `document.getElementById('agentCfgXxx').value`
  - 回退默认值要与 AgentConfig 默认值一致（不要写死 10/3 等旧值）
- `saveAgentSettings()`：从 `document.getElementById('agentCfgXxx').value` 读取并加入 body
- `selectAgent()`：同样加载该值（因为 selectAgent 不经过 loadAgentSettings）
  - 回退默认值也要一致

### 4. `agents/__init__.py`
- `get_agent_info()` 返回的 dict 中加入 `"xxx": cfg.get("xxx", default)`
- 默认值必须与 `AgentConfig` dataclass 默认值一致
- **易漏**：这个文件负责 `/api/agents` 列表返回的数据，漏了则前端读不到

### 5. `siper_web.py`（4 处）
- **启动加载**（约 line 303-311）：`if "xxx" in agent_cfg: agent.config.xxx = int(agent_cfg["xxx"])`
- **`/api/agents` 列表**（约 line 990-1000）：加入 `"xxx": cfg.get("xxx", default)`（默认值一致）
- **`api_save_agent_meta()`**（约 line 1014+）：
  - `for key in (...)` 元组中加入新字段名
  - runtime 应用块中加入 `if "xxx" in body: agent.config.xxx = int(body["xxx"])`
- **`/api/config` 返回**（约 line 889-893）：加入 `"xxx": agent.config.xxx`

### 6. `agents/default/config.json`
- 加入字段并设为与代码默认值一致的值（否则 config.json 会覆盖代码默认值）
- **陷阱**：如果只改代码默认值不改 config.json，旧 config.json 中的旧值仍会覆盖

## 默认值一致性规则（⚠️ 关键）
所有位置的默认值必须一致：
- `AgentConfig` dataclass 默认值
- `page-agent.js` 回退默认值（loadAgentSettings + selectAgent 两处）
- `agents/__init__.py` cfg.get() 默认值
- `siper_web.py` cfg.get() 默认值
- `config.json` 实际值

不一致会导致 API 返回的值与代码默认值不同，造成"改了代码但没生效"的假象。

## 验证方法
1. `python3 -m py_compile agent.py` 检查语法
2. 重启服务后 curl `/api/config` 确认新字段返回正确值
3. curl `/api/agents` 确认 agent 列表中包含新字段
4. 浏览器打开智能体页面，检查 input 值是否正确加载
5. 修改值后保存，重启服务确认持久化生效

## 历史案例
- v0.9.1：新增 `max_tool_rounds`（最大工具调用轮次），默认 3，范围 1-20
- v0.9.19：`max_tool_rounds` 默认提升到 100，max 扩到 200；`max_concurrent_tools`（max_tools）默认提升到 300，max 扩到 500。同步更新了全部 6 个文件。
