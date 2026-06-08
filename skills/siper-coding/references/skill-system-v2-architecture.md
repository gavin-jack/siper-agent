# SiPer Skill 系统 v2 架构

## 概述

SiPer Skill 系统 v2 实现了**两轮筛选 + 本地预筛选 + 反馈优化**的 skill 管理机制，相比 v1（全量索引注入）显著减少 token 占用。

## 架构图

```
用户输入
  → 【第一层】SkillRegistry（启动时扫描，缓存）
      → 扫描 skills/<name>/SKILL.md（新格式）
      → 扫描 skills/*.py（旧格式，兼容）
      → 门控过滤（平台/工具/disabled）
      → 构建 SkillRegistry（name/description/triggers/capabilities）
  → 【第二层】SkillPreFilter（每次用户输入时执行）
      → 分词提取关键词
      → 倒排索引查找候选 skill
      → 多维度打分（关键词40% + 模式30% + 使用频率20% + 优先级10%）
      → 选出 Top-K 相关 skill
      → 注入 system prompt
  → 【第三层】LLM 精准选择
      → LLM 看到 skill 索引
      → 调用 skill_view(name) 加载完整 SKILL.md
      → 执行 skill 指令
  → 【反馈环】SkillFeedback
      → 记录触发/选中/成功/失败
      → 更新 skill_stats.json
      → 下次预筛选更精准
```

## 核心文件

| 文件 | 说明 |
|------|------|
| `ai_agent/skills/skill_registry.py` | Skill 注册中心：扫描、解析、门控过滤、缓存 |
| `ai_agent/skills/skill_pre_filter.py` | 本地预筛选器：关键词倒排索引 + 打分排序 |
| `ai_agent/skills/skill_feedback.py` | 反馈系统：使用统计、有效性评分 |
| `ai_agent/skills/skill_md_parser.py` | SKILL.md 解析器：YAML frontmatter 解析 |
| `ai_agent/skills/__init__.py` | 模块入口，导出新类 |
| `agents/default/skill_config.json` | Skill 系统配置 |

## SKILL.md 格式

```markdown
---
name: web-search
description: Search the web for information
version: "1.0.0"
triggers:
  keywords: ["搜索", "查找", "search", "look up"]
  patterns: ["搜索.*", "查找.*"]
  semantic: "用户需要从互联网获取信息"
capabilities: [web_search, information_retrieval]
requires:
  tools: [web_search_tool]
metadata:
  siper:
    priority: 10
    token_budget: 500
---

# Web Search Skill

## 何时使用
...

## 执行步骤
1. ...
2. ...
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/skills` | GET | 列出所有 skill（含来源、能力、统计） |
| `/api/skills/preview` | POST | 预筛选调试：输入文本返回匹配的 skill |
| `/api/skills/stats` | GET | 使用统计报告 |

## 关键陷阱

1. **路径排除必须用相对路径**：`md_path.parent.relative_to(self.skills_dir).parts`，不能用 `md_path.parent.parts`（绝对路径包含 `.siper`）
2. **同名 skill MD 优先**：SKILL.md 格式覆盖同名的 .py 格式
3. **冷启动**：没有反馈数据时，使用频率分默认为 0.5
4. **保底策略**：匹配数 < 3 时补充全局高频 skill

## 配置

```json
{
  "version": 1,
  "pre_filter": {
    "enabled": true,
    "top_k": 10,
    "min_score": 0.1,
    "fallback_threshold": 3
  },
  "injection": {
    "format": "text",
    "include_capabilities": true,
    "max_skill_index_tokens": 1000
  },
  "feedback": {
    "enabled": true,
    "stats_file": "skill_stats.json"
  }
}
```

## 与 agent.py 的集成点

1. `__init__`：初始化 SkillRegistry、SkillPreFilter、SkillFeedback
2. `initialize()`：调用 `skill_registry.scan()` 和 `skill_pre_filter.build_index()`
3. `_build_context()`：调用 `skill_pre_filter.pre_filter(user_input)`
4. `_get_system_prompt()`：从 registry 读取 skill 信息注入 prompt
5. `_load_default_skills()`：加载 MD 格式 skill 到 active_skills
6. `skill_view(name)`：新增方法，LLM 调用时加载完整 SKILL.md
