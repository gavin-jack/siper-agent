"""
Session Manager - SQLite-backed conversation session management.

内存控制：
- active_sessions 使用 OrderedDict 实现 LRU，MAX_ACTIVE_SESSIONS=200
- 消息按需加载，内存中保留 = 活跃 session × 50 条
- conversation_history 限制 50 条/session（切片截断）
"""

import json
import logging
import sqlite3
import uuid
from collections import OrderedDict
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field, fields, asdict
from datetime import datetime
from pathlib import Path

# 活跃会话数上限，超限时 LRU 淘汰最旧会话
MAX_ACTIVE_SESSIONS = 200


@dataclass
class Message:
    """A single message in a conversation."""
    message_id: str
    role: str  # 'user', 'assistant', 'system', 'tool'
    content: str
    timestamp: str
    session_id: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    tool_name: Optional[str] = None
    tool_call_id: Optional[str] = None

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict) -> 'Message':
        """Create from dictionary."""
        # Filter out keys not accepted by Message (e.g. 'meta' stored by session manager)
        valid_keys = {f.name for f in fields(cls)}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class ConversationSession:
    """In-memory session representation."""

    session_id: str
    user_id: str
    created_at: str
    ended_at: Optional[str] = None
    messages: List[Dict] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def add_message(
        self,
        role: str,
        content: Optional[str],
        **kwargs
    ):
        """Add a message to the session."""
        message = {
            'message_id': uuid.uuid4().hex[:20],
            'role': role,
            'content': content,
            'timestamp': datetime.now().isoformat(),
            'session_id': self.session_id,
            **kwargs
        }
        self.messages.append(message)
        return message

    def get_context_window(self, max_tokens: int = 4000) -> List[Dict]:
        """
        Get truncated conversation context within token limit.

        Args:
            max_tokens: Maximum tokens to include

        Returns:
            List of messages within token limit
        """

        # Estimate tokens from full message JSON (content + metadata)
        def estimate_tokens(message: Dict) -> int:
            return max(len(json.dumps(message, ensure_ascii=False)) // 4, 1)

        current_tokens = 0
        context = []

        # Start from most recent messages
        for message in reversed(self.messages):
            message_tokens = estimate_tokens(message)
            if current_tokens + message_tokens > max_tokens:
                break
            context.insert(0, message)
            current_tokens += message_tokens

        return context

    def to_dict(self) -> Dict:
        """Convert to dictionary for storage."""
        return {
            'session_id': self.session_id,
            'user_id': self.user_id,
            'created_at': self.created_at,
            'ended_at': self.ended_at,
            'messages': self.messages,
            'context': self.context,
            'metadata': self.metadata
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'ConversationSession':
        """Create from dictionary."""
        return cls(
            session_id=data['session_id'],
            user_id=data['user_id'],
            created_at=data['created_at'],
            ended_at=data.get('ended_at'),
            messages=data.get('messages', []),
            context=data.get('context', {}),
            metadata=data.get('metadata', {})
        )


class SessionManager:
    """
    Manages conversation sessions with SQLite persistence.

    Features:
    - Create, retrieve, update, and delete sessions
    - SQLite-backed persistent storage
    - Session timeout handling
    - Message history management
    """

    def __init__(self, data_dir: str = "./data"):
        self.data_dir = Path(data_dir)
        self.db_path = self.data_dir / "sessions" / "sessions.db"
        self.active_sessions: OrderedDict[str, ConversationSession] = OrderedDict()
        self.logger = logging.getLogger("session_manager")
        self._db_connection: Optional[sqlite3.Connection] = None

    async def initialize(self) -> bool:
        """Initialize the session manager and database."""
        try:
            # Ensure data directory exists
            self.data_dir.mkdir(parents=True, exist_ok=True)

            # Connect to database
            self._db_connection = sqlite3.connect(str(self.db_path))
            self._db_connection.row_factory = sqlite3.Row
            self._db_connection.execute("PRAGMA journal_mode=WAL")
            self._db_connection.execute("PRAGMA synchronous=NORMAL")

            # Create tables
            await self._create_tables()

            self.logger.info("会话管理器初始化成功")
            return True

        except Exception as e:
            self.logger.error(f"会话管理器初始化失败：{e}")
            return False

    async def _create_tables(self):
        """Create database tables if they don't exist."""
        cursor = self._db_connection.cursor()

        # Sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                ended_at TEXT,
                updated_at TEXT,
                context TEXT,
                metadata TEXT,
                title TEXT DEFAULT ''
            )
        ''')
        # Migration: add title column if missing (older databases)
        try:
            cursor.execute("ALTER TABLE sessions ADD COLUMN title TEXT DEFAULT ''")
        except Exception:
            pass
        # Migration: add updated_at column if missing (older databases)
        try:
            cursor.execute("ALTER TABLE sessions ADD COLUMN updated_at TEXT")
        except Exception:
            pass

        # Messages table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                message_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                tool_name TEXT,
                tool_call_id TEXT,
                meta TEXT DEFAULT '{}',
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            )
        ''')

        # Migration: add meta column if not exists (backward compat)
        cursor.execute("PRAGMA table_info(messages)")
        cols = [row[1] for row in cursor.fetchall()]
        if 'meta' not in cols:
            cursor.execute("ALTER TABLE messages ADD COLUMN meta TEXT DEFAULT '{}'")

        # Create indexes for faster queries
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_messages_session
            ON messages(session_id)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_sessions_user
            ON sessions(user_id)
        ''')

        self._db_connection.commit()

    async def create_session(
        self,
        user_id: str,
        metadata: Dict[str, Any] = None
    ) -> str:
        """
        Create a new conversation session.

        Args:
            user_id: User identifier
            metadata: Optional session metadata

        Returns:
            Session ID
        """
        session_id = uuid.uuid4().hex[:12]
        session = ConversationSession(
            session_id=session_id,
            user_id=user_id,
            created_at=datetime.now().isoformat(),
            metadata=metadata or {}
        )

        # LRU eviction: remove oldest if at capacity
        while len(self.active_sessions) >= MAX_ACTIVE_SESSIONS:
            evicted_id, evicted = self.active_sessions.popitem(last=False)
            self.logger.info(f"[LRU] evicted session {evicted_id} on create")

        # Store in memory only
        self.active_sessions[session_id] = session
        # Track as unsaved (not yet persisted to DB)
        if not hasattr(self, '_unsaved_sessions'):
            self._unsaved_sessions = set()
        self._unsaved_sessions.add(session_id)

        self.logger.info(f"已为用户 {user_id} 创建会话 {session_id}")
        return session_id

    async def persist_session(self, session_id: str):
        """
        显式将会话持久化到数据库。
        应在 AI 成功回复后调用，确保只有有效会话才写入 DB。
        """
        self.logger.info(f"[PERSIST] called for {session_id}")
        session = self.active_sessions.get(session_id)
        if not session:
            self.logger.warning(f"[PERSIST] session {session_id} not in active_sessions!")
            return
        self.logger.info(f"[PERSIST] session found, {len(session.messages)} messages")
        # Save session record
        await self._save_session(session)
        # Batch save all pending messages (executemany instead of N individual INSERTs)
        if session.messages and self._db_connection:
            cursor = self._db_connection.cursor()
            meta_default = '{}'
            cursor.executemany(
                '''INSERT OR REPLACE INTO messages
                (message_id, session_id, role, content, timestamp, tool_name, tool_call_id, meta)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                [
                    (
                        msg['message_id'],
                        msg['session_id'],
                        msg['role'],
                        msg['content'] if msg['content'] is not None else '',
                        msg['timestamp'],
                        msg.get('tool_name'),
                        msg.get('tool_call_id'),
                        json.dumps(msg.get('meta', {}), ensure_ascii=False, default=str) if msg.get('meta') else meta_default,
                    )
                    for msg in session.messages
                ]
            )
            self._db_connection.commit()
        # Mark as saved
        if hasattr(self, '_unsaved_sessions'):
            self._unsaved_sessions.discard(session_id)
        self.logger.info(f"[PERSIST] done for {session_id}")

    async def get_session(self, session_id: str) -> Optional[ConversationSession]:
        """
        Retrieve an existing session.
        Uses LRU eviction when active_sessions exceeds MAX_ACTIVE_SESSIONS.
        """
        # Check in-memory cache first
        if session_id in self.active_sessions:
            # Move to end (most recently used)
            self.active_sessions.move_to_end(session_id)
            return self.active_sessions[session_id]

        # Load from database
        session = await self._load_session(session_id)
        if session:
            # LRU eviction: remove oldest if at capacity
            while len(self.active_sessions) >= MAX_ACTIVE_SESSIONS:
                evicted_id, evicted = self.active_sessions.popitem(last=False)
                self.logger.info(f"[LRU] evicted session {evicted_id} ({len(evicted.messages)} msgs)")
            self.active_sessions[session_id] = session
            # Loaded from DB, so it's persisted — remove from unsaved tracking
            if hasattr(self, '_unsaved_sessions'):
                self._unsaved_sessions.discard(session_id)

        return session

    async def add_message(
        self,
        session_id: str,
        role: str,
        content: Optional[str],
        **kwargs
    ) -> Optional[Message]:
        """
        Add a message to a session.

        Args:
            session_id: Session identifier
            role: Message role (user, assistant, system, tool)
            content: Message content
            **kwargs: Additional message metadata

        Returns:
            Message object or None if session not found
        """
        session = await self.get_session(session_id)
        if not session:
            return None

        message = session.add_message(role, content, **kwargs)

        # Only persist message to DB if session has been persisted
        if session_id not in getattr(self, '_unsaved_sessions', set()):
            await self._save_message(message)

        return Message.from_dict(message)

    async def end_session(self, session_id: str) -> bool:
        """
        End and cleanup a session.

        Args:
            session_id: Session identifier

        Returns:
            True if successful
        """
        if session_id not in self.active_sessions:
            # Try to load from database
            session = await self._load_session(session_id)
            if not session:
                return False
        else:
            session = self.active_sessions.pop(session_id)

        # If session was never persisted to DB (unsaved), just discard it
        if session_id in getattr(self, '_unsaved_sessions', set()):
            self._unsaved_sessions.discard(session_id)
            self.logger.info(f"已丢弃未持久化的会话：{session_id}（无 AI 回复）")
            return True

        session.ended_at = datetime.now().isoformat()

        # Update database
        await self._update_session(session)

        self.logger.info(f"已结束会话 {session_id}")
        return True

    async def list_active_sessions(self, user_id: str = None) -> List[str]:
        """
        List all active session IDs.

        Args:
            user_id: Optional filter by user

        Returns:
            List of session IDs
        """
        if user_id:
            cursor = self._db_connection.cursor()
            cursor.execute(
                'SELECT session_id FROM sessions WHERE user_id = ? AND ended_at IS NULL',
                (user_id,)
            )
            return [row['session_id'] for row in cursor.fetchall()]

        return list(self.active_sessions.keys())

    async def archive_session(
        self,
        session_id: str,
        reason: str = None
    ) -> bool:
        """
        Archive a completed session.

        Args:
            session_id: Session identifier
            reason: Reason for archiving

        Returns:
            True if successful
        """
        session = await self.get_session(session_id)
        if not session:
            return False

        if session.metadata is None:
            session.metadata = {}
        session.metadata['archived'] = True
        session.metadata['archive_reason'] = reason
        session.metadata['archived_at'] = datetime.now().isoformat()

        await self._update_session(session)

        if session_id in self.active_sessions:
            del self.active_sessions[session_id]

        self.logger.info(f"已归档会话 {session_id}：{reason}")
        return True

    async def _save_session(self, session: ConversationSession):
        """Save session to database."""

        cursor = self._db_connection.cursor()
        now = datetime.now().isoformat()
        # Update updated_at timestamp on every save
        session.updated_at = now
        cursor.execute('''
            INSERT OR REPLACE INTO sessions
            (session_id, user_id, created_at, ended_at, updated_at, context, metadata, title)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            session.session_id,
            session.user_id,
            session.created_at,
            session.ended_at,
            session.updated_at,
            json.dumps(session.context),
            json.dumps(session.metadata),
            getattr(session, 'title', '')
        ))
        self._db_connection.commit()

    async def _load_session(self, session_id: str) -> Optional[ConversationSession]:
        """Load session from database."""

        cursor = self._db_connection.cursor()
        cursor.execute(
            'SELECT * FROM sessions WHERE session_id = ?',
            (session_id,)
        )
        row = cursor.fetchone()

        if not row:
            return None

        session = ConversationSession(
            session_id=row['session_id'],
            user_id=row['user_id'],
            created_at=row['created_at'],
            ended_at=row['ended_at'],
            context=json.loads(row['context']) if row['context'] else {},
            metadata=json.loads(row['metadata']) if row['metadata'] else {}
        )

        # Load messages
        messages = await self._load_messages(session_id)
        session.messages = messages

        return session

    async def _update_session(self, session: ConversationSession):
        """Update session in database."""
        await self._save_session(session)

    async def _save_message(self, message: Dict):
        """Save message to database."""
        cursor = self._db_connection.cursor()
        meta_json = json.dumps(message.get('meta', {}), ensure_ascii=False, default=str) if message.get('meta') else '{}'
        # content may be None for assistant messages with tool_calls only
        safe_content = message['content'] if message['content'] is not None else ''
        cursor.execute('''
            INSERT OR REPLACE INTO messages
            (message_id, session_id, role, content, timestamp, tool_name, tool_call_id, meta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            message['message_id'],
            message['session_id'],
            message['role'],
            safe_content,
            message['timestamp'],
            message.get('tool_name'),
            message.get('tool_call_id'),
            meta_json,
        ))
        self._db_connection.commit()

    async def _load_messages(self, session_id: str) -> List[Dict]:
        """Load messages for a session from database."""
        cursor = self._db_connection.cursor()
        cursor.execute(
            'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp',
            (session_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    async def cleanup(self):
        """Cleanup resources."""
        # End all active sessions
        for session_id in list(self.active_sessions.keys()):
            await self.end_session(session_id)

        # Close database connection
        if self._db_connection:
            self._db_connection.close()
            self._db_connection = None

        self.logger.info("会话管理器清理完成")
