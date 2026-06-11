"""
Advanced Tool Registry System
Manages tool registration, execution, and lifecycle.
"""

import asyncio
import importlib
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable, Set
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from .toolsets import resolve_toolset


class ToolCategory(Enum):
    """Tool categories for organization."""
    CORE = "core"
    WEB = "web"
    FILE = "file"
    DATA = "data"
    COMMUNICATION = "communication"
    UTILITY = "utility"

# Tool availability cache (check_fn results with TTL)
_tool_availability_cache: Dict[str, tuple] = {}  # name -> (available, timestamp)
_AVAILABILITY_TTL = 30.0  # seconds


@dataclass
class ToolMetadata:
    """Metadata for registered tools."""
    name: str
    description: str
    schema: Dict[str, Any]
    toolsets: List[str] = field(default_factory=lambda: ["core"])
    version: str = "1.0.0"
    author: str = "unknown"
    requires_auth: bool = False
    rate_limit: int = 60  # requests per minute
    timeout: int = 30  # seconds
    category: ToolCategory = ToolCategory.UTILITY


@dataclass
class ToolResult:
    """Result from tool execution."""
    success: bool
    data: Any = None
    error: str = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    execution_time_ms: float = 0.0


@dataclass
class ToolCall:
    """Represents a tool call request."""
    name: str
    parameters: Dict[str, Any]
    call_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)


class BaseTool(ABC):
    """Abstract base class for all tools."""

    def __init__(
        self,
        name: str,
        description: str,
        schema: Dict[str, Any],
        toolsets: List[str] = None,
        category: ToolCategory = ToolCategory.UTILITY
    ):
        self.metadata = ToolMetadata(
            name=name,
            description=description,
            schema=schema,
            toolsets=toolsets or ["core"],
            category=category
        )
        self.is_initialized = False
        self.logger = logging.getLogger(f"tool.{name}")
        self._execution_count = 0
        self._last_execution: Optional[datetime] = None

    @abstractmethod
    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        """Execute the tool with given parameters."""
        pass

    async def initialize(self, config: Dict[str, Any] = None) -> bool:
        """Initialize the tool with optional configuration."""
        try:
            if hasattr(self, '_initialize'):
                await self._initialize(config or {})
            self.is_initialized = True
            return True
        except Exception as e:
            self.logger.error(f"工具初始化失败：{e}")
            return False

    def validate_parameters(self, parameters: Dict[str, Any]) -> bool:
        """Validate input parameters against schema."""
        # Basic validation - check required fields
        schema = self.metadata.schema
        if 'required' in schema:
            for field in schema['required']:
                if field not in parameters:
                    self.logger.warning(f"缺少必填参数：{field}")
                    return False
        return True

    def get_schema(self) -> Dict[str, Any]:
        """Return OpenAPI-compatible schema."""
        return self.metadata.schema

    def record_execution(self, success: bool, execution_time_ms: float):
        """Record tool execution for metrics."""
        self._execution_count += 1
        self._last_execution = datetime.now()


