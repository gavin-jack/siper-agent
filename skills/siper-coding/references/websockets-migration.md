# websockets 16.x API 迁移记录

## 背景

websockets 16.0 将旧 API (`websockets.server.*`) 标记为废弃，新 API 位于 `websockets.asyncio.*`。

## 废弃对照表

| 旧 API (废弃) | 新 API | 备注 |
|---|---|---|
| `websockets.server.serve()` | `websockets.asyncio.server.serve()` | 入口函数 |
| `websockets.server.WebSocketServerProtocol` | `websockets.asyncio.server.ServerProtocol` | 注意名字变了 |
| `websockets.server.WebSocketServer` | `websockets.asyncio.server.Server` | 返回的 server 对象 |

## 关键陷阱

1. **`WebSocketServerProtocol` 不在 `websockets.asyncio.server` 中** — 尝试 `from websockets.asyncio.server import WebSocketServerProtocol` 会报 `ImportError`。正确名称是 `ServerProtocol`。

2. **execute_code 用的 Python 不是 venv 的** — 在 WSL2 hermes agent 中，`execute_code` 执行 Python 时可能用系统 Python 而非 hermes venv。验证 venv 包时必须显式指定路径：
   ```bash
   /home/gavin/.hermes/hermes-agent/venv/bin/python3 -c "import websockets; print(websockets.__version__)"
   ```

3. **类型注解可直接去掉** — ws_handler 的参数类型注解 `ws: WebSocketServerProtocol` 只是给 IDE 看的，去掉不影响运行。如果要用新 API 的类，注意 import 路径变化。

## 实际修复 (2026-05-14, commit 27d47d1)

```python
# 文件顶部（L9 附近）
import websockets
from websockets.asyncio.server import serve as ws_serve

# main() 内部调用处
ws_server = await ws_serve(ws_handler, "0.0.0.0", ws_port, max_size=10 * 1024 * 1024)

# ws_handler 定义（去掉类型注解）
async def ws_handler(ws):
    ...
```

同时删除了原来在 main() 内部的延迟导入块（L730-735）：
```python
# 已删除
try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    logger.error("websockets 未安装...")
    sys.exit(1)
```
