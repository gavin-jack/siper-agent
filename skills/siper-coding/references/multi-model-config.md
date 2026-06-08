# 多模型配置功能实现模式

## 概述
Siper 支持配置多个 LLM 模型，用户可在聊天页面切换模型，模型配置持久化到 `models.json`（项目根目录）。

## 配置文件格式
`~/.siper/models.json`（项目根目录，不是 `config/` 子目录）
```json
{
  "models": [
    {
      "name": "LongCat-2.0-Preview",
      "provider": "longcat",
      "base_url": "https://api.longcat.chat/openai",
      "api_key": "",
      "context_window": 1000000
    }
  ],
  "default_model": "LongCat-2.0-Preview"
}
```

**关键**：`default_model` 必须设为 models 列表中存在的模型名，不能为空字符串。否则前端选择器加载后不会预选任何具体模型。

## 实现链路

### 1. 后端 — agent.py
`process_message` 增加 `model: Optional[str] = None` 参数：
```python
if model and model != self.llm_client.model:
    model_cfg = None
    if self.config.models:
        for m in self.config.models:
            if m.get("name") == model:
                model_cfg = m
                break
    if model_cfg:
        api_key = model_cfg.get("api_key") or os.environ.get("LONGCAT_API_KEY", "")
        self.configure_llm(
            api_key=api_key,
            base_url=model_cfg.get("base_url", self.llm_client.base_url),
            model=model_cfg.get("name", model),
        )
    else:
        self.llm_client.model = model
```

### 2. 后端 — siper_web.py
WS 消息处理中传递 model 参数：
```python
selected_model = data.get("model")
result = await agent.process_message(
    message=effective_text,
    user_id="web_user",
    session_id=session_id,
    stream_callback=_send_stream_chunk,
    model=selected_model,  # 新增
)
# 响应中返回实际使用的模型
actual_model = selected_model or agent.llm_client.model if agent.llm_client else "unknown"
```

### 3. 前端 — page-chat.js
- 页面加载时调用 `loadAvailableModels()` 从 `/api/models/global` 获取模型列表
- 填充 `<select id="chatModelSelect">` 下拉框
- `sendMessage()` 构造 payload 时附加 `model` 字段：
```javascript
const msgPayload = { type: 'message', content, session_id: currentSession };
if (currentModel) msgPayload.model = currentModel;
ws.send(JSON.stringify(msgPayload));
```

### 4. 已有基础设施（无需改动）
- `/api/models/global` GET/POST API 已存在（`siper_web.py` 第 455-458 行）
- `page-models.js` 模型管理 CRUD 已存在
- `api_save_global_models()` 持久化到 `config/models.json`

## 常见陷阱

### loadAvailableModels 未被调用（v0.6.9）
`page-chat.js` 中定义了 `loadAvailableModels()` 和 `updateCurrentModel()`，但 `main.js` 中缺少调用。症状：聊天输入框模型选择下拉框始终只有"默认模型"一个选项。修复：在 `main.js` 的 init 部分添加 `loadAvailableModels()`（在 `connectWS()` 之前或之后均可）。

### 添加非 OpenAI 兼容模型（如商汤日日新）

商汤日日新 API 与 OpenAI 格式不完全兼容，添加时需注意：

1. **模型名称格式**：商汤 API 对 model 字段值敏感，点号（`.`）和中划线（`-`）不能混用。例如 `sensenova-6.7-flash-lite` 会返回 HTTP 400 `Unsupported model`，需确认 API 文档中的正确名称格式（可能是 `sensenova-6-7-flash-lite` 或其他）。

2. **验证方法**：添加模型前，先用 curl 直接测试 API 确认 model 名称可用：
```bash
curl -s <base_url>/chat/completions \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"model": "<model_name>", "messages": [{"role":"user","content":"hi"}], "max_tokens": 10}'
```

3. **base_url**：商汤日日新的 base_url 通常为 `https://api.sensenova.cn/v1/llm`（需确认）。

4. **添加到 config.json**：
```json
{
  "name": "商汤日日新",
  "provider": "sensenova",
  "base_url": "https://api.sensenova.cn/v1/llm",
  "api_key": "<actual_api_key>",
  "context_window": 128000
}
```

5. **tool_choice 不兼容（v0.6.24）**：SenseNova API 不支持 `tool_choice: "auto"` 参数。如果 `llm_client.py` 发送了此参数，会返回 HTTP 400 `invalid tool_call type`。修复：在 `llm_client.py` 的 `chat_completion` 和 `chat_completion_stream` 中，当 `base_url` 包含 `sensenova` 时跳过 `tool_choice`。详见 `references/sensenova-tool-choice-incompatibility.md`。

