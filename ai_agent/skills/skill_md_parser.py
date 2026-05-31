"""
SKILL.md Parser - 解析 SKILL.md 文件的 frontmatter 和正文

格式规范：
---
name: skill-name
description: 简短描述
version: "1.0.0"
author: author-name
triggers:
  keywords: ["关键词1", "关键词2"]
  patterns: ["正则模式1", "正则模式2"]
  semantic: "语义描述"
capabilities: ["cap1", "cap2"]
when_to_use: "何时使用此技能"
requires:
  tools: ["tool_name"]
  env: ["ENV_VAR"]
  bins: ["binary_name"]
  config: ["config.key"]
metadata:
  siper:
    priority: 5
    token_budget: 500
---

# 技能标题

正文内容（Markdown 格式）
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class SkillFrontmatter:
    """SKILL.md frontmatter 解析结果"""
    name: str = ""
    description: str = ""
    version: str = "1.0.0"
    author: str = "unknown"
    capabilities: List[str] = field(default_factory=list)
    when_to_use: str = ""
    triggers_keywords: List[str] = field(default_factory=list)
    triggers_patterns: List[str] = field(default_factory=list)
    triggers_semantic: str = ""
    requires_tools: List[str] = field(default_factory=list)
    requires_env: List[str] = field(default_factory=list)
    requires_bins: List[str] = field(default_factory=list)
    requires_config: List[str] = field(default_factory=list)
    priority: int = 5
    token_budget: int = 500
    raw: Dict[str, Any] = field(default_factory=dict)


def parse_skill_md(file_path: str) -> tuple[SkillFrontmatter, str]:
    """
    解析 SKILL.md 文件
    
    Returns:
        (frontmatter, body) 元组
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"SKILL.md not found: {file_path}")
    
    content = path.read_text(encoding="utf-8", errors="replace")
    return parse_skill_md_content(content)


def parse_skill_md_content(content: str) -> tuple[SkillFrontmatter, str]:
    """
    从字符串内容解析 SKILL.md
    
    Returns:
        (frontmatter, body) 元组
    """
    fm = SkillFrontmatter()
    body = content
    
    # 提取 frontmatter
    if content.startswith("---"):
        end = content.find("\n---", 3)
        if end != -1:
            yaml_text = content[3:end].strip()
            body = content[end + 4:].strip()
            fm.raw = _parse_yaml(yaml_text)
            _fill_frontmatter(fm, fm.raw)
    
    return fm, body


def _fill_frontmatter(fm: SkillFrontmatter, data: dict):
    """从解析的字典填充 frontmatter"""
    fm.name = data.get("name", "")
    fm.description = data.get("description", "")
    fm.version = str(data.get("version", "1.0.0"))
    fm.author = data.get("author", "unknown")
    fm.capabilities = _ensure_list(data.get("capabilities", []))
    fm.when_to_use = data.get("when_to_use", "")
    
    # triggers
    triggers = data.get("triggers", {})
    if isinstance(triggers, dict):
        fm.triggers_keywords = _ensure_list(triggers.get("keywords", []))
        fm.triggers_patterns = _ensure_list(triggers.get("patterns", []))
        fm.triggers_semantic = triggers.get("semantic", "")
    
    # requires
    requires = data.get("requires", {})
    if isinstance(requires, dict):
        fm.requires_tools = _ensure_list(requires.get("tools", []))
        fm.requires_env = _ensure_list(requires.get("env", []))
        fm.requires_bins = _ensure_list(requires.get("bins", []))
        fm.requires_config = _ensure_list(requires.get("config", []))
    
    # metadata.siper
    metadata = data.get("metadata", {})
    if isinstance(metadata, dict):
        siper = metadata.get("siper", {})
        if isinstance(siper, dict):
            fm.priority = int(siper.get("priority", 5))
            fm.token_budget = int(siper.get("token_budget", 500))


def _ensure_list(value) -> list:
    """确保值是列表"""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return []


def _parse_yaml(text: str) -> dict:
    """
    简单 YAML 解析器（无 PyYAML 依赖）
    支持：
    - key: value
    - key: [list, items]
    - key: {nested: value}
    - 嵌套缩进
    """
    result = {}
    current_key = None
    current_list = None
    current_dict = None
    current_dict_key = None

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        # 列表项
        if stripped.startswith("- "):
            if current_list is not None:
                current_list.append(stripped[2:].strip().strip('"\' '))
            continue

        # 键值对
        if ":" in stripped:
            key, _, val = stripped.partition(":")
            key = key.strip()
            val = val.strip()

            # 嵌套字典值（缩进）
            if current_dict is not None and line.startswith("    "):
                if ":" in val:
                    nk, _, nv = val.partition(":")
                    current_dict[nk.strip()] = nv.strip().strip('"\' ') if nv.strip() else nk.strip()
                continue
            elif current_dict is not None and not line.startswith("  "):
                # 嵌套结束
                result[current_dict_key] = current_dict
                current_dict = None
                current_dict_key = None

            # 空值 = 嵌套字典开始
            if not val:
                current_dict = {}
                current_dict_key = key
                result[key] = current_dict
                continue

            # 列表 [item1, item2]
            if val.startswith("["):
                val_clean = val.strip("[]")
                items = [v.strip().strip('"\' ') for v in val_clean.split(",") if v.strip()]
                result[key] = items
                continue

            # 嵌套字典 {k: v, k2: v2}
            if val.startswith("{"):
                inner = val.strip("{}")
                d = {}
                for part in inner.split(","):
                    if ":" in part:
                        k, _, v = part.partition(":")
                        d[k.strip()] = v.strip().strip('"\' ')
                result[key] = d
                continue

            # 普通值
            result[key] = val.strip('"\' ')

    # 处理末尾嵌套
    if current_dict is not None and current_dict_key:
        result[current_dict_key] = current_dict

    return result
