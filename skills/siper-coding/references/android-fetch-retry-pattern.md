# Android 前端 fetch 时序与重试模式

## 问题：前端 fetch 时后端还未就绪

APK 启动时序：
1. Java `MainActivity.onCreate` → 复制 assets 到内部存储（~1s）
2. 初始化 Chaquopy（~2s）
3. 后台线程调用 `siper_main.start()` → 启动 Python 子进程（~2s）
4. Python `siper_web.py` 启动 HTTP 服务器（~3s）
5. 总计：~8-10 秒

但前端 HTML/JS 在 WebView 加载完成后立即执行 `DOMContentLoaded`，此时步骤 1-5 可能还在进行。表现为 `fetch('/api/models/global')` 返回 `failed to fetch`。

## 解决方案：所有 DOMContentLoaded fetch 必须加重试

```javascript
async function loadAvailableModels(retryCount) {
  retryCount = retryCount || 0;
  try {
    const r = await fetch('/api/models/global');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
  } catch (e) {
    if (retryCount < 10) {
      setTimeout(() => loadAvailableModels(retryCount + 1), 2000);
    }
  }
}
```

**关键规则**：
- 重试次数参数必须通过函数参数传递（不能用闭包变量）
- 最多重试 10 次，每次间隔 2 秒
- 必须检查 `r.ok`（HTTP 2xx），不能只靠 catch
- patch 后必须 `node -c <file>` 验证语法

## 受影响函数

| 文件 | 函数 | 触发时机 |
|------|------|----------|
| page-chat.js | loadAvailableModels() | DOMContentLoaded |
| main.js | checkModelConfig() | 页面初始化 |
| page-settings.js | loadSettingsModels() | 切换到 models tab |

## 相关陷阱

### page-settings.js patch 大括号重复

当 patch 在 catch 块末尾添加重试逻辑时，patch 工具可能在 `}` 后面再添加一个 `}`，导致 `}}` 重复。patch 后必须 `node -c page-settings.js` 验证。

### APK Python 文件完整性验证

构建 APK 后验证：检查 assets/public/ 下所有 .py 文件是否存在。必须包含：siper_web.py、siper_main.py、ai_agent/ 全部 .py、webui/task_manager.py、skills/*.py。构建前必须 `rm -rf __pycache__` 避免旧 .pyc 兼容问题。

### Android 诊断页面 diag.html

调试 APK 时，可在 assets/public/ 下创建 diag.html，包含多个 fetch 测试按钮（/api/version、/api/models/global、/api/config），通过 file:///android_asset/public/diag.html 在 WebView 中访问。