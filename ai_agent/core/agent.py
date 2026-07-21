"""
AI Agent Runtime - Main agent class implementing the core conversation loop
and tool execution framework.
"""

import asyncio
import json
import logging
import os
import re
import time
import traceback
import base64
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from ..tools.tool_registry import ToolRegistry, ToolCall, ToolResult
from ..sessions.session_manager import SessionManager
from ..skills.skill_loader import SkillLoader
from ..skills.skill_registry import SkillRegistry
from ..skills.skill_pre_filter import SkillPreFilter
from ..skills.skill_feedback import SkillFeedback
from ..utils.metrics import AgentMetrics
from .llm_client import LLMClient
import sqlite3 as _sqlite3

def _save_summary_token(entry):
    """Save token usage from summary generation to the shared token DB."""
    try:
        import sys
        sw = sys.modules.get('siper_web')
        if sw is None:
            import siper_web
            sw = siper_web
        _token_db_conn = getattr(sw, '_token_db_conn', None)
        if not _token_db_conn:
            return
        cur = _token_db_conn.cursor()
        model_name = entry.get("model", "")
        cur.execute("SELECT id FROM token_models WHERE name=?", (model_name,))
        r = cur.fetchone()
        if r:
            model_id = r[0]
        else:
            cur.execute("INSERT INTO token_models (name) VALUES (?)", (model_name,))
            model_id = cur.lastrowid
        cur.execute(
            "INSERT INTO token_usage (agent, model_id, prompt_tokens, completion_tokens, total_tokens, ts, source) VALUES (?,?,?,?,?,?,?)",
            (entry.get("agent", ""), model_id, entry.get("prompt_tokens", 0),
             entry.get("completion_tokens", 0), entry.get("total_tokens", 0), int(time.time()),
             entry.get("source", "summary"))
        )
        # Trim old entries
        cur.execute("SELECT COUNT(*) FROM token_usage")
        count = cur.fetchone()[0]
        if count > 500:
            cur.execute("DELETE FROM token_usage WHERE id IN (SELECT id FROM token_usage ORDER BY id ASC LIMIT ?)", (count - 500,))
        _token_db_conn.commit()
    except Exception:
        pass

def _find_model_in_global(model_name: str) -> Optional[Dict]:
    """Look up a model by name in the global models.db (SQLite).
    Returns the model dict or None if not found.
    """
    try:
        from ai_agent.models_db import ModelsDB
        db_path = str(Path(__file__).resolve().parent.parent.parent / "data" / "models.db")
        db = ModelsDB(db_path)
        return db.get_model(model_name)
    except Exception:
        pass
    return None


@dataclass
class ModelConfig:
    """Single model configuration."""
    name: str = ""           # model name, e.g. "gpt-4", "claude-3"
    provider: str = ""       # provider id, e.g. "longcat"
    base_url: str = ""       # API base URL
    api_key: str = ""        # API key
    context_window: int = 0  # context window size in tokens


@dataclass
class AgentConfig:
    """Configuration for agent instance."""
    agent_id: str
    name: str = "AI Agent"
    agent_name: str = "default"
    max_concurrent_tools: int = 300
    max_tool_rounds: int = 100
    default_provider: str = "openrouter"
    fallback_providers: List[str] = field(default_factory=lambda: ["anthropic", "openai"])
    memory_backend: str = "sqlite"
    session_timeout: int = 3600
    enable_logging: bool = True
    log_level: str = "INFO"
    skills_dir: str = "./skills"
    data_dir: str = "./data"
    agents_dir: str = "./agents"
    icon: str = "🎭"         # display icon/emoji for the agent
    avatar: str = ""         # avatar URL or data URI
    # Model references (no model config here — all models come from models.db)
    available_models: List[str] = field(default_factory=list)  # list of model names from models.db
    default_chat_model: str = ""   # default model for chat
    default_vision_model: str = "" # default model for vision/image analysis
    default_tts_model: str = ""    # default model for TTS

    # Response limits (per-agent, editable from Web UI)
    llm_timeout: int = 300          # LLM API call timeout in seconds
    llm_max_tokens: int = 8192      # max output tokens per response
    llm_max_retries: int = 2        # retry rounds after timeout
    max_history_messages: int = 50  # max history messages loaded per session
    skill_pre_filter_top_k: int = 5 # top-k skills returned by pre-filter

    # Context compression settings
    context_compression_mode: str = "sliding_window"  # "none" | "sliding_window" | "summary"
    sliding_window_size: int = 20  # keep last N messages in sliding window
    summary_max_tokens: int = 1000  # max tokens for history summary
    tool_result_max_tokens: int = 500  # max tokens per tool result in history

    enabled_toolsets: List[str] = None
    disabled_toolsets: List[str] = None

import sys as _sys
_WSL_ENVIRONMENT = False
if _sys.platform == "linux":
    try:
        with open("/proc/version") as _f:
            _WSL_ENVIRONMENT = "microsoft" in _f.read().lower()
    except:
        pass

