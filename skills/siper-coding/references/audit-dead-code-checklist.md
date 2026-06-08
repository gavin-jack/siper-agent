# SiPer 代码审计清单 — 2026-05-23

> 基于全代码库静态分析（JS/Python/CSS/HTML）。标记 ❌ = 可安全删除。

---

## JavaScript 死代码

| 文件 | 大小 | 原因 |
|------|------|------|
| ❌ `webui/static/app.js` | 141KB | `index.html` 未引用，69个函数全部在 core.js/page-*.js 中有替代版本 |
| ❌ `webui/static/pages/page-agent.js` | 21KB | `index.html` 无 `#page-agent` HTML 容器，8个函数全未被 onclick 引用 |

### page-agent.js 详细废弃原因
- `renderModelList` 引用 `agentModelList`，但 HTML 中只有 `agentModelListSection`（在 page-agent-config.js 中正确引用）
- `addModel`/`removeModel`/`setDefaultModel` 功能已迁移到 page-agent-config.js
- `switchAgentPageTab`/`switchAgentTab` 与 page-agent-config.js 中的 `switchConfigAgentPageTab`/`switchConfigAgentTab` 重复
- `loadAgentSettings` 中的模型加载逻辑已被 page-agent-config.js 的 `renderAgentModelSection` + `loadGlobalModelsForAgent` 替代

### app.js 中的 console.log 残留
- `console.log('[STREAM] delta:', JSON.stringify(d.delta)`
- `console.log('[STREAM] creating bubble, text so far:', ...)`

---

## Python 死代码

| 模块/文件 | 大小 | 原因 |
|-----------|------|------|
| ❌ `ai_agent/orchestration/` | 32KB | `multi_agent_coordinator.py`(512行) + `meeting_room.py`(451行)。siper_web.py 中 `_ensure_coordinator()` 从未被实际调用 |
| ❌ `ai_agent/gateway/` | 25KB | `message_gateway.py`(342行) + `web_server.py`(129行) + adapters。ai_agent/__init__.py 导出但 siper_web.py 未使用 |
| ❌ `ai_agent/tools/_echo_tool.py` | 2KB | 测试工具，未注册 |
| `_ensure_coordinator()` (siper_web.py:224-234) | 11行 | 函数存在但从未调用 |
| `_heartbeat_log()` (siper_web.py:83) | 1行 | 仅定义无调用 |

---

## 静态文件死代码

| 文件 | 大小 | 原因 |
|------|------|------|
| ❌ `webui/static/marked-4.3.0.tgz` | 106KB | markdown-it 方案已回退，无任何文件引用 |
| ❌ `webui/static/marked-16.3.0.tgz` | 107KB | 同上，旧版本残留 |
| ❌ `webui/static/style.css.backup` | 64KB | CSS 备份，生产环境不需要 |
| ❌ `.tmp/*.py` (12个) | 19KB | execute_code 残留，定期清理 |

---

## 调试残留

| 文件 | 内容 |
|------|------|
| `core.js` | `console.log('[STREAM_END] _streamAcc length:', _streamAcc.length, ...)` |
| `app.js` | 2 处 console.log（删除文件时一并清除） |

---

## 跨文件重复函数名（app.js ↔ page-*.js）

共 60 个函数名重复。app.js 不被加载，所以不导致运行时冲突，但删除 app.js 后这些名称变为唯一。

关键重复：
- `renderModelList` — page-agent.js(废弃) + page-agent-config.js(活跃) + app.js(死)
- `addModel`/`removeModel`/`setDefaultModel` — page-agent.js(废弃) + app.js(死)
- `switchAgentTab`/`switchAgentPageTab` — page-agent.js(废弃) + app.js(死)

**删除 page-agent.js 和 app.js 后，这些名称不再冲突。**

---

## 执行优先级

### 🔴 安全删除（不影响运行时）
1. `app.js` — 141KB
2. `page-agent.js` — 21KB
3. `marked-4.3.0.tgz` + `marked-16.3.0.tgz` — 213KB
4. `style.css.backup` — 64KB
5. `.tmp/*.py` — 19KB

### 🟡 评估后删除（需确认功能不再需要）
6. `orchestration/` — 32KB
7. `gateway/` — 25KB
8. `_echo_tool.py` — 2KB
9. siper_web.py 中 `_ensure_coordinator()` — 11行

### 🟢 清理
10. core.js 中的 console.log
11. `ai_agent/__init__.py` 中移除未使用的导出
