"""
siper Web UI - Start the AI Agent with a web interface.

Usage:
    python siper_web.py           # Start on default port 9724
    python siper_web.py 7240      # Start on custom port
"""

import asyncio
import json
import logging
import os
import platform as _platform
import sqlite3
from collections import deque
_is_win = _platform.system() == "Windows"
if not _is_win:
    import signal
import socket
import sys
import time
import base64
import traceback
import threading
import subprocess
import datetime
import urllib.parse
import urllib.request
from typing import Dict, Optional
from pathlib import Path
from urllib.parse import urlparse, parse_qs

try:
    import jinja2
except ImportError:
    print("错误：jinja2 未安装。请运行：pip install jinja2", file=sys.stderr)
    sys.exit(1)

try:
    import websockets
    from websockets.asyncio.server import serve as ws_serve
except ImportError:
    print("错误：websockets 未安装。请运行：pip install websockets", file=sys.stderr)
    sys.exit(1)

# Setup paths
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

os.chdir(PROJECT_ROOT)


from ai_agent.core.agent import AIAgent, AgentConfig

# In-memory log buffer
_log_buffer = []
_LOG_BUFFER_MAX = 2000
_log_seen_ids = set()

# Token usage history
_token_usage_history = []
_TOKEN_USAGE_MAX = 500
_token_db_path = None
_token_db_conn = None

# System settings (overridden from settings.json in main())
_WS_HEARTBEAT_TIMEOUT = 300
_SESSION_LIST_LIMIT = 50
_CONTEXT_WINDOW_DEFAULT = 8192


def _mask_key(key: str) -> str:
    """脱敏 API key：只保留后 4 位，其余用 * 替代。"""
    if not key or len(key) <= 4:
        return "****"
    return "*" * (len(key) - 4) + key[-4:]

def _get_token_db_path():
    """Return path to the shared token database at agents/token.db."""
    return str(Path(os.path.dirname(__file__)) / "agents" / "token.db")

def _init_token_db():
    """Initialize the shared token database and load history into memory."""
    global _token_usage_history, _token_db_path, _token_db_conn
    try:
        _token_db_path = _get_token_db_path()
        os.makedirs(os.path.dirname(_token_db_path), exist_ok=True)
        _token_db_conn = sqlite3.connect(_token_db_path, check_same_thread=False)
        _token_db_conn.execute("PRAGMA journal_mode=WAL")
        _token_db_conn.execute("PRAGMA synchronous=NORMAL")
        cur = _token_db_conn.cursor()
        # Optimized schema: agent field, INTEGER timestamps, model dedup via FK
        cur.execute("""
            CREATE TABLE IF NOT EXISTS token_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS token_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent TEXT NOT NULL DEFAULT '',
                model_id INTEGER REFERENCES token_models(id),
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                ts INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'chat'
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_ts ON token_usage(ts)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_source ON token_usage(source)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_model_id ON token_usage(model_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_nonzero ON token_usage(ts) WHERE total_tokens > 0")
        # Add source column if upgrading from old schema
        try:
            cur.execute("SELECT source FROM token_usage LIMIT 1")
        except Exception:
            cur.execute("ALTER TABLE token_usage ADD COLUMN source TEXT NOT NULL DEFAULT 'chat'")
            _token_db_conn.commit()
            logger.info("Added 'source' column to token_usage table")
        # Migrate old data from sessions.db if present
        _migrate_old_token_data(cur)
        # Load recent history (most recent first, limit 500)
        cur.execute("""
            SELECT t.agent, m.name, t.prompt_tokens, t.completion_tokens, t.total_tokens, t.ts
            FROM token_usage t
            LEFT JOIN token_models m ON t.model_id = m.id
            ORDER BY t.id DESC LIMIT ?
        """, (_TOKEN_USAGE_MAX,))
        rows = cur.fetchall()
        _token_usage_history = [
            {"agent": r[0] or "", "model": r[1] or "",
             "prompt_tokens": r[2], "completion_tokens": r[3], "total_tokens": r[4],
             "time": time.strftime("%H:%M:%S", time.localtime(r[5])),
             "ts": r[5]}
            for r in reversed(rows)
            if r[4] > 0  # Skip zero-token records (model didn't return usage)
        ]
        _token_db_conn.commit()
        # Clean up legacy zero-token records from DB
        try:
            cur = _token_db_conn.cursor()
            cur.execute("DELETE FROM token_usage WHERE total_tokens = 0")
            deleted = cur.rowcount
            if deleted > 0:
                _token_db_conn.commit()
                logger.info(f"Cleaned {deleted} zero-token records from token DB")
        except Exception:
            pass
        logger.info(f"Token DB initialized: {_token_db_path}, loaded {len(_token_usage_history)} records")
    except Exception as e:
        logger.warning(f"Token DB init failed: {e}")

def _migrate_old_token_data(cur):
    """Migrate token_usage data from per-agent sessions.db files."""
    agents_dir = Path(os.path.dirname(__file__)) / "agents"
    if not agents_dir.exists():
        return
    migrated = 0
    for agent_dir in agents_dir.iterdir():
        if not agent_dir.is_dir():
            continue
        # Check new path first, then old path for backward compatibility
        old_db = agent_dir / "sessions" / "sessions.db"
        if not old_db.exists():
            old_db = agent_dir / "sessions.db"
        if not old_db.exists():
            continue
        try:
            old_conn = sqlite3.connect(str(old_db))
            old_cur = old_conn.cursor()
            # Check if old token_usage table exists
            old_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='token_usage'")
            if not old_cur.fetchone():
                old_conn.close()
                continue
            old_cur.execute("SELECT time, model, prompt_tokens, completion_tokens, total_tokens, created_at FROM token_usage ORDER BY id ASC")
            for row in old_cur.fetchall():
                ts = int(row[5]) if row[5] else int(time.time())
                model_name = row[1] or ""
                # Get or create model_id
                cur.execute("SELECT id FROM token_models WHERE name=?", (model_name,))
                r = cur.fetchone()
                if r:
                    model_id = r[0]
                else:
                    cur.execute("INSERT INTO token_models (name) VALUES (?)", (model_name,))
                    model_id = cur.lastrowid
                cur.execute("""
                    INSERT INTO token_usage (agent, model_id, prompt_tokens, completion_tokens, total_tokens, ts)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (agent_dir.name, model_id, row[2], row[3], row[4], ts))
                migrated += 1
            old_conn.close()
            logger.info(f"Migrated {migrated} token records from {old_db}")
        except Exception as e:
            logger.warning(f"Migration from {old_db} failed: {e}")

def _save_token_to_db(entry):
    """Append a token usage entry to the shared token database."""
    global _token_db_conn
    try:
        if not _token_db_conn:
            return
        cur = _token_db_conn.cursor()
        model_name = entry.get("model", "")
        # Get or create model_id
        cur.execute("SELECT id FROM token_models WHERE name=?", (model_name,))
        r = cur.fetchone()
        if r:
            model_id = r[0]
        else:
            cur.execute("INSERT INTO token_models (name) VALUES (?)", (model_name,))
            model_id = cur.lastrowid
        ts = int(time.time())
        cur.execute("""
            INSERT INTO token_usage (agent, model_id, prompt_tokens, completion_tokens, total_tokens, ts, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (entry.get("agent", ""), model_id, entry.get("prompt_tokens", 0),
              entry.get("completion_tokens", 0), entry.get("total_tokens", 0), ts,
              entry.get("source", "chat")))
        # Trim old entries (avoid full COUNT scan; use id range as proxy)
        cur.execute("SELECT MAX(id) - MIN(id) + 1 FROM token_usage")
        row = cur.fetchone()
        count = row[0] if row and row[0] is not None else 0
        if count > _TOKEN_USAGE_MAX:
            excess = count - _TOKEN_USAGE_MAX
            cur.execute("""
                DELETE FROM token_usage WHERE rowid IN (
                    SELECT rowid FROM token_usage ORDER BY rowid ASC LIMIT ?
                )
            """, (excess,))
        _token_db_conn.commit()
    except Exception as e:
        logger.warning(f"Token DB write failed: {e}")

class MemoryLogHandler(logging.Handler):
    def emit(self, record):
        try:
            # Deduplicate: same record object may propagate to multiple loggers
            rid = id(record)
            if rid in _log_seen_ids:
                return
            _log_seen_ids.add(rid)
            # Keep set size bounded
            if len(_log_seen_ids) > _LOG_BUFFER_MAX * 2:
                _log_seen_ids.clear()
            entry = {
                "time": record.asctime if hasattr(record, "asctime") else time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(record.created)),
                "level": record.levelname.lower(),
                "logger": record.name,
                "message": record.getMessage(),
                "timestamp": record.created,
            }
            _log_buffer.append(entry)
            if len(_log_buffer) > _LOG_BUFFER_MAX:
                _log_buffer.pop(0)
        except Exception:
            pass

def _heartbeat_log(msg):
    """Log a HEARTBEAT-level message to the in-memory log buffer."""
    entry = {
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "level": "HEARTBEAT",
        "logger": "siper.ws",
        "message": msg,
        "timestamp": _time.time(),
    }
    _log_buffer.append(entry)
    if len(_log_buffer) > _LOG_BUFFER_MAX:
        _log_buffer.pop(0)

# ===== Log i18n =====
# Maps log message templates to translations.
# Keys are the Chinese message (as logged by siper), values are {lang: translation}.
_LOG_I18N_CACHE = None

def _get_log_i18n():
    """Get the LOG_I18N dict (loaded from JSON file, cached)."""
    global _LOG_I18N_CACHE
    if _LOG_I18N_CACHE is None:
        i18n_path = PROJECT_ROOT / "webui" / "static" / "i18n" / "log-i18n.json"
        try:
            with open(i18n_path, "r", encoding="utf-8") as f:
                _LOG_I18N_CACHE = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load log i18n file: {e}")
            _LOG_I18N_CACHE = {}
    return _LOG_I18N_CACHE


def _translate_log_entry(entry, lang="zh"):
    """Translate a log entry's message based on lang."""
    if lang == "zh":
        return entry  # Default language, no translation needed
    msg = entry.get("message", "")
    log_i18n = _get_log_i18n()
    # Try exact match first
    if msg in log_i18n:
        entry = dict(entry)
        entry["message"] = log_i18n[msg].get(lang, msg)
        return entry
    # Try prefix match (for messages with format placeholders already filled)
    for template, translations in log_i18n.items():
        # Check if the message starts with the template prefix (before first {)
        prefix = template.split("{")[0] if "{" in template else template
        if prefix and msg.startswith(prefix):
            entry = dict(entry)
            entry["message"] = translations.get(lang, msg)
            return entry
    return entry


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
# Remove default console handlers to keep CLI output clean
root_logger = logging.getLogger()
for h in list(root_logger.handlers):
    if isinstance(h, logging.StreamHandler):
        root_logger.removeHandler(h)
# 添加文件日志（必须在 removeHandler 之后，因为 FileHandler 是 StreamHandler 子类）
_file_handler = logging.FileHandler('/tmp/siper_file.log', mode='a', encoding='utf-8')
_file_handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
root_logger.addHandler(_file_handler)
# Keep memory handler attached; optional: raise level to WARNING to hide INFO logs
root_logger.setLevel(logging.WARNING)
logger = logging.getLogger("siper_web")
logger.setLevel(logging.INFO)  # 显式覆盖 root 的 WARNING 级别
# Attach memory handler
_mem_handler = MemoryLogHandler()
_mem_handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logger.addHandler(_mem_handler)
# Also attach to common library loggers to capture their logs
for lib_name in ("websockets", "asyncio", "ai_agent", "agent", "llm_client"):
    lib_logger = logging.getLogger(lib_name)
    if not any(isinstance(h, MemoryLogHandler) for h in lib_logger.handlers):
        lib_logger.addHandler(_mem_handler)

TEMPLATE_DIR = PROJECT_ROOT / "webui"
_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(TEMPLATE_DIR)),
    auto_reload=True,  # Auto-reload template on disk change (dev mode)
    enable_async=False,
)
_version = int(time.time())  # Cache-buster for JS/CSS
SIPER_VERSION = "v0.2.0"  # Current version — update on release


def _render_index() -> str:
    """Render index.html template with dynamic variables."""
    template = _jinja_env.get_template("index.html")
    html = template.render(
        version=_version,
        siper_version=SIPER_VERSION,
    )
    # Inject cache-busting JS version based on file mtime
    def _js_mtime(match: _re.Match) -> str:
        js_path = match.group(1).split("?")[0]  # strip existing ?v=...
        full = PROJECT_ROOT / "webui" / js_path.lstrip("/")
        if full.exists():
            return f'<script src="{js_path}?v={int(os.path.getmtime(full))}"></script>'
        return match.group(0)
    html = _re.sub(r'<script src="(/static/(?:pages|js)/[^"]+)"></script>', _js_mtime, html)
    # ESM entry: 用 start_time 作为 cache-buster（每次重启都变，确保浏览器不缓存旧版 app.js）
    _js_entry = PROJECT_ROOT / "webui" / "js" / "app.js"
    if _js_entry.exists():
        _cb = str(int(start_time * 1000))
        # 创建/更新符号链接 app-{start_time}.js → app.js
        _symlink = PROJECT_ROOT / "webui" / "js" / f"app-{_cb}.js"
        if not _symlink.exists() or os.readlink(str(_symlink)) != "app.js":
            if _symlink.exists() or _symlink.is_symlink():
                _symlink.unlink()
            _symlink.symlink_to("app.js")
    else:
        _cb = str(int(time.time() * 1000))
    html = _re.sub(
        r'<script type="module" src="(/js/app\.js)"></script>',
        lambda m: f'<script type="module" src="/js/app-{_cb}.js"></script>',
        html,
    )
    # Inject cache-busting CSS — base.css (global, always needed)
    base_css = PROJECT_ROOT / "webui" / "css" / "base.css"
    if base_css.exists():
        mtime = int(os.path.getmtime(base_css))
        css_link = f'  <link rel="stylesheet" href="/css/base.css?v={mtime}">'
        html = html.replace('</head>', f'{css_link}\n</head>')
    # 禁止浏览器缓存 index.html（确保每次启动都拿到最新的 ?v= 引用）
    html = html.replace('<head>', '<head>\n<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">', 1)
    return html



agent = None
start_time = time.time()
active_tasks = deque(maxlen=1000)

# 起源：有状态 UI
from ai_agent.state.snapshot_manager import SnapshotManager
from ai_agent.state.carrier import WebUIAdapter, CarrierManager
from ai_agent.state.protocol import MsgType, make_state_full
from ai_agent.api.router import Router, ok, api_router, register_routes
from ai_agent.db.manager import DatabaseManager as _DBMgr

snapshot_mgr = None
carrier_mgr = None
api_router = None
db_mgr = None

import re as _re  # used for _render_index, safe_name


