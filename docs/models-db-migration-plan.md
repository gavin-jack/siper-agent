# 模型存储迁移方案：models.json → SQLite

## 一、目标

将模型配置从 `models.json`（JSON 文件）迁移到 `agents/default/models.db`（SQLite），实现：
- 并发安全（WAL 事务）
- 数据完整性（schema 约束）
- 前端零改动（API 返回格式不变）
- 能力探测延后（先迁移存储，再逐步增加能力探测）

## 二、最终表结构

```sql
-- Provider 表
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

-- 模型表
CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    name TEXT NOT NULL,
    alias TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    context_window INTEGER DEFAULT 8192,
    -- 固有能力（模型自带，无需额外配置）
    cap_chat INTEGER NOT NULL DEFAULT 1,
    cap_reasoning INTEGER NOT NULL DEFAULT 0,
    cap_code INTEGER NOT NULL DEFAULT 0,
    cap_function_calling INTEGER NOT NULL DEFAULT 0,
    cap_vision INTEGER NOT NULL DEFAULT 0,
    cap_long_context INTEGER NOT NULL DEFAULT 0,
    cap_translation INTEGER NOT NULL DEFAULT 0,
    cap_ocr INTEGER NOT NULL DEFAULT 0,
    cap_summarization INTEGER NOT NULL DEFAULT 0,
    cap_sentiment INTEGER NOT NULL DEFAULT 0,
    cap_ner INTEGER NOT NULL DEFAULT 0,
    cap_math INTEGER NOT NULL DEFAULT 0,
    cap_chart INTEGER NOT NULL DEFAULT 0,
    cap_document INTEGER NOT NULL DEFAULT 0,
    -- 验证结果
    is_default INTEGER NOT NULL DEFAULT 0,
    ttft INTEGER,
    streaming INTEGER,
    context_window_tested INTEGER,
    json_mode INTEGER,
    -- 元数据
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    -- 约束
    FOREIGN KEY (provider_id) REFERENCES providers(id),
    UNIQUE(provider_id, model_id)
);

-- 配置能力表（需要额外 API Key/端点才能使用的能力）
CREATE TABLE IF NOT EXISTS model_capabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    capability TEXT NOT NULL,           -- tts, image_gen, video_gen, speech_recognition, embedding
    enabled INTEGER NOT NULL DEFAULT 0,
    api_key TEXT DEFAULT '',
    base_url TEXT DEFAULT '',
    config TEXT DEFAULT '{}',           -- 额外配置 JSON
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    FOREIGN KEY (model_id) REFERENCES models(id),
    UNIQUE(model_id, capability)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
CREATE INDEX IF NOT EXISTS idx_models_default ON models(is_default);
CREATE INDEX IF NOT EXISTS idx_models_name ON models(name);
CREATE INDEX IF NOT EXISTS idx_models_cap_reasoning ON models(cap_reasoning);
CREATE INDEX IF NOT EXISTS idx_models_cap_vision ON models(cap_vision);
CREATE INDEX IF NOT EXISTS idx_models_cap_code ON models(cap_code);
CREATE INDEX IF NOT EXISTS idx_models_cap_translation ON models(cap_translation);
CREATE INDEX IF NOT EXISTS idx_models_cap_ocr ON models(cap_ocr);
CREATE INDEX IF NOT EXISTS idx_model_capabilities_model ON model_capabilities(model_id);
CREATE INDEX IF NOT EXISTS idx_model_capabilities_cap ON model_capabilities(capability);

-- 全局设置表
CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL NOT NULL
);
```

**存储位置**：`agents/default/models.db`

## 三、能力分层

| 层 | 存储位置 | 说明 | 示例 |
|----|----------|------|------|
| **固有能力** | `models.cap_*` 列 | 模型自带，无需额外配置。探测后标记 0/1 | chat, reasoning, code, vision, translation, ocr |
| **配置能力** | `model_capabilities` 表 | 需要专用 API Key/端点才能启用 | tts, image_gen, video_gen, speech_recognition, embedding |

