# models.json v2 格式规范（v0.9.30+）

## 文件格式

v2 格式按 provider 分组，支持多 provider 共存：

```json
{
  "version": 2,
  "providers": {
    "longcat": {
      "base_url": "https://api.longcat.chat/openai",
      "api_key": "ak_...",
      "discovered_at": 1747730400,
      "models": [
        {
          "id": "LongCat-2.0-Preview",
          "name": "LongCat-2.0-Preview",
          "context_window": 1000000,
          "capabilities": [],
          "is_default": true
        }
      ]
    },
    "openai": {
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-...",
      "models": [
        {"id": "gpt-4o", "name": "gpt-4o", "context_window": 128000, "capabilities": ["vision"], "is_default": false}
      ]
    }
  },
  "default_provider": "longcat",
  "default_model": "LongCat-2.0-Preview"
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | int | 必须为 2 |
| `providers` | object | key 为 provider 名称 |
| `providers.*.base_url` | string | Provider API 基础地址 |
| `providers.*.api_key` | string | API Key（加密存储） |
| `providers.*.models` | array | 该 provider 下的模型列表 |
| `models[].id` | string | 模型唯一标识 |
| `models[].name` | string | 显示名称（通常同 id） |
| `models[].context_window` | int | 上下文窗口（tokens） |
| `models[].capabilities` | string[] | 能力标签：vision/reasoning/code |
| `models[].is_default` | bool | 是否为默认模型 |
| `default_provider` | string | 默认 provider 名称 |
| `default_model` | string | 默认模型 id |

## v1 → v2 自动升级

`api_save_global_models()` 检测到 v1 flat 格式时自动升级为 v2：
- 按 `provider` 字段分组
- 从模型名推断 `context_window` 和 `capabilities`
- 第一个模型设为 `is_default: true`

## 部署包初始值

```json
{"version": 2, "providers": {}, "default_provider": "", "default_model": ""}
```

**禁止在部署包中包含 API Key。**

## 前端兼容

`api_get_global_models()` 始终返回 flat 列表（前端友好格式）：
```json
{"version": 2, "models": [...], "default_model": "...", "default_provider": "..."}
```
