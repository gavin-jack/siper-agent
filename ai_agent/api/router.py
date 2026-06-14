"""
HTTP 路由注册器
"""
import asyncio
from typing import Any, Callable, Dict, List, Optional, Tuple


import re

class Router:
    """HTTP 路由注册器"""

    def __init__(self, prefix: str = "/api/v1"):
        self.prefix = prefix
        self._routes: List[Tuple[str, str, Callable]] = []

    def _compile_path(self, path: str) -> Tuple[re.Pattern, List[str]]:
        """将路径模板编译为正则，提取参数名列表。
        
        /api/sessions/{sid} → (re.compile(r'^/api/sessions/(?P<sid>[^/]+)$'), ['sid'])
        """
        param_names = []
        pattern = re.sub(r'\{(\w+)\}', lambda m: (param_names.append(m.group(1)), r'([^/]+)')[1], path)
        return re.compile(f'^{pattern}$'), param_names

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

        支持路径参数：/api/sessions/{sid} 匹配 /api/sessions/abc123
        路径参数通过关键字参数传递给处理函数。
        """
        _pass_body = method in ("POST", "PUT", "DELETE") and body is not None
        for m, p, fn in self._routes:
            if m != method:
                continue
            # 尝试精确匹配
            if p == path:
                try:
                    if asyncio.iscoroutinefunction(fn):
                        return await fn(body) if _pass_body else await fn()
                    return fn(body) if _pass_body else fn()
                except TypeError:
                    if asyncio.iscoroutinefunction(fn):
                        return await fn()
                    return fn()
            # 尝试参数化匹配
            if '{' in p:
                pattern, param_names = self._compile_path(p)
                match = pattern.match(path)
                if match:
                    kwargs = dict(zip(param_names, match.groups()))
                    try:
                        if asyncio.iscoroutinefunction(fn):
                            return await fn(body, **kwargs) if _pass_body else await fn(**kwargs)
                        return fn(body, **kwargs) if _pass_body else fn(**kwargs)
                    except TypeError:
                        # 函数不接受 kwargs，尝试只传 body
                        try:
                            if asyncio.iscoroutinefunction(fn):
                                return await fn(body) if _pass_body else await fn()
                            return fn(body) if _pass_body else fn()
                        except TypeError:
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
