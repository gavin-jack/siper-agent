"""
Skill Feedback - 技能使用反馈系统

记录 skill 触发、选中、执行结果等数据，用于持续优化预筛选。
存储在 agents/<name>/skill_stats.json
"""

import json
import logging
import time
from pathlib import Path
from typing import Dict, Optional

from .skill_registry import SkillStats

logger = logging.getLogger("skill_feedback")


class SkillFeedback:
    """
    Skill 使用反馈收集器
    
    记录：
    - skill 被预筛选选中的次数
    - skill 被 LLM 实际调用的次数
    - skill 执行成功/失败的次数
    - 触发时的关键词
    - 最近触发时间
    """

    def __init__(self, stats_file: str):
        self.stats_file = Path(stats_file)
        self.stats: Dict[str, SkillStats] = {}
        self._load()

    def _load(self):
        """从文件加载统计数据"""
        try:
            if self.stats_file.exists():
                data = json.loads(self.stats_file.read_text(encoding="utf-8"))
                for name, info in data.items():
                    s = SkillStats()
                    s.triggered = info.get("triggered", 0)
                    s.selected = info.get("selected", 0)
                    s.success_count = info.get("success_count", 0)
                    s.fail_count = info.get("fail_count", 0)
                    s.last_triggered = info.get("last_triggered", 0)
                    s.last_selected = info.get("last_selected", 0)
                    s.trigger_keywords = info.get("trigger_keywords", [])
                    self.stats[name] = s
        except Exception as e:
            logger.warning(f"加载 skill 统计数据失败: {e}")
            self.stats = {}

    def _save(self):
        """保存统计数据到文件"""
        try:
            self.stats_file.parent.mkdir(parents=True, exist_ok=True)
            data = {}
            for name, s in self.stats.items():
                data[name] = {
                    "triggered": s.triggered,
                    "selected": s.selected,
                    "success_count": s.success_count,
                    "fail_count": s.fail_count,
                    "last_triggered": s.last_triggered,
                    "last_selected": s.last_selected,
                    "trigger_keywords": s.trigger_keywords[-50:],  # 只保留最近50个
                }
            self.stats_file.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        except Exception as e:
            logger.error(f"保存 skill 统计数据失败: {e}")

    def record_trigger(self, skill_name: str, user_input: str = ""):
        """记录 skill 被预筛选选中"""
        s = self._get_or_create(skill_name)
        s.triggered += 1
        s.last_triggered = time.time()
        if user_input:
            s.trigger_keywords.append(user_input[:100])  # 截断
        self._save()

    def record_selection(self, skill_name: str, selected: bool = True):
        """记录 LLM 是否调用了此 skill"""
        s = self._get_or_create(skill_name)
        if selected:
            s.selected += 1
            s.last_selected = time.time()
        self._save()

    def record_result(self, skill_name: str, success: bool = True):
        """记录 skill 执行结果"""
        s = self._get_or_create(skill_name)
        if success:
            s.success_count += 1
        else:
            s.fail_count += 1
        self._save()

    def get_effectiveness(self, skill_name: str) -> float:
        """
        计算 skill 有效性分数
        = 选中率 × 成功率
        范围 0.0 ~ 1.0
        """
        s = self.stats.get(skill_name)
        if not s or s.triggered == 0:
            return 0.5  # 冷启动默认
        select_rate = s.selected / s.triggered
        total = s.success_count + s.fail_count
        success_rate = s.success_count / total if total > 0 else 0.5
        return select_rate * success_rate

    def get_stats(self, skill_name: str) -> Optional[SkillStats]:
        """获取 skill 统计"""
        return self.stats.get(skill_name)

    def get_all_stats(self) -> Dict[str, SkillStats]:
        """获取所有统计"""
        return dict(self.stats)

    def _get_or_create(self, skill_name: str) -> SkillStats:
        if skill_name not in self.stats:
            self.stats[skill_name] = SkillStats()
        return self.stats[skill_name]

    def get_report(self) -> Dict:
        """生成使用报告"""
        report = {
            "total_skills": len(self.stats),
            "top_triggered": [],
            "top_selected": [],
            "low_effectiveness": [],
            "unused": [],
        }
        
        for name, s in self.stats.items():
            eff = self.get_effectiveness(name)
            info = {
                "name": name,
                "triggered": s.triggered,
                "selected": s.selected,
                "success_rate": s.success_count / max(s.success_count + s.fail_count, 1),
                "effectiveness": eff,
            }
            
            if s.triggered > 0:
                report["top_triggered"].append(info)
            if s.selected > 0:
                report["top_selected"].append(info)
            if s.triggered > 5 and eff < 0.2:
                report["low_effectiveness"].append(info)
            if s.triggered == 0:
                report["unused"].append({"name": name})

        # 排序
        report["top_triggered"].sort(key=lambda x: x["triggered"], reverse=True)
        report["top_selected"].sort(key=lambda x: x["selected"], reverse=True)

        return report
