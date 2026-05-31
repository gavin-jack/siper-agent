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
_is_win = _platform.system() == "Windows"
if not _is_win:
    import signal
import socket
import sys
import time
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
from webui.task_manager import TaskManager  # noqa: E402

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
                ts INTEGER NOT NULL
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_ts ON token_usage(ts)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent)")
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
             "time": time.strftime("%H:%M:%S", time.localtime(r[5]))}
            for r in reversed(rows)
        ]
        _token_db_conn.commit()
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
            INSERT INTO token_usage (agent, model_id, prompt_tokens, completion_tokens, total_tokens, ts)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (entry.get("agent", ""), model_id, entry.get("prompt_tokens", 0),
              entry.get("completion_tokens", 0), entry.get("total_tokens", 0), ts))
        # Trim old entries
        cur.execute("SELECT COUNT(*) FROM token_usage")
        count = cur.fetchone()[0]
        if count > _TOKEN_USAGE_MAX:
            cur.execute("""
                DELETE FROM token_usage WHERE id IN (
                    SELECT id FROM token_usage ORDER BY id ASC LIMIT ?
                )
            """, (count - _TOKEN_USAGE_MAX,))
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
# Keep memory handler attached; optional: raise level to WARNING to hide INFO logs
root_logger.setLevel(logging.WARNING)
logger = logging.getLogger("siper_web")
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

TEMPLATE_DIR = PROJECT_ROOT / "webui" / "templates"
_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(TEMPLATE_DIR)),
    auto_reload=True,  # Auto-reload template on disk change (dev mode)
    enable_async=False,
)
_version = int(time.time())  # Cache-buster for JS/CSS
SIPER_VERSION = "v0.6.6"  # Current version — update on release


def _render_index() -> str:
    """Render index.html template with dynamic variables."""
    template = _jinja_env.get_template("index.html")
    html = template.render(
        version=_version,
        siper_version=SIPER_VERSION,
    )
    # Inject cache-busting JS version based on file mtime
    def _js_mtime(match: _re.Match) -> str:
        js_path = match.group(1)
        full = PROJECT_ROOT / "webui" / js_path.lstrip("/")
        if full.exists():
            return f'<script src="{js_path}?v={int(os.path.getmtime(full))}"></script>'
        return match.group(0)
    html = _re.sub(r'<script src="(/static/pages/[^"]+)"></script>', _js_mtime, html)
    # Inject cache-busting CSS version
    css_path = PROJECT_ROOT / "webui" / "static" / "style.css"
    if css_path.exists():
        html = html.replace(
            'href="/static/style.css"',
            f'href="/static/style.css?v={int(os.path.getmtime(css_path))}"',
        )
    return html



agent = None
start_time = time.time()
active_tasks = []

# ===== Scheduled Task Manager =====
# Simple cron-like scheduler using asyncio (no external dependencies)

