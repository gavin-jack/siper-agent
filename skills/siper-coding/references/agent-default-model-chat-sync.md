# Agent 默认模型联动对话页 — 数据流完整链路

**发现日期**: 2026-08-04
**修复 commit**: 7007c2b

## 问题现象

用户在「智能体配置」页设置了 `default_chat_model`，切换到「对话」页后模型选择器仍显示全局默认模型，而非 agent 配置的默认模型。

## 根因

`page-chat.js` 的 `loadAvailableModels()` 只调用 `/api/models/global`，从中取 `default_model`（全局默认）作为 `currentModel`。但 agent 的 `default_chat_model` 存在 `agents/default/config.json` 中，通过 `/api/config` 接口返回。对话页从未请求这个接口。

## 修复方案

同时请求 `/api/config`，优先级：`agent.default_chat_model` > `global.default_model`：

```javascript
const r = await fetch('/api/models/global');
const d = await r.json();
const globalDefault = d.default_model || '';

let agentDefaultChat = '';
try {
  const ar = await fetch('/api/config');
  const ad = await ar.json();
  agentDefaultChat = ad.default_chat_model || '';
} catch(e) {}

currentModel = agentDefaultChat || globalDefault;
```

## 关键陷阱

**JS 变量重用 bug**：patch 时容易把 `const ad = await ar.json()` 写成 `const ad = await r.json()`（复用外层变量 `r`），导致第二次 `.json()` 消费已消费过的 Response 对象，运行时返回 `TypeError: Body already consumed`。

**检测方法**：`node -c` 只能捕获语法错误，不能捕获变量名逻辑错误。需要人工 review 每个 `await x.json()` 的变量名是否与对应的 `fetch()` 变量一致。

## 数据流完整链路

```
启动时:
  siper_web.py → agent.config.default_chat_model = config.json["default_chat_model"]
  /api/config → {"default_chat_model": "xxx", ...}
  /api/models/global → {"default_model": "yyy", ...}

对话页加载:
  loadAvailableModels()
    → fetch('/api/models/global') → globalDefault
    → fetch('/api/config') → agentDefaultChat
    → currentModel = agentDefaultChat || globalDefault

模型切换:
  renderModelDropdown() click → currentModel = m.name
  sendMessage() → msgPayload.model = currentModel

后端:
  _process_ws_message() → selected_model = data.get("model")
  agent.process_message(model=selected_model)
    → if model != self.llm_client.model: _find_model_in_global(model) → configure_llm()
```

## 相关文件

| 文件 | 作用 |
|------|------|
| `page-chat.js` | `loadAvailableModels()`, `renderModelDropdown()` |
| `page-agent-config.js` | `autoSaveAgentModels()` 保存 `default_chat_model` |
| `siper_web.py:387-391` | 启动时加载 `default_chat_model` 到 `agent.config` |
| `siper_web.py:1072` | `/api/config` 计算 `_effective_default` |
| `siper_web.py:1091-1093` | `/api/config` 返回 `default_model` 和 `default_chat_model` |
| `agent.py:269-283` | `process_message()` 中模型切换逻辑 |
