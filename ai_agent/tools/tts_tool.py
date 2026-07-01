"""
TTS Tool - Text to Speech conversion using edge-tts.
"""

import asyncio
import os
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class TtsTool(BaseTool):
    """Convert text to speech audio files using Microsoft Edge TTS."""

    def __init__(self):
        super().__init__(
            name="text_to_speech",
            description="文字转语音。将文本转换为语音文件（mp3/wav）。支持中英文等多种语言。",
            schema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "要转换为语音的文本内容。"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "输出音频文件路径（可选）。默认为项目目录下的 uploads/audio/tts_{timestamp}.mp3"
                    },
                    "voice": {
                        "type": "string",
                        "description": "语音名称（可选）。例如：zh-CN-XiaoxiaoNeural（中文女声）、zh-CN-YunxiNeural（中文男声）、en-US-JennyNeural（英文女声）等。默认为 zh-CN-XiaoxiaoNeural。"
                    }
                },
                "required": ["text"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        text = parameters.get("text", "")
        output_path = parameters.get("output_path", "")
        voice = parameters.get("voice", "zh-CN-XiaoxiaoNeural")

        if not text.strip():
            return ToolResult(
                success=False,
                error="文本内容为空，无法转换语音。"
            )

        # Check if edge-tts is available
        try:
            import edge_tts
        except ImportError:
            return ToolResult(
                success=False,
                error="edge-tts 未安装。请运行：pip install edge-tts"
            )

        # Determine output path
        if not output_path:
            ts = int(asyncio.get_event_loop().time())
            _proj = Path(__file__).resolve().parent.parent.parent
            audio_dir = _proj / "uploads" / "audio"
            audio_dir.mkdir(parents=True, exist_ok=True)
            output_path = str(audio_dir / f"tts_{ts}.mp3")
        else:
            output_path = str(Path(output_path).expanduser())
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        try:
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(output_path)

            file_size = os.path.getsize(output_path)

            return ToolResult(
                success=True,
                data={
                    "audio_path": output_path,
                    "text_length": len(text),
                    "voice": voice,
                    "file_size": file_size,
                    "has_audio": True,
                }
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"语音生成失败：{str(e)}"
            )
