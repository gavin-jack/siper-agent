"""
Web Search Tool - Real web search using stdlib urllib.
Priority: SearXNG (local) > Bing China (fallback) > DuckDuckGo (global fallback).
"""

import json
import urllib.request
import urllib.parse
import re as _re
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory
from ..tools.url_safety import is_safe_url


class WebSearchTool(BaseTool):
    """Search the web using SearXNG (local), Bing China, or DuckDuckGo (global)."""

    def __init__(self):
        super().__init__(
            name="web_search",
            description="Search the web for information. Returns titles, URLs, and snippets. Tries local SearXNG first, then Bing China, then DuckDuckGo.",
            schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query string"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 5, max: 10)",
                        "default": 5
                    }
                },
                "required": ["query"]
            },
            toolsets=["web", "search", "core"],
            category=ToolCategory.WEB
        )

    def check_fn(self):
        """检查 SearXNG 或 Bing 是否可达。"""
        try:
            req = urllib.request.Request("http://127.0.0.1:8888/search?q=test&format=json", method="HEAD")
            with urllib.request.urlopen(req, timeout=3) as resp:
                return resp.status == 200
        except Exception:
            pass
        # Bing China fallback check
        try:
            req = urllib.request.Request("https://cn.bing.com/search?q=test", method="HEAD",
                                         headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            pass
        # DuckDuckGo fallback check
        try:
            req = urllib.request.Request("https://html.duckduckgo.com/html/?q=test", method="HEAD")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            return False

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        query = parameters.get("query", "")
        limit = min(parameters.get("limit", 5), 10)

        try:
            # Priority 1: SearXNG (local, fast, reliable)
            sx_results = self._searxng_search(query, limit)
            if sx_results:
                return ToolResult(
                    success=True,
                    data=sx_results,
                    metadata={"query": query, "source": "searxng", "count": len(sx_results)}
                )

            # Priority 2: Bing China (works in China without proxy)
            bing_results = self._bing_search(query, limit)
            if bing_results:
                return ToolResult(
                    success=True,
                    data=bing_results,
                    metadata={"query": query, "source": "bing", "count": len(bing_results)}
                )

            # Priority 3: DuckDuckGo (global fallback, may be blocked in China)
            ddg_results = self._duckduckgo_search(query, limit)
            if ddg_results:
                return ToolResult(
                    success=True,
                    data=ddg_results,
                    metadata={"query": query, "source": "duckduckgo", "count": len(ddg_results)}
                )

            return ToolResult(
                success=True,
                data=f"没有找到关于 \"{query}\" 的搜索结果",
                metadata={"query": query, "count": 0}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"搜索出错：{str(e)}"
            )

    @staticmethod
    def _searxng_search(query: str, limit: int) -> list:
        """Search via local SearXNG instance (priority). Uses POST for JSON API."""
        try:
            url = "http://127.0.0.1:8888/search"
            post_data = urllib.parse.urlencode({
                "q": query,
                "format": "json",
                "language": "zh-CN",
            }).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=post_data,
                headers={
                    "User-Agent": "Siper-Agent/1.0",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            results = []
            for r in data.get("results", [])[:limit]:
                result_url = r.get("url", "")
                # SSRF: skip unsafe URLs in search results
                if result_url and not is_safe_url(result_url):
                    continue
                results.append({
                    "title": r.get("title", ""),
                    "url": result_url,
                    "snippet": r.get("content", "")
                })
            return results
        except Exception:
            return []

    @staticmethod
    def _duckduckgo_search(query: str, limit: int) -> list:
        """Search via DuckDuckGo instant answer API (fallback)."""
        url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1"
        req = urllib.request.Request(url, headers={"User-Agent": "Siper-Agent/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = resp.read().decode("utf-8")
        except Exception:
            return []
        # DuckDuckGo may return HTML (proxy/firewall); skip if not JSON
        if raw.strip().startswith("<"):
            return []
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return []

        results = []

        # Abstract
        if data.get("AbstractText"):
            abs_url = data.get("AbstractURL", "")
            if abs_url and not is_safe_url(abs_url):
                pass  # Skip unsafe abstract URL
            else:
                results.append({
                    "title": data.get("Heading", query),
                    "url": abs_url,
                    "snippet": data["AbstractText"]
                })

        # Related topics
        for topic in data.get("RelatedTopics", [])[:limit]:
            if isinstance(topic, dict) and topic.get("Text"):
                topic_url = topic.get("FirstURL", "")
                if topic_url and not is_safe_url(topic_url):
                    continue
                results.append({
                    "title": topic.get("Text", "")[:80],
                    "url": topic_url,
                    "snippet": topic.get("Text", "")
                })
            elif isinstance(topic, dict) and "Topics" in topic:
                for sub in topic["Topics"][:3]:
                    if sub.get("Text"):
                        sub_url = sub.get("FirstURL", "")
                        if sub_url and not is_safe_url(sub_url):
                            continue
                        results.append({
                            "title": sub.get("Text", "")[:80],
                            "url": sub_url,
                            "snippet": sub.get("Text", "")
                        })

        return results[:limit]

    @staticmethod
    def _bing_search(query: str, limit: int) -> list:
        """Search via Bing China (works in China without proxy). Parses HTML for results."""
        url = f"https://cn.bing.com/search?q={urllib.parse.quote(query)}&count={limit + 2}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="replace")
        except Exception:
            return []

        results = []
        # Bing result pattern: <h2><a href="url">title</a></h2>
        title_re = _re.compile(
            r'<h2[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?</h2>',
            _re.DOTALL,
        )
        # Snippet: <p class="b_algoSlug"> or <div class="b_caption"><p>
        snippet_re = _re.compile(
            r'(?:class="b_algoSlug"|class="b_caption"[^>]*><p[^>]*>)(.*?)(?:</p>|</div>)',
            _re.DOTALL,
        )

        for m in title_re.finditer(html):
            result_url = m.group(1)
            if result_url and not is_safe_url(result_url):
                continue
            title = _re.sub(r'<[^>]+>', '', m.group(2)).strip()
            if not title:
                continue
            results.append({
                "title": title,
                "url": result_url,
                "snippet": "",
            })
            if len(results) >= limit:
                break

        return results[:limit]
