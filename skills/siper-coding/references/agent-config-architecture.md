# 智能体独立配置架构分析（v0.4.26）

## 现象

全局设置页和智能体配置页都有 session_timeout/max_tools 设置项，看起来可以独立配置。

## 实际架构（v0.4.26 状态）

**只有一个全局配置源**：`agent.config`（`ai_agent/core/agent.py` 中的 `AgentConfig` 实例）。

### 已完成的改动（v0.4.26）

1. `api_save_agent_meta` 已增加 session_timeout/max_tools 字段支持
2. `api_get_agents` 返回数据已增加 session_timeout/max_tools 字段
3. 前端 page-agent.js `loadAgentSettings()` 已改为从智能体自身 config 读取
4. 前端 page-agent.js `saveAgentSettings()` 已改为通过 meta API 保存

### 仍存在的问题

`api_save_agent_meta` 中 `from agents import save_agent_config_file, load_agent_config_file` 仍会 ImportError（agents 模块中这两个函数不存在）。虽然 try/except 静默捕获不会崩溃，但智能体的 session_timeout/max_tools 实际上没有持久化到文件。

**结果**：智能体配置的 session_timeout/max_tools 保存后立即生效（写入了运行时 agent.config），但重启服务后丢失（因为 config.json 从未被正确写入）。

## 修复路径

### 待完成：修复 agents 模块 config.json 读写

需要在 `agents/__init__.py` 中实现 `save_agent_config_file`/`load_agent_config_file` 函数，或直接在 `api_save_agent_meta` 中用 `json.dump` 写入 `agents/<name>/config.json`。

检查方法：
```bash
python3 -c "from agents import save_agent_config_file, load_agent_config_file; print('OK')"
```

### 待完成：新建智能体时继承全局默认值

新建智能体时，config.json 应从全局 agent.config 复制 session_timeout/max_tools 作为初始值。

## 验证方法

1. 选择智能体 A，修改 session_timeout 为 1800，保存
2. 选择智能体 B，修改 session_timeout 为 7200，保存
3. 重启服务后重新加载页面，确认两个智能体的 session_timeout 各自保持独立值
4. 确认全局设置页的 session_timeout 不受影响
