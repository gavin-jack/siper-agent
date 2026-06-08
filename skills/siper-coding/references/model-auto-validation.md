# 模型自动验证模式（v0.9.87j+）

## 功能概述

添加模型时自动发测试消息验证模型可用性，前端显示验证状态（✅/❌/⏳）和延迟。

## 后端实现

### POST /api/models/test 端点

位置：siper_web.py，在 api_discover_models 之后、Token Stats API 之前

请求体：`{"base_url": "...", "api_key": "...", "model": "..."}`

成功响应：`{"success": true, "response": "OK", "latency_ms": 1234}`
失败响应：`{"success": false, "error": "HTTP Error 401"}`

实现要点：
- 使用 urllib（非流式），测试消息 `"Reply with exactly: OK"`，max_tokens=5，temperature=0
- 超时 15 秒，捕获所有异常返回 success: false
- 记录延迟（ms）
- base_url 以 /v1 结尾时直接用，否则自动拼接 /v1/chat/completions
- SSL 验证关闭（ctx.verify_mode = ssl.CERT_NONE）

## 前端实现

### 验证状态存储

每个模型对象上附加字段：
- `_verified`: true(通过) / false(失败) / null(未验证)
- `_latency`: 延迟毫秒数
- `_error`: 错误信息

### 自动发现后验证

`discoverModels()` 发现模型后：
1. 初始化所有模型 `_verified = null`
2. `renderDiscoveredModels()` 渲染卡片，每个卡片有 `<span id="verify-{safeId}">⏳</span>` 和 `<span id="latency-{safeId}">`
3. `verifyAllModels()` 并发验证（最大 5 并发），完成后调用 `updateVerifyStatus()` 更新 DOM

### 手动添加验证

`addModelToSettings()` 改为 async：
1. 填写 base_url + api_key 时自动发验证请求
2. 验证失败弹出 showConfirm 询问是否仍要添加
3. 无论验证结果如何都允许添加（只是标记状态）

### 全部添加

`addAllDiscoveredModels()` 跳过 `_verified === false` 的模型，toast 提示跳过数量。

### 模型卡片验证图标

`renderSettingsModelsList()` 在已添加模型卡片中显示：
- ✅ 绿色（tooltip 显示延迟）
- ❌ 红色（tooltip 显示错误）
- 空（未验证/null）

### 5. 自动验证导致页面卡住 — 改为手动验证（v0.9.87m 新增）

**问题**：发现模型后自动逐个验证，每个模型发 POST 请求（timeout=15s），导致页面长时间无响应。即使用 `asyncio.to_thread()` 异步化后端，前端并发 5 个请求仍会占用大量资源，且用户可能不需要验证所有模型。

**正确方案**：
1. **发现模型后只展示列表，不自动验证** — 删除 `discoverModels()` 中调用 `verifyAllModels()` 的代码
2. **已添加模型卡片加验证按钮** — 每个模型卡片显示 🔍 按钮，点击才发验证请求
3. **手动添加时不自动验证** — 直接添加，不阻塞 UI
4. **删除 `verifyAllModels()` 和 `updateVerifyStatus()` 函数** — 不再需要

**用户体验流程**：
- 用户点击"获取模型列表" → 立即显示模型列表（无验证状态）
- 用户点击"添加"或"全部添加" → 直接添加，不验证
- 用户想验证某个模型 → 点击模型卡片上的 🔍 按钮 → toast 显示验证结果

**诊断"添加模型卡住"**：
1. 检查 `addModelToSettings()` 是否引用了不存在的 DOM 元素（`getElementById` 返回 null）
2. 检查 `api_test_model` 是否异步化（同步阻塞会卡住事件循环）
3. 检查是否在发现模型后自动验证（并发请求导致卡顿）

## 关键陷阱汇总

### 1. HTML 表单元素必须存在（v0.9.87k 修复）

`addModelToSettings()` 引用了 `newModelName`/`newModelBaseUrl`/`newModelApiKey` 等 DOM 元素，但 index.html 中**没有这些表单元素**。函数被调用时 `getElementById` 返回 null，`.trim()` 报错导致卡住。

**修复**：在 index.html 全局设置页面的"手动添加模型"区域添加对应的 input 元素。

**诊断方法**：
```js
// browser_console 中检查
document.getElementById('newModelName')  // 返回 null = 元素不存在
typeof addModelToSettings               // 'function' = 函数存在
```

**通用规则**：新增 JS 函数引用 DOM 元素前，必须先在 index.html 中添加对应元素。

### 2. toast.info() 方法已存在

toast 对象有 `info()` 方法（core.js 第 1301 行），不需要额外添加。调用前无需检查。

### 3. 验证超时可能感觉"卡住"

验证请求超时 15 秒。如果 API 响应慢，用户可能感觉卡住。当前实现：
- 发现模型后自动验证，用户可看到 ⏳ 状态
- 手动添加时验证是 async 的，不阻塞 UI
- **后端已异步化**（v0.9.87l），不再阻塞事件循环

### 4. 同步阻塞调用阻塞整个事件循环（v0.9.87l 新增）

即使前端是 async 的，如果后端 API 是同步阻塞的，仍会导致整个 HTTP 服务器无响应。症状：验证模型时所有页面操作卡住。

**诊断**：`curl -X POST /api/models/test` 发起一个到不可达地址的请求，然后尝试访问其他 API，如果其他 API 也无响应 = 后端阻塞。

**修复**：用 `asyncio.to_thread()` 包装阻塞调用。在 `async def handle_request` 中，任何可能阻塞的操作（urllib、文件 I/O、sleep）必须用 `asyncio.to_thread()` 包装或改用异步库：

```python
async def api_test_model(body):
    # ... 参数解析 ...
    def _do_test():
        # 同步阻塞的 urllib 调用
        return {"success": True, "response": content.strip(), "latency_ms": latency_ms}
    try:
        return await asyncio.to_thread(_do_test)
    except Exception as e:
        return {"success": False, "error": str(e)}
```

路由调用处同步加 `await`：
```python
resp = await api_test_model(body)
```

## i18n Key

core.js 三语中添加 `toast.verifyFailed`：
- zh: '模型验证失败'
- en: 'Model verification failed'
- tw: '模型驗證失敗'

## 路由注册

siper_web.py 路由表中添加：
```python
elif path == "/api/models/test" and method == "POST":
    resp = api_test_model(body)
```

## 验证命令

```bash
# 测试端点（无效 key 应返回 401）
curl -s -X POST http://localhost:9724/api/models/test \
  -H 'Content-Type: application/json' \
  -d '{"base_url":"https://api.longcat.chat/openai","api_key":"test","model":"LongCat-2.0-Preview"}'
# 预期：{"success":false,"error":"HTTP Error 401: Unauthorized"}

# 检查 JS 语法
node -c webui/static/pages/page-settings.js
node -c webui/static/pages/core.js
```
