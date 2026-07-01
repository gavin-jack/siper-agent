"""
Skill Registry - 技能注册中心

负责扫描、解析、缓存所有 skill，提供门控过滤和快速查找。
支持两种 skill 格式：
1. SKILL.md 格式（新格式，YAML frontmatter + Markdown）
2. Python 格式（旧格式，向后兼容）
"""

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger("skill_registry")


@dataclass
class SkillEntry:
    """单个 skill 的完整描述"""
    name: str
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
    source: str = ""          # "md" or "py"
    path: str = ""            # skill 目录或文件路径
    enabled: bool = True
    is_active: bool = False
    content: str = ""         # SKILL.md 正文内容（按需加载）


@dataclass
class SkillStats:
    """skill 使用统计"""
    triggered: int = 0        # 被预筛选选中次数
    selected: int = 0         # 被 LLM 实际调用次数
    success_count: int = 0    # 成功执行次数
    fail_count: int = 0       # 失败执行次数
    last_triggered: float = 0
    last_selected: float = 0
    trigger_keywords: List[str] = field(default_factory=list)  # 最近触发关键词


class SkillRegistry:
    """
    技能注册中心
    
    职责：
    1. 扫描 skill 目录，发现所有 skill
    2. 解析 SKILL.md frontmatter 和 Python skill 元数据
    3. 门控过滤（tools/env/bins/config/platform）
    4. 提供快速查找和缓存
    """

    def __init__(self, skills_dir: str, agent=None):
        self.skills_dir = Path(skills_dir)
        self.agent = agent
        self.skills: Dict[str, SkillEntry] = {}
        self._cache_valid = False
        self._cache_key = ""

    def scan(self) -> int:
        """
        扫描 skill 目录，加载所有 skill 元数据
        返回加载的 skill 数量
        """
        self.skills.clear()
        count = 0

        if not self.skills_dir.exists():
            logger.warning(f"Skill 目录不存在: {self.skills_dir}")
            return 0

        # 1. 扫描 SKILL.md 格式（新）：skills/<name>/SKILL.md 或 skills/<category>/<name>/SKILL.md
        for md_path in self.skills_dir.rglob("SKILL.md"):
            # 排除隐藏目录和 __pycache__（只检查相对于 skills_dir 的路径）
            try:
                rel_parts = md_path.parent.relative_to(self.skills_dir).parts
            except ValueError:
                continue
            if any(p.startswith(".") or p == "__pycache__" for p in rel_parts):
                continue
            try:
                entry = self._parse_skill_md(md_path)
                if entry:
                    self.skills[entry.name] = entry
                    count += 1
            except Exception as e:
                logger.warning(f"解析 SKILL.md 失败 {md_path}: {e}")

        # 2. 扫描 Python 格式（旧，向后兼容）：skills/*.py
        for py_path in self.skills_dir.glob("*.py"):
            if py_path.name.startswith("_"):
                continue
            try:
                entry = self._parse_skill_py(py_path)
                if entry:
                    # 同名时 SKILL.md 优先
                    if entry.name not in self.skills:
                        self.skills[entry.name] = entry
                        count += 1
            except Exception as e:
                logger.warning(f"解析 Python skill 失败 {py_path}: {e}")

        logger.info(f"Skill 注册中心扫描完成: 共 {count} 个 skill")
        self._cache_valid = False
        return count

    def _parse_skill_md(self, md_path: Path) -> Optional[SkillEntry]:
        """解析 SKILL.md 文件，自动补全缺失字段（兼容 Hermes/OpenClaw 格式）"""
        content = md_path.read_text(encoding="utf-8", errors="replace")

        # 提取 YAML frontmatter
        frontmatter = {}
        if content.startswith("---"):
            end = content.find("\n---", 3)
            if end != -1:
                yaml_text = content[3:end].strip()
                frontmatter = self._parse_simple_yaml(yaml_text)

        if not frontmatter.get("name"):
            # 没有 front matter 或没有 name：从目录名推断
            dir_name = md_path.parent.name
            if dir_name and dir_name != ".":
                frontmatter["name"] = dir_name
                frontmatter["description"] = frontmatter.get("description", f"Skill: {dir_name}")
                logger.info(f"  [兼容] SKILL.md 无 front matter，从目录名推断: {dir_name}")
            else:
                return None

        # 提取 metadata.siper 子字段
        metadata = frontmatter.get("metadata", {})
        siper_meta = metadata.get("siper", {}) if isinstance(metadata, dict) else {}

        # 提取 requires
        requires = frontmatter.get("requires", {})
        if not isinstance(requires, dict):
            requires = {}

        # 提取 triggers
        triggers = frontmatter.get("triggers", {})
        if isinstance(triggers, list):
            # 列表格式：- keyword → 直接作为 keywords
            triggers = {"keywords": triggers}
        elif not isinstance(triggers, dict):
            triggers = {}

        # 提取正文（frontmatter 之后的内容）
        body_start = content.find("\n---", 3)
        body = content[body_start + 4:].strip() if body_start != -1 else ""

        name = frontmatter["name"]
        skill_dir = md_path.parent

        # ===== 自动补全兼容层 =====
        # 补全 description
        description = frontmatter.get("description", "")
        when_to_use = frontmatter.get("when_to_use", "")

        # 补全 triggers：没有时从 description + when_to_use + 正文提取关键词
        trigger_keywords = triggers.get("keywords", [])
        trigger_patterns = triggers.get("patterns", [])
        trigger_semantic = triggers.get("semantic", "")

        if not trigger_keywords and not trigger_patterns:
            # 从 description + when_to_use 提取关键词
            seed_text = f"{description} {when_to_use} {body[:500]}"
            trigger_keywords = self._extract_keywords_from_text(seed_text)
            # 同时把 skill name 本身加入关键词
            trigger_keywords.append(name.lower())
            # 去重
            trigger_keywords = list(set(trigger_keywords))
            logger.info(f"  [兼容] skill '{name}' 无 triggers，自动提取关键词: {trigger_keywords[:5]}...")

        # 补全 requires：没有时默认为空（无条件限制）
        # （requires 已经是空 dict，下面会正确处理）

        # 补全 metadata.siper：没有时用默认值
        # （siper_meta 已经是空 dict，int() 会处理默认值）

        entry = SkillEntry(
            name=name,
            description=description,
            version=str(frontmatter.get("version", "1.0.0")),
            author=frontmatter.get("author", "unknown"),
            capabilities=frontmatter.get("capabilities", []),
            when_to_use=when_to_use,
            triggers_keywords=trigger_keywords,
            triggers_patterns=trigger_patterns,
            triggers_semantic=trigger_semantic,
            requires_tools=requires.get("tools", []),
            requires_env=requires.get("env", []),
            requires_bins=requires.get("bins", []),
            requires_config=requires.get("config", []),
            priority=int(siper_meta.get("priority", 5)),
            token_budget=int(siper_meta.get("token_budget", 500)),
            source="md",
            path=str(skill_dir),
            content=body,
        )
        return entry

    def _parse_skill_py(self, py_path: Path) -> Optional[SkillEntry]:
        """从 Python skill 文件提取元数据（通过正则，不执行代码）"""
        content = py_path.read_text(encoding="utf-8", errors="replace")

        # 提取 SkillMetadata 中的字段
        name = py_path.stem
        description = ""
        when_to_use = ""
        capabilities = []

        # 匹配 name= 字段
        m = re.search(r'name\s*=\s*["\']([^"\']+)["\']', content)
        if m:
            name = m.group(1)

        # 匹配 description= 字段
        m = re.search(r'description\s*=\s*["\']([^"\']+)["\']', content)
        if m:
            description = m.group(1)

        # 匹配 when_to_use= 字段
        m = re.search(r'when_to_use\s*=\s*["\']([^"\']+)["\']', content)
        if m:
            when_to_use = m.group(1)

        # 匹配 capabilities= 字段
        m = re.search(r'capabilities\s*=\s*\[([^\]]+)\]', content)
        if m:
            caps_str = m.group(1)
            capabilities = [c.strip().strip('"\'') for c in caps_str.split(",") if c.strip()]

        # 从 description 生成触发关键词（简单分词）
        keywords = self._extract_keywords_from_text(description + " " + when_to_use)

        return SkillEntry(
            name=name,
            description=description,
            when_to_use=when_to_use,
            capabilities=capabilities,
            triggers_keywords=keywords,
            source="py",
            path=str(py_path),
        )

    def _parse_simple_yaml(self, text: str) -> dict:
        """
        YAML 解析器
        优先使用 PyYAML（系统已安装），回退到简单手写解析器
        支持：key: value, key: [list], 嵌套 dict（缩进）, 嵌套列表（- item）
        """
        try:
            import yaml
            result = yaml.safe_load(text)
            if isinstance(result, dict):
                return result
            return {}
        except ImportError:
            pass
        # 回退：简单手写解析器（仅支持扁平结构）
        result = {}
        for raw_line in text.split("\n"):
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if ":" not in stripped:
                continue
            key, _, val = stripped.partition(":")
            key = key.strip()
            val = val.strip()
            if not val:
                continue
            if val.startswith("["):
                val = val.strip("[]")
                items = [v.strip().strip('"\'') for v in val.split(",") if v.strip()]
                result[key] = items
            elif val.startswith("{"):
                inner = val.strip("{}")
                d = {}
                for part in inner.split(","):
                    if ":" in part:
                        k, _, v = part.partition(":")
                        d[k.strip()] = v.strip().strip('"\'')
                result[key] = d
            else:
                result[key] = val.strip('"\'')
        return result

    def _extract_keywords_from_text(self, text: str) -> List[str]:
        """从文本提取关键词"""
        # 英文：按空格分词，去停用词
        # 中文：简单 bigram
        keywords = []
        text_lower = text.lower()

        # 英文词
        en_words = re.findall(r'[a-z]+', text_lower)
        stop_words = {"a", "an", "the", "is", "are", "was", "were", "be", "been",
                      "being", "have", "has", "had", "do", "does", "did", "will",
                      "would", "could", "should", "may", "might", "shall",
                      "to", "of", "in", "for", "on", "with", "at", "by", "from",
                      "as", "into", "through", "during", "before", "after",
                      "and", "but", "or", "nor", "not", "so", "yet", "both",
                      "either", "neither", "each", "every", "all", "any", "few",
                      "more", "most", "other", "some", "such", "no", "only",
                      "own", "same", "than", "too", "very", "can", "just", "this",
                      "that", "these", "those", "it", "its", "i", "me", "my",
                      "we", "our", "you", "your", "he", "him", "his", "she", "her",
                      "they", "them", "their", "what", "which", "who", "whom",
                      "when", "where", "why", "how", "use", "using", "used", "need",
                      "when", "the", "skill", "skills", "tool", "tools"}
        keywords.extend([w for w in en_words if w not in stop_words and len(w) > 1])

        # 中文 bigram
        cn_chars = re.findall(r'[\u4e00-\u9fff]', text)
        for i in range(len(cn_chars) - 1):
            keywords.append(cn_chars[i] + cn_chars[i + 1])

        return list(set(keywords))

    def get_eligible_skills(
        self,
        available_tools: Optional[Set[str]] = None,
        available_env: Optional[Set[str]] = None,
        available_bins: Optional[Set[str]] = None,
    ) -> List[SkillEntry]:
        """
        门控过滤：返回当前可用的 skill 列表
        """
        eligible = []
        for entry in self.skills.values():
            if not entry.enabled:
                continue
            if not self._check_gating(entry, available_tools, available_env, available_bins):
                continue
            eligible.append(entry)
        return eligible

    def _check_gating(
        self,
        entry: SkillEntry,
        available_tools: Optional[Set[str]],
        available_env: Optional[Set[str]],
        available_bins: Optional[Set[str]],
    ) -> bool:
        """检查 skill 的门控条件"""
        at = available_tools or set()
        ae = available_env or set()
        ab = available_bins or set()

        for t in entry.requires_tools:
            if t not in at:
                return False
        for e in entry.requires_env:
            if e not in ae:
                return False
        for b in entry.requires_bins:
            if b not in ab:
                return False
        return True

    def get(self, name: str) -> Optional[SkillEntry]:
        """按名称查找 skill"""
        return self.skills.get(name)

    def get_all(self) -> List[SkillEntry]:
        """获取所有 skill"""
        return list(self.skills.values())

    def load_content(self, name: str) -> str:
        """加载 skill 的完整内容（SKILL.md 正文）"""
        entry = self.skills.get(name)
        if not entry:
            return ""
        if entry.content:
            return entry.content
        # 按需从文件读取
        if entry.source == "md":
            md_path = Path(entry.path) / "SKILL.md"
            if md_path.exists():
                content = md_path.read_text(encoding="utf-8", errors="replace")
                # 去掉 frontmatter
                if content.startswith("---"):
                    end = content.find("\n---", 3)
                    if end != -1:
                        content = content[end + 4:].strip()
                entry.content = content
                return content
        return entry.description

    def save_registry_cache(self, cache_path: str):
        """保存注册表缓存"""
        data = {}
        for name, entry in self.skills.items():
            data[name] = {
                "name": entry.name,
                "description": entry.description,
                "version": entry.version,
                "capabilities": entry.capabilities,
                "when_to_use": entry.when_to_use,
                "triggers_keywords": entry.triggers_keywords,
                "triggers_patterns": entry.triggers_patterns,
                "requires_tools": entry.requires_tools,
                "requires_env": entry.requires_env,
                "requires_bins": entry.requires_bins,
                "priority": entry.priority,
                "source": entry.source,
                "path": entry.path,
                "enabled": entry.enabled,
            }
        Path(cache_path).write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def load_registry_cache(self, cache_path: str) -> bool:
        """加载注册表缓存"""
        try:
            path = Path(cache_path)
            if not path.exists():
                return False
            data = json.loads(path.read_text(encoding="utf-8"))
            # 只恢复元数据，不恢复 content
            for name, info in data.items():
                if name in self.skills:
                    entry = self.skills[name]
                    entry.priority = info.get("priority", entry.priority)
                    entry.enabled = info.get("enabled", entry.enabled)
            return True
        except Exception:
            return False
