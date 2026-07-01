"""
Web Search Tool - Real web search using stdlib urllib.
Priority: SearXNG (local) > Bing China (fallback) > DuckDuckGo (global fallback).
"""

import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
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
            description=(
                "Search the web for current information, news, documentation, or facts.\n\n"
                "When to use:\n"
                "- Looking up current events, recent news, or real-time information\n"
                "- Finding documentation, tutorials, or technical references\n"
                "- Verifying facts or getting data not in training knowledge\n"
                "- Researching products, companies, or topics\n\n"
                "Search backends (auto-selected):\n"
                "1. SearXNG (local, fastest, supports Chinese)\n"
                "2. Bing China (works without proxy in China)\n"
                "3. DuckDuckGo (global fallback)\n\n"
                "Parameters:\n"
                "- query: search query, be specific and concise (required)\n"
                "- limit: max results (default: 5, max: 10)\n"
                "- language: language code, e.g. 'zh-CN', 'en' (default: auto)\n"
                "- time_range: 'day', 'week', 'month', 'year' (default: no filter)\n\n"
                "Returns: list of {title, url, snippet, source}\n\n"
                "Tips:\n"
                "- Use specific keywords for better results\n"
                "- Add 'site:domain.com' to search within a site\n"
                "- Use quotes for exact phrase match"
            ),
            schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query. Be specific. Use quotes for exact phrases, site:domain to search within a site."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 5, max: 10)",
                        "default": 5
                    },
                    "language": {
                        "type": "string",
                        "description": "Language code for search results, e.g. 'zh-CN', 'en', 'ja'. Default: auto-detect.",
                        "default": ""
                    },
                    "time_range": {
                        "type": "string",
                        "description": "Filter by time: 'day', 'week', 'month', 'year'. Default: no time filter.",
                        "default": ""
                    }
                },
                "required": ["query"]
            },
            toolsets=["web", "search", "core"],
            category=ToolCategory.WEB
        )

    def check_fn(self):
        """检查外部搜索引擎是否可达（并发 GET 探测，2s 超时）。
        不检测本地 SearXNG（冷启动延迟 3s+，拖慢工具加载）。"""
        _ENDPOINTS = [
            ("https://cn.bing.com/search?q=test", {"User-Agent": "Mozilla/5.0"}),
            ("https://html.duckduckgo.com/html/?q=test", None),
        ]
        def _probe(url, headers):
            try:
                req = urllib.request.Request(url, headers=headers or {})
                with urllib.request.urlopen(req, timeout=2) as resp:
                    return resp.status == 200
            except Exception:
                return False

        pool = ThreadPoolExecutor(max_workers=2)
        futures = [pool.submit(_probe, url, hdrs) for url, hdrs in _ENDPOINTS]
        try:
            for fut in as_completed(futures, timeout=3):
                try:
                    if fut.result():
                        return True
                except Exception:
                    pass
        finally:
            pool.shutdown(wait=False)
        return False

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        query = parameters.get("query", "")
        limit = min(parameters.get("limit", 5), 10)
        language = parameters.get("language", "")
        time_range = parameters.get("time_range", "")

        try:
            # Priority 1: SearXNG (local, fast, reliable)
            sx_results = self._searxng_search(query, limit, language, time_range)
            if sx_results:
                return ToolResult(
                    success=True,
                    data=sx_results,
                    metadata={"query": query, "source": "searxng", "count": len(sx_results)}
                )

            # Priority 2: Bing China (works in China without proxy)
            bing_results = self._bing_search(query, limit, language, time_range)
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
    def _searxng_search(query: str, limit: int, language: str = "", time_range: str = "") -> list:
        """Search via local SearXNG instance (priority). Uses POST for JSON API."""
        try:
            url = "http://127.0.0.1:8888/search"
            params = {
                "q": query,
                "format": "json",
                "language": language or "zh-CN",
            }
            # SearXNG time filter: 'day', 'week', 'month', 'year'
            if time_range in ('day', 'week', 'month', 'year'):
                params["time_range"] = time_range
            post_data = urllib.parse.urlencode(params).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=post_data,
                headers={
                    "User-Agent": "Siper-Agent/1.0",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            results = []
            for r in data.get("results", [])[:limit]:
                result_url = r.get("url", "")
                if result_url and not is_safe_url(result_url):
                    continue
                results.append({
                    "title": r.get("title", ""),
                    "url": result_url,
                    "snippet": r.get("content", ""),
                    "source": "searxng"
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
                    "snippet": data["AbstractText"],
                    "source": "duckduckgo"
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
                    "snippet": topic.get("Text", ""),
                    "source": "duckduckgo"
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
                            "snippet": sub.get("Text", ""),
                            "source": "duckduckgo"
                        })

        return results[:limit]

    @staticmethod
    def _bing_search(query: str, limit: int, language: str = "", time_range: str = "") -> list:
        """Search via Bing China (works in China without proxy). Parses HTML for results."""
        # Bing time filter mapping
        time_params = {'day': '1', 'week': '2', 'month': '3', 'year': '4'}
        time_param = time_params.get(time_range, '')
        lang_param = language or 'zh-CN'
        url = f"https://cn.bing.com/search?q={urllib.parse.quote(query)}&count={limit + 2}"
        if time_param:
            url += f"&filters=ex1%3a%22ez5_{time_param}%22"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": lang_param,
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
                "source": "bing"
            })
            if len(results) >= limit:
                break

        return results[:limit]
