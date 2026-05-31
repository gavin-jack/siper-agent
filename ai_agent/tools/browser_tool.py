"""
Browser Tool - Browser automation tool using urllib for basic page fetching.
Supports navigate and snapshot via urllib; other actions require playwright.
"""

import re
import urllib.request
import urllib.error
from typing import Dict, Any
from html.parser import HTMLParser
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class _HTMLTextExtractor(HTMLParser):
    """Extract visible text from HTML, ignoring script/style tags."""

    def __init__(self):
        super().__init__()
        self._result = []
        self._skip_tags = {"script", "style", "head", "meta", "link"}
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self._skip_tags:
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in self._skip_tags and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth == 0:
            text = data.strip()
            if text:
                self._result.append(text)

    def get_text(self) -> str:
        return "\n".join(self._result)


def _extract_title(html: str) -> str:
    """Extract the <title> from HTML."""
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _fetch_url(url: str, timeout: int = 15) -> Dict[str, Any]:
    """Fetch a URL and return title + body text."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; SiPerBot/1.0)"
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content_type = resp.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in content_type:
            charset = content_type.split("charset=")[-1].strip().split(";")[0]
        raw = resp.read()
        try:
            html = raw.decode(charset, errors="replace")
        except (LookupError, ValueError):
            html = raw.decode("utf-8", errors="replace")

    title = _extract_title(html)
    extractor = _HTMLTextExtractor()
    extractor.feed(html)
    body_text = extractor.get_text()

    return {
        "url": resp.url,
        "title": title,
        "body_text": body_text,
    }


class BrowserTool(BaseTool):
    """Browser automation tool.

    This is a SINGLE tool with multiple actions. Call it with the appropriate action parameter.

    Available actions:
    - navigate: Open a URL (requires `url` parameter)
    - snapshot: Get page content preview (requires `url` parameter)
    - click: Click an element (requires `ref` parameter - needs playwright)
    - type: Type text into an input (requires `ref` and `text` parameters - needs playwright)
    - scroll: Scroll page (requires `direction` parameter - needs playwright)
    - back: Go back in browser history (needs playwright)
    - press: Press a key (requires `key` parameter - needs playwright)

    Note: Only `navigate` and `snapshot` work with urllib. Other actions require playwright installed.
    """

    def __init__(self):
        super().__init__(
            name="browser_navigate",
            description=(
                "浏览器自动化工具（单一工具，通过 action 参数选择操作类型）。\n"
                "可用操作：\n"
                "- navigate: 打开URL，需 url 参数\n"
                "- snapshot: 获取页面内容预览，需 url 参数\n"
                "- click: 点击元素，需 ref 参数（需要 playwright）\n"
                "- type: 输入文本，需 ref 和 text 参数（需要 playwright）\n"
                "- scroll: 滚动页面，需 direction 参数（需要 playwright）\n"
                "- back: 后退（需要 playwright）\n"
                "- press: 按键，需 key 参数（需要 playwright）\n"
                "注意：只有 navigate 和 snapshot 可用 urllib 实现，其他操作需要 playwright。"
            ),
            schema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "操作类型",
                        "enum": [
                            "navigate",
                            "snapshot",
                            "click",
                            "type",
                            "scroll",
                            "back",
                            "press",
                        ],
                    },
                    "url": {
                        "type": "string",
                        "description": "目标 URL（navigate 时必填）",
                    },
                    "ref": {
                        "type": "string",
                        "description": "元素引用标识符（click / type 时使用）",
                    },
                    "text": {
                        "type": "string",
                        "description": "要输入的文本（type 时使用）",
                    },
                    "direction": {
                        "type": "string",
                        "description": "滚动方向（scroll 时使用）",
                        "enum": ["up", "down"],
                    },
                    "key": {
                        "type": "string",
                        "description": "按键名称（press 时使用，如 Enter、Tab、Escape）",
                    },
                },
                "required": ["action"],
            },
            toolsets=["browser"],
            category=ToolCategory.WEB,
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        action = parameters.get("action", "")

        playwright_only_actions = {"click", "type", "scroll", "back", "press"}
        if action in playwright_only_actions:
            return ToolResult(
                success=False,
                error=f"操作 '{action}' 需要 playwright 支持，请安装 playwright（pip install playwright && playwright install）",
            )

        if action == "navigate":
            url = parameters.get("url", "")
            if not url:
                return ToolResult(
                    success=False,
                    error="navigate 操作需要提供 url 参数",
                )
            try:
                result = _fetch_url(url)
                return ToolResult(
                    success=True,
                    data=result,
                    metadata={"action": "navigate", "url": url},
                )
            except urllib.error.URLError as e:
                return ToolResult(
                    success=False,
                    error=f"导航失败：{e.reason}",
                )
            except Exception as e:
                return ToolResult(
                    success=False,
                    error=f"导航失败：{str(e)}",
                )

        if action == "snapshot":
            url = parameters.get("url", "")
            if not url:
                return ToolResult(
                    success=False,
                    error="snapshot 操作需要提供 url 参数",
                )
            try:
                result = _fetch_url(url)
                # Build a concise summary
                body_preview = result["body_text"][:2000]
                summary = (
                    f"URL: {result['url']}\n"
                    f"Title: {result['title']}\n"
                    f"Body Preview:\n{body_preview}"
                )
                if len(result["body_text"]) > 2000:
                    summary += f"\n... (truncated, total {len(result['body_text'])} chars)"
                return ToolResult(
                    success=True,
                    data=summary,
                    metadata={"action": "snapshot", "url": url, "title": result["title"]},
                )
            except urllib.error.URLError as e:
                return ToolResult(
                    success=False,
                    error=f"快照失败：{e.reason}",
                )
            except Exception as e:
                return ToolResult(
                    success=False,
                    error=f"快照失败：{str(e)}",
                )

        return ToolResult(
            success=False,
            error=f"不支持的操作：{action}",
        )
