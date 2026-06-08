# 部署包维护陷阱

## 陷阱：从 MANIFEST 移除文件不等于从部署包排除

**现象**：从 `MANIFEST` 字典中删除某文件后，运行 `create_deploy.py` 同步，文件仍然被复制到部署包。

**根因**：`sync_deploy()` 的逻辑是复制**所有源文件中未被排除的文件**，MANIFEST 只是用来检查"白名单外文件"并打印警告。文件是否被复制由排除规则决定，不是由 MANIFEST 决定。

**正确做法**：要将文件从部署包排除，必须同时：
1. 从 `MANIFEST` 字典移除（白名单）
2. 添加到排除规则（`EXCLUDE_FILES` 或 `EXCLUDE_PATHS`）

```python
# EXCLUDE_FILES — 按文件名匹配（适用于根目录文件）
EXCLUDE_FILES = {..., "models.json"}

# EXCLUDE_PATHS — 按相对路径匹配（适用于子目录文件）
EXCLUDE_PATHS = {"agents/default/config.json", "config/models.json", "agents/default/soul.md", "agents/default/agent.md"}
```

`should_exclude()` 检查顺序：EXCLUDE_DIRS → EXCLUDE_FILES（按 name）→ EXCLUDE_PATHS（按相对路径）→ 后缀模式。

## 陷阱：清单文件误提交到项目仓库

**现象**：`create_deploy.py check` 报告 `❓ 未纳入白名单: skills/siper-maintenance-DEPLOY_MANIFEST.md`

**根因**：`git add -A` 会把 skill 目录（`skills/`）下的文件也加入项目仓库 commit，但 `references/DEPLOY_MANIFEST.md` 不属于 siper 运行时文件，不应在项目仓库根目录出现。

**预防**：
- commit 前用 `git status` 检查暂存列表，确认没有 `skills/` 目录下的非运行时文件
- 或者用 `git add <具体文件>` 替代 `git add -A`

**修复**：
```bash
cd /home/gavin/.siper
git rm skills/siper-maintenance-DEPLOY_MANIFEST.md
git commit -m "fix: remove misplaced deploy manifest from skills/ [deploy synced]"
```

## 陷阱：清单文件与 MANIFEST 不一致

**现象**：健康检查通过但实际文件数对不上，或新增文件被误报"未纳入白名单"。

**根因**：`references/DEPLOY_MANIFEST.md` 和 `scripts/create_deploy.py` 的 MANIFEST 字典没有同步更新。

**规则**：
- 新增/删除白名单文件时，必须同时更新两处
- 更新后用 `create_deploy.py check` 验证 0 问题

## 陷阱：向部署包添加非运行时文件

**现象**：在部署包中生成 CHANGELOG.md、DEPLOY_MANIFEST.json、DEPLOY_MANIFEST.md 等维护文件。

**根因**：混淆了"部署包"和"项目仓库"的职责。

**规则**：
- 部署包（`E:\\\\SiPer-Deploy\\\\`）只包含重新部署运行时需要的文件
- 不生成 CHANGELOG.md：版本历史在 SKILL.md 维护
- 不生成 DEPLOY_MANIFEST.json：清单文件只在 skill references/ 中维护，不写入部署包
- 不放入 DEPLOY_MANIFEST.md：只在 skill references/ 中维护
- 部署包文件数 = 白名单数（严格一致，无额外文件）
- 健康检查目标：0 问题，部署包文件数 = 白名单数

## 陷阱：包含敏感信息的文件放入部署包

**现象**：`models.json`、`agents/default/config.json` 等包含 API key 的文件被同步到部署包。

**根因**：这些文件在源项目中存在且未被排除，`sync_deploy` 会原样复制。

**规则**：
- 包含 API key / 密码 / 密钥的文件必须加入 `EXCLUDE_FILES` / `EXCLUDE_PATHS`
- 部署时自动生成空模板（api_key 为空字符串），由部署用户自行配置
- 部署后通过 Web UI 设置页面填写敏感信息，不通过文件分发
- `siper_web.py` 中必须有 fallback 逻辑：models.json 不存在时从 settings.json 读取 provider 配置

## 陷阱：Agent 人格文件（soul.md/agent.md）不应打包进部署包

**现象**：`agents/default/soul.md` 和 `agents/default/agent.md` 包含开发者环境特定路径（如 WSL2 路径转换规则）和个性化配置，直接打包会导致其他部署环境行为异常。

**根因**：这些文件是 agent 运行时配置，不是代码逻辑，不同部署环境需要不同内容。

**规则**：
- `soul.md` / `agent.md` 加入 `EXCLUDE_PATHS`，不放入部署包
- `agents/__init__.py` 中添加 `_ensure_agent_files(name)` 函数，在 `list_agents()` 和 `get_agent_dir()` 中调用
- 文件不存在时自动生成最小可用的默认内容（Identity + Language / System Prompt + Response Format）
- 生成的默认内容写盘后，用户可通过 Web UI 编辑

**实现模式**：
```python
def _ensure_agent_files(name: str) -> None:
    agent_dir = AGENTS_DIR / name
    if not agent_dir.is_dir():
        return
    soul_file = agent_dir / "soul.md"
    if not soul_file.exists():
        soul_file.write_text(
            "# SOUL.md - " + name + "\n\n"
            "## Identity\n- Name: " + name + "\n\n"
            "## Language\n- Respond in Chinese (中文) by default\n",
            encoding="utf-8",
        )
    config_file = agent_dir / "agent.md"
    if not config_file.exists():
        config_file.write_text(
            "# Agent Configuration - " + name + "\n\n"
            "## System Prompt\n你是一个高级 AI 助手 " + name + "。\n"
            "1. 清晰理解用户需求\n"
            "2. 在需要时使用合适的工具\n"
            "3. 提供有用、准确的回复\n\n"
            "## Response Format\n- 简洁中文回复\n",
            encoding="utf-8",
        )
```

**注意**：`list_agents()` 的过滤条件从 `(item / "soul.md").exists()` 改为仅检查 `item.is_dir()`，因为 `_ensure_agent_files` 会确保文件存在。`get_agent_dir()` 同理。
