"""
Send Message Tool - Send messages via WebSocket to the frontend.

When called during an active conversation, the message is pushed directly
to the frontend via the agent's ws_send callback, creating a separate
message bubble. This enables multi-turn replies like Hermes.
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class SendMessageTool(BaseTool):
    """Send messages to the frontend via WebSocket. Supports sending to the current session or a specified target."""

    def __init__(self):
        super().__init__(
            name="send_message",
            description="通过 WebSocket 向前端发送一条独立消息。消息会显示为 agent 的单独一条回复气泡。适用于需要分多条消息回复的场景（如先确认再执行、分步骤输出等）。参数：message（必填，消息内容），target（可选，默认为当前会话）。",
            schema={
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "要发送的消息内容"
                    },
                    "target": {
                        "type": "string",
                        "description": "消息发送目标（会话 ID），默认为当前会话",
                        "default": "current"
                    },
                },
                "required": ["message"]
            },
            toolsets=["core"],
            category=ToolCategory.COMMUNICATION
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        message = parameters.get("message", "")
        target = parameters.get("target", "current")

        if not message or not message.strip():
            return ToolResult(
                success=False,
                error="消息内容不能为空"
            )

        try:
            message_id = str(uuid.uuid4())
            timestamp = datetime.now().isoformat()

            # Try to push directly via agent's ws_send callback
            agent = self.agent if hasattr(self, 'agent') else None
            if agent and hasattr(agent, 'ws_send') and agent.ws_send:
                session_id = agent.ws_session_id or "default"
                payload = {
                    "type": "agent_message",
                    "session_id": session_id,
                    "data": {
                        "content": message,
                        "message_id": message_id,
                        "timestamp": timestamp,
                    }
                }
                try:
                    await agent.ws_send(payload)
                except Exception as ws_err:
                    # If ws_send fails, fall back to outbox
                    self.agent.logger.warning(f"ws_send 失败，回退到 outbox: {ws_err}")
                    agent = None

            # Fallback: write to outbox file (for non-WS contexts like CLI)
            if not agent or not hasattr(agent, 'ws_send') or not agent.ws_send:
                _project_root = Path(__file__).resolve().parent.parent.parent
                outbox_path = _project_root / "data" / "outbox.json"
                outbox_path.parent.mkdir(parents=True, exist_ok=True)

                outbox_entry = {
                    "message_id": message_id,
                    "message": message,
                    "target": target,
                    "timestamp": timestamp,
                    "status": "queued"
                }

                if outbox_path.exists():
                    with open(outbox_path, "r", encoding="utf-8") as f:
                        outbox = json.load(f)
                else:
                    outbox = {"messages": []}

                outbox["messages"].append(outbox_entry)

                with open(outbox_path, "w", encoding="utf-8") as f:
                    json.dump(outbox, f, ensure_ascii=False, indent=2)

            return ToolResult(
                success=True,
                data={
                    "message_id": message_id,
                    "target": target,
                    "delivered": bool(agent and hasattr(agent, 'ws_send') and agent.ws_send),
                },
                metadata={
                    "timestamp": timestamp,
                }
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"发送消息失败：{str(e)}"
            )