class AIAgent:
    """
    Main AI Agent class implementing the core conversation loop
    and tool execution framework.
    """

    def __init__(self, config: AgentConfig):
        self.config = config
        self.agent_id = config.agent_id
        self.logger = self._setup_logger()

        # Core components
        # Tool registry with toolset filtering
        enabled_ts = getattr(config, 'enabled_toolsets', None)
        disabled_ts = getattr(config, 'disabled_toolsets', None)
        self.tool_registry = ToolRegistry(enabled_toolsets=enabled_ts, disabled_toolsets=disabled_ts)
        self.session_manager = SessionManager(data_dir=config.data_dir)
        self.skill_loader = SkillLoader(skills_dir=config.skills_dir)

        # Skill system v2: registry, pre-filter, feedback
        self.skill_registry = SkillRegistry(skills_dir=config.skills_dir, agent=self)
        self.skill_feedback = SkillFeedback(
            db_path=str(Path(__file__).parent.parent.parent / "data" / "skill_call_log.db")
        )
        self.skill_pre_filter = SkillPreFilter(
            registry=self.skill_registry,
            call_log=self.skill_feedback.call_log
        )
        self._skill_pre_filter_enabled = True
        self._skill_pre_filter_top_k = config.skill_pre_filter_top_k

        # State management
        self.is_running = False
        self.current_session: Optional[str] = None
        self.active_skills: Dict[str, Any] = {}
        self.conversation_history: Dict[str, List[Dict]] = {}  # session_id -> messages

        # Stream control
        self._disable_streaming = False       # circuit breaker: provider doesn't support streaming
        self._stream_stale_count = 0          # consecutive stale-stream counts
        self._stream_generation = 0           # incremented per user turn; prevents stale delta delivery
        self._pending_steer: Optional[str] = None  # user steer injection (don't interrupt running)
        self._pending_steer_lock = asyncio.Lock()
        self._last_llm_error_class: str = 'none'   # 'none' | 'retry' | 'failover' | 'abort'

        # WebSocket send callback — set by siper_web.py during message processing
        # Allows tools (e.g. send_message) to push messages to the frontend directly
        self.ws_send: Optional[callable] = None
        self.ws_session_id: Optional[str] = None

        # Performance tracking
        self.metrics = AgentMetrics(self.agent_id)

        # LLM client (initialized with defaults, can be overridden via configure_llm)
        self.llm_client: Optional[LLMClient] = None

        # Load agent personality from agents directory
        self._soul_content = ""
        self._agent_config_content = ""
        self._memory_content = ""
        self._memory_integration_config = {}
        self._load_agent_profile()

    def _load_agent_profile(self):
        """Load soul.md, agent.md, and memory.md from the agents directory."""
        try:
            from agents import load_agent_soul, load_agent_config, load_agent_memory, load_agent_config_file

            self._soul_content = load_agent_soul(self.config.agent_name)
            self._agent_config_content = load_agent_config(self.config.agent_name)
            self._memory_content = load_agent_memory(self.config.agent_name)

            # Load memory integration config from config.json
            cfg = load_agent_config_file(self.config.agent_name)
            self._memory_integration_config = cfg.get("memory_integration", {
                "mode": "append",
                "position": "after_system",
                "max_tokens": 2000,
                "template": ""
            })

            if self._soul_content:
                self.logger.debug(f"已加载 Agent '{self.config.agent_name}' 的 soul.md")
            if self._agent_config_content:
                self.logger.debug(f"已加载 Agent '{self.config.agent_name}' 的 agent.md")
            if self._memory_content:
                self.logger.debug(f"已加载 Agent '{self.config.agent_name}' 的 memory.md ({len(self._memory_content)} 字符)")
        except ImportError:
            self.logger.warning("未找到 agents 包，使用默认系统提示词")
        except Exception as e:
            self.logger.warning(f"加载 Agent 配置失败：{e}")

    def configure_llm(
        self,
        api_key: str,
        base_url: str = "",
        model: str = "",
        vision_api_key: str = "",
        vision_base_url: str = "",
        vision_model: str = "",
    ):
        """Configure the LLM client with API credentials.

        Args:
            api_key: LLM API key
            base_url: LLM API base URL
            model: LLM model name
            vision_api_key: Optional vision model API key (for image understanding)
            vision_base_url: Optional vision model base URL
            vision_model: Optional vision model name
        """
        self.llm_client = LLMClient(
            api_key=api_key,
            base_url=base_url,
            model=model,
            timeout=self.config.llm_timeout,
            max_tokens=self.config.llm_max_tokens,
        )
        # Vision client for image understanding (uses a separate vision-capable API)
        self.vision_client: Optional[LLMClient] = None
        if vision_api_key and vision_base_url and vision_model:
            self.vision_client = LLMClient(
                api_key=vision_api_key,
                base_url=vision_base_url,
                model=vision_model,
                timeout=60,
            )
            self.logger.info(f"视觉模型已配置：{vision_base_url} / {vision_model}")
        self.logger.debug(f"LLM 客户端已配置：服务商={base_url}, 模型={model}")

    def _setup_logger(self) -> logging.Logger:
        """Setup structured logging for the agent."""
        logger = logging.getLogger(f"agent.{self.agent_id}")
        logger.setLevel(getattr(logging, self.config.log_level))

        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)

        return logger

    async def initialize(self) -> bool:
        """Initialize the agent with all required components."""
        try:
            self.logger.debug("正在初始化 AI Agent...")

            # Initialize core components
            self.logger.info("  [init] tool_registry...")
            await self.tool_registry.initialize()
            self.logger.info("  [init] session_manager...")
            await self.session_manager.initialize()
            self.logger.info("  [init] skill_loader...")
            await self.skill_loader.initialize()

            # Skill system v2: scan registry and build pre-filter index
            self.logger.info("  [init] skill scan...")
            self.skill_registry.scan()
            self.skill_pre_filter.build_index()
            self.logger.info(
                f"Skill registry: {len(self.skill_registry.skills)} skills, "
                f"pre-filter index: {len(self.skill_pre_filter._inverted_index)} keywords"
            )

            # Load default skills

            self.is_running = True
            self.logger.debug(f"AI Agent '{self.config.name}' 初始化成功")
            return True

        except Exception as e:
            self.logger.error(f"Agent 初始化失败：{e}")
            return False

    async def process_message(
        self,
        message: str,
        user_id: str = "default",
        session_id: Optional[str] = None,
        tool_call_callback=None,
        stream_callback=None,
        model: Optional[str] = None,
        _tool_round: int = 0,
        ws_send=None,
        _stop_event: Optional[asyncio.Event] = None,
    ) -> Dict:
        """
        Main message processing method implementing the conversation loop.

        Args:
            message: User input message
            user_id: User identifier
            session_id: Optional existing session ID
            tool_call_callback: Optional async callback(tool_name, status, data) for tool streaming
            stream_callback: Optional async callback(delta_text) for LLM response streaming
            model: Optional model name to override the default model for this request
            _tool_round: Internal counter for consecutive tool call rounds (prevents infinite loops)
            ws_send: Optional async callback(payload_dict) for tools to push messages directly to frontend
        """
        start_time = datetime.now()
        _MAX_TOOL_ROUNDS = self.config.max_tool_rounds or 100  # Prevent infinite tool call loops

        # Increment stream generation — turns any in-flight stale stream old
        self._stream_generation += 1

        # Set ws_send callback for tools to push messages directly to frontend
        self.ws_send = ws_send
        self.ws_session_id = session_id

        # Switch LLM client model if requested
        if model and self.llm_client and model != self.llm_client.model:
            # Find model config from global models.db
            model_cfg = _find_model_in_global(model)
            if model_cfg:
                api_key = model_cfg.get("api_key") or os.environ.get("LONGCAT_API_KEY", "")
                self.configure_llm(
                    api_key=api_key,
                    base_url=model_cfg.get("base_url", self.llm_client.base_url),
                    model=model_cfg.get("name", model),
                )
                self.logger.info(f"模型切换: {model}")
            else:
                # No config found, just update the model name on existing client
                self.llm_client.model = model
                self.logger.info(f"模型切换(无配置): {model}")

        try:
            # Create or retrieve session
            if not session_id:
                session_id = await self.session_manager.create_session(user_id)
                self.conversation_history[session_id] = []  # init per-session history
            else:
                existing = await self.session_manager.get_session(session_id)
                if existing is None:
                    session_id = await self.session_manager.create_session(user_id)
                else:
                    # Restore conversation history from session DB
                    # Load last N messages to restore context after session switch
                    window = getattr(self.config, 'sliding_window_size', 20)
                    msgs = existing.messages[-window:] if existing.messages else []
                    hist = []
                    for m in msgs:
                        entry = {
                            'role': m.get('role', ''),
                            'content': m.get('content', ''),
                        }
                        if m.get('tool_calls'):
                            entry['tool_calls'] = m['tool_calls']
                        if m.get('tool_call_id'):
                            entry['tool_call_id'] = m['tool_call_id']
                        hist.append(entry)
                    self.conversation_history[session_id] = hist
                    if msgs:
                        self.logger.info(f"会话恢复：从 DB 加载了 {len(msgs)} 条历史消息")

            self.current_session = session_id

            # Add user message to history
            user_message = {
                'role': 'user',
                'content': message,
                'timestamp': datetime.now().isoformat(),
                'session_id': session_id
            }
            # Persist user message to database immediately (prevent crash loss)
            await self.session_manager.add_message(session_id, 'user', message)
            await self.session_manager.persist_session(session_id)

            # Build context for LLM (includes building multimodal user content)
            context = await self._build_context(message, session_id)
            # Now append user message to history (after context is built)
            self.conversation_history.setdefault(session_id, []).append(user_message)

            # 限制历史长度，防止内存无限增长（保留最近 50 条）
            _MAX_HISTORY = 50
            if len(self.conversation_history[session_id]) > _MAX_HISTORY:
                self.conversation_history[session_id] = self.conversation_history[session_id][-_MAX_HISTORY:]

            # Get available tools
            tools_available = self.tool_registry.get_available_tools()

            # Skill pre-filter: select relevant skills based on user input
            # Only use pre-filtered skills (not all registered skills)
            skills_active = []  # Start empty, only add pre-filtered
            skills_recommended = []  # Track recommended but not used
            skill_scores: Dict[str, float] = {}  # 预筛选分数
            if (self._skill_pre_filter_enabled
                    and hasattr(self, 'skill_pre_filter')
                    and self.skill_pre_filter):
                try:
                    pre_filtered, skill_scores = self.skill_pre_filter.pre_filter(
                        user_input=message,
                        top_k=self._skill_pre_filter_top_k,
                        skill_feedback=getattr(self, 'skill_feedback', None),
                    )
                    pre_filtered_names = {e.name for e in pre_filtered}
                    skills_active = list(pre_filtered_names)
                    skills_recommended = list(pre_filtered_names)
                    # Auto-register pre-filtered skills into active_skills
                    # so that _build_context and message meta reflect them
                    for entry in pre_filtered:
                        if entry.name not in self.active_skills:
                            self.active_skills[entry.name] = entry
                    for entry in pre_filtered:
                        if hasattr(self, 'skill_feedback') and self.skill_feedback:
                            self.skill_feedback.record_trigger(entry.name, message)
                            # Log to SQLite with trigger score
                            trigger_method = 'keyword' if entry.name in skill_scores else 'fallback'
                            self.skill_feedback.log_call(
                                session_id=session_id,
                                user_input=message,
                                skill_name=entry.name,
                                trigger_score=skill_scores.get(entry.name, 0),
                                trigger_method=trigger_method,
                            )
                except Exception as e:
                    self.logger.warning(f"Skill pre-filter failed: {e}")

            # Generate response using LLM
            llm_response = await self._llm_call(
                messages=context,
                tools=tools_available,
                skills=skills_active,
                stream_callback=stream_callback,
                _stop_event=_stop_event,
            )
            usage = llm_response.get('usage', {})
            
            # Save token usage for LLM calls (main conversation)
            if usage and usage.get("total_tokens", 0) > 0:
                _save_summary_token({
                    "agent": self.config.agent_name,
                    "model": self.llm_client.model or "",
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                    "source": "chat",
                })

            # Handle tool calls if present
            if llm_response.get('tool_calls') and _tool_round < _MAX_TOOL_ROUNDS:
                # Preserve any text content from the LLM before tool calls
                # (e.g. "Let me search for that..." before calling web_search)
                pre_tool_text = llm_response.get('content') or ''
                # 推送引导语到前端思考面板
                if pre_tool_text and self.ws_send and self.ws_session_id:
                    try:
                        _loop = asyncio.get_running_loop()
                    except RuntimeError:
                        _loop = asyncio.new_event_loop()
                    try:
                        asyncio.run_coroutine_threadsafe(
                            self.ws_send({
                                "type": "thinking_text",
                                "text": pre_tool_text,
                                "session_id": self.ws_session_id,
                            }), _loop
                        )
                    except Exception:
                        pass
                response_content, tool_results, usage = await self._handle_tool_calls(
                    llm_response['tool_calls'],
                    session_id,
                    messages=context,
                    usage=usage,
                    tool_call_callback=tool_call_callback,
                    stream_callback=stream_callback,
                    _tool_round=_tool_round + 1,
                )
                # If follow-up response is empty but LLM had pre-tool text, use it
                if not response_content and pre_tool_text:
                    response_content = pre_tool_text
                # 不再过滤引导语——引导语应显示在气泡和思考面板中
            elif llm_response.get('tool_calls') and _tool_round >= _MAX_TOOL_ROUNDS:
                # Force text response after max tool rounds
                self.logger.warning(f"工具调用轮次达到上限 ({_MAX_TOOL_ROUNDS})，强制生成文本响应")
                response_content = self._generate_final_response_from_tool_calls(llm_response['tool_calls'])
                tool_results = []
            else:
                response_content = llm_response.get('content', '')
                tool_results = []

            # 检查 LLM 返回的错误 finish_reason 或空内容
            is_llm_error = llm_response.get('finish_reason') in ('error', 'timeout')
            if is_llm_error:
                self.logger.warning(f"LLM 返回错误 finish_reason，response_content={response_content[:100]!r}")
            # 空内容时：如果 LLM 在多轮工具调用后仍未返回文本，生成简短提示
            # 工具结果已在思考面板中展示，气泡主体不需要重复工具原始输出
            if not response_content:
                if tool_results:
                    tool_names = [r['tool_name'] for r in tool_results if r.get('tool_name')]
                    if tool_names:
                        response_content = f"已执行工具：{', '.join(tool_names)}。工具结果已在上方展示。"
                    else:
                        response_content = "工具调用已完成。"
                    self.logger.warning(f"LLM 工具调用后未返回文本，生成简短提示: {response_content[:80]!r}")
                else:
                    self.logger.warning("LLM 响应内容为空")
                    is_llm_error = True

            # Don't store error messages in conversation history to prevent cascading failures
            if not is_llm_error:
                # Create assistant response
                # Note: when tool calls were handled, llm_response still contains
                # the original tool_calls, but the follow-up response_content is
                # plain text. We must NOT include tool_calls in the saved message
                # to avoid sending assistant messages with both content+tool_calls
                # to the API on subsequent rounds (causes empty response errors).
                assistant_message = {
                    'role': 'assistant',
                    'content': response_content,
                    'timestamp': datetime.now().isoformat(),
                    'session_id': session_id,
                    'tool_results': tool_results
                }
                # Only include tool_calls if this was a direct LLM response
                # (not a follow-up after tool execution), and only if content is None
                # to comply with OpenAI API format.
                if not tool_results and llm_response.get('tool_calls'):
                    assistant_message['tool_calls'] = llm_response['tool_calls']
                self.conversation_history.setdefault(session_id, []).append(assistant_message)
                # Persist assistant message to database (with meta for dict modal)
                processing_time = (datetime.now() - start_time).total_seconds()
                # Build used_skills list before msg_meta so it's available for meta
                used_skills = []
                for tr in tool_results:
                    if tr.get('tool_name') == 'skill_view':
                        skill_name = tr.get('parameters', {}).get('name', '')
                        if skill_name:
                            used_skills.append(skill_name)
                msg_meta = {
                    'usage': usage,
                    'model': llm_response.get('model', ''),
                    'finish_reason': llm_response.get('finish_reason', ''),
                    'tool_calls_executed': len(tool_results),
                    'tool_call_steps': self._truncate_tool_steps(tool_results),
                    'skills_active': skills_active,
                    'skills_used': used_skills,
                    'skills_recommended': [s for s in (skills_active or []) if s not in (used_skills or [])],
                    'processing_time_ms': processing_time * 1000,
                    'success': not is_llm_error,
                }
                await self.session_manager.add_message(session_id, 'assistant', response_content, meta=msg_meta)
            else:
                self.logger.warning("LLM 返回错误，不写入对话历史以防止级联失败")
                processing_time = (datetime.now() - start_time).total_seconds()
            self.metrics.record_message_processing(processing_time, len(tool_results))

            # Track which skills were actually used (via skill_view tool call)
            for tr in tool_results:
                if tr.get('tool_name') == 'skill_view':
                    skill_name = tr.get('parameters', {}).get('name', '')
                    if skill_name:
                        # Record LLM actually selected this skill
                        if hasattr(self, 'skill_feedback') and self.skill_feedback:
                            self.skill_feedback.record_selection(skill_name, selected=True)
                            # Record execution result
                            success = tr.get('success', True)
                            exec_time_ms = tr.get('elapsed_ms', 0)
                            self.skill_feedback.record_result(skill_name, success=success)
                            # Update SQLite log with call result
                            self.skill_feedback.call_log.log_call(
                                session_id=session_id,
                                user_input=message,
                                skill_name=skill_name,
                                llm_called=True,
                                llm_call_time_ms=exec_time_ms,
                                execution_success=success,
                                execution_time_ms=exec_time_ms,
                            )

            result = {
                'response': response_content,
                'session_id': session_id,
                'tool_calls_executed': len(tool_results),
                'tool_call_steps': self._truncate_tool_steps(tool_results),
                'processing_time_ms': processing_time * 1000,
                'skills_active': skills_active,
                'skills_used': used_skills,  # LLM actually invoked skill_view
                'skills_recommended': skills_recommended,  # Pre-filtered but may not be used
                'success': not is_llm_error,
                'usage': usage,
                'prompt_context': json.dumps(context, ensure_ascii=False, default=str),
            }
            # Clear ws_send to prevent stale references
            self.ws_send = None
            self.ws_session_id = None
            return result

        except Exception as e:
            tb_str = traceback.format_exc()
            self.logger.error(f"消息处理错误：{e}\n{tb_str}")
            self.metrics.record_error(e)

            return {
                'response': f"消息处理出错：{type(e).__name__}: {e}",
                'session_id': session_id,
                'error': str(e),
                'traceback': tb_str,
                'success': False,
                'usage': {},
                'tool_call_steps': [],
                'skills_active': [],
                'processing_time_ms': 0,
            }


    def _compress_tool_result(self, result: str, max_tokens: int = None) -> str:
        """Compress tool result to reduce token usage in conversation history.

        Keeps the head (70%) and tail (30%) of the result, with a marker
        indicating how much was omitted.
        """
        if not result:
            return result
        max_tok = max_tokens or self.config.tool_result_max_tokens
        max_chars = int(max_tok * 3.2)  # CJK ~3.2 chars/token
        if len(result) <= max_chars:
            return result
        head_len = int(max_chars * 0.7)
        tail_len = int(max_chars * 0.3) - 50
        if tail_len < 50:
            tail_len = 50
        omitted = len(result) - head_len - tail_len
        return (
            result[:head_len]
            + f"\n... [省略 {omitted} 字符 / ~{omitted // 3.2:.0f} tokens] ...\n"
            + result[-tail_len:]
        )

    def _estimate_messages_tokens(self, messages: List[Dict]) -> int:
        """Estimate token count for a list of messages.

        Uses a simple heuristic: ~4 chars per token for CJK,
        ~3.5 chars per token for ASCII. Includes tool_calls overhead.
        """
        total_chars = 0
        for msg in messages:
            content = msg.get('content') or ''
            if isinstance(content, list):
                # Multimodal: sum text parts
                for part in content:
                    if isinstance(part, dict) and part.get('type') == 'text':
                        total_chars += len(part.get('text', ''))
                    elif isinstance(part, dict) and part.get('type') == 'image_url':
                        total_chars += 2000  # rough estimate per image
            else:
                total_chars += len(str(content))
            # Tool calls overhead
            if msg.get('tool_calls'):
                total_chars += 200 * len(msg['tool_calls'])
            if msg.get('tool_call_id'):
                total_chars += 50
        # Weighted average: mixed CJK/ASCII ~ 3.2 chars/token
        return int(total_chars / 3.2)

    def _smart_truncate_history(
        self,
        system_tokens: int,
        max_context: int,
        max_output: int,
        session_id: str = "",
    ) -> List[Dict]:
        """Smart-truncate conversation history to fit within context window.

        Budget: system_prompt + history + user_message + max_output <= max_context
        Strategy:
          - If context_compression_mode == "sliding_window": keep last N messages
            (sliding_window_size from config), regardless of token count.
          - Otherwise: binary search for best fit within budget.
          - Always keep at least 1 exchange (2 msgs).
          - If truncated, prepend a marker so LLM knows context was trimmed.
        """
        # Reserve budget: system + current user msg (~500 tok) + output + 10% buffer
        reserve = system_tokens + 500 + max_output + int(max_context * 0.1)
        budget = max_context - reserve
        if budget <= 0:
            return []

        history = self.conversation_history.get(session_id, [])
        if not history:
            return []

        # Sliding window mode: keep last N messages
        mode = getattr(self.config, 'context_compression_mode', 'sliding_window')
        if mode in ('sliding_window', 'summary'):
            window_size = getattr(self.config, 'sliding_window_size', 20)
            min_keep = min(window_size, len(history))
            # But still respect budget — if even window_size exceeds budget, fall back to binary search
            candidate = history[-min_keep:]
            tokens = self._estimate_messages_tokens(candidate)
            if tokens <= budget:
                result = candidate
                if min_keep < len(history):
                    result = [{'role': 'system', 'content': f'[... 早期 {len(history) - min_keep} 条对话已截断 ...]'}] + result
                return result
            # Fall through to binary search if window exceeds budget

        # Binary search for best fit (original logic)
        min_keep = min(2, len(history))
        lo, hi = min_keep, len(history)
        best = min_keep
        while lo <= hi:
            mid = (lo + hi) // 2
            candidate = history[-mid:]
            tokens = self._estimate_messages_tokens(candidate)
            if tokens <= budget:
                best = mid
                lo = mid + 1
            else:
                hi = mid - 1

        result = history[-best:]

        # If we had to truncate, add a marker so LLM knows context was trimmed
        if best < len(history):
            result = [{'role': 'system', 'content': f'[... 早期 {len(history) - best} 条对话已截断 ...]'}] + result

        return result

    async def _build_context(
        self,
        current_message: str,
        session_id: str
    ) -> List[Dict]:
        """Build conversation context for LLM consumption."""
        # Smart-truncate history based on context window budget
        system_prompt = self._get_system_prompt(
            skills_active=list(self.active_skills.keys()),
            current_message=current_message,
        )
        system_tokens = int(len(system_prompt) / 3.2)
        max_context = getattr(self.config, 'context_window', 128000)
        max_output = getattr(self.config, 'max_tokens', 8192)
        mode = getattr(self.config, 'context_compression_mode', 'sliding_window')

        if mode == 'summary':
            # Summary mode: recent window + summary of older messages
            window_size = getattr(self.config, 'sliding_window_size', 20)
            history = self.conversation_history.get(session_id, [])
            if len(history) > window_size:
                older = history[:-window_size]
                recent = history[-window_size:]
                summary_text = await self._summarize_history(older)
                recent_history = []
                if summary_text:
                    recent_history.append({
                        'role': 'system',
                        'content': '[历史对话摘要]\n' + summary_text,
                        '_is_summary': True,
                    })
                recent_history.extend(recent)
            else:
                recent_history = history
            # Still apply budget check
            reserve = system_tokens + 500 + max_output + int(max_context * 0.1)
            budget = max_context - reserve
            # Trim if still over budget
            while len(recent_history) > 2:
                tokens = self._estimate_messages_tokens(recent_history)
                if tokens <= budget:
                    break
                # Remove oldest non-summary message
                for i, m in enumerate(recent_history):
                    if not m.get('_is_summary'):
                        recent_history.pop(i)
                        break
        else:
            # Sliding window or none mode
            recent_history = self._smart_truncate_history(
                system_tokens=system_tokens,
                max_context=max_context,
                max_output=max_output,
                session_id=session_id,
            )

        # Combine into LLM format
        context = []

        # System prompt defining agent behavior (with active skills injected)
        system_msg = {
            'role': 'system',
            'content': system_prompt
        }
        context.append(system_msg)

        # Recent conversation - preserve tool_calls and tool_call_id
        for msg in recent_history:
            entry = {
                'role': msg['role'],
                'content': msg['content'],
            }
            # Preserve tool_calls for assistant messages
            if msg.get('tool_calls'):
                entry['tool_calls'] = msg['tool_calls']
            # Preserve tool_call_id for tool result messages
            if msg.get('tool_call_id'):
                entry['tool_call_id'] = msg['tool_call_id']
            context.append(entry)

        # Current user message - support multimodal content
        user_content = await self._build_user_content(current_message)
        context.append({
            'role': 'user',
            'content': user_content
        })

        return context

    async def _build_user_content(self, message: str) -> Any:
        """Build user message content, supporting multimodal (text + images).
        
        If the message contains [Image: /path/to/image] references:
        - If vision_client is configured, describe images via vision API and append descriptions to text
        - Otherwise, embed images as base64 data URLs in OpenAI multimodal format
        
        Otherwise return plain text string.
        """
        # Find all [Image: /path/to/image] references
        img_pattern = re.compile(r'\[Image:\s*(.+?)\]')
        file_pattern = re.compile(r'\[File:\s*(.+?)\]')
        img_matches = img_pattern.findall(message)
        file_matches = file_pattern.findall(message)

        if not img_matches and not file_matches:
            return message

        # Handle non-image file references: convert to text descriptions
        if file_matches:
            file_descriptions = []
            for fp in file_matches:
                fp = fp.strip()
                p = Path(fp)
                if p.exists() and p.is_file():
                    size = p.stat().st_size
                    if size < 64 * 1024:
                        # Small files: read content as text
                        try:
                            content = p.read_text(encoding='utf-8', errors='replace')
                            file_descriptions.append(f"[文件: {p.name}]\n{content}")
                        except Exception:
                            file_descriptions.append(f"[文件: {p.name} - {size} 字节, 无法读取为文本]")
                    else:
                        file_descriptions.append(f"[文件: {p.name} - {size // 1024} 字节]")
                else:
                    file_descriptions.append(f"[文件: {fp} - 文件不存在]")
            clean_message = file_pattern.sub('', message).strip()
            if img_matches:
                clean_message = img_pattern.sub('', clean_message).strip()
            file_text = "\n".join(file_descriptions)
            if clean_message:
                parts = [clean_message, file_text]
            else:
                parts = [file_text]
            if img_matches:
                # If there are images too, process them below
                message = "\n".join(parts)
                # Continue to image handling
            else:
                return "\n".join(parts)

        # If vision client is available, describe images and append to text
        if img_matches and self.vision_client is not None:
            return await self._describe_images_with_vision(message, img_matches)

        # Fallback: no vision client — return plain text with image path references
        # Some APIs (e.g. LongCat) don't support multimodal; let LLM use tools to view images
        if img_matches:
            clean_message = img_pattern.sub('', message).strip()
            path_list = "\n".join(p.strip() for p in img_matches)
            text = f"{clean_message}\n\n[图片文件路径]\n{path_list}\n\n请使用 execute_code 工具运行 Python 代码查看图片内容。".strip()
            self.logger.info(f"构建文本消息（含 {len(img_matches)} 个图片路径引用，无 vision_client）")
            return text

    async def _describe_images_with_vision(self, message: str, matches: list) -> str:
        """Use vision client to describe images and return enhanced text.
        
        Sends each image to the vision API and appends descriptions to the
        original message text so the main LLM can understand image content.
        """
        
        descriptions = []
        for match in matches:
            img_path = match.strip()
            p = Path(img_path)
            if not p.exists() or not p.is_file():
                descriptions.append(f"[图片: {img_path} - 文件不存在]")
                continue
            
            try:
                raw = p.read_bytes()
                mime = self._detect_image_mime(raw, p.suffix)
                b64 = base64.b64encode(raw).decode('ascii')
                
                # Call vision API
                vision_messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "请详细描述这张图片的内容，包括文字、物体、场景等所有可见信息"},
                            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}
                        ]
                    }
                ]
                
                self.logger.info(f"正在调用视觉模型分析图片：{img_path} ({len(raw)} 字节)")
                loop = asyncio.get_event_loop()
                result = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        lambda: self.vision_client.chat_completion(messages=vision_messages, max_tokens=500),
                    ),
                    timeout=60,
                )
                desc = result.get("content", "") or result.get("reasoning", "")
                desc = desc.strip()
                if desc:
                    descriptions.append(f"[图片描述: {desc}]")
                    self.logger.info(f"视觉模型描述：{desc[:100]}...")
                else:
                    descriptions.append(f"[图片: {img_path} - 视觉模型未返回描述]")
                    self.logger.warning(f"视觉模型未返回描述：{img_path}")
            except asyncio.TimeoutError:
                self.logger.error(f"视觉模型超时：{img_path}")
                descriptions.append(f"[图片: {img_path} - 分析超时]")
            except Exception as e:
                self.logger.error(f"视觉模型调用失败 {img_path}：{e}")
                descriptions.append(f"[图片: {img_path} - 分析失败: {e}]")
        
        # Strip original [Image: ...] and [File: ...] references and append descriptions
        clean_message = re.sub(r'\[Image:\s*(.+?)\]', '', message)
        clean_message = re.sub(r'\[File:\s*(.+?)\]', '', clean_message).strip()
        if descriptions:
            img_summary = "\n".join(descriptions)
            if clean_message:
                return f"{clean_message}\n\n{img_summary}"
            return img_summary
        return clean_message

    @staticmethod
    def _detect_image_mime(raw: bytes, suffix: str = '') -> str:
        """Detect image MIME type from magic bytes or file extension."""
        if raw.startswith(b'\x89PNG\r\n\x1a\n'):
            return 'image/png'
        if raw.startswith(b'\xff\xd8\xff'):
            return 'image/jpeg'
        if raw[:6] in (b'GIF87a', b'GIF89a'):
            return 'image/gif'
        if len(raw) >= 12 and raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
            return 'image/webp'
        if raw.startswith(b'BM'):
            return 'image/bmp'
        # Fallback to extension
        ext_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                   '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'}
        return ext_map.get(suffix.lower(), 'image/png')

    @staticmethod
    def _convert_windows_path(path_str: str) -> str:
        """Convert Windows path to WSL path.
        
        Supports:
        - C:\\path → /mnt/c/path
        - \\\\wsl.localhost\\distro\\path → /path (strip distro prefix)
        - D:\\Users\\... → /mnt/d/Users/...
        """
        if not path_str or not isinstance(path_str, str):
            return path_str
        # \\wsl.localhost\distro\path → /path (strip distro name)
        wsl_match = re.match(r'^\\\\wsl\.localhost\\(.+)', path_str)
        if wsl_match:
            rest = wsl_match.group(1)
            parts = re.split(r'[\\/]', rest)
            if len(parts) > 1:
                return '/' + '/'.join(parts[1:])
            return '/'
        # C:\\path or c:/path → /mnt/c/path
        drive_match = re.match(r'^([A-Za-z]):[\\/](.*)', path_str)
        if drive_match:
            drive = drive_match.group(1).lower()
            rest = drive_match.group(2).replace('\\', '/')
            return f'/mnt/{drive}/{rest}'
        return path_str

    def _auto_convert_paths(self, tool_name: str, params: Dict) -> Dict:
        """Auto-convert Windows paths in tool parameters.
        
        File-related tools get automatic path conversion.
        Only active in WSL environments (skipped on native Windows).
        """
        if not _WSL_ENVIRONMENT:
            return params
        path_tools = {'list_dir', 'read_file', 'write_file', 'search_files', 'execute_command'}
        if tool_name not in path_tools:
            return params
        
        converted = dict(params)
        # Tools with 'path' parameter
        if 'path' in converted:
            converted['path'] = self._convert_windows_path(converted['path'])
        # Tools with 'file_path' parameter
        if 'file_path' in converted:
            converted['file_path'] = self._convert_windows_path(converted['file_path'])
        # execute_command: convert paths inside command string
        if tool_name == 'execute_command' and 'command' in converted:
            cmd = converted['command']
            # Simple regex to find Windows paths in command strings
            # Match X:\path patterns
            for m in re.finditer(r'([A-Za-z]):[\\]([^\s"\']*)', cmd):
                win_path = m.group(0)
                wsl_path = self._convert_windows_path(win_path)
                cmd = cmd.replace(win_path, wsl_path)
            converted['command'] = cmd
        
        return converted

    async def _handle_tool_calls(
        self,
        tool_calls: List[Dict],
        session_id: str,
        messages: List[Dict] = None,
        usage: Dict = None,
        tool_call_callback=None,
        stream_callback=None,
        _tool_round: int = 0,
    ) -> tuple:
        """Execute tool calls, then re-call LLM for final response."""
        tool_results = []
        t0 = None  # 初始化计时器，防止异常时未赋值

        for tool_call in tool_calls:
            try:
                params = tool_call.get('parameters', {})
                # Auto-convert Windows paths to WSL paths
                params = self._auto_convert_paths(tool_call['name'], params)
                # Unique call_id for each tool invocation (frontend uses this to
                # render separate progress entries instead of merging by name)
                call_id = tool_call.get('call_id') or tool_call.get('id') or (tool_call['name'] + '_' + str(id(tool_call)))
                # Notify frontend that tool execution is starting
                if tool_call_callback is not None:
                    try:
                        await tool_call_callback(tool_call['name'], 'running', {}, call_id=call_id)
                    except Exception:
                        pass
                self.logger.info(f"工具调用: {tool_call['name']} params={params}")
                t0 = datetime.now()
                result = await self.tool_registry.execute_tool(
                    tool_call['name'],
                    params
                )
                elapsed_ms = (datetime.now() - t0).total_seconds() * 1000 if t0 else 0
                self.logger.info(f"工具结果: {tool_call['name']} success={result.success} result={str(result.data)[:100]!r}")
                formatted_result = self._format_tool_result(result)

                # ── Clarify: pause execution and wait for user response ──
                if isinstance(result.data, dict) and result.data.get("__CLARIFY__"):
                    self.logger.info(f"Clarify: pausing execution, waiting for user response")
                    if self.ws_send is not None:
                        try:
                            await self.ws_send({
                                "type": "clarify_request",
                                "question": result.data.get("question", ""),
                                "options": result.data.get("options"),
                                "context": result.data.get("context"),
                                "formatted_text": result.data.get("formatted_text", ""),
                                "session_id": session_id,
                                "call_id": call_id,
                            })
                        except Exception as ws_err:
                            self.logger.warning(f"Failed to send clarify_request: {ws_err}")
                    from ..tools.clarify_tool import _set_pending_future, _clear_pending_future
                    loop = asyncio.get_event_loop()
                    clarify_future = loop.create_future()
                    _set_pending_future(session_id, clarify_future)
                    try:
                        user_answer = await asyncio.wait_for(clarify_future, timeout=300)
                        self.logger.info(f"Clarify: received user response: {user_answer!r}")
                    except asyncio.TimeoutError:
                        self.logger.warning("Clarify: timed out waiting for user response")
                        user_answer = "（用户未在5分钟内回复，继续执行）"
                    except asyncio.CancelledError:
                        self.logger.warning("Clarify: cancelled")
                        user_answer = "（已取消）"
                    finally:
                        _clear_pending_future(session_id)
                    formatted_result = f"[用户回复] {user_answer}"
                    result = ToolResult(success=True, data=formatted_result)
                    # 通知前端 clarify 已收到回复
                    if self.ws_send is not None:
                        try:
                            await self.ws_send({
                                "type": "clarify_response",
                                "session_id": session_id,
                                "call_id": call_id,
                                "answer": user_answer,
                            })
                        except Exception:
                            pass

                tool_results.append(self._build_tool_result_entry(
                    tool_call, call_id, params, formatted_result, result.success, elapsed_ms
                ))

                # Trigger streaming callback if provided
                if tool_call_callback is not None:
                    try:
                        await tool_call_callback(
                            tool_call['name'],
                            'completed' if result.success else 'failed',
                            {'result': formatted_result, 'elapsed_ms': round(elapsed_ms, 1)},
                            call_id=call_id,
                        )
                    except Exception as cb_err:
                        self.logger.warning(f"工具调用回调异常：{cb_err}")

                # Append tool result to conversation history
                tool_call_id = tool_call.get('id', '') or (tool_call.get('name', '') + '_call')
                self.conversation_history.setdefault(session_id, []).append({
                    'role': 'assistant',
                    'content': None,
                    'tool_calls': [{
                        'id': tool_call_id,
                        'type': 'function',
                        'function': {
                            'name': tool_call['name'],
                            'arguments': json.dumps(tool_call.get('parameters', {})),
                        }
                    }],
                    'timestamp': datetime.now().isoformat()
                })
                # Compress tool result before saving to history to reduce token usage
                compressed_result = self._compress_tool_result(formatted_result)
                self.conversation_history.setdefault(session_id, []).append({
                    'role': 'tool',
                    'content': compressed_result,
                    'tool_call_id': tool_call_id,
                    'tool_name': tool_call['name'],
                    'timestamp': datetime.now().isoformat()
                })
                # Persist tool messages to session DB
                try:
                    await self.session_manager.add_message(
                        session_id, 'assistant',
                        None,
                        tool_name=tool_call['name'],
                        tool_call_id=tool_call_id,
                    )
                    await self.session_manager.add_message(
                        session_id, 'tool',
                        formatted_result,
                        tool_name=tool_call['name'],
                        tool_call_id=tool_call_id,
                    )
                except Exception as persist_err:
                    self.logger.warning(f"持久化 tool 消息失败: {persist_err}")

            except Exception as e:
                elapsed_ms = (datetime.now() - t0).total_seconds() * 1000 if 't0' in dir() else 0
                error_msg = f"Tool execution failed: {str(e)}"
                tool_results.append(self._build_tool_result_entry(
                    tool_call,
                    tool_call.get('call_id', tool_call.get('id', '')),
                    tool_call.get('parameters', {}),
                    error_msg,
                    False,
                    elapsed_ms,
                ))
                self.logger.error(f"工具执行错误：{e}")
                # Persist failed tool message to session DB
                try:
                    tool_call_id = tool_call.get('id', '') or (tool_call.get('name', '') + '_call')
                    await self.session_manager.add_message(
                        session_id, 'assistant',
                        None,
                        tool_name=tool_call['name'],
                        tool_call_id=tool_call_id,
                    )
                    await self.session_manager.add_message(
                        session_id, 'tool',
                        error_msg,
                        tool_name=tool_call['name'],
                        tool_call_id=tool_call_id,
                    )
                except Exception as persist_err:
                    self.logger.warning(f"持久化 tool 错误消息失败: {persist_err}")

        # Re-call LLM with tool results to get natural language response
        # Support multi-round tool calls up to _MAX_TOOL_ROUNDS
        final_response = ""
        followup_usage = {}
        _current_tool_round = _tool_round
        if tool_results and self.llm_client is not None:
            try:
                # Build extended context with tool results
                # Use provided messages (already truncated) or fall back to truncated history
                if messages:
                    extended = list(messages)
                else:
                    # Fallback: truncate history to avoid unbounded growth
                    _window = getattr(self.config, 'sliding_window_size', 20)
                    hist = self.conversation_history.get(session_id, [])
                    extended = hist[-_window:] if len(hist) > _window else list(hist)
                # Add assistant tool_call message with proper IDs
                followup_tool_calls = []
                for tc in tool_results:
                    call_id = tc.get('call_id', '') or tc.get('tool_name', '') + '_call'
                    followup_tool_calls.append({
                        'id': call_id,
                        'type': 'function',
                        'function': {
                            'name': tc['tool_name'],
                            'arguments': json.dumps(tc.get('parameters', {})),
                        }
                    })
                
                extended.append({
                    'role': 'assistant',
                    'content': None,
                    'tool_calls': followup_tool_calls,
                })
                # Add tool result messages with matching tool_call_id
                for tc, fc in zip(tool_results, followup_tool_calls):
                    extended.append({
                        'role': 'tool',
                        'content': tc['result'],
                        'tool_call_id': fc['id'],
                        'name': tc['tool_name'],
                    })

                # Multi-round tool call loop
                _MAX_TOOL_ROUNDS = self.config.max_tool_rounds or 100
                _prev_tool_calls = None  # Track previous tool calls to detect loops
                while _current_tool_round < _MAX_TOOL_ROUNDS:
                    # Truncate extended history to avoid LLM timeout on long conversations
                    # Keep last N messages (sliding window) to stay within context budget
                    _window = getattr(self.config, 'sliding_window_size', 20)
                    if len(extended) > _window + 4:  # +4 for system + recent tool msgs
                        # Always keep system prompt (index 0) and last _window messages
                        extended = [extended[0]] + extended[-_window:]
                        self.logger.info(f"follow-up 截断：保留 {len(extended)} 条消息（原 {len(extended) + _window - 4} 条）")

                    # On the last round, don't pass tools to force a text response
                    is_last_round = _current_tool_round >= _MAX_TOOL_ROUNDS - 1
                    followup_tools = None if is_last_round else self.tool_registry.get_available_tools()
                    llm_followup = await self._llm_call(
                        messages=extended,
                        tools=followup_tools,
                        skills=list(self.active_skills.keys()),
                        stream_callback=stream_callback,
                    )
                    followup_content = llm_followup.get('content', '')
                    followup_tool_calls_result = llm_followup.get('tool_calls')
                    followup_usage = llm_followup.get('usage', {})

                    # Save token usage for each follow-up LLM call
                    if followup_usage and followup_usage.get("total_tokens", 0) > 0:
                        _save_summary_token({
                            "agent": self.config.agent_name,
                            "model": self.llm_client.model or "",
                            "prompt_tokens": followup_usage.get("prompt_tokens", 0),
                            "completion_tokens": followup_usage.get("completion_tokens", 0),
                            "total_tokens": followup_usage.get("total_tokens", 0),
                            "source": "chat",
                        })

                    # Detect repeated identical tool calls (LLM loop)
                    if followup_tool_calls_result:
                        _current_sig = json.dumps([{'name': tc.get('name',''), 'args': json.dumps(tc.get('parameters', {}), sort_keys=True)} for tc in followup_tool_calls_result], sort_keys=True)
                        if _prev_tool_calls == _current_sig:
                            self.logger.warning(f"检测到重复工具调用循环，强制停止 (round {_current_tool_round})")
                            followup_content = "工具调用陷入循环，已强制停止。请直接回复用户。"
                            followup_tool_calls_result = None
                            break
                        _prev_tool_calls = _current_sig

                    # If LLM wants to make more tool calls, continue the loop
                    if followup_tool_calls_result and _current_tool_round < _MAX_TOOL_ROUNDS - 1:
                        # Execute the new tool calls
                        new_tool_results = []
                        for tool_call in followup_tool_calls_result:
                            try:
                                params = tool_call.get('parameters', {})
                                params = self._auto_convert_paths(tool_call['name'], params)
                                if tool_call_callback is not None:
                                    try:
                                        await tool_call_callback(tool_call['name'], 'running', {})
                                    except Exception:
                                        pass
                                self.logger.info(f"follow-up工具: {tool_call['name']} params={params}")
                                t0 = datetime.now()
                                result = await self.tool_registry.execute_tool(
                                    tool_call['name'],
                                    params
                                )
                                elapsed_ms = (datetime.now() - t0).total_seconds() * 1000
                                self.logger.info(f"follow-up结果: {tool_call['name']} success={result.success} result={str(result.data)[:100]!r}")
                                formatted_result = self._format_tool_result(result)

                                new_tool_results.append(self._build_tool_result_entry(
                                    tool_call,
                                    tool_call.get('call_id', tool_call.get('id', '')),
                                    params,
                                    formatted_result,
                                    result.success,
                                    elapsed_ms,
                                ))

                                if tool_call_callback is not None:
                                    try:
                                        await tool_call_callback(
                                            tool_call['name'],
                                            'completed' if result.success else 'failed',
                                            {'result': formatted_result, 'elapsed_ms': round(elapsed_ms, 1)}
                                        )
                                    except Exception as cb_err:
                                        self.logger.warning(f"工具调用回调异常：{cb_err}")

                                # Append to extended context for next round
                                call_id = tool_call.get('id', '') or (tool_call.get('name', '') + '_call')
                                extended.append({
                                    'role': 'assistant',
                                    'content': None,
                                    'tool_calls': [{
                                        'id': call_id,
                                        'type': 'function',
                                        'function': {
                                            'name': tool_call['name'],
                                            'arguments': json.dumps(params),
                                        }
                                    }],
                                })
                                extended.append({
                                    'role': 'tool',
                                    'content': formatted_result,
                                    'tool_call_id': call_id,
                                    'name': tool_call['name'],
                                })

                            except Exception as e:
                                elapsed_ms = (datetime.now() - t0).total_seconds() * 1000 if 't0' in dir() else 0
                                error_msg = f"Tool execution failed: {str(e)}"
                                new_tool_results.append(self._build_tool_result_entry(
                                    tool_call,
                                    tool_call.get('call_id', tool_call.get('id', '')),
                                    tool_call.get('parameters', {}),
                                    error_msg,
                                    False,
                                    elapsed_ms,
                                ))
                                self.logger.error(f"工具执行错误：{e}")

                        # Merge new tool results into total
                        tool_results.extend(new_tool_results)
                        _current_tool_round += 1
                        # Continue loop to let LLM see new results
                        continue
                    else:
                        # No more tool calls or max rounds reached
                        final_response = followup_content
                        if not final_response and tool_results:
                            # 工具结果已在思考面板展示，气泡主体不重复工具原始输出
                            tool_names = [r['tool_name'] for r in tool_results if r.get('tool_name')]
                            final_response = f"已执行工具：{', '.join(tool_names)}。" if tool_names else "工具调用已完成。"
                        break

            except Exception as e:
                self.logger.error(f"LLM 后续调用失败：{e}")
                final_response = "工具调用过程中发生错误。" if tool_results else ""
        elif tool_results:
            tool_names = [r['tool_name'] for r in tool_results if r.get('tool_name')]
            final_response = f"已执行工具：{', '.join(tool_names)}。" if tool_names else "工具调用已完成。"

        # Merge usage from follow-up call
        merged_usage = dict(usage or {})
        for k in ('prompt_tokens', 'completion_tokens', 'total_tokens'):
            merged_usage[k] = merged_usage.get(k, 0) + followup_usage.get(k, 0)

        return final_response, tool_results, merged_usage

    def _filter_memory_by_relevance(self, memory_text: str, query: str) -> str:
        """Sort memory sections by keyword relevance to the current query.

        Splits memory by ## headings, scores each section by keyword overlap
        with the query, and returns sections sorted by score (highest first).
        Sections with zero overlap are still included at the end.
        """
        if not memory_text or not query:
            return memory_text

        # Extract query keywords (CJK chars + alphanumeric words, len >= 2)
        query_lower = query.lower()
        kw_set = set(re.findall(r'[\u4e00-\u9fff]{2,}|[a-zA-Z0-9_]{2,}', query_lower))
        if not kw_set:
            return memory_text

        # Split memory into sections by ## heading
        sections = re.split(r'(?=^## )', memory_text, flags=re.MULTILINE)
        if len(sections) <= 1:
            return memory_text

        # Score each section
        scored = []
        for sec in sections:
            sec_lower = sec.lower()
            score = sum(1 for kw in kw_set if kw in sec_lower)
            scored.append((score, sec))

        # Sort: scored sections first (descending), then zero-score sections
        scored.sort(key=lambda x: x[0], reverse=True)
        return '\n'.join(sec for _, sec in scored)


    async def _summarize_history(self, older_messages: List[Dict]) -> str:
        """Summarize older conversation history using LLM.

        Used when context_compression_mode == "summary" to compress
        messages outside the sliding window into a compact summary.
        """
        if not older_messages:
            return ""

        # Format messages for summarization
        lines = []
        for msg in older_messages:
            role = msg.get('role', '')
            content = msg.get('content', '') or ''
            if msg.get('tool_calls'):
                tool_names = []
                for tc in msg['tool_calls']:
                    if isinstance(tc, dict):
                        fn = tc.get('function', {})
                        if isinstance(fn, dict):
                            tool_names.append(fn.get('name', tc.get('name', '?')))
                        else:
                            tool_names.append(tc.get('name', '?'))
                content = f"[调用工具: {', '.join(tool_names)}]"
            content_str = str(content)
            if len(content_str) > 300:
                content_str = content_str[:300] + '...'
            lines.append(f"{role}: {content_str}")

        history_text = '\n'.join(lines)
        max_tok = getattr(self.config, 'summary_max_tokens', 1000)

        summary_prompt = (
            "请用中文简洁总结以下对话历史的关键信息（不超过 200 字）：\n"
            "包括：用户的主要请求、执行的关键操作、得到的重要结果。\n\n"
            f"对话历史：\n{history_text}\n\n总结："
        )

        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: self.llm_client.client.chat.completions.create(
                    model=self.llm_client.model,
                    messages=[{'role': 'user', 'content': summary_prompt}],
                    max_tokens=max_tok,
                )
            )
            # Record token usage from summary call
            usage_obj = getattr(resp, "usage", None)
            if usage_obj and getattr(usage_obj, "total_tokens", 0) > 0:
                entry = {
                    "time": time.strftime("%H:%M:%S"),
                    "model": self.llm_client.model,
                    "prompt_tokens": getattr(usage_obj, "prompt_tokens", 0),
                    "completion_tokens": getattr(usage_obj, "completion_tokens", 0),
                    "total_tokens": getattr(usage_obj, "total_tokens", 0),
                    "agent": getattr(self.config, "name", "default"),
                }
                _save_summary_token(entry)
            return resp.choices[0].message.content.strip()
        except Exception as e:
            self.logger.warning(f"历史摘要生成失败: {e}")
            return f"[历史对话共 {len(older_messages)} 条，摘要生成失败]"

    def _get_system_prompt(
        self,
        skills_active: Optional[List[str]] = None,
        current_message: str = "",
    ) -> str:
        """Get the system prompt defining agent behavior.

        Priority:
        1. soul.md from agents directory (if loaded)
        2. agent.md from agents directory (if loaded)
        3. Default fallback prompt

        Memory integration: if memory.md exists and mode != 'none',
        memory content is injected into the prompt based on config.
        When current_message is provided, memory is filtered by keyword
        relevance so the LLM sees the most pertinent memories first.

        Skills integration: if skills_active is provided, inject skill
        descriptions so the LLM knows which skills are available.
        """
        # Determine base prompt
        if self._soul_content:
            base = self._soul_content
        elif self._agent_config_content:
            base = self._agent_config_content
        else:
            base = """You are an advanced AI assistant with access to various tools and capabilities.
Your goal is to help users accomplish their tasks by:

1. Understanding their requests clearly
2. Using appropriate tools when needed
3. Providing helpful, accurate responses
4. Asking clarifying questions when necessary

When you need to use a tool, respond with a tool call in the following JSON format:
{
  "tool_calls": [
    {
      "name": "tool_name",
      "parameters": {
        "param1": "value1",
        "param2": "value2"
      }
    }
  ]
}

Always aim to be helpful, honest, and harmless in your responses.
"""

        # Inject current model info so the LLM knows which model it's using
        if self.llm_client:
            model_name = self.llm_client.model
            base += f"\n\n## 当前运行模型\n- 你当前使用的模型是：**{model_name}**\n- 当用户询问你使用什么模型时，回答上述模型名，不要猜测。"

        # Inject active skills section (v2: supports both registry and loader)
        if skills_active:
            skill_lines = []
            for skill_name in skills_active:
                registry_entry = self.skill_registry.get(skill_name) if self.skill_registry else None
                if registry_entry:
                    caps = ', '.join(registry_entry.capabilities) if registry_entry.capabilities else 'general'
                    line = f"- **{skill_name}**: {registry_entry.description} (能力: {caps})"
                    if registry_entry.when_to_use:
                        line += f"\n  → 何时使用: {registry_entry.when_to_use}"
                    skill_lines.append(line)
                else:
                    skill = self.skill_loader.get_active_skill(skill_name) if self.skill_loader else None
                    if skill:
                        caps = ', '.join(skill.capabilities) if skill.capabilities else 'general'
                        line = f"- **{skill_name}**: {skill.description} (能力: {caps})"
                        if skill.when_to_use:
                            line += f"\n  → 何时使用: {skill.when_to_use}"
                        skill_lines.append(line)
                    else:
                        skill_lines.append(f"- **{skill_name}**: 已激活技能")

            if skill_lines:
                skills_block = "## 已激活技能\n" + '\n'.join(skill_lines)
                base = base + '\n\n' + skills_block

        # Inject memory if available and mode is not 'none'
        mem_cfg = self._memory_integration_config or {}
        if self._memory_content and mem_cfg.get('mode', 'append') != 'none':
            memory_text = self._memory_content

            # Relevance filter: if current_message provided, sort memory
            # sections by keyword overlap so most relevant parts come first
            if current_message and mem_cfg.get('relevance_filter', True):
                memory_text = self._filter_memory_by_relevance(
                    memory_text, current_message
                )

            # Truncate if exceeds max_tokens (rough char estimate: 1 token ~ 4 chars)
            max_chars = (mem_cfg.get('max_tokens', 2000)) * 4
            if len(memory_text) > max_chars:
                memory_text = memory_text[:max_chars] + '\n... (已截断)'

            # Build memory block
            template = mem_cfg.get('template', '')
            if template:
                memory_block = template.replace('{memory}', memory_text)
            else:
                memory_block = f"## 历史记忆\n{memory_text}"

            mode = mem_cfg.get('mode', 'append')
            if mode == 'prepend':
                return memory_block + '\n\n' + base
            elif mode == 'system':
                return memory_block
            else:  # append
                position = mem_cfg.get('position', 'after_system')
                if position == 'after_system':
                    return base + '\n\n' + memory_block
                else:  # before_user or after_user - append to system for now
                    return base + '\n\n' + memory_block

        return base

    def _format_tool_result(self, result: ToolResult) -> str:
        """Format tool result for human-readable output."""
        if result.success:
            if isinstance(result.data, list):
                lines = []
                for item in result.data[:5]:
                    if isinstance(item, dict) and 'title' in item:
                        # Search result dict
                        title = item.get('title', '')
                        url = item.get('url', '')
                        snippet = item.get('snippet', '')
                        line = f"• {title}"
                        if url:
                            line += f"\n  {url}"
                        if snippet:
                            line += f"\n  {snippet}"
                        lines.append(line)
                    else:
                        lines.append(str(item))
                return "\n".join(lines)
            if isinstance(result.data, dict):
                # For dict data (e.g. TTS returns {audio_path: ...}),
                # return JSON so the frontend can parse it reliably.
                return json.dumps(result.data, ensure_ascii=False)
            return str(result.data)
        else:
            return f"Error: {result.error}"

    def _build_tool_result_entry(self, tool_call: Dict, call_id: str, params: Dict,
                                  formatted_result: str, success: bool, elapsed_ms: float) -> Dict:
        """Build a standardized tool result entry to avoid repetition."""
        return {
            'tool_name': tool_call['name'],
            'call_id': call_id,
            'parameters': params,
            'result': formatted_result,
            'success': success,
            'elapsed_ms': round(elapsed_ms, 1),
        }

    @staticmethod
    def _truncate_tool_steps(tool_results: list, max_result_len: int = 200, max_param_len: int = 100) -> list:
        """Return a shallow copy of tool_results with result/parameters truncated for DB storage."""
        truncated = []
        for step in tool_results:
            t = dict(step)
            result = t.get('result')
            if isinstance(result, str) and len(result) > max_result_len:
                t['result'] = result[:max_result_len] + '... (truncated, {} chars)'.format(len(result))
            params = t.get('parameters')
            if isinstance(params, dict):
                t['parameters'] = {
                    k: (v[:max_param_len] + '... (truncated, {} chars)'.format(len(v)))
                    if isinstance(v, str) and len(v) > max_param_len
                    else v
                    for k, v in params.items()
                }
            truncated.append(t)
        return truncated

    def _generate_final_response_from_tool_calls(self, tool_calls: List[Dict]) -> str:
        """Generate a text response describing the tool calls that would have been made.

        Used when max tool rounds is reached — instead of making more tool calls,
        tell the user what the agent was trying to do.
        """
        if not tool_calls:
            return "I've processed your request."

        descriptions = []
        for tc in tool_calls:
            name = tc.get('name', 'unknown')
            params = tc.get('parameters', {})
            param_str = ', '.join(f'{k}={v!r}' for k, v in params.items())
            descriptions.append(f"- {name}({param_str})")

        return (
            "我准备执行以下操作，但已达到工具调用轮次上限：\n"
            + "\n".join(descriptions)
            + "\n\n请让我知道是否需要继续执行这些操作。"
        )

    def _generate_final_response(self, tool_results: List[Dict]) -> str:
        """Generate final response incorporating tool results (in Chinese)."""
        if not tool_results:
            return "已完成处理。"

        successful_tools = [r for r in tool_results if r['success']]
        failed_tools = [r for r in tool_results if not r['success']]

        lines = []
        for r in successful_tools:
            name = r['tool_name']
            result = str(r.get('result', '')).strip()
            elapsed = r.get('elapsed_ms', 0)
            # Truncate long results
            if len(result) > 300:
                result = result[:300] + '...'
            lines.append(f"🔧 {name} ({elapsed}ms):\n{result}")

        for r in failed_tools:
            name = r['tool_name']
            err = str(r.get('result', r.get('error', '未知错误'))).strip()
            lines.append(f"❌ {name}: {err}")

        return "工具执行结果：\n\n" + "\n\n".join(lines)

    def _select_fallback_model(self) -> Optional[Dict]:
        """Select a fallback model different from the current one."""
        current = self.llm_client.model if self.llm_client else ""
        try:
            from ai_agent.models_db import ModelsDB
            db_path = str(Path(__file__).resolve().parent.parent.parent / "data" / "models.db")
            db = ModelsDB(db_path)
            all_models = db.get_models_flat()
            for m in all_models:
                name = m.get("name", "")
                if name != current and m.get("api_key"):
                    return m
        except Exception:
            pass
        return None

    def _pre_call_context_check(self, messages: List[Dict]) -> List[Dict]:
        """Pre-call context size check and tool result truncation."""
        # Quick message count check
        if len(messages) > 100:
            # Keep system + last 50 messages
            system_msgs = [m for m in messages if m.get("role") == "system"]
            recent = [m for m in messages if m.get("role") != "system"][-50:]
            messages = system_msgs + recent
        # Truncate oversized tool results
        return self._truncate_tool_results(messages, max_chars=getattr(self.config, 'tool_result_max_tokens', 500) * 4)

    def _truncate_tool_results(self, messages: List[Dict], max_chars: int = 2000) -> List[Dict]:
        """Truncate tool result messages to prevent context overflow."""
        result = []
        for msg in messages:
            if msg.get("role") == "tool":
                content = msg.get("content", "")
                if len(content) > max_chars:
                    msg = dict(msg)
                    msg["content"] = content[:max_chars] + "\n...[已截断]"
            elif msg.get("role") == "assistant":
                # Also check tool_calls in assistant messages
                tcs = msg.get("tool_calls")
                if tcs:
                    truncated_tcs = []
                    for tc in tcs:
                        func = tc.get("function", {})
                        args_str = func.get("arguments", "")
                        if isinstance(args_str, str) and len(args_str) > max_chars:
                            tc = dict(tc)
                            tc["function"] = dict(func)
                            tc["function"]["arguments"] = args_str[:max_chars] + "\n...[已截断]"
                        truncated_tcs.append(tc)
                    if truncated_tcs != tcs:
                        msg = dict(msg)
                        msg["tool_calls"] = truncated_tcs
            result.append(msg)
        return result

    @staticmethod
    def _classify_error(exc) -> str:
        """Classify LLM error: 'retry' | 'failover' | 'abort'."""
        from openai import RateLimitError, APIConnectionError, APIError
        if isinstance(exc, RateLimitError):
            return 'retry'
        if isinstance(exc, APIConnectionError):
            return 'retry'
        if isinstance(exc, APIError):
            if exc.status_code in (401, 403):
                return 'failover'
            if exc.status_code >= 500:
                return 'retry'
            if exc.status_code == 422 and 'stream' in str(exc.message).lower():
                # Provider doesn't support streaming — disable for this session
                return 'retry_no_stream'
            return 'abort'
        return 'abort'

    async def steer(self, user_note: str):
        """Inject a user note into the current running turn without interrupting."""
        async with self._pending_steer_lock:
            self._pending_steer = (self._pending_steer or "") + user_note

    def _drain_pending_steer(self) -> Optional[str]:
        """Take and clear the pending steer text."""
        text = self._pending_steer
        self._pending_steer = None
        return text

    async def _llm_call(
        self,
        messages: List[Dict],
        tools: List[Dict],
        skills: List[str],
        stream_callback=None,
        _stop_event: Optional[asyncio.Event] = None,
    ) -> Dict:
        """
        Call the LLM to generate a response.

        If stream_callback is provided, uses streaming mode and calls
        stream_callback(delta_text) for each chunk. The callback is
        called from within the executor thread via asyncio.run_coroutine_threadsafe.

        Returns:
            Dict with 'content', 'tool_calls', 'usage', 'finish_reason'.
        """
        if self.llm_client is None:
            # Fallback stub when no LLM is configured
            self.logger.warning("llm_client 为 None，使用 stub 响应")
            last_user_message = ""
            for msg in reversed(messages):
                if msg['role'] == 'user':
                    last_user_message = msg['content']
                    break
            if "tool" in last_user_message.lower() or "what can" in last_user_message.lower():
                available_tools = [t['name'] for t in tools]
                content = f"我有以下可用工具：{', '.join(available_tools) if available_tools else '暂无工具'}。有什么可以帮你的？"
            else:
                content = f"收到你的消息。抱歉，LLM 服务暂时不可用（可能是 API 额度不足或网络问题），请稍后再试。"
            return {'content': content, 'tool_calls': None, 'usage': {}, 'finish_reason': 'stop'}

        # Pre-call context check + truncation
        messages = self._pre_call_context_check(messages)
        tools_payload = None
        if tools:
            tools_payload = []
            for t in tools:
                tool_def = {
                    "type": "function",
                    "function": {
                        "name": t.get("name", ""),
                        "description": t.get("description", ""),
                    },
                }
                params = t.get("parameters") or t.get("schema")
                if params:
                    tool_def["function"]["parameters"] = params
                tools_payload.append(tool_def)

        # Make the actual API call in a thread to avoid blocking
        self.logger.info(f"开始 LLM 调用：模型={self.llm_client.model}, 消息数={len(messages)}, 工具数={len(tools_payload) if tools_payload else 0}, streaming={'是' if stream_callback else '否'}")
        loop = asyncio.get_event_loop()
        max_attempts = self.config.llm_max_retries
        result = None
        self._last_llm_error_class = 'none'

        # Determine if we should use streaming
        _use_streaming = bool(stream_callback) and not self._disable_streaming

        for attempt in range(1, max_attempts + 1):
            # Exponential backoff: wait before retry (not on first attempt)
            if attempt > 1:
                backoff = 2 ** (attempt - 2)  # 1s, 2s, 4s...
                self.logger.info(f"LLM 调用退避等待 {backoff}s 后重试（第 {attempt}/{max_attempts} 次）...")
                await asyncio.sleep(backoff)

            # Failover: if previous errors were fatal, switch model
            if self._last_llm_error_class == 'failover' and attempt > 1:
                fallback = self._select_fallback_model()
                if fallback:
                    self.logger.warning(f"Failover: {self.llm_client.model} → {fallback['name']}")
                    self.configure_llm(
                        api_key=fallback.get('api_key', ''),
                        base_url=fallback.get('base_url', ''),
                        model=fallback['name'],
                    )
                    self._last_llm_error_class = 'none'

            try:
                if _use_streaming:
                    # Streaming mode: collect chunks via callback
                    collected_content = []
                    collected_tool_calls = None
                    collected_usage = {}
                    collected_finish = "stop"
                    pending_futures = []
                    last_raw_chunk = None
                    current_gen = self._stream_generation

                    def _stream_collector():
                        """Runs in executor thread, collects streaming chunks with stale detection."""
                        nonlocal collected_content, collected_tool_calls, collected_usage, collected_finish, pending_futures
                        last_chunk = None
                        chunk_count = 0
                        last_data_time = time.time()
                        empty_content_stale = time.time()
                        STALE_TIMEOUT = 90  # 90s without any data = wedged stream

                        raw_stream = self.llm_client.chat_completion_stream(
                            messages=messages,
                            tools=tools_payload,
                        )
                        for chunk in raw_stream:
                            chunk_count += 1
                            now = time.time()

                            # Stale-stream watchdog
                            if now - last_data_time > STALE_TIMEOUT:
                                self.logger.warning(f"流式响应卡死 {now - last_data_time:.0f}s（stale），中止流")
                                self._stream_stale_count += 1
                                if self._stream_stale_count >= 3:
                                    self._disable_streaming = True
                                    self.logger.warning("连续 stale 3 次，断路器断开，本会话禁用流式")
                                break
                            last_data_time = now

                            # Generation check — stop if a newer turn superseded this one
                            if current_gen != self._stream_generation:
                                self.logger.info("流已被新 turn 取代，停止旧流投递")
                                break

                            if chunk_count <= 3:
                                self.logger.info(f"[_stream_collector] chunk#{chunk_count}: keys={list(chunk.keys())}, delta={chunk.get('delta','')[:50]!r}")
                            # Check stop event — break immediately if user cancelled
                            if _stop_event is not None and _stop_event.is_set():
                                self.logger.info("LLM 流式读取被用户中断（stop_event）")
                                break
                            last_chunk = chunk
                            # Handle thinking/reasoning content (DeepSeek R1, etc.)
                            thinking_text = chunk.get("thinking", "")
                            if thinking_text and self.ws_send:
                                try:
                                    asyncio.run_coroutine_threadsafe(
                                        self.ws_send({
                                            "type": "thinking_text",
                                            "text": thinking_text,
                                            "session_id": self.ws_session_id,
                                        }), loop
                                    )
                                except Exception:
                                    pass
                            delta = chunk.get("delta", "")
                            if delta:
                                collected_content.append(delta)
                                last_data_time = time.time()  # reset on actual content
                                if not empty_content_stale:
                                    pass
                                empty_content_stale = now  # track last content time
                                # Generation check before delivering delta
                                if current_gen != self.ws_session_id if False else current_gen == self._stream_generation:
                                    future = asyncio.run_coroutine_threadsafe(
                                        stream_callback(delta), loop
                                    )
                                    pending_futures.append(future)
                            else:
                                # Empty delta — track for early degradation
                                pass

                            fr = chunk.get("finish_reason")
                            if fr:
                                collected_finish = fr
                            tc = chunk.get("tool_calls")
                            if tc is not None:
                                collected_tool_calls = tc
                            usage = chunk.get("usage")
                            if usage:
                                collected_usage = usage

                        # Save last chunk as raw LLM response (contains full data)
                        nonlocal last_raw_chunk
                        last_raw_chunk = last_chunk

                    await asyncio.wait_for(
                        loop.run_in_executor(None, _stream_collector),
                        timeout=self.config.llm_timeout,
                    )

                    # Wait for all pending stream sends to complete before returning
                    for i, f in enumerate(pending_futures):
                        try:
                            f.result(timeout=5)
                        except asyncio.TimeoutError:
                            self.logger.warning(f"流式 chunk 发送超时（第 {i+1}/{len(pending_futures)} 个）")
                        except Exception as e:
                            self.logger.warning(f"流式 chunk 发送失败（第 {i+1}/{len(pending_futures)} 个）：{e}")

                    content = "".join(collected_content)
                    # Build result dict for normal streaming path
                    result = {
                        'content': content,
                        'tool_calls': collected_tool_calls,
                        'usage': collected_usage,
                        'finish_reason': collected_finish,
                        '_raw_llm': last_raw_chunk,
                    }
                    # Detect truncation: LLM hit max_tokens limit during streaming
                    if collected_finish == 'length':
                        self.logger.warning(f"流式 LLM 响应被截断（finish_reason=length），content 长度={len(content)}")
                        result['content'] += "\n\n[回复因长度限制被截断，如需完整内容请要求继续]"
                    # 空 content 检测：有效 SSE 流但 content 全为空且无 tool_calls
                    # 注意：finish_reason=tool_calls 时 collected_tool_calls 应该非空（由 llm_client.py 修复后）
                    # 如果仍然为空（旧版本兼容），只在非 tool_calls 时降级
                    if not content.strip() and not collected_tool_calls:
                        if collected_finish == 'tool_calls':
                            # tool_calls 数据可能还在流式传输中，不降级，继续让 agent 处理
                            self.logger.warning(f"流式返回空 content 但 finish_reason=tool_calls，不降级（tool_calls 可能尚未到达）")
                        else:
                            # 直接降级为非流式调用一次，避免无效的流式重试
                            self.logger.warning(f"LLM 流式返回空 content，尝试一次非流式调用进行降级")
                        # 非流式单次调用
                        result_raw = await asyncio.wait_for(
                            loop.run_in_executor(
                                None,
                                lambda: self.llm_client.chat_completion(
                                    messages=messages,
                                    tools=tools_payload,
                                ),
                            ),
                            timeout=self.config.llm_timeout,
                        )
                        result = {
                            'content': result_raw.get('content', ''),
                            'tool_calls': result_raw.get('tool_calls'),
                            'usage': result_raw.get('usage', {}),
                            'finish_reason': result_raw.get('finish_reason', 'stop'),
                        }
                        # 已经得到非流式结果，直接跳出流式处理循环
                        break
                else:
                    # Non-streaming mode (original behavior)
                    result_raw = await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            lambda: self.llm_client.chat_completion(
                                messages=messages,
                                tools=tools_payload,
                            ),
                        ),
                        timeout=self.config.llm_timeout,
                    )
                    result = {
                        'content': result_raw.get('content', ''),
                        'tool_calls': result_raw.get('tool_calls'),
                        'usage': result_raw.get('usage', {}),
                        'finish_reason': result_raw.get('finish_reason', 'stop'),
                        '_raw_llm': result_raw,
                    }
                    # Detect truncation: LLM hit max_tokens limit
                    if result['finish_reason'] == 'length':
                        self.logger.warning(f"LLM 响应被截断（finish_reason=length），content 长度={len(result['content'])}")
                        result['content'] += "\n\n[回复因长度限制被截断，如需完整内容请要求继续]"
                    # 空 content 检测：非流式响应为空且无 tool_calls
                    if not result['content'].strip() and not result['tool_calls']:
                        if attempt < max_attempts:
                            self.logger.warning(f"LLM 非流式返回空 content，重试（第 {attempt}/{max_attempts} 次）...")
                            continue
                        self.logger.error("LLM 非流式返回空 content，已重试耗尽")
                        result['content'] = "[服务暂时没有响应，请重试]"
                        result['finish_reason'] = 'error'
            except asyncio.TimeoutError:
                self.logger.warning(f"LLM 调用超时（第 {attempt}/{max_attempts} 次）")
                self._last_llm_error_class = 'retry'
                result = {
                    'content': f"[⏱️ LLM 调用超时（{self.config.llm_timeout}s），请重试或减少历史消息长度]",
                    'tool_calls': None,
                    'usage': {},
                    'finish_reason': 'timeout',
                }
                if attempt < max_attempts:
                    continue
                break
            except Exception as e:
                error_class = self._classify_error(e)
                self._last_llm_error_class = error_class
                self.logger.error(f"LLM 调用异常（class={error_class}）：{e}", exc_info=True)

                # Streaming circuit breakers
                if error_class == 'retry_no_stream':
                    self._disable_streaming = True
                    self.logger.warning("Provider returned 422 for streaming — disabling streaming for this session")
                    _use_streaming = False  # retry immediately in non-streaming mode
                    continue

                if error_class == 'failover':
                    result = {
                        'content': "[🔄 LLM 授权失败，正在切换备用模型...]",
                        'tool_calls': None,
                        'usage': {},
                        'finish_reason': 'error',
                    }
                    # Failover will be handled in the next attempt
                    continue

                result = {
                    'content': f"[LLM 调用异常：{str(e)[:200]}，可能是网络或服务端问题，请重试]",
                    'tool_calls': None,
                    'usage': {},
                    'finish_reason': 'error',
                }
                if attempt < max_attempts:
                    continue
                break

        self.logger.info(f"LLM 调用完成：finish_reason={result.get('finish_reason')}")
        return result

    async def skill_view(self, name: str) -> str:
        """Load full skill content by name. Called by LLM."""
        if self.skill_registry:
            entry = self.skill_registry.get(name)
            if entry:
                content = self.skill_registry.load_content(name)
                if self.skill_feedback:
                    self.skill_feedback.record_selection(name, selected=True)
                return content
        if self.skill_loader:
            skill = self.skill_loader.get_active_skill(name)
            if skill:
                if self.skill_feedback:
                    self.skill_feedback.record_selection(name, selected=True)
                return skill.description
        return f"Skill '{name}' not found"

    async def shutdown(self) -> bool:
        """Gracefully shutdown the agent."""
        self.logger.info("正在关闭 AI Agent...")
        self.is_running = False

        # Save any pending state
        await self.session_manager.cleanup()

        self.logger.info("AI Agent 已关闭")
        return True

    async def get_status(self) -> Dict:
        """Get current agent status."""
        return {
            'agent_id': self.agent_id,
            'name': self.config.name,
            'is_running': self.is_running,
            'current_session': self.current_session,
            'active_skills': list(self.active_skills.keys()),
            'registered_tools': self.tool_registry.list_tools(),
            'metrics': self.metrics.get_summary(),
            'llm_configured': self.llm_client is not None,
        }
