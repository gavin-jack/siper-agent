# Android 打包与本地构建指南（v20260528 更新）

## 架构决策：纯 WebView + Chaquopy（v20260528+）

**放弃 Capacitor npm 依赖**，改用纯 WebView + Java Chaquopy。
原因：Capacitor Android 库在 Maven 中央仓库不可达，npm 安装依赖网络。

## 关键陷阱

### 1. openai SDK → httpx（必须）

`openai` SDK 依赖 `jiter`（Rust 编译），Chaquopy 无预编译包。
用 `httpx` 重写 `llm_client.py`，保持相同返回格式。
**必须同步修改两个副本**：开发版 + APK 打包版。

### 2. Gradle Wrapper jar 缺失

当 GitHub raw 不可达时，wrapper jar 无法下载。
**解决**：直接用本地 gradle 二进制：
```bash
export GRADLE_HOME=~/.gradle/wrapper/dists/gradle-8.14.3-all/<hash>/gradle-8.14.3
gradle assembleDebug --no-daemon
```

### 3. Kotlin 版本冲突

`kotlin-stdlib-1.8.22` 与 `kotlin-stdlib-jdk8-1.6.0` 重复类。
修复：`configurations.all { resolutionStrategy { force 'org.jetbrains.kotlin:kotlin-stdlib:1.8.22' } }`

### 4. Python 文件完整性

- 所有 Python 文件必须在 `assets/public/` 下
- **清理 `__pycache__`**：旧 .pyc 导致兼容性问题
- 验证：`python3 -c "import zipfile; z=zipfile.ZipFile('app-debug.apk'); [print(n) for n in z.namelist() if n.endswith('.py')]"`

### 5. Java MainActivity 必须

1. `Python.start(new AndroidPlatform(this))`
2. 后台线程调用 `siper_main.start()`
3. 轮询 `http://127.0.0.1:9724/` 确认就绪
4. `webView.loadUrl("file:///android_asset/public/index.html")`

### 6. 前端路径

APK 内扁平结构：`style.css`（非 `static/style.css`）

### 7. Assets 目录只读问题（v20260528b+，关键！）

**APK 的 `assets/` 目录是只读的**，Python 无法在其中创建文件（settings.json、agents 目录、sessions.db 等）。

**症状**：Python 后端启动后立即崩溃，或 API 返回 500，日志显示 `PermissionError` 或 `FileNotFoundError`。

**修复方案**：在 Java `MainActivity.onCreate()` 中，启动 Python 之前先将所有 assets 复制到内部存储：

```java
// 复制 assets 到可写的内部存储
private void copyAssetsRecursive(String assetPath, String destPath) {
    try {
        String[] items = getAssets().list(assetPath);
        if (items == null || items.length == 0) {
            // 文件
            File outFile = new File(destPath);
            outFile.getParentFile().mkdirs();
            try (InputStream is = getAssets().open(assetPath);
                 FileOutputStream fos = new FileOutputStream(outFile)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) fos.write(buf, 0, n);
            }
        } else {
            // 目录
            new File(destPath).mkdirs();
            for (String item : items) {
                copyAssetsRecursive(assetPath + "/" + item, destPath + "/" + item);
            }
        }
    } catch (Exception e) {
        Log.e(TAG, "Copy failed: " + assetPath, e);
    }
}

// 在 onCreate 中调用
String filesDir = getFilesDir().getAbsolutePath();
copyAssetsRecursive("public", filesDir);

// 设置 Python 工作目录
Python py = Python.getInstance();
py.getModule("os").callAttr("chdir", filesDir);
py.getModule("sys").callAttr("path").insert(0, filesDir);
```

**`siper_main.py` 简化**：因为 Java 端已处理文件复制和 cwd 设置，`siper_main.py` 只需要：
```python
def start(port=9724):
    siper_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'siper_web.py')
    _siper_proc = subprocess.Popen([sys.executable, siper_script, str(port)], cwd=os.path.dirname(siper_script))
    return {'success': True, 'pid': _siper_proc.pid}
```

