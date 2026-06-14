---
name: web-search
description: Search the web for information using multiple search engines (SearXNG, DuckDuckGo)
version: "1.0.0"
author: SiPer
triggers:
  keywords: ["搜索", "查找", "search", "look up", "find", "查询", "google", "百度", "上网", "搜一下", "search for", "web search", "internet"]
  patterns:
    - "搜索.*"
    - "查找.*"
    - "search for.*"
    - "look up.*"
    - "查一下.*"
    - "帮我搜.*"
    - "网上搜.*"
  semantic: "用户需要从互联网获取信息、查找资料、验证事实、查询新闻或技术文档"
capabilities: [web_search, information_retrieval, content_extraction]
when_to_use: "当用户需要从互联网获取最新信息、查找资料、验证事实、查询新闻/技术文档/产品价格，或从网页URL提取内容时使用"
requires:
  tools: ["web_search", "web_fetch"]
metadata:
  siper:
    priority: 10
    token_budget: 500
---

# Web Search Skill

## 何时使用
当用户需要从互联网获取信息时使用此技能。包括：
- 搜索最新新闻、技术文章
- 查找特定问题的答案
- 验证事实或数据
- 从网页提取内容

## 执行步骤
1. **分析查询意图**：理解用户要找什么
2. **选择搜索方式**：
   - 简单查询 → web_search
   - 指定URL → web_fetch
3. **执行搜索**：调用对应工具
4. **整理结果**：按相关性排序，提取关键信息

## 搜索策略
- 优先使用 SearXNG 本地实例（如果可用）
- 多个结果时按相关性排序
- 返回结果包含标题、URL、摘要

## 注意事项
- 搜索结果可能不完整，需要多源验证
- 对于技术问题，优先查找官方文档
- 搜索关键词要精确，避免过于宽泛
