"""
Cronjob Tool - Manage scheduled tasks (cron jobs) for SiPer.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CRONJOBS_FILE = _PROJECT_ROOT / "data" / "cronjobs.json"


def _load_jobs() -> List[Dict[str, Any]]:
    """Load cron jobs from the JSON file."""
    if not CRONJOBS_FILE.exists():
        return []
    try:
        with open(CRONJOBS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except (json.JSONDecodeError, IOError):
        return []


def _save_jobs(jobs: List[Dict[str, Any]]) -> None:
    """Persist cron jobs to the JSON file."""
    CRONJOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CRONJOBS_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, ensure_ascii=False, indent=2)


def _next_id(jobs: List[Dict[str, Any]]) -> str:
    """Generate the next cron_N id."""
    max_n = 0
    for job in jobs:
        jid = job.get("id", "")
        if jid.startswith("cron_"):
            try:
                n = int(jid.split("_", 1)[1])
                max_n = max(max_n, n)
            except ValueError:
                pass
    return f"cron_{max_n + 1}"


def _find_job(jobs: List[Dict[str, Any]], job_id: str) -> Optional[Dict[str, Any]]:
    """Find a job by id."""
    for job in jobs:
        if job.get("id") == job_id:
            return job
    return None


class CronjobTool(BaseTool):
    """Manage scheduled cron jobs. Supports create, list, update, pause, resume, remove, and run actions."""

    def __init__(self):
        super().__init__(
            name="cronjob",
            description=(
                "管理定时任务。支持 create/list/update/pause/resume/remove/run 操作。"
                "action 必填，其余参数根据操作类型提供。"
                "create 时需要 prompt 和 schedule；"
                "update 时需要 job_id 及要修改的字段；"
                "pause/resume/remove/run 时需要 job_id。"
            ),
            schema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "list", "update", "pause", "resume", "remove", "run"],
                        "description": "操作类型"
                    },
                    "job_id": {
                        "type": "string",
                        "description": "任务 ID（update/pause/resume/remove/run 时必填）"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "任务提示词/指令（create/update 时使用）"
                    },
                    "schedule": {
                        "type": "string",
                        "description": "调度表达式，如 cron 格式或自然语言（create/update 时使用）"
                    },
                    "name": {
                        "type": "string",
                        "description": "任务名称（create/update 时使用）"
                    },
                    "repeat": {
                        "type": "integer",
                        "description": "重复次数，0 表示无限重复（create/update 时使用）"
                    }
                },
                "required": ["action"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        action = parameters.get("action", "")

        if action == "list":
            return self._action_list()
        elif action == "create":
            return self._action_create(parameters)
        elif action == "update":
            return self._action_update(parameters)
        elif action == "pause":
            return self._action_pause(parameters)
        elif action == "resume":
            return self._action_resume(parameters)
        elif action == "remove":
            return self._action_remove(parameters)
        elif action == "run":
            return self._action_run(parameters)
        else:
            return ToolResult(
                success=False,
                error=f"未知操作：{action}。支持的操作：create, list, update, pause, resume, remove, run"
            )

    def _action_list(self) -> ToolResult:
        jobs = _load_jobs()
        return ToolResult(
            success=True,
            data=jobs,
            metadata={"count": len(jobs)}
        )

    def _action_create(self, params: Dict[str, Any]) -> ToolResult:
        prompt = params.get("prompt", "")
        schedule = params.get("schedule", "")
        if not prompt:
            return ToolResult(success=False, error="create 操作需要提供 prompt 参数")
        if not schedule:
            return ToolResult(success=False, error="create 操作需要提供 schedule 参数")

        jobs = _load_jobs()
        now = datetime.now(timezone.utc).isoformat()
        job_id = _next_id(jobs)

        job = {
            "id": job_id,
            "name": params.get("name", job_id),
            "prompt": prompt,
            "schedule": schedule,
            "repeat": params.get("repeat", 0),
            "enabled": True,
            "created_at": now,
            "updated_at": now,
            "next_run": None,
            "last_run": None,
            "run_count": 0
        }

        jobs.append(job)
        _save_jobs(jobs)

        return ToolResult(
            success=True,
            data=job,
            metadata={"message": f"已创建定时任务 {job_id}"}
        )

    def _action_update(self, params: Dict[str, Any]) -> ToolResult:
        job_id = params.get("job_id", "")
        if not job_id:
            return ToolResult(success=False, error="update 操作需要提供 job_id 参数")

        jobs = _load_jobs()
        job = _find_job(jobs, job_id)
        if job is None:
            return ToolResult(success=False, error=f"未找到任务：{job_id}")

        # Update allowed fields
        updatable = ["name", "prompt", "schedule", "repeat"]
        for field in updatable:
            if field in params:
                job[field] = params[field]

        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_jobs(jobs)

        return ToolResult(
            success=True,
            data=job,
            metadata={"message": f"已更新任务 {job_id}"}
        )

    def _action_pause(self, params: Dict[str, Any]) -> ToolResult:
        job_id = params.get("job_id", "")
        if not job_id:
            return ToolResult(success=False, error="pause 操作需要提供 job_id 参数")

        jobs = _load_jobs()
        job = _find_job(jobs, job_id)
        if job is None:
            return ToolResult(success=False, error=f"未找到任务：{job_id}")

        job["enabled"] = False
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_jobs(jobs)

        return ToolResult(
            success=True,
            data=job,
            metadata={"message": f"已暂停任务 {job_id}"}
        )

    def _action_resume(self, params: Dict[str, Any]) -> ToolResult:
        job_id = params.get("job_id", "")
        if not job_id:
            return ToolResult(success=False, error="resume 操作需要提供 job_id 参数")

        jobs = _load_jobs()
        job = _find_job(jobs, job_id)
        if job is None:
            return ToolResult(success=False, error=f"未找到任务：{job_id}")

        job["enabled"] = True
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_jobs(jobs)

        return ToolResult(
            success=True,
            data=job,
            metadata={"message": f"已恢复任务 {job_id}"}
        )

    def _action_remove(self, params: Dict[str, Any]) -> ToolResult:
        job_id = params.get("job_id", "")
        if not job_id:
            return ToolResult(success=False, error="remove 操作需要提供 job_id 参数")

        jobs = _load_jobs()
        job = _find_job(jobs, job_id)
        if job is None:
            return ToolResult(success=False, error=f"未找到任务：{job_id}")

        jobs = [j for j in jobs if j.get("id") != job_id]
        _save_jobs(jobs)

        return ToolResult(
            success=True,
            data={"removed": job_id},
            metadata={"message": f"已删除任务 {job_id}", "count": len(jobs)}
        )

    def _action_run(self, params: Dict[str, Any]) -> ToolResult:
        job_id = params.get("job_id", "")
        if not job_id:
            return ToolResult(success=False, error="run 操作需要提供 job_id 参数")

        jobs = _load_jobs()
        job = _find_job(jobs, job_id)
        if job is None:
            return ToolResult(success=False, error=f"未找到任务：{job_id}")

        now = datetime.now(timezone.utc).isoformat()
        job["next_run"] = now
        job["updated_at"] = now
        _save_jobs(jobs)

        return ToolResult(
            success=True,
            data=job,
            metadata={"message": f"已标记任务 {job_id} 为立即执行"}
        )
