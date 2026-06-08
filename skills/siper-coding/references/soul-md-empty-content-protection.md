# soul.md 被空内容覆盖的防御（v0.9.85d+）

## 问题描述

soul.md 被清空为 0 字节，但 `.bak` 备份文件存在（6098 字节）。说明经过了 `save_agent_file()` 的正常流程（先备份再写入），但写入的内容是空字符串。

## 根因分析

**双层漏洞**：

1. **`api_save_agent_file()` 不验证 content**：`body.get("content", "")` 在 content 字段缺失时返回空字符串，直接传给 `save_agent_file()`
2. **`save_agent_file()` 不拒绝空内容**：只要 content 是字符串（包括空字符串），就会先备份原文件到 `.bak`，再写入空内容

**时间线分析**：
- 16:44:11 用户发"你好"
- 16:44:15 SiPer 回复
- 16:45:42 soul.md 被清空（87秒后，无新用户消息）
- 无日志记录（日志被轮转）

**可能的触发者**：
- Hermes Agent 的 `write_file` 工具**不保护** SiPer 的 `agents/default/soul.md`
- Hermes 的 `is_write_denied()` 只保护 `.ssh/`、`.env`、shell 配置和 Hermes 自身文件
- LLM 可通过 Hermes 的 `write_file` 或 `execute_command` 绕过 SiPer 的 path_safety.py 保护

## 修复方案

### 1. `agents/__init__.py` — `save_agent_file()` 拒绝空内容

在写入前检查：
```python
if content is None or (isinstance(content, str) and content.strip() == ""):
    return False
```

### 2. `siper_web.py` — `api_save_agent_file()` 提前检查

```python
content = body.get("content", "")
if not content or (isinstance(content, str) and content.strip() == ""):
    return {"success": False, "error": "content 不能为空"}
```

双层防护：API 层 + 函数层都检查，确保空内容无法写入。

## Hermes Agent 绕过风险

**Hermes Agent 的 write_file 不保护 SiPer 文件**：
- Hermes 的 `agent/file_safety.py` 中 `build_write_denied_paths()` 只包含：`.ssh/`、`.env`、`.bashrc`、`.zshrc`、`/etc/sudoers` 等
- `build_write_denied_prefixes()` 只包含：`.ssh/`、`.aws/`、`.gnupg/`、`.kube/`、`.docker/` 等
- **不包含** `/home/gavin/.siper/agents/default/soul.md`

**SiPer 的 path_safety.py 只保护 SiPer 工具**：
- `PROTECTED_AGENT_FILES` 只对 SiPer 的 `write_file_tool.py` 和 `patch_tool.py` 生效
- Hermes Agent 的工具不 import SiPer 的 path_safety.py

**结论**：LLM 通过 Hermes Agent 的 `write_file` 工具可以直接写入 soul.md，绕过 SiPer 的所有保护。

## 恢复方法

如果 soul.md 被清空：
```bash
cp /home/gavin/.siper/agents/default/soul.md.bak /home/gavin/.siper/agents/default/soul.md
```

## 预防措施

1. **双层空内容检查**（已实施）
2. **定期备份**：每次写入前自动备份到 `.bak`（已有）
3. **监控文件变化**：可用 `inotifywait` 监控 soul.md 变化
4. **考虑**：在 Hermes Agent 的 file_safety 中添加 SiPer 路径（需要 Hermes 侧修改）
