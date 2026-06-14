"""
HTTP 路由注册器
"""
import asyncio
from typing import Any, Callable, Dict, List, Optional, Tuple


class Router:
    """HTTP 路由注册器"""

    def __init__(self, prefix: str = "/api/v1"):
        self.prefix = prefix
        self._routes: List[Tuple[str, str, Callable]] = []

    def get(self, path: str):
        def deco(fn):
            self._routes.append(("GET", self.prefix + path, fn))
            return fn
        return deco

    def post(self, path: str):
        def deco(fn):
            self._routes.append(("POST", self.prefix + path, fn))
            return fn
        return deco

    def put(self, path: str):
        def deco(fn):
            self._routes.append(("PUT", self.prefix + path, fn))
            return fn
        return deco

    def delete(self, path: str):
        def deco(fn):
            self._routes.append(("DELETE", self.prefix + path, fn))
            return fn
        return deco

    async def dispatch(self, method: str, path: str, body=None):
        """Dispatch 请求到匹配的路由处理函数。

        如果路由函数是 async 函数则 await，否则直接调用。
        body 参数仅在 POST/PUT/DELETE 时传递给处理函数。
        """
        _pass_body = method in ("POST", "PUT", "DELETE") and body is not None
        for m, p, fn in self._routes:
            if m == method and p == path:
                try:
                    if asyncio.iscoroutinefunction(fn):
                        return await fn(body) if _pass_body else await fn()
                    return fn(body) if _pass_body else fn()
                except TypeError:
                    # 函数不接受 body 参数，尝试不传参调用
                    if asyncio.iscoroutinefunction(fn):
                        return await fn()
                    return fn()
        return None

    @property
    def routes(self) -> List[Tuple[str, str, Callable]]:
        return self._routes.copy()


def ok(data: Any = None, message: str = "ok") -> dict:
    """统一成功响应"""
    return {"code": 0, "data": data, "message": message}


def err(code: int, message: str) -> dict:
    """统一错误响应"""
    return {"code": code, "data": None, "message": message}


# ===== 全局路由器实例 =====
api_router = Router(prefix="")


