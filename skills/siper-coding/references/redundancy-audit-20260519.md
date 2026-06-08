# Siper 项目冗余代码审计报告（2026-05-19）

## 发现汇总（按严重程度）

### 严重：app.js 死文件（4054行）
- `webui/static/app.js` 未被 index.html 引用，浏览器不加载
- 包含 129 个函数、1183 个 i18n 键
- 与 15 个 page-*.js 文件之间有 ~80 个同名重复函数
- **风险**：若将来被加到 index.html，会覆盖 page-*.js 的所有函数，重新引入 bug
- **建议**：删除或添加 `// DEAD CODE` 注释

### 中等：webui/ 根目录备份文件（5个，~1MB）
- `webui/index.html.bak` + 4 个带时间戳的备份
- 5月14日重构时产生，不再需要
- **建议**：删除或移至 /tmp

### 中等：budget_config.py 死代码
- `ai_agent/tools/budget_config.py`（41行）定义了 BudgetConfig 和 DEFAULT_BUDGET
- 无任何其他文件 import 它
- **建议**：确认无引用后删除

### 低：9个工具文件共享相同 import 块
- 所有 `*_tool.py` 开头都是相同的 4 个 import
- Python 模块缓存让这不影响性能
- **建议**：可选优化，提取到 base_tool.py

### 低：工具 schema 大小不均
- search_files: 1575 chars（最大）
- memory: 1321 chars
- read_file: 800 chars
- execute_command: 741 chars
- 其余均 < 600 chars
- **影响**：每次 LLM 调用都发送完整 schema，大 schema 浪费 token

### 低：agent.py 6 个大函数
- _handle_tool_calls: 137 行
- process_message: 113 行
- _get_system_prompt: 71 行
- _llm_call: 70 行
- _describe_images_with_vision: 68 行
- _build_user_content: 54 行

## 文件行数统计

### Python 文件
| 文件 | 行数 |
|------|------|
| siper_web.py | 2315 |
| agent.py | 933 |
| multi_agent_coordinator.py | 512 |
| session_manager.py | 484 |
| meeting_room.py | 451 |
| skill_loader.py | 356 |
| message_gateway.py | 342 |
| llm_client.py | 205 |
| metrics.py | 200 |
| web_server.py | 129 |
| tool_registry.py | 418 |
| 9个工具文件 | 1049（合计）|

### JS 文件
| 文件 | 行数 |
|------|------|
| app.js（死文件）| 4054 |
| core.js | 1562 |
| page-agent.js | ~450 |
| page-chat.js | ~480 |
| page-meeting.js | ~437 |
| page-theme.js | ~215 |
| page-sessions.js | ~170 |
| page-logs.js | ~170 |
| page-settings.js | ~157 |
| page-memory.js | ~160 |
| page-tasks.js | ~199 |
| page-skills.js | ~25 |
| page-token.js | ~31 |
| page-gateway.js | ~91 |
| main.js | 7 |

## JS 跨文件重复函数（app.js vs page-*.js）

以下函数在 app.js 和对应的 page-*.js 中都有定义（共 ~80 个）：
- page-agent.js: addModel, doSwitchAgent, loadAgentSettings, onAgentSelectorChange, refreshAgentConfig, refreshAgentFile, removeModel, renderModelList, saveAgentFile, saveAgentSettings, saveAllModels, selectAgent, setDefaultModel, switchAgent, switchAgentPageTab, switchAgentTab
- page-chat.js: addMsg, addMsgHtml, appendMeta, buildActions, handleImageSelect, removeImage, renderImagePreviews, renderToolCalls, sendMessage, showToast
- page-gateway.js: controlGateway, refreshGateway
- page-logs.js: applyLogFilters, applyLogLogsDebounced, clearLogs, gotoLogPage, refreshLogs, renderLogLevelFilters, renderLogPagination, renderLogSourceOptions, toggleAutoRefresh, toggleLogLevel
- page-meeting.js: addAgentToMeeting, cancelMeetingRoom, deleteMeetingRoom, enterMeetingRoom, exitMeetingRoom, generateAISummary, hideMeetingForm, joinMeetingById, pollMeetingOnce, refreshMeetingRooms, renderMeetingDetail, renderSpeeches, showCreateMeetingForm, startMeetingPoll, stopMeetingPoll, submitMeetingForm, submitSpeech
- page-memory.js: onMemoryAgentChange, populateMemoryAgentSelector, refreshMemoryConfig, refreshMemoryPage, resetMemoryConfig, saveMemoryConfig, saveMemoryMd, updateMemoryPreview
- page-models.js: escapeHtml, fmt
- page-sessions.js: clearAllSessions, deleteSession, escapeHtml, formatTime, loadSessionHistory, newSession, previewSession, refreshSessions, switchSession
- page-settings.js: addModelToList, refreshGlobalSettings, removeModel, renderSettingsModelsList, resetGlobalSettings, saveGlobalSettings
- page-skills.js: refreshSkills
- page-tasks.js: closeTaskHistory, deleteTask, hideTaskForm, refreshTasks, saveTask, showTaskForm, showTaskHistory, toggleTask, triggerTask, updateCronHint
- page-theme.js: applyThemeValue, deleteThemeTemplate, exportSingleTemplate, exportTheme, importTheme, loadTheme, loadThemeTemplate, renderColorSettings, renderSizeSettings, renderTemplateList, resetTheme, saveThemeTemplate, saveThemeToStorage, showThemeSettings
- page-token.js: fmt, refreshTokenStats
- core.js: cancelConfirm, execConfirm, showConfirm, hideLoginModal, showLoginModal

注意：由于 app.js 未被加载，这些重复在运行时不会造成问题。但搜索 grep 时会找到两份定义，容易混淆排查。

## 未使用的 Python 文件（无其他文件 import）

以下文件定义了类/函数，但没有被任何其他文件 import：
- `ai_agent/tools/budget_config.py` — BudgetConfig 类，无引用（死代码）
- `ai_agent/tools/_echo_tool.py` — 下划线前缀跳过自注册，仅测试引用

## 建议清理优先级

1. 删除 app.js（先 git stash 备份）
2. 删除 5 个 webui/*.bak 备份文件
3. 删除 budget_config.py
4. （可选）提取工具文件公共 import 到 base_tool.py
