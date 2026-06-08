# 工具注册常见错误及修复

## 错误 1：WebFetchTool 缺少 execute 方法声明

**错误日志**：
```
tool_registry - ERROR - 实例化工具 WebFetchTool 失败：Can't instantiate abstract class WebFetchTool without an implementation for abstract method 'execute'
```

**根因**：子代理在 `check_fn` 方法后直接写了 `execute` 的方法体，忘记写 `async def execute(self, parameters) -> ToolResult:` 声明行。Python 将 `execute` 的代码块解析为 `check_fn` 的内部代码。

**错误代码**：
```python
    def check_fn(self):
        ...
        except Exception:
            return False
        url = parameters.get("url", "")  # ← 这行应该是 execute 的第一行，但缺少 def 声明
```

**修复**：在 `check_fn` 和 `execute` 之间补上正确的声明：
```python
    def check_fn(self):
        ...
        except Exception:
            return False

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        url = parameters.get("url", "")
```

## 错误 2：ExecuteCommandTool timeout 参数

**错误日志**：
```
tool_registry - ERROR - 实例化工具 ExecuteCommandTool 失败：BaseTool.__init__() got an unexpected keyword argument 'timeout'
```

**根因**：`BaseTool.__init__()` 的签名是 `(name, description, schema, toolsets, category)`，不接受 `timeout` 参数。

**错误代码**：
```python
        super().__init__(
            name="execute_command",
            ...
            timeout=30,  # ← BaseTool 不接受此参数
        )
```

**修复**：在 `super().__init__()` 之后设置实例属性：
```python
        super().__init__(
            name="execute_command",
            ...
        )
        self._timeout = 30
```

然后在 `execute` 方法中使用 `self._timeout`。

## 验证方法

启动服务后检查日志，确认 8 个工具全部注册成功：
```
自注册完成：8 个工具 (execute_command, list_dir, memory, read_file, search_files, web_fetch, web_search, write_file)
```

如果有工具注册失败，日志中会有 `ERROR - 实例化工具 XXX 失败` 行，必须修复后才能正常使用。
