"""
Web Fetch Tool - Fetch and extract content from a URL.
"""

import urllib.request
import urllib.parse
import re
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory
from ..tools.url_safety import is_safe_url


class WebFetchTool(BaseTool):
    """Fetch content from a URL and convert to readable text."""

    # Common browser User-Agent to avoid blocks
    DEFAULT_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )

    def __init__(self):
        super().__init__(
            name="web_fetch",
            description="Fetch content from a URL. Returns the page content as plain text. Use this to read web pages, documentation, etc.",
            schema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to fetch (http or https)"
                    },
                    "max_chars": {
                        "type": "integer",
                        "description": "Maximum characters to return (default: 5000, max: 50000)",
                        "default": 5000
                    }
                },
                "required": ["url"]
            },
            toolsets=["web", "core"],
            category=ToolCategory.WEB
        )

    def check_fn(self):
        """检查网络连通性。"""
        try:
            req = urllib.request.Request("https://www.baidu.com", method="HEAD")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status < 500
        except Exception:
            return False

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        url = parameters.get("url", "")
        max_chars = min(parameters.get("max_chars", 5000), 50000)

        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return ToolResult(success=False, error=f"无效的 URL 协议：{parsed.scheme}")

        # SSRF protection
        if not is_safe_url(url):
            return ToolResult(success=False, error=f"URL 被安全策略阻止：{url}（内网/私有地址不可访问）")

        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": self.DEFAULT_UA,
                    "Accept": "text/html, text/plain, application/json, */*",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                }
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                content_type = resp.headers.get("Content-Type", "")
                raw = resp.read()

            encoding = "utf-8"
            if "charset=" in content_type:
                encoding = content_type.split("charset=")[-1].strip().split(";")[0]

            try:
                text = raw.decode(encoding)
            except (UnicodeDecodeError, LookupError):
                text = raw.decode("utf-8", errors="replace")

            # Basic HTML to text
            if "text/html" in content_type or text.strip().startswith("<"):
                text = self._html_to_text(text)

            truncated = len(text) > max_chars
            if truncated:
                text = text[:max_chars] + f"\n... [已截断，共 {len(text)} 字符]"

            return ToolResult(
                success=True,
                data=text,
                metadata={
                    "url": url,
                    "content_type": content_type,
                    "chars": len(text),
                    "truncated": truncated
                }
            )
        except Exception as e:
            return ToolResult(success=False, error=f"抓取出错：{str(e)}")

    @staticmethod
    def _html_to_text(html: str) -> str:
        """Basic HTML to text conversion without external deps."""
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</div>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</h[1-6]>", "\n\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<li>", "  • ", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        text = text.replace("&nbsp;", " ")
        text = text.replace("&amp;", "&")
        text = text.replace("&lt;", "<")
        text = text.replace("&gt;", ">")
        text = text.replace("&quot;", '"')
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
