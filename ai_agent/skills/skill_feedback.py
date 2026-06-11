"""
Skill Feedback - 技能使用反馈系统

记录 skill 触发、选中、执行结果等数据，用于持续优化预筛选。
存储结构：
  - agents/<name>/skill_call_log.db  (SQLite, 详细调用日志)
  - agents/<name>/skill_stats.json   (聚合统计, 向后兼容)
"""

import hashlib
import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .skill_registry import SkillStats

logger = logging.getLogger("skill_feedback")


class SkillCallLog:
    """技能调用日志数据库 (SQLite)"""

    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """初始化数据库表"""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS skill_call_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    session_id TEXT NOT NULL,
                    user_input TEXT NOT NULL,
                    skill_name TEXT NOT NULL,
                    trigger_score REAL DEFAULT 0,
                    trigger_method TEXT DEFAULT 'keyword',
                    llm_called INTEGER DEFAULT 0,
                    llm_call_time_ms REAL DEFAULT 0,
                    execution_success INTEGER DEFAULT 0,
                    execution_time_ms REAL DEFAULT 0,
                    user_feedback TEXT DEFAULT 'none',
                    context_hash TEXT DEFAULT ''
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_skill_call_log_skill
                ON skill_call_log(skill_name)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_skill_call_log_session
                ON skill_call_log(session_id)
            """)
            conn.commit()

    def _hash_input(self, user_input: str) -> str:
        """生成用户输入的语义哈希（用于聚类相似输入）"""
        # 取前100字符的 MD5 前8位作为粗粒度聚类
        normalized = user_input.strip().lower()[:100]
        return hashlib.md5(normalized.encode("utf-8")).hexdigest()[:8]

    def log_call(
        self,
        session_id: str,
        user_input: str,
        skill_name: str,
        trigger_score: float = 0,
        trigger_method: str = "keyword",
        llm_called: bool = False,
        llm_call_time_ms: float = 0,
        execution_success: bool = False,
        execution_time_ms: float = 0,
    ):
        """记录一次技能调用"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.execute(
                    """INSERT INTO skill_call_log
                    (timestamp, session_id, user_input, skill_name, trigger_score,
                     trigger_method, llm_called, llm_call_time_ms,
                     execution_success, execution_time_ms, context_hash)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        time.time(),
                        session_id,
                        user_input[:500],  # 截断
                        skill_name,
                        trigger_score,
                        trigger_method,
                        1 if llm_called else 0,
                        llm_call_time_ms,
                        1 if execution_success else 0,
                        execution_time_ms,
                        self._hash_input(user_input),
                    ),
                )
                conn.commit()
        except Exception as e:
            logger.error(f"写入技能调用日志失败: {e}")

    def get_effectiveness(self, skill_name: str, context_hash: str = None) -> float:
        """
        计算技能有效性分数
        = 选中率 × 成功率
        范围 0.0 ~ 1.0

        如果提供 context_hash，则只计算相似上下文中的有效性
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                if context_hash:
                    # 相似上下文中的有效性
                    row = conn.execute(
                        """SELECT
                            COUNT(*) as total,
                            SUM(llm_called) as called,
                            SUM(execution_success) as success
                        FROM skill_call_log
                        WHERE skill_name = ? AND context_hash = ?""",
                        (skill_name, context_hash),
                    ).fetchone()
                else:
                    row = conn.execute(
                        """SELECT
                            COUNT(*) as total,
                            SUM(llm_called) as called,
                            SUM(execution_success) as success
                        FROM skill_call_log
                        WHERE skill_name = ?""",
                        (skill_name,),
                    ).fetchone()

                total, called, success = row
                if not total or total == 0:
                    return 0.5  # 冷启动默认

                select_rate = (called or 0) / total
                exec_total = (called or 0)
                success_rate = (success or 0) / exec_total if exec_total > 0 else 0.5
                return select_rate * success_rate
        except Exception as e:
            logger.error(f"计算技能有效性失败: {e}")
            return 0.5

    def get_context_boost(self, skill_name: str, user_input: str) -> float:
        """
        根据相似输入的历史调用情况，返回一个 boost 分数
        范围 0.0 ~ 0.3，用于调整预筛选器的基础分
        """
        context_hash = self._hash_input(user_input)
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                row = conn.execute(
                    """SELECT
                        COUNT(*) as total,
                        SUM(llm_called) as called
                    FROM skill_call_log
                    WHERE skill_name = ? AND context_hash = ?""",
                    (skill_name, context_hash),
                ).fetchone()
                total, called = row
                if not total or total < 2:
                    return 0.0  # 数据不足，不调整
                call_rate = (called or 0) / total
                # 最高 boost 0.3
                return min(call_rate * 0.3, 0.3)
        except Exception:
            return 0.0

    def get_stats(self, skill_name: str) -> Dict:
        """获取技能的详细统计数据"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                row = conn.execute(
                    """SELECT
                        COUNT(*) as total_triggers,
                        SUM(llm_called) as total_calls,
                        SUM(execution_success) as total_success,
                        AVG(trigger_score) as avg_score,
                        AVG(llm_call_time_ms) as avg_call_time,
                        MAX(timestamp) as last_trigger
                    FROM skill_call_log
                    WHERE skill_name = ?""",
                    (skill_name,),
                ).fetchone()
                if not row or row[0] == 0:
                    return {
                        "total_triggers": 0,
                        "total_calls": 0,
                        "total_success": 0,
                        "avg_score": 0,
                        "avg_call_time": 0,
                        "last_trigger": 0,
                        "effectiveness": 0.5,
                    }
                total, calls, success, avg_score, avg_time, last = row
                exec_total = calls or 0
                success_rate = (success or 0) / exec_total if exec_total > 0 else 0
                call_rate = (calls or 0) / total if total > 0 else 0
                return {
                    "total_triggers": total,
                    "total_calls": calls or 0,
                    "total_success": success or 0,
                    "avg_score": round(avg_score or 0, 2),
                    "avg_call_time": round(avg_time or 0, 0),
                    "last_trigger": last or 0,
                    "effectiveness": round(call_rate * success_rate, 3),
                }
        except Exception as e:
            logger.error(f"获取技能统计失败: {e}")
            return {
                "total_triggers": 0,
                "total_calls": 0,
                "total_success": 0,
                "avg_score": 0,
                "avg_call_time": 0,
                "last_trigger": 0,
                "effectiveness": 0.5,
            }

    def get_all_stats(self) -> Dict[str, Dict]:
        """获取所有有记录的技能统计"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                rows = conn.execute(
                    "SELECT DISTINCT skill_name FROM skill_call_log"
                ).fetchall()
                return {row[0]: self.get_stats(row[0]) for row in rows}
        except Exception:
            return {}

    def get_recent_calls(self, skill_name: str, limit: int = 10) -> List[Dict]:
        """获取最近调用记录"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    """SELECT * FROM skill_call_log
                    WHERE skill_name = ?
                    ORDER BY timestamp DESC LIMIT ?""",
                    (skill_name, limit),
                ).fetchall()
                return [dict(row) for row in rows]
        except Exception:
            return []


class SkillFeedback:
    """
    Skill 使用反馈收集器（向后兼容层）

    同时维护 JSON 统计文件（向后兼容）和 SQLite 日志数据库（新功能）
    """

    def __init__(self, stats_file: str):
        self.stats_file = Path(stats_file)
        self.stats: Dict[str, SkillStats] = {}
        self.call_log = SkillCallLog(str(self.stats_file.parent / "skill_call_log.db"))
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
                    "trigger_keywords": s.trigger_keywords[-50:],
                }
            self.stats_file.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        except Exception as e:
            logger.error(f"保存 skill 统计数据失败: {e}")

    def _get_or_create(self, skill_name: str) -> SkillStats:
        if skill_name not in self.stats:
            self.stats[skill_name] = SkillStats()
        return self.stats[skill_name]

    def record_trigger(self, skill_name: str, user_input: str = ""):
        """记录 skill 被预筛选选中"""
        s = self._get_or_create(skill_name)
        s.triggered += 1
        s.last_triggered = time.time()
        if user_input:
            s.trigger_keywords.append(user_input[:100])
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

    def log_call(
        self,
        session_id: str,
        user_input: str,
        skill_name: str,
        trigger_score: float = 0,
        trigger_method: str = "keyword",
        llm_called: bool = False,
        llm_call_time_ms: float = 0,
        execution_success: bool = False,
        execution_time_ms: float = 0,
    ):
        """记录一次完整调用（写入 SQLite）"""
        self.call_log.log_call(
            session_id=session_id,
            user_input=user_input,
            skill_name=skill_name,
            trigger_score=trigger_score,
            trigger_method=trigger_method,
            llm_called=llm_called,
            llm_call_time_ms=llm_call_time_ms,
            execution_success=execution_success,
            execution_time_ms=execution_time_ms,
        )

    def get_effectiveness(self, skill_name: str) -> float:
        """计算 skill 有效性分数"""
        return self.call_log.get_effectiveness(skill_name)

    def get_context_boost(self, skill_name: str, user_input: str) -> float:
        """获取上下文 boost 分数"""
        return self.call_log.get_context_boost(skill_name, user_input)

    def get_stats(self, skill_name: str) -> Optional[SkillStats]:
        """获取 skill 统计（向后兼容）"""
        return self.stats.get(skill_name)

    def get_all_stats(self) -> Dict[str, SkillStats]:
        """获取所有统计（向后兼容）"""
        return dict(self.stats)

    def get_detailed_stats(self, skill_name: str) -> Dict:
        """获取详细统计（包含 SQLite 数据）"""
        return self.call_log.get_stats(skill_name)

    def get_all_detailed_stats(self) -> Dict[str, Dict]:
        """获取所有技能的详细统计"""
        return self.call_log.get_all_stats()

    def get_recent_calls(self, skill_name: str, limit: int = 10) -> List[Dict]:
        """获取最近调用记录"""
        return self.call_log.get_recent_calls(skill_name, limit)
