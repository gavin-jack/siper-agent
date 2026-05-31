"""
Skill Pre-Filter - 本地轻量预筛选器

根据用户输入，本地快速筛选出相关 skill，不依赖 LLM。
算法：关键词倒排索引 + 模式匹配 + 使用频率加权 + 优先级调整
"""

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from .skill_registry import SkillEntry, SkillRegistry, SkillStats

logger = logging.getLogger("skill_pre_filter")

# 英文停用词
_EN_STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "to", "of", "in", "for", "on",
    "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "and", "but", "or", "nor", "not", "so", "yet",
    "both", "either", "neither", "each", "every", "all", "any", "few",
    "more", "most", "other", "some", "such", "no", "only", "own",
    "same", "than", "too", "very", "can", "just", "this", "that",
    "these", "those", "it", "its", "i", "me", "my", "we", "our",
    "you", "your", "he", "him", "his", "she", "her", "they", "them",
    "their", "what", "which", "who", "whom", "when", "where", "why",
    "how", "use", "using", "used", "need", "want", "like", "make",
    "get", "got", "go", "going", "come", "came", "take", "took",
    "help", "tell", "give", "put", "set", "try", "call", "keep",
    "let", "begin", "start", "show", "hear", "play", "run", "move",
    "live", "believe", "bring", "happen", "write", "provide", "sit",
    "stand", "lose", "pay", "meet", "include", "continue", "learn",
    "change", "lead", "understand", "watch", "follow", "stop", "create",
    "speak", "read", "allow", "add", "spend", "grow", "open", "walk",
    "win", "offer", "remember", "love", "consider", "appear", "buy",
    "wait", "serve", "die", "send", "expect", "build", "stay", "fall",
    "cut", "reach", "kill", "remain", "suggest", "raise", "pass", "sell",
    "require", "report", "decide", "pull", "develop", "able", "about",
    "above", "across", "after", "again", "against", "also", "am", "because",
    "been", "being", "below", "between", "both", "cannot", "could",
    "down", "during", "each", "else", "ever", "find", "first", "for",
    "from", "further", "here", "how", "if", "in", "into", "it", "its",
    "itself", "just", "last", "made", "many", "might", "more", "most",
    "much", "must", "myself", "never", "now", "off", "often", "on", "once",
    "only", "or", "our", "out", "over", "own", "said", "same", "should",
    "since", "so", "still", "such", "than", "that", "the", "them", "then",
    "there", "these", "they", "those", "through", "to", "too", "under",
    "until", "up", "upon", "us", "very", "was", "we", "well", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why",
    "will", "with", "would", "you", "your",
}


