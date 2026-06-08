# renderMarkdown "无限循环" 非 Bug 验证 + 模型切换链路确认

## renderMarkdown 无限循环问题（2026-08-08 调查结论）

### 结论：非 Bug

用户报告的"长内容导致页面卡死"不是 renderMarkdown 无限循环。

### 验证方法

用 Node.js 沙箱加载真实的 core.js，传入用户实际文本（714字符，35行，含多表格/标题）：

```javascript
// 复制 renderMarkdown 核心循环，添加迭代上限 200 次
let i = 0, _iterCount = 0;
while (i < lines.length) {
  _iterCount++;
  if (_iterCount > 200) { console.log('SAFETY STOP'); break; }
  // ... 循环体
}
```

**结果：4ms，13 children，无超时。**

### 根因

用户的"长内容"只是 LLM 回复本身就很长（多个大表格），渲染时间正常。现有的 5000 次安全计数器完全足够。

### 经验

当用户报告"页面卡死/无限循环"时：
1. 先用 Node.js 模拟验证（不用 browser，避免 CDP 超时干扰判断）
2. 用实际文本测试，不要构造假数据
3. 如果 Node.js 测试通过，问题可能在其他地方（如 session history 同步渲染阻塞主线程）

---

## 模型切换链路验证（2026-08-08 确认）

### 结论：链路完整正确

完整调用链：

```
前端 sendMessage()
  → msgPayload.model = currentModel  // page-chat.js
  → WS send(JSON.stringify(msgPayload))

后端 _process_ws_message()
  → selected_model = data.get("model")  // siper_web.py
  → agent.process_message(model=selected_model)  // agent.py
  → if model != cur_model:
      _find_model_in_global(model)  # 从 models.json 查找完整配置
      configure_llm(api_key=..., base_url=..., model=...)  # 重建 LLMClient
```

### 验证方法

1. `read_file` 检查 `page-chat.js` 中 `sendMessage()` 是否发送 `model` 字段
2. `read_file` 检查 `siper_web.py` 中 `_process_ws_message` 是否提取 `model`
3. `read_file` 检查 `agent.py` 中 `process_message` 是否传 `model` 参数
4. `read_file` 检查 `_find_model_in_global` 和 `configure_lll` 是否正确调用

### 经验

怀疑模型切换不工作时，按此链路逐层检查，不要假设前端或后端有 bug。
