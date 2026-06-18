"""
配置数据库管理 — config.db
存储位置: config.db（项目根目录，与 models.db 并列）
替代 settings.json + agents/*/config.json，提供统一的配置存储。

表结构（v1 — 2026-06-18）：
  global_settings: key TEXT PK, value TEXT, value_type TEXT, description TEXT, updated_at REAL
  agent_configs: agent_name TEXT PK, display_name, icon, avatar, default_chat_model,
                 default_vision_model, default_tts_model, llm_timeout, llm_max_tokens,
                 llm_max_retries, session_timeout, max_history_messages, max_tools,
                 max_tool_rounds, skill_pre_filter_top_k, memory_integration TEXT(JSON),
                 appearance TEXT(JSON), available_models TEXT(JSON), created_at, updated_at
  agent_models: agent_name TEXT, model_id INTEGER FK→models(id), is_default INTEGER,
                enabled INTEGER, sort_order INTEGER, PK(agent_name, model_id)
"""
import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("config_db")


class ConfigDB:
    """配置数据库访问层（SQLite + WAL 模式）"""

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
                CREATE TABLE IF NOT EXISTS global_settings (
                    key         TEXT PRIMARY KEY,
                    value       TEXT NOT NULL,
                    value_type  TEXT NOT NULL DEFAULT 'string',
                    description TEXT DEFAULT '',
                    updated_at   REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agent_configs (
                    agent_name            TEXT PRIMARY KEY,
                    display_name          TEXT NOT NULL DEFAULT '',
                    icon                  TEXT DEFAULT '',
                    avatar                TEXT DEFAULT '',
                    default_chat_model    TEXT DEFAULT '',
                    default_vision_model  TEXT DEFAULT '',
                    default_tts_model     TEXT DEFAULT '',
                    llm_timeout           INTEGER DEFAULT 120,
                    llm_max_tokens        INTEGER DEFAULT 8192,
                    llm_max_retries       INTEGER DEFAULT 2,
                    session_timeout       INTEGER DEFAULT 3600,
                    max_history_messages  INTEGER DEFAULT 50,
                    max_tools             INTEGER DEFAULT 300,
                    max_tool_rounds       INTEGER DEFAULT 100,
                    skill_pre_filter_top_k INTEGER DEFAULT 5,
                    memory_integration    TEXT DEFAULT '{"max_tokens":20000}',
                    appearance            TEXT DEFAULT '{}',
                    available_models      TEXT DEFAULT '[]',
                    created_at            REAL NOT NULL,
                    updated_at            REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agent_models (
                    agent_name  TEXT NOT NULL,
                    model_id    INTEGER NOT NULL,
                    is_default  INTEGER DEFAULT 0,
                    enabled     INTEGER DEFAULT 1,
                    sort_order  INTEGER DEFAULT 0,
                    PRIMARY KEY (agent_name, model_id)
                );

                CREATE INDEX IF NOT EXISTS idx_agent_models_agent ON agent_models(agent_name);
            """)

    # ===== 全局设置 =====

    def get_global_setting(self, key: str) -> Optional[str]:
        """读取单个全局设置"""
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM global_settings WHERE key=?", (key,)).fetchone()
            return row["value"] if row else None

    def get_all_global_settings(self) -> Dict[str, str]:
        """读取所有全局设置，返回 {key: value}"""
        with self._connect() as conn:
            return {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM global_settings").fetchall()}

    def get_global_settings_grouped(self) -> Dict[str, Dict[str, str]]:
        """读取所有全局设置，按 key 前缀分组"""
        settings = self.get_all_global_settings()
        grouped: Dict[str, Dict[str, str]] = {}
        for key, value in settings.items():
            prefix = key.split(".")[0] if "." in key else "other"
            grouped.setdefault(prefix, {})[key] = value
        return grouped

    def set_global_setting(self, key: str, value: str, value_type: str = "string", description: str = ""):
        """插入/更新单个全局设置"""
        now = time.time()
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO global_settings (key, value, value_type, description, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value=excluded.value, value_type=excluded.value_type,
                    description=excluded.description, updated_at=excluded.updated_at
            """, (key, value, value_type, description, now))

    def set_global_settings_batch(self, settings: Dict[str, str]):
        """批量更新全局设置"""
        now = time.time()
        with self._connect() as conn:
            for key, value in settings.items():
                conn.execute("""
                    INSERT INTO global_settings (key, value, value_type, description, updated_at)
                    VALUES (?, ?, 'string', '', ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
                """, (key, str(value), now))

    def delete_global_setting(self, key: str) -> bool:
        with self._connect() as conn:
            return conn.execute("DELETE FROM global_settings WHERE key=?", (key,)).rowcount > 0

    # ===== Agent 配置 =====

    def get_agent_config(self, agent_name: str) -> Optional[Dict]:
        """读取 agent 配置"""
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM agent_configs WHERE agent_name=?", (agent_name,)).fetchone()
            if not row:
                return None
            d = dict(row)
            # 解析 JSON 字段
            for field in ("memory_integration", "appearance", "available_models"):
                if isinstance(d.get(field), str):
                    try:
                        d[field] = json.loads(d[field])
                    except (json.JSONDecodeError, TypeError):
                        pass
            return d

    def get_all_agent_configs(self) -> List[Dict]:
        """读取所有 agent 配置"""
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM agent_configs ORDER BY agent_name").fetchall()
            result = []
            for row in rows:
                d = dict(row)
                for field in ("memory_integration", "appearance", "available_models"):
                    if isinstance(d.get(field), str):
                        try:
                            d[field] = json.loads(d[field])
                        except (json.JSONDecodeError, TypeError):
                            pass
                result.append(d)
            return result

    def upsert_agent_config(self, agent_name: str, config: Dict) -> bool:
        """插入/更新 agent 配置（合并模式，只更新提供的字段）"""
        now = time.time()
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM agent_configs WHERE agent_name=?", (agent_name,)).fetchone()
            if existing:
                # 合并：只更新提供的字段
                d = dict(existing)
                for key in ("display_name", "icon", "avatar", "default_chat_model",
                            "default_vision_model", "default_tts_model", "llm_timeout",
                            "llm_max_tokens", "llm_max_retries", "session_timeout",
                            "max_history_messages", "max_tools", "max_tool_rounds",
                            "skill_pre_filter_top_k"):
                    if key in config:
                        d[key] = config[key]
                # JSON 字段特殊处理
                for jf in ("memory_integration", "appearance"):
                    if jf in config and isinstance(config[jf], dict):
                        old = d.get(jf)
                        if isinstance(old, str):
                            try:
                                old = json.loads(old)
                            except (json.JSONDecodeError, TypeError):
                                old = {}
                        if isinstance(old, dict):
                            old.update(config[jf])
                            d[jf] = json.dumps(old, ensure_ascii=False)
                        else:
                            d[jf] = json.dumps(config[jf], ensure_ascii=False)
                    elif jf in config and isinstance(config[jf], str):
                        d[jf] = config[jf]
                # available_models 保持独立（通过 agent_models 表管理）
                d["updated_at"] = now
                conn.execute("""
                    UPDATE agent_configs SET
                        display_name=?, icon=?, avatar=?,
                        default_chat_model=?, default_vision_model=?, default_tts_model=?,
                        llm_timeout=?, llm_max_tokens=?, llm_max_retries=?,
                        session_timeout=?, max_history_messages=?,
                        max_tools=?, max_tool_rounds=?, skill_pre_filter_top_k=?,
                        memory_integration=?, appearance=?, available_models=?,
                        updated_at=?
                    WHERE agent_name=?
                """, (d["display_name"], d["icon"], d["avatar"],
                      d["default_chat_model"], d["default_vision_model"], d["default_tts_model"],
                      d["llm_timeout"], d["llm_max_tokens"], d["llm_max_retries"],
                      d["session_timeout"], d["max_history_messages"],
                      d["max_tools"], d["max_tool_rounds"], d["skill_pre_filter_top_k"],
                      d["memory_integration"], d["appearance"], d["available_models"],
                      d["updated_at"], agent_name))
            else:
                # 新建
                d = {
                    "display_name": config.get("display_name", ""),
                    "icon": config.get("icon", ""),
                    "avatar": config.get("avatar", ""),
                    "default_chat_model": config.get("default_chat_model", ""),
                    "default_vision_model": config.get("default_vision_model", ""),
                    "default_tts_model": config.get("default_tts_model", ""),
                    "llm_timeout": config.get("llm_timeout", 120),
                    "llm_max_tokens": config.get("llm_max_tokens", 8192),
                    "llm_max_retries": config.get("llm_max_retries", 2),
                    "session_timeout": config.get("session_timeout", 3600),
                    "max_history_messages": config.get("max_history_messages", 50),
                    "max_tools": config.get("max_tools", 300),
                    "max_tool_rounds": config.get("max_tool_rounds", 100),
                    "skill_pre_filter_top_k": config.get("skill_pre_filter_top_k", 5),
                    "memory_integration": json.dumps(config.get("memory_integration", {"max_tokens": 20000}), ensure_ascii=False),
                    "appearance": json.dumps(config.get("appearance", {}), ensure_ascii=False),
                    "available_models": json.dumps(config.get("available_models", []), ensure_ascii=False),
                }
                conn.execute("""
                    INSERT INTO agent_configs (
                        agent_name, display_name, icon, avatar,
                        default_chat_model, default_vision_model, default_tts_model,
                        llm_timeout, llm_max_tokens, llm_max_retries,
                        session_timeout, max_history_messages,
                        max_tools, max_tool_rounds, skill_pre_filter_top_k,
                        memory_integration, appearance, available_models,
                        created_at, updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (agent_name, d["display_name"], d["icon"], d["avatar"],
                      d["default_chat_model"], d["default_vision_model"], d["default_tts_model"],
                      d["llm_timeout"], d["llm_max_tokens"], d["llm_max_retries"],
                      d["session_timeout"], d["max_history_messages"],
                      d["max_tools"], d["max_tool_rounds"], d["skill_pre_filter_top_k"],
                      d["memory_integration"], d["appearance"], d["available_models"],
                      now, now))
        return True

    def delete_agent_config(self, agent_name: str) -> bool:
        with self._connect() as conn:
            conn.execute("DELETE FROM agent_models WHERE agent_name=?", (agent_name,))
            return conn.execute("DELETE FROM agent_configs WHERE agent_name=?", (agent_name,)).rowcount > 0

    # ===== Agent 模型关联 =====

    def get_agent_models(self, agent_name: str) -> List[Dict]:
        """读取 agent 的可用模型列表（含模型详情，从 models.db 补充 provider 信息）"""
        with self._connect() as conn:
            rows = conn.execute("""
                SELECT model_id, is_default, enabled, sort_order
                FROM agent_models
                WHERE agent_name = ?
                ORDER BY sort_order, model_id
            """, (agent_name,)).fetchall()
            results = []
            for row in rows:
                d = dict(row)
                # 尝试从 models.db 补充 provider 信息
                d["model"] = d["model_id"]  # model_id 存的是模型名
                d["provider"] = ""
                d["base_url"] = ""
                try:
                    from ai_agent.models_db import ModelsDB as _MDB
                    _mdb = _MDB(str(self.db_path.parent / "models.db"))
                    _all = _mdb.get_all_models()
                    for m in _all:
                        if m["model"] == d["model_id"] or m.get("model_alias") == d["model_id"]:
                            d["provider"] = m.get("provider", "")
                            d["base_url"] = m.get("base_url", "")
                            d["model_alias"] = m.get("model_alias", "")
                            break
                except Exception:
                    pass
                results.append(d)
            return results

    def get_agent_model_ids(self, agent_name: str) -> List[int]:
        """读取 agent 的可用模型 id 列表"""
        with self._connect() as conn:
            return [r["model_id"] for r in conn.execute(
                "SELECT model_id FROM agent_models WHERE agent_name=? AND enabled=1 ORDER BY sort_order",
                (agent_name,)
            ).fetchall()]

    def set_agent_models(self, agent_name: str, model_names: List[str], default_name: Optional[str] = None) -> bool:
        """设置 agent 的可用模型（事务：先删后插）
        
        Args:
            model_names: 模型名列表（如 ['gpt-4', 'claude-3']）
            default_name: 默认模型名
        """
        with self._connect() as conn:
            conn.execute("DELETE FROM agent_models WHERE agent_name=?", (agent_name,))
            for i, mname in enumerate(model_names):
                is_default = 1 if mname == default_name else 0
                conn.execute("""
                    INSERT INTO agent_models (agent_name, model_id, is_default, enabled, sort_order)
                    VALUES (?, ?, ?, 1, ?)
                """, (agent_name, mname, is_default, i))
            # 同步更新 agent_configs.available_models JSON
            conn.execute("""
                UPDATE agent_configs SET available_models=?, updated_at=?
                WHERE agent_name=?
            """, (json.dumps(model_names, ensure_ascii=False), time.time(), agent_name))
        return True

    def add_agent_model(self, agent_name: str, model_id: int, is_default: bool = False) -> bool:
        """为 agent 添加单个模型"""
        with self._connect() as conn:
            # 检查是否已存在
            existing = conn.execute(
                "SELECT 1 FROM agent_models WHERE agent_name=? AND model_id=?",
                (agent_name, model_id)
            ).fetchone()
            if existing:
                conn.execute("""
                    UPDATE agent_models SET enabled=1, is_default=?
                    WHERE agent_name=? AND model_id=?
                """, (1 if is_default else 0, agent_name, model_id))
            else:
                max_order = conn.execute(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM agent_models WHERE agent_name=?",
                    (agent_name,)
                ).fetchone()[0]
                conn.execute("""
                    INSERT INTO agent_models (agent_name, model_id, is_default, enabled, sort_order)
                    VALUES (?, ?, ?, 1, ?)
                """, (agent_name, model_id, 1 if is_default else 0, max_order + 1))
            # 同步 available_models
            ids = self.get_agent_model_ids(agent_name)
            conn.execute("""
                UPDATE agent_configs SET available_models=?, updated_at=?
                WHERE agent_name=?
            """, (json.dumps(ids, ensure_ascii=False), time.time(), agent_name))
        return True

    def remove_agent_model(self, agent_name: str, model_id: int) -> bool:
        """从 agent 移除模型"""
        with self._connect() as conn:
            ok = conn.execute(
                "DELETE FROM agent_models WHERE agent_name=? AND model_id=?",
                (agent_name, model_id)
            ).rowcount > 0
            if ok:
                ids = self.get_agent_model_ids(agent_name)
                conn.execute("""
                    UPDATE agent_configs SET available_models=?, updated_at=?
                    WHERE agent_name=?
                """, (json.dumps(ids, ensure_ascii=False), time.time(), agent_name))
            return ok

    def set_agent_default_model(self, agent_name: str, model_name: str) -> bool:
        """设置 agent 的默认模型（按模型名）"""
        with self._connect() as conn:
            # 清除旧的默认
            conn.execute("UPDATE agent_models SET is_default=0 WHERE agent_name=?", (agent_name,))
            # 设置新的默认
            ok = conn.execute(
                "UPDATE agent_models SET is_default=1 WHERE agent_name=? AND model_id=?",
                (agent_name, model_name)
            ).rowcount > 0
            # 同步 agent_configs.default_chat_model
            if ok:
                conn.execute("""
                    UPDATE agent_configs SET default_chat_model=?, updated_at=?
                    WHERE agent_name=?
                """, (model_name, time.time(), agent_name))
            return ok

    # ===== 迁移 =====

    def migrate_from_json(self, settings_json_path: str, agents_dir: str) -> Tuple[int, int]:
        """
        从 JSON 文件迁移到 config.db。
        返回 (global_count, agent_count)。
        幂等：重复调用不会重复插入。
        """
        migrated_global = 0
        migrated_agents = 0

        # 1. 迁移全局设置
        settings_path = Path(settings_json_path)
        if settings_path.exists():
            try:
                settings = json.loads(settings_path.read_text(encoding="utf-8"))
                flat = self._flatten_settings(settings)
                self.set_global_settings_batch(flat)
                migrated_global = len(flat)
                logger.info(f"全局设置迁移完成：{migrated_global} 项")
            except Exception as e:
                logger.error(f"全局设置迁移失败：{e}")

        # 2. 迁移 agent 配置
        agents_path = Path(agents_dir)
        if agents_path.exists():
            for agent_dir in sorted(agents_path.iterdir()):
                if not agent_dir.is_dir():
                    continue
                config_file = agent_dir / "config.json"
                if not config_file.exists():
                    continue
                try:
                    config = json.loads(config_file.read_text(encoding="utf-8"))
                    name = agent_dir.name
                    self._migrate_agent_config(name, config)
                    migrated_agents += 1
                    logger.info(f"Agent 配置迁移完成：{name}")
                except Exception as e:
                    logger.error(f"Agent 配置迁移失败 [{agent_dir.name}]：{e}")

        return migrated_global, migrated_agents

    def _flatten_settings(self, settings: Dict, prefix: str = "") -> Dict[str, str]:
        """将嵌套的 settings.json 平铺为 key-value"""
        result = {}
        for k, v in settings.items():
            full_key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                result.update(self._flatten_settings(v, full_key))
            else:
                result[full_key] = str(v)
        return result

    def _migrate_agent_config(self, name: str, config: Dict):
        """从 config.json 内容迁移到 agent_configs 表"""
        agent_config = {
            "display_name": config.get("name", ""),
            "icon": config.get("icon", ""),
            "avatar": config.get("avatar", ""),
            "default_chat_model": config.get("default_chat_model", config.get("default_model", "")),
            "default_vision_model": config.get("default_vision_model", ""),
            "default_tts_model": config.get("default_tts_model", ""),
            "llm_timeout": config.get("llm_timeout", 120),
            "llm_max_tokens": config.get("llm_max_tokens", 8192),
            "llm_max_retries": config.get("llm_max_retries", 2),
            "session_timeout": config.get("session_timeout", 3600),
            "max_history_messages": config.get("max_history_messages", 50),
            "max_tools": config.get("max_tools", 300),
            "max_tool_rounds": config.get("max_tool_rounds", 100),
            "skill_pre_filter_top_k": config.get("skill_pre_filter_top_k", 5),
        }
        # memory_integration
        if "memory_integration" in config:
            agent_config["memory_integration"] = config["memory_integration"]
        # appearance
        if "appearance" in config:
            agent_config["appearance"] = config["appearance"]

        self.upsert_agent_config(name, agent_config)

        # 迁移 available_models → agent_models 表
        available = config.get("available_models", [])
        if available and isinstance(available, list):
            # available_models 存的是模型名，需要查 models.db 获取 id
            # 延迟导入避免循环依赖
            try:
                from ai_agent.models_db import ModelsDB
                models_db = ModelsDB(str(self.db_path.parent / "models.db"))
                all_models = models_db.get_all_models()
                name_to_id: Dict[str, int] = {}
                for m in all_models:
                    name_to_id[m["model"]] = m["id"]
                    if m.get("model_alias"):
                        name_to_id[m["model_alias"]] = m["id"]

                default_name = config.get("default_chat_model", config.get("default_model", ""))
                model_names = []
                for mname in available:
                    if mname in name_to_id:
                        model_names.append(mname)

                if model_names:
                    self.set_agent_models(name, model_names, default_name if default_name in name_to_id else None)
            except Exception as e:
                logger.warning(f"Agent [{name}] 模型关联迁移失败：{e}")

    # ===== 工具方法 =====

    def list_agents(self) -> List[str]:
        """列出所有 agent 名称"""
        with self._connect() as conn:
            return [r["agent_name"] for r in conn.execute(
                "SELECT agent_name FROM agent_configs ORDER BY agent_name"
            ).fetchall()]

    def agent_exists(self, agent_name: str) -> bool:
        with self._connect() as conn:
            return conn.execute(
                "SELECT 1 FROM agent_configs WHERE agent_name=?", (agent_name,)
            ).fetchone() is not None