def register_routes(router, agent_ref, snapshot_mgr_ref, carrier_mgr_ref,
                    local_handlers: dict):
    """注册所有 API 路由

    将本地 API 函数注册到指定的路由器实例。
    local_handlers: dict 包含所有本地 api_* 函数的引用。
    """

    # 注入全局变量到 handlers 模块
    from ai_agent.api import handlers as _h
    import siper_web as _sw
    if agent_ref:
        _h.agent = agent_ref
    if hasattr(_sw, 'PROJECT_ROOT'):
        _h.PROJECT_ROOT = _sw.PROJECT_ROOT
    if hasattr(_sw, '_log_buffer'):
        _h._log_buffer = _sw._log_buffer
    if hasattr(_sw, '_LOG_I18N_CACHE'):
        _h._LOG_I18N_CACHE = _sw._LOG_I18N_CACHE
    # --- 系统端点 ---
    @router.get("/api/version")
    def api_version():
        from siper_web import SIPER_VERSION
        return {"version": SIPER_VERSION, "name": "Siper AI Agent"}

    @router.get("/api/upgrade/check")
    def api_upgrade_check():
        return local_handlers["api_upgrade_check"]()

    @router.post("/api/upgrade")
    def api_upgrade():
        return local_handlers["api_upgrade_execute"]()

    # --- 会话管理 ---
    @router.get("/api/sessions")
    def api_sessions():
        return local_handlers["api_get_sessions"]()

    @router.get("/api/sessions/{sid}")
    def api_sessions_get(sid):
        return local_handlers["api_get_session_messages"](sid)

    @router.delete("/api/sessions/{sid}")
    def api_sessions_delete(sid):
        return local_handlers["api_delete_session"](sid)

    @router.put("/api/sessions/{sid}")
    def api_sessions_put(sid, body):
        return local_handlers["api_rename_session"](sid, body)

    @router.post("/api/save-response-dict")
    def api_save_response_dict(body):
        return local_handlers["api_save_response_dict"](body)

    @router.delete("/api/sessions")
    def api_sessions_clear(body):
        return local_handlers["api_clear_sessions"]()

    # --- 配置管理 ---
    @router.get("/api/config")
    def api_config_get():
        return local_handlers["api_get_config"]()

    @router.post("/api/config")
    def api_config_post(body):
        return local_handlers["api_update_config"](body)

    # --- 技能管理 ---
    @router.get("/api/skills")
    def api_skills_get():
        return local_handlers["api_get_skills"]()

    @router.post("/api/skills/preview")
    def api_skills_preview(body):
        return local_handlers["api_skill_preview"](body)

    @router.get("/api/skills/stats")
    def api_skills_stats():
        return local_handlers["api_skill_stats"]()

    # --- Agent 管理 ---
    @router.get("/api/agents")
    def api_agents_get():
        return local_handlers["api_get_agents"]()

    @router.post("/api/agents")
    def api_agents_post(body):
        if body.get("action") == "create":
            return local_handlers["api_create_agent"](body)
        else:
            return local_handlers["api_switch_agent"](body)

    @router.delete("/api/agents/{name}")
    def api_agents_delete(name):
        return local_handlers["api_delete_agent"](name)

    @router.get("/api/agents/{name}/soul")
    def api_agents_soul_get(name):
        return local_handlers["api_get_agent_soul"](name)

    @router.post("/api/agents/{name}/soul")
    def api_agents_soul_post(name, body):
        return local_handlers["api_save_agent_file"](name, "soul", body)

    @router.get("/api/agents/{name}/config")
    def api_agents_config_get(name):
        return local_handlers["api_get_agent_config"](name)

    @router.post("/api/agents/{name}/config")
    def api_agents_config_post(name, body):
        return local_handlers["api_save_agent_file"](name, "config", body)

    @router.get("/api/agents/{name}/memory")
    def api_agents_memory_get(name):
        return local_handlers["api_get_agent_memory"](name)

    @router.post("/api/agents/{name}/memory")
    def api_agents_memory_post(name, body):
        return local_handlers["api_save_agent_file"](name, "memory", body)

    @router.post("/api/agents/{name}/meta")
    def api_agents_meta_post(name, body):
        return local_handlers["api_save_agent_meta"](name, body)

    @router.post("/api/agents/{name}/rename")
    def api_agents_rename_post(name, body):
        return local_handlers["api_rename_agent"](name, body)

    # --- 状态 ---
    @router.get("/api/status")
    def api_status():
        return local_handlers["api_get_status"]()

    # --- 记忆 ---
    @router.get("/api/memory")
    def api_memory_get():
        return local_handlers["api_get_memory"]("default")

    @router.post("/api/memory")
    def api_memory_post(body):
        return local_handlers["api_write_memory"](body, "default")

    @router.delete("/api/memory")
    def api_memory_delete(body):
        return local_handlers["api_delete_memory"](body, "default")

    @router.get("/api/memory/config")
    def api_memory_config_get():
        return local_handlers["api_get_memory_config"]("default")

    @router.post("/api/memory/config")
    def api_memory_config_post(body):
        return local_handlers["api_save_memory_config"](body, "default")

    # --- 模型管理 ---
    @router.get("/api/models/global")
    def api_models_global_get():
        return local_handlers["api_get_global_models"]()

    @router.post("/api/models/global")
    def api_models_global_post(body):
        return local_handlers["api_save_global_models"](body)

    @router.post("/api/models/discover")
    def api_models_discover(body):
        return local_handlers["api_discover_models"](body)

    @router.post("/api/providers/rename")
    def api_providers_rename(body):
        return local_handlers["api_rename_provider"](body)

    @router.post("/api/providers/update_name")
    def api_providers_update_name(body):
        return local_handlers["api_update_provider_name"](body)

    @router.post("/api/models/reset")
    def api_models_reset(body):
        return local_handlers["api_reset_models"]()

    @router.post("/api/models/test")
    async def api_models_test(body):
        return await local_handlers["api_test_model"](body)

    @router.delete("/api/models/{model_id}")
    def api_models_delete(model_id):
        return local_handlers["api_delete_model"](model_id, {})

    # --- 日志 ---
    @router.get("/api/logs")
    def api_logs_get(full_path):
        return local_handlers["api_get_logs"](full_path)

    # --- Token 统计 ---
    @router.get("/api/token")
    def api_token_get():
        return local_handlers["api_get_token_stats"]()

    # --- 文件上传 ---
    @router.post("/api/upload")
    def api_upload_post(body):
        return local_handlers["api_upload_file"](body, body.get("_raw_request", ""))

    # --- Avatar ---
    @router.get("/api/avatar")
    def api_avatar_get():
        # Avatar serving requires raw_request handling via body
        if "api_get_avatar" in local_handlers:
            return local_handlers["api_get_avatar"]()
        return {"error": "Avatar endpoint not available via router"}

    @router.post("/api/avatar/upload")
    def api_avatar_upload(body):
        return local_handlers["_handle_avatar_upload"](
            body, agent_ref, body.get("_raw_request", ""))

    # --- 状态快照 ---
    @router.get("/api/v1/state/snapshot")
    def api_state_snapshot():
        if snapshot_mgr_ref:
            return ok(snapshot_mgr_ref.get_snapshot())
        return err(503, "SnapshotManager not initialized")

    # --- 主题 ---
    @router.get("/api/theme/templates")
    def api_theme_templates():
        return local_handlers["api_theme_list_templates"]()

    @router.post("/api/theme/save")
    def api_theme_save(body):
        return local_handlers["api_theme_save"](body)

    @router.get("/api/theme/load")
    def api_theme_load(full_path):
        return local_handlers["api_theme_load"](full_path)

    @router.delete("/api/theme/delete")
    def api_theme_delete(body):
        return local_handlers["api_theme_delete"](body)

    @router.get("/api/theme/export")
    def api_theme_export():
        return local_handlers["api_theme_export"]()

    @router.post("/api/theme/import")
    def api_theme_import(body):
        return local_handlers["api_theme_import"](body)
