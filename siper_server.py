"""SiPer Server — wraps HTTP + WebSocket handlers as class.

Replaces the main() closure pattern with explicit state management via AppContext.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional

from siper_context import AppContext

logger = logging.getLogger("siper_web.server")


class SiperServer:
    """Main application server — owns request handlers and runtime state.
    
    Migration path:
    1. Instantiate with AppContext (already created in main())
    2. Call `await server.start()` to begin serving
    3. Handlers access shared state via self.ctx instead of closure globals
    """
    
    def __init__(self, ctx: AppContext):
        self.ctx = ctx
        # Connection state (migrated from main() closure)
        self.connections: Dict[str, object] = {}
        self._msg_queues: Dict[str, asyncio.Queue] = {}
        self._conn_sessions: Dict[str, str] = {}
        self._stop_events: Dict[str, asyncio.Event] = {}
        self._process_tasks: Dict[str, asyncio.Task] = {}
        self._processing_events: Dict[str, asyncio.Event] = {}
    
    async def handle_request(self, reader, writer):
        """HTTP request handler — migrated from main() closure.
        
        Access shared state via self.ctx (agent, api_router, etc.)
        """
        # TODO: Phase 3 — inline the full handle_request logic
        pass
    
    async def ws_handler(self, ws):
        """WebSocket handler — migrated from main() closure."""
        # TODO: Phase 3 — inline the full ws_handler logic
        pass
    
    async def start(self):
        """Start HTTP + WebSocket servers."""
        # TODO: Phase 4 — migrate startup sequence from main()
        pass
