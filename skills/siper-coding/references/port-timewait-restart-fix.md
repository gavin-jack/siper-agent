# 端口 TIME_WAIT 导致启动失败修复（v0.6.24）

## 现象
SiPer 重启时（尤其是快速重启），报错：
```
端口 9725 已被占用，请更换端口或停止占用进程
```
即使旧进程已被杀死，端口仍处于 TIME_WAIT 状态（TCP 协议的正常行为）。

## 根因
`siper_web.py` 的端口预检逻辑（`__main__` 块中）调用 `_is_port_in_use()` 检测端口。虽然该函数已设置 `SO_REUSEADDR`，但 `_kill_port_user()` 杀进程后如果端口仍在 TIME_WAIT，`_is_port_in_use()` 返回 True，导致 `sys.exit(1)`。

## 修复（两处）

### 1. 端口检测加 SO_REUSEADDR（已有，确认）
`_is_port_in_use()` 中已有：
```python
_s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
```

### 2. asyncio.start_server 端口检测也加 SO_REUSEADDR
`main()` 函数内的端口检测循环：
```python
for _test_port in [port, ws_port]:
    _s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    _s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # 新增
    try:
        _s.bind(("0.0.0.0", _test_port))
    ...
```

### 3. _kill_port_user 失败时不退出，等待后继续
```python
for _port in (9724, 9725):
    if _is_port_in_use(_port):
        print(f"\n⚠ 端口 {_port} 已被占用，尝试终止旧进程...")
        if not _kill_port_user(_port):
            # TIME_WAIT 状态不阻止启动，SO_REUSEADDR 允许绑定
            print(f"⚠ 端口 {_port} 可能处于 TIME_WAIT 状态，将继续启动...")
            import time
            time.sleep(2)
```

## 验证
重启后 `ss -tlnp | grep -E '9724|9725'` 应显示两个端口都在监听。

## 注意
- `fuser -k <port>/tcp` 可以强制释放 TIME_WAIT 状态的端口
- 如果 fuser 不可用（安全策略拦截），等待 2 分钟 TIME_WAIT 自然过期
