# Dict 信息跟回复内容对不上（待修复）

## 现象

用户点击"查看完整响应数据"按钮，dict 弹窗中显示的信息跟实际回复内容对不上。

## 分析

1. `stream_end` 处理中，dict 按钮调用 `showDictModal(_data)`，`_data` 是 agent.py 返回的 result dict
2. `showDictModal()` 检查 `data._raw_llm` 决定是否显示"LLM 原始响应" tab
3. 但 `agent.py` 的 `process_message()` 返回的 result dict 中**没有 `_raw_llm` 字段**
4. 所以 dict 弹窗只有"处理结果" tab，显示的是 agent 处理后的数据，不是 LLM 原始响应

## 根因

前端期望后端返回 `_raw_llm`（LLM 原始 API 响应），但后端从未返回此字段。

## 修复方向（二选一）

### 方案 A：后端返回 _raw_llm
在 `agent.py` 的 `process_message()` 中，将 LLM 原始响应（`llm_client` 返回的原始 dict）存入 result：
```python
result["_raw_llm"] = raw_llm_response  # 完整的 LLM API 响应
```

### 方案 B：前端改为显示 result 中的 response 字段
修改 `showDictModal()`，不依赖 `_raw_llm`，直接显示 `data.response`（agent 最终回复文本）和 `data.usage` 等字段。

## 状态

**待用户确认修复方向后实施。**
