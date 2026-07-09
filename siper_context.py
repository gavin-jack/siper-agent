"""
SiPer 运行时上下文 — 所有共享状态的单一容器。

替代 main() 闭包中的 global/nonlocal 访问，为 SiperServer 实例提供统一的状态来源。

架构演进:
  Phase 1: 创建 AppContext + 将 main() 中的全局变量迁移为 ctx 属性
  Phase 2: handlers 通过 ctx 引用共享资源（不再通过 module-level globals）
  Phase 3: SiperServer 实例持有 ctx
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Dict, Optional

from ai_agent.core.agent import AIAgent
from ai_agent.config_db import ConfigDB
from ai_agent.models_db import ModelsDB


@dataclass
class AppContext:
    """运行时共享状态的单一容器。
    
    所有通过 main() 闭包/shared globals 访问的状态都迁移到这里。
    handlers 和 SiperServer 通过 ctx 实例访问这些资源。
    """
    agent: AIAgent
    config_db: Optional[ConfigDB]
    models_db: ModelsDB
    token_db_conn: object  # sqlite3.Connection
    log_buffer: list = field(default_factory=list)
    token_usage_history: list = field(default_factory=list)
    upgrade_cache: dict = field(default_factory=dict)
    upgrade_cache_lock: threading.Lock = field(default_factory=threading.Lock)
    
    # 配置快照（替代 main() 中的 global 变量）
    ws_heartbeat_timeout: int = 300
    session_list_limit: int = 50
    log_buffer_max: int = 2000
    token_usage_max: int = 500
    context_window_default: int = 8192
    port: int = 7240
    ws_port: int = 7241

    def reset_models_db(self, models_db: ModelsDB) -> None:
        """运行时替换 models_db 连接（用于 api_reset_models）。"""
        # 注意：这里使用 object.__setattr__ 绕过 dataclass 的冻结保护
        # 如果 dataclass 是 frozen=True，需要改为普通 class
        object.__setattr__(self, 'models_db', models_db)
