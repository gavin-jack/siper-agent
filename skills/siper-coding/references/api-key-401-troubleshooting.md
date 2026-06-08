# API Key 401 排查指南

## 症状

LLM API 返回 401 `invalid_api_key`，即使配置文件中 key 正确。

## 根因

WSL2 从 Windows 继承环境变量。如果 Windows 中设置了 `LONGCAT_API_KEY`（值可能过期/错误），Python 代码 `os.environ.get("LONGCAT_API_KEY", "")` 会优先使用错误的环境变量值，不会 fallback 到 config.json 中的正确 key。

## 排查流程

1. 确认环境变量值：
   ```bash
   echo $LONGCAT_API_KEY
   ```

2. 与 config.json 中的原始 key 对比：
   ```bash
   grep api_key /home/gavin/.siper/agents/default/config.json
   ```

3. 检查代码中所有 `configure_llm()` 调用是否都改了：
   ```bash
   grep -n 'configure_llm\|api_key=' /home/gavin/.siper/siper_web.py | grep -v '${LONGCAT'
   ```

## 修复方案

### 临时方案（单次启动）

启动时 unset 环境变量：

```bash
LONGCAT_API_KEY="" /home/gavin/.hermes/hermes-agent/venv/bin/python3 siper_web.py
```

### 永久方案

1. 更新 Windows 环境变量 `LONGCAT_API_KEY` 为正确的 key
2. 或者在 WSL 中 override：在 `~/.bashrc` 中添加 `export LONGCAT_API_KEY="正确的key"`

### 代码自动处理（推荐）

在 siper_web.py 的 API key 解析逻辑中，当环境变量和 config.json 的 key 不同时，优先用 config.json 的值：

```python
_lc_key = os.environ.get("LONGCAT_API_KEY", "") or _cfg_key_default
# If env var is set but differs from config, prefer config (env may be stale)
if _lc_key and _cfg_key_default and _lc_key != _cfg_key_default:
    _lc_key = _cfg_key_default
```

这样即使 Windows 传过来的环境变量是错的，也不会覆盖配置文件里的正确 key。

## 预防

执行 API Key 环境变量化改造时：
1. 修改**前**先 grep 所有硬编码值
2. 修改**后**再 grep 确认无残留
3. 检查所有 `configure_llm()` 调用点（siper_web.py 至少有 4 处）
4. 测试前先确认环境变量是否干扰
5. 改造完成后验证：`grep -rn 'ak_' siper_web.py` 应返回空（无硬编码 key）