6. **同时更新两个文件**：`agents/default/config.json`（agent 运行时读取）和 `models.json`（前端模型选择器读取）。

### models.json 与 config.json 模型列表不同步（关键陷阱）
`agent.config.models` 从 `agents/default/config.json` 加载，而前端模型选择器从 `models.json` 加载。如果用户在全局设置中添加了 `models.json` 中的新模型但 `config.json` 中没有，`process_message` 的模型切换逻辑找不到配置，只改 model name 不改 base_url/api_key，导致请求失败。保持两个文件的 models 列表一致。

**实际案例（v0.6.23）**：用户选择"商汤日日新"模型后报错 `Unsupported model (model=sensenova-6.7-flash-lite)`。排查发现：
- `models.json` 中有商汤模型配置（name + base_url + api_key）
- `agents/default/config.json` 中只有 LongCat 模型
- agent 在 `self.config.models` 中找不到商汤配置，走 else 分支只改 `self.llm_client.model = model`
- 结果：用 LongCat 的 base_url 发送 `model=sensenova-6.7-flash-lite` → LongCat API 不认识 → 报错
- **修复**：将商汤模型配置添加到 `agents/default/config.json` 的 `models` 数组中

**规则**：添加新模型时，必须同时更新两个文件：
1. `models.json`（前端模型选择器读取）
2. `agents/default/config.json`（后端 agent 模型切换读取）
- `api_key` 可为空，优先从环境变量 `LONGCAT_API_KEY` 读取
- 模型切换仅对当前消息生效，不改变全局默认模型
- 模型配置中 `api_key` 字段建议留空，统一从环境变量读取，避免敏感信息泄露
- 前端模型选择器为空（`value=""`）表示使用默认模型

## 模型配置保存链路（v0.8.5+）

### 缺陷描述
前端 `saveSidebarSettings()`（设置弹窗）和 `saveAllModels()`（智能体配置页）只发送 `{models, default_model}` 到后端，**不传 `{model, base_url, api_key}`**。后端 `api_update_config()` 和 `api_save_agent_meta()` 只修改 `llm_client.model` 等属性，**不重建 LLMClient 实例**。

### 症状
用户在设置页面修改模型配置（如切换 base_url 或 api_key）后，LLM 请求仍使用旧配置，因为 OpenAI SDK 客户端的 `max_retries`、`timeout`、连接池等参数绑定在 LLMClient 实例上，仅修改属性不生效。

### 修复方案
**前端**（`page-settings.js` 和 `page-agent.js`）：从 default model 配置中提取完整信息一并发送：
```javascript
const defCfg = settingsModelsCache.find(m => m.name === defModel) || settingsModelsCache[0] || {};
const body = {
  models: settingsModelsCache,
  default_model: defModel,
  model: defCfg.name || '',
  base_url: defCfg.base_url || '',
  api_key: defCfg.api_key || '',
};
```

**后端**（`siper_web.py`）：调用 `agent.configure_llm()` 重建 LLMClient，而非仅修改属性：
```python
if new_model or new_base_url or new_api_key:
    cur = agent.llm_client
    agent.configure_llm(
        api_key=new_api_key or cur.api_key,
        base_url=new_base_url or cur.base_url,
        model=new_model or cur.model,
        vision_api_key=os.environ.get("SENSENOVA_API_KEY", ""),
        vision_base_url="https://token.sensenova.cn/v1",
        vision_model="sensenova-6.7-flash-lite",
    )
```

### 涉及文件
- `webui/static/pages/page-settings.js` — `saveSidebarSettings()`
- `webui/static/pages/page-agent.js` — `saveAllModels()`
- `siper_web.py` — `api_update_config()` 和 `api_save_agent_meta()`

## 版本
- 实现于 v0.6.7
- 配置文件路径：`~/.siper/models.json`（项目根目录）
- v0.6.9 修复：选择器未初始化 + default_model 为空
- v0.6.23 新增：商汤日日新等非 OpenAI 兼容模型的添加注意事项
- v0.6.24 新增：SenseNova tool_choice 不兼容修复（invalid tool_call type HTTP 400）
- v0.8.5 修复：模型配置保存链路缺陷（前端补全字段 + 后端重建 LLMClient）
