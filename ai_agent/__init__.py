"""
AI Agent Core Framework
A modular AI agent system with tool calling, session management, skill loading.
"""

__version__ = "1.0.0"

from .core.agent import AIAgent, AgentConfig
from .tools.tool_registry import ToolRegistry, BaseTool, ToolResult, ToolCall
from .sessions.session_manager import SessionManager, ConversationSession
from .skills.skill_loader import SkillLoader, Skill

__all__ = [
    "AIAgent",
    "AgentConfig",
    "ToolRegistry",
    "BaseTool",
    "ToolResult",
    "ToolCall",
    "SessionManager",
    "ConversationSession",
    "SkillLoader",
    "Skill",
]
