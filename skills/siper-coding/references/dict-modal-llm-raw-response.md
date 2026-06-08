# Dict Modal LLM 原始响应 Tab（v0.9.87u+）

## 功能概述

`showDictModal` 点击 `{}` 按钮时，如果数据包含 `_raw_llm` 字段，显示 Tab 切换：
- **处理结果**（默认）：agent.process_message() 返回的 result（content/tool_calls/usage/finish_reason）
- **LLM 原始响应**：完整 LLM API 响应（id/model/created/choices 等）

## 后端变更（agent.py）

### 非流式路径
在构建 result 时附加完整原始响应：
```python
result = {
    'content': result_raw.get('content', ''),
    'tool_calls': result_raw.get('tool_calls'),
    'usage': result_raw.get('usage') or {},
    'finish_reason': result_raw.get('finish_reason') or 'stop',
    '_raw_llm': result_raw,  # 新增：完整 LLM API 响应
}
```

### 流式路径
保存最后一个 chunk 作为原始响应：
```python
# 在 _stream_collector 外部作用域声明
last_raw_chunk = None

# 在 collector 内部
nonlocal last_raw_chunk
last_raw_chunk = chunk  # 每个 chunk 都赋值，最后一个就是完整的

# 构建 result 时附加
result = {
    'content': content,
    'tool_calls': collected_tool_calls or [],
    'usage': collected_usage or {},
    'finish_reason': collected_finish,
    '_raw_llm': last_raw_chunk,  # 新增：最后一个完整 chunk
}
```

注意：`nonlocal last_raw_chunk` 必须在 `def _stream_collector():` 内部声明，且外部作用域必须先初始化 `last_raw_chunk = None`。

## 前端变更（core.js）

### showDictModal 函数改造

1. **检测 `_raw_llm`**：`const hasRawLlm = data && data._raw_llm;`
2. **Tab 切换 UI**：标题区域增加两个 Tab 按钮
3. **`updateContent()` 函数**：Tab 切换时更新标题、内容、字符数
4. **复制/格式化按钮**：操作当前 Tab 的数据

### 关键代码模式
```javascript
let activeTab = 'result'; // 'result' | 'raw_llm'

function updateContent() {
  const curData = activeTab === 'result' ? data : (data._raw_llm || data);
  // 更新标题、内容区域
  pre.innerHTML = '';
  pre.appendChild(renderFormatted(curData));
}
```

## 数据流

```
LLM API 响应
  │
  ├─→ agent.py 提取 content/tool_calls/usage/finish_reason
  │   └─→ result._raw_llm = 原始响应
  │
  └─→ siper_web.py stream_end data = result
      └─→ 前端 core.js _data = d.data
          └─→ showDictModal(_data)
              ├─→ Tab 1: 处理结果
              └─→ Tab 2: LLM 原始响应
```

## 常见陷阱

- **流式路径 `nonlocal` 遗忘**：必须在 `def _stream_collector():` 内部加 `nonlocal last_raw_chunk`，否则 `last_raw_chunk = chunk` 会创建局部变量
- **外部作用域未初始化**：`last_raw_chunk = None` 必须在 `def _stream_collector():` 之前声明
- **patch 后大括号不匹配**：修改 `result = {...}` 时注意闭合 brace，patch 后 `node -c` 验证

## 关联参考

- `references/dict-modal-data-flow.md` — Dict Modal 数据流完整架构
- `references/dict-modal-pattern.md` — Dict Modal 亮色主题对比度
- `references/model-capability-detection.md` — 模型能力探测
