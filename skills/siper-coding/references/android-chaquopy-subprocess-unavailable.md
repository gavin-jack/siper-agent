# Chaquopy 上 subprocess 不可用

## 问题

Android Chaquopy 环境中 `subprocess` 模块不可用。`siper_main.py` 用 `subprocess.Popen` 启动 `siper_web.py` 会失败。

## 症状

- 子进程立即退出或无法创建
- 前端所有 `/api/*` 请求返回 `failed to fetch`
- logcat 中无 Python 输出

## 解决方案

**用 threading + asyncio 在同一进程内启动 siper_web，禁止用 subprocess。**

```python
def start(host='127.0.0.1', port=9724):
    files_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(files_dir)
    sys.path.insert(0, files_dir)

    def _run():
        import asyncio
        sys.argv = ['siper_web.py', str(port)]
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(siper_web.main())

    _siper_thread = threading.Thread(target=_run, daemon=True)
    _siper_thread.start()
```

关键点：daemon=True、new_event_loop()、覆盖 sys.argv、os.chdir(files_dir)。

## 调试

```bash
adb logcat -s SiPer:D
```

确保 Java 端已将 Python stdout/stderr 重定向到 logcat（PythonOutputStream）。

## 参见

- `references/android-packaging-guide.md`
- `references/android-fetch-retry-pattern.md`
