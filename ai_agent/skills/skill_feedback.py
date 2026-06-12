"""
Skill Feedback - 技能使用反馈系统

记录 skill 触发、选中、执行结果等数据，用于持续优化预筛选。
存储：skills/skill_call_log.db  (SQLite, 详细调用日志)
"""

import hashlib
import logging
import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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
                        user_input[:500],
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
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                if context_hash:
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
        根据相似输入的历史调用情况，返回 boost 分数
        范围 0.0 ~ 0.3
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
                    return 0.0
                call_rate = (called or 0) / total
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
                        "total_triggers": 0, "total_calls": 0,
                        "total_success": 0, "avg_score": 0,
                        "avg_call_time": 0, "last_trigger": 0,
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
                "total_triggers": 0, "total_calls": 0,
                "total_success": 0, "avg_score": 0,
                "avg_call_time": 0, "last_trigger": 0,
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
    Skill 使用反馈收集器

    通过 SQLite 记录技能触发、选中、执行结果，
    提供有效性评估和上下文 boost 功能。
    """

    def __init__(self, db_path: str):
        """
        Args:
            db_path: skill_call_log.db 的完整路径
        """
        self.call_log = SkillCallLog(db_path)

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

    def record_trigger(self, skill_name: str, session_id: str = "", user_input: str = ""):
        """记录 skill 被预筛选选中（写入 SQLite）"""
        self.call_log.log_call(
            session_id=session_id or "prefilter",
            user_input=user_input,
            skill_name=skill_name,
            trigger_method="keyword",
        )

    def record_selection(self, skill_name: str, selected: bool = True):
        """记录 LLM 是否调用了此 skill（写入 SQLite）"""
        if selected:
            self.call_log.log_call(
                session_id="selection",
                user_input="",
                skill_name=skill_name,
                llm_called=True,
            )

    def record_result(self, skill_name: str, success: bool = True, execution_time_ms: float = 0):
        """记录 skill 执行结果（写入 SQLite）"""
        self.call_log.log_call(
            session_id="result",
            user_input="",
            skill_name=skill_name,
            llm_called=True,
            execution_success=success,
            execution_time_ms=execution_time_ms,
        )

    def get_effectiveness(self, skill_name: str) -> float:
        """计算 skill 有效性分数"""
        return self.call_log.get_effectiveness(skill_name)

    def get_context_boost(self, skill_name: str, user_input: str) -> float:
        """获取上下文 boost 分数"""
        return self.call_log.get_context_boost(skill_name, user_input)

    def get_detailed_stats(self, skill_name: str) -> Dict:
        """获取详细统计"""
        return self.call_log.get_stats(skill_name)

    def get_all_detailed_stats(self) -> Dict[str, Dict]:
        """获取所有技能的详细统计"""
        return self.call_log.get_all_stats()

    def get_recent_calls(self, skill_name: str, limit: int = 10) -> List[Dict]:
        """获取最近调用记录"""
        return self.call_log.get_recent_calls(skill_name, limit)
