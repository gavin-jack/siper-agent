# Hermes Skill 系统架构深度解析

## 概述

Hermes 的 skill 系统是一个**基于文件系统的知识管理框架**，将可复用的操作流程、领域知识和最佳实践存储为 Markdown 文件（SKILL.md），供 AI Agent 在需要时动态加载。

## 目录结构

```
~/.hermes/skills/                        # 全局 skills 目录
├── devops/
│   └── siper-coding/
│       ├── SKILL.md                     # 主文件（YAML frontmatter + Markdown body）
│       └── references/                  # 参考文件
├── creative/
├── github/
...

~/.hermes/profiles/<name>/skills/        # Profile 级别 skills（隔离）
```

**两类目录**：
- **全局目录** `~/.hermes/skills/`：所有 profile 共享
- **Profile 目录** `~/.hermes/profiles/<name>/skills/`：特定 profile 独有

## SKILL.md 文件格式

```yaml
---
name: siper-coding
description: Siper AI Agent 项目维护工作指南
triggers:
  - siper
  - siper维护
metadata:
  hermes:
    tags: ["Hermes", "配置"]
    related_skills: [claude-code, codex]
---

# 正文内容（Markdown）
```

**关键字段**：
- `name`：skill 唯一标识名（≤64字符）
- `description`：简短描述（≤1024字符）
- `triggers`：触发词列表（用于自动匹配）
- `platforms`：平台限制（如 `[macos, linux]`）
- `metadata.hermes`：Hermes 专属元数据
  - `requires_tools` / `requires_toolsets`：依赖的工具
  - `fallback_for_tools`：当某工具可用时隐藏此 skill

## 加载机制（三层架构）

### Layer 1: 编译时索引（System Prompt 注入）

每次会话启动时，`build_skills_system_prompt()` 扫描所有 skill 目录：

```
1. 扫描 ~/.hermes/skills/ 下所有 SKILL.md
2. 解析 YAML frontmatter
3. 过滤：平台匹配 + 未被禁用 + 条件满足
4. 生成紧凑的 skill 索引文本
5. 注入到 system prompt 的 <available_skills> 块中
```

生成的 system prompt 片段格式：
```
## Skills (mandatory)
Before replying, scan the skills below...

<available_skills>
  devops:
    - siper-coding: Siper AI Agent 项目维护工作指南
  github:
    - github-code-review: Code review workflow
  ...
</available_skills>
```

**两层缓存**：
1. **进程内 LRU 缓存**：key = (skills_dir, tools, toolsets, platform)
2. **磁盘快照** `.skills_prompt_snapshot.json`：mtime/size 验证，跨进程复用

### Layer 2: 运行时按需加载（skill_view）

当 Agent 判断某个 skill 与当前任务相关时：

```
Agent 调用 skill_view(name="siper-coding")
  → skills_tool.py → skill_view()
    → 在所有 skill 目录中查找 SKILL.md
    → 解析 frontmatter + body
    → 预处理（模板变量替换 ${HERMES_SKILL_DIR}、内联 shell 执行）
    → 返回 JSON {success, content, linked_files}
```

**搜索顺序**：
1. `~/.hermes/skills/`（本地目录）
2. `~/.hermes/profiles/<name>/skills/`（profile 目录）
3. `skills.external_dirs` 配置的外部目录
4. Plugin 提供的 skills（`plugin:skill-name` 格式）

### Layer 3: 斜杠命令（/skill-name）

用户或 Agent 可以通过斜杠命令直接加载 skill：

```
/siper-coding  →  skill_commands.py → _load_skill_payload()
                  → 读取完整 SKILL.md 内容
                  → 作为 user 消息注入对话
```

## 工具集成

| 工具 | 功能 | 实现文件 |
|------|------|---------|
| `skills_list` | 列出所有 skill（仅名称+描述） | `skills_tool.py:675` |
| `skill_view` | 加载完整 skill 内容 | `skills_tool.py:850` |
| `skill_manage` | CRUD 操作（create/patch/edit/delete） | `skill_manager_tool.py:816` |

## 过滤与条件激活

```
_skill_should_show() 逻辑：
1. 平台过滤：skill.frontmatter.platforms vs sys.platform
2. 禁用过滤：config.yaml 中的 skills.disabled 列表
3. 条件过滤：
   - requires_tools/toolsets：缺少依赖工具 → 隐藏
   - fallback_for_tools/toolsets：主工具可用 → 隐藏（避免重复）
```

## 预处理功能

- **模板变量替换**：`${HERMES_SKILL_DIR}` → skill 目录绝对路径
- **内联 shell 执行**：`` !`date +%Y-%m-%d` `` → 执行并替换为输出
- **Plugin skill 支持**：`plugin:skill-name` 格式，从插件目录加载

## 关键源码文件

| 文件 | 职责 |
|------|------|
| `agent/skill_utils.py` | 工具函数（frontmatter 解析、平台匹配、目录扫描） |
| `agent/skill_bundles.py` | Skill bundles（多 skill 组合加载） |
| `agent/skill_commands.py` | 斜杠命令处理 |
| `agent/skill_preprocessing.py` | SKILL.md 预处理（模板变量、内联 shell） |
| `agent/prompt_builder.py` | System Prompt 构建（含 skill 索引注入） |
| `agent/system_prompt.py` | System Prompt 组装 |
| `tools/skills_tool.py` | skills_list / skill_view 工具实现 |
| `tools/skill_manager_tool.py` | skill_manage 工具实现 |
| `hermes_constants.py` | 路径常量（get_skills_dir 等） |

## Skill 生命周期

1. **创建**：`skill_manage(action='create')` → 创建目录 + SKILL.md
2. **更新**：`skill_manage(action='patch')` → 精确字符串替换
3. **删除**：`skill_manage(action='delete')` → 移至回收站
4. **发现**：`_find_all_skills()` 递归扫描所有 skill 目录
5. **缓存**：`.skills_prompt_snapshot.json` 磁盘快照

## 与 SiPer 的关系

- SiPer 的 skills 存储在 `~/.hermes/profiles/siper-coding/skills/`（由 Hermes 管理）
- SiPer 自身没有 skill 系统，它的"技能"通过 SOUL.md 中的硬编码规则实现
- Hermes 通过 `skill_view` 工具读取 SiPer 的 SKILL.md，将其内容注入 system prompt
