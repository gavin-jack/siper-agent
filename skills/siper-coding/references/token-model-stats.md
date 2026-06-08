# Token 统计模型维度分组

## 需求
Token 页面增加按模型维度的统计表格，展示每个模型的调用次数、prompt tokens、completion tokens、total tokens。

## 后端实现

### api_get_token_stats() 增加 model_stats

在 `siper_web.py` 的 `api_get_token_stats()` 中，按 model 字段分组聚合：

```python
# Per-model breakdown
model_map = {}
for h in history:
    m = h.get("model", "unknown")
    if m not in model_map:
        model_map[m] = {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    model_map[m]["requests"] += 1
    model_map[m]["prompt_tokens"] += h.get("prompt_tokens", 0)
    model_map[m]["completion_tokens"] += h.get("completion_tokens", 0)
    model_map[m]["total_tokens"] += h.get("total_tokens", 0)
model_stats = sorted(
    [{"model": k, **v} for k, v in model_map.items()],
    key=lambda x: -x["total_tokens"]
)
return {
    ...,
    "model_stats": model_stats,
}
```

**关键细节**：
- model 字段必须包含在 dict 中（`{"model": k, **v}`），不能只返回 values
- 按 total_tokens 降序排列

### model 字段补全

`agent.process_message()` 返回值不含 model 字段，`result.get("model", "")` 返回空字符串，导致历史记录中 model 为空。

修复：用 `selected_model`（从 WS 消息 data 中取的模型名）补全：
```python
"model": result.get("model") or selected_model or "",
```

## 前端实现

### HTML 新增模型统计表格

在"上下文窗口"卡片后、"最近请求"卡片前插入：

```html
<div class="card mt-12">
  <div class="card-title" data-i18n="token.modelStats">模型统计</div>
  <table>
    <thead><tr><th>Model</th><th>调用</th><th>Prompt</th><th>Completion</th><th>Total</th></tr></thead>
    <tbody id="tokenModelStats"></tbody>
  </table>
</div>
```

### JS 渲染模型统计

在 `page-token.js` 的 `refreshTokenStats()` 中，在历史表格渲染后添加：

```javascript
const modelStats = data.model_stats || [];
document.getElementById('tokenModelStats').innerHTML = modelStats.map(m =>
  `<tr><td>${m.model}</td><td>${m.requests}</td><td>${fmt(m.prompt_tokens)}</td><td>${fmt(m.completion_tokens)}</td><td>${fmt(m.total_tokens)}</td></tr>`
).join('');
```

### i18n

在 `app.js` 中英文 token 区块各加：
- 中文：`'token.modelStats': '模型统计'`
- 英文：`'token.modelStats': 'Model Stats'`

## 注意事项

- `/api/chat` 返回 HTML 页面（不是 JSON API），消息通过 WebSocket 发送
- 测试 token 记录时需通过浏览器 UI 发消息，不能直接 curl `/api/chat`
- `model_stats` 为空数组时表格显示空行，无需特殊处理
