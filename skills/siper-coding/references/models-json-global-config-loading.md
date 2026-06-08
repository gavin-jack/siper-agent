# 全局 models.json 未加载 Bug（v0.9.28+）

## 现象

用户在 Web UI 全局设置页面配置了模型（保存到 `models.json`），重启 SiPer 后模型消失，LLM 未初始化，弹出"模型未配置"提示。

## 根因

`siper_web.py` 启动流程（第 276 行起）只从 `agents/default/config.json` 读取 `models` 字段，**完全不读取 `models.json`**。

启动流程：
1. load_agent_config_file("default") → 读 config.json
2. 从 config.json 的 models 字段提取 default model
3. 用 environment variable LONGCAT_API_KEY 或 config.json 中的 api_key 初始化 LLMClient
4. ❌ 从未读取 models.json

用户通过 Web UI 全局设置页面保存的模型配置写入 `models.json`，但启动时完全忽略。

## 数据流

- Web UI 保存模型 → POST /api/models/global → models.json（全局配置）
- Agent config.json → models 字段（per-agent 配置，可为空）
- 启动时：config.json models 非空 → 使用 config.json 中的配置 ✅
- 启动时：config.json models 为空 → ❌ 不读 models.json → LLM 未初始化

## 修复位置

`siper_web.py` 第 286 行后插入：当 config.json 的 models 为空时，从 models.json 加载全局配置。

```python
# If config.json has no models, try loading from global models.json
if not agent_cfg or not agent_cfg.get("models"):
    _gm_path = PROJECT_ROOT / "models.json"
    if _gm_path.exists():
        try:
            _gm = json.loads(_gm_path.read_text(encoding="utf-8"))
            if _gm.get("models"):
                if agent_cfg is None:
                    agent_cfg = {}
                agent_cfg["models"] = _gm["models"]
                agent_cfg["default_model"] = _gm.get("default_model", _gm["models"][0].get("name", ""))
                _cfg_key_default = _gm["models"][0].get("api_key", "")
                logger.info(f"配置：从 models.json 全局配置加载了 {len(_gm['models'])} 个模型")
        except Exception as e:
            logger.warning(f"配置：读取 models.json 失败: {e}")
```

## 注意事项

- 部署包中 `models.json` 不包含在打包清单中（含 API Key）
- config.json 中的 models 优先级高于 models.json
- 此修复仅影响开发版；部署包首次启动后用户通过 Web UI 配置模型写入 models.json，重启后自动加载