import re as _re


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
    initialized = await agent.initialize()
    logger.info(f"[计时] Agent 初始化完成: {(time.time()-_t0)*1000:.0f}ms")
    if not initialized:
        logger.error("Agent 初始化失败")
        sys.exit(1)

    # Load per-agent config (icon, avatar, display_name, session_timeout, etc.) from config.json
    # NOTE: models are NOT stored in config.json — they live in models.json only
    from agents import load_agent_config_file
    agent_cfg = load_agent_config_file("default") or {}
    _cfg_key_default = ""
    # Load models from global models.json (v2 provider-grouped or v1 flat)
    _gm_path = PROJECT_ROOT / "models.json"
    _gm_models = []
    _gm_default = ""
    if _gm_path.exists():
        try:
            _gm = json.loads(_gm_path.read_text(encoding="utf-8"))
            if "providers" in _gm:
                # v2 format: flatten providers to flat list
                for prov_name, prov_cfg in _gm.get("providers", {}).items():
                    prov_base_url = prov_cfg.get("base_url", "")
                    prov_api_key = prov_cfg.get("api_key", "")
                    for m in prov_cfg.get("models", []):
                        # Per-model base_url/api_key fallback to provider level
                        _gm_models.append({
                            "id": m.get("id", m.get("name", "")),
                            "name": m.get("id", m.get("name", "")),
                            "alias": m.get("alias", ""),
                            "provider": prov_name,
                            "base_url": m.get("base_url", "") or prov_base_url,
                            "api_key": m.get("api_key", "") or prov_api_key,
                            "context_window": m.get("context_window", _CONTEXT_WINDOW_DEFAULT),
                            "capabilities": m.get("capabilities", []),
                        })
                _gm_default = _gm.get("default_model", _gm_models[0]["name"] if _gm_models else "")
            else:
                # v1 flat format — auto-upgrade on next save
                _gm_models = _gm.get("models", [])
                _gm_default = _gm.get("default_model", "")
            if _gm_models:
                logger.info(f"配置：从 models.json 加载了 {len(_gm_models)} 个模型，默认={_gm_default}")
        except Exception as e:
            logger.warning(f"配置：读取 models.json 失败: {e}")
    # API key priority: env LONGCAT_API_KEY > models.json default model key > .env file
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
        if agent_cfg.get("available_models"):
            agent.config.available_models = agent_cfg["available_models"]
        if agent_cfg.get("default_chat_model"):
            agent.config.default_chat_model = agent_cfg["default_chat_model"]
        if agent_cfg.get("default_vision_model"):
            agent.config.default_vision_model = agent_cfg["default_vision_model"]
        if agent_cfg.get("default_tts_model"):
            agent.config.default_tts_model = agent_cfg["default_tts_model"]
        # Legacy: if config.json still has models/default_model, migrate
        if agent_cfg.get("models") and not agent_cfg.get("available_models"):
            agent.config.available_models = [m.get("name", m.get("id", "")) for m in agent_cfg["models"]]
            agent.config.default_chat_model = agent_cfg.get("default_model", "")
            logger.info(f"配置：从旧格式迁移了 {len(agent.config.available_models)} 个模型引用")
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
                base_url=llm_cfg.get("base_url", "https://api.longcat.chat/openai"),
                model=llm_cfg.get("name", "LongCat-2.0-Preview"),
                vision_api_key=_sv_key,
                vision_base_url="https://token.sensenova.cn/v1",
                vision_model="sensenova-6.7-flash-lite",
            )
            logger.info(f"配置：LLM 来自 models.json — 模型={llm_cfg.get('name')}, 地址={llm_cfg.get('base_url')}")
        else:
            logger.warning("配置：无有效 API Key，LLM 未初始化 — 请在 Web UI 配置页面设置模型")
    else:
        if _lc_key:
            _def_model = _gm_default or "LongCat-2.0-Preview"
            agent.configure_llm(
                api_key=_lc_key,
                base_url="https://api.longcat.chat/openai",
                model=_def_model,
                vision_api_key=_sv_key,
                vision_base_url="https://token.sensenova.cn/v1",
                vision_model="sensenova-6.7-flash-lite",
            )
            logger.info(f"配置：未找到 config.json，使用环境变量 LLM 配置，模型={_def_model}")
        else:
            logger.warning("配置：无有效 API Key，LLM 未初始化 — 请在 Web UI 配置页面设置模型")

    # NOTE: coordinator is lazily initialized
    # on first use to reduce memory footprint when not needed.
    # Call _ensure_coordinator() before use.

    logger.info(f"Agent 已初始化：{agent.config.name}")
    logger.info(f"[计时] 配置加载完成: {(time.time()-_t0)*1000:.0f}ms")
    logger.info(f"Agent 配置：{agent.config.agent_name}")
    logger.info(f"已激活技能：{list(agent.active_skills.keys())}")
    logger.info(f"已注册工具：{agent.tool_registry.list_tools()}")
    logger.info(f"组件已加载：agent + 会话 + 工具 + 技能")

    # Initialize token usage DB (shared agents/token.db)
    _init_token_db()
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

    # Initialize task manager and start scheduler
    global task_manager
    task_manager = TaskManager(project_root=str(PROJECT_ROOT))
    task_manager.set_agent(agent)
    await task_manager.start_scheduler()

    # ===== HTTP handler with REST API =====
    ws_port = port + 1

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
                    except Exception:
                        pass

            # REST API routes
            resp = None

            if path == "/api/version" and method == "GET":
                resp = {"version": SIPER_VERSION, "name": "Siper AI Agent"}
            # 认证已禁用，跳过 auth guard
            elif path == "/api/sessions" and method == "GET":
                resp = api_get_sessions()
            elif path.startswith("/api/sessions/") and method == "GET":
                sid = path.split("/")[-1]
                resp = api_get_session_messages(sid)
            elif path.startswith("/api/sessions/") and method == "DELETE":
                sid = path.split("/")[-1]
                resp = api_delete_session(sid)
            elif path == "/api/sessions" and method == "DELETE":
                resp = api_clear_sessions()
            elif path == "/api/tasks" and method == "GET":
                resp = api_get_tasks()
            elif path == "/api/tasks" and method == "POST":
                resp = api_create_task(body)
            elif path.startswith("/api/tasks/") and method == "PUT":
                tid = path.split("/")[3]
                resp = api_update_task(tid, body)
            elif path.startswith("/api/tasks/") and method == "DELETE":
                tid = path.split("/")[3]
                resp = api_delete_task(tid)
            elif path.startswith("/api/tasks/") and path.endswith("/trigger") and method == "POST":
                tid = path.split("/")[3]
                resp = api_trigger_task(tid)
            elif path.startswith("/api/tasks/") and path.endswith("/history") and method == "GET":
                tid = path.split("/")[3]
                resp = api_get_task_history(tid)
            elif path == "/api/config" and method == "GET":
                resp = api_get_config()
            elif path == "/api/config" and method == "POST":
                resp = api_update_config(body)
            elif path == "/api/skills" and method == "GET":
                resp = api_get_skills()
            elif path == "/api/skills/preview" and method == "POST":
                resp = api_skill_preview(body)
            elif path == "/api/skills/stats" and method == "GET":
                resp = api_skill_stats()
            elif path == "/api/agents" and method == "GET":
                resp = api_get_agents()
            elif path == "/api/agents" and method == "POST":
                resp = api_switch_agent(body)
            elif path.startswith("/api/agents/") and path.endswith("/soul") and method == "GET":
                name = path.split("/")[3]
                resp = api_get_agent_soul(name)
            elif path.startswith("/api/agents/") and path.endswith("/soul") and method == "POST":
                name = path.split("/")[3]
                resp = api_save_agent_file(name, "soul", body)
            elif path.startswith("/api/agents/") and path.endswith("/config") and method == "GET":
                name = path.split("/")[3]
                resp = api_get_agent_config(name)
            elif path.startswith("/api/agents/") and path.endswith("/config") and method == "POST":
                name = path.split("/")[3]
                resp = api_save_agent_file(name, "config", body)
            elif path.startswith("/api/agents/") and path.endswith("/memory") and method == "GET":
                name = path.split("/")[3]
                resp = api_get_agent_memory(name)
            elif path.startswith("/api/agents/") and path.endswith("/memory") and method == "POST":
                name = path.split("/")[3]
                resp = api_save_agent_file(name, "memory", body)
            elif path.startswith("/api/agents/") and path.endswith("/meta") and method == "POST":
                name = path.split("/")[3]
                resp = api_save_agent_meta(name, body)
            elif path == "/api/gateway" and method == "GET":
                resp = api_get_gateway()
            elif path == "/api/gateway" and method == "POST":
                resp = api_control_gateway(body)
            elif path == "/api/status" and method == "GET":
                resp = api_get_status()
            elif path == "/api/memory" and method == "GET":
                resp = api_get_memory("default")
            elif path == "/api/memory" and method == "POST":
                resp = api_write_memory(body, "default")
            elif path == "/api/memory" and method == "DELETE":
                resp = api_delete_memory(body, "default")
            elif path == "/api/memory/config" and method == "GET":
                resp = api_get_memory_config("default")
            elif path == "/api/memory/config" and method == "POST":
                resp = api_save_memory_config(body, "default")
            elif path == "/api/models/global" and method == "GET":
                resp = api_get_global_models()
            elif path == "/api/models/global" and method == "POST":
                resp = api_save_global_models(body)
            elif path == "/api/models/discover" and method == "POST":
                resp = api_discover_models(body)
            elif path == "/api/models/test" and method == "POST":
                resp = await api_test_model(body)
            elif path == "/api/logs" and method == "GET":
                resp = api_get_logs(full_path)
            elif path == "/api/token" and method == "GET":
                resp = api_get_token_stats()
            elif path == "/api/upload" and method == "POST":
                resp = api_upload_file(body, request)
            elif path == "/api/avatar" and method == "GET":
                # Serve per-agent avatar
                avatar_path = None
                # Try active agent's avatar first
                if agent.config.avatar:
                    if agent.config.avatar.startswith("http://") or agent.config.avatar.startswith("https://"):
                        # Redirect to external URL
                        headers_list = [
                            "HTTP/1.1 302 Found",
                            f"Location: {agent.config.avatar}",
                            "Connection: close",
                            "",
                            "",
                        ]
                        writer.write("\r\n".join(headers_list).encode("utf-8"))
                        await writer.drain()
                        writer.close()
                        return
                    # Relative path from project root
                    candidate = Path(os.path.dirname(__file__)) / agent.config.avatar
                    if candidate.is_file():
                        avatar_path = candidate
                # Fallback: default avatar in agent dir
                if not avatar_path:
                    for name in (agent.config.agent_name, "default"):
                        candidate = Path(os.path.dirname(__file__)) / "agents" / name / "avatar.png"
                        if candidate.is_file():
                            avatar_path = candidate
                            break
                # Fallback: static default avatar
                if not avatar_path:
                    avatar_path = Path(os.path.dirname(__file__)) / "webui" / "static" / "default_avatar.png"
                if avatar_path and avatar_path.is_file():
                    av_data = avatar_path.read_bytes()
                    ct = "image/png"
                    ext = avatar_path.suffix.lower()
                    ext_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
                    if ext in ext_map:
                        ct = ext_map[ext]
                    headers_list = [
                        "HTTP/1.1 200 OK",
                        f"Content-Type: {ct}",
                        f"Content-Length: {len(av_data)}",
                        "Cache-Control: public, max-age=86400",
                        "Connection: close",
                        "",
                        "",
                    ]
                    writer.write("\r\n".join(headers_list).encode("utf-8") + av_data)
                    await writer.drain()
                    writer.close()
                    return
                else:
                    resp = {"error": "Avatar not found"}

            elif path == "/api/avatar/upload" and method == "POST":
                resp = _handle_avatar_upload(body, agent)

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
                    content_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".css": "text/css", ".js": "application/javascript"}
                    ct = content_types.get(ext, "application/octet-stream")
                    with open(resolved, "rb") as f:
                        file_data = f.read()
                    # JS/CSS: gzip compress if client supports it
                    cache_hdr = "Cache-Control: public, max-age=86400" if ct.startswith("image/") or ct.startswith("font/") else "Cache-Control: no-cache, must-revalidate"
                    accept_encoding = req_headers.get("accept-encoding", "")
                    if ext in (".css", ".js") and "gzip" in accept_encoding:
                        import gzip as _gzip
                        compressed = _gzip.compress(file_data, compresslevel=9)
                        headers_list = [
                            "HTTP/1.1 200 OK",
                            f"Content-Type: {ct}",
                            f"Content-Length: {len(compressed)}",
                            "Content-Encoding: gzip",
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
        logger.info(f"api_get_sessions: active={len(agent.session_manager.active_sessions)}, db_conn={'OK' if agent.session_manager._db_connection else 'NULL'}")
        # Collect from active sessions (in-memory, have real messages)
        # Skip unsaved sessions (not yet persisted to DB — no AI reply yet)
        unsaved = getattr(agent.session_manager, '_unsaved_sessions', set())
        for sid, s in agent.session_manager.active_sessions.items():
            if sid in unsaved:
                continue  # Skip sessions that haven't been persisted yet
            msg_count = len(s.messages)
            if msg_count == 0:
                continue  # Skip empty sessions
            last_msg = s.messages[-1] if s.messages else None
            sessions.append({
                "session_id": sid,
                "user_id": s.user_id,
                "created_at": s.created_at,
                "updated_at": last_msg["timestamp"] if last_msg else s.created_at,
                "messages": msg_count,
                "active": s.ended_at is None,
                "last_message": (last_msg["content"][:80] if last_msg and last_msg.get("content") else ""),
            })
        # Also get from DB (persisted sessions with messages)
        try:
            cursor = agent.session_manager._db_connection.cursor()
            cursor.execute("SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?", (_SESSION_LIST_LIMIT,))
            existing_ids = {s["session_id"] for s in sessions}
            for row in cursor.fetchall():
                if row["session_id"] in existing_ids:
                    continue
                # Check message count
                cursor2 = agent.session_manager._db_connection.cursor()
                cursor2.execute("SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?", (row["session_id"],))
                msg_row = cursor2.fetchone()
                msg_count = msg_row["cnt"] if msg_row else 0
                if msg_count == 0:
                    continue  # Skip empty sessions
                # Get last message
                cursor2.execute("SELECT content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1", (row["session_id"],))
                last = cursor2.fetchone()
                sessions.append({
                    "session_id": row["session_id"],
                    "user_id": row["user_id"],
                    "created_at": row["created_at"],
                    "updated_at": last["timestamp"] if last else row["created_at"],
                    "messages": msg_count,
                    "active": row["ended_at"] is None,
                    "last_message": (last["content"][:80] if last else ""),
                })
        except Exception as e:
            logger.error(f"api_get_sessions DB 查询失败：{e}")
        # Sort by updated_at descending (most recent activity first)
        sessions.sort(key=lambda s: s.get("updated_at", s["created_at"]), reverse=True)
        return {"sessions": sessions}

    def api_get_session_messages(sid):
        """Get messages for a specific session (latest 50 only)."""
        try:
            # Try in-memory first (only if session has been persisted)
            unsaved = getattr(agent.session_manager, '_unsaved_sessions', set())
            if sid not in unsaved and sid in agent.session_manager.active_sessions:
                session = agent.session_manager.active_sessions[sid]
                messages = session.messages[-50:]
            else:
                # Load from DB — only latest 50
                cursor = agent.session_manager._db_connection.cursor()
                cursor.execute(
                    "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 50",
                    (sid,)
                )
                messages = [dict(row) for row in cursor.fetchall()]
                messages.reverse()  # Restore chronological order
            # Format messages for frontend
            result = []
            for m in messages:
                entry = {
                    "role": m.get("role", m.get("message", {}).get("role", "unknown")),
                    "content": m.get("content", m.get("message", {}).get("content", "")),
                    "timestamp": m.get("timestamp", ""),
                    "session_id": sid,
                }
                # Handle both dict and Message object
                if isinstance(m.get("message"), dict):
                    entry["role"] = m["message"].get("role", "unknown")
                    entry["content"] = m["message"].get("content", "")
                # Attach meta data for agent messages (used by dict modal)
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
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_delete_session(sid):
        try:
            asyncio.get_event_loop().create_task(agent.session_manager.end_session(sid))
            # Also remove from DB
            try:
                cursor = agent.session_manager._db_connection.cursor()
                cursor.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
                cursor.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
                agent.session_manager._db_connection.commit()
            except Exception:
                pass
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_clear_sessions():
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

    def api_get_tasks():
        if task_manager:
            tasks = task_manager.get_all()
            return {"tasks": tasks}
        return {"tasks": []}

    def api_create_task(body):
        try:
            name = body.get("name", "").strip()
            prompt = body.get("prompt", "").strip()
            cron = body.get("cron", "0 * * * *").strip()
            enabled = body.get("enabled", True)
            if not name:
                return {"success": False, "error": "任务名称不能为空"}
            if not prompt:
                return {"success": False, "error": "任务提示词不能为空"}
            if not cron:
                return {"success": False, "error": "cron 表达式不能为空"}
            task = task_manager.create(name, prompt, cron, enabled)
            logger.info(f"任务已创建：{name} ({task['id']})")
            return {"success": True, "task": task}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_update_task(tid, body):
        try:
            updates = {}
            if "name" in body:
                updates["name"] = body["name"]
            if "prompt" in body:
                updates["prompt"] = body["prompt"]
            if "cron" in body:
                updates["cron"] = body["cron"]
            if "enabled" in body:
                updates["enabled"] = body["enabled"]
            task = task_manager.update(tid, updates)
            if task:
                logger.info(f"任务已更新：{task['name']} ({task['id']})")
                return {"success": True, "task": task}
            return {"success": False, "error": "任务不存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_delete_task(tid):
        try:
            ok = task_manager.delete(tid)
            if ok:
                logger.info(f"任务已删除：{tid}")
                return {"success": True}
            return {"success": False, "error": "任务不存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_trigger_task(tid):
        try:
            ok = task_manager.trigger_now(tid)
            if ok:
                return {"success": True, "message": "任务已触发"}
            return {"success": False, "error": "任务不存在"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def api_get_task_history(tid):
        try:
            history = task_manager.get_history(tid)
            return {"history": history}
        except Exception as e:
            return {"history": [], "error": str(e)}

    def api_get_config():
        metrics = agent.metrics.get_summary()
        llm_client = agent.llm_client
        # Get models from global models.json
        _gm_path = _global_models_path()
        _all_models = []
        _gm_default = ""
        if _gm_path.exists():
            try:
                _gm_data = json.loads(_gm_path.read_text(encoding="utf-8"))
                if "providers" in _gm_data:
                    for _pn, _pc in _gm_data.get("providers", {}).items():
                        for _m in _pc.get("models", []):
                            _all_models.append({
                                "id": _m.get("id", _m.get("name", "")),
                                "name": _m.get("id", _m.get("name", "")),
                                "alias": _m.get("alias", ""),
                                "provider": _pn,
                                "base_url": _m.get("base_url", "") or _pc.get("base_url", ""),
                                "api_key": _m.get("api_key", "") or _pc.get("api_key", ""),
                                "context_window": _m.get("context_window", _CONTEXT_WINDOW_DEFAULT),
                                "capabilities": _m.get("capabilities", []),
                                "is_default": _m.get("is_default", False),
                            })
                    _gm_default = _gm_data.get("default_model", "")
                else:
                    _all_models = _gm_data.get("models", [])
                    _gm_default = _gm_data.get("default_model", "")
            except Exception:
                pass
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
            },
        }

    def api_update_config(body):
        try:
            # If model/base_url/api_key changed, rebuild LLMClient via configure_llm
            new_model = body.get("model", "")
            new_base_url = body.get("base_url", "")
            new_api_key = body.get("api_key", "")
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
                        vision_base_url="https://token.sensenova.cn/v1",
                        vision_model="sensenova-6.7-flash-lite",
                    )
                    logger.info(f"LLM 客户端已更新：模型={rebuild_model}, 地址={rebuild_base_url}")
                else:
                    logger.warning("配置更新：未提供 API Key，跳过 LLM 客户端重建")
            if "agent_name" in body:
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
                    _sf.write_text(json.dumps(_cfg, indent=2, ensure_ascii=False), encoding="utf-8")
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
                # Save models to models.json (NOT config.json)
                _save_models_to_json(body["models"], body.get("default_model", ""))
            if "default_model" in body:
                agent.config.default_chat_model = body["default_model"]
            # Persist non-model settings to config.json (models go to models.json only)
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
        skills = []
        # New format: from skill_registry
        if agent.skill_registry:
            for name, entry in agent.skill_registry.skills.items():
                stats = agent.skill_feedback.get_stats(name) if agent.skill_feedback else None
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
                        "triggered": stats.triggered if stats else 0,
                        "selected": stats.selected if stats else 0,
                        "success_rate": (
                            stats.success_count / max(stats.success_count + stats.fail_count, 1)
                            if stats else 0
                        ),
                    } if stats else None,
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
            matched = agent.skill_pre_filter.pre_filter(user_input, top_k=top_k)
            return {
                "matched": [
                    {
                        "name": e.name,
                        "description": e.description,
                        "capabilities": e.capabilities,
                    }
                    for e in matched
                ],
                "total": len(matched),
            }
        except Exception as e:
            return {"matched": [], "error": str(e)}

    def api_skill_stats():
        """Get skill usage statistics"""
        if not agent.skill_feedback:
            return {"stats": {}}
        report = agent.skill_feedback.get_report()
        return {"stats": report}

    def api_get_agents():
        try:
            from agents import list_agents, get_agent_dir, load_agent_config_file
            available = list_agents()
            result = []
            for name in available:
                agent_dir = get_agent_dir(name)
                soul_exists = (agent_dir / "soul.md").exists() if agent_dir else False
                config_exists = (agent_dir / "agent.md").exists() if agent_dir else False
                memory_exists = (agent_dir / "memory.md").exists() if agent_dir else False
                # Load per-agent config (icon, avatar, models, display name) from config.json
                cfg = load_agent_config_file(name)
                result.append({
                    "name": name,
                    "display_name": cfg.get("name", name),
                    "icon": cfg.get("icon", "🎭"),
                    "avatar": cfg.get("avatar", ""),
                    "has_soul": soul_exists,
                    "has_config": config_exists,
                    "has_memory": memory_exists,
                    "is_active": name == agent.config.agent_name,
                    # Legacy fields (for backward compat)
                    "models": cfg.get("models", []),
                    "default_model": cfg.get("default_model", ""),
                    # New model reference fields
                    "available_models": cfg.get("available_models", []),
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
                    pass  # models are saved to models.json only
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
                        agent.configure_llm(
                            api_key=rebuild_api_key,
                            base_url=rebuild_base_url,
                            model=rebuild_model,
                            vision_api_key=vision_key,
                            vision_base_url="https://token.sensenova.cn/v1",
                            vision_model="sensenova-6.7-flash-lite",
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
            from agents import load_agent_config, get_agent_dir
            agent_dir = get_agent_dir(name)
            if not agent_dir:
                return {"error": "agent not found", "config": ""}
            cfg = load_agent_config(name)
            return {"name": name, "config": cfg}
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

    def api_get_gateway():
        _host = socket.gethostname() or "localhost"
        services = [
            {
                "name": "HTTP Server",
                "type": "http",
                "endpoint": f"http://{_host}:{port}",
                "status": "running",
            },
            {
                "name": "WebSocket",
                "type": "ws",
                "endpoint": f"ws://{_host}:{ws_port}",
                "status": "running",
            },
            {
                "name": "Session Manager",
                "type": "internal",
                "endpoint": "",
                "status": "running",
            },
            {
                "name": "LLM Client",
                "type": "api",
                "endpoint": "https://api.longcat.chat/openai",
                "status": "running" if agent.llm_client else "stopped",
            },
        ]
        return {"services": services}

    def api_control_gateway(body):
        action = body.get("action", "")
        service_name = body.get("service", "")

        nonlocal http_server, ws_server

        if action == "restart_all":
            # Full process restart: re-exec the same process
            logger.info("通过 API 请求重启网关")
            try:
                # Schedule restart after sending response
                loop = asyncio.get_event_loop()
                loop.call_later(1, lambda: os.execv(sys.executable, [sys.executable] + sys.argv))
                return {"success": True, "action": "restart_all", "message": "Gateway restarting..."}
            except Exception as e:
                return {"success": False, "error": str(e)}

        if action == "restart" and service_name:
            # Restart a specific service
            if service_name in ("HTTP Server", "WebSocket"):
                # For server components, use restart_all
                logger.info(f"通过 API 请求重启网关（服务：{service_name}）")
                try:
                    loop = asyncio.get_event_loop()
                    loop.call_later(1, lambda: os.execv(sys.executable, [sys.executable] + sys.argv))
                    return {"success": True, "service": service_name, "message": "Gateway restarting (full process)..."}
                except Exception as e:
                    return {"success": False, "error": str(e)}

            elif service_name == "LLM Client":
                try:
                    api_key = os.environ.get("LONGCAT_API_KEY", "")
                    if not api_key:
                        return {"success": False, "error": "LONGCAT_API_KEY 未设置，无法启动 LLM Client"}
                    agent.configure_llm(
                        api_key=api_key,
                        base_url="https://api.longcat.chat/openai",
                        model="LongCat-2.0-Preview",
                    )
                    return {"success": True, "service": service_name, "message": "LLM Client re-initialized"}
                except Exception as e:
                    return {"success": False, "error": str(e)}

            elif service_name == "Session Manager":
                try:
                    agent.session_manager.active_sessions.clear()
                    return {"success": True, "service": service_name, "message": "Active sessions cleared"}
                except Exception as e:
                    return {"success": False, "error": str(e)}

            else:
                return {"success": False, "error": f"Unknown service: {service_name}"}

        elif action == "stop" and service_name:
            if service_name == "HTTP Server":
                try:
                    http_server.close()
                    return {"success": True, "service": service_name, "message": "HTTP Server stopped"}
                except Exception as e:
                    return {"success": False, "error": str(e)}
            elif service_name == "WebSocket":
                try:
                    if ws_server:
                        ws_server.close()
                    return {"success": True, "service": service_name, "message": "WebSocket stopped"}
                except Exception as e:
                    return {"success": False, "error": str(e)}
            elif service_name == "LLM Client":
                try:
                    agent.llm_client = None
                    return {"success": True, "service": service_name, "message": "LLM Client stopped"}
                except Exception as e:
                    return {"success": False, "error": str(e)}
            else:
                return {"success": False, "error": f"Cannot stop service: {service_name}"}

        return {"success": False, "error": "Invalid action or missing 'service'"}

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

    # ===== Global Models API =====

    def _global_models_path():
        return PROJECT_ROOT / "models.json"

    def _save_models_to_json(models, default_model):
        """Save models list to models.json (v2 format)."""
        p = _global_models_path()
        providers = {}
        for m in models:
            prov = m.get("provider", "custom")
            if prov not in providers:
                providers[prov] = {"base_url": m.get("base_url", ""), "api_key": m.get("api_key", ""), "models": []}
            providers[prov]["models"].append({
                "id": m.get("name", m.get("id", "")),
                "name": m.get("name", m.get("id", "")),
                "alias": m.get("alias", ""),
                "base_url": m.get("base_url", ""),
                "api_key": m.get("api_key", ""),
                "context_window": m.get("context_window", _CONTEXT_WINDOW_DEFAULT),
                "capabilities": m.get("capabilities", []),
                "is_default": (m.get("name", m.get("id", "")) == default_model),
            })
        data = {"version": 2, "providers": providers,
                "default_provider": models[0].get("provider", "custom") if models else "",
                "default_model": default_model}
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"模型配置已保存到 models.json：{len(models)} 个模型，默认={default_model}")

    def api_save_global_models(body):
        p = _global_models_path()
        # Load existing (supports both v1 flat and v2 provider-grouped formats)
        data = {}
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass
        # Detect format version
        is_v2 = "providers" in data
        if is_v2:
            # v2 format: { providers: { name: { models: [...] } }, default_provider, default_model }
            if "providers" in body:
                data["providers"] = body["providers"]
            if "default_provider" in body:
                data["default_provider"] = body["default_provider"]
            if "default_model" in body:
                data["default_model"] = body["default_model"]
            # Also accept flat models list and convert
            if "models" in body and "providers" not in body:
                # Assume single-provider update using default_provider
                dp = data.get("default_provider", "custom")
                if dp not in data.get("providers", {}):
                    data.setdefault("providers", {})[dp] = {"base_url": "", "api_key": "", "models": []}
                data["providers"][dp]["models"] = body["models"]
                if body.get("default_model"):
                    data["default_model"] = body["default_model"]
        else:
            # v1 format (flat): { models: [...], default_model: "..." }
            # Auto-upgrade to v2 on save
            old_models = data.get("models", [])
            old_default = data.get("default_model", "")
            if "models" in body:
                new_models = body["models"]
            else:
                new_models = old_models
            # Build v2 from v1 + new data
            providers = {}
            for m in new_models:
                prov = m.get("provider", "custom")
                if prov not in providers:
                    providers[prov] = {
                        "base_url": m.get("base_url", ""),
                        "api_key": m.get("api_key", ""),
                        "models": [],
                    }
                providers[prov]["models"].append({
                    "id": m.get("name", m.get("id", "")),
                    "name": m.get("name", m.get("id", "")),
                    "alias": m.get("alias", ""),
                    "base_url": m.get("base_url", ""),
                    "api_key": m.get("api_key", ""),
                    "context_window": m.get("context_window", _CONTEXT_WINDOW_DEFAULT),
                    "capabilities": m.get("capabilities", []),
                    "is_default": (m.get("name", m.get("id", "")) == body.get("default_model", old_default)),
                })
            data = {
                "version": 2,
                "providers": providers,
                "default_provider": body.get("default_provider") or (new_models[0].get("provider", "custom") if new_models else "custom"),
                "default_model": body.get("default_model", old_default),
            }
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"success": True, "version": 2 if "providers" in data else 1}

    def api_get_global_models():
        p = _global_models_path()
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                # Return in frontend-friendly flat format
                is_v2 = "providers" in data
                if is_v2:
                    # Flatten v2 to flat list for frontend
                    flat_models = []
                    for prov_name, prov_cfg in data.get("providers", {}).items():
                        prov_base_url = prov_cfg.get("base_url", "")
                        prov_api_key = prov_cfg.get("api_key", "")
                        for m in prov_cfg.get("models", []):
                            flat_models.append({
                                "id": m.get("id", m.get("name", "")),
                                "name": m.get("id", m.get("name", "")),
                                "alias": m.get("alias", ""),
                                "provider": prov_name,
                                "base_url": m.get("base_url", "") or prov_base_url,
                                "api_key": m.get("api_key", "") or prov_api_key,
                                "context_window": m.get("context_window", _CONTEXT_WINDOW_DEFAULT),
                                "capabilities": m.get("capabilities", []),
                                "is_default": m.get("is_default", False),
                            })
                    return {
                        "version": 2,
                        "models": flat_models,
                        "default_model": data.get("default_model", ""),
                        "default_provider": data.get("default_provider", ""),
                    }
                else:
                    # v1 flat format — return as-is
                    return data
            except Exception:
                pass
        return {"version": 2, "models": [], "default_model": "", "default_provider": ""}

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

    def _estimate_context_window(model_id):
        """Estimate context window (tokens) from model name."""
        if not model_id:
            return 8192
        mid = model_id.lower()
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
        Body: { "base_url": "...", "api_key": "...", "model": "...", "provider": "..." }
        Returns: { "success": true/false, "response": "...", "latency_ms": N, "error": "...",
                   "capabilities": ["vision", "function_calling", ...] }
        """
        import urllib.request as _urllib_request
        import ssl as _ssl
        base_url = (body.get("base_url") or "").rstrip("/")
        api_key = body.get("api_key", "")
        model = body.get("model", "")
        if not base_url or not model:
            return {"success": False, "error": "Base URL 和模型名称不能为空"}
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

            def _extract_message_content(msg_dict):
                """Extract the best text content from a message dict.
                Some models (e.g. SenseNova) put reasoning in 'reasoning' field
                and leave 'content' empty. We merge them."""
                content = (msg_dict.get("content") or "").strip()
                reasoning = (msg_dict.get("reasoning") or "").strip()
                if content and reasoning:
                    return content + "\n" + reasoning
                return content or reasoning

            detected_caps = []

            # ===== Step 0: try to get model info from /models endpoint =====
            # Some providers (OpenAI, OpenRouter) return capabilities in model metadata
            try:
                models_url = base_url + "/models" if not base_url.endswith("/v1") else base_url.replace("/v1", "") + "/models"
                req = _urllib_request.Request(
                    models_url,
                    headers={"Authorization": f"Bearer {api_key}"},
                    method="GET",
                )
                resp = _urllib_request.urlopen(req, timeout=10, context=ctx)
                models_data = json.loads(resp.read().decode("utf-8"))
                for m in (models_data.get("data") or []):
                    mid = m.get("id", "")
                    if mid == model:
                        # Extract capabilities from model metadata
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
                        # Check architecture/modality
                        arch = m.get("architecture", {})
                        if isinstance(arch, dict):
                            modality = (arch.get("modality") or "").lower()
                            if "image" in modality and "vision" not in detected_caps:
                                detected_caps.append("vision")
                        break
            except Exception:
                pass  # /models endpoint may not exist

            # ===== Step 1: basic connectivity =====
            t0 = time.time()
            raw = _post({
                "model": model,
                "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                "max_tokens": 5,
                "temperature": 0,
            })
            latency_ms = round((time.time() - t0) * 1000)
            content = ""
            choices = raw.get("choices", [])
            if choices:
                content = _extract_message_content(choices[0].get("message", {}))

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
                    # Strong signals: explicit reasoning fields or CoT tags
                    has_reasoning_field = bool(msg_r.get("reasoning_content")) or bool(msg_r.get("reasoning"))
                    has_think_tag = "<think>" in reply or "</think>" in reply
                    # Moderate signals: structured step-by-step in content
                    reasoning_words = ("step", "therefore", "because", "reasoning",
                                       "first", "second", "third", "let's think",
                                       "let me think", "so the", "thus", "hence",
                                       "thinking process", "analysis")
                    has_step_words = sum(1 for w in reasoning_words if w in reply_lower) >= 3
                    # Answer quality: correct answer ($0.05) indicates real reasoning
                    has_correct_answer = "0.05" in reply or "5 cents" in reply_lower or "5 cent" in reply_lower
                    if has_reasoning_field or has_think_tag:
                        detected_caps.append("reasoning")
                    elif has_step_words and has_correct_answer and len(reply) > 80:
                        detected_caps.append("reasoning")
            except Exception as e:
                logger.debug(f"模型 {model} reasoning 探测异常: {e}")

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
                    # Strong code indicators: fenced code blocks with python, or proper function structure
                    has_code_block = "```python" in reply_c or "```py" in reply_c or "```\ndef " in reply_c
                    has_function_def = "def " in reply_c and "return " in reply_c and ("(" in reply_c and "):" in reply_c)
                    has_code_keywords = sum(1 for kw in ("def ", "return ", "for ", "if ", "else:", "import ", "class ", "print(")
                                            if kw in reply_c) >= 3
                    if has_code_block or (has_function_def and has_code_keywords):
                        detected_caps.append("code")
            except Exception as e:
                logger.debug(f"模型 {model} code 探测异常: {e}")

            # ===== Step 4: probe vision =====
            # Use a 16x16 red square PNG (larger than 1x1, easier for models to recognize)
            # A model truly supports vision only if:
            #   (a) the API accepts the request (no error), AND
            #   (b) image_tokens > 0 in usage, AND
            #   (c) the response content is meaningful (not empty/evasive)
            try:
                import base64 as _b64
                # 16x16 red square PNG (valid, larger than 1x1)
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
                    usage = raw_rv.get("usage", {})
                    image_tokens = (
                        usage.get("image_tokens", 0)
                        or usage.get("prompt_tokens_details", {}).get("image_tokens", 0)
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
                    else:
                        logger.info(
                            f"模型 {model} 不支持 vision: image_tokens={image_tokens}, "
                            f"content={rv_content[:80]!r}, evasive={is_evasive}"
                        )
            except Exception as e:
                logger.debug(f"模型 {model} vision 探测异常: {e}")

            # ===== Step 5: probe function_calling =====
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
                    if msg_fc.get("tool_calls"):
                        detected_caps.append("function_calling")
            except Exception as e:
                logger.debug(f"模型 {model} function_calling 探测异常: {e}")

            # ===== Step 6: probe long_context =====
            try:
                # ~4.5K chars of repeating text + a question that requires reading the full context
                big_block = "The quick brown fox jumps over the lazy dog. " * 100
                raw_lc = _post({
                    "model": model,
                    "messages": [{"role": "user", "content": big_block + "\nWhat animal jumps over the lazy dog? Answer in one word."}],
                    "max_tokens": 10,
                    "temperature": 0,
                })
                choices_lc = raw_lc.get("choices", [])
                if choices_lc:
                    msg_lc = choices_lc[0].get("message", {})
                    lc_content = _extract_message_content(msg_lc).strip()
                    finish = choices_lc[0].get("finish_reason", "")
                    # finish_reason=stop + correct answer ("fox") proves full context was read
                    if finish == "stop" and "fox" in lc_content.lower():
                        detected_caps.append("long_context")
            except Exception as e:
                logger.debug(f"模型 {model} long_context 探测异常: {e}")

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
                "capabilities": unique_caps,
            }

        try:
            return await asyncio.to_thread(_do_test)
        except Exception as e:
            logger.warning(f"模型测试失败: {model} @ {chat_url} — {e}")
            return {"success": False, "error": str(e)}

    # ===== Token Stats API =====

    def api_get_token_stats():
        history = list(_token_usage_history)
        total_prompt = sum(h["prompt_tokens"] for h in history)
        total_completion = sum(h["completion_tokens"] for h in history)
        total = sum(h["total_tokens"] for h in history)
        ctx_window = 1_000_000
        # Per-model breakdown
        model_map = {}
        for h in history:
            m = h.get("model", "unknown")
            if m not in model_map:
                model_map[m] = {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            model_map[m]["requests"] += 1
            model_map[m]["prompt_tokens"] += h.get("prompt_tokens", 0)
            model_map[m]["completion_tokens"] += h.get("completion_tokens", 0)
            model_map[m]["total_tokens"] += h.get("total_tokens", 0)
        model_stats = sorted(
            [{"model": k, **v} for k, v in model_map.items()],
            key=lambda x: -x["total_tokens"]
        )
        # Per-date breakdown (from shared token DB)
        date_map = {}
        hourly_raw = {}
        now = time.time()
        try:
            if _token_db_conn:
                cur = _token_db_conn.cursor()
                # Per-date stats (last 30 days)
                cur.execute("""
                    SELECT DATE(ts, 'unixepoch', 'localtime') as d,
                           SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens), COUNT(*)
                    FROM token_usage
                    WHERE ts > ?
                    GROUP BY d ORDER BY d ASC
                """, (int(now - 30 * 86400),))
                for row in cur.fetchall():
                    date_map[row[0]] = {
                        "prompt_tokens": row[1], "completion_tokens": row[2],
                        "total_tokens": row[3], "requests": row[4]
                    }
                # Per-hour stats (last 24 consecutive hours, anchored to current hour)
                # Group by floor(ts/3600) to get contiguous 24 hourly buckets
                cur.execute("""
                    SELECT (ts / 3600) as hour_bucket,
                           SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens), COUNT(*)
                    FROM token_usage
                    WHERE ts > ?
                    GROUP BY hour_bucket ORDER BY hour_bucket ASC
                """, (int(now - 86400),))
                hourly_raw = {}
                for row in cur.fetchall():
                    hourly_raw[row[0]] = {
                        "prompt_tokens": row[1], "completion_tokens": row[2],
                        "total_tokens": row[3], "requests": row[4]
                    }
        except Exception as e:
            logger.warning(f"Token time-stats query failed: {e}")
            hourly_raw = {}
        # Build 24-slot list: from (current_hour+1 of yesterday) to current_hour of today
        # Label shows only the ending hour of each bucket, e.g. "11" = 10:00~10:59
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
        return {
            "history": history,
            "total_requests": len(history),
            "total_prompt_tokens": total_prompt,
            "total_completion_tokens": total_completion,
            "total_tokens": total,
            "context_window": ctx_window,
            "model": "LongCat-2.0-Preview",
            "model_stats": model_stats,
            "date_stats": date_map,
            "hourly_stats": hourly,
        }

    # ===== Avatar Upload API =====

    def _handle_avatar_upload(body, agent_ref):
        """Handle agent avatar upload. Save to agents/<name>/avatar.png.
        JSON body: { "image": "data:image/png;base64,...", "agent": "default" }
        """
        import base64 as _b64, shutil as _shutil, json as _json
        ALLOWED_TYPES = {
            "image/png": b"\x89PNG\r\n\x1a\n",
            "image/jpeg": b"\xff\xd8\xff",
            "image/gif": b"GIF87a",
            "image/webp": b"RIFF",
        }
        MAX_SIZE = 2 * 1024 * 1024  # 2MB for avatar

        image_data = body.get("image", "")
        target_agent = body.get("agent", agent_ref.config.agent_name or "default")
        if not image_data:
            return {"success": False, "error": "未提供图片数据"}

        try:
            if image_data.startswith("data:"):
                header, b64_data = image_data.split(",", 1)
                mime = header.split(";")[0].split(":")[1] if ";" in header else "image/png"
            else:
                b64_data = image_data
                mime = "image/png"

            if mime not in ALLOWED_TYPES:
                return {"success": False, "error": f"不支持的图片类型：{mime}"}

            raw_bytes = _b64.b64decode(b64_data)

            if len(raw_bytes) > MAX_SIZE:
                return {"success": False, "error": f"图片过大（{len(raw_bytes)//1024}KB），最大允许 {MAX_SIZE//1024}KB"}

            magic = ALLOWED_TYPES[mime]
            if not raw_bytes.startswith(magic):
                if mime == "image/webp" and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
                    pass
                else:
                    return {"success": False, "error": "图片格式与声明类型不一致"}

            # Determine file extension
            ext_map = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}
            ext = ext_map.get(mime, ".png")

            # Save to agent directory
            agent_dir = Path(os.path.dirname(__file__)) / "agents" / target_agent
            agent_dir.mkdir(parents=True, exist_ok=True)
            avatar_file = agent_dir / f"avatar{ext}"
            avatar_file.write_bytes(raw_bytes)

            # Update config.json with relative path
            cfg_path = agent_dir / "config.json"
            cfg = {}
            if cfg_path.exists():
                try:
                    cfg = _json.loads(cfg_path.read_text(encoding="utf-8"))
                except Exception:
                    pass
            rel_path = f"agents/{target_agent}/avatar{ext}"
            cfg["avatar"] = rel_path
            cfg_path.write_text(_json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

            # Update runtime agent config
            if target_agent == agent_ref.config.agent_name:
                agent_ref.config.avatar = rel_path

            logger.info(f"头像已保存：{avatar_file} ({len(raw_bytes)} 字节)")
            return {"success": True, "path": rel_path, "size": len(raw_bytes)}

        except Exception as e:
            logger.error(f"头像上传失败：{e}")
            return {"success": False, "error": str(e)}

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
        import base64 as _b64

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

            raw_bytes = _b64.b64decode(b64_data)

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
    http_server = await asyncio.start_server(handle_request, "0.0.0.0", port)
    logger.info(f"[计时] HTTP 服务启动完成: {(time.time()-_t0)*1000:.0f}ms")
    logger.info(f"Web UI 地址：http://localhost:{port}")

    # ===== WebSocket server =====
    connections = {}

    # Per-connection message queues: conn_id -> asyncio.Queue
    _msg_queues: Dict[str, asyncio.Queue] = {}
    _msg_queue_locks: Dict[str, asyncio.Lock] = {}

    # Map conn_id -> persistent session_id
    _conn_sessions: Dict[str, str] = {}

    # Map conn_id -> stop event (set when user clicks stop)
    _stop_events: Dict[str, asyncio.Event] = {}

    # Map conn_id -> processing event (set while reply is in progress)
    _processing_events: Dict[str, asyncio.Event] = {}

    async def ws_handler(ws):
        conn_id = str(id(ws))
        sys.stdout.flush()
        connections[conn_id] = ws
        ws._auth_ok = True  # 认证已禁用，直接标记为已认证
        # Create per-connection queue
        _msg_queues[conn_id] = asyncio.Queue()
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
                        # Set stop event so _process_ws_message can check it
                        if conn_id in _stop_events:
                            _stop_events[conn_id].set()
                        consumer_task.cancel()
                        # Recreate consumer for subsequent messages
                        consumer_task = asyncio.create_task(_ws_msg_consumer(ws, conn_id))
                        await ws.send(json.dumps({"type": "stopped", "message": "Generation stopped"}))
                    elif data.get("type") == "new_session":
                        # Create a new persistent session for this connection
                        old_sid = _conn_sessions.get(conn_id)
                        # Discard old unsaved session
                        if old_sid and old_sid in getattr(agent.session_manager, '_unsaved_sessions', set()):
                            agent.session_manager.active_sessions.pop(old_sid, None)
                            agent.session_manager._unsaved_sessions.discard(old_sid)
                            logger.info(f"新会话：已丢弃旧的未持久化会话：{old_sid}")
                        new_sid = await agent.session_manager.create_session("web_user")
                        _conn_sessions[conn_id] = new_sid
                        logger.info(f"新会话：conn={conn_id}, old={old_sid}, new={new_sid}")
                        await ws.send(json.dumps({
                            "type": "session_created",
                            "session_id": new_sid,
                            "message": "New session created"
                        }))
            except Exception as e:
                logger.debug(f"WS receiver loop ended for {conn_id}: {e}")
            consumer_task.cancel()
        except Exception:
            pass
        finally:
            _msg_queues.pop(conn_id, None)
            _msg_queue_locks.pop(conn_id, None)
            _stop_events.pop(conn_id, None)
            _processing_events.pop(conn_id, None)
            sid = _conn_sessions.pop(conn_id, None)
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
        logger.info(f"开始处理 WS 消息：conn={conn_id}")
        text = data.get("content", "").strip()
        images = data.get("images", [])

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
                import base64 as _b64
                raw_bytes = _b64.b64decode(b64)
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
        task_record = {
            "name": (text or "[image]")[:50],
            "status": "running",
            "agent_id": "siper_agent",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        active_tasks.append(task_record)

        selected_model = data.get("model")

        # Accumulated streaming response text
        _stream_acc = {"text": ""}

        async def _send_stream_delta(delta_text):
            """Send streaming delta to the frontend in real-time."""
            if not delta_text:
                return
            _stream_acc["text"] += delta_text
            try:
                await ws.send(json.dumps({
                    "type": "stream_delta",
                    "delta": delta_text,
                    "session_id": session_id,
                }))
            except Exception:
                pass

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
            result = await agent.process_message(
                message=effective_text,
                user_id="web_user",
                session_id=session_id,
                stream_callback=_send_stream_delta,
                tool_call_callback=_send_tool_progress,
                model=selected_model,
                ws_send=_ws_send,
            )
            if result["success"]:
                logger.info(f"persist_session called for {session_id}, active_sessions keys: {list(agent.session_manager.active_sessions.keys())[:3]}")
                await agent.session_manager.persist_session(session_id)
                logger.info(f"persist_session done for {session_id}")
            else:
                # 即使 LLM 返回错误，也要持久化会话（保留用户消息和错误响应）
                await agent.session_manager.persist_session(session_id)
        except Exception as e:
            import traceback as _tb
            logger.error(f"处理消息异常：{e}\n{_tb.format_exc()}")
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
        task_record["status"] = "done"

        # Record token usage to global history + DB
        if result.get("usage"):
            u = result["usage"]
            entry = {
                "time": time.strftime("%H:%M:%S"),
                "model": result.get("model") or selected_model or "",
                "prompt_tokens": u.get("prompt_tokens", 0),
                "completion_tokens": u.get("completion_tokens", 0),
                "total_tokens": u.get("total_tokens", 0),
                "agent": agent.config.name if agent else "default",
            }
            _token_usage_history.append(entry)
            if len(_token_usage_history) > _TOKEN_USAGE_MAX:
                _token_usage_history.pop(0)
            # Persist to shared token DB
            _save_token_to_db(entry)

        # Check if generation was stopped by user — if so, skip sending response
        if _stop_events.get(conn_id) and _stop_events[conn_id].is_set():
            logger.info(f"生成已被用户停止，跳过发送响应：conn={conn_id}")
            _stop_events[conn_id].clear()
            return


        # If streaming was used, send a stream_end marker; otherwise send full response
        if _stream_acc["text"]:
            try:
                # Attach image info for frontend rendering
                if image_paths:
                    result["attachments"] = [
                        {"url": "/uploads/" + os.path.basename(p), "name": os.path.basename(p), "category": "image", "type": "image"}
                        for p in image_paths
                    ]
                await ws.send(json.dumps({
                    "type": "stream_end",
                    "session_id": session_id,
                    "data": result,
                }))
            except Exception:
                pass
        else:
            if image_paths:
                result["attachments"] = [
                    {"url": "/uploads/" + os.path.basename(p), "name": os.path.basename(p), "category": "image", "type": "image"}
                    for p in image_paths
                ]
            resp = {
                "type": "response",
                "session_id": session_id,
                "data": result,
            }
            await ws.send(json.dumps(resp, ensure_ascii=False, default=str))

        # Reply finished — clear processing event so heartbeat works again
        _processing_events.get(conn_id, asyncio.Event()).clear()

    ws_server = await ws_serve(ws_handler, "0.0.0.0", ws_port, max_size=10 * 1024 * 1024)
    logger.info(f"[计时] WebSocket 服务启动完成: {(time.time()-_t0)*1000:.0f}ms")
    logger.info(f"WebSocket 地址：ws://localhost:{ws_port}")
    logger.info("按 Ctrl+C 停止服务")

    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass
    finally:
        http_server.close()
        await http_server.wait_closed()
        ws_server.close()
        await ws_server.wait_closed()
        if task_manager:
            await task_manager.stop()
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
