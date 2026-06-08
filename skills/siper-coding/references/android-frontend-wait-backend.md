# 前端页面等待后端就绪模式

## 问题

Android APK 启动时，Java MainActivity 在后台线程启动 Python 后端，但前端 HTML/JS 在 WebView 加载时立即执行 DOMContentLoaded 回调。此时后端可能还没启动，导致 fetch 返回 `failed to fetch`。

## 解决方案

### 1. Java 端：后端就绪后再加载 WebView

```java
// MainActivity.java
new Thread(() -> {
    Python py = Python.getInstance();
    py.getModule("siper_main").callAttr("start");
    
    // 轮询等待后端就绪
    boolean ready = waitForBackend(20); // 最多 20 秒
    
    handler.post(() -> {
        webView.loadUrl("file:///android_asset/public/index.html");
    });
}).start();
```

### 2. 前端 core.js：暴露后端就绪状态

```javascript
// core.js
window._siperBackendReady = false;

async function startMobileBackend() {
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const r = await fetch('http://127.0.0.1:9724/', 
                { signal: AbortSignal.timeout(2000) });
            if (r.ok || r.status < 500) {
                window._siperBackendReady = true;
                document.dispatchEvent(new Event('siper-backend-ready'));
                return true;
            }
        } catch(e) {}
    }
    return false;
}
```

### 3. 各页面：等待后端就绪后再 fetch

```javascript
// page-logs.js（和其他需要在加载时 fetch 的页面）
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window._siperBackendReady !== 'undefined') {
        // Mobile: wait for backend
        if (window._siperBackendReady) {
            refreshLogs();
        } else {
            document.addEventListener('siper-backend-ready', () => {
                refreshLogs();
            }, { once: true });
            // Fallback: retry after 5s
            setTimeout(() => refreshLogs(), 5000);
        }
    } else {
        // Desktop: load immediately
        refreshLogs();
    }
});
```

## 适用页面

- `page-logs.js` — `refreshLogs()` 在 DOMContentLoaded 时调用
- `page-settings.js` — `refreshGlobalSettings()` 在 DOMContentLoaded 时调用
- 其他在页面加载时需要调用 `/api/*` 的页面

## 注意

- 不要用 `loadAvailableModels()` 等函数在 DOMContentLoaded 时直接调用
- 如果函数被用户操作触发（如点击按钮），则不需要等待