### 8. webui/task_manager.py 必须包含

`siper_web.py` 依赖 `webui.task_manager`，但 `task_manager.py` 不会自动从 assets 复制（它是被 import 的，不是通过文件路径）。
**必须确保** `webui/__init__.py` 和 `webui/task_manager.py` 也在 `assets/public/` 下。

### 9. Python stdout/stderr 重定向到 logcat（v20260528c+）

Chaquopy 中 Python 的 print/print(stderr) 默认不输出到 logcat。需要自定义 OutputStream：

```java
private static class PythonOutputStream extends java.io.OutputStream {
    private final int priority;
    private final String tag;
    private final StringBuilder buffer = new StringBuilder();

    PythonOutputStream(int priority, String tag) {
        this.priority = priority;
        this.tag = tag;
    }

    @Override
    public void write(int b) throws IOException {
        if (b == '\n') {
            Log.println(priority, tag, "[Python] " + buffer.toString());
            buffer.setLength(0);
        } else {
            buffer.append((char) b);
        }
    }
}

// 在启动 Python 前设置
py.getModule("sys").put("stdout", new PythonOutputStream(Log.DEBUG, TAG));
py.getModule("sys").put("stderr", new PythonOutputStream(Log.ERROR, TAG));
```

**注意**：`sys.stdout` 和 `sys.stderr` 必须用 `py.getModule("sys").put()` 而非 `callAttr()`。

### 10. siper_main.py 子进程启动 + stderr 捕获（v20260528c+）

`siper_main.py` 用 `subprocess.Popen` 启动 `siper_web.py`，必须捕获子进程的 stderr 以便调试启动失败：

```python
_siper_proc = subprocess.Popen(
    [sys.executable, siper_script, str(port)],
    cwd=files_dir,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)

time.sleep(3)

# 检查子进程是否还在运行
if _siper_proc.poll() is not None:
    stderr = _siper_proc.stderr.read().decode('utf-8', errors='replace')
    # stderr 包含 Python 异常 traceback，是调试启动失败的关键
```

### 11. settings.json 必须在 assets 中（v20260528c+）

`siper_web.py` 启动时读取 `settings.json`（通过 `Path(__file__).parent / 'settings.json'`）。
如果缺少此文件，后端会崩溃。**必须从开发环境复制到 `assets/public/`**：

```bash
cp ~/.siper/settings.json ~/siper-mobile/android/app/src/main/assets/public/
```

### 12. waitForBackend 模式（v20260528c+）

Java 端启动 Python 后，必须轮询 HTTP 确认后端就绪后再加载 WebView：

```java
private boolean waitForBackend(int maxSeconds) {
    for (int i = 0; i < maxSeconds; i++) {
        try {
            Thread.sleep(1000);
            HttpURLConnection conn = (HttpURLConnection) new URL("http://127.0.0.1:9724/").openConnection();
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);
            conn.connect();
            int code = conn.getResponseCode();
            conn.disconnect();
            if (code < 500) return true;
        } catch (Exception e) { /* not ready */ }
    }
    return false;
}
```

### 13. 前端后端状态指示器（v20260528c+）

core.js 的 `startMobileBackend()` 在页面上显示后端启动状态：
- 状态文本：`后端启动中...` → `已连接` / `后端启动失败`
- 状态点颜色：黄色 → 绿色（pulse 动画）/ 红色
- 失败时弹出 toast：`后端启动失败，请重启应用`

## 调试清单

1. CSS 错乱 → index.html 路径
2. 按钮不工作 → Python 后端 + llm_client.py httpx
3. 构建失败 → Kotlin 冲突 + Gradle wrapper
4. 崩溃 → __pycache__ + Python 文件完整性
5. **API 500 / 后端无响应** → **assets 只读问题**（检查是否复制到内部存储）
6. **fetch failed to fetch** → **后端未启动**（检查 logcat `[Python]` 输出 + `siper_main` 日志）
7. **后端启动失败** → 检查 `settings.json` 是否存在 + Python 文件完整性