### 固有能力清单（15种）

| 列名 | JSON 值 | 说明 | 初始数据来源 |
|------|---------|------|-------------|
| cap_chat | chat | 基础对话 | 始终为 1 |
| cap_reasoning | reasoning | 推理/思维链 | models.json → capabilities 数组 |
| cap_code | code | 代码生成 | models.json → capabilities 数组 |
| cap_function_calling | function_calling | 工具调用 | models.json → capabilities 数组 |
| cap_vision | vision | 视觉/图片理解 | models.json → capabilities 数组 |
| cap_long_context | long_context | 长上下文 | models.json → capabilities 数组 |
| cap_translation | - | 多语言翻译 | 初始为 0，后续探测 |
| cap_ocr | - | OCR 文字识别 | 初始为 0，后续探测 |
| cap_summarization | - | 文本摘要 | 初始为 0，后续探测 |
| cap_sentiment | - | 情感分析 | 初始为 0，后续探测 |
| cap_ner | - | 命名实体识别 | 初始为 0，后续探测 |
| cap_math | - | 数学推理 | 初始为 0，后续探测 |
| cap_chart | - | 图表理解 | 初始为 0，后续探测 |
| cap_document | - | 文档分析 | 初始为 0，后续探测 |

### 配置能力清单（5种，可扩展）

| capability | 说明 | 配置字段 |
|------------|------|----------|
| tts | 文本转语音 | config: `{"voice":"zh-CN-XiaoxiaoNeural"}` |
| image_gen | 图像生成 | api_key + base_url + config: `{"size":"1024x1024"}` |
| video_gen | 视频生成 | api_key + base_url |
| speech_recognition | 语音识别 | api_key + base_url |
| embedding | 嵌入/向量 | api_key + base_url |

## 四、数据迁移映射

### models.json v2 → SQLite

```
JSON 结构:
{
  "version": 2,
  "providers": {
    "longcat": {
      "base_url": "https://api.longcat.chat/openai",
      "api_key": "sk-xxx",
      "models": [
        {
          "id": "LongCat-2.0-Preview",
          "name": "LongCat-2.0-Preview",
          "alias": "",
          "provider": "longcat",
          "base_url": "https://api.longcat.chat/openai",
          "api_key": "ak_xxx",
          "context_window": 131072,
          "capabilities": ["chat", "reasoning", "code", "function_calling", "long_context"],
          "is_default": true,
          "ttft": 1436,
          "streaming": true,
          "context_window_tested": 131072,
          "json_mode": null
        }
      ]
    }
  },
  "default_provider": "longcat",
  "default_model": "LongCat-2.0-Preview"
}

映射关系:
┌─────────────────────┬────────────────────────────────────────────┐
│ JSON 字段           │ SQLite 目标                                 │
├─────────────────────┼────────────────────────────────────────────┤
│ providers[name]     │ providers 表 (id, base_url, api_key)        │
│ models[].id         │ models.model_id                             │
│ models[].name       │ models.name                                 │
│ models[].alias      │ models.alias                                │
│ models[].base_url   │ models.base_url                             │
│ models[].api_key    │ models.api_key                              │
│ models[].context_window │ models.context_window                  │
│ models[].is_default  │ models.is_default                           │
│ models[].ttft       │ models.ttft                                 │
│ models[].streaming  │ models.streaming                            │
│ models[].context_window_tested │ models.context_window_tested    │
│ models[].json_mode  │ models.json_mode                            │
│ capabilities[]      │ models.cap_* 列 (见下方映射)               │
│ default_model       │ global_settings.key="default_model"         │
│ default_provider    │ global_settings.key="default_provider"      │
└─────────────────────┴────────────────────────────────────────────┘

capabilities 数组 → cap_* 列映射:
  "chat"              → cap_chat = 1
  "reasoning"         → cap_reasoning = 1
  "code"              → cap_code = 1
  "function_calling"  → cap_function_calling = 1
  "vision"            → cap_vision = 1
  "long_context"      → cap_long_context = 1
  (不存在)            → cap_translation = 0 (默认)
  (不存在)            → cap_ocr = 0 (默认)
  (不存在)            → cap_summarization = 0 (默认)
  (不存在)            → cap_sentiment = 0 (默认)
  (不存在)            → cap_ner = 0 (默认)
  (不存在)            → cap_math = 0 (默认)
  (不存在)            → cap_chart = 0 (默认)
  (不存在)            → cap_document = 0 (默认)
```

