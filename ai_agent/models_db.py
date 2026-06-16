"""
模型数据库管理 — models.db
存储位置: models.db（项目根目录）
替代 models.json，提供并发安全的 SQLite 存储。

表结构（v6 — 2026-08-08）：
  providers: id INTEGER PK AUTOINCREMENT, base_url TEXT UNIQUE, provider TEXT NOT NULL DEFAULT '',
            provider_alias TEXT NOT NULL DEFAULT ''（用户改名记录）, api_key TEXT NOT NULL DEFAULT '',
            updated_at REAL NOT NULL
  models: id INTEGER PK AUTOINCREMENT, provider_id INTEGER FK→providers(id),
          model TEXT NOT NULL, model_alias TEXT NOT NULL DEFAULT ''（用户改名记录）,
          is_default INTEGER NOT NULL DEFAULT 0,
          ttft/latency/streaming, context_window_tested, json_mode,
          15 个 cap_* 能力列（0=未配置, 1=启用）, updated_at REAL NOT NULL
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
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    base_url TEXT NOT NULL UNIQUE,
                    provider TEXT NOT NULL DEFAULT '',
                    provider_alias TEXT NOT NULL DEFAULT '',
                    api_key TEXT NOT NULL DEFAULT '',
                    updated_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS models (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider_id INTEGER NOT NULL,
                    model TEXT NOT NULL,
                    model_alias TEXT NOT NULL DEFAULT '',
                    is_default INTEGER NOT NULL DEFAULT 0,
                    ttft INTEGER,
                    latency INTEGER,
                    streaming INTEGER,
                    context_window_tested INTEGER,
                    json_mode INTEGER,
                    updated_at REAL NOT NULL,
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
                    FOREIGN KEY (provider_id) REFERENCES providers(id),
                    UNIQUE(provider_id, model)
                );

                CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
                CREATE INDEX IF NOT EXISTS idx_models_default ON models(is_default);
            """)

            # Migrations for existing DBs (idempotent ALTER TABLE)
            _migrations = [
                # v5 → v6: rename columns
                "ALTER TABLE providers RENAME COLUMN provider_name TO provider",
                "ALTER TABLE providers ADD COLUMN provider_alias TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE providers DROP COLUMN created_at",
                "ALTER TABLE models RENAME COLUMN model_name TO model",
                "ALTER TABLE models RENAME COLUMN alias TO model_alias",
                "ALTER TABLE models DROP COLUMN created_at",
                # v4 → v5 兼容（旧库可能还没有 provider_name）
                "ALTER TABLE providers ADD COLUMN provider TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE providers ADD COLUMN provider_alias TEXT NOT NULL DEFAULT ''",
                "ALTER TABLE models ADD COLUMN model_alias TEXT NOT NULL DEFAULT ''",
                # 新增列（v4/v5 可能缺失）
                "ALTER TABLE models ADD COLUMN latency INTEGER",
                "ALTER TABLE models ADD COLUMN streaming INTEGER",
                "ALTER TABLE models ADD COLUMN context_window_tested INTEGER",
                "ALTER TABLE models ADD COLUMN json_mode INTEGER",
            ]
            for _sql in _migrations:
                try:
                    conn.execute(_sql)
                except Exception:
                    pass  # column already exists or doesn't exist

    # ===== Provider =====

    def upsert_provider(self, base_url: str, api_key: str = "", provider: str = "",
                        provider_alias: str = "") -> int:
        """插入/更新 provider，返回 id。base_url 作为唯一标识。"""
        now = time.time()
        with self._connect() as conn:
            cursor = conn.execute("""
                INSERT INTO providers (base_url, provider, provider_alias, api_key, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(base_url) DO UPDATE SET
                    provider=excluded.provider,
                    provider_alias=excluded.provider_alias,
                    api_key=excluded.api_key,
                    updated_at=excluded.updated_at
            """, (base_url, provider, provider_alias, api_key, now))
            return cursor.lastrowid or conn.execute(
                "SELECT id FROM providers WHERE base_url=?", (base_url,)
            ).fetchone()["id"]

    def update_provider_name(self, base_url: str, provider: str = "",
                             provider_alias: str = "") -> bool:
        """Update provider name and/or alias for a given base_url."""
        now = time.time()
        with self._connect() as conn:
            cursor = conn.execute(
                "UPDATE providers SET provider=?, provider_alias=?, updated_at=? WHERE base_url=?",
                (provider, provider_alias, now, base_url)
            )
            return cursor.rowcount > 0

    def get_all_providers(self) -> List[Dict]:
        with self._connect() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM providers ORDER BY id").fetchall()]

    # ===== Model CRUD =====

    def upsert_model(self, provider_id: int, model: str,
                     model_alias: str = "",
                     capabilities: list = None,
                     is_default: int = 0, ttft: int = None,
                     latency: int = None,
                     streaming: int = None, context_window_tested: int = None,
                     json_mode: int = None) -> int:
        now = time.time()
        caps = self._caps_to_cols(capabilities or [])
        with self._connect() as conn:
            cursor = conn.execute("""
                INSERT INTO models (provider_id, model, model_alias,
                    is_default, ttft, latency, streaming, context_window_tested,
                    json_mode, updated_at,
                    cap_chat, cap_reasoning, cap_code, cap_function_calling,
                    cap_vision, cap_long_context, cap_translation, cap_ocr,
                    cap_summarization, cap_sentiment, cap_ner, cap_math, cap_chart,
                    cap_document)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(provider_id, model) DO UPDATE SET
                    model_alias=excluded.model_alias,
                    is_default=excluded.is_default, ttft=excluded.ttft,
                    latency=excluded.latency,
                    streaming=excluded.streaming,
                    context_window_tested=excluded.context_window_tested,
                    json_mode=excluded.json_mode,
                    cap_chat=excluded.cap_chat, cap_reasoning=excluded.cap_reasoning,
                    cap_code=excluded.cap_code, cap_function_calling=excluded.cap_function_calling,
                    cap_vision=excluded.cap_vision, cap_long_context=excluded.cap_long_context,
                    cap_translation=excluded.cap_translation, cap_ocr=excluded.cap_ocr,
                    cap_summarization=excluded.cap_summarization, cap_sentiment=excluded.cap_sentiment,
                    cap_ner=excluded.cap_ner, cap_math=excluded.cap_math,
                    cap_chart=excluded.cap_chart, cap_document=excluded.cap_document,
                    updated_at=excluded.updated_at
            """, (provider_id, model, model_alias,
                  is_default, ttft, latency, streaming, context_window_tested,
                  json_mode, now,
                  caps["cap_chat"], caps["cap_reasoning"], caps["cap_code"],
                  caps["cap_function_calling"], caps["cap_vision"], caps["cap_long_context"],
                  caps["cap_translation"], caps["cap_ocr"], caps["cap_summarization"],
                  caps["cap_sentiment"], caps["cap_ner"], caps["cap_math"],
                  caps["cap_chart"], caps["cap_document"]))
            return cursor.lastrowid or conn.execute(
                "SELECT id FROM models WHERE provider_id=? AND model=?",
                (provider_id, model)
            ).fetchone()["id"]

    def get_model(self, model: str, provider_id: int = 0) -> Optional[Dict]:
        with self._connect() as conn:
            if provider_id:
                row = conn.execute(
                    "SELECT m.*, p.provider, p.provider_alias, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "WHERE m.model=? AND m.provider_id=?",
                    (model, provider_id)
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT m.*, p.provider, p.provider_alias, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "WHERE m.model=?",
                    (model,)
                ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["capabilities"] = self._cols_to_caps(d)
            return d

    def get_all_models(self, provider_id: int = 0) -> List[Dict]:
        with self._connect() as conn:
            if provider_id:
                rows = conn.execute(
                    "SELECT m.*, p.provider, p.provider_alias, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "WHERE m.provider_id=? ORDER BY m.model",
                    (provider_id,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT m.*, p.provider, p.provider_alias, p.base_url as prov_base_url, p.api_key as prov_api_key "
                    "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                    "ORDER BY m.provider_id, m.model"
                ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d["capabilities"] = self._cols_to_caps(d)
                result.append(d)
            return result

    def delete_model(self, model: str, provider_id: int) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM models WHERE model=? AND provider_id=?",
                (model, provider_id)
            )
            return cursor.rowcount > 0

    def set_default_model(self, model: str, provider_id: int):
        now = time.time()
        with self._connect() as conn:
            conn.execute("UPDATE models SET is_default=0")
            conn.execute(
                "UPDATE models SET is_default=1, updated_at=? "
                "WHERE model=? AND provider_id=?",
                (now, model, provider_id)
            )

    def get_default_model(self) -> Optional[Dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT m.*, p.provider, p.provider_alias, p.base_url as prov_base_url, p.api_key as prov_api_key "
                "FROM models m LEFT JOIN providers p ON m.provider_id=p.id "
                "WHERE m.is_default=1 LIMIT 1"
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            d["capabilities"] = self._cols_to_caps(d)
            return d

    # ===== 兼容层（前端 flat 格式） =====

    def get_models_flat(self) -> Dict:
        """返回前端兼容的 flat 格式（模拟 models.json v2 GET 返回）"""
        models = self.get_all_models()

        flat = []
        for m in models:
            flat.append({
                "id": m["model"],
                "name": m["model"],
                "alias": m.get("model_alias", "") or m.get("alias", ""),
                "provider": m["provider_id"],
                "provider_name": m.get("provider", "") or m.get("provider_name", ""),
                "provider_alias": m.get("provider_alias", ""),
                "base_url": m.get("prov_base_url", ""),
                "api_key": m.get("prov_api_key", ""),
                "capabilities": m["capabilities"],
                "is_default": bool(m["is_default"]),
                "ttft": m.get("ttft"),
                "latency": m.get("latency"),
                "streaming": m.get("streaming"),
                "context_window": m.get("context_window_tested") or 8192,
                "json_mode": m.get("json_mode"),
            })

        return {
            "version": 3,
            "models": flat,
        }

    def save_models_flat(self, data: Dict):
        """从前端 flat 格式保存（模拟 models.json v2 POST 请求）"""
        models = data.get("models", [])

        # 按 provider_id 分组写入
        providers_seen = set()
        for m in models:
            prov_id = m.get("provider", 0)
            base_url = m.get("base_url", "")
            api_key = m.get("api_key", "")
            prov_name = m.get("provider_name", "") or m.get("provider", "")
            prov_alias = m.get("provider_alias", "")

            # Handle string provider name: auto-find or create provider
            if isinstance(prov_id, str) or (isinstance(prov_id, int) and prov_id <= 0):
                # Try to find existing provider by base_url
                provs = self.get_all_providers()
                matched = next((p for p in provs if p["base_url"] == base_url), None) if base_url else None
                if matched:
                    prov_id = matched["id"]
                    # Update api_key if provided
                    if api_key:
                        self.upsert_provider(base_url, api_key, prov_name, prov_alias)
                else:
                    # Auto-create provider
                    if base_url:
                        prov_id = self.upsert_provider(base_url, api_key, prov_name, prov_alias)
                    else:
                        continue  # No base_url, cannot save

            # Sanity check
            if not isinstance(prov_id, int) or prov_id <= 0:
                continue

            if prov_id not in providers_seen:
                provs = self.get_all_providers()
                prov = next((p for p in provs if p["id"] == prov_id), None)
                if prov:
                    self.upsert_provider(
                        prov["base_url"],
                        api_key,
                        prov_name,
                        prov_alias,
                    )
                providers_seen.add(prov_id)

            mid = m.get("id") or m.get("name", "")
            is_default = 1 if m.get("is_default") else 0

            self.upsert_model(
                provider_id=prov_id,
                model=mid,
                model_alias=m.get("alias", ""),
                capabilities=m.get("capabilities", []),
                is_default=is_default,
                ttft=m.get("ttft"),
                latency=m.get("latency"),
                streaming=m.get("streaming"),
                context_window_tested=m.get("context_window_tested"),
                json_mode=m.get("json_mode"),
            )

    # ===== 内部转换 =====

    def _caps_to_cols(self, caps: list) -> dict:
        """capabilities 数组 → {cap_chat:1, cap_reasoning:1, ...}"""
        return {col: 1 if cap in caps else 0 for cap, col in CAPABILITY_MAP.items()}

    def _cols_to_caps(self, row: dict) -> list:
        """cap_* 列 → capabilities 数组"""
        return [cap_name for cap_name, col_name in CAPABILITY_MAP.items() if row.get(col_name)]
