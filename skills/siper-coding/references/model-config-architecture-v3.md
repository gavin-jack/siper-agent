# 模型配置架构重构（v0.9.43+）

> 重构时间：2026-07-31
> 核心变化：全局模型统一管理（含别名、能力标签、per-model key/url），agent 只引用全局模型 ID

## 架构对比

### 之前（v0.9.42-）
- `config.json`：每个 agent 自己存 `models[]` + `default_model`
- `models.json`：全局模型，格式简单（无别名、无能力标签、无 per-model key/url）
- 问题：模型配置分散，agent 间无法共享，无法按能力选择模型

### 之后（v0.9.43+）
- `models.json`：**唯一**模型配置存储，包含别名、能力标签、per-model key/url
- `config.json`：只存 agent 显示属性（name/icon/avatar/session_timeout/max_tools）+ **模型引用**（available_models/default_chat_model/default_vision_model/default_tts_model）
- agent 不保存模型配置，只保存可用模型引用

## models.json v3 格式

```json
{
  "version": 2,
  "providers": {
    "openai": {
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-...",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "alias": "4o",
          "base_url": "",
          "api_key": "",
          "context_length": 128000,
          "capabilities": ["chat", "reasoning", "code", "vision"]
        }
      ]
    }
  },
  "default_provider": "openai",
  "default_model": "gpt-4o"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `alias` | string | 模型别名（短名），为空时前端显示 `name` |
| `base_url` | string | per-model API 地址，为空时 fallback 到 provider 级别 |
| `api_key` | string | per-model API Key，为空时 fallback 到 provider 级别 |
| `context_length` | int | 上下文窗口大小 |
| `capabilities` | string[] | 能力标签（见下方） |

### 能力标签（capabilities）

| 标签 | 含义 | 自动识别关键字 |
|------|------|----------------|
| `chat` | 对话 | 默认所有模型 |
| `reasoning` | 推理 | `reason`、`r1`、`o1`、`o3`、`thinking` |
| `code` | 代码 | `code`、`coder`、`编程` |
| `vision` | 视觉/图像理解 | `vision`、`visual`、`image`、`see`、`ocr` |
| `tts` | 文字转语音 | `tts`、`speech`、`voice`、`audio` |
| `embedding` | 向量嵌入 | `embed`、`embedding` |
| `image_gen` | 图像生成 | `image_gen`、`dall`、`draw`、`paint` |

自动识别在 `api_discover_models` 中实现，用户可手动编辑。

## agent config.json 新格式

```json
{
  "name": "Default Agent",
  "icon": "🧠",
  "session_timeout": 3600,
  "max_tools": 30,
  "max_tool_rounds": 100,
  "available_models": ["LongCat-2.0-Preview", "gpt-4o"],
  "default_chat_model": "LongCat-2.0-Preview",
  "default_vision_model": "gpt-4o",
  "default_tts_model": ""
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `available_models` | string[] | 引用全局 models.json 中的模型 id |
| `default_chat_model` | string | 默认对话模型（必须在 available_models 中） |
| `default_vision_model` | string | 默认视觉模型（必须在 available_models 中，且需有 vision 能力） |
| `default_tts_model` | string | 默认 TTS 模型（必须在 available_models 中，且需有 tts 能力） |

## 后端 API 变更

### 模型相关
- `GET /api/models/global`：返回 alias、capabilities、per-model key/url
- `POST /api/models/global`：保存 alias、per-model key/url
- `POST /api/models/discover`：增强能力识别（7 种标签），discovered 模型加空 alias

### Agent 配置相关
- `GET /api/config`：返回 available_models/default_chat_model/default_vision_model/default_tts_model
- `POST /api/config`：支持新字段读写
- `GET /api/agents`：返回新字段
- `POST /api/agents/meta`：保存新字段
- `POST /api/agents/switch`：旧字段自动迁移到新字段

## 前端变更

### 全局设置 → 模型管理
- 模型卡片：显示别名 + 能力标签 badge（彩色）
- ✏️ 编辑按钮：编辑别名、能力标签（checkbox × 7）、per-model API 配置（折叠区域）
- Provider 预设新增"自定义"选项

### Agent 设置 → 模型配置卡片
- 可用模型多选（checkbox 列表，从全局模型加载，显示能力图标）
- 默认对话模型下拉（从已选可用模型中选）
- 默认视觉模型下拉

### 对话页模型选择器
- 只显示当前 agent 的 `available_models` 中的模型
- 显示别名（alias）

## 向后兼容

`api_switch_agent` 中检测旧字段（`models[]` / `default_model`）并自动迁移：
- `models[].id` → `available_models[]`
- `default_model` → `default_chat_model`

## 关键文件

| 文件 | 变更 |
|------|------|
| `models.json` | v3 格式（alias/capabilities/per-model key/url） |
| `agents/default/config.json` | 新格式（available_models + default_*_model） |
| `ai_agent/core/agent.py` | AgentConfig 新字段 + `_find_model_in_global()` |
| `siper_web.py` | 模型加载支持 alias/per-model fallback |
| `webui/static/pages/page-settings.js` | renderSettingsModelsList + editModel |
| `webui/static/pages/page-agent-config.js` | renderAgentModelSection + saveAgentSettings |
| `webui/static/pages/page-chat.js` | loadAvailableModels 按 agent 过滤 |
| `webui/templates/index.html` | agentModelSection 容器卡片 |
| `webui/static/i18n/log-i18n.json` | 新增 i18n key |

## i18n Key

| Key | zh | en |
|-----|----|----|
| `chat.noModels` | 当前 Agent 未配置可用模型 | No models configured |
| `chat.modelSaved` | 模型已切换 | Model switched |
| `settings.modelSaved` | 模型配置已保存 | Models saved |
| `agent.availableModels` | 可用模型 | Available Models |
| `agent.defaultChatModel` | 默认对话模型 | Default Chat Model |
| `agent.defaultVisionModel` | 默认视觉模型 | Default Vision Model |
| `agent.modelConfig` | 模型配置 | Model Configuration |

## 编辑模型配置时的陷阱

1. **per-model key/url 为空时的 fallback**：代码必须处理空字符串 → fallback 到 provider 级别
2. **agent available_models 引用校验**：保存 agent 配置时，default_chat_model 必须在 available_models 中
3. **能力标签 discover 后仅自动识别**：用户可手动编辑，不要覆盖用户手动设置的标签
4. **前端 checkbox 状态同步**：saveAgentSettings 时必须重新收集所有 checkbox 状态，不能依赖闭包快照
5. **alias 为空时显示 name**：前端 `${m.alias || m.name}` 模式