## 五、改动清单

### 5.1 新增文件

| 文件 | 行数(估) | 说明 |
|------|----------|------|
| `ai_agent/models_db.py` | ~250 | 数据库访问层（ModelsDB 类） |
| `ai_agent/models_migration.py` | ~80 | 一次性迁移脚本 |

### 5.2 修改 siper_web.py

| 位置 | 行号 | 改动 | 风险 |
|------|------|------|------|
| 启动加载 | L477-510 | `_gm_path = models.json` → `_models_db = ModelsDB(...)` + `_gm_models = _models_db.get_models_flat()["models"]` | 低 |
| `_global_models_path()` | L2440-2441 | 保留（兼容旧代码路径） | 无 |
| `_save_models_to_json()` | L2443-2471 | 保留（兼容旧代码路径） | 无 |
| `api_get_global_models()` | L2611-2651 | 读 models.json → `_models_db.get_models_flat()` | 低 |
| `api_save_global_models()` | L2473-2609 | 写 models.json → `_models_db.save_models_flat()` | **中** |
| `api_test_model()` | L2894-2915 | api_key 查找从 models.json → SQLite | 低 |
| `api_get_config()` | L1560-1584 | 读 models.json → `_models_db.get_models_flat()` | 低 |
| `api_get_agents()` | L1820-1844 | 读 models.json → `_models_db.get_models_flat()` | 低 |
| `_sync_models_to_agent_configs()` | L2395-2435 | 数据源从 models.json → SQLite | 低 |
| Agent配置保存 | L1710-1712 | `_save_models_to_json()` → `_models_db.save_models_flat()` | 低 |
| Agent meta 保存 | L1950 | `pass` → 无需改动（models 走独立 API） | 无 |

### 5.3 修改 agent.py

| 位置 | 行号 | 改动 | 风险 |
|------|------|------|------|
| `_find_model_in_global()` | L57-90 | 读 models.json → `_models_db.get_model()` | 低 |
| L122-123 注释 | | 更新注释 `from models.json` → `from models.db` | 无 |
| L344 注释 | | 更新注释 | 无 |

### 5.4 前端（无需改动）

所有 API 返回格式保持 flat list 兼容，前端零改动。

### 5.5 部署脚本

| 文件 | 改动 |
|------|------|
| `scripts/create_deploy.py` | 移除 models.json 模板复制，添加 models.db 到排除列表 |

## 六、实施步骤（分阶段）

### 阶段 1：数据库层 + 迁移（本次执行）

| 步骤 | 内容 | 验证 |
|------|------|------|
| 1.1 | 新增 `ai_agent/models_db.py` | `python -c "from ai_agent.models_db import ModelsDB"` |
| 1.2 | 新增 `ai_agent/models_migration.py` | 运行迁移脚本 |
| 1.3 | 运行迁移：`models.json → models.db` | 检查 models.db 记录数 = 37 |
| 1.4 | 修改 `siper_web.py` 启动加载 | 服务启动日志无报错 |
| 1.5 | 修改 `api_get_global_models()` | GET /api/models/global 返回 37 个模型 |
| 1.6 | 修改 `api_save_global_models()` | POST /api/models/global 保存成功 |
| 1.7 | 修改 `agent.py` `_find_model_in_global()` | 模型切换功能正常 |
| 1.8 | 修改其余 5 处 models.json 读取 | 服务重启后所有 API 正常 |
| 1.9 | 重启服务 + 全功能验证 | 前端所有模型操作正常 |

