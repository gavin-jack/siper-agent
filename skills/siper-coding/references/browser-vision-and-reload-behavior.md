# Browser Tool Vision 区域限制与 SPA Reload 行为（v0.9.59+）

## Vision 区域限制

**现象**：`browser_vision` 调用时返回 403 错误：
```
Error code: 403 - {'error': {'message': 'This model is not available in your region.', 'code': 403}}
```

**但截图文件已成功保存到本地**：
- `screenshot_path` 字段包含有效路径
- 文件大小正常（约 40KB），说明截图本身没问题

**对策**：
1. **直接引用本地截图文件**：用 `MEDIA:<screenshot_path>` 在回复中嵌入截图
2. **让用户看截图**：把截图路径发给用户，让用户自己查看
3. **不要依赖 `browser_vision` 的分析结果**：在区域受限的环境中，vision 分析不可用

## SPA 页面 reload 后全局函数可用

**现象**：初始 `browser_navigate` 后，`browser_console` 中 `typeof renderMarkdown === 'undefined'`。但执行 `location.reload(true)` 后，再次检查 `typeof renderMarkdown === 'function'`。

**原因**：`browser_navigate` 加载 SPA 页面时，browser tool 的 JS 执行环境可能尚未完全初始化。`location.reload(true)` 强制重新加载后，JS 环境正确建立。

**正确流程**：
```
1. browser_navigate("http://localhost:9724")
2. browser_console: location.reload(true); "reloading"
3. 等待 2-3 秒
4. browser_console: typeof renderMarkdown + ' | ' + typeof window.markdownit
5. 确认都返回 "function" 后再进行后续 JS 测试
```

**注意**：即使 reload 后函数可用，这仍然只是 browser tool 的沙箱环境。用户浏览器中的行为可能不同，最终验证仍需用户硬刷新。

## 注入测试内容到页面

当需要验证 markdown 渲染效果时，可以注入测试 DOM：

```javascript
// browser_console 中执行（reload 后）
(function() {
  const test = "### 三级标题\n\n\`行内代码\` 和 **加粗**\n\n| 列1 | 列2 |\n|-----|-----|\n| a | b |\n\n- 列表1\n- 列表2";
  const frag = renderMarkdown(test);
  const d = document.createElement('div');
  d.className = 'msg-body';
  d.style.cssText = 'position:fixed;top:60px;left:20px;right:20px;bottom:20px;z-index:9999;background:#1e1e2e;padding:24px;overflow:auto;border:3px solid #ff6b6b;border-radius:8px;';
  d.appendChild(frag);
  const old = document.getElementById('md-test');
  if (old) old.remove();
  d.id = 'md-test';
  document.body.appendChild(d);
  return "done";
})()
```
