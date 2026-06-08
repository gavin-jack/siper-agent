# 全局设置自动保存模式（v0.9.30+）

## 设计原则

**所有设置变更自动保存，无需"保存"按钮。** 用户操作后立即反馈到后端，无需手动确认。

## 实现架构

### 防抖机制

两个自动保存函数共用同一个 `_autoSaveTimer`，防止并发请求：

- `autoSaveModels()` — 300ms 防抖 → `POST /api/models/global`
- `autoSaveRuntimeSettings()` — 500ms 防抖 → `POST /api/config`
- `saveMetaConfig()` — 即时 → localStorage

### 触发点

| 操作 | 函数 | 防抖 |
|---|---|---|
| 添加/删除/设默认模型 | `autoSaveModels()` | 300ms |
| 运行时设置变更(change/input) | `autoSaveRuntimeSettings()` | 500ms |
| Meta 配置变更(checkbox) | `saveMetaConfig()` | 即时 |

### 事件监听

```javascript
el.addEventListener('change', autoSaveRuntimeSettings);
el.addEventListener('input', autoSaveRuntimeSettings);  // 仅 INPUT/SELECT
```

## 删除的代码

- HTML: "💾 保存模型配置" 按钮、"保存设置" 按钮
- JS: `triggerSettingsAutoSave()`、`triggerSettingsRuntimeAutoSave()`、`_settingsAutoSaveTimer`
- JS: `saveSettingsModels()` 和 `saveSidebarSettings()` 函数体（保留空壳向后兼容）

## 保留的按钮

- "重置默认"按钮（`resetSidebarSettings()`）

## 后端配合

`api_update_config()` 中 models → `_save_models_to_json()` → `models.json`
非 model 字段 → `save_agent_config_file()` → `config.json`
config.json 不再包含 models/default_model 字段

## 常见陷阱

1. **防抖 timer 共享**：两个 auto-save 函数共用同一个 timer，确保不会并发请求
2. **静默失败**：auto-save 失败时只 console.warn，不打断用户体验
3. **向后兼容**：`saveSidebarSettings()` 保留空壳，防止旧代码调用报错
