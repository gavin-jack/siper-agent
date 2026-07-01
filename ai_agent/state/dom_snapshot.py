"""
DOM 快照数据结构 — 后端状态权威的内存镜像

四层存储：
  层1 常驻（~10KB）：页面状态 + 流式文本
  层2 活跃（~74KB）：会话列表(50) + 消息(50) + 智能体
  层3 缓存（200KB TTL 30s）：页面数据按需加载
  层4 磁盘（SQLite）：全量历史
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class SessionSummary:
    """会话摘要 — 列表页展示用（~200 字节）"""
    session_id: str = ""
    agent_name: str = "default"
    agent_icon: str = "🎭"
    last_message: str = ""
    last_time: str = ""
    message_count: int = 0
    unread: bool = False
    title: str = ""


@dataclass
class MessageEntry:
    """消息条目 — 聊天展示用（~1KB）"""
    role: str = ""
    content: str = ""
    timestamp: str = ""
    meta: Optional[dict] = None


@dataclass
class AgentInfo:
    """智能体信息"""
    name: str = "default"
    icon: str = "🎭"
    display_name: str = "Default"
    model: str = ""
    active_sessions: int = 0


# 类型别名
PageCache = Dict[str, Any]
CacheTs = Dict[str, float]
