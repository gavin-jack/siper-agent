# Web 搜索工具 Fallback 链架构（v0.9.68+）

## 工具位置
`ai_agent/tools/web_search_tool.py`

## 搜索优先级链

```
Priority 1: SearXNG (localhost:8888) — 本地实例，最快
Priority 2: Bing China (cn.bing.com) — 国内可达，稳定
Priority 3: DuckDuckGo — 被墙，基本不可用
```

## 各 Provider 状态

### SearXNG (localhost:8888)
- **状态**: 服务可能因底层 SQLite 只读数据库问题而崩溃（uWSGI exit code 22）
- **引擎超时问题**: 即使 SearXNG 服务在运行，如果启用了大量国外引擎（Google、DuckDuckGo 等），所有引擎超时后 SearXNG 才返回结果，导致搜索返回 0 条。解决方案：禁用国外引擎（需 sudo 修改 settings.yml）
- **诊断**: `ss -tlnp | grep 8888` 检查端口；`systemctl status searxng-uwsgi` 查看服务状态；`curl -s "http://127.0.0.1:8888/search?q=test&format=json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d.get(\"results\",[]))} results, {len(d.get(\"unresponsive_engines\",[]))} unresponsive")'` 验证搜索
- **关键修复**: `_searxng_search` 必须用 try/except 包裹，失败时返回 `[]` 而非抛异常
  ```python
  async def _searxng_search(self, query, count):
      try:
          # ... existing code ...
          return results
      except Exception:
          return []
  ```
- **不深入修复**: SQLite 只读数据库问题复杂，Bing fallback 已满足需求
- **详细诊断**: 见 `references/searxng-whitenoise-crash.md`（static_path 为空 + lazy-apps 导致 whitenoise 扫描整个包目录）

### Bing China (cn.bing.com)
- **状态**: ✅ 国内稳定可达
- **替换原因**: 百度搜索被反爬拦截（返回"百度安全验证"页面），无法稳定使用
- **解析方式**: `<h2><a href="url">title</a></h2>` 模式匹配
- **测试**: `curl -s "https://cn.bing.com/search?q=Python教程" | grep -oP '<h2><a href="[^"]*"' | head -10`

### DuckDuckGo
- **状态**: ❌ 国内被墙，`Network is unreachable`
- **保留原因**: 代码中保留作为最后 fallback，海外环境可用

### 百度（已弃用）
- **状态**: ❌ 被反爬拦截
- **症状**: urllib 请求返回"百度安全验证"页面（HTML，非搜索结果）
- **诊断**: `curl -s "https://www.baidu.com/s?wd=test" | head -50` 查看是否返回验证页

## execute() 方法结构

```python
async def execute(self, params):
    query = params.get("query", "")
    count = params.get("count", 5)
    
    # Priority 1: SearXNG (with try/except)
    results = await self._searxng_search(query, count)
    if results:
        return success_response(results, source="searxng")
    
    # Priority 2: Bing China
    results = await self._bing_search(query, count)
    if results:
        return success_response(results, source="bing")
    
    # Priority 3: DuckDuckGo (likely blocked)
    results = await self._ddg_search(query, count)
    if results:
        return success_response(results, source="duckduckgo")
    
    return error_response("所有搜索源均不可用")
```

## check_fn 自检逻辑
- 依次检查 SearXNG → Bing → DDG 的可用性
- 返回第一个可用的 source 名称

## 修改历史
| 版本 | 变更 |
|---|---|
| v0.9.68 | 添加 SearXNG try/except；Bing 替换百度；更新所有 "Baidu/baidu" → "Bing/bing" |
| v0.9.69 | 补充：SearXNG 引擎超时问题说明、Flask test client 验证命令 |
