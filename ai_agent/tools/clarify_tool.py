"""
Clarify Tool - Interactive user clarification during LLM execution.

When the LLM needs to pause execution and ask the user a question
(multi-choice or open-ended), it calls this tool. The agent loop
detects the special __CLARIFY__ marker, sends the question to the
frontend via WebSocket, and waits for the user's response before
continuing.

Flow:
1. LLM calls clarify(question="...", options=[...])
2. Agent loop detects __CLARIFY__ marker
3. Agent sends {type: "clarify_request", ...} to frontend via WS
4. Frontend renders question + option buttons
5. User clicks option or types answer
6. Frontend sends {type: "clarify_response", answer: "..."}
7. Agent resumes LLM execution with user's answer appended to conversation

Note: This tool must be called as the FIRST tool in a tool_calls batch,
otherwise previous tool results will be lost when execution pauses.
"""
import asyncio
import json
import time as _time
from typing import Dict, Any, List, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


# Global dict to store pending clarification futures per session
_pending_clarifications: Dict[str, asyncio.Future] = {}


def _get_pending_future(session_id: str) -> Optional[asyncio.Future]:
    """Get the pending clarification future for a session."""
    return _pending_clarifications.get(session_id)


def _set_pending_future(session_id: str, future: asyncio.Future):
    """Set the pending clarification future for a session."""
    _pending_clarifications[session_id] = future


def _clear_pending_future(session_id: str):
    """Clear the pending clarification future for a session."""
    _pending_clarifications.pop(session_id, None)


class ClarifyTool(BaseTool):
    """Interactive clarification tool that pauses LLM execution to ask user."""

    def __init__(self):
        super().__init__(
            name="clarify",
            description=(
                "向用户提出澄清问题，暂停执行等待用户回复后再继续。\n\n"
                "何时使用：\n"
                "- 任务信息不足、存在歧义或有多种可能时\n"
                "- 需要用户确认操作方向（如删除文件前确认）\n"
                "- 需要用户提供额外信息才能继续时\n\n"
                "参数：\n"
                "- question: 要向用户提出的问题（必填）\n"
                "- options: 可选选项列表，每个选项为一个字符串\n"
                "- context: 可选的补充上下文\n\n"
                "返回：格式化的问题文本 + __CLARIFY__ 标记\n\n"
                "注意：此工具会暂停 agent 执行，等待用户回复后才继续。"
                "应在 tool_calls 的第一个位置调用，否则之前的工具结果会丢失。"
            ),
            schema={
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "要向用户提出的澄清问题（必填）"
                    },
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "可选的选项列表，每个选项为一个字符串。如果有选项，前端将渲染为按钮。"
                    },
                    "context": {
                        "type": "string",
                        "description": "可选的补充上下文，说明为什么需要澄清此信息。"
                    }
                },
                "required": ["question"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY,
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        question: str = parameters.get("question", "").strip()
        options: Optional[List[str]] = parameters.get("options")
        context: Optional[str] = parameters.get("context")

        if not question:
            return ToolResult(
                success=False,
                error="Parameter 'question' is required and must be non-empty."
            )

        # Build formatted text
        parts: List[str] = []
        if context:
            parts.append(f"[{context}]")
        parts.append(question)
        if options:
            parts.append("")
            for i, opt in enumerate(options, 1):
                parts.append(f"  {i}. {opt}")

        formatted_text = "\n".join(parts)

        # Return with special __CLARIFY__ marker so agent loop knows to pause
        return ToolResult(
            success=True,
            data={
                "__CLARIFY__": True,
                "question": question,
                "options": options,
                "context": context,
                "formatted_text": formatted_text,
            },
        )