### 阶段 2：能力探测（后续独立执行）

| 步骤 | 内容 |
|------|------|
| 2.1 | 在 `api_test_model()` 中增加 translation 探测 |
| 2.2 | 增加 ocr 探测 |
| 2.3 | 增加 summarization 探测 |
| 2.4 | 增加 sentiment 探测 |
| 2.5 | 增加 ner 探测 |
| 2.6 | 增加 math 探测 |
| 2.7 | 增加 chart 探测 |
| 2.8 | 增加 document 探测 |
| 2.9 | 前端能力 badge 展示更新 |

### 阶段 3：配置能力（后续独立执行）

| 步骤 | 内容 |
|------|------|
| 3.1 | 前端增加配置能力 UI（API Key/端点输入） |
| 3.2 | 后端 `model_capabilities` CRUD API |
| 3.3 | TTS 配置能力接入 |
| 3.4 | Image Gen 配置能力接入 |

## 七、新增模块详细设计

### 7.1 `ai_agent/models_db.py`

```python
"""
模型数据库管理
存储: agents/default/models.db
"""
import json, logging, sqlite3, time
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger("models_db")

# 固有能力列映射: capabilities 数组值 → 列名
CAPABILITY_MAP = {
    "chat": "cap_chat",
    "reasoning": "cap_reasoning",
    "code": "cap_code",
    "function_calling": "cap_function_calling",
    "vision": "cap_vision",
    "long_context": "cap_long_context",
    "translation": "cap_translation",
    "ocr": "cap_ocr",
    "summarization": "cap_summarization",
    "sentiment": "cap_sentiment",
    "ner": "cap_ner",
    "math": "cap_math",
    "chart": "cap_chart",
    "document": "cap_document",
}

class ModelsDB:
    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """建表（完整 SQL 见上方表结构）"""
        ...
    
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=OFF")
        return conn
    
    # ===== Provider =====
    def upsert_provider(self, id: str, base_url: str = "", api_key: str = ""): ...
    def get_all_providers(self) -> List[Dict]: ...
    
    # ===== Model CRUD =====
    def upsert_model(self, ...) -> int: ...
    def get_model(self, model_id: str, provider_id: str = None) -> Optional[Dict]: ...
    def get_all_models(self, provider_id: str = None) -> List[Dict]: ...
    def delete_model(self, model_id: str, provider_id: str) -> bool: ...
    def set_default_model(self, model_id: str, provider_id: str): ...
    def get_default_model(self) -> Optional[Dict]: ...
    
    # ===== 配置能力 =====
    def set_capability(self, model_id: int, capability: str,
                       enabled: int = 0, api_key: str = "",
                       base_url: str = "", config: dict = None): ...
    def get_capabilities(self, model_id: int) -> List[Dict]: ...
    def get_enabled_capabilities(self, model_id: int) -> List[str]: ...
    
    # ===== 全局设置 =====
    def set_global_setting(self, key: str, value: str): ...
    def get_global_setting(self, key: str, default: str = "") -> str: ...
    
    # ===== 兼容层（前端 flat 格式） =====
    def get_models_flat(self) -> Dict:
        """返回 {version, models: [...], default_model, default_provider}"""
        ...
    
    def save_models_flat(self, data: Dict):
        """从前端 flat 格式保存"""
        ...
    
    # ===== 内部转换 =====
    def _caps_to_cols(self, caps: list) -> dict:
        """capabilities 数组 → {cap_chat:1, cap_reasoning:1, ...}"""
        return {col: 1 if cap in caps else 0
                for cap, col in CAPABILITY_MAP.items()}
    
    def _cols_to_caps(self, row: dict) -> list:
        """cap_* 列 → capabilities 数组"""
        return [cap for cap, col in CAPABILITY_MAP.items()
                if row.get(col)]
```

