# System Prompt 架构与优化（v0.9.84+）

## 完整数据流

```
┌─────────────────────────────────────────────────────────┐
│                    System Message                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐    ┌──────────────┐                    │
│  │  soul.md     │ OR │  agent.md    │  ← base prompt    │
│  │  (优先级1)   │    │  (优先级2)   │                    │
│  └─────────────┘    └──────────────┘                    │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────────────────────┐                   │
│  │  Skills 注入（v0.9.83+）         │                   │
│  │  ## 已激活技能                   │                   │
│  │  - **skill_name**: description   │                   │
│  │    (能力: caps)                  │                   │
│  │    → 何时使用: when_to_use       │                   │
│  └─────────────────────────────────┘                   │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────────────────────┐                   │
│  │  Memory 注入（相关性排序）        │                   │
│  │  ## 历史记忆                     │                   │
│  │  (按关键词匹配度重排)             │                   │
│  └─────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              对话历史（智能截断）                          │
│  根据 context_window + max_tokens 动态计算保留轮次        │
│  二分搜索最优值，至少保留 1 轮（2条消息）                  │
│  截断时插入 [... 早期对话已截断 ...] 标记                 │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  User Message + Tools Payload             │
└─────────────────────────────────────────────────────────┘
```

## soul.md 与 agent.md 职责划分

| 文件 | 职责 | 内容 |
|------|------|------|
| **soul.md** | Agent 人格 + 行为准则 + 系统配置 | 身份、响应优先级、工具调用铁律、输出风格、开发规则、工具使用规则 |
| **agent.md** | 纯行为规则（精简） | 系统提示、技能列表、安全规则、回复格式 |

**原则**：soul.md 是主配置，agent.md 是补充。避免重复。

## Skills 注入格式（v0.9.84+）

```python
# agent.py _get_system_prompt 中
for skill_name in skills_active:
    skill = self.skill_loader.get_active_skill(skill_name)
    if skill:
        caps = ', '.join(skill.capabilities) if skill.capabilities else 'general'
        line = f"- **{skill_name}**: {skill.description} (能力: {caps})"
        if skill.when_to_use:
            line += f"\n  → 何时使用: {skill.when_to_use}"
        skill_lines.append(line)
```

注入到 system prompt 的格式示例：

```
## 已激活技能
- **core_tools**: Core utility tools (能力: time, text_processing, calculation)
  → 何时使用: 需要获取当前时间、日期，或进行文本处理、基础数学计算时使用
- **web_search**: Real web search and content retrieval (能力: web_search, url_fetch)
  → 何时使用: 需要搜索互联网获取实时信息、查询新闻/技术文档时使用
```

## SkillMetadata.when_to_use 字段（v0.9.84+）

```python
@dataclass
class SkillMetadata:
    name: str
    version: str = "1.0.0"
    description: str = ""
    author: str = "unknown"
    capabilities: List[str] = field(default_factory=list)
    when_to_use: str = ""  # ← 新增：指导 LLM 何时激活此技能
    dependencies: List[str] = field(default_factory=list)
    config_schema: Dict[str, Any] = field(default_factory=dict)
```

新增技能时必须填写 `when_to_use`，描述触发场景。

## Memory 相关性筛选（v0.9.84+）

`_get_system_prompt` 新增 `current_message` 参数。当提供用户消息时：

1. 将 memory.md 按 `##` 标题分节
2. 提取用户消息关键词（CJK ≥2 字节 + 英文单词 ≥2 字符）
3. 计算每节关键词匹配数
4. 按匹配度降序重排（0 匹配的节放最后）
5. 截断到 `max_tokens * 4` 字符

## 对话历史智能截断（v0.9.84+）

替代固定的 `conversation_history[-20:]`：

- 根据 `context_window` + `max_tokens` 计算可用预算
- 预留 system + user_msg(500) + output + 10% buffer
- 二分搜索最优保留消息数
- 至少保留 2 条（1轮）
- 截断时插入 `[... 早期对话已截断 ...]` 标记

**Token 估算**：混合中英文 ~3.2 字符/token，图片 ~2000 token/张，tool_calls ~200 token/个。

## 关键代码位置

| 功能 | 方法 | 行号（约） |
|------|------|-----------|
| System prompt 构建 | `_get_system_prompt()` | ~1058 |
| Memory 相关性筛选 | `_filter_memory_by_relevance()` | ~1058 |
| 对话历史智能截断 | `_smart_truncate_history()` | ~448 |
| Token 估算 | `_estimate_messages_tokens()` | ~420 |
| Context 构建入口 | `_build_context()` | ~495 |
| Skills 注入 | `_get_system_prompt()` 内循环 | ~1146 |
