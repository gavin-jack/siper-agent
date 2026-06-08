# Web UI 交互式调试方法

## 问题场景

用户报告"消息发送后不显示"、"页面功能异常"等问题时，需要用浏览器工具进行端到端验证。

## 核心原则

**不要依赖截图/快照验证功能**。Siper 是纯客户端 SPA，`browser_snapshot` 和 `browser_vision` 经常看不到动态渲染的内容。**用 `browser_console` 的 expression 功能直接检查运行时状态。**

## 调试步骤

### 1. 检查 WebSocket 连接状态

```javascript
// 浏览器控制台 expression
ws && ws.readyState === WebSocket.OPEN ? 'WS 已连接' : 'WS 未连接, readyState=' + (ws ? ws.readyState : 'ws is undefined')
```

期望返回: `"WS 已连接"`

### 2. 检查关键函数是否已定义

```javascript
// 检查消息渲染函数
typeof addMsg        // 应返回 "function"
typeof sendMessage   // 应返回 "function"
typeof addMsgHtml    // 应返回 "function"
```

如果返回 `"undefined"` 但函数确实在文件中定义，说明该 JS 文件因 SyntaxError 执行失败。

### 3. 检查消息区域内容

```javascript
// 查看当前聊天消息
document.getElementById('chatMessages').innerHTML

// 查看消息数量
document.querySelectorAll('#chatMessages .msg-row').length
```

### 4. 模拟用户发送消息（端到端验证）

当用户报告"消息不显示"时，直接用浏览器工具模拟：

```
1. browser_type(ref=<输入框ref>, text="测试消息")
2. browser_press(key="Enter")
3. 等待 AI 回复（sleep 8）
4. browser_console(expression="document.getElementById('chatMessages').innerHTML")
```

如果消息正常显示，说明系统工作正常，问题可能是：
- 用户浏览器缓存了旧版 JS
- 用户操作时 WebSocket 尚未连接
- 特定消息内容触发了渲染 bug

### 5. 检查 JS 文件加载情况

```javascript
// 检查所有 script 标签是否加载
Array.from(document.querySelectorAll('script[src]')).map(s => s.src)

// 应返回所有 JS 文件 URL，数量应与 index.html 中 script 标签数量一致
```

### 6. 检查重复声明的变量（SyntaxError 排查）

```javascript
// 如果某个函数 typeof 为 undefined，强制加载文件查看具体错误
fetch('/static/pages/page-chat.js', {cache:'no-store'})
  .then(r => r.text())
  .then(t => { try { eval(t); } catch(e) { console.error(e); } })
```

## 常见诊断模式

| 症状 | 检查方法 | 可能原因 |
|------|---------|---------|
| 发送按钮无反应 | typeof sendMessage | JS 文件未加载或 SyntaxError |
| 消息不显示 | 检查 chatMessages.innerHTML | addMsg 未定义 / WS 未连接 |
| 页面空白 | 检查 ws.readyState | WebSocket 连接失败 |
| 样式错乱 | 检查 CSS 文件 HTTP 状态 | 静态文件未加载 / 缓存旧版 |
| 部分页面功能异常 | 检查对应 typeof pageFn | 该页面 JS 文件 SyntaxError |

## 注意事项

- 修改 webui/static/pages/*.js 后，用户需要硬刷新（Ctrl+Shift+R）清除缓存
- 修改 index.html 后必须重启服务（Jinja2 auto_reload 仅检测模板变更）
- 修改 .py 文件后必须重启服务
- 检查 typeof 比检查函数内部实现更快定位问题