### 7.2 `ai_agent/models_migration.py`

```python
"""
一次性迁移：models.json → models.db
"""
import json, sys
from pathlib import Path

def migrate(json_path: str, db_path: str):
    from ai_agent.models_db import ModelsDB
    
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    db = ModelsDB(db_path)
    
    providers = data.get("providers", {})
    default_model = data.get("default_model", "")
    default_provider = data.get("default_provider", "")
    
    migrated = 0
    for prov_name, prov_cfg in providers.items():
        pid = prov_name or "custom"
        db.upsert_provider(pid, prov_cfg.get("base_url", ""), prov_cfg.get("api_key", ""))
        
        for m in prov_cfg.get("models", []):
            mid = m.get("id") or m.get("name", "")
            caps = m.get("capabilities", [])
            is_default = 1 if (m.get("name") or m.get("id")) == default_model else 0
            
            db.upsert_model(
                provider_id=pid,
                model_id=mid,
                name=m.get("name") or m.get("id", ""),
                alias=m.get("alias", ""),
                base_url=m.get("base_url", "") or prov_cfg.get("base_url", ""),
                api_key=m.get("api_key", "") or prov_cfg.get("api_key", ""),
                context_window=m.get("context_window", 8192),
                capabilities=caps,
                is_default=is_default,
                ttft=m.get("ttft"),
                streaming=m.get("streaming"),
                context_window_tested=m.get("context_window_tested"),
                json_mode=m.get("json_mode"),
            )
            migrated += 1
    
    db.set_global_setting("default_model", default_model)
    db.set_global_setting("default_provider", default_provider)
    
    print(f"✅ 迁移完成: {migrated} 个模型, {len(providers)} 个 provider")
    
    # 验证
    flat = db.get_models_flat()
    print(f"   验证: {len(flat['models'])} 个模型, default={flat['default_model']}")

if __name__ == "__main__":
    import os
    project_root = Path(__file__).resolve().parent.parent
    migrate(
        str(project_root / "models.json"),
        str(project_root / "agents" / "default" / "models.db"),
    )
```

## 八、回滚方案

1. `models.json` 保留不删（git 跟踪）
2. 代码中保留 JSON 读取路径作为 fallback
3. 启动时检测 `models.db` 是否存在：
   - 存在 → 使用 SQLite
   - 不存在 → 从 models.json 自动导入

```python
# siper_web.py 启动加载
db_path = PROJECT_ROOT / "agents" / "default" / "models.db"
json_path = PROJECT_ROOT / "models.json"

if db_path.exists():
    _models_db = ModelsDB(str(db_path))
    _gm_models = _models_db.get_models_flat()["models"]
    _gm_default = _models_db.get_global_setting("default_model")
elif json_path.exists():
    # fallback: 从 JSON 加载 + 自动导入
    from ai_agent.models_migration import migrate
    migrate(str(json_path), str(db_path))
    _models_db = ModelsDB(str(db_path))
    _gm_models = _models_db.get_models_flat()["models"]
    _gm_default = _models_db.get_global_setting("default_model")
else:
    _gm_models = []
    _gm_default = ""
```

## 九、前端 API 兼容性

| API | 旧数据源 | 新数据源 | 返回格式 | 前端改动 |
|-----|----------|----------|----------|----------|
| GET /api/models/global | models.json | models.db | 不变 | 无 |
| POST /api/models/global | models.json | models.db | 不变 | 无 |
| POST /api/models/discover | 直接调用外部 API | 不变 | 不变 | 无 |
| POST /api/models/test | models.json (api_key 查找) | models.db | 不变 | 无 |
| GET /api/config | models.json | models.db | 不变 | 无 |
| GET /api/agents | models.json | models.db | 不变 | 无 |
| POST /api/agents/{name}/meta | models.json | models.db | 不变 | 无 |

**结论：前端零改动。**
