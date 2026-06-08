# 从 siper_web.py 提取模块指南

## 背景

siper_web.py 是单体文件（~2155行），当需要提取独立类到 `web/` 目录时，必须避免循环导入。

## 循环导入问题

```
siper_web.py → from web.task_manager import TaskManager
task_manager.py → from siper_web import agent  # ← 循环！
```

## 解决方案：参数注入模式

### 1. 构造函数注入不可变依赖

```python
# web/task_manager.py
class TaskManager:
    def __init__(self, data_dir=None, project_root=None):
        root = Path(project_root) if project_root else Path.cwd()
        self.data_dir = Path(data_dir or (root / "data"))
```

```python
# siper_web.py
task_manager = TaskManager(project_root=str(PROJECT_ROOT))
```

### 2. setter 方法注入运行时依赖

```python
# web/task_manager.py
class TaskManager:
    def __init__(self, ...):
        self._agent = None  # 延迟注入

    def set_agent(self, agent):
        """Set the agent reference for task execution."""
        self._agent = agent

    async def _execute_task(self, task, lt):
        if self._agent is None:
            logger.warning("agent 未设置，跳过执行")
            return
        result = await self._agent.process_message(...)
```

```python
# siper_web.py (in main())
task_manager = TaskManager(project_root=str(PROJECT_ROOT))
task_manager.set_agent(agent)  # 注入运行时引用
```

### 3. 辅助函数跟随主类一起提取

如果辅助函数（如 `_cron_matches`、`_next_cron_run`）只被 TaskManager 使用，一起提取到同一文件：

```python
# web/task_manager.py
def _cron_matches(cron_expr, lt):  # 模块私有
    ...

def _next_cron_run(cron_expr, after_t):
    ...

class TaskManager:
    # 直接使用同模块的辅助函数
```

## 提取检查清单

- [ ] 被提取模块不 `import siper_web`
- [ ] 不可变配置通过构造函数参数传入（project_root, data_dir 等）
- [ ] 运行时引用通过 setter 方法注入（agent, session_manager 等）
- [ ] 仅被该类使用的辅助函数一起提取
- [ ] 辅助函数用 `_` 前缀标记为模块私有
- [ ] siper_web.py 顶部添加 `from web.xxx import XxxClass`
- [ ] 实例化代码更新：传入 project_root，调用 set_agent()
- [ ] 语法检查：`python3 -m py_compile web/xxx.py`
- [ ] 服务重启验证：HTTP 200 + 日志无 ERROR

## 已提取模块

| 模块 | 行数 | 提取内容 | 依赖注入方式 |
|------|------|----------|-------------|
| web/task_manager.py | ~270 | TaskManager + _cron_matches + _next_cron_run | project_root 参数 + set_agent() |

## 不应该提取的内容

- `api_*` 函数：依赖 main() 内大量闭包变量（agent, task_manager, _log_buffer 等），提取成本太高
- `handle_request`：路由分发逻辑，与 HTTP 服务器紧耦合
- `ws_handler`：WebSocket 连接处理，与 WS 服务器紧耦合
- `MemoryLogHandler`：只在 siper_web.py 中使用