class ToolRegistry:
    """
    Central registry for managing all available tools.
    Provides registration, lookup, and execution capabilities.
    """

    def __init__(self, enabled_toolsets: List[str] = None, disabled_toolsets: List[str] = None):
        self.tools: Dict[str, BaseTool] = {}
        self.toolsets: Dict[str, List[str]] = {}
        self.categories: Dict[ToolCategory, List[str]] = {}
        self.logger = logging.getLogger("tool_registry")
        self._rate_limiters: Dict[str, asyncio.Semaphore] = {}
        self._enabled_toolsets = enabled_toolsets
        self._disabled_toolsets = disabled_toolsets or []

    async def initialize(self) -> bool:
        """Initialize the tool registry."""
        self.logger.info("正在初始化工具注册表...")
        # Register default core tools
        await self._register_default_tools()
        return True

    async def _register_default_tools(self):
        """自动扫描 ai_agent/tools/ 目录，注册所有 *_tool.py 中的 BaseTool 子类。"""
        tools_dir = Path(__file__).parent
        registered = []

        for f in sorted(tools_dir.glob("*_tool.py")):
            mod_name = f.stem  # e.g. "read_file_tool"
            # Skip disabled tools
            if mod_name.startswith("_"):
                continue
            try:
                mod = importlib.import_module(f".{mod_name}", package=__package__)
            except Exception as e:
                self.logger.warning(f"导入工具模块失败 {mod_name}：{e}")
                continue

            # Find all BaseTool subclasses in the module
            for attr_name in dir(mod):
                if attr_name.startswith("_"):
                    continue
                attr = getattr(mod, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, BaseTool)
                    and attr is not BaseTool
                ):
                    try:
                        tool = attr()
                        await tool.initialize()
                        self.register_tool(tool)
                        registered.append(tool.metadata.name)
                    except Exception as e:
                        self.logger.error(f"实例化工具 {attr_name} 失败：{e}")

        self.logger.info(f"自注册完成：{len(registered)} 个工具 ({', '.join(registered)})")

    def register_tool(self, tool: BaseTool) -> bool:
        """
        Register a new tool with the registry.

        Args:
            tool: Tool instance to register

        Returns:
            True if registration successful
        """
        try:
            self.tools[tool.metadata.name] = tool

            # Index by toolset
            for toolset in tool.metadata.toolsets:
                if toolset not in self.toolsets:
                    self.toolsets[toolset] = []
                self.toolsets[toolset].append(tool.metadata.name)

            # Index by category
            category = tool.metadata.category
            if category not in self.categories:
                self.categories[category] = []
            self.categories[category].append(tool.metadata.name)

            # Setup rate limiter
            self._rate_limiters[tool.metadata.name] = asyncio.Semaphore(
                tool.metadata.rate_limit
            )

            self.logger.info(f"已注册工具：{tool.metadata.name}")
            return True

        except Exception as e:
            self.logger.error(f"注册工具失败 {tool.metadata.name}：{e}")
            return False

    def unregister_tool(self, tool_name: str) -> bool:
        """Unregister a tool from the registry."""
        if tool_name not in self.tools:
            return False

        tool = self.tools[tool_name]

        # Remove from toolsets
        for toolset in tool.metadata.toolsets:
            if toolset in self.toolsets and tool_name in self.toolsets[toolset]:
                self.toolsets[toolset].remove(tool_name)

        # Remove from categories
        category = tool.metadata.category
        if category in self.categories and tool_name in self.categories[category]:
            self.categories[category].remove(tool_name)

        del self.tools[tool_name]
        # Clean up availability cache for removed tool
        _tool_availability_cache.pop(tool_name, None)
        self.logger.info(f"已注销工具：{tool_name}")
        return True

    async def execute_tool(
        self,
        tool_name: str,
        params: Dict[str, Any]
    ) -> ToolResult:
        """
        Execute a registered tool with given parameters.

        Args:
            tool_name: Name of the tool to execute
            params: Parameters to pass to the tool

        Returns:
            ToolResult with execution outcome
        """
        start_time = datetime.now()

        if tool_name not in self.tools:
            raise ValueError(f"Tool '{tool_name}' not found in registry")

        tool = self.tools[tool_name]

        # Check rate limit
        if not await self._check_rate_limit(tool_name):
            return ToolResult(
                success=False,
                error=f"Rate limit exceeded for tool '{tool_name}'",
                metadata={'rate_limited': True}
            )

        # Validate parameters
        if not tool.validate_parameters(params):
            return ToolResult(
                success=False,
                error=f"Invalid parameters for tool '{tool_name}'",
                metadata={'validation_failed': True}
            )

        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                tool.execute(params),
                timeout=tool.metadata.timeout
            )

            # Record execution
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            result.execution_time_ms = execution_time
            tool.record_execution(result.success, execution_time)

            return result

        except asyncio.TimeoutError:
            return ToolResult(
                success=False,
                error=f"Tool execution timed out after {tool.metadata.timeout}s",
                metadata={'timeout': True}
            )
        except Exception as e:
            self.logger.error(f"工具执行错误：{e}")
            return ToolResult(
                success=False,
                error=str(e),
                metadata={'exception': str(e)}
            )

    async def _check_rate_limit(self, tool_name: str) -> bool:
        """Check if tool is within rate limits."""
        if tool_name not in self._rate_limiters:
            return True

        semaphore = self._rate_limiters[tool_name]
        # Try to acquire without waiting
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=0.1)
            # Release immediately since we just checked
            semaphore.release()
            return True
        except asyncio.TimeoutError:
            return False

    def get_available_tools(self) -> List[Dict]:
        """Get list of available tools with metadata, filtered by toolsets."""
        tools_list = []
        enabled = self._resolve_enabled_tools()
        for name, tool in self.tools.items():
            # Toolset filtering
            if enabled is not None:
                tool_toolsets = set(tool.metadata.toolsets)
                if not tool_toolsets.intersection(enabled):
                    continue
            # Availability check (check_fn with TTL cache)
            if not self._check_tool_available(name):
                continue
            tools_list.append({
                'name': name,
                'description': tool.metadata.description,
                'schema': tool.get_schema(),
                'toolsets': tool.metadata.toolsets,
                'category': tool.metadata.category.value
            })
        return tools_list

    def _resolve_enabled_tools(self) -> Optional[Set[str]]:
        """Resolve enabled toolsets to a set of tool names."""
        enabled = self._enabled_toolsets
        disabled = set(self._disabled_toolsets or [])
        if enabled is None and not disabled:
            return None  # No filtering
        if enabled is None:
            enabled = ["full"]
        result = set()
        for ts in enabled:
            result.update(resolve_toolset(ts))
        result -= disabled
        return result

    def _check_tool_available(self, tool_name: str) -> bool:
        """Check tool availability via check_fn with TTL cache."""
        now = time.time()
        if tool_name in _tool_availability_cache:
            avail, ts = _tool_availability_cache[tool_name]
            if now - ts < _AVAILABILITY_TTL:
                return avail
            # Expired entry, remove it
            del _tool_availability_cache[tool_name]
        tool = self.tools.get(tool_name)
        if tool is None:
            return False
        # Check if tool has a check_fn
        check_fn = getattr(tool, 'check_fn', None)
        if check_fn is None:
            return True  # No check_fn = always available
        try:
            avail = check_fn()
            if asyncio.iscoroutine(avail):
                avail = asyncio.get_event_loop().run_until_complete(avail)
        except Exception:
            avail = False
        _tool_availability_cache[tool_name] = (avail, now)
        return avail

    def get_tools_by_toolset(self, toolset: str) -> List[str]:
        """Get all tools in a specific toolset."""
        return self.toolsets.get(toolset, [])

    def get_tools_by_category(self, category: ToolCategory) -> List[str]:
        """Get all tools in a specific category."""
        return self.categories.get(category, [])

    def get_tool_schema(self, tool_name: str) -> Optional[Dict]:
        """Get OpenAPI schema for a tool."""
        if tool_name not in self.tools:
            return None
        return self.tools[tool_name].get_schema()

    def list_tools(self) -> List[str]:
        """List all registered tool names."""
        return list(self.tools.keys())

    def get_tool(self, tool_name: str) -> Optional[BaseTool]:
        """Get a specific tool instance."""
        return self.tools.get(tool_name)

    async def load_tools_from_module(self, module_path: str) -> int:
        """
        Load tools from a Python module.

        Args:
            module_path: Path to Python module containing tool definitions

        Returns:
            Number of tools loaded
        """
        # Placeholder for dynamic tool loading
        self.logger.info(f"从模块加载工具：{module_path}")
        return 0
