"""
Siper Web - Task Manager
定时任务管理器，支持 cron 表达式和手动触发。
"""

import asyncio
import json
import logging
import re as _re
import time
from pathlib import Path

logger = logging.getLogger("siper_web.task_manager")

def _cron_matches(cron_expr, t):
    """Check if a cron expression matches the given time struct."""
    parts = cron_expr.split()
    if len(parts) < 5:
        return False
    minute, hour, dom, month, dow = parts
    if t.tm_min not in _parse_cron_field(minute, 0, 59):
        return False
    if t.tm_hour not in _parse_cron_field(hour, 0, 23):
        return False
    if t.tm_mday not in _parse_cron_field(dom, 1, 31):
        return False
    if t.tm_mon not in _parse_cron_field(month, 1, 12):
        return False
    if t.tm_wday not in _parse_cron_field(dow, 0, 6):
        return False
    return True

def _next_cron_run(cron_expr, after_t):
    """Find the next run time after the given time. Returns epoch seconds."""
    # Simple brute-force: check each minute for the next 48 hours
    check = after_t + 60  # start from next minute
    for _ in range(60 * 48):
        lt = time.localtime(check)
        if _cron_matches(cron_expr, lt):
            return check
        check += 60
    return check

class TaskManager:
    """Manages scheduled tasks with cron-like expressions."""

    def __init__(self, data_dir=None, project_root=None):
        root = Path(project_root) if project_root else Path.cwd()
        self.data_dir = Path(data_dir or (root / "data"))
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.tasks_file = self.data_dir / "tasks.json"
        self.history_dir = self.data_dir / "task_history"
        self.history_dir.mkdir(parents=True, exist_ok=True)
        self.tasks = []
        self._scheduler_task = None
        self._agent = None
        self.load()

    def set_agent(self, agent):
        """Set the agent reference for task execution."""
        self._agent = agent

    def load(self):
        if self.tasks_file.exists():
            try:
                self.tasks = json.loads(self.tasks_file.read_text(encoding="utf-8"))
            except Exception:
                self.tasks = []
        # Ensure each task has required fields
        for t in self.tasks:
            if "id" not in t:
                t["id"] = _re.sub(r'[^a-z0-9]', '_', t.get("name", "task").lower()) + "_" + str(int(time.time()))
            if "enabled" not in t:
                t["enabled"] = True
            if "run_count" not in t:
                t["run_count"] = 0
            if "history" not in t:
                t["history"] = []
            if "cron" not in t:
                t["cron"] = "0 * * * *"
            if "prompt" not in t:
                t["prompt"] = ""
            if "created_at" not in t:
                t["created_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            if "next_run" not in t and t.get("enabled"):
                try:
                    t["next_run"] = time.strftime("%Y-%m-%d %H:%M:%S",
                        time.localtime(_next_cron_run(t["cron"], time.time())))
                except Exception:
                    t["next_run"] = ""

    def save(self):
        self.tasks_file.write_text(
            json.dumps(self.tasks, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def get_all(self):
        return list(self.tasks)

    def get(self, task_id):
        for t in self.tasks:
            if t["id"] == task_id:
                return dict(t)
        return None

    def create(self, name, prompt, cron="0 * * * *", enabled=True):
        task_id = _re.sub(r'[^a-z0-9]', '_', name.lower()) + "_" + str(int(time.time()))
        next_run = ""
        try:
            next_run = time.strftime("%Y-%m-%d %H:%M:%S",
                time.localtime(_next_cron_run(cron, time.time())))
        except Exception:
            pass
        task = {
            "id": task_id,
            "name": name,
            "prompt": prompt,
            "cron": cron,
            "enabled": enabled,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "last_run": "",
            "next_run": next_run,
            "run_count": 0,
            "history": [],
        }
        self.tasks.append(task)
        self.save()
        return dict(task)

    def update(self, task_id, updates):
        for t in self.tasks:
            if t["id"] == task_id:
                for k, v in updates.items():
                    if k in ("name", "prompt", "cron", "enabled"):
                        t[k] = v
                # Recalculate next_run if cron changed
                if "cron" in updates and t.get("enabled"):
                    try:
                        t["next_run"] = time.strftime("%Y-%m-%d %H:%M:%S",
                            time.localtime(_next_cron_run(t["cron"], time.time())))
                    except Exception:
                        t["next_run"] = ""
                elif "enabled" in updates and not updates["enabled"]:
                    t["next_run"] = ""
                self.save()
                return dict(t)
        return None

    def delete(self, task_id):
        for i, t in enumerate(self.tasks):
            if t["id"] == task_id:
                self.tasks.pop(i)
                self.save()
                # Also clean up history file
                hf = self.history_dir / f"{task_id}.json"
                if hf.exists():
                    hf.unlink()
                return True
        return False

    def get_history(self, task_id, limit=50):
        hf = self.history_dir / f"{task_id}.json"
        if hf.exists():
            try:
                h = json.loads(hf.read_text(encoding="utf-8"))
                return h[-limit:]
            except Exception:
                return []
        return []

    def add_history(self, task_id, entry):
        hf = self.history_dir / f"{task_id}.json"
        history = []
        if hf.exists():
            try:
                history = json.loads(hf.read_text(encoding="utf-8"))
            except Exception:
                history = []
        history.append(entry)
        # Keep max 200 entries per task
        if len(history) > 200:
            history = history[-200:]
        hf.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")

    async def start_scheduler(self):
        """Start the background scheduler that checks cron triggers."""
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("任务调度器已启动")

    async def _scheduler_loop(self):
        while True:
            try:
                now = time.time()
                lt = time.localtime(now)
                for task in self.tasks:
                    if not task.get("enabled") or not task.get("prompt"):
                        continue
                    if _cron_matches(task["cron"], lt):
                        # Check if we already ran this minute
                        last = task.get("last_run", "")
                        current_minute = time.strftime("%Y-%m-%d %H:%M", lt)
                        if last.startswith(current_minute):
                            continue
                        logger.info(f"触发定时任务：{task['name']} ({task['id']})")
                        await self._execute_task(task, lt)
                await asyncio.sleep(30)  # Check every 30 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"调度器错误：{e}")
                await asyncio.sleep(60)

    async def _execute_task(self, task, lt):
        """Execute a scheduled task via the agent."""
        now_str = time.strftime("%Y-%m-%d %H:%M:%S", lt)
        task["last_run"] = now_str
        task["run_count"] = task.get("run_count", 0) + 1
        try:
            next_t = _next_cron_run(task["cron"], time.time())
            task["next_run"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(next_t))
        except Exception:
            pass
        self.save()

        # Execute
        if self._agent is None:
            logger.warning(f"任务 '{task['name']}' 无法执行：agent 未设置")
            return
        session_id = f"task_{task['id']}_{int(time.time())}"
        try:
            result = await self._agent.process_message(
                message=task["prompt"],
                user_id="scheduler",
                session_id=session_id,
            )
            response_text = result["response"] if result["success"] else f"Error: {result.get('error', 'unknown')}"
            success = result["success"]
        except Exception as e:
            response_text = f"Error: {e}"
            success = False

        entry = {
            "time": now_str,
            "success": success,
            "response": response_text[:500],
            "session_id": session_id,
        }
        self.add_history(task["id"], entry)
        logger.info(f"任务 '{task['name']}' 执行：{'成功' if success else '失败'}")

    def trigger_now(self, task_id):
        """Manually trigger a task. Returns True if task found and triggered."""
        for t in self.tasks:
            if t["id"] == task_id:
                asyncio.get_event_loop().create_task(
                    self._execute_task(t, time.localtime(time.time()))
                )
                return True
        return False

    async def stop(self):
        if self._scheduler_task:
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass


