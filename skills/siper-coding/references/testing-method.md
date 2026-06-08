# Siper Web UI 测试方法

## 不要用 Headless 浏览器截图

Siper 是纯客户端 SPA，所有内容靠 JS 动态渲染（WebSocket → 消息渲染）。
Headless 浏览器（`browser_navigate`/`browser_snapshot`/`browser_vision`）会产生 JS 异常，
snapshot 看不到消息区域，截图只有 3KB 空白。**不要用 browser_vision 截图验证 Siper UI。**

## 正确的验证方式

### 1. 服务可用性
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:7240/
# 期望: 200
```

### 2. API 功能验证
```bash
# 会话列表
curl -s http://localhost:7240/api/sessions
# 期望: JSON 数组

# 头像服务
curl -s -o /dev/null -w "%{http_code}" http://localhost:7240/api/avatar
# 期望: 200
```

### 3. 静态文件验证
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:7240/static/style.css
curl -s -o /dev/null -w "%{http_code}" http://localhost:7240/static/pages/core.js
curl -s -o /dev/null -w "%{http_code}" http://localhost:7240/static/pages/page-chat.js
# 期望: 全部 200
```

### 4. JS 语法验证
```bash
node -c web/static/pages/core.js
node -c web/static/pages/page-chat.js
# 期望: 无输出（语法OK）
```

### 5. 安全验证
```bash
# 路径遍历应返回 404
curl -s -o /dev/null -w "%{http_code}" http://localhost:7240/static/../etc/passwd
curl -s -o /dev/null -w "%{http_code}" "http://localhost:7240/static/%2e%2e/etc/passwd"
# 期望: 404
```

### 6. 真实 UI 验证

**必须在真实浏览器中验证**：在 Windows 端打开 http://localhost:7240/ 检查：
- 页面正常加载（青绿色主题）
- 侧边栏导航可点击切换
- 发送消息后 Agent 正常回复
- 消息布局正确（头像位置、操作栏、气泡样式）
- 无浏览器控制台 JS 错误
