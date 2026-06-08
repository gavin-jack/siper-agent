# SiPer 工具架构参考

## 工具注册与执行流程

```
┌─────────────────────────────────────────────────────────┐
│  ToolRegistry.initialize()                              │
│  └─> 扫描 ai_agent/tools/*_tool.py                      │
│       └─> import 模块                                   │
│            └─> 查找 BaseTool 子类                        │
│                 └─> 实例化 + initialize()               │
│                      └─> register_tool()                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  AIAgent 调用工具                                       │
│  └─> registry.execute_tool(name, params)               │
│       └─> 速率限制检查                                  │
│            └─> 参数校验                                 │
│                 └─> asyncio.wait_for(tool.execute(),   │
│                                      timeout)          │
│                      └─> 返回 ToolResult                │
└─────────────────────────────────────────────────────────┘
```

## BaseTool 基类接口

```python
class BaseTool(ABC):
    def __init__(self, name, description, schema, toolsets, category):
        self.metadata = ToolMetadata(...)
        self.is_initialized = False

    @abstractmethod
    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        pass

    async def initialize(self, config: Dict[str, Any] = None) -> bool:
        """可选初始化，返回 False 表示初始化失败"""
        pass

    def check_fn(self) -> bool:
        """可选可用性检查，返回 False 时工具不可用"""
        pass

    def validate_parameters(self, parameters) -> bool:
        """根据 schema 校验参数"""
        pass
```

## ToolResult 结构

```python
@dataclass
class ToolResult:
    success: bool          # 执行是否成功
    data: Any = None       # 成功时的数据
    error: str = None      # 失败时的错误信息
    metadata: Dict = {}    # 附加元数据
    execution_time_ms: float = 0.0  # 执行耗时
```

## 工具元数据 (ToolMetadata)

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | str | 工具名称（如 `read_file`） |
| `description` | str | 工具描述（用于 LLM 工具选择） |
| `schema` | Dict | OpenAPI 兼容的参数 schema |
| `toolsets` | List[str] | 所属工具组（如 `["file", "core"]`） |
| `category` | ToolCategory | 分类（CORE/WEB/FILE/DATA/COMMUNICATION/UTILITY） |
| `rate_limit` | int | 每分钟请求数限制（默认 60） |
| `timeout` | int | 执行超时秒数（默认 30） |

## Toolsets 解析逻辑

```python
TOOLSETS = {
    "web": {"tools": ["web_search", "web_fetch"], "includes": []},
    "file": {"tools": ["read_file", "write_file", "search_files", "list_dir"], "includes": []},
    "terminal": {"tools": ["execute_command"], "includes": []},
    "memory": {"tools": ["memory"], "includes": []},
    "full": {"tools": [], "includes": ["web", "file", "terminal", "memory"]},
    "safe": {"tools": ["web_search", "web_fetch"], "includes": ["file", "memory"]},
}

def resolve_toolset(name):
    """递归展开嵌套包含，返回扁平工具列表"""
```

## SSRF 防护 (url_safety.py)

**阻止的地址类型**:
- 私有网段: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
- 链路本地: 169.254.0.0/16
- CGNAT: 100.64.0.0/10
- 回环: 127.0.0.0/8
- 云元数据: 169.254.169.254 (AWS/GCP/Azure/DO/Oracle)
- 特殊主机: `metadata.google.internal`, `metadata.goog`

**Fail-closed 策略**: DNS 解析失败时默认阻止请求

## 新增工具模板

创建 `ai_agent/tools/my_tool.py`:

```python
from typing import Dict, Any
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory

class MyTool(BaseTool):
    def __init__(self):
        super().__init__(
            name="my_tool",
            description="工具描述",
            schema={
                "type": "object",
                "properties": {
                    "param1": {"type": "string", "description": "参数1"}
                },
                "required": ["param1"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    def check_fn(self) -> bool:
        """可选：检查工具是否可用"""
        return True

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        try:
            # 实现逻辑
            result_data = {"key": "value"}
            return ToolResult(success=True, data=result_data)
        except Exception as e:
            return ToolResult(success=False, error=str(e))
```

## 陷阱与注意事项

1. **自动注册依赖文件名**: 必须以 `_tool.py` 结尾才能被扫描
2. **下划线前缀跳过**: `_echo_tool.py` 等不会被注册
3. **check_fn 同步执行**: `check_fn()` 是同步函数，如需异步检查请用 `asyncio.get_event_loop().run_until_complete()`
4. **参数校验**: `validate_parameters()` 使用 schema 的 `required` 字段，复杂校验需手动实现
5. **并发安全**: 工具实例是单例，`execute()` 必须是异步且线程安全