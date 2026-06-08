# UI Bug: 智能体配置文件标签卡未显示

在 `http://localhost:9724/#agent-config` 页面中，第二个标签卡 “智能体配置文件” 未正确展示配置文件内容。

**可能原因**：
- 前端 `page-agent-config.js` 中 `saveAgentFile` 对 `config` 类型的请求路径或返回处理有误。
- 前端读取 `/api/agents/<name>/config` 的返回字段名应为 `config`，但后端可能返回 `configData` 或未绑定。
- UI 文本区域 ID 为 `agentMdContent`，若未正确填充值则显示为空。

**排查建议**：
1. 检查后端 `/api/agents/<name>/config` 实现，确保返回 JSON `{ "config": "..." }`。
2. 确认前端 `fetch('/api/agents/' + name + '/config')` 返回的 `configData.config` 正确赋值给 `mdTa.value`。
3. 浏览器开发者工具 Network 查看响应体是否含 `config` 字段。
4. 若响应字段名不同，修改 `page-agent-config.js` 第 224‑226 行相应的属性名。

**快速修复**：在 `page-agent-config.js` 中将 `const configData = await configRes.json();` 后的赋值改为 `cachedConfigContent = configData.config || configData.configData || '';
`

**后续**：将此参考文件加入 `siper-coding` skill 的引用列表，以便后续维护者快速定位。