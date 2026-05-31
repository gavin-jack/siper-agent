"""
Clarify Tool - Generate clarification questions for the LLM to use in conversation.

This is a 'meta tool' — it doesn't interact with the user directly.
Instead, it formats a clarification question (with optional multiple-choice
options) that the LLM can present in its next dialogue turn.
"""

from typing import Dict, Any, List, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class ClarifyTool(BaseTool):
    """Generate clarification questions to resolve ambiguous or incomplete task information.

    The LLM calls this tool when it needs more information from the user.
    The formatted_text output is meant to be embedded directly into the
    assistant's next reply — no actual I/O is performed.
    """

    def __init__(self):
        super().__init__(
            name="clarify",
            description=(
                "向用户提出澄清问题。当任务信息不足、存在歧义或有多种可能时，"
                "调用此工具生成格式化的问题文本供对话使用。"
                "可附带多个选项供用户选择，或直接提问。"
                "此工具不执行实际交互，仅返回格式化后的问题文本。"
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
                        "description": "可选的选项列表，每个选项为一个字符串。如果有选项，将格式化为编号列表。"
                    },
                    "context": {
                        "type": "string",
                        "description": "可选的补充上下文，说明为什么需要澄清此信息。"
                    }
                },
                "required": ["question"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
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

        # Build formatted text for the LLM to embed in its reply
        parts: List[str] = []

        if context:
            parts.append(f"[{context}]")

        parts.append(question)

        if options:
            parts.append("")
            for i, opt in enumerate(options, 1):
                parts.append(f"  {i}. {opt}")

        formatted_text = "\n".join(parts)

        return ToolResult(
            success=True,
            data={
                "question": question,
                "options": options,
                "context": context,
                "formatted_text": formatted_text
            }
        )
