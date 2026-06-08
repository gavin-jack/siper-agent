# LLM Client 初始化链路 — 完整诊断指南（v0.9.64+）

## 现象

网关栏目显示 `LLM Client: running`，但 `model=None` / `base_url=None` / `api_key=None`。
或网关显示 `LLM Client: stopped`。

## 初始化链路（siper_web.py L280-396）

启动时按以下顺序获取 API Key：

```
1. 环境变量 LONGCAT_API_KEY
2. models.json 中默认模型的 api_key 字段
3. 项目根目录 .env 文件中的 LONGCAT_API_KEY=xxx  ← v0.9.64 新增
```

**关键代码（siper_web.py L314-336）：**
```python
# Priority 1: 环境变量
_lc_key = os.environ.get("LONGCAT_API_KEY", "") or _cfg_key_default
# Priority 2: .env 文件（v0.9.64 新增）
if not _lc_key:
    _env_path = PROJECT_ROOT / ".env"
    if _env_path.exists():
        for _line in _env_path.read_text(encoding="utf-8").splitlines():
            if _line.strip().startswith("LONGCAT_API_KEY="):
                _lc_key = _line.split("=", 1)[1].strip().strip('"').strip("'")
                break
```

获取到 key 后，查找默认模型配置（models.json 中 `is_default=true` 或 `name==default_model` 的条目），然后调用 `agent.configure_llm()`。

## 诊断流程

### 1. 确认 LLM Client 对象状态

```bash
curl -s http://127.0.0.1:9724/api/config | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'llm_configured={d.get(\"llm_configured\")}')
print(f'model={d.get(\"model\")}')
print(f'base_url={d.get(\"base_url\")}')
print(f'api_key={d.get(\"api_key\")}')
"
```

| llm_configured | model | 含义 |
|---|---|---|
| False | "" | LLMClient 对象不存在，configure_llm 从未被调用 |
| True | "LongCat-2.0-Preview" | 正常 |
| True | "" | LLMClient 对象存在但未正确配置（理论上不应发生） |

### 2. 如果 llm_configured=False

**原因：** 三个来源都没有有效的 API Key。

**检查顺序：**
```bash
# 1. 检查环境变量（在启动 SiPer 的 shell 中）
echo $LONGCAT_API_KEY

# 2. 检查 models.json
cat /home/gavin/.siper/models.json | python3 -c "
import sys,json; d=json.load(sys.stdin)
for pn,pc in d.get('providers',{}).items():
    print(f'provider api_key={repr(pc.get(\"api_key\",\"\")[:10])}')
    for m in pc.get('models',[]):
        print(f'  model {m.get(\"id\")} api_key={repr(m.get(\"api_key\",\"\")[:10])}')
"

# 3. 检查 .env 文件
cat /home/gavin/.siper/.env 2>/dev/null | grep LONGCAT || echo "no .env"
```

### 3. 如果 llm_configured=True 但 model/base_url/api_key 为空

**原因：** `agent.llm_client` 对象存在（gateway 检查 `is not None`），但 `configure_llm()` 被调用时传入了空值。

**诊断：** 查看 SiPer 启动日志中是否有 `"配置：LLM 来自 models.json"` 或 `"配置：无有效 API Key，LLM 未初始化"`。

## 修复方案

### 方案 A：创建 .env 文件（推荐）

在项目根目录创建 `.env` 文件。

**注意：** `echo ${LONGCAT_API_KEY}` 被安全策略拦截（涉及 API Key），必须用 `write_file` 工具写入。

### 方案 B：修改 models.json

直接在 models.json 的 provider 或 model 级别填入 api_key。但**不推荐**——models.json 会被前端覆盖写入，且 api_key 明文存储。

### 方案 C：通过 Web UI 配置

在 Web UI → 全局设置 → 模型管理 中编辑默认模型，填入 api_key，保存。后端会调用 `configure_llm()` 重建 LLMClient。

## 常见陷阱

### 陷阱 1：terminal(background=true) 不继承 shell 环境变量

通过 `terminal(background=true)` 启动 SiPer 时，进程**不继承**当前 shell 的环境变量（如 `LONGCAT_API_KEY`）。解决方案：依赖 .env 文件（方案 A）。

### 陷阱 2：models.json 中 api_key 为空是正常设计

models.json 的 provider/model 级别 api_key 默认为空。系统优先从环境变量或 .env 获取 key。**不要因为 models.json 中 api_key 为空就认为配置有问题。**

### 陷阱 3：网关 "running" ≠ LLM 可用

网关检查 `agent.llm_client is not None`。LLMClient 对象可能在 `configure_llm()` 调用前就被创建（如 `agent.__init__` 中），此时对象存在但属性为空。**必须检查 `/api/config` 的 model 字段是否非空。**

### 陷阱 4：修改后必须重启 SiPer

修改 .env 或 models.json 后，必须重启 SiPer 服务才能生效。旧进程仍使用旧的内存配置。

## 相关代码位置

- `siper_web.py:L280-396` — 启动时 LLM 初始化逻辑
- `siper_web.py:L314-336` — API Key 获取优先级（含 .env fallback）
- `siper_web.py:L1338-1364` — `api_get_gateway()` LLM Client 状态
- `siper_web.py:L971-1026` — `api_get_config()` LLM 配置状态
- `siper_web.py:L1028-1102` — `api_update_config()` 配置更新