class SkillPreFilter:
    """
    本地轻量预筛选器
    
    根据用户输入选出 Top-K 相关 skill，不依赖 LLM。
    执行时间 <10ms。
    """

    def __init__(self, registry: SkillRegistry, stats: Optional[Dict[str, SkillStats]] = None):
        self.registry = registry
        self.stats = stats or {}
        # 倒排索引：keyword → set(skill_names)
        self._inverted_index: Dict[str, Set[str]] = {}
        # 预编译的正则模式
        self._compiled_patterns: Dict[str, List[re.Pattern]] = {}
        self._index_built = False

    def build_index(self):
        """构建倒排索引和预编译正则"""
        self._inverted_index.clear()
        self._compiled_patterns.clear()

        for entry in self.registry.get_all():
            if not entry.enabled:
                continue

            # 索引触发关键词
            for kw in entry.triggers_keywords:
                kw_lower = kw.lower()
                if kw_lower not in self._inverted_index:
                    self._inverted_index[kw_lower] = set()
                self._inverted_index[kw_lower].add(entry.name)

            # 索引 capability
            for cap in entry.capabilities:
                cap_lower = cap.lower()
                if cap_lower not in self._inverted_index:
                    self._inverted_index[cap_lower] = set()
                self._inverted_index[cap_lower].add(entry.name)

            # 索引 description 中的词
            desc_words = self._tokenize(entry.description + " " + entry.when_to_use)
            for w in desc_words:
                if w not in self._inverted_index:
                    self._inverted_index[w] = set()
                self._inverted_index[w].add(entry.name)

            # 预编译正则模式
            patterns = []
            for p in entry.triggers_patterns:
                try:
                    patterns.append(re.compile(p, re.IGNORECASE))
                except re.error:
                    pass
            if patterns:
                self._compiled_patterns[entry.name] = patterns

        self._index_built = True
        logger.debug(f"预筛选索引构建完成: {len(self._inverted_index)} 个关键词, {len(self._compiled_patterns)} 个正则模式")

    def pre_filter(
        self,
        user_input: str,
        top_k: int = 5,
        min_score: float = 0.3,
        fallback_threshold: int = 3,
    ) -> List[SkillEntry]:
        """
        根据用户输入预筛选相关 skill
        
        Args:
            user_input: 用户输入文本
            top_k: 最多返回多少个 skill
            min_score: 最低分数阈值
            fallback_threshold: 匹配数少于此值时补充高频 skill
            
        Returns:
            相关 skill 列表（按分数降序）
        """
        if not self._index_built:
            self.build_index()

        # 1. 提取用户输入关键词
        keywords = self._tokenize(user_input)
        if not keywords:
            return self._get_fallback(top_k)

        # 2. 倒排索引查找候选
        candidate_scores: Dict[str, float] = {}
        for kw in keywords:
            for skill_name in self._inverted_index.get(kw, set()):
                candidate_scores[skill_name] = candidate_scores.get(skill_name, 0) + 1

        # 3. 多维度打分
        scored: List[Tuple[str, float]] = []
        for name, kw_score in candidate_scores.items():
            entry = self.registry.get(name)
            if not entry or not entry.enabled:
                continue

            # 关键词匹配分 (0-40)
            kw_normalized = kw_score / max(len(keywords), 1) * 40

            # 模式匹配分 (0-30)
            pattern_score = self._pattern_match_score(user_input, name) * 30

            # 使用频率分 (0-20)
            usage_score = self._usage_score(name) * 20

            # 优先级分 (0-10)
            priority_score = min(entry.priority / 10.0, 1.0) * 10

            total = kw_normalized + pattern_score + usage_score + priority_score

            if total >= min_score:
                scored.append((name, total))

        # 4. 排序取 Top-K
        scored.sort(key=lambda x: x[1], reverse=True)
        result = []
        seen = set()
        for name, score in scored[:top_k]:
            entry = self.registry.get(name)
            if entry:
                result.append(entry)
                seen.add(name)

        # 5. 保底策略
        if len(result) < fallback_threshold:
            fallback = self._get_fallback(top_k - len(result), exclude=seen)
            result.extend(fallback)

        logger.debug(f"预筛选: 输入关键词={keywords}, 候选={len(candidate_scores)}, 结果={len(result)}")
        return result

    def _tokenize(self, text: str) -> List[str]:
        """中英文分词"""
        text_lower = text.lower()
        keywords = []

        # 英文词
        en_words = re.findall(r'[a-z]+', text_lower)
        keywords.extend([w for w in en_words if w not in _EN_STOP_WORDS and len(w) > 1])

        # 中文 bigram + 单字
        cn_chars = re.findall(r'[\u4e00-\u9fff]', text)
        keywords.extend(cn_chars)  # 单字
        for i in range(len(cn_chars) - 1):
            keywords.append(cn_chars[i] + cn_chars[i + 1])  # bigram
        if len(cn_chars) >= 3:
            for i in range(len(cn_chars) - 2):
                keywords.append(cn_chars[i] + cn_chars[i + 1] + cn_chars[i + 2])  # trigram

        return list(set(keywords))

    def _pattern_match_score(self, text: str, skill_name: str) -> float:
        """正则模式匹配得分"""
        patterns = self._compiled_patterns.get(skill_name, [])
        if not patterns:
            return 0.0
        matched = sum(1 for p in patterns if p.search(text))
        return matched / len(patterns)

    def _usage_score(self, skill_name: str) -> float:
        """历史使用频率得分（选中率）"""
        stats = self.stats.get(skill_name)
        if not stats or stats.triggered == 0:
            return 0.5  # 冷启动默认分
        return stats.selected / stats.triggered

    def _get_fallback(self, count: int, exclude: Optional[Set[str]] = None) -> List[SkillEntry]:
        """获取高频使用的 skill 作为保底"""
        exclude = exclude or set()
        # 按使用频率排序
        ranked = []
        for name, stats in self.stats.items():
            if name in exclude:
                continue
            score = stats.selected / max(stats.triggered, 1)
            ranked.append((name, score))
        ranked.sort(key=lambda x: x[1], reverse=True)

        result = []
        for name, _ in ranked[:count]:
            entry = self.registry.get(name)
            if entry and entry.enabled:
                result.append(entry)

        # 如果还不够，补充任意启用的 skill
        if len(result) < count:
            for entry in self.registry.get_all():
                if entry.enabled and entry.name not in exclude and entry not in result:
                    result.append(entry)
                    if len(result) >= count:
                        break

        return result