async def main():
    global agent, _LOG_BUFFER_MAX, _TOKEN_USAGE_MAX
    _t0 = time.time()
    # Port priority: CLI arg > settings.json > default 9724
    _cfg_port = 9724
    _system_cfg = {}
    try:
        _sf = PROJECT_ROOT / "settings.json"
        if _sf.exists():
            with open(_sf, "r", encoding="utf-8") as _f:
                _cfg = json.load(_f)
            _cfg_port = int(_cfg.get("gateway", {}).get("webui", {}).get("port", 9724))
            _system_cfg = _cfg.get("system", {})
    except Exception:
        pass
    # Apply system settings
    _LOG_BUFFER_MAX = int(_system_cfg.get("log_buffer_size", 2000))
    _TOKEN_USAGE_MAX = int(_system_cfg.get("token_usage_max", 500))
    _WS_HEARTBEAT_TIMEOUT = int(_system_cfg.get("ws_heartbeat_timeout", 300))
    _SESSION_LIST_LIMIT = int(_system_cfg.get("session_list_limit", 50))
    _CONTEXT_WINDOW_DEFAULT = int(_system_cfg.get("context_window_default", 8192))
    logger.info(f"系统配置：日志缓冲={_LOG_BUFFER_MAX}, Token记录={_TOKEN_USAGE_MAX}, WS心跳={_WS_HEARTBEAT_TIMEOUT}s, 会话列表={_SESSION_LIST_LIMIT}, 上下文窗口默认={_CONTEXT_WINDOW_DEFAULT}")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else _cfg_port

    # PID 文件路径（由 CLI 脚本写入，此处仅用于 finally 清理）
    pid_file = PROJECT_ROOT / ".siper.pid"

    logger.info(f"[计时] 入口: {(time.time()-_t0)*1000:.0f}ms")

    # Initialize agent
    config = AgentConfig(
        agent_id="siper_agent",
        name="Siper AI Agent",
        agent_name="default",
        max_concurrent_tools=10,
        default_provider="longcat",
        skills_dir=str(PROJECT_ROOT / "skills"),
        data_dir=str(PROJECT_ROOT / "agents" / "default"),
        agents_dir=str(PROJECT_ROOT / "agents"),
    )

    agent = AIAgent(config)
    logger.info(f"[计时] AIAgent 创建完成: {(time.time()-_t0)*1000:.0f}ms")
    initialized = await agent.initialize()
    logger.info(f"[计时] Agent 初始化完成: {(time.time()-_t0)*1000:.0f}ms")
    if not initialized:
        logger.error("Agent 初始化失败")
        sys.exit(1)

    # Per-agent session managers: agent_name -> SessionManager
    _agent_session_managers = {"default": agent.session_manager}
    _agent_session_managers_lock = asyncio.Lock()

    # Ensure all agents have an avatar (copy default if missing)
    from agents import ensure_agent_avatar, list_agents as _list_agents
    for _agent_name in _list_agents():
        ensure_agent_avatar(_agent_name)

    async def _get_or_create_session_manager(agent_name):
        """Get or create a SessionManager for the given agent name."""
        if agent_name in _agent_session_managers:
            return _agent_session_managers[agent_name]
        async with _agent_session_managers_lock:
            # Double-check after acquiring lock
            if agent_name in _agent_session_managers:
                return _agent_session_managers[agent_name]
            from ai_agent.sessions.session_manager import SessionManager
            agent_data_dir = str(PROJECT_ROOT / "agents" / agent_name)
            sm = SessionManager(data_dir=agent_data_dir)
            await sm.initialize()
            _agent_session_managers[agent_name] = sm
            logger.info(f"为 agent '{agent_name}' 创建 SessionManager: {agent_data_dir}")
            return sm

    # Load per-agent config (icon, avatar, display_name, session_timeout, etc.) from config.json
    # NOTE: models are NOT stored in config.json — they live in models.db (SQLite)
    from agents import load_agent_config_file
    agent_cfg = load_agent_config_file("default") or {}
    _cfg_key_default = ""
    # Load models from SQLite (agents/default/models.db)
    from ai_agent.models_db import ModelsDB as _ModelsDB
    _models_db = _ModelsDB(str(PROJECT_ROOT / "models.db"))
    _gm_models = []
    _gm_default = ""
    if _models_db.get_all_models():
        _flat = _models_db.get_models_flat()
        _gm_models = _flat["models"]
        _gm_default = _flat.get("default_model", "")
        logger.info(f"配置：从 models.db 加载了 {len(_gm_models)} 个模型，默认={_gm_default}")
    # API key priority: env LONGCAT_API_KEY > default model key > .env file
    if _gm_models:
        _first = _gm_models[0]
        for _m in _gm_models:
            if _m.get("name") == _gm_default or _m.get("is_default"):
                _first = _m
                break
        _cfg_key_default = _first.get("api_key", "")
    _lc_key = os.environ.get("LONGCAT_API_KEY", "") or _cfg_key_default
    # Fallback: try reading from .env file in project root
    if not _lc_key:
        _env_path = PROJECT_ROOT / ".env"
        if _env_path.exists():
            try:
                for _line in _env_path.read_text(encoding="utf-8").splitlines():
                    _line = _line.strip()
                    if _line.startswith("LONGCAT_API_KEY="):
                        _lc_key = _line.split("=", 1)[1].strip().strip('"').strip("'")
                        if _lc_key:
                            logger.info("配置：从 .env 文件读取 LONGCAT_API_KEY")
                        break
            except Exception:
                pass
    _sv_key = os.environ.get("SENSENOVA_API_KEY", "")
    if agent_cfg:
        # Apply display properties
        if agent_cfg.get("name"):
            agent.config.name = agent_cfg["name"]
            logger.info(f"配置：显示名称 = {agent_cfg['name']}")
        if agent_cfg.get("icon"):
            agent.config.icon = agent_cfg["icon"]
        if agent_cfg.get("avatar"):
            agent.config.avatar = agent_cfg["avatar"]
        # Apply model references (available_models, default_chat_model, etc.)
        # Validate against global models: filter out deleted model names
        _global_model_names = set(m.get("name", "") or m.get("id", "") for m in _gm_models)
        if agent_cfg.get("available_models"):
            _valid = [n for n in agent_cfg["available_models"] if n in _global_model_names]
            _dropped = len(agent_cfg["available_models"]) - len(_valid)
            if _dropped > 0:
                logger.info(f"配置：过滤了 {_dropped} 个已删除模型，保留 {_valid}")
            agent.config.available_models = _valid
        if agent_cfg.get("default_chat_model"):
            if agent_cfg["default_chat_model"] in _global_model_names or not _global_model_names:
                agent.config.default_chat_model = agent_cfg["default_chat_model"]
            else:
                logger.info(f"配置：默认模型 '{agent_cfg['default_chat_model']}' 不在全局模型中，已清除")
                agent.config.default_chat_model = ""
        if agent_cfg.get("default_vision_model"):
            agent.config.default_vision_model = agent_cfg["default_vision_model"]
        if agent_cfg.get("default_tts_model"):
            agent.config.default_tts_model = agent_cfg["default_tts_model"]
        # Legacy: if config.json still has models/default_model, migrate
        if agent_cfg.get("models") and not agent_cfg.get("available_models"):
            _migrated = [m.get("name", m.get("id", "")) for m in agent_cfg["models"]]
            _valid = [n for n in _migrated if n in _global_model_names]
            agent.config.available_models = _valid
            agent.config.default_chat_model = agent_cfg.get("default_model", "") if agent_cfg.get("default_model", "") in _global_model_names else ""
            logger.info(f"配置：从旧格式迁移了 {len(_valid)}/{len(_migrated)} 个模型引用")
        # Apply session_timeout and max_tools from config.json
        if "session_timeout" in agent_cfg:
            agent.config.session_timeout = int(agent_cfg["session_timeout"])
            logger.info(f"配置：会话超时 = {agent.config.session_timeout}秒")
        if "max_tools" in agent_cfg:
            agent.config.max_concurrent_tools = int(agent_cfg["max_tools"])
            logger.info(f"配置：最大工具数 = {agent.config.max_concurrent_tools}")
        if "max_tool_rounds" in agent_cfg:
            agent.config.max_tool_rounds = int(agent_cfg["max_tool_rounds"])
            logger.info(f"配置：最大工具调用轮次 = {agent.config.max_tool_rounds}")
        # Apply per-agent response limits from config.json
        if "llm_timeout" in agent_cfg:
            agent.config.llm_timeout = int(agent_cfg["llm_timeout"])
            logger.info(f"配置：LLM 超时 = {agent.config.llm_timeout}秒")
        if "llm_max_tokens" in agent_cfg:
            agent.config.llm_max_tokens = int(agent_cfg["llm_max_tokens"])
            logger.info(f"配置：LLM max_tokens = {agent.config.llm_max_tokens}")
        if "llm_max_retries" in agent_cfg:
            agent.config.llm_max_retries = int(agent_cfg["llm_max_retries"])
            logger.info(f"配置：LLM 重试次数 = {agent.config.llm_max_retries}")
        if "max_history_messages" in agent_cfg:
            agent.config.max_history_messages = int(agent_cfg["max_history_messages"])
            logger.info(f"配置：历史消息加载数 = {agent.config.max_history_messages}")
        if "skill_pre_filter_top_k" in agent_cfg:
            agent.config.skill_pre_filter_top_k = int(agent_cfg["skill_pre_filter_top_k"])
            logger.info(f"配置：技能预筛选 top_k = {agent.config.skill_pre_filter_top_k}")
        # Apply context compression settings from config.json
        if "context_compression" in agent_cfg:
            cc = agent_cfg["context_compression"]
            if "mode" in cc:
                agent.config.context_compression_mode = cc["mode"]
            if "sliding_window_size" in cc:
                agent.config.sliding_window_size = int(cc["sliding_window_size"])
            if "summary_max_tokens" in cc:
                agent.config.summary_max_tokens = int(cc["summary_max_tokens"])
            if "tool_result_max_tokens" in cc:
                agent.config.tool_result_max_tokens = int(cc["tool_result_max_tokens"])
            logger.info(f"配置：上下文压缩模式 = {agent.config.context_compression_mode}, "
                       f"窗口大小 = {agent.config.sliding_window_size}, "
                       f"工具结果最大 tokens = {agent.config.tool_result_max_tokens}")
        # Find the default model entry for LLM client configuration
        # Priority: agent config default_chat_model > global default model
        _agent_default_model = agent.config.default_chat_model or _gm_default
        llm_cfg = None
        for m in (_gm_models or []):
            if m.get("name") == _agent_default_model:
                llm_cfg = m
                break
        if not llm_cfg and _gm_models:
            llm_cfg = _gm_models[0]
        # Resolve API key: env var > config.json > empty
        _cfg_key = llm_cfg.get("api_key", "") if llm_cfg else ""
        if not _lc_key:
            _lc_key = _cfg_key
        if llm_cfg and _lc_key:
            agent.configure_llm(
                api_key=_lc_key,
                base_url=llm_cfg.get("base_url", ""),
                model=llm_cfg.get("name", ""),
                vision_api_key=_sv_key,
                vision_base_url="",
                vision_model="",
            )
            logger.info(f"配置：LLM 来自 models.db — 模型={llm_cfg.get('name')}, 地址={llm_cfg.get('base_url')}")
        else:
            logger.info("配置：无可用模型/密钥，LLM 暂未配置 — 可在 Web UI 模型设置页面添加")
    else:
        if _lc_key:
            _def_model = _gm_default or ""
            agent.configure_llm(
                api_key=_lc_key,
                base_url="",
                model=_def_model,
                vision_api_key=_sv_key,
                vision_base_url="",
                vision_model="",
            )
            logger.info(f"配置：未找到 config.json，使用环境变量 LLM 配置，模型={_def_model}")
        else:
            logger.info("配置：无可用模型/密钥，LLM 暂未配置 — 可在 Web UI 模型设置页面添加")

    # NOTE: coordinator is lazily initialized
    # on first use to reduce memory footprint when not needed.
    # Call _ensure_coordinator() before use.

    with open("/tmp/siper_startup.log", "w") as _dbg:
        _dbg.write(f"[{(time.time()-_t0):.1f}s] agent initialized: {initialized}\n")
    logger.info(f"Agent 已初始化：{agent.config.name}")
    logger.info(f"[计时] 配置加载完成: {(time.time()-_t0)*1000:.0f}ms")
    logger.info(f"Agent 配置：{agent.config.agent_name}")
    logger.info(f"已激活技能：{list(agent.active_skills.keys())}")
    logger.info(f"已注册工具：{agent.tool_registry.list_tools()}")
    logger.info(f"组件已加载：agent + 会话 + 工具 + 技能")

    # Start background upgrade checker (daemon thread, every 30 min)
    # 内联定义避免 Python 局部变量前向引用问题
    _upgrade_cache = {
        "success": None,
        "local_version": SIPER_VERSION,
        "latest_version": SIPER_VERSION,
        "has_updates": False,
        "checked_at": 0,
        "error": None,
    }
    _upgrade_cache_lock = threading.Lock()

    def _upgrade_check_background():
        import time as _time
        while True:
            try:
                local_version = SIPER_VERSION
                api_url = "https://api.github.com/repos/gavin-jack/siper-agent/tags"
                req = urllib.request.Request(api_url, headers={"User-Agent": "SiPer-Agent"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    tags = json.loads(resp.read().decode())
                latest_version = local_version
                if tags:
                    latest_version = tags[0].get("name", local_version)
                project_root = Path(os.path.dirname(os.path.abspath(__file__)))
                has_updates = False
                try:
                    result = subprocess.run(
                        ["git", "fetch", "--dry-run", "origin", "main"],
                        cwd=str(project_root), capture_output=True, text=True, timeout=15
                    )
                    has_updates = result.returncode == 0 and ("main" in result.stderr or result.stdout.strip())
                except Exception:
                    pass
                needs_upgrade = latest_version != local_version
                with _upgrade_cache_lock:
                    _upgrade_cache.clear()
                    _upgrade_cache.update({
                        "success": True,
                        "local_version": local_version,
                        "latest_version": latest_version,
                        "has_updates": needs_upgrade or has_updates,
                        "checked_at": _time.time(),
                        "error": None,
                    })
            except Exception as e:
                with _upgrade_cache_lock:
                    _upgrade_cache["error"] = str(e)
                    _upgrade_cache["checked_at"] = _time.time()
            _time.sleep(1800)

    _t = threading.Thread(target=_upgrade_check_background, daemon=True)
    _t.start()
    logger.info("升级检测：后台线程已启动（30分钟间隔）")

    # Initialize token usage DB (shared agents/token.db)
    _init_token_db()
    with open("/tmp/siper_startup.log", "a") as _dbg:
        _dbg.write(f"[{(time.time()-_t0):.1f}s] token DB done\n")
    logger.info(f"Token 历史：已加载 {len(_token_usage_history)} 条记录")

    # Clean up completely empty sessions (no messages at all) from previous runs
    # Note: sessions with only user messages are NOT deleted - they may be in-flight
    # (user sent a message but AI hasn't replied yet, or user switched pages)
    try:
        cursor = agent.session_manager._db_connection.cursor()
        logger.info("启动清理：开始检查无效会话...")
        # Find sessions with no messages at all
        cursor.execute(
            "SELECT session_id FROM sessions WHERE session_id NOT IN (SELECT DISTINCT session_id FROM messages)"
        )
        empty_sids = [row["session_id"] for row in cursor.fetchall()]
        all_cleanup_sids = set(empty_sids)
        for sid in all_cleanup_sids:
            cursor.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
            cursor.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
        if all_cleanup_sids:
            agent.session_manager._db_connection.commit()
            logger.info(f"启动清理：删除了 {len(all_cleanup_sids)} 个空会话")
    except Exception:
        pass
    logger.info(f"[计时] 会话清理完成: {(time.time()-_t0)*1000:.0f}ms")

    # Show available agents
    try:
        from agents import list_agents
        available_agents = list_agents()
        logger.info(f"可用 Agent：{available_agents}")
    except ImportError:
        pass


    ws_port = port + 1

    async def _startup_check(t0: float, http_port: int) -> None:
        """Verify core resources are accessible after startup. Non-blocking: failures are warnings."""
        _check_url = f"http://127.0.0.1:{http_port}"
        _checks = [
            ("HTTP page",       "/",               lambda b: len(b) > 1000 and b"<!DOCTYPE" in b),
            ("ESM entry",       "/js/app.js", lambda b: len(b) > 100 and b"import" in b),
            ("CSS style",       "/css/style.css", lambda b: len(b) > 100 and b"var(--" in b),
            ("Static favicon",  "/static/favicon.ico", lambda b: len(b) > 100),
            ("Static echarts",  "/static/js/echarts.min.js", lambda b: len(b) > 1000),
            ("API agents",      "/api/agents",     lambda b: len(b) > 10 and b'"' in b),
            ("API status",      "/api/status",     lambda b: len(b) > 10),
            ("API config",      "/api/config",     lambda b: len(b) > 10),
        ]
        _ok = 0
        _fail = 0
        for _name, _path, _validate in _checks:
            try:
                _url = f"{_check_url}{_path}"
                _req = urllib.request.Request(_url, method="GET")
                _resp = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None, lambda r=_req: urllib.request.urlopen(r, timeout=5)
                    ),
                    timeout=6,
                )
                _body = _resp.read()
                if _validate(_body):
                    _ok += 1
                    logger.info(f"  ✅ {_name}: OK  ({len(_body)} bytes)")
                else:
                    _fail += 1
                    logger.warning(f"  ❌ {_name}: content mismatch  ({len(_body)} bytes)")
            except Exception as _e:
                _fail += 1
                logger.warning(f"  ❌ {_name}: {_e}")
        # --- 内存+数据库模式深度检查 ---
        _mem_checks = []
        # Agent 对象状态
        try:
            _agent_ok = agent is not None and agent.is_running
            _mem_checks.append(("Memory: Agent 运行", _agent_ok))
        except Exception:
            _mem_checks.append(("Memory: Agent 运行", False))
        # SessionManager 状态
        try:
            _sm_ok = agent.session_manager is not None and agent.session_manager._db_connection is not None
            _mem_checks.append(("Memory: Session DB", _sm_ok))
        except Exception:
            _mem_checks.append(("Memory: Session DB", False))
        # LLM 配置状态（未配置是正常状态，可在前端配置）
        try:
            _llm_ok = agent.llm_client is not None
            _mem_checks.append(("Memory: LLM 可选配置", _llm_ok))
        except Exception:
            _mem_checks.append(("Memory: LLM 可选配置", False))
        # ModelsDB 状态（检查数据库可访问 + 表结构，不要求有数据）
        try:
            _models_accessible = _models_db is not None
            if _models_accessible:
                # 验证表结构完整（providers + models 两张表存在）
                _conn = _models_db._connect()
                _tables = [r[0] for r in _conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('providers','models')"
                ).fetchall()]
                _conn.close()
                _models_ok = len(_tables) == 2
            else:
                _models_ok = False
            _mem_checks.append(("Memory: Models DB 可访问", _models_ok))
        except Exception:
            _mem_checks.append(("Memory: Models DB 可访问", False))
        # 起源组件状态（如已初始化）
        try:
            _origin_ok = snapshot_mgr is not None and carrier_mgr is not None
            _mem_checks.append(("Memory: 起源组件", _origin_ok))
        except Exception:
            _mem_checks.append(("Memory: 起源组件", False))
        # WS 端口可达性
        try:
            _ws_port = http_port + 1
            import socket as _socket
            _s = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
            _s.settimeout(3)
            _result = _s.connect_ex(("127.0.0.1", _ws_port))
            _s.close()
            _mem_checks.append(("Network: WS 端口", _result == 0))
        except Exception:
            _mem_checks.append(("Network: WS 端口", False))

        for _name, _passed in _mem_checks:
            if _passed:
                _ok += 1
                logger.info(f"  ✅ {_name}")
            else:
                _fail += 1
                # LLM 未配置和起源组件未初始化是预期的，降级为 info
                if "LLM" in _name or "起源" in _name:
                    logger.info(f"  ⏳ {_name}（预期，可在 Web UI 配置）")
                else:
                    logger.warning(f"  ❌ {_name}")

        _total = _ok + _fail
        _summary = f"启动验证: {_ok}/{_total} 通过 ({_fail} 个可选警告)"
        logger.info(_summary)
        with open("/tmp/siper_startup.log", "a") as _dbg:
            _dbg.write(f"[{(time.time()-t0):.1f}s] {_summary}\n")

    async def handle_request(reader, writer):
        try:
            data = await asyncio.wait_for(reader.read(10 * 1024 * 1024), timeout=30)
            request = data.decode("utf-8", errors="ignore")
            lines = request.split("\r\n")
            first_line = lines[0] if lines else ""
            parts = first_line.split(" ")
            method = parts[0] if parts else "GET"
            full_path = parts[1] if len(parts) > 1 else "/"
            path = full_path.split("?")[0]

            # Parse request headers into dict
            req_headers = {}
            for hl in lines[1:]:
                if hl == "":
                    break
                if ":" in hl:
                    k, v = hl.split(":", 1)
                    req_headers[k.strip().lower()] = v.strip()

            # Parse body for POST/PUT/DELETE
            body = {}
            if method in ("POST", "PUT", "DELETE"):
                body_start = request.find("\r\n\r\n")
                if body_start >= 0:
                    body_str = request[body_start + 4:]
                    try:
                        body = json.loads(body_str)
                    except Exception as _e:
                        logger.warning(f"JSON parse failed for {path}: body_len={len(body_str)}, err={_e}")
                        # Log first 200 chars for debugging
                        logger.warning(f"Body preview: {body_str[:200]!r}")
                        pass

            # REST API routes — Router 分发
            resp = None

            # 二进制端点（Router 无法处理原始字节响应）
            if path == "/api/avatar" and method == "GET":
                # Avatar 图片服务
                from urllib.parse import parse_qs, urlparse as _urlparse
                _qs = parse_qs(_urlparse(full_path).query)
                agent_name = _qs.get("agent", ["default"])[0]
                # 安全校验：只允许合法 agent 目录名（字母/数字/下划线/连字符）
                import re as _re
                if not _re.match(r'^[a-zA-Z0-9_-]+$', agent_name):
                    agent_name = "default"
                # 查找 avatar 文件（支持 .webp 和 .png）
                avatar_path = None
                for ext in (".webp", ".png", ".jpg", ".jpeg"):
                    p = PROJECT_ROOT / "agents" / agent_name / f"avatar{ext}"
                    if p.exists():
                        avatar_path = p
                        break
                if avatar_path:
                    with open(avatar_path, "rb") as f:
                        resp_body = f.read()
                    ct = "image/webp" if avatar_path.suffix == ".webp" else "image/png"
                    headers = [
                        "HTTP/1.1 200 OK",
                        f"Content-Type: {ct}",
                        f"Content-Length: {len(resp_body)}",
                        "Cache-Control: public, max-age=3600",
                        "Connection: close",
                        "", "",
                    ]
                    writer.write("\r\n".join(headers).encode("utf-8") + resp_body)
                    await writer.drain()
                    writer.close()
                else:
                    body_404 = b"Not Found"
                    headers = [
                        "HTTP/1.1 404 Not Found",
                        "Content-Type: text/plain",
                        f"Content-Length: {len(body_404)}",
                        "Connection: close",
                        "", "",
                    ]
                    writer.write("\r\n".join(headers).encode("utf-8") + body_404)
                    await writer.drain()
                    writer.close()
                return  # skip JSON serialization

            # 文件上传端点（需要 raw_request，Router 无法处理）
            if path == "/api/avatar/upload" and method == "POST":
                resp = _handle_avatar_upload(body, agent, request)
            elif path == "/api/upload" and method == "POST":
                resp = api_upload_file(body, request)
            else:
                # JSON API 端点 — Router 分发
                from ai_agent.api.router import api_router
                resp = await api_router.dispatch(method, path, body, full_path)

            # ===== Static files for /uploads/ path =====
            if path.startswith("/uploads/"):
                # Security: prevent path traversal
                upload_root = (PROJECT_ROOT / "uploads").resolve()
                try:
                    requested = (PROJECT_ROOT / path.lstrip("/")).resolve()
                    resolved = requested.resolve()
                except Exception:
                    resolved = None
                if resolved and str(resolved).startswith(str(upload_root)) and resolved.is_file():
                    ext = os.path.splitext(str(resolved))[1].lower()
                    ct_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp"}
                    ct = ct_map.get(ext, "application/octet-stream")
                    with open(resolved, "rb") as f:
                        resp_body = f.read()
                    headers = [
                        "HTTP/1.1 200 OK",
                        f"Content-Type: {ct}",
                        f"Content-Length: {len(resp_body)}",
                        "Cache-Control: public, max-age=86400",
                        "Access-Control-Allow-Origin: *",
                        "Connection: close",
                        "", "",
                    ]
                    writer.write("\r\n".join(headers).encode("utf-8") + resp_body)
                    await writer.drain()
                    writer.close()
                else:
                    body_404 = b"Not Found"
                    headers = [
                        "HTTP/1.1 404 Not Found",
                        "Content-Type: text/plain",
                        f"Content-Length: {len(body_404)}",
                        "Connection: close",
                        "", "",
                    ]
                    writer.write("\r\n".join(headers).encode("utf-8") + body_404)
                    await writer.drain()
                    writer.close()
                return  # skip JSON serialization

            # ===== Static files for /static/ path =====
            if path.startswith("/static/"):
                # Security: prevent path traversal
                requested = Path(os.path.join(os.path.dirname(__file__), "webui", path.lstrip("/")))
                static_root = Path(os.path.join(os.path.dirname(__file__), "webui", "static")).resolve()
                try:
                    resolved = requested.resolve()
                except Exception:
                    resolved = None
                if resolved and str(resolved).startswith(str(static_root)) and resolved.is_file():
                    ext = os.path.splitext(str(resolved))[1].lower()
                    content_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript"}
                    ct = content_types.get(ext, "application/octet-stream")
                    with open(resolved, "rb") as f:
                        file_data = f.read()
                    # JS/CSS: gzip compress if client supports it
                    cache_hdr = "Cache-Control: public, max-age=86400" if ct.startswith("image/") or ct.startswith("font/") else "Cache-Control: no-cache, must-revalidate"
                    accept_encoding = req_headers.get("accept-encoding", "")
                    # ETag/Last-Modified for conditional requests
                    import hashlib as _hashlib
                    file_mtime = int(os.path.getmtime(resolved))
                    etag = '"' + _hashlib.md5(file_data).hexdigest()[:12] + '"'
                    last_mod = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(file_mtime))
                    if ext in (".css", ".js") and "gzip" in accept_encoding:
                        import gzip as _gzip
                        compressed = _gzip.compress(file_data, compresslevel=9)
                        headers_list = [
                            "HTTP/1.1 200 OK",
                            f"Content-Type: {ct}",
                            f"Content-Length: {len(compressed)}",
                            "Content-Encoding: gzip",
                            f"ETag: {etag}",
                            f"Last-Modified: {last_mod}",
                            cache_hdr,
                            "Connection: close",
                            "",
                            "",
                        ]
                        writer.write("\r\n".join(headers_list).encode("utf-8") + compressed)
                    else:
                        headers_list = [
                            "HTTP/1.1 200 OK",
                            f"Content-Type: {ct}",
                            f"Content-Length: {len(file_data)}",
                            f"ETag: {etag}",
                            f"Last-Modified: {last_mod}",
                            cache_hdr,
                            "Connection: close",
                            "",
                            "",
                        ]
                        writer.write("\r\n".join(headers_list).encode("utf-8") + file_data)
                    await writer.drain()
                    writer.close()
                    return
                # Static file not found — return 404, do NOT fall through to index.html
                body_404 = b"Not Found"
                headers_404 = [
                    "HTTP/1.1 404 Not Found",
                    "Content-Type: text/plain",
                    f"Content-Length: {len(body_404)}",
                    "Connection: close",
                    "",
                    "",
                ]
                writer.write("\r\n".join(headers_404).encode("utf-8") + body_404)
                await writer.drain()
                writer.close()
                return

            # ===== Static files for /js/ path (ESM modules + CSS, dev mode) =====
            if path.startswith("/js/"):
                requested = Path(os.path.join(os.path.dirname(__file__), "webui", path.lstrip("/")))
                js_root = Path(os.path.join(os.path.dirname(__file__), "webui", "js")).resolve()
                try:
                    resolved = requested.resolve()
                except Exception:
                    resolved = None
                if resolved and str(resolved).startswith(str(js_root)) and resolved.is_file():
                    ext = os.path.splitext(str(resolved))[1].lower()
                    content_types = {".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript"}
                    ct = content_types.get(ext, "application/octet-stream")
                    with open(resolved, "rb") as f:
                        file_data = f.read()
                    # Rewrite ESM import paths to add cache-buster ?v= so that
                    # transitive dependencies are not served from browser cache.
                    if ext == ".js":
                        try:
                            import re as _re_local
                            # 用 import 目标文件的 mtime 做稳定版本号
                            # 关键：?v= 基于被引用文件的 mtime（而非当前文件的 mtime），
                            # 确保同一子依赖被多个上级引用时 URL 一致，浏览器可正确缓存
                            def _replace_import(match):
                                import_path = match.group(1).decode('utf-8')
                                quote = match.group(2).decode('utf-8')
                                current_dir = resolved.parent
                                target = (current_dir / import_path).resolve()
                                if target.exists():
                                    ver = str(int(os.path.getmtime(target)))
                                else:
                                    ver = str(int(os.path.getmtime(resolved)))
                                return b"from " + quote.encode() + import_path.encode() + b"?v=" + ver.encode() + quote.encode()
                            file_data = _re_local.sub(
                                rb'from\s+["\'](\.\.?/[^"\']+\.js)(["\'])',
                                _replace_import,
                                file_data,
                            )
                        except Exception:
                            pass
                    # ETag/Last-Modified for conditional requests — Chromium ESM
                    # cache ignores Cache-Control: no-cache without these.
                    import hashlib as _hashlib
                    file_mtime = int(os.path.getmtime(resolved))
                    etag = '"' + _hashlib.md5(file_data).hexdigest()[:12] + '"'
                    last_mod = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(file_mtime))
                    headers_list = [
                        "HTTP/1.1 200 OK",
                        f"Content-Type: {ct}",
                        f"Content-Length: {len(file_data)}",
                        f"ETag: {etag}",
                        f"Last-Modified: {last_mod}",
                        "Cache-Control: no-store, no-cache, must-revalidate",
                        "Pragma: no-cache",
                        "Connection: close",
                        "",
                        "",
                    ]
                    writer.write("\r\n".join(headers_list).encode("utf-8") + file_data)
                    await writer.drain()
                    writer.close()
                    return

            # ===== Static files for /css/ path (CSS, dev mode) =====
            if path.startswith("/css/"):
                requested = Path(os.path.join(os.path.dirname(__file__), "webui", path.lstrip("/")))
                css_root = Path(os.path.join(os.path.dirname(__file__), "webui", "css")).resolve()
                try:
                    resolved = requested.resolve()
                except Exception:
                    resolved = None
                if resolved and str(resolved).startswith(str(css_root)) and resolved.is_file():
                    with open(resolved, "rb") as f:
                        file_data = f.read()
                    import hashlib as _hashlib
                    file_mtime = int(os.path.getmtime(resolved))
                    etag = '"' + _hashlib.md5(file_data).hexdigest()[:12] + '"'
                    last_mod = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(file_mtime))
                    headers_list = [
                        "HTTP/1.1 200 OK",
                        "Content-Type: text/css",
                        f"Content-Length: {len(file_data)}",
                        f"ETag: {etag}",
                        f"Last-Modified: {last_mod}",
                        "Cache-Control: no-store, no-cache, must-revalidate",
                        "Pragma: no-cache",
                        "Connection: close",
                        "",
                        "",
                    ]
                    writer.write("\r\n".join(headers_list).encode("utf-8") + file_data)
                    await writer.drain()
                    writer.close()
                    return

            # ===== Static files for /dist/ path (Vite build, prod mode) =====
            if path.startswith("/dist/"):
                requested = Path(os.path.join(os.path.dirname(__file__), "webui", path.lstrip("/")))
                dist_root = Path(os.path.join(os.path.dirname(__file__), "webui", "dist")).resolve()
                try:
                    resolved = requested.resolve()
                except Exception:
                    resolved = None
                if resolved and str(resolved).startswith(str(dist_root)) and resolved.is_file():
                    ext = os.path.splitext(str(resolved))[1].lower()
                    content_types = {
                        ".css": "text/css", ".js": "application/javascript",
                        ".mjs": "application/javascript", ".ico": "image/x-icon",
                        ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
                    }
                    ct = content_types.get(ext, "application/octet-stream")
                    with open(resolved, "rb") as f:
                        file_data = f.read()
                    headers_list = [
                        "HTTP/1.1 200 OK",
                        f"Content-Type: {ct}",
                        f"Content-Length: {len(file_data)}",
                        "Cache-Control: public, max-age=31536000, immutable",
                        "Connection: close",
                        "",
                        "",
                    ]
                    writer.write("\r\n".join(headers_list).encode("utf-8") + file_data)
                    await writer.drain()
                    writer.close()
                    return

            # ===== Theme API =====
            elif path == "/api/theme/templates" and method == "GET":
                resp = api_theme_list_templates()
            elif path == "/api/theme/save" and method == "POST":
                resp = api_theme_save(body)
            elif path == "/api/theme/load" and method == "GET":
                resp = api_theme_load(full_path)
            elif path == "/api/theme/delete" and method == "DELETE":
                resp = api_theme_delete(body)
            elif path == "/api/theme/export" and method == "GET":
                resp = api_theme_export()
            elif path == "/api/theme/import" and method == "POST":
                resp = api_theme_import(body)

            if resp is not None:
                status_code = 200
                if isinstance(resp, tuple):
                    resp, status_code = resp[0], resp[1]
                body_bytes = json.dumps(resp).encode("utf-8")
                headers = [
                    f"HTTP/1.1 {status_code} " + ("OK" if status_code == 200 else "Unauthorized" if status_code == 401 else "Error") + "",
                    "Content-Type: application/json; charset=utf-8",
                    f"Content-Length: {len(body_bytes)}",
                    "Connection: close",
                    "Access-Control-Allow-Origin: *",
                    "",
                    "",
                ]
                writer.write("\r\n".join(headers).encode("utf-8") + body_bytes)
                await writer.drain()
                writer.close()
                return

            # ===== Page rendering =====
            html = _render_index()
            body_bytes = html.encode("utf-8")
            headers = [
                "HTTP/1.1 200 OK",
                "Content-Type: text/html; charset=utf-8",
                f"Content-Length: {len(body_bytes)}",
                "Cache-Control: no-store, no-cache, must-revalidate",
                "Pragma: no-cache",
                "Expires: 0",
                "Connection: close",
                "",
                "",
            ]

            writer.write("\r\n".join(headers).encode("utf-8") + body_bytes)
            await writer.drain()
        except asyncio.TimeoutError:
            pass
        except Exception as e:
            logger.error(f"HTTP 处理错误：{e}")
        finally:
            try:
                writer.close()
            except Exception:
                pass

    # ===== REST API implementations =====

    def api_get_sessions():
        sessions = []
        agents_dir = Path(os.path.dirname(__file__)) / "agents"
        # Collect from all agent session databases (sessions/sessions.db)
        agent_dirs = [agents_dir / "default"]
        if agents_dir.exists():
            for d in agents_dir.iterdir():
                if d.is_dir() and d.name != "default" and (d / "sessions" / "sessions.db").exists():
                    agent_dirs.append(d)
        for agent_dir in agent_dirs:
            agent_name = agent_dir.name
            db_path = agent_dir / "sessions" / "sessions.db"
            if not db_path.exists():
                continue
            try:
                import sqlite3 as _sq
                conn = _sq.connect(str(db_path), check_same_thread=False)
                conn.row_factory = _sq.Row
                # Single query: JOIN messages to get count + last message per session (N+1 fix)
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT s.session_id, s.user_id, s.created_at, s.ended_at, s.title,
                           COUNT(m.message_id) as msg_count,
                           m_last.content as last_content,
                           m_last.timestamp as last_ts
                    FROM sessions s
                    LEFT JOIN messages m ON m.session_id = s.session_id
                    LEFT JOIN messages m_last ON m_last.message_id = (
                        SELECT message_id FROM messages
                        WHERE session_id = s.session_id
                        ORDER BY timestamp DESC LIMIT 1
                    )
                    GROUP BY s.session_id
                    HAVING msg_count > 0
                    ORDER BY s.created_at DESC
                    LIMIT ?
                """, (_SESSION_LIST_LIMIT,))
                for row in cursor.fetchall():
                    sessions.append({
                        "session_id": row["session_id"],
                        "user_id": row["user_id"],
                        "agent_name": agent_name,
                        "created_at": row["created_at"],
                        "updated_at": row["last_ts"] or row["created_at"],
                        "messages": row["msg_count"],
                        "active": row["ended_at"] is None,
                        "last_message": (row["last_content"][:80] if row["last_content"] else ""),
                        "title": row["title"] or "",
                    })
                conn.close()
            except Exception as e:
                logger.error(f"api_get_sessions: failed to read {db_path}: {e}")
        # Also collect from current agent's in-memory active sessions
        unsaved = getattr(agent.session_manager, '_unsaved_sessions', set())
        for sid, s in agent.session_manager.active_sessions.items():
            if sid in unsaved:
                continue
            msg_count = len(s.messages)
            if msg_count == 0:
                continue
            # Skip if already in DB results
            if any(ses["session_id"] == sid for ses in sessions):
                continue
            last_msg = s.messages[-1] if s.messages else None
            sessions.append({
                "session_id": sid,
                "user_id": s.user_id,
                "agent_name": agent.config.agent_name or agent.config.name or "default",
                "created_at": s.created_at,
                "updated_at": last_msg["timestamp"] if last else s.created_at,
                "messages": msg_count,
                "active": s.ended_at is None,
                "last_message": (last_msg["content"][:80] if last_msg and last_msg.get("content") else ""),
                "title": getattr(s, 'title', ''),
            })
        # Sort by updated_at descending
        sessions.sort(key=lambda s: s.get("updated_at", s["created_at"]), reverse=True)
        return {"sessions": sessions}

    def api_get_session_messages(sid):
        """Get messages for a specific session (latest 50 only).
        Searches across all agent session databases."""
        try:
            # Try in-memory first across all session managers
            for sm in _agent_session_managers.values():
                unsaved = getattr(sm, '_unsaved_sessions', set())
                if sid not in unsaved and sid in sm.active_sessions:
                    session = sm.active_sessions[sid]
                    messages = session.messages[-50:]
                    return _format_session_messages(sid, messages)

            # Load from DB across all agent directories
            agents_dir = PROJECT_ROOT / "agents"
            if agents_dir.exists():
                for agent_dir in agents_dir.iterdir():
                    if not agent_dir.is_dir():
                        continue
                    db_path = agent_dir / "sessions" / "sessions.db"
                    if not db_path.exists():
                        continue
                    import sqlite3 as _sq
                    conn = _sq.connect(str(db_path), check_same_thread=False)
                    conn.row_factory = _sq.Row
                    cursor = conn.cursor()
                    # Check if session exists in this db
                    cursor.execute("SELECT 1 FROM sessions WHERE session_id = ?", (sid,))
                    if cursor.fetchone():
                        cursor.execute(
                            "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 50",
                            (sid,)
                        )
                        messages = [dict(row) for row in cursor.fetchall()]
                        conn.close()
                        messages.reverse()
                        return _format_session_messages(sid, messages)
                    conn.close()

            return {"success": False, "error": "Session not found"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _format_session_messages(sid, messages):
        """Format messages for frontend (shared helper)."""
        result = []
        for m in messages:
            entry = {
                "role": m.get("role", m.get("message", {}).get("role", "unknown")),
                "content": m.get("content", m.get("message", {}).get("content", "")),
                "timestamp": m.get("timestamp", ""),
                "session_id": sid,
            }
            if isinstance(m.get("message"), dict):
                entry["role"] = m["message"].get("role", "unknown")
                entry["content"] = m["message"].get("content", "")
            raw_meta = m.get("meta", "{}")
            if isinstance(m.get("message"), dict):
                raw_meta = m["message"].get("meta", raw_meta)
            if raw_meta and raw_meta != "{}":
                try:
                    entry["meta"] = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
                except Exception:
                    pass
            result.append(entry)
        return {"success": True, "session_id": sid, "messages": result}

    def api_delete_session(sid):
        try:
            # Delete from all agent session databases
            agents_dir = Path(os.path.dirname(__file__)) / "agents"
            agent_dirs = [agents_dir / "default"]
            if agents_dir.exists():
                for d in agents_dir.iterdir():
                    if d.is_dir() and d.name != "default" and (d / "sessions" / "sessions.db").exists():
                        agent_dirs.append(d)
            import sqlite3 as _sq
            for agent_dir in agent_dirs:
                db_path = agent_dir / "sessions" / "sessions.db"
                if not db_path.exists():
                    continue
                agent_name = agent_dir.name
                sm = _agent_session_managers.get(agent_name)
                if sm and sm._db_connection:
                    try:
                        # Use the existing session manager's connection to avoid WAL conflicts
                        cursor = sm._db_connection.cursor()
                        cursor.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
                        cursor.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
                        sm._db_connection.commit()
                        logger.warning(f"api_delete_session: deleted session {sid} via {agent_name} session manager")
                        continue  # Successfully deleted, move to next agent
                    except Exception as e:
                        logger.error(f"api_delete_session: {agent_name} session manager delete failed: {e}")
                # Fallback: create a new connection
                try:
                    conn = _sq.connect(str(db_path), timeout=30, check_same_thread=False)
                    conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
                    conn.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
                    conn.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
                    conn.commit()
                    conn.close()
                    logger.warning(f"api_delete_session: deleted session {sid} via new connection to {db_path}")
                except Exception as e:
                    logger.error(f"api_delete_session: failed to delete from {db_path}: {e}")
            # Also remove from all in-memory active sessions
            for _name, _sm in _agent_session_managers.items():
                if sid in _sm.active_sessions:
                    del _sm.active_sessions[sid]
                    logger.info(f"api_delete_session: removed session {sid} from {_name} active_sessions")
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_rename_session(sid, body):
        try:
            title = (body or {}).get("title", "").strip()
            if not title:
                return {"success": False, "error": "标题不能为空"}
            # Find the session across all agent session managers
            sm = None
            for _name, _sm in _agent_session_managers.items():
                try:
                    cursor = _sm._db_connection.cursor()
                    cursor.execute("SELECT session_id FROM sessions WHERE session_id = ?", (sid,))
                    if cursor.fetchone():
                        sm = _sm
                        break
                except Exception:
                    continue
            if not sm:
                sm = agent.session_manager
            cursor = sm._db_connection.cursor()
            cursor.execute("UPDATE sessions SET title = ? WHERE session_id = ?", (title, sid))
            sm._db_connection.commit()
            return {"success": True, "title": title}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_save_response_dict(body):
        """Save the full response dict from dict modal to the message's meta column."""
        try:
            message_id = (body or {}).get("message_id", "").strip()
            response_dict = body.get("response_dict")
            if not message_id or not response_dict:
                return {"success": False, "error": "message_id and response_dict required"}
            # Find the message across all agent session DBs
            agents_dir = Path(os.path.dirname(__file__)) / "agents"
            agent_dirs = [agents_dir / "default"]
            if agents_dir.exists():
                for d in agents_dir.iterdir():
                    if d.is_dir() and d.name != "default" and (d / "sessions" / "sessions.db").exists():
                        agent_dirs.append(d)
            import sqlite3 as _sq
            for agent_dir in agent_dirs:
                db_path = agent_dir / "sessions" / "sessions.db"
                if not db_path.exists():
                    continue
                conn = _sq.connect(str(db_path), check_same_thread=False)
                cur = conn.cursor()
                cur.execute("SELECT meta FROM messages WHERE message_id = ?", (message_id,))
                row = cur.fetchone()
                if row:
                    # Merge response_dict into existing meta JSON
                    try:
                        meta = json.loads(row[0]) if row[0] else {}
                    except Exception:
                        meta = {}
                    meta["response_dict"] = response_dict
                    cur.execute("UPDATE messages SET meta = ? WHERE message_id = ?",
                                (json.dumps(meta, ensure_ascii=False, default=str), message_id))
                    conn.commit()
                    conn.close()
                    return {"success": True}
                conn.close()
            return {"success": False, "error": "message not found"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        try:
            for sid in list(agent.session_manager.active_sessions.keys()):
                asyncio.get_event_loop().create_task(agent.session_manager.end_session(sid))
            # Also clean up empty sessions and user-only sessions from DB
            try:
                cursor = agent.session_manager._db_connection.cursor()
                # Empty sessions
                cursor.execute(
                    "SELECT session_id FROM sessions WHERE session_id NOT IN (SELECT DISTINCT session_id FROM messages)"
                )
                empty_sids = [row["session_id"] for row in cursor.fetchall()]
                # Sessions with only user messages (no assistant reply)
                cursor.execute("""
                    SELECT s.session_id FROM sessions s
                    INNER JOIN messages m ON s.session_id = m.session_id
                    GROUP BY s.session_id
                    HAVING COUNT(m.message_id) >= 1
                       AND COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) = 0
                """)
                user_only_sids = [row["session_id"] for row in cursor.fetchall()]
                all_cleanup_sids = set(empty_sids + user_only_sids)
                for sid in all_cleanup_sids:
                    cursor.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
                    cursor.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
                if all_cleanup_sids:
                    agent.session_manager._db_connection.commit()
                    logger.info(f"从数据库清理了 {len(all_cleanup_sids)} 个无效会话")
            except Exception:
                pass
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_get_config():
        metrics = agent.metrics.get_summary()
        llm_client = agent.llm_client
        # Get models from global models.db
        _all_models = _models_db.get_models_flat()["models"]
        _gm_default = ""
        _default_model = _models_db.get_default_model()
        if _default_model:
            _gm_default = _default_model.get("model", "")
        # Determine effective default model
        _effective_default = agent.config.default_chat_model or _gm_default or (llm_client.model if llm_client else "")
        return {
            "provider": "longcat",
            "base_url": llm_client.base_url if llm_client else "",
            "model": llm_client.model if llm_client else "",
            "api_key": "****" if llm_client and llm_client.api_key else "",
            "llm_configured": llm_client is not None,
            "agent_name": agent.config.name,
            "max_tools": agent.config.max_concurrent_tools,
            "max_tool_rounds": agent.config.max_tool_rounds,
            "session_timeout": agent.config.session_timeout,
            "port": port,
            "log_level": agent.config.log_level,
            "uptime": time.time() - start_time,
            "metrics": metrics,
            "icon": agent.config.icon or "🎭",
            "avatar": agent.config.avatar or "",
            # New model reference fields
            "models": _all_models,
            "default_model": _effective_default,
            "available_models": agent.config.available_models or [],
            "default_chat_model": agent.config.default_chat_model or "",
            "default_vision_model": agent.config.default_vision_model or "",
            "default_tts_model": agent.config.default_tts_model or "",
            # System parameters (from settings.json)
            "system": {
                "ws_heartbeat_timeout": _WS_HEARTBEAT_TIMEOUT,
                "session_list_limit": _SESSION_LIST_LIMIT,
                "log_buffer_size": _LOG_BUFFER_MAX,
                "token_usage_max": _TOKEN_USAGE_MAX,
                "context_window_default": _CONTEXT_WINDOW_DEFAULT,
                "port": port,
                "log_level": agent.config.log_level,
            },
        }

    def api_update_config(body):
        try:
            # If model/base_url/api_key changed, rebuild LLMClient via configure_llm
            new_model = body.get("model", "")
            new_base_url = body.get("base_url", "")
            new_api_key = body.get("api_key", "")
            new_vision_base_url = body.get("vision_base_url", "")
            new_vision_model = body.get("vision_model", "")
            if new_model or new_base_url or new_api_key:
                # Merge with existing values for any not provided
                cur = agent.llm_client
                rebuild_model = new_model or (cur.model if cur else "")
                rebuild_base_url = new_base_url or (cur.base_url if cur else "")
                rebuild_api_key = new_api_key or (cur.api_key if cur else "")
                if rebuild_api_key:
                    vision_key = os.environ.get("SENSENOVA_API_KEY", "")
                    agent.configure_llm(
                        api_key=rebuild_api_key,
                        base_url=rebuild_base_url,
                        model=rebuild_model,
                        vision_api_key=vision_key,
                    )
                    logger.info(f"LLM 客户端已更新：模型={rebuild_model}, 地址={rebuild_base_url}")
                else:
                    logger.warning("配置更新：未提供 API Key，跳过 LLM 客户端重建")
            if "agent_name" in body and body["agent_name"]:
                agent.config.name = body["agent_name"]
            if "max_tools" in body:
                agent.config.max_concurrent_tools = int(body["max_tools"])
            if "max_tool_rounds" in body:
                agent.config.max_tool_rounds = int(body["max_tool_rounds"])
            if "session_timeout" in body:
                agent.config.session_timeout = int(body["session_timeout"])
            # Per-agent response limits
            if "llm_timeout" in body:
                agent.config.llm_timeout = int(body["llm_timeout"])
            if "llm_max_tokens" in body:
                agent.config.llm_max_tokens = int(body["llm_max_tokens"])
            if "llm_max_retries" in body:
                agent.config.llm_max_retries = int(body["llm_max_retries"])
            if "max_history_messages" in body:
                agent.config.max_history_messages = int(body["max_history_messages"])
            if "log_level" in body:
                agent.config.log_level = body["log_level"]
            if "icon" in body:
                agent.config.icon = body["icon"]
            if "avatar" in body:
                agent.config.avatar = body["avatar"]
            # System parameters — save to settings.json
            if "system" in body:
                _sys = body["system"]
                _sf = PROJECT_ROOT / "settings.json"
                try:
                    _cfg = json.loads(_sf.read_text(encoding="utf-8")) if _sf.exists() else {}
                    _cfg.setdefault("system", {})
                    for _k in ("ws_heartbeat_timeout", "session_list_limit", "log_buffer_size", "token_usage_max", "context_window_default"):
                        if _k in _sys:
                            _cfg["system"][_k] = int(_sys[_k])
                    for _k in ("port", "log_level"):
                        if _k in _sys:
                            _cfg["system"][_k] = _sys[_k]
                    _sf.write_text(json.dumps(_cfg, indent=2, ensure_ascii=False), encoding="utf-8")
                    # 同步更新模块级变量，确保 api_get_config() 返回最新值
                    global _WS_HEARTBEAT_TIMEOUT, _SESSION_LIST_LIMIT, _LOG_BUFFER_MAX, _TOKEN_USAGE_MAX, _CONTEXT_WINDOW_DEFAULT
                    if "ws_heartbeat_timeout" in _sys:
                        _WS_HEARTBEAT_TIMEOUT = int(_sys["ws_heartbeat_timeout"])
                    if "session_list_limit" in _sys:
                        _SESSION_LIST_LIMIT = int(_sys["session_list_limit"])
                    if "log_buffer_size" in _sys:
                        _LOG_BUFFER_MAX = int(_sys["log_buffer_size"])
                    if "token_usage_max" in _sys:
                        _TOKEN_USAGE_MAX = int(_sys["token_usage_max"])
                    if "context_window_default" in _sys:
                        _CONTEXT_WINDOW_DEFAULT = int(_sys["context_window_default"])
                    logger.info(f"系统参数已保存: {_cfg['system']}")
                except Exception as _e:
                    logger.warning(f"保存系统参数失败: _e")
            # New model reference fields
            if "available_models" in body:
                agent.config.available_models = body["available_models"]
            if "default_chat_model" in body:
                agent.config.default_chat_model = body["default_chat_model"]
            if "default_vision_model" in body:
                agent.config.default_vision_model = body["default_vision_model"]
            if "default_tts_model" in body:
                agent.config.default_tts_model = body["default_tts_model"]
            if "models" in body:
                # Save models to models.db (NOT config.json)
                _models_db.save_models_flat({"models": body["models"]})
            if "default_model" in body:
                agent.config.default_chat_model = body["default_model"]
            # Persist non-model settings to config.json (models go to models.db)
            try:
                from agents import save_agent_config_file
                persist_data = {}
                for key in ("name", "icon", "avatar", "max_tool_rounds",
                            "available_models", "default_chat_model",
                            "default_vision_model", "default_tts_model"):
                    if key in body:
                        persist_data[key] = body[key]
                # Also persist legacy fields for backward compat
                if "session_timeout" in body:
                    persist_data["session_timeout"] = body["session_timeout"]
                if "max_tools" in body:
                    persist_data["max_tools"] = body["max_tools"]
                if persist_data:
                    save_agent_config_file(agent.config.agent_name, persist_data)
                    logger.info(f"全局设置已保存到 config.json：{list(persist_data.keys())}")
            except Exception as e:
                logger.warning(f"保存 config.json 失败（仅内存生效）：{e}")
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_get_skills():
        """Get all skills with registry info and usage stats"""
        # 防御性确保 skills/ 目录存在（git 不跟踪此目录，首次部署时可能缺失）
        _skills_dir = PROJECT_ROOT / "skills"
        if not _skills_dir.exists():
            _skills_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"自动创建 skills/ 目录: {_skills_dir}")
        skills = []
        # New format: from skill_registry
        if agent.skill_registry:
            for name, entry in agent.skill_registry.skills.items():
                detailed_stats = agent.skill_feedback.get_detailed_stats(name) if agent.skill_feedback else {}
                skills.append({
                    "name": name,
                    "description": entry.description,
                    "version": entry.version,
                    "capabilities": entry.capabilities,
                    "source": entry.source,
                    "enabled": entry.enabled,
                    "active": name in agent.active_skills,
                    "path": entry.path,
                    "stats": {
                        "triggered": detailed_stats.get("total_triggers", 0),
                        "selected": detailed_stats.get("total_calls", 0),
                        "success": detailed_stats.get("total_success", 0),
                        "success_rate": (
                            detailed_stats.get("total_success", 0) / max(detailed_stats.get("total_calls", 1), 1)
                        ),
                        "effectiveness": detailed_stats.get("effectiveness", 0.5),
                        "avg_score": detailed_stats.get("avg_score", 0),
                        "avg_call_time": detailed_stats.get("avg_call_time", 0),
                    },
                })
        else:
            # Fallback to old format
            for name, skill in agent.active_skills.items():
                skills.append({
                    "name": name,
                    "description": getattr(skill, "description", ""),
                    "active": True,
                })
        return {"skills": skills}

    def api_skill_preview(body=None):
        """Preview pre-filter results for a given input (debug API)"""
        data = body or {}
        user_input = data.get("input", "")
        top_k = data.get("top_k", 10)
        if not user_input or not agent.skill_pre_filter:
            return {"matched": [], "error": "No input or pre-filter disabled"}
        try:
            matched, scores = agent.skill_pre_filter.pre_filter(
                user_input, top_k=top_k,
                skill_feedback=getattr(agent, 'skill_feedback', None),
            )
            return {
                "matched": [
                    {
                        "name": e.name,
                        "description": e.description,
                        "capabilities": e.capabilities,
                        "score": scores.get(e.name, 0),
                    }
                    for e in matched
                ],
                "total": len(matched),
            }
        except Exception as e:
            return {"matched": [], "error": str(e)}

    def api_skill_stats():
        """Get skill usage statistics (detailed)"""
        if not agent.skill_feedback:
            return {"stats": {}}
        all_stats = agent.skill_feedback.get_all_detailed_stats()
        return {"stats": all_stats}

    def api_get_agents():
        try:
            from agents import list_agents, get_agent_dir, load_agent_config_file
            available = list_agents()
            # Load global models for enriching agent available_models
            _all_global_models = _models_db.get_models_flat()["models"]
            result = []
            for name in available:
                agent_dir = get_agent_dir(name)
                soul_exists = (agent_dir / "soul.md").exists() if agent_dir else False
                config_exists = (agent_dir / "agent.md").exists() if agent_dir else False
                memory_exists = (agent_dir / "memory.md").exists() if agent_dir else False
                # Load per-agent config (icon, avatar, models, display name) from config.json
                cfg = load_agent_config_file(name) or {}
                # Expand available_models from name list to full model objects
                _agent_avail = cfg.get("available_models", [])
                _agent_avail_models = []
                if _agent_avail:
                    for mname in _agent_avail:
                        _gm = next((m for m in _all_global_models if m["name"] == mname), None)
                        if _gm:
                            _agent_avail_models.append(_gm)
                        # else: model no longer in global list — skip (was deleted)
                result.append({
                    "name": name,
                    "display_name": cfg.get("display_name") or cfg.get("name") or name,
                    "icon": cfg.get("icon", "🎭"),
                    "avatar": cfg.get("avatar", ""),
                    "has_soul": soul_exists,
                    "has_config": config_exists,
                    "has_memory": memory_exists,
                    "is_active": name == agent.config.agent_name,
                    # Legacy fields (for backward compat)
                    "models": cfg.get("models", []),
                    "default_model": cfg.get("default_model", ""),
                    # New model reference fields — available_models contains full objects
                    "available_models": _agent_avail_models,
                    "default_chat_model": cfg.get("default_chat_model", ""),
                    "default_vision_model": cfg.get("default_vision_model", ""),
                    "default_tts_model": cfg.get("default_tts_model", ""),
                    "appearance": cfg.get("appearance", {}),
                    "session_timeout": cfg.get("session_timeout", 3600),
                    "max_tools": cfg.get("max_tools", 300),
                    "max_tool_rounds": cfg.get("max_tool_rounds", 100),
                    "llm_timeout": cfg.get("llm_timeout", 120),
                    "llm_max_tokens": cfg.get("llm_max_tokens", 8192),
                    "llm_max_retries": cfg.get("llm_max_retries", 2),
                    "max_history_messages": cfg.get("max_history_messages", 50),
                    "skill_pre_filter_top_k": cfg.get("skill_pre_filter_top_k", 5),
                    "memory_integration": cfg.get("memory_integration", {}),
                })
            return {"agents": result, "active": agent.config.agent_name}
        except ImportError:
            return {"agents": [], "active": agent.config.agent_name, "error": "agents package not found"}

    def api_save_agent_meta(name, body):
        """Save per-agent config.json (icon, avatar, name, model refs, display settings, session_timeout, max_tools)."""
        try:
            from agents import get_agent_dir, save_agent_config_file
            agent_dir = get_agent_dir(name)
            if not agent_dir:
                return {"success": False, "error": "agent not found"}
            # Build the data to save (only known config keys)
            data = {}
            for key in ("name", "icon", "avatar", "models", "default_model",
                        "available_models", "default_chat_model", "default_vision_model", "default_tts_model",
                        "appearance", "session_timeout", "max_tools", "max_tool_rounds",
                        "llm_timeout", "llm_max_tokens", "llm_max_retries",
                        "max_history_messages", "skill_pre_filter_top_k", "memory_integration"):
                if key in body:
                    # memory_integration: merge with existing to preserve mode/position/template
                    if key == "memory_integration":
                        from agents import load_agent_config_file as _load_cfg
                        existing = _load_cfg(name) or {}
                        existing_mi = existing.get("memory_integration", {})
                        existing_mi.update(body[key])
                        data[key] = existing_mi
                    else:
                        data[key] = body[key]
            ok = save_agent_config_file(name, data)
            if not ok:
                return {"success": False, "error": "save failed"}
            # If this is the active agent, apply config changes to runtime
            if name == agent.config.agent_name:
                if "name" in body:
                    agent.config.name = body["name"]
                if "icon" in body:
                    agent.config.icon = body["icon"]
                if "avatar" in body:
                    agent.config.avatar = body["avatar"]
                # New model reference fields
                if "available_models" in body:
                    agent.config.available_models = body["available_models"]
                if "default_chat_model" in body:
                    agent.config.default_chat_model = body["default_chat_model"]
                if "default_vision_model" in body:
                    agent.config.default_vision_model = body["default_vision_model"]
                if "default_tts_model" in body:
                    agent.config.default_tts_model = body["default_tts_model"]
                # Per-agent response limits
                if "llm_timeout" in body:
                    agent.config.llm_timeout = int(body["llm_timeout"])
                if "llm_max_tokens" in body:
                    agent.config.llm_max_tokens = int(body["llm_max_tokens"])
                if "llm_max_retries" in body:
                    agent.config.llm_max_retries = int(body["llm_max_retries"])
                if "max_history_messages" in body:
                    agent.config.max_history_messages = int(body["max_history_messages"])
                # Legacy fields (backward compat)
                if "models" in body:
                    pass  # models are saved to models.db (SQLite)
                if "default_model" in body:
                    agent.config.default_chat_model = body["default_model"]
                # Rebuild LLMClient if model/base_url/api_key changed
                new_model = body.get("model", "")
                new_base_url = body.get("base_url", "")
                new_api_key = body.get("api_key", "")
                if new_model or new_base_url or new_api_key:
                    cur = agent.llm_client
                    rebuild_model = new_model or (cur.model if cur else "")
                    rebuild_base_url = new_base_url or (cur.base_url if cur else "")
                    rebuild_api_key = new_api_key or (cur.api_key if cur else "")
                    if rebuild_api_key:
                        vision_key = os.environ.get("SENSENOVA_API_KEY", "")
                        # Get vision config from request body or existing agent config
                        vbu = body.get("vision_base_url", "")
                        vm = body.get("vision_model", "")
                        if not vbu and agent.config.default_vision_model:
                            vbu = getattr(agent.llm_client, 'base_url', "") if agent.llm_client else ""
                        agent.configure_llm(
                            api_key=rebuild_api_key,
                            base_url=rebuild_base_url,
                            model=rebuild_model,
                            vision_api_key=vision_key,
                            vision_base_url=vbu,
                            vision_model=vm,
                        )
                        logger.info(f"LLM 客户端已更新（agent meta）：模型={rebuild_model}, 地址={rebuild_base_url}")
                    else:
                        logger.warning("Agent 配置更新：未提供 API Key，跳过 LLM 客户端重建")
                if "session_timeout" in body:
                    agent.config.session_timeout = int(body["session_timeout"])
                if "max_tools" in body:
                    agent.config.max_concurrent_tools = int(body["max_tools"])
                if "max_tool_rounds" in body:
                    agent.config.max_tool_rounds = int(body["max_tool_rounds"])
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_get_agent_soul(name):
        try:
            from agents import load_agent_soul, get_agent_dir
            agent_dir = get_agent_dir(name)
            if not agent_dir:
                return {"error": "agent not found", "soul": ""}
            soul = load_agent_soul(name)
            return {"name": name, "soul": soul}
        except ImportError:
            return {"error": "agents package not found", "soul": ""}

    def api_get_agent_config(name):
        try:
            from agents import get_agent_dir
            agent_dir = get_agent_dir(name)
            if not agent_dir:
                return {"error": "agent not found", "config": ""}
            # agent.md — 行为指令文件
            agent_md = agent_dir / "agent.md"
            if agent_md.exists():
                return {"name": name, "config": agent_md.read_text(encoding="utf-8")}
            return {"name": name, "config": ""}
        except ImportError:
            return {"error": "agents package not found", "config": ""}

    def api_get_agent_memory(name):
        try:
            from agents import load_agent_memory, get_agent_dir
            agent_dir = get_agent_dir(name)
            if not agent_dir:
                return {"error": "agent not found", "memory": ""}
            mem = load_agent_memory(name)
            return {"name": name, "memory": mem}
        except ImportError:
            return {"error": "agents package not found", "memory": ""}

    def api_save_agent_file(name, file_type, body):
        try:
            from agents import save_agent_file, get_agent_dir
            agent_dir = get_agent_dir(name)
            if not agent_dir:
                return {"success": False, "error": f"agent '{name}' not found"}
            content = body.get("content", "")
            # Reject empty content to prevent accidental data loss
            if not content or (isinstance(content, str) and content.strip() == ""):
                return {"success": False, "error": "content 不能为空"}
            ok = save_agent_file(name, file_type, content)
            if not ok:
                return {"success": False, "error": "save failed"}
            # Reload if this is the active agent
            if name == agent.config.agent_name:
                if file_type == "soul":
                    agent._soul_content = content
                elif file_type == "config":
                    agent._agent_config_content = content
                # memory.md is not loaded into agent runtime, no reload needed
            logger.info(f"已保存 Agent '{name}' 的 {file_type} 文件")
            return {"success": True}
        except Exception as e:
            logger.error(f"保存 Agent 文件错误：{e}")
            return {"success": False, "error": str(e)}

    def api_switch_agent(body):
        global agent
        try:
            action = body.get("action", "")
            if action != "switch":
                return {"success": False, "error": "unknown action: " + action}
            target = body.get("agent", "")
            if not target:
                return {"success": False, "error": "missing agent name"}
            from agents import get_agent_dir, load_agent_soul, load_agent_config
            agent_dir = get_agent_dir(target)
            if not agent_dir:
                return {"success": False, "error": f"agent '{target}' not found or has no soul.md"}
            # Reload soul and config for new agent
            soul = load_agent_soul(target)
            cfg = load_agent_config(target)
            agent.config.agent_name = target
            agent._soul_content = soul or ""
            agent._agent_config_content = cfg or ""
            # Load per-agent config (icon, avatar, models, display name) from config.json
            agent_cfg = load_agent_config_file(target)
            if agent_cfg:
                if agent_cfg.get("name"):
                    agent.config.name = agent_cfg["name"]
                if agent_cfg.get("icon"):
                    agent.config.icon = agent_cfg["icon"]
                if agent_cfg.get("avatar"):
                    agent.config.avatar = agent_cfg["avatar"]
                if agent_cfg.get("models"):
                    # Legacy: migrate to available_models
                    agent.config.available_models = [m.get("name", m.get("id", "")) for m in agent_cfg["models"]]
                if agent_cfg.get("default_model"):
                    agent.config.default_chat_model = agent_cfg["default_model"]
                    # Update LLM client if model config available
                    for m in (agent_cfg.get("models") or []):
                        if m.get("name") == agent_cfg["default_model"]:
                            if agent.llm_client:
                                agent.llm_client.model = m.get("name", agent.llm_client.model)
                                agent.llm_client.base_url = m.get("base_url", agent.llm_client.base_url)
                                agent.llm_client.api_key = m.get("api_key", agent.llm_client.api_key)
                            break
                # New fields
                if agent_cfg.get("available_models"):
                    agent.config.available_models = agent_cfg["available_models"]
                if agent_cfg.get("default_chat_model"):
                    agent.config.default_chat_model = agent_cfg["default_chat_model"]
                if agent_cfg.get("default_vision_model"):
                    agent.config.default_vision_model = agent_cfg["default_vision_model"]
                if agent_cfg.get("default_tts_model"):
                    agent.config.default_tts_model = agent_cfg["default_tts_model"]
            logger.info(f"已切换 Agent 为：{target}")
            return {"success": True, "agent": target}
        except Exception as e:
            logger.error(f"切换 Agent 错误：{e}")
            return {"success": False, "error": str(e)}

    def api_create_agent(body):
        """Create a new agent with default files (soul.md, agent.md, config.json, avatar)."""
        try:
            name = (body.get("name") or "").strip()
            if not name:
                return {"success": False, "error": "agent name is required"}
            # Name validation: alphanumeric + underscore + hyphen only
            import re as _re
            if not _re.match(r'^[a-zA-Z0-9_\-]+$', name):
                return {"success": False, "error": "name must be alphanumeric/underscore/hyphen"}
            from agents import list_agents, get_agent_dir, save_agent_config_file, ensure_agent_avatar
            if name in list_agents():
                return {"success": False, "error": f"agent '{name}' already exists"}
            agent_dir = get_agent_dir(name)
            agent_dir.mkdir(parents=True, exist_ok=True)
            # Create standard subdirectories (sessions, memory) for unified structure
            (agent_dir / "sessions").mkdir(exist_ok=True)
            (agent_dir / "memory").mkdir(exist_ok=True)
            # Initialize per-agent databases with unified schema
            from agents import init_agent_db
            init_agent_db(name)
            # Create default soul.md
            soul_path = agent_dir / "soul.md"
            if not soul_path.exists():
                soul_path.write_text(f"# {name}\n\nYou are {name}, an AI assistant.\n", encoding="utf-8")
            # Create default agent.md
            agent_md_path = agent_dir / "agent.md"
            if not agent_md_path.exists():
                agent_md_path.write_text(f"# {name} Configuration\n\n", encoding="utf-8")
            # Create config.json
            cfg = {
                "name": body.get("display_name") or name,
                "icon": body.get("icon") or "🎭",
                "default_chat_model": "",
                "available_models": [],
            }
            save_agent_config_file(name, cfg)
            # Ensure avatar
            try:
                ensure_agent_avatar(name)
            except Exception:
                pass
            logger.info(f"Created agent: {name}")
            return {"success": True, "agent": name}
        except Exception as e:
            logger.error(f"api_create_agent error: {e}")
            return {"success": False, "error": str(e)}

    def api_delete_agent(name):
        """Delete an agent directory entirely. Refuses if it's the active agent."""
        try:
            from agents import list_agents, get_agent_dir
            if name not in list_agents():
                return {"success": False, "error": f"agent '{name}' not found"}
            if agent.config.agent_name == name:
                return {"success": False, "error": "cannot delete active agent, switch first"}
            import shutil as _shutil
            agent_dir = get_agent_dir(name)
            if agent_dir.exists():
                _shutil.rmtree(str(agent_dir))
            logger.info(f"Deleted agent: {name}")
            return {"success": True}
        except Exception as e:
            logger.error(f"api_delete_agent error: {e}")
            return {"success": False, "error": str(e)}

    def api_rename_agent(name, body):
        """Rename an agent directory (folder rename only, no config writes)."""
        try:
            from agents import list_agents, get_agent_dir
            new_name = (body.get("new_name") or "").strip()
            if not new_name:
                return {"success": False, "error": "new_name is required"}
            import re as _re
            if not _re.match(r'^[a-zA-Z0-9_\-]+$', new_name):
                return {"success": False, "error": "new_name must be alphanumeric/underscore/hyphen"}
            if name not in list_agents():
                return {"success": False, "error": f"agent '{name}' not found"}
            if new_name in list_agents():
                return {"success": False, "error": f"agent '{new_name}' already exists"}
            import shutil as _shutil
            old_dir = get_agent_dir(name)
            new_dir = get_agent_dir(new_name)
            if old_dir.exists():
                _shutil.move(str(old_dir), str(new_dir))
            logger.info(f"Renamed agent: {name} -> {new_name}")
            return {"success": True, "old_name": name, "new_name": new_name}
        except Exception as e:
            logger.error(f"api_rename_agent error: {e}")
            return {"success": False, "error": str(e)}

    def api_get_status():
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, agent.get_status())
                status = future.result(timeout=5)
        else:
            status = asyncio.run(agent.get_status())
        return {
            "agent": status,
            "uptime": time.time() - start_time,
            "port": port,
            "ws_port": ws_port,
        }

    # ===== Theme API Implementations =====

    def _themes_dir():
        d = Path.home() / ".siper" / "data" / "themes"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def api_theme_list_templates():
        themes_dir = _themes_dir()
        templates = []
        for f in sorted(themes_dir.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                vars_count = len(data.get("vars", {}))
                templates.append({
                    "name": data.get("name", f.stem),
                    "created_at": data.get("created_at", ""),
                    "vars_count": vars_count,
                })
            except Exception:
                pass
        return {"templates": templates}

    def api_theme_save(body):
        try:
            name = body.get("name", "").strip()
            if not name:
                return {"success": False, "error": "模板名称不能为空"}
            vars_obj = body.get("vars", {})
            sizes_obj = body.get("sizes", {})
            themes_dir = _themes_dir()
            safe_name = _re.sub(r'[^\w\-.]', '_', name)
            fpath = themes_dir / f"{safe_name}.json"
            record = {
                "name": name,
                "vars": vars_obj,
                "sizes": sizes_obj,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            fpath.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            logger.info(f"主题已保存：{name} ({fpath})")
            return {"success": True, "name": name}
        except Exception as e:
            logger.error(f"主题保存错误：{e}")
            return {"success": False, "error": str(e)}

    def api_theme_load(full_path):
        try:
            from urllib.parse import urlparse, parse_qs
            query = parse_qs(urlparse(full_path).query) if "?" in full_path else {}
            name = query.get("name", [""])[0].strip()
            if not name:
                return {"success": False, "error": "缺少 name 参数"}
            themes_dir = _themes_dir()
            safe_name = _re.sub(r'[^\w\-.]', '_', name)
            fpath = themes_dir / f"{safe_name}.json"
            if not fpath.exists():
                return {"success": False, "error": f"模板 '{name}' 不存在"}
            data = json.loads(fpath.read_text(encoding="utf-8"))
            return {"success": True, "data": data}
        except Exception as e:
            logger.error(f"主题加载错误：{e}")
            return {"success": False, "error": str(e)}

    def api_theme_delete(body):
        try:
            name = body.get("name", "").strip()
            if not name:
                return {"success": False, "error": "缺少 name 参数"}
            themes_dir = _themes_dir()
            safe_name = _re.sub(r'[^\w\-.]', '_', name)
            fpath = themes_dir / f"{safe_name}.json"
            if not fpath.exists():
                return {"success": False, "error": f"模板 '{name}' 不存在"}
            fpath.unlink()
            logger.info(f"主题已删除：{name}")
            return {"success": True}
        except Exception as e:
            logger.error(f"主题删除错误：{e}")
            return {"success": False, "error": str(e)}

    def api_theme_export():
        """Export current runtime config as theme data (default CSS vars placeholder)."""
        # Return empty defaults - frontend fills in current live values
        return {"vars": {}, "sizes": {}}

    def api_theme_import(body):
        """Import theme data by saving it as a new template (same as save)."""
        return api_theme_save(body)

    # ===== Logs API =====

    def _memory_dir(agent_name="default"):
        d = Path.home() / ".siper" / "agents" / agent_name / "memory"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def api_get_memory(agent_name="default"):
        mem_dir = _memory_dir(agent_name)
        result = {}
        for f in sorted(mem_dir.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                result[f.stem] = data
            except Exception:
                pass
        return {"memories": result, "count": len(result), "agent": agent_name}

    def api_write_memory(body, agent_name="default"):
        key = body.get("key", "").strip()
        value = body.get("value", "")
        target = body.get("target", "memory")
        if not key:
            return {"success": False, "error": "missing 'key'"}
        mem_dir = _memory_dir(agent_name)
        fpath = mem_dir / f"{target}.json"
        data = {}
        if fpath.exists():
            try:
                data = json.loads(fpath.read_text(encoding="utf-8"))
            except Exception:
                pass
        data[key] = value
        fpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"success": True, "key": key, "target": target, "agent": agent_name}

    def api_delete_memory(body, agent_name="default"):
        key = body.get("key", "").strip()
        target = body.get("target", "memory")
        mem_dir = _memory_dir(agent_name)
        fpath = mem_dir / f"{target}.json"
        if not fpath.exists():
            return {"success": False, "error": f"memory file '{target}' not found"}
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
        except Exception as e:
            return {"success": False, "error": str(e)}
        if key:
            if key in data:
                del data[key]
                fpath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                return {"success": True, "key": key, "action": "deleted"}
            return {"success": False, "error": f"key '{key}' not found"}
        else:
            fpath.unlink()
            return {"success": True, "target": target, "action": "cleared"}

    # ===== Memory Config API =====

    def _memory_config_path(agent_name="default"):
        d = Path.home() / ".siper" / "agents" / agent_name / "memory"
        d.mkdir(parents=True, exist_ok=True)
        return d / "config.json"

    def api_get_memory_config(agent_name="default"):
        p = _memory_config_path(agent_name)
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {"mode": "append", "position": "after_system", "max_tokens": 2000, "template": ""}

    def api_save_memory_config(body, agent_name="default"):
        p = _memory_config_path(agent_name)
        data = {}
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass
        for key in ("mode", "position", "max_tokens", "template"):
            if key in body:
                data[key] = body[key]
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"success": True}

    def _sync_models_to_agent_configs(models_data):
        """Sync models data to all agent config.json files.
        Accepts both flat format (from SQLite) and v2 provider format (legacy).
        """
        agents_dir = PROJECT_ROOT / "agents"
        if not agents_dir.exists():
            return
        # Build set of valid global model names (handle both formats)
        _global_names = set()
        if "providers" in models_data:
            for _pn, _pv in models_data.get("providers", {}).items():
                for _m in _pv.get("models", []):
                    _global_names.add(_m.get("name", "") or _m.get("id", ""))
        for _m in models_data.get("models", []):
            _global_names.add(_m.get("name", "") or _m.get("id", ""))
        for agent_name_dir in agents_dir.iterdir():
            if not agent_name_dir.is_dir() or agent_name_dir.name.startswith("_") or agent_name_dir.name == "__pycache__":
                continue
            cfg_path = agent_name_dir / "config.json"
            cfg = {}
            if cfg_path.exists():
                try:
                    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
                except Exception:
                    pass
            cfg["providers"] = models_data.get("providers", {})
            cfg["default_model"] = models_data.get("default_model", "")
            _old_avail = cfg.get("available_models", [])
            if _old_avail:
                _pruned = [n for n in _old_avail if n in _global_names]
                if len(_pruned) != len(_old_avail):
                    logger.info(f"Agent {agent_name_dir.name}: 清理可用模型 {len(_old_avail)} → {len(_pruned)}")
                cfg["available_models"] = _pruned
            _def = cfg.get("default_chat_model", "")
            if _def and _def not in _global_names and _global_names:
                cfg["default_chat_model"] = ""
                logger.info(f"Agent {agent_name_dir.name}: 默认模型 '{_def}' 已删除，已重置")
            cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
            logger.info(f"已同步模型配置到 {cfg_path}")


    # ===== Global Models API =====

    def api_save_global_models(body):
        # 写入 SQLite（内部保留 de-mask 逻辑）
        _models_db.save_models_flat(body)
        logger.info(f"模型配置已保存到 models.db")
        # Sync to all agent config.json files so api/config GET returns updated data
        try:
            _flat = _models_db.get_models_flat()
            _sync_models_to_agent_configs(_flat)
        except Exception as e:
            logger.warning(f"同步模型到 agent config 失败: {e}")
        return {"success": True, "version": 2}

    def api_delete_model(path, req_headers):
        # DELETE /api/models/{model}?provider=xxx
        # path 可能是完整路径（旧版路由）或 model_id（新版路由 router.py）
        from urllib.parse import urlparse, parse_qs, unquote
        model = path
        provider_str = ""
        if isinstance(path, str) and "/api/models/" in path:
            # 旧版：path 是完整 URL 如 /api/models/LongCat-2.0-Preview?provider=1
            parsed = urlparse(path)
            model = unquote(parsed.path[len("/api/models/"):])
            params = parse_qs(parsed.query)
            provider_str = unquote(params.get("provider", [None])[0] or "")
        elif isinstance(path, str):
            # 新版（router.py 已提取 model_id）
            model = unquote(path)
        if not model:
            return {"success": False, "error": "model 不能为空"}
        try:
            # Find provider if not given
            if not provider_str:
                rows = _models_db.get_all_models()
                for row in rows:
                    if row["model"] == model:
                        provider_str = str(row["provider_id"])
                        break
            if not provider_str:
                return {"success": False, "error": "模型不存在"}
            provider_id = int(provider_str)
            ok = _models_db.delete_model(model, provider_id)
            if ok:
                # Sync to agent configs
                try:
                    _flat = _models_db.get_models_flat()
                    _sync_models_to_agent_configs(_flat)
                except Exception:
                    pass
                return {"success": True}
            return {"success": False, "error": "模型不存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_reset_models():
        """删除 models.db 并重建，清空内存缓存，同步清理 agent 配置"""
        import os as _os
        db_path = str(PROJECT_ROOT / "models.db")
        # 1. 删除数据库文件
        if _os.path.exists(db_path):
            _os.remove(db_path)
            logger.info(f"已删除 {db_path}")
        # 2. 重建空数据库（ModelsDB.__init__ 自动建表）
        nonlocal _models_db
        from ai_agent.models_db import ModelsDB as _ModelsDB
        _models_db = _ModelsDB(db_path)
        # 3. 清空内存变量
        nonlocal _gm_models, _gm_default, _cfg_key_default
        _gm_models = []
        _gm_default = ""
        _cfg_key_default = ""
        # 4. 同步清理 agent config.json
        _sync_models_to_agent_configs({"version": 3, "models": []})
        logger.info("模型数据库已重置，agent 配置已清理")
        return {"success": True}

    def api_get_global_models():
        # 从 SQLite 返回，保留 _mask_key 逻辑
        flat = _models_db.get_models_flat()
        for m in flat.get("models", []):
            m["api_key"] = _mask_key(m.get("api_key", ""))
        return flat

    def api_rename_provider(body):
        old_id = (body.get("old_id") or "").strip()
        new_id = (body.get("new_id") or "").strip()
        if not old_id or not new_id:
            return {"success": False, "error": "old_id 和 new_id 不能为空"}
        if old_id == new_id:
            return {"success": True, "changed": False}
        try:
            ok = _models_db.rename_provider(old_id, new_id)
            if ok:
                return {"success": True, "changed": True}
            else:
                return {"success": False, "error": "Provider 不存在或新名称已存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_update_provider_name(body):
        base_url = (body.get("base_url") or "").strip()
        provider = (body.get("provider") or "").strip()
        provider_alias = (body.get("provider_alias") or "").strip()
        if not base_url:
            return {"success": False, "error": "base_url 不能为空"}
        try:
            ok = _models_db.update_provider_name(base_url, provider, provider_alias)
            if ok:
                return {"success": True}
            return {"success": False, "error": "Provider 不存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_create_provider(body):
        base_url = (body.get("base_url") or "").strip()
        api_key = body.get("api_key", "")
        provider = (body.get("provider") or "").strip()
        provider_alias = (body.get("provider_alias") or "").strip()
        if not base_url:
            return {"success": False, "error": "base_url 不能为空"}
        try:
            pid = _models_db.upsert_provider(base_url, api_key, provider, provider_alias)
            return {"success": True, "provider_id": pid}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ===== Model Discovery API =====

    def _detect_provider(base_url):
        """Detect provider name from base URL."""
        if not base_url:
            return "custom"
        url = base_url.lower()
        providers = [
            ("openai.com", "openai"),
            ("anthropic", "anthropic"),
            ("deepseek", "deepseek"),
            ("moonshot", "moonshot"), ("kimi", "moonshot"),
            ("dashscope", "qwen"), ("qwen", "qwen"),
            ("longcat", "longcat"),
            ("sensenova", "sensenova"),
            ("zhipuai", "zhipuai"), ("glm", "zhipuai"),
            ("minimax", "minimax"),
            ("baichuan", "baichuan"),
            ("groq", "groq"),
            ("together", "together"),
            ("fireworks", "fireworks"),
            ("perplexity", "perplexity"),
            ("openrouter", "openrouter"),
            ("localhost", "local"), ("127.0.0.1", "local"),
        ]
        for pattern, name in providers:
            if pattern in url:
                return name
        return "custom"

    def _estimate_context_window(model):
        """Estimate context window (tokens) from model name."""
        if not model:
            return 8192
        mid = model.lower()
        # GPT-4o / GPT-4 Turbo
        if "gpt-4o" in mid:
            return 128000
        if "gpt-4-turbo" in mid or "gpt-4-1106" in mid or "gpt-4-0125" in mid:
            return 128000
        if "gpt-4" in mid:
            return 8192
        if "gpt-3.5" in mid:
            return 16384
        # Claude 3.x
        if "claude-3" in mid or "claude-3.5" in mid:
            return 200000
        # Gemini
        if "gemini-1.5" in mid or "gemini-2" in mid:
            return 1000000
        if "gemini" in mid:
            return 32768
        # DeepSeek
        if "deepseek" in mid:
            return 65536
        # Qwen
        if "qwen" in mid:
            return 32768
        # LongCat
        if "longcat" in mid:
            return 1000000
        # Mistral / Mixtral
        if "mixtral" in mid or "mistral" in mid:
            return 32768
        # Llama
        if "llama-3" in mid:
            return 8192
        if "llama-2" in mid:
            return 4096
        return 8192  # safe default

    def api_discover_models(body):
        """Fetch available models from a provider.
        Body: { "base_url": "...", "api_key": "..." }
        Returns: { "success": true, "models": [...], "provider": "...", "count": N }
        """
        import urllib.request as _urllib_request
        import ssl as _ssl
        base_url = (body.get("base_url") or "").rstrip("/")
        api_key = body.get("api_key", "")
        if not base_url:
            return {"success": False, "error": "Base URL 不能为空"}
        # Build models endpoint URL
        if base_url.endswith("/v1"):
            models_url = base_url + "/models"
        else:
            models_url = base_url + "/v1/models"
        try:
            req = _urllib_request.Request(
                models_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                method="GET",
            )
            ctx = _ssl.create_default_context()
            # 仅对本地/内网地址禁用 SSL 验证
            if base_url.startswith(('http://', 'https://localhost', 'https://127.0.0.1', 'https://10.', 'https://192.168.', 'https://172.')):
                ctx.check_hostname = False
                ctx.verify_mode = _ssl.CERT_NONE
            resp = _urllib_request.urlopen(req, timeout=10, context=ctx)
            raw = json.loads(resp.read().decode("utf-8"))
            raw_models = raw.get("data") or raw.get("models") or (raw if isinstance(raw, list) else [])
            provider = _detect_provider(base_url)
            models_list = []
            for m in raw_models:
                mid = m.get("id", m.get("name", ""))
                if not mid:
                    continue

                # --- Extract capabilities from API response ---
                caps = []

                # 1. OpenAI-style: model.detail.capabilities or model.capabilities
                #    e.g. {"capabilities": {"text": true, "image": true, "tool_call": true}}
                m_caps = m.get("capabilities", {})
                if isinstance(m_caps, dict):
                    cap_map = {
                        "vision": ["image", "vision", "multimodal", "image_input"],
                        "reasoning": ["reasoning", "chain_of_thought", "cot"],
                        "code": ["code", "coding", "code_interpreter"],
                        "function_calling": ["tool_call", "function_calling", "tools", "function_call"],
                        "embedding": ["embedding", "embeddings"],
                        "image_gen": ["image_generation", "image_gen", "dall_e", "dalle"],
                        "tts": ["tts", "text_to_speech", "audio", "speech"],
                    }
                    for cap_key, match_words in cap_map.items():
                        if any(m_caps.get(w) for w in match_words):
                            caps.append(cap_key)

                # 2. Ollama-style: model details fields
                #    e.g. {"details": {"family": "llama", "capabilities": ["vision"]}}
                m_details = m.get("details", {})
                if isinstance(m_details, dict):
                    detail_caps = m_details.get("capabilities", [])
                    if isinstance(detail_caps, list):
                        detail_cap_map = {
                            "vision": ["vision", "image", "multimodal", "clip"],
                            "reasoning": ["reasoning", "cot"],
                            "code": ["code", "coding"],
                            "function_calling": ["tools", "function_calling", "tool_call"],
                            "embedding": ["embedding"],
                            "image_gen": ["image_gen", "image_generation"],
                        }
                        for cap_key, match_words in detail_cap_map.items():
                            if any(dc in match_words for dc in detail_caps):
                                if cap_key not in caps:
                                    caps.append(cap_key)

                # 3. OpenRouter-style: model object has modality or architecture
                #    e.g. {"architecture": {"modality": "text+image->text", "instruct_type": "none"}}
                m_arch = m.get("architecture", {})
                if isinstance(m_arch, dict):
                    modality = m_arch.get("modality", "")
                    if isinstance(modality, str):
                        mod_lower = modality.lower()
                        if "image" in mod_lower and "vision" not in caps:
                            caps.append("vision")
                        if "embedding" in mod_lower and "embedding" not in caps:
                            caps.append("embedding")
                        # Note: "audio" in modality usually means audio INPUT (ASR), not TTS output

                # 4. SenseNova-style: model_type / task_type / tasks fields
                #    e.g. {"model_type": "tts"} / {"tasks": ["chat", "tts", "vision"]}
                model_type = m.get("model_type") or m.get("task_type") or m.get("type", "")
                if isinstance(model_type, str):
                    mt_lower = model_type.lower()
                    type_map = {
                        "vision": ["vision", "image", "multimodal", "vl"],
                        "tts": ["tts", "text_to_speech"],  # TTS output, not audio input
                        "embedding": ["embedding", "embed"],
                        "image_gen": ["image_gen", "image_generation", "text2image", "t2i"],
                        "code": ["code", "coding"],
                        "reasoning": ["reasoning", "cot"],
                    }
                    for cap_key, keywords in type_map.items():
                        if any(kw in mt_lower for kw in keywords) and cap_key not in caps:
                            caps.append(cap_key)
                tasks = m.get("tasks") or m.get("capabilities_list") or m.get("support_tasks", [])
                if isinstance(tasks, list):
                    task_map = {
                        "vision": ["vision", "image", "multimodal", "vl", "image_understanding"],
                        "tts": ["tts", "text_to_speech"],  # TTS output, not audio input
                        "embedding": ["embedding", "embed", "text_embedding"],
                        "image_gen": ["image_gen", "image_generation", "text2image", "t2i", "image_create"],
                        "code": ["code", "coding", "code_generation"],
                        "reasoning": ["reasoning", "cot", "chain_of_thought"],
                        "function_calling": ["function_calling", "tool_call", "tools", "function_call"],
                        "chat": ["chat", "text", "conversation"],
                    }
                    for cap_key, keywords in task_map.items():
                        if any(t.lower() in keywords for t in tasks if isinstance(t, str)) and cap_key not in caps:
                            caps.append(cap_key)

                # 5. Context length from API response (prefer over name-based estimate)
                ctx_window = m.get("context_length") or m.get("max_context_length") or m.get("context_window")
                if not ctx_window:
                    ctx_window = _estimate_context_window(mid)

                # If API gave no capabilities, default to chat
                if not caps:
                    caps.append("chat")

                models_list.append({
                    "id": mid,
                    "name": mid,
                    "alias": "",
                    "provider": provider,
                    "provider_alias": "",
                    "base_url": base_url,
                    "api_key": api_key,
                    "context_window": ctx_window,
                    "capabilities": caps,
                    "discovered_at": int(time.time()),
                })
            return {
                "success": True,
                "models": models_list,
                "provider": provider,
                "count": len(models_list),
                "url": models_url,
            }
        except Exception as e:
            logger.warning(f"模型发现失败: {models_url} — {e}")
            return {"success": False, "error": str(e), "url": models_url}

    # ===== Model Test API =====

    async def api_test_model(body):
        """Send a test message to verify a model is working and detect capabilities.
        Body: { "base_url": "...", "model": "...", "api_key": "..." }
        Returns: { "success": true/false, "response": "...", "latency_ms": N, "error": "...",
                   "capabilities": ["vision", "function_calling", ...] }
        """
        import urllib.request as _urllib_request
        import ssl as _ssl
        base_url = (body.get("base_url") or "").rstrip("/")
        api_key = body.get("api_key", "")
        model = body.get("model", "")
        provider_id = body.get("provider_id", 0)
        if not base_url or not model:
            return {"success": False, "error": "base_url 和 model 不能为空"}
        # If api_key is masked (from frontend /api/models/global), look up real key from models.db
        if api_key.startswith("*") or not api_key:
            try:
                _db_model = _models_db.get_model(model, int(provider_id) if provider_id else 0)
                if _db_model:
                    _new_key = _db_model.get("prov_api_key", "") or ""
                    if _new_key and not _new_key.startswith("*"):
                        api_key = _new_key
                    if not base_url:
                        base_url = _db_model.get("prov_base_url", "") or ""
            except Exception:
                pass
        if not api_key or api_key.startswith("*"):
            return {"success": False, "error": "无法获取模型 API key，请在 Web UI 配置页面设置"}
        if base_url.endswith("/v1"):
            chat_url = base_url + "/chat/completions"
        else:
            chat_url = base_url + "/v1/chat/completions"

        def _do_test():
            ctx = _ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = _ssl.CERT_NONE

            def _post(payload_dict, timeout=15):
                payload = json.dumps(payload_dict).encode("utf-8")
                req = _urllib_request.Request(
                    chat_url,
                    data=payload,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                resp = _urllib_request.urlopen(req, timeout=timeout, context=ctx)
                return json.loads(resp.read().decode("utf-8"))

            def _post_stream(payload_dict, timeout=15):
                """Streaming POST, returns (ttft_ms, full_text, usage_dict, total_ms)."""
                payload = json.dumps({**payload_dict, "stream": True}).encode("utf-8")
                req = _urllib_request.Request(
                    chat_url,
                    data=payload,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                t0 = time.time()
                resp = _urllib_request.urlopen(req, timeout=timeout, context=ctx)
                first_content_t = None
                full_text = ""
                usage = {}
                buf = b""
                while True:
                    chunk = resp.read(1024)
                    if not chunk:
                        break
                    buf += chunk
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        line_s = line.decode("utf-8", errors="replace").strip()
                        if not line_s or not line_s.startswith("data:"):
                            continue
                        data_s = line_s[5:].strip()
                        if data_s == "[DONE]" or data_s.endswith("[DONE]"):
                            break
                        try:
                            obj = json.loads(data_s)
                            delta = (obj.get("choices") or [{}])[0].get("delta") or {}
                            content = delta.get("content")
                            if content:
                                if first_content_t is None:
                                    first_content_t = time.time()
                                full_text += content
                            if obj.get("lastOne") and obj.get("usage"):
                                usage = obj["usage"]
                            elif obj.get("usage"):
                                usage = obj["usage"]
                        except (json.JSONDecodeError, IndexError):
                            pass
                ttft = round((first_content_t - t0) * 1000) if first_content_t else None
                total_ms = round((time.time() - t0) * 1000)
                return ttft, full_text, usage, total_ms

            def _extract_message_content(msg_dict):
                content = (msg_dict.get("content") or "").strip()
                reasoning = (msg_dict.get("reasoning") or "").strip()
                if content and reasoning:
                    return content + "\n" + reasoning
                return content or reasoning

            detected_caps = []

            # ===== Step 0: try to get model info from /models endpoint =====
            try:
                models_url = base_url + "/models" if not base_url.endswith("/v1") else base_url.replace("/v1", "") + "/models"
                req = _urllib_request.Request(
                    models_url,
                    headers={"Authorization": f"Bearer {api_key}"},
                    method="GET",
                )
                resp = _urllib_request.urlopen(req, timeout=3, context=ctx)
                models_data = json.loads(resp.read().decode("utf-8"))
                for m in (models_data.get("data") or []):
                    mid = m.get("id", "")
                    if mid == model:
                        m_caps = m.get("capabilities", {})
                        if isinstance(m_caps, dict):
                            if any(m_caps.get(k) for k in ("image", "vision", "multimodal", "image_input")):
                                detected_caps.append("vision")
                            if any(m_caps.get(k) for k in ("reasoning", "chain_of_thought", "cot")):
                                detected_caps.append("reasoning")
                            if any(m_caps.get(k) for k in ("code", "coding", "code_interpreter")):
                                detected_caps.append("code")
                            if any(m_caps.get(k) for k in ("tool_call", "function_calling", "tools")):
                                detected_caps.append("function_calling")
                        arch = m.get("architecture", {})
                        if isinstance(arch, dict):
                            modality = (arch.get("modality") or "").lower()
                            if "image" in modality and "vision" not in detected_caps:
                                detected_caps.append("vision")
                        break
            except Exception:
                pass

            # ===== Step 1: connectivity + TTFT + streaming test =====
            t0 = time.time()
            ttft_ms = None
            streaming_ok = False
            content = ""
            try:
                ttft_ms, content_s, _usage_s, _total = _post_stream({
                    "model": model,
                    "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                    "max_tokens": 5,
                    "temperature": 0,
                })
                streaming_ok = bool(content_s)
                content = content_s
            except Exception:
                pass
            latency_ms = round((time.time() - t0) * 1000)
            if not content:
                try:
                    raw = _post({
                        "model": model,
                        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                        "max_tokens": 5,
                        "temperature": 0,
                    })
                    choices = raw.get("choices", [])
                    if choices:
                        content = _extract_message_content(choices[0].get("message", {}))
                except Exception:
                    pass

            # ===== Step 2: probe reasoning =====
            try:
                raw_r = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "Solve step by step: If a bat and ball cost $1.10 together, and the bat costs $1.00 more than the ball, how much does the ball cost? Show your reasoning."}],
                    "max_tokens": 256,
                    "temperature": 0,
                })
                choices_r = raw_r.get("choices", [])
                if choices_r:
                    msg_r = choices_r[0].get("message", {})
                    reply = _extract_message_content(msg_r)
                    reply_lower = reply.lower()
                    has_reasoning_field = bool(msg_r.get("reasoning_content")) or bool(msg_r.get("reasoning"))
                    has_think_tag = "<think>" in reply or "</think>" in reply
                    reasoning_words = ("step", "therefore", "because", "reasoning",
                                       "first", "second", "third", "let's think",
                                       "let me think", "so the", "thus", "hence",
                                       "thinking process", "analysis")
                    has_step_words = sum(1 for w in reasoning_words if w in reply_lower) >= 3
                    has_correct_answer = "0.05" in reply or "5 cents" in reply_lower or "5 cent" in reply_lower
                    if has_reasoning_field or has_think_tag:
                        detected_caps.append("reasoning")
                    elif has_step_words and has_correct_answer and len(reply) > 80:
                        detected_caps.append("reasoning")
            except Exception as e:
                logger.debug(f"Model {model} reasoning probe error: {e}")

            # ===== Step 3: probe code =====
            try:
                raw_c = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "Write a Python function to check if a number is prime. Only output the code, no explanation."}],
                    "max_tokens": 256,
                    "temperature": 0,
                })
                choices_c = raw_c.get("choices", [])
                if choices_c:
                    reply_c = _extract_message_content(choices_c[0].get("message", {}))
                    has_code_block = "```python" in reply_c or "```py" in reply_c or "```\ndef " in reply_c
                    has_function_def = "def " in reply_c and "return " in reply_c and ("(" in reply_c and "):" in reply_c)
                    has_code_keywords = sum(1 for kw in ("def ", "return ", "for ", "if ", "else:", "import ", "class ", "print(")
                                            if kw in reply_c) >= 3
                    if has_code_block or (has_function_def and has_code_keywords):
                        detected_caps.append("code")
            except Exception as e:
                logger.debug(f"Model {model} code probe error: {e}")

            # ===== Step 4: probe vision =====
            try:
                red_png_b64 = (
                    "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAMklEQVQ4T2N88ODhfwY0wMjIyIBOY2BgYGBkZGRgZGRkYKCgYGBgYGBgYGBgYGBgAAB"
                    "ZSwX/2QnKwAAAAABJRU5ErkJggg=="
                )
                raw_rv = _post({
                    "model": model,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "What color is this image? Answer in one word."},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{red_png_b64}"}},
                        ]
                    }],
                    "max_tokens": 32,
                    "temperature": 0,
                })
                choices_rv = raw_rv.get("choices", [])
                if choices_rv:
                    msg_rv = choices_rv[0].get("message", {})
                    rv_content = _extract_message_content(msg_rv).strip()
                    usage_rv = raw_rv.get("usage", {})
                    image_tokens = (
                        usage_rv.get("image_tokens", 0)
                        or usage_rv.get("prompt_tokens_details", {}).get("image_tokens", 0)
                        or 0
                    )
                    evasive_phrases = [
                        "cannot see", "can't see", "don't see", "unable to see",
                        "no image", "not see", "cannot view", "don't have access",
                        "no visual", "not able to", "cannot access", "i'd be happy to help",
                        "没有图片", "看不到", "无法看到", "无法识别", "没有看到",
                        "抱歉", "无法", "不能",
                    ]
                    rv_lower = rv_content.lower()
                    is_evasive = any(p in rv_lower for p in evasive_phrases)
                    if image_tokens > 0 and rv_content and not is_evasive:
                        detected_caps.append("vision")
            except Exception as e:
                logger.debug(f"Model {model} vision probe error: {e}")

            # ===== Step 5: probe function_calling =====
            fc_format_ok = False
            try:
                raw_fc = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "Use the calc tool to add 2 and 3"}],
                    "tools": [{
                        "type": "function",
                        "function": {
                            "name": "calc",
                            "description": "Add two numbers",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "a": {"type": "number"},
                                    "b": {"type": "number"}
                                },
                                "required": ["a", "b"]
                            }
                        }
                    }],
                    "max_tokens": 64,
                    "temperature": 0,
                })
                choices_fc = raw_fc.get("choices", [])
                if choices_fc:
                    msg_fc = choices_fc[0].get("message", {})
                    tool_calls = msg_fc.get("tool_calls") or []
                    if tool_calls:
                        detected_caps.append("function_calling")
                        tc0 = tool_calls[0]
                        has_id = bool(tc0.get("id"))
                        has_type = tc0.get("type") == "function"
                        func = tc0.get("function") or {}
                        has_name = bool(func.get("name"))
                        args = func.get("arguments", "")
                        has_args = isinstance(args, str) and len(args) > 2
                        fc_format_ok = has_id and has_type and has_name and has_args
            except Exception as e:
                logger.debug(f"Model {model} function_calling probe error: {e}")

            # ===== Step 5b: probe json_mode =====
            json_mode_ok = False
            try:
                raw_jm = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": "What is 2+3? Reply with JSON: {\"answer\": 5}"}],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 64,
                    "temperature": 0,
                })
                choices_jm = raw_jm.get("choices", [])
                if choices_jm:
                    msg_jm = choices_jm[0].get("message", {})
                    jm_content = (msg_jm.get("content") or "").strip()
                    if jm_content.startswith("{") or jm_content.startswith("```"):
                        json_mode_ok = True
            except Exception as e:
                logger.debug(f"Model {model} json_mode probe error: {e}")

            # ===== Step 6: probe long_context + context_window =====
            context_window_tested = None
            try:
                test_sizes = [2000, 4000, 8000, 16000, 32000, 65000, 131072]
                base_sentence = "The quick brown fox jumps over the lazy dog. "
                for sz in test_sizes:
                    n = sz // len(base_sentence) + 1
                    big_block = base_sentence * n
                    try:
                        raw_lc = _post({
                            "model": model,
                            "messages": [{"role": "user", "content": big_block + "\nWhat animal jumps? One word."}],
                            "max_tokens": 10,
                            "temperature": 0,
                        }, timeout=8)
                        choices_lc = raw_lc.get("choices", [])
                        if choices_lc:
                            finish = choices_lc[0].get("finish_reason", "")
                            if finish == "stop":
                                context_window_tested = sz
                            else:
                                break
                        else:
                            break
                    except Exception:
                        break
                if context_window_tested and context_window_tested >= 4000:
                    detected_caps.append("long_context")
            except Exception as e:
                logger.debug(f"Model {model} long_context probe error: {e}")

            # Always has chat
            if "chat" not in detected_caps:
                detected_caps.insert(0, "chat")

            # Deduplicate while preserving order
            seen = set()
            unique_caps = []
            for c in detected_caps:
                if c not in seen:
                    seen.add(c)
                    unique_caps.append(c)

            return {
                "success": True,
                "response": content.strip(),
                "latency_ms": latency_ms,
                "ttft_ms": ttft_ms,
                "streaming": streaming_ok,
                "json_mode": json_mode_ok,
                "context_window_tested": context_window_tested,
                "capabilities": unique_caps,
            }

        try:
            return await asyncio.wait_for(asyncio.to_thread(_do_test), timeout=120)
        except asyncio.TimeoutError:
            logger.warning(f"模型测试超时: {model} @ {chat_url}")
            return {"success": False, "error": "验证超时(>120s)，模型响应过慢"}
        except Exception as e:
            logger.warning(f"模型测试失败: {model} @ {chat_url} — {e}")
            return {"success": False, "error": str(e)}

    # ===== Token Stats API =====

    def api_upgrade_check():
        """Return cached upgrade info immediately (non-blocking).
        Cache is populated by the background thread started in main()."""
        import time as _time
        with _upgrade_cache_lock:
            cached = dict(_upgrade_cache)
        if cached.get("checked_at", 0) > 0 and (_time.time() - cached["checked_at"]) < 1800:
            return cached
        return cached

    def api_upgrade_execute():
        """Execute upgrade: git pull + restart."""
        import subprocess
        try:
            project_root = Path(os.path.dirname(os.path.abspath(__file__)))

            # Step 1: git pull
            result = subprocess.run(
                ["git", "pull", "origin", "main"],
                cwd=str(project_root), capture_output=True, text=True, timeout=60
            )
            pull_output = result.stdout.strip()
            pull_error = result.stderr.strip()

            if result.returncode != 0:
                return {
                    "success": False,
                    "stage": "git_pull",
                    "error": pull_error or pull_output,
                }

            # Step 2: Schedule restart after response is sent
            loop = asyncio.get_event_loop()
            loop.call_later(2, lambda: os.execv(sys.executable, [sys.executable] + sys.argv))

            return {
                "success": True,
                "message": "升级成功，服务正在重启...",
                "pull_output": pull_output,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_get_token_stats():
        now = time.time()
        ctx_window = 1_000_000
        total_prompt = 0
        total_completion = 0
        total = 0
        total_requests = 0
        model_map = {}
        date_map = {}
        hourly_raw = {}
        heatmap = {}

        try:
            if _token_db_conn:
                cur = _token_db_conn.cursor()

                # Summary totals
                cur.execute("""
                    SELECT COUNT(*), COALESCE(SUM(prompt_tokens), 0),
                           COALESCE(SUM(completion_tokens), 0), COALESCE(SUM(total_tokens), 0)
                    FROM token_usage WHERE total_tokens > 0
                """)
                row = cur.fetchone()
                total_requests = row[0]
                total_prompt = row[1]
                total_completion = row[2]
                total = row[3]

                # Per-model breakdown
                cur.execute("""
                    SELECT m.name, COUNT(*),
                           SUM(t.prompt_tokens), SUM(t.completion_tokens), SUM(t.total_tokens)
                    FROM token_usage t
                    LEFT JOIN token_models m ON t.model_id = m.id
                    WHERE t.total_tokens > 0
                    GROUP BY m.name ORDER BY SUM(t.total_tokens) DESC
                """)
                for r in cur.fetchall():
                    model_map[r[0] or "unknown"] = {
                        "model": r[0] or "unknown",
                        "requests": r[1],
                        "prompt_tokens": r[2],
                        "completion_tokens": r[3],
                        "total_tokens": r[4],
                    }

                # Per-date stats (last 30 days)
                cur.execute("""
                    SELECT DATE(ts, 'unixepoch', 'localtime') as d,
                           SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens), COUNT(*)
                    FROM token_usage
                    WHERE ts > ? AND total_tokens > 0
                    GROUP BY d ORDER BY d ASC
                """, (int(now - 30 * 86400),))
                for row in cur.fetchall():
                    date_map[row[0]] = {
                        "prompt_tokens": row[1], "completion_tokens": row[2],
                        "total_tokens": row[3], "requests": row[4]
                    }

                # Per-hour stats (last 24 consecutive hours)
                cur.execute("""
                    SELECT (ts / 3600) as hour_bucket,
                           SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens), COUNT(*)
                    FROM token_usage
                    WHERE ts > ? AND total_tokens > 0
                    GROUP BY hour_bucket ORDER BY hour_bucket ASC
                """, (int(now - 86400),))
                for row in cur.fetchall():
                    hourly_raw[row[0]] = {
                        "prompt_tokens": row[1], "completion_tokens": row[2],
                        "total_tokens": row[3], "requests": row[4]
                    }

                # Day-of-week × hour heatmap (last 30 days)
                cur.execute("""
                    SELECT CAST(strftime('%w', ts, 'unixepoch', 'localtime') AS INTEGER) as dow,
                           CAST(strftime('%H', ts, 'unixepoch', 'localtime') AS INTEGER) as hour,
                           SUM(total_tokens) as total, COUNT(*) as requests
                    FROM token_usage
                    WHERE ts > ? AND total_tokens > 0
                    GROUP BY dow, hour
                """, (int(now - 30 * 86400),))
                for row in cur.fetchall():
                    key = f"{row[0]}_{row[1]}"
                    heatmap[key] = {"dow": row[0], "hour": row[1], "total_tokens": row[2], "requests": row[3]}

        except Exception as e:
            logger.warning(f"Token stats query failed: {e}")

        # Build model_stats list
        model_stats = sorted(model_map.values(), key=lambda x: -x["total_tokens"])

        # Build 24-slot hourly list
        now_local = datetime.datetime.now()
        cur_hour_bucket = int(now_local.timestamp()) // 3600
        start_bucket = cur_hour_bucket - 23
        hourly = []
        for b in range(start_bucket, cur_hour_bucket + 1):
            next_local = datetime.datetime.fromtimestamp((b + 1) * 3600)
            h_label = next_local.strftime('%H')
            if b in hourly_raw:
                hourly.append({"hour": h_label, "bucket": b, **hourly_raw[b]})
            else:
                hourly.append({"hour": h_label, "bucket": b, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "requests": 0})

        # Build 7×24 heatmap grid
        heatmap_grid = []
        for dow in range(7):
            for hour in range(24):
                key = f"{dow}_{hour}"
                cell = heatmap.get(key, {"dow": dow, "hour": hour, "total_tokens": 0, "requests": 0})
                heatmap_grid.append(cell)

        return {
            "history": [],  # Removed: history table no longer displayed
            "total_requests": total_requests,
            "total_prompt_tokens": total_prompt,
            "total_completion_tokens": total_completion,
            "total_tokens": total,
            "context_window": ctx_window,
            "model": agent.llm_client.model if agent.llm_client else "",
            "model_stats": model_stats,
            "date_stats": date_map,
            "hourly_stats": hourly,
            "heatmap": heatmap_grid,
        }

    # ===== Avatar Upload API =====

    def _handle_avatar_upload(body, agent_ref, raw_request=None):
        """Handle agent avatar upload via multipart/form-data.
        Accepts: { "agent": "name" } + file field "file".
        Saves to agents/<name>/avatar.webp (256x256).
        """
        from PIL import Image
        import io as _io

        # Extract agent name: prefer multipart form field, then JSON body, then default
        target_agent = None
        if raw_request:
            target_agent = _extract_multipart_field(raw_request, "agent")
        if not target_agent:
            target_agent = body.get("agent") if isinstance(body, dict) else None
        if not target_agent:
            target_agent = agent_ref.config.agent_name or "default"

        # Extract file from multipart body
        file_bytes = None
        if isinstance(body, dict) and "_file_data" in body:
            file_bytes = body["_file_data"]
        elif raw_request:
            _, file_bytes = _extract_multipart_file(raw_request)

        if not file_bytes:
            return {"success": False, "error": "未提供图片数据"}

        if len(file_bytes) > 5 * 1024 * 1024:
            return {"success": False, "error": f"图片过大（{len(file_bytes)//1024}KB），最大允许 5MB"}

        try:
            img = Image.open(_io.BytesIO(file_bytes))
            img = img.convert("RGBA")
            img.thumbnail((256, 256), Image.LANCZOS)

            agent_dir = Path(os.path.dirname(__file__)) / "agents" / target_agent
            agent_dir.mkdir(parents=True, exist_ok=True)
            avatar_file = agent_dir / "avatar.webp"

            buf = _io.BytesIO()
            img.save(buf, format="WEBP", quality=80)
            avatar_file.write_bytes(buf.getvalue())

            rel_path = f"agents/{target_agent}/avatar.webp"

            # Update config.json avatar field
            cfg_path = agent_dir / "config.json"
            cfg = {}
            if cfg_path.exists():
                try:
                    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
                except Exception:
                    pass
            cfg["avatar"] = rel_path
            cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

            if target_agent == agent_ref.config.agent_name:
                agent_ref.config.avatar = rel_path

            logger.info(f"头像已保存：{avatar_file} ({len(buf.getvalue())} bytes)")
            return {"success": True, "path": rel_path, "size": len(buf.getvalue())}

        except ImportError:
            return {"success": False, "error": "PIL 未安装，无法处理图片"}
        except Exception as e:
            logger.error(f"头像上传失败：{e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def _extract_multipart_file(raw_request: bytes):
        """Extract first file field from multipart/form-data request body.
        Returns (filename, content_bytes) or (None, None).
        """
        import cgi
        import io as _io

        # Find the blank line separating headers from body
        header_end = raw_request.find(b"\r\n\r\n")
        if header_end < 0:
            return None, None

        header_section = raw_request[:header_end].decode("utf-8", errors="replace")
        body_section = raw_request[header_end + 4:]

        # Extract boundary from Content-Type
        boundary = None
        content_type = ""
        for line in header_section.split("\r\n"):
            low = line.lower()
            if low.startswith("content-type:"):
                content_type = line.split(":", 1)[1].strip()
                for part in content_type.split(";"):
                    part = part.strip()
                    if part.lower().startswith("boundary="):
                        boundary = part.split("=", 1)[1].strip().strip('"')
                        break

        if not boundary:
            return None, None

        # Use cgi.FieldStorage to parse multipart
        environ = {
            'REQUEST_METHOD': 'POST',
            'CONTENT_TYPE': content_type or f'multipart/form-data; boundary={boundary}',
            'CONTENT_LENGTH': str(len(body_section)),
        }
        try:
            fs = cgi.FieldStorage(
                fp=_io.BytesIO(body_section),
                environ=environ,
                keep_blank_values=True
            )
            for key in fs.keys():
                item = fs[key]
                if hasattr(item, 'filename') and item.filename:
                    return item.filename, item.file.read()
        except Exception:
            pass
        return None, None

    @staticmethod
    def _extract_multipart_field(raw_request: bytes, field_name: str):
        """Extract a text field value from multipart/form-data request body.
        Returns the field value as string, or None if not found.
        """
        import cgi
        import io as _io

        header_end = raw_request.find(b"\r\n\r\n")
        if header_end < 0:
            return None

        header_section = raw_request[:header_end].decode("utf-8", errors="replace")
        body_section = raw_request[header_end + 4:]

        boundary = None
        content_type = ""
        for line in header_section.split("\r\n"):
            low = line.lower()
            if low.startswith("content-type:"):
                content_type = line.split(":", 1)[1].strip()
                for part in content_type.split(";"):
                    part = part.strip()
                    if part.lower().startswith("boundary="):
                        boundary = part.split("=", 1)[1].strip().strip('"')
                        break

        if not boundary:
            return None

        environ = {
            'REQUEST_METHOD': 'POST',
            'CONTENT_TYPE': content_type or f'multipart/form-data; boundary={boundary}',
            'CONTENT_LENGTH': str(len(body_section)),
        }
        try:
            fs = cgi.FieldStorage(
                fp=_io.BytesIO(body_section),
                environ=environ,
                keep_blank_values=True
            )
            if field_name in fs:
                item = fs[field_name]
                if not item.filename:
                    return item.value
        except Exception:
            pass
        return None

    # ===== File Upload API =====

    # File categories by extension
    FILE_CATEGORIES = {
        "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"},
        "document": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".csv", ".json", ".xml", ".toml", ".ini", ".cfg", ".conf"},
        "code": {".py", ".js", ".ts", ".html", ".css", ".java", ".c", ".h", ".go", ".php", ".sh", ".bash", ".zsh", ".bat", ".ps1", ".sql"},
        "archive": {".zip", ".rar", ".7z", ".tar"},
        "audio": {".mp3", ".wav", ".aac", ".wma", ".m4a"},
        "video": {".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".mpg", ".mpeg", ".3gp"},
    }

    # Image magic bytes for security validation
    IMAGE_MAGIC = {
        ".png": b"\x89PNG\r\n\x1a\n",
        ".jpg": b"\xff\xd8\xff",
        ".jpeg": b"\xff\xd8\xff",
        ".gif": (b"GIF87a", b"GIF89a"),
        ".webp": None,  # special check
        ".bmp": b"BM",
    }

    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

    def _get_file_category(ext):
        ext_lower = ext.lower()
        for cat, exts in FILE_CATEGORIES.items():
            if ext_lower in exts:
                return cat
        return "other"

    def api_upload_file(body, raw_request):
        """Handle file upload from the frontend.

        JSON body: { "data": "base64...", "name": "file.png", "mime": "image/png" }

        Returns: { success, path, name, size, mime, category, error }
        """

        file_data = body.get("data", "")
        file_name = body.get("name", "uploaded_file")
        mime = body.get("mime", "")

        if not file_data:
            return {"success": False, "error": "未提供文件数据"}

        try:
            # Parse data URL or raw base64
            if file_data.startswith("data:"):
                header, b64_data = file_data.split(",", 1)
            else:
                b64_data = file_data

            raw_bytes = base64.b64decode(b64_data)

            if len(raw_bytes) > MAX_FILE_SIZE:
                return {"success": False, "error": f"文件过大（{len(raw_bytes) // 1024}KB），最大允许 {MAX_FILE_SIZE // 1024}KB"}

            # Determine extension
            dot_pos = file_name.rfind(".")
            if dot_pos > 0:
                ext = file_name[dot_pos:].lower()
                name_part = file_name[:dot_pos]
            else:
                ext = ""
                name_part = file_name

            category = _get_file_category(ext)

            # For images, validate magic bytes
            if category == "image" and ext in IMAGE_MAGIC:
                magic = IMAGE_MAGIC[ext]
                if ext == ".webp":
                    if not (raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP"):
                        return {"success": False, "error": "图片格式与声明类型不一致"}
                elif ext == ".gif":
                    if not raw_bytes[:6] in (b"GIF87a", b"GIF89a"):
                        return {"success": False, "error": "图片格式与声明类型不一致"}
                elif magic and not raw_bytes.startswith(magic):
                    return {"success": False, "error": "文件格式与声明类型不一致，可能包含恶意内容"}

            # Save file
            upload_dir = PROJECT_ROOT / "uploads"
            upload_dir.mkdir(parents=True, exist_ok=True)

            safe_name = _re.sub(r'[^\w\-.]', '_', name_part) or f"file_{int(time.time())}"
            file_path = upload_dir / f"{safe_name}{ext}" if ext else upload_dir / safe_name
            counter = 1
            while file_path.exists():
                file_path = upload_dir / f"{safe_name}_{counter}{ext}" if ext else upload_dir / f"{safe_name}_{counter}"
                counter += 1

            file_path.write_bytes(raw_bytes)
            logger.info(f"文件已上传：{file_path} ({len(raw_bytes)} 字节, 分类: {category})")

            return {
                "success": True,
                "path": str(file_path),
                "name": file_path.name,
                "size": len(raw_bytes),
                "mime": mime,
                "category": category,
            }
        except Exception as e:
            logger.error(f"文件上传失败：{e}")
            return {"success": False, "error": str(e)}

    def api_get_logs(full_path):
        # Parse query params from full_path
        query = parse_qs(urlparse(full_path).query) if "?" in full_path else {}
        levels = query.get("levels", [""])[0].split(",") if query.get("levels") else []
        levels = [l.strip().upper() for l in levels if l.strip()]
        source = query.get("source", [""])[0].strip()
        search = query.get("search", [""])[0].strip().lower()
        lang = query.get("lang", ["zh"])[0].strip()
        try:
            limit = min(int(query.get("limit", ["100"])[0]), 500)
        except ValueError:
            limit = 100
        try:
            offset = max(int(query.get("offset", ["0"])[0]), 0)
        except ValueError:
            offset = 0

        # Filter
        filtered = _log_buffer
        if levels:
            filtered = [e for e in filtered if e["level"].upper() in levels]
        if source:
            filtered = [e for e in filtered if source.lower() in e["logger"].lower()]
        if search:
            filtered = [e for e in filtered if search in e["message"].lower()]

        total = len(filtered)
        # Paginate (newest first, so reverse)
        entries = list(reversed(filtered))[offset:offset + limit]
        # Translate entries if lang != zh
        if lang != "zh":
            entries = [_translate_log_entry(e, lang) for e in entries]
        # Available sources and levels for UI
        all_sources = sorted(set(e["logger"] for e in _log_buffer))
        all_levels = sorted(set(e["level"].upper() for e in _log_buffer))
        return {
            "logs": entries,
            "total": total,
            "offset": offset,
            "limit": limit,
            "sources": all_sources,
            "levels": all_levels,
        }

    # ===== Port check =====
    for _test_port in [port, ws_port]:
        _s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            _s.bind(("0.0.0.0", _test_port))
        except OSError:
            logger.error(f"端口 {_test_port} 已被占用，请更换端口或停止占用进程")
            sys.exit(1)
        finally:
            _s.close()
    # ===== Start servers =====
    with open("/tmp/siper_startup.log", "a") as _dbg:
        _dbg.write(f"[{(time.time()-_t0):.1f}s] starting servers\n")
    http_server = await asyncio.start_server(handle_request, "0.0.0.0", port)
    with open("/tmp/siper_startup.log", "a") as _dbg:
        _dbg.write(f"[{(time.time()-_t0):.1f}s] HTTP server started on port {port}\n")
    logger.info(f"[计时] HTTP 服务启动完成: {(time.time()-_t0)*1000:.0f}ms")
    logger.info(f"Web UI 地址：http://localhost:{port}")

    # ===== WebSocket server =====
    # 起源：初始化有状态 UI
    # api_router is imported from ai_agent.api.router as a singleton
    global snapshot_mgr, carrier_mgr, db_mgr, api_router
    snapshot_mgr = SnapshotManager()
    snapshot_mgr.start_periodic_save(interval=5.0)  # 每5秒检查并持久化
    carrier_mgr = CarrierManager()
    db_mgr = _DBMgr(PROJECT_ROOT)
    api_router = Router(prefix="")
    # 替换模块级 api_router，确保 HTTP handler 通过 from import 引用同一个对象
    import ai_agent.api.router as _router_mod
    _router_mod.api_router = api_router
    logger.info("[起源] SnapshotManager / CarrierManager / Router / DatabaseManager 已初始化")

    # 启动预填充：从 DB 加载 agents/sessions 到内存，不等 WS 连接
    import asyncio as _asyncio
    _loop = _asyncio.get_event_loop()
    _loop.create_task(snapshot_mgr.hot_start(agent))
    logger.info("[起源] 启动预填充已调度")

    # 起源：注册 API 路由（一次性，在 main() 中完成）
    from ai_agent.api.router import register_routes as _register_routes
    from ai_agent.api.handlers import api_get_system_stats, api_get_project_structure, api_get_tools
    import ai_agent.api.handlers as _h
    _h.start_time = start_time
    _h.port = port
    _h.ws_port = ws_port
    _handlers = {
        "api_upgrade_check": api_upgrade_check,
        "api_upgrade_execute": api_upgrade_execute,
        "api_get_sessions": api_get_sessions,
        "api_get_session_messages": api_get_session_messages,
        "api_delete_session": api_delete_session,
        "api_rename_session": api_rename_session,
        "api_save_response_dict": api_save_response_dict,
        "api_get_config": api_get_config,
        "api_update_config": api_update_config,
        "api_get_skills": api_get_skills,
        "api_skill_preview": api_skill_preview,
        "api_skill_stats": api_skill_stats,
        "api_get_agents": api_get_agents,
        "api_save_agent_meta": api_save_agent_meta,
        "api_get_agent_soul": api_get_agent_soul,
        "api_get_agent_config": api_get_agent_config,
        "api_get_agent_memory": api_get_agent_memory,
        "api_save_agent_file": api_save_agent_file,
        "api_switch_agent": api_switch_agent,
        "api_create_agent": api_create_agent,
        "api_delete_agent": api_delete_agent,
        "api_rename_agent": api_rename_agent,
        "api_get_status": api_get_status,
        "api_theme_list_templates": api_theme_list_templates,
        "api_theme_save": api_theme_save,
        "api_theme_load": api_theme_load,
        "api_theme_delete": api_theme_delete,
        "api_theme_export": api_theme_export,
        "api_theme_import": api_theme_import,
        "api_get_memory": api_get_memory,
        "api_write_memory": api_write_memory,
        "api_delete_memory": api_delete_memory,
        "api_get_memory_config": api_get_memory_config,
        "api_save_memory_config": api_save_memory_config,
        "api_save_global_models": api_save_global_models,
        "api_delete_model": api_delete_model,
        "api_reset_models": api_reset_models,
        "api_get_global_models": api_get_global_models,
        "api_rename_provider": api_rename_provider,
        "api_update_provider_name": api_update_provider_name,
        "api_create_provider": api_create_provider,
        "api_discover_models": api_discover_models,
        "api_test_model": api_test_model,
        "api_get_token_stats": api_get_token_stats,
        "api_get_system_stats": api_get_system_stats,
        "api_get_project_structure": api_get_project_structure,
        "api_get_tools": api_get_tools,
        "api_upload_file": api_upload_file,
        "api_get_logs": api_get_logs,
        "_handle_avatar_upload": _handle_avatar_upload,
    }
    _register_routes(api_router, agent, snapshot_mgr, carrier_mgr, _handlers)
    logger.info(f"[起源] API 路由注册完成，共 {len(api_router.routes)} 条路由")
    # 调试：打印所有注册的路由
    for m, p, fn in api_router.routes:
        logger.info(f"  [ROUTE] {m} {p} -> {fn.__name__}")

    connections = {}

    # Per-connection message queues: conn_id -> asyncio.Queue
    _msg_queues: Dict[str, asyncio.Queue] = {}
    _msg_queue_locks: Dict[str, asyncio.Lock] = {}

    # Map conn_id -> persistent session_id
    _conn_sessions: Dict[str, str] = {}

    # Map conn_id -> agent_name (which agent this connection's session belongs to)
    _conn_agent_names: Dict[str, str] = {}

    # Map conn_id -> stop event (set when user clicks stop)
    _stop_events: Dict[str, asyncio.Event] = {}

    # Map conn_id -> process_message asyncio.Task (for cancellation on stop)
    _process_tasks: Dict[str, asyncio.Task] = {}

    # Map conn_id -> processing event (set while reply is in progress)
    _processing_events: Dict[str, asyncio.Event] = {}

    async def _push_page_data(ws, conn_id, snapshot_mgr, page: str, tab: str):
        """页面切换时推送页面数据到 page_cache.

        根据 page/tab 调用对应的 API 获取数据，写入 page_snapshot，
        然后通过 WebSocket 推送 state_delta 给前端.
        """
        from ai_agent.api.handlers import api_get_system_stats, api_get_project_structure, api_get_logs, api_get_token_stats

        # 推送前先清除过期页面缓存（只保留白名单和当前页面）
        try:
            await snapshot_mgr.evict_stale_page_cache(current_page=page)
        except Exception as e:
            logger.warning(f"evict_stale_page_cache failed: {e}")

        page_data: dict = {}
        try:
            if page == "monitor":
                if tab in ("performance", ""):
                    try:
                        stats = api_get_system_stats()
                        page_data["perf"] = stats
                    except Exception as e:
                        logger.warning(f"push_page_data perf failed: {e}")
                if tab in ("token", ""):
                    try:
                        token = api_get_token_stats()
                        page_data["token"] = token
                    except Exception as e:
                        logger.warning(f"push_page_data token failed: {e}")
                if tab in ("logs", ""):
                    try:
                        logs = api_get_logs(full_path="/api/logs?limit=200")
                        page_data["logs"] = logs
                    except Exception as e:
                        logger.warning(f"push_page_data logs failed: {e}")
            elif page == "directory":
                try:
                    structure = api_get_project_structure()
                    page_data["tree"] = structure
                except Exception as e:
                    logger.warning(f"push_page_data directory failed: {e}")
            elif page == "model-settings":
                from ai_agent.api.handlers import api_get_global_models
                try:
                    models = api_get_global_models()
                    page_data["models"] = models
                except Exception as e:
                    logger.warning(f"push_page_data model-settings failed: {e}")
            elif page == "tools":
                from ai_agent.api.handlers import api_get_tools
                try:
                    tools_data = api_get_tools()
                    page_data["tools"] = tools_data.get("tools", [])
                    page_data["categories"] = tools_data.get("categories", {})
                    page_data["total"] = tools_data.get("total", 0)
                except Exception as e:
                    logger.warning(f"push_page_data tools failed: {e}")
            elif page == "skills":
                from ai_agent.api.handlers import api_get_skills
                try:
                    skills_data = api_get_skills()
                    page_data["skills"] = skills_data.get("skills", skills_data) if isinstance(skills_data, dict) else skills_data
                except Exception as e:
                    logger.warning(f"push_page_data skills failed: {e}")
        except Exception as e:
            logger.warning(f"_push_page_data 采集数据失败: {e}")

        if page_data:
            try:
                await snapshot_mgr.set_page_cache(page, page_data)
                await ws.send(json.dumps({
                    "type": "state_delta",
                    "version": snapshot_mgr.version,
                    "changes": [{"op": "replace", "path": f"page_cache.{page}", "value": page_data}]
                }))
            except Exception as e:
                logger.warning(f"_push_page_data 推送失败: {e}")

    async def ws_handler(ws):
        conn_id = str(id(ws))
        sys.stdout.flush()
        connections[conn_id] = ws
        ws._auth_ok = True  # 认证已禁用，直接标记为已认证
        # 起源：注册载体适配器
        if snapshot_mgr and carrier_mgr:
            _adapter = WebUIAdapter(ws)
            # 起源：初始数据同步 — 快照已有数据时跳过重复 DB 读取
            _existing_agents = snapshot_mgr.get_snapshot().get("agents", [])
            if _existing_agents:
                logger.info(f"[起源] WS {conn_id} 快照已有 {len(_existing_agents)} agents，跳过重复同步")
            else:
                logger.info(f"[起源] WS {conn_id} 开始初始同步...")
                from ai_agent.state.session_sync import sync_agents
                try:
                    _agents = sync_agents(snapshot_mgr)
                    await snapshot_mgr.set("agents", _agents)
                    logger.info(f"[起源] 初始同步: {len(_agents)} agents")
                    # 同步 sessions 到快照
                    from ai_agent.state.session_sync import sync_sessions as _sync_sessions
                    try:
                        _sessions = _sync_sessions(snapshot_mgr, agent)
                        await snapshot_mgr.set("sessions", _sessions)
                        logger.info(f"[起源] 初始同步: {len(_sessions)} sessions")
                    except Exception as e:
                        logger.warning(f"[起源] sync_sessions failed: {e}")
                    _expanded = [a["name"] for a in _agents if a.get("expanded", True)]
                    await snapshot_mgr.set("expanded_agents", _expanded)
                    try:
                        from ai_agent.state.session_sync import sync_memory, sync_agent_configs, sync_system_stats
                        _memory_data = sync_memory(snapshot_mgr, agent)
                        await snapshot_mgr.set_page_cache("memory", _memory_data)
                        _config_data = sync_agent_configs(snapshot_mgr, agent)
                        await snapshot_mgr.set_page_cache("agent_config", _config_data)
                        _stats_data = await sync_system_stats(snapshot_mgr, agent)
                        await snapshot_mgr.set_page_cache("monitor", _stats_data)
                        logger.info(f"[起源] 页面缓存预加载完成")
                    except Exception as e:
                        logger.warning(f"[起源] 页面缓存预加载失败: {e}")
                except Exception as e:
                    logger.error(f"[起源] initial sync failed: {e}", exc_info=True)
            # register 发送 state_full，此时快照已填充
            await snapshot_mgr.register(conn_id, _adapter)
            carrier_mgr.add(conn_id, _adapter)
        # Create per-connection queue
        _msg_queues[conn_id] = asyncio.Queue(maxsize=100)
        _msg_queue_locks[conn_id] = asyncio.Lock()
        _stop_events[conn_id] = asyncio.Event()
        logger.info(f"WS 客户端已连接：{conn_id}")
        try:
            # 认证已禁用，直接创建会话，无需等待 auth 消息
            ws._auth_ok = True
            # Create a persistent session for this connection
            persistent_sid = await agent.session_manager.create_session("web_user")
            _conn_sessions[conn_id] = persistent_sid
            logger.info(f"已为连接 {conn_id} 创建持久会话：{persistent_sid}")
            await ws.send(json.dumps({
                "type": "connected",
                "connection_id": conn_id,
                "session_id": persistent_sid,
                "message": "Connected to Siper AI Agent"
            }))
            # Start consumer task for this connection
            consumer_task = asyncio.create_task(_ws_msg_consumer(ws, conn_id))
            # Event: set while a message is being processed (reply in progress)
            _processing_events[conn_id] = asyncio.Event()
            # Receiver loop: just enqueue messages, with heartbeat timeout
            try:
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=_WS_HEARTBEAT_TIMEOUT)
                    except asyncio.TimeoutError:
                        # Only timeout if not actively processing a reply
                        if _processing_events.get(conn_id, asyncio.Event()).is_set():
                            # Still processing, skip timeout and retry
                            continue
                        _heartbeat_log(f"WS 连接 {conn_id} {_WS_HEARTBEAT_TIMEOUT}秒无消息，主动断开以重建连接")
                        await ws.close()
                        break
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue
                    if data.get("type") == "message":
                        # Mark as processing — disables heartbeat timeout
                        if conn_id not in _processing_events:
                            _processing_events[conn_id] = asyncio.Event()
                        _processing_events[conn_id].set()
                        # Send queue status update
                        q = _msg_queues.get(conn_id)
                        if q is None:
                            continue
                        q.put_nowait(data)
                        if q.qsize() > 1:
                            await ws.send(json.dumps({
                                "type": "queue_status",
                                "position": q.qsize(),
                                "message": f"排队中，当前位置：{q.qsize()}"
                            }))
                    elif data.get("type") == "ping":
                        await ws.send(json.dumps({"type": "pong"}))
                    elif data.get("type") == "stop":
                        logger.info(f"收到停止请求：conn={conn_id}")
                        # Set stop event so _process_ws_message / _llm_call can check it
                        if conn_id in _stop_events:
                            _stop_events[conn_id].set()
                        # Cancel the running process_message task for this connection
                        _task = _process_tasks.get(conn_id)
                        if _task and not _task.done():
                            _task.cancel()
                        consumer_task.cancel()
                        # Recreate consumer for subsequent messages
                        consumer_task = asyncio.create_task(_ws_msg_consumer(ws, conn_id))
                        await ws.send(json.dumps({"type": "stopped", "message": "Generation stopped"}))
                    elif data.get("type") == "new_session":
                        print(f"[WS] 收到 new_session: conn={conn_id}, agent={data.get('agent')}", flush=True)
                        # Create a new persistent session for the specified agent (or default)
                        agent_name = data.get("agent") or "default"
                        if not agent_name or agent_name == "null":
                            agent_name = "default"
                        sm = await _get_or_create_session_manager(agent_name)
                        old_sid = _conn_sessions.get(conn_id)
                        # Discard old unsaved session from its agent's manager
                        if old_sid:
                            old_agent_name = _conn_agent_names.get(conn_id) or "default"
                            old_sm = _agent_session_managers.get(old_agent_name, agent.session_manager)
                            if old_sid in getattr(old_sm, '_unsaved_sessions', set()):
                                old_sm.active_sessions.pop(old_sid, None)
                                old_sm._unsaved_sessions.discard(old_sid)
                                logger.info(f"新会话：已丢弃旧的未持久化会话：{old_sid} (agent={old_agent_name})")
                        new_sid = await sm.create_session("web_user")
                        _conn_sessions[conn_id] = new_sid
                        _conn_agent_names[conn_id] = agent_name
                        # Initialize per-session conversation history
                        agent.conversation_history[new_sid] = []
                        logger.info(f"新会话：conn={conn_id}, agent={agent_name}, old={old_sid}, new={new_sid}")
                        await ws.send(json.dumps({
                            "type": "session_created",
                            "session_id": new_sid,
                            "agent": agent_name,
                            "message": "New session created"
                        }))
                    elif data.get("type") == "navigate":
                        _page = data.get("page", "")
                        _tab = data.get("tab", "")
                        logger.info(f"[WS] navigate: page={_page}, tab={_tab}")
                        await _push_page_data(ws, conn_id, snapshot_mgr, _page, _tab)
                    elif data.get("type") == "clarify_response":
                        session_id = data.get("session_id", "")
                        answer = data.get("answer", "")
                        logger.info(f"[WS] clarify_response: session={session_id}, answer={answer!r}")
                        from ai_agent.tools.clarify_tool import _get_pending_future
                        future = _get_pending_future(session_id)
                        if future and not future.done():
                            future.set_result(answer)
                        else:
                            logger.warning(f"[WS] clarify_response: no pending future for session={session_id}")
                        await ws.send(json.dumps({"type": "clarify_ack", "session_id": session_id}))
            except Exception as e:
                logger.debug(f"WS receiver loop ended for {conn_id}: {e}")
            consumer_task.cancel()
        except Exception:
            pass
        finally:
            # 起源：注销载体适配器
            if snapshot_mgr:
                await snapshot_mgr.unregister(conn_id)
            if carrier_mgr:
                carrier_mgr.remove(conn_id)
            _msg_queues.pop(conn_id, None)
            _msg_queue_locks.pop(conn_id, None)
            _stop_events.pop(conn_id, None)
            _processing_events.pop(conn_id, None)
            sid = _conn_sessions.pop(conn_id, None)
            _conn_agent_names.pop(conn_id, None)
            # Clean up per-session conversation history on disconnect
            if sid and sid in agent.conversation_history:
                del agent.conversation_history[sid]
                logger.info(f"连接断开，已清理会话历史：{sid}")
            # Discard unsaved session on disconnect
            if sid and sid in getattr(agent.session_manager, '_unsaved_sessions', set()):
                agent.session_manager.active_sessions.pop(sid, None)
                agent.session_manager._unsaved_sessions.discard(sid)
                logger.info(f"连接断开，已丢弃未持久化的会话：{sid}")
            del connections[conn_id]
            logger.info(f"WS 客户端已断开：{conn_id}")

    async def _ws_msg_consumer(ws, conn_id):
        """Per-connection consumer: processes messages one at a time from the queue."""
        q = _msg_queues.get(conn_id)
        if not q:
            return
        try:
            while True:
                data = await q.get()
                try:
                    await _process_ws_message(ws, conn_id, data)
                except Exception as e:
                    logger.error(f"消费者处理消息失败：{e}", exc_info=True)
                    try:
                        await ws.send(json.dumps({"type": "error", "message": str(e)}))
                    except Exception:
                        pass
                q.task_done()
        except asyncio.CancelledError:
            pass

    async def _process_ws_message(ws, conn_id, data):
        """Process a single WS message (text + optional images)."""
        logger.info(f"开始处理 WS 消息：conn={conn_id}, content_len={len(data.get('content',''))}, images_count={len(data.get('images',[]))}")
        text = data.get("content", "").strip()
        images = data.get("images", [])
        for i, img in enumerate(images):
            logger.info(f"  image[{i}]: name={img.get('name','?')}, data_len={len(img.get('data',''))}, mime={img.get('mime','?')}")

        # Save uploaded images to temp files and build image paths
        image_paths = []
        for img in images:
            try:
                img_data = img.get("data", "")
                if img_data.startswith("data:"):
                    header, b64 = img_data.split(",", 1)
                    mime = header.split(";")[0].split(":")[1] if ";" in header else "image/png"
                else:
                    b64 = img_data
                    mime = img.get("mime", "image/png")
                raw_bytes = base64.b64decode(b64)
                ext_map = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/bmp": ".bmp"}
                ext = ext_map.get(mime, ".png")
                upload_dir = PROJECT_ROOT / "uploads"
                upload_dir.mkdir(parents=True, exist_ok=True)
                img_name = img.get("name", f"image_{int(time.time()*1000)}")
                if not img_name.endswith(ext):
                    img_name = img_name.rsplit(".", 1)[0] + ext if "." in img_name else img_name + ext
                img_path = upload_dir / img_name
                counter = 1
                while img_path.exists():
                    stem = img_path.stem
                    img_path = upload_dir / f"{stem}_{counter}{ext}"
                    counter += 1
                img_path.write_bytes(raw_bytes)
                image_paths.append(str(img_path))
                logger.info(f"已保存上传图片：{img_path} ({len(raw_bytes)} 字节)")
            except Exception as e:
                logger.error(f"保存上传图片失败：{e}")

        # Build effective message
        effective_text = text
        if image_paths:
            img_refs = "\n".join(f"[Image: {p}]" for p in image_paths)
            effective_text = f"{text}\n{img_refs}" if text else f"User sent {len(image_paths)} image(s):\n{img_refs}"

        if not effective_text:
            return

        # Prefer session_id from the message (explicit user choice), fallback to connection-bound session
        session_id = data.get("session_id") or _conn_sessions.get(conn_id) or conn_id

        # Determine which agent this message is for, and set up its session manager
        msg_agent_name = data.get("agent") or _conn_agent_names.get(conn_id) or "default"
        msg_session_manager = await _get_or_create_session_manager(msg_agent_name)

        # Temporarily swap agent's session manager so process_message uses the right one
        _orig_sm = agent.session_manager
        agent.session_manager = msg_session_manager

        task_record = {
            "name": (text or "[image]")[:50],
            "status": "running",
            "agent_id": "siper_agent",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        active_tasks.append(task_record)

        selected_model = data.get("model")

        # 起源：更新快照（消息处理开始）
        if snapshot_mgr:
            await snapshot_mgr.batch_set([("is_sending", True), ("is_streaming", True)])

        # Accumulated streaming response text
        _stream_acc = {"text": ""}
        _stream_delta_sent = False  # Track whether any delta was actually sent

        async def _send_stream_delta(delta_text):
            """Send streaming delta to the frontend in real-time."""
            _stream_acc["text"] += delta_text
            nonlocal _stream_delta_sent
            _stream_delta_sent = True
            logger.info(f"[_send_stream_delta] delta={delta_text[:30]!r}, acc_len={len(_stream_acc['text'])}, conn={conn_id}")
            try:
                await ws.send(json.dumps({
                    "type": "stream_delta",
                    "delta": delta_text,
                    "session_id": session_id,
                }))
            except Exception as e:
                logger.warning(f"[_send_stream_delta] 发送失败: {e}, conn={conn_id}")
            # 起源：更新快照中的流式文本
            if snapshot_mgr:
                await snapshot_mgr.set("stream_text", _stream_acc["text"][-2000:])

        async def _ws_send(payload):
            """Send a raw payload to the frontend via WebSocket.
            Used by tools (e.g. send_message) to push independent messages."""
            try:
                if isinstance(payload, dict):
                    payload["session_id"] = session_id
                await ws.send(json.dumps(payload, ensure_ascii=False, default=str))
            except Exception:
                pass

        async def _send_tool_progress(tool_name, status, info, call_id=None):
            """Send tool execution progress to the frontend."""
            try:
                await ws.send(json.dumps({
                    "type": "tool_progress",
                    "tool_name": tool_name,
                    "status": status,
                    "info": info or {},
                    "call_id": call_id or tool_name,
                    "session_id": session_id,
                }))
            except Exception:
                pass

        try:
            # Wrap process_message in a cancellable asyncio.Task
            _stop_evt = _stop_events.get(conn_id)
            _process_task = asyncio.create_task(
                agent.process_message(
                    message=effective_text,
                    user_id="web_user",
                    session_id=session_id,
                    stream_callback=_send_stream_delta,
                    tool_call_callback=_send_tool_progress,
                    model=selected_model,
                    ws_send=_ws_send,
                    _stop_event=_stop_evt,
                )
            )
            _process_tasks[conn_id] = _process_task
            try:
                result = await _process_task
            except asyncio.CancelledError:
                logger.info(f"process_message 被用户取消：conn={conn_id}")
                result = {
                    "success": False,
                    "response": "用户停止生成",
                    "usage": {},
                    "tool_calls_executed": 0,
                    "tool_call_steps": [],
                    "skills_active": [],
                    "skills_used": [],
                    "skills_recommended": [],
                    "processing_time_ms": 0,
                    "prompt_context": "",
                    "_cancelled": True,
                }
            finally:
                _process_tasks.pop(conn_id, None)

            if result.get("success") and not result.get("_cancelled"):
                logger.info(f"persist_session called for {session_id}, active_sessions keys: {list(agent.session_manager.active_sessions.keys())[:3]}")
                await agent.session_manager.persist_session(session_id)
                logger.info(f"persist_session done for {session_id}")
                # Include message_id so frontend can save response dict to DB
                active_s = agent.session_manager.active_sessions.get(session_id)
                if active_s and active_s.messages:
                    result["message_id"] = active_s.messages[-1].get("message_id", "")
            else:
                # 即使 LLM 返回错误，也要持久化会话（保留用户消息和错误响应）
                await agent.session_manager.persist_session(session_id)
        except Exception as e:
            logger.error(f"处理消息异常：{e}\n{traceback.format_exc()}")
            result = {
                "success": False,
                "response": f"处理消息出错：{type(e).__name__}: {e}",
                "usage": {},
                "tool_calls_executed": 0,
                "tool_call_steps": [],
                "skills_active": [],
                "processing_time_ms": 0,
                "prompt_context": "",
            }
        finally:
            # Always restore original session manager
            agent.session_manager = _orig_sm
        task_record["status"] = "done"

        # Record token usage to global history + DB
        u = result.get("usage")
        if u and u.get("total_tokens", 0) > 0:
            entry = {
                "time": time.strftime("%H:%M:%S"),
                "model": result.get("model") or selected_model or "",
                "prompt_tokens": u.get("prompt_tokens", 0),
                "completion_tokens": u.get("completion_tokens", 0),
                "total_tokens": u.get("total_tokens", 0),
                "agent": agent.config.name if agent else "default",
                "source": "chat",
            }
            _token_usage_history.append(entry)
            if len(_token_usage_history) > _TOKEN_USAGE_MAX:
                _token_usage_history.pop(0)
            # Persist to shared token DB
            _save_token_to_db(entry)

        # If streaming was used, always send stream_end even if text is empty.
        # Frontend needs stream_end to trigger reply-finished logic (hide thinking panel, etc.)
        # The old `if _stream_acc["text"]:` condition caused tool_calls-only responses
        # to be sent as `response` instead, breaking frontend reply-end detection.
        if _stream_acc["text"] or _stream_delta_sent:
            try:
                # Attach image info for frontend rendering
                if image_paths:
                    result["attachments"] = [
                        {"url": "/uploads/" + os.path.basename(p), "name": os.path.basename(p), "category": "image", "type": "image"}
                        for p in image_paths
                    ]
                # Attach server_time for accurate session ordering
                result["server_time"] = datetime.datetime.now().isoformat()
                await ws.send(json.dumps({
                    "type": "stream_end",
                    "session_id": session_id,
                    "data": result,
                }))
                logger.info(f"[stream_end] sent, acc_len={len(_stream_acc['text'])}, conn={conn_id}")
            except Exception as e:
                logger.warning(f"[stream_end] send failed: {e}, conn={conn_id}")
        else:
            if image_paths:
                result["attachments"] = [
                    {"url": "/uploads/" + os.path.basename(p), "name": os.path.basename(p), "category": "image", "type": "image"}
                    for p in image_paths
                ]
            # Attach server_time for accurate session ordering
            result["server_time"] = datetime.datetime.now().isoformat()
            resp = {
                "type": "response",
                "session_id": session_id,
                "data": result,
            }
            await ws.send(json.dumps(resp, ensure_ascii=False, default=str))
            logger.info(f"[response] sent, len={len(result.get('response',''))}, conn={conn_id}")

        # Check if generation was stopped by user — if so, skip sending response
        _se = _stop_events.get(conn_id)
        if _se and _se.is_set():
            logger.info(f"生成已被用户停止，跳过发送响应：conn={conn_id}")
            _se.clear()
            # 起源：更新快照
            if snapshot_mgr:
                await snapshot_mgr.batch_set([("is_sending", False), ("is_streaming", False), ("stream_text", "")])
            return

        # Reply finished — clear processing event so heartbeat works again
        _processing_events.get(conn_id, asyncio.Event()).clear()

        # 起源：更新快照
        if snapshot_mgr:
            await snapshot_mgr.batch_set([
                ("is_sending", False),
                ("is_streaming", False),
                ("stream_text", ""),
                ("active_session_id", session_id),
            ])
            # 同步 agents（含 sessions）
            from ai_agent.state.session_sync import sync_agents
            try:
                agents = sync_agents(snapshot_mgr)
                await snapshot_mgr.set("agents", agents)
            except Exception as e:
                logger.warning(f"[起源] sync_agents failed: {e}")
            # 同步 sessions 到快照
            from ai_agent.state.session_sync import sync_sessions as _sync_sessions
            try:
                _sessions = _sync_sessions(snapshot_mgr, agent)
                await snapshot_mgr.set("sessions", _sessions)
            except Exception as e:
                logger.warning(f"[起源] sync_sessions failed: {e}")
            # 同步 expanded_agents 到快照
            _expanded = [a["name"] for a in agents if a.get("expanded", True)]
            await snapshot_mgr.set("expanded_agents", _expanded)
            # 同步 messages 到快照（起源链路）
            try:
                active_s = agent.session_manager.active_sessions.get(session_id)
                if active_s and active_s.messages:
                    await snapshot_mgr.set_messages(active_s.messages)
                    logger.info(f"[起源] synced {len(active_s.messages)} messages for {session_id}")
            except Exception as e:
                logger.warning(f"[起源] sync_messages failed: {e}")

    ws_server = await ws_serve(ws_handler, "0.0.0.0", ws_port, max_size=10 * 1024 * 1024)
    logger.info(f"[计时] WebSocket 服务启动完成: {(time.time()-_t0)*1000:.0f}ms")
    logger.info(f"WebSocket 地址：ws://localhost:{ws_port}")
    logger.info("按 Ctrl+C 停止服务")

    # ===== Startup verification =====
    await _startup_check(_t0, port)

    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("siper 正在停止...")
        http_server.close()
        await http_server.wait_closed()
        ws_server.close()
        await ws_server.wait_closed()
        # 清理所有 agent 的 SessionManager
        for _sm in _agent_session_managers.values():
            try:
                await _sm.cleanup()
            except Exception:
                pass
        _agent_session_managers.clear()
        # 清理起源组件（无显式 cleanup，内存对象随 GC 回收）
        snapshot_mgr = None
        carrier_mgr = None
        # 关闭 ModelsDB（无显式 close，SQLite 连接随 GC 回收）
        # 关闭 agent
        await agent.shutdown()
        # 清理 PID 文件
        try:
            pid_file.unlink(missing_ok=True)
        except Exception:
            pass
        logger.info("siper 已停止")


if __name__ == "__main__":
    import os
    os.chdir(Path(__file__).parent)

    # 端口预检：如果端口已被占用，尝试杀掉旧进程后继续
    _pid_file = Path.home() / ".siper" / ".siper.pid"
    _pid_file.parent.mkdir(parents=True, exist_ok=True)

    def _kill_port_user(_port):
        """Kill the process listening on _port. Returns True if port is now free."""

        def _kill_pid(pid):
            try:
                if _is_win:
                    subprocess.run(
                        ["taskkill", "/PID", str(pid), "/F"],
                        capture_output=True, timeout=5
                    )
                else:
                    # signal is only imported on non-Windows; this branch never runs on Windows
                    os.kill(pid, signal.SIGKILL)  # type: ignore[attr-defined]
            except Exception:
                pass

        # 1. Try PID file first
        if _pid_file.exists():
            try:
                _old_pid = int(_pid_file.read_text().strip())
                print(f"  PID 文件中存在旧进程 PID={_old_pid}，尝试终止...")
                _kill_pid(_old_pid)
                import time
                time.sleep(1)
                if not _is_port_in_use(_port):
                    print(f"  旧进程已终止，端口 {_port} 已释放。")
                    return True
            except (ValueError, ProcessLookupError, OSError):
                pass
            # PID file stale, remove it
            _pid_file.unlink(missing_ok=True)

        # 2. Fallback: find process by port
        import subprocess
        try:
            if _is_win:
                _cmd = ["netstat", "-ano"]
                _result = subprocess.run(_cmd, capture_output=True, text=True, timeout=5)
                _pids = set()
                for _line in _result.stdout.splitlines():
                    if f":{_port}" in _line and "LISTENING" in _line:
                        _parts = _line.strip().split()
                        if _parts:
                            _pids.add(_parts[-1])
            else:
                _result = subprocess.run(
                    ["lsof", "-ti", f":{_port}"],
                    capture_output=True, text=True, timeout=5
                )
                _pids = [p for p in _result.stdout.strip().split("\n") if p]

            if _pids:
                for _p in _pids:
                    _kill_pid(int(_p))
                import time
                time.sleep(1)
                if not _is_port_in_use(_port):
                    print(f"  已终止端口 {_port} 上的进程，端口已释放。")
                    return True
        except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
            pass

        return False

    def _is_port_in_use(_port):
        _s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            _s.bind(("0.0.0.0", _port))
            _s.close()
            return False
        except OSError:
            return True

    _is_win = _platform.system() == "Windows"

    for _port in (9724, 9725):
        if _is_port_in_use(_port):
            print(f"\n⚠ 端口 {_port} 已被占用，尝试终止旧进程...")
            if not _kill_port_user(_port):
                # 即使端口仍被占用（TIME_WAIT），也继续启动
                # SO_REUSEADDR 允许绑定 TIME_WAIT 状态的端口
                print(f"⚠ 端口 {_port} 可能处于 TIME_WAIT 状态，将继续启动...")
                import time
                time.sleep(2)

    # 写入 PID 文件
    _pid_file.write_text(str(os.getpid()))

    while True:
        try:
            asyncio.run(main())
        except KeyboardInterrupt:
            print("\nShutdown complete")
            break
        except Exception as e:
            print(f"\n服务异常退出：{e}，5 秒后重启...")
            import time
            time.sleep(5)
