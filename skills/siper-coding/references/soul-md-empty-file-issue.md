# soul.md 空文件导致智能体配置文件显示不出来

## 现象

用户反馈"智能体配置文件标签页 soul.md 显示不出来"。

## 诊断过程

1. 检查 HTML 结构：`agentTabContentFiles` 包含 `agentSoulContent` textarea，结构正常
2. 检查 CSS：`.agent-file-editor` 样式正常
3. 检查 JS：`selectConfigAgent()` 正确调用 fetch('/api/agents/default/soul') 并填充 textarea
4. 检查后端 API：`GET /api/agents/default/soul` 返回 `{"name": "default", "soul": ""}`
5. 检查文件：`agents/default/soul.md` 存在但大小为 **0 字节**

## 根因

**soul.md 文件被清空（0字节）**，不是前端显示 bug。

## 常见原因

- LLM 工具（write_file/patch）意外覆盖了 soul.md
- 文件被手动编辑后保存为空
- 部署包同步时覆盖了 soul.md

## 修复方案

### 恢复 soul.md 内容

1. 检查备份：`agents/default/soul.md.bak`
2. 检查 git 历史：`git log -- agents/default/soul.md`
3. 如果备份也是空的，需要用户重新填写 soul.md 内容

### 预防措施

- soul.md 受 `path_safety.py` 保护，LLM 工具不应直接写入
- 如果 soul.md 被意外清空，从 `soul.md.bak` 恢复
- 部署包中应包含默认的 soul.md 内容

## 相关代码

- `agents/__init__.py:55-62` — `load_agent_soul()` 函数
- `siper_web.py:1211-1218` — `api_get_agent_soul()` API
- `webui/static/pages/page-agent-config.js:265-289` — 前端加载 soul.md 逻辑
