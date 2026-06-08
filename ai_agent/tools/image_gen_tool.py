"""
Image Generation Tool - Generate images from text descriptions via external API.
"""

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class ImageGenTool(BaseTool):
    """Generate images from text descriptions using an external image generation API."""

    def __init__(self):
        super().__init__(
            name="image_generate",
            description="根据文字描述生成图片。通过调用外部图片生成 API（如 DALL-E、Stable Diffusion）。需要配置 IMAGE_GEN_API_KEY 环境变量。",
            schema={
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "图片描述文字，描述你想要生成的图片内容"
                    },
                    "size": {
                        "type": "string",
                        "description": "生成图片的尺寸，如 '1024x1024'、'1792x1024'、'1024x1792'",
                        "default": "1024x1024"
                    },
                    "style": {
                        "type": "string",
                        "description": "图片风格，如 'natural'（自然）、'vivid'（戏剧化/超现实）",
                        "default": "natural"
                    }
                },
                "required": ["prompt"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        prompt = parameters.get("prompt", "").strip()
        size = parameters.get("size", "1024x1024")
        style = parameters.get("style", "natural")

        if not prompt:
            return ToolResult(
                success=False,
                error="参数 'prompt' 不能为空，请提供图片描述文字。"
            )

        api_key = os.environ.get("IMAGE_GEN_API_KEY")

        if not api_key:
            return ToolResult(
                success=False,
                error=(
                    "未配置图片生成 API。请设置环境变量 IMAGE_GEN_API_KEY 以启用图片生成功能。\n"
                    "示例：export IMAGE_GEN_API_KEY='your-api-key-here'\n"
                    "支持的 API：DALL-E、Stable Diffusion 等兼容接口。"
                )
            )

        # Prepare output directory
        _project_root = Path(__file__).resolve().parent.parent.parent
        output_dir = _project_root / "uploads" / "images"
        output_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Attempt to call OpenAI DALL-E API
            image_url, local_path = await self._call_image_api(
                api_key=api_key,
                prompt=prompt,
                size=size,
                style=style,
                output_dir=output_dir
            )

            return ToolResult(
                success=True,
                data={
                    "image_url": image_url,
                    "local_path": str(local_path)
                },
                metadata={
                    "prompt": prompt,
                    "size": size,
                    "style": style,
                    "generated_at": datetime.now().isoformat()
                }
            )
        except ImportError:
            return ToolResult(
                success=False,
                error=(
                    "缺少 HTTP 请求依赖。请安装 httpx 或 aiohttp：\n"
                    "pip install httpx"
                )
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"图片生成失败：{str(e)}"
            )

    async def _call_image_api(
        self,
        api_key: str,
        prompt: str,
        size: str,
        style: str,
        output_dir: Path
    ) -> tuple:
        """
        Call the image generation API and save the result.
        Returns (image_url, local_path).
        """
        try:
            import httpx
        except ImportError:
            raise ImportError("httpx is required for image generation")

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "dall-e-3",
                    "prompt": prompt,
                    "n": 1,
                    "size": size,
                    "style": style
                }
            )

            if response.status_code != 200:
                raise Exception(
                    f"API 请求失败 (HTTP {response.status_code})：{response.text}"
                )

            data = response.json()
            image_url = data["data"][0]["url"]

            # Download the image
            img_response = await client.get(image_url)
            img_response.raise_for_status()

            # Generate a unique filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"img_{timestamp}_{uuid.uuid4().hex[:8]}.png"
            local_path = output_dir / filename

            with open(local_path, "wb") as f:
                f.write(img_response.content)

            return image_url, local_path
