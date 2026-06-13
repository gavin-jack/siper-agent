"""
模型数据库管理 — models.db
存储位置: models.db（项目根目录）
替代 models.json，提供并发安全的 SQLite 存储。
"""
import json
import logging
import sqlite3
import time
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

# 反向映射
COL_TO_CAP = {v: k for k, v in CAPABILITY_MAP.items()}


class ModelsDB:
    """模型数据库访问层（SQLite + WAL 模式）"""

    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    # ===== 连接 =====

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    # ===== 建表 =====

    def _init_db(self):
        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS providers (
                    id TEXT PRIMARY KEY,
                    base_url TEXT NOT NULL DEFAULT '',
                    api_key TEXT NOT NULL DEFAULT '',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS models (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider_id TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    alias TEXT NOT NULL DEFAULT '',
                    base_url TEXT NOT NULL DEFAULT '',
                    api_key TEXT NOT NULL DEFAULT '',
                    context_window INTEGER DEFAULT 8192,
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
                    is_default INTEGER NOT NULL DEFAULT 0,
                    ttft INTEGER,
                    latency INTEGER,
                    streaming INTEGER,
                    context_window_tested INTEGER,
                    json_mode INTEGER,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    FOREIGN KEY (provider_id) REFERENCES providers(id),
                    UNIQUE(provider_id, model_id)
                );

                CREATE TABLE IF NOT EXISTS model_capabilities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_id INTEGER NOT NULL,
                    capability TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    api_key TEXT DEFAULT '',
                    base_url TEXT DEFAULT '',
                    config TEXT DEFAULT '{}',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    FOREIGN KEY (model_id) REFERENCES models(id),
                    UNIQUE(model_id, capability)
                );

                CREATE TABLE IF NOT EXISTS global_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at REAL NOT NULL
                );

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
            """)

            # Migrations for existing DBs (idempotent ALTER TABLE)
            _migrations = [
                "ALTER TABLE models ADD COLUMN latency INTEGER",
                "ALTER TABLE models ADD COLUMN streaming INTEGER",
                "ALTER TABLE models ADD COLUMN context_window_tested INTEGER",
                "ALTER TABLE models ADD COLUMN json_mode INTEGER",
                "ALTER TABLE model_capabilities ADD COLUMN api_key TEXT DEFAULT ''",
                "ALTER TABLE model_capabilities ADD COLUMN base_url TEXT DEFAULT ''",
                "ALTER TABLE model_capabilities ADD COLUMN config TEXT DEFAULT '{}'",
            ]
            for _sql in _migrations:
                try:
                    conn.execute(_sql)
                except Exception:
                    pass  # column already exists

    # ===== Provider =====

    def upsert_provider(self, id: str, base_url: str = "", api_key: str = ""):
        now = time.time()
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO providers (id, base_url, api_key, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    base_url=excluded.base_url, api_key=excluded.api_key,
                    updated_at=excluded.updated_at
            """, (id, base_url, api_key, now, now))

    def rename_provider(self, old_id: str, new_id: str) -> bool:
        """Rename a provider and cascade to all its models."""
        now = time.time()
        with self._connect() as conn:
            # Check old exists
            old = conn.execute("SELECT id FROM providers WHERE id=?", (old_id,)).fetchone()
            if not old:
                return False
            # Check new doesn't exist
            existing = conn.execute("SELECT id FROM providers WHERE id=?", (new_id,)).fetchone()
            if existing:
                return False
            # Update provider id
            conn.execute("UPDATE providers SET id=?, updated_at=? WHERE id=?", (new_id, now, old_id))
            # Cascade to models
            conn.execute("UPDATE models SET provider_id=?, updated_at=? WHERE provider_id=?", (new_id, now, old_id))
            return True

    def get_all_providers(self) -> List[Dict]:
        with self._connect() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM providers").fetchall()]

    # ===== Model CRUD =====

    def upsert_model(self, provider_id: str, model_id: str, name: str = "",
                     alias: str = "", base_url: str = "", api_key: str = "",
                     context_window: int = 8192, capabilities: list = None,
                     is_default: int = 0, ttft: int = None,
                     latency: int = None,
                     streaming: int = None, context_window_tested: int = None,
                     json_mode: int = None) -> int:
        now = time.time()
        caps = self._caps_to_cols(capabilities or [])
        with self._connect() as conn:
            cursor = conn.execute("""
                INSERT INTO models (provider_id, model_id, name, alias, base_url, api_key,
                    context_window, cap_chat, cap_reasoning, cap_code, cap_function_calling,
                    cap_vision, cap_long_context, cap_translation, cap_ocr,
                    cap_summarization, cap_sentiment, cap_ner, cap_math, cap_chart,
                    cap_document, is_default, ttft, latency, streaming, context_window_tested,
                    json_mode, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(provider_id, model_id) DO UPDATE SET
                    name=excluded.name, alias=excluded.alias,
                    base_url=excluded.base_url, api_key=excluded.api_key,
                    context_window=excluded.context_window,
                    cap_chat=excluded.cap_chat, cap_reasoning=excluded.cap_reasoning,
                    cap_code=excluded.cap_code, cap_function_calling=excluded.cap_function_calling,
                    cap_vision=excluded.cap_vision, cap_long_context=excluded.cap_long_context,
                    cap_translation=excluded.cap_translation, cap_ocr=excluded.cap_ocr,
                    cap_summarization=excluded.cap_summarization, cap_sentiment=excluded.cap_sentiment,
                    cap_ner=excluded.cap_ner, cap_math=excluded.cap_math,
                    cap_chart=excluded.cap_chart, cap_document=excluded.cap_document,
                    is_default=excluded.is_default, ttft=excluded.ttft,
                    latency=excluded.latency,
                    streaming=excluded.streaming,
                    context_window_tested=excluded.context_window_tested,
                    json_mode=excluded.json_mode,
                    updated_at=excluded.updated_at
            """, (provider_id, model_id, name or model_id, alias, base_url, api_key,
                  context_window, caps["cap_chat"], caps["cap_reasoning"], caps["cap_code"],
                  caps["cap_function_calling"], caps["cap_vision"], caps["cap_long_context"],
                  caps["cap_translation"], caps["cap_ocr"], caps["cap_summarization"],
                  caps["cap_sentiment"], caps["cap_ner"], caps["cap_math"],
                  caps["cap_chart"], caps["cap_document"],
                  is_default, ttft, latency, streaming, context_window_tested, json_mode, now, now))
            return cursor.lastrowid

    def get_model(self, model_id: str, provider_id: str = None) -> Optional[Dict]:
        with self._connect() as conn:
            if provider_id:
                row = conn.execute(
                    "SELECT m.*, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "WHERE m.model_id=? AND m.provider_id=?",
                    (model_id, provider_id)
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT m.*, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "WHERE m.model_id=? OR m.name=?",
                    (model_id, model_id)
                ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["capabilities"] = self._cols_to_caps(d)
            return d

    def get_all_models(self, provider_id: str = None) -> List[Dict]:
        with self._connect() as conn:
            if provider_id:
                rows = conn.execute(
                    "SELECT m.*, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "WHERE m.provider_id=? ORDER BY m.name",
                    (provider_id,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT m.*, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "ORDER BY m.provider_id, m.name"
                ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d["capabilities"] = self._cols_to_caps(d)
                result.append(d)
            return result

    def delete_model(self, model_id: str, provider_id: str) -> bool:
        with self._connect() as conn:
            # Clean up model_capabilities first
            conn.execute(
                "DELETE FROM model_capabilities WHERE model_id IN (SELECT id FROM models WHERE model_id=? AND provider_id=?)",
                (model_id, provider_id)
            )
            cursor = conn.execute(
                "DELETE FROM models WHERE model_id=? AND provider_id=?",
                (model_id, provider_id)
            )
            return cursor.rowcount > 0

    def set_default_model(self, model_id: str, provider_id: str):
        now = time.time()
        with self._connect() as conn:
            conn.execute("UPDATE models SET is_default=0")
            conn.execute(
                "UPDATE models SET is_default=1, updated_at=? "
                "WHERE model_id=? AND provider_id=?",
                (now, model_id, provider_id)
            )

    def get_default_model(self) -> Optional[Dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT m.*, p.base_url as prov_base_url, p.api_key as prov_api_key "
                "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                "WHERE m.is_default=1 LIMIT 1"
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["capabilities"] = self._cols_to_caps(d)
            return d

    # ===== 配置能力 =====

    def set_capability(self, model_id: int, capability: str,
                       enabled: int = 0, api_key: str = "",
                       base_url: str = "", config: dict = None):
        now = time.time()
        config_json = json.dumps(config or {})
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO model_capabilities
                    (model_id, capability, enabled, api_key, base_url, config, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(model_id, capability) DO UPDATE SET
                    enabled=excluded.enabled, api_key=excluded.api_key,
                    base_url=excluded.base_url, config=excluded.config,
                    updated_at=excluded.updated_at
            """, (model_id, capability, enabled, api_key, base_url, config_json, now, now))

    def get_capabilities(self, model_id: int) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM model_capabilities WHERE model_id=?", (model_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_enabled_capabilities(self, model_id: int) -> List[str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT capability FROM model_capabilities WHERE model_id=? AND enabled=1",
                (model_id,)
            ).fetchall()
            return [r["capability"] for r in rows]

    # ===== 全局设置 =====

    def set_global_setting(self, key: str, value: str):
        now = time.time()
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO global_settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """, (key, value, now))

    def get_global_setting(self, key: str, default: str = "") -> str:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM global_settings WHERE key=?", (key,)
            ).fetchone()
            return row["value"] if row else default

    # ===== 兼容层（前端 flat 格式） =====

    def get_models_flat(self) -> Dict:
        """返回前端兼容的 flat 格式（模拟 models.json v2 GET 返回）"""
        models = self.get_all_models()
        default_model = self.get_global_setting("default_model")
        default_provider = self.get_global_setting("default_provider")

        flat = []
        for m in models:
            flat.append({
                "id": m["model_id"],
                "name": m["name"],
                "alias": m["alias"],
                "provider": m["provider_id"],
                "base_url": m["base_url"] or m.get("prov_base_url", ""),
                "api_key": m["api_key"] or m.get("prov_api_key", ""),
                "context_window": m["context_window"],
                "capabilities": m["capabilities"],
                "is_default": bool(m["is_default"]),
                "ttft": m.get("ttft"),
                "latency": m.get("latency"),
                "streaming": m.get("streaming"),
                "context_window_tested": m.get("context_window_tested"),
                "json_mode": m.get("json_mode"),
            })

        return {
            "version": 2,
            "models": flat,
            "default_model": default_model,
            "default_provider": default_provider,
        }

    def save_models_flat(self, data: Dict):
        """从前端 flat 格式保存（模拟 models.json v2 POST 请求）

        保留 de-mask 逻辑：前端 GET 时 api_key 被掩码，POST 时还原。
        """
        models = data.get("models", [])
        default_model = data.get("default_model", "")
        default_provider = data.get("default_provider", "")

        # 收集旧数据中的真实 api_key（用于 de-mask）
        old_real_keys = {}
        for m in self.get_all_models():
            mid = m["model_id"]
            mk = m["api_key"]
            if mk and not mk.startswith("*"):
                old_real_keys[mid] = mk

        # 按 provider 分组写入
        providers_seen = set()
        for m in models:
            prov = m.get("provider", "custom")
            if prov not in providers_seen:
                self.upsert_provider(prov, m.get("base_url", ""), m.get("api_key", ""))
                providers_seen.add(prov)

            mid = m.get("id") or m.get("name", "")
            name = m.get("name") or m.get("id", "")
            is_default = 1 if name == default_model else 0

            # De-mask api_key
            api_key = m.get("api_key", "")
            if not api_key or api_key.startswith("*"):
                real = old_real_keys.get(mid)
                if real:
                    api_key = real

            self.upsert_model(
                provider_id=prov,
                model_id=mid,
                name=name,
                alias=m.get("alias", ""),
                base_url=m.get("base_url", ""),
                api_key=api_key,
                context_window=m.get("context_window", 8192),
                capabilities=m.get("capabilities", []),
                is_default=is_default,
                ttft=m.get("ttft"),
                latency=m.get("latency"),
                streaming=m.get("streaming"),
                context_window_tested=m.get("context_window_tested"),
                json_mode=m.get("json_mode"),
            )

        self.set_global_setting("default_model", default_model)
        self.set_global_setting("default_provider", default_provider)

    # ===== 内部转换 =====

    def _caps_to_cols(self, caps: list) -> dict:
        """capabilities 数组 → {cap_chat:1, cap_reasoning:1, ...}"""
        return {col: 1 if cap in caps else 0 for cap, col in CAPABILITY_MAP.items()}

    def _cols_to_caps(self, row: dict) -> list:
        """cap_* 列 → capabilities 数组"""
        return [cap_name for cap_name, col_name in CAPABILITY_MAP.items() if row.get(col_name)]
