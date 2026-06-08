"""
Vision Analysis Tool - Analyze image content via multimodal LLM.
"""

import base64
from pathlib import Path
from typing import Dict, Any
from urllib.parse import urlparse
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}


class VisionTool(BaseTool):
    """Analyze image content using vision-capable models."""

    def __init__(self):
        super().__init__(
            name="vision_analyze",
            description="Analyze image content. Accepts a URL or local file path and returns a description of the image. Supports common formats: png, jpg, gif, webp.",
            schema={
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": "Image URL or local file path to analyze"
                    },
                    "question": {
                        "type": "string",
                        "description": "Question to ask about the image (default: describe this image)",
                        "default": "Describe this image"
                    }
                },
                "required": ["image_url"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        image_url = parameters.get("image_url", "")
        question = parameters.get("question", "Describe this image")

        if not image_url:
            return ToolResult(
                success=False,
                error="Missing required parameter: image_url"
            )

        # Check if it's a URL or local path
        parsed = urlparse(image_url)
        is_url = parsed.scheme in ("http", "https")

        if is_url:
            # For URLs, return info indicating multimodal support needed
            return ToolResult(
                success=True,
                data={
                    "info": "视觉分析需要多模态模型支持",
                    "image_path": image_url,
                    "question": question,
                    "type": "url"
                },
                metadata={"source": "url"}
            )

        # Local file path
        try:
            path = Path(image_url).expanduser().resolve()
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Invalid path: {image_url} ({e})"
            )

        if not path.exists():
            return ToolResult(
                success=False,
                error=f"Image not found: {image_url}"
            )

        if not path.is_file():
            return ToolResult(
                success=False,
                error=f"Not a file: {image_url}"
            )

        # Check extension
        ext = path.suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            return ToolResult(
                success=False,
                error=f"Unsupported image format: {ext}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            )

        # Get file size
        file_size = path.stat().st_size

        # Read and encode image as base64
        try:
            with open(path, "rb") as f:
                image_bytes = f.read()
            image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Failed to read image: {e}"
            )

        # Return info indicating multimodal model is needed
        # The actual LLM vision call would be handled by the agent layer
        return ToolResult(
            success=True,
            data={
                "info": "视觉分析需要多模态模型",
                "image_path": str(path),
                "size": file_size,
                "format": ext,
                "question": question,
                "base64_length": len(image_b64)
            },
            metadata={
                "source": "local",
                "format": ext,
                "size_bytes": file_size
            }
        )
