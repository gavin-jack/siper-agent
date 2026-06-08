# TTS 前端播放完整修复记录

## 问题现象
用户发送 TTS 请求后，音频文件已生成到 `uploads/audio/`，但聊天界面没有播放按钮。

## 根因（三重）

### 1. 流式模式：`_streamBubbleWrap` 生命周期 bug
`stream_end` 处理中的执行顺序：
- 第 1682-1685 行：`_streamBubbleWrap = null`（先置 null）
- 第 1724 行：`if (_streamBubbleWrap && ...)`（后判断 → 永远 false）

TTS 渲染依赖 `_streamBubbleWrap`，但它在之前已被清空。

### 2. 非流式模式（response 类型）：完全没有 TTS 渲染代码
`core.js` 中 `d.type === 'response'` 分支只有 `addMsg()`，从未检查 tool_call_steps 中的 TTS。

### 3. 数据格式脆弱
`_format_tool_result()` 对 dict 类型返回 `str(result.data)` → Python dict 字符串（单引号），前端正则匹配不可靠。

## 修复方案

### 前端：提取 `renderTtsAudioBars()` 函数
流式和非流式路径都调用此函数，通过 DOM 查找最后一个 agent bubble（不依赖 `_streamBubbleWrap`）。

### 前端：TTS 结果解析优先 JSON.parse
先尝试 `JSON.parse(step.result).audio_path`，失败则 fallback 到正则。

### 后端：`_format_tool_result` dict 返回 JSON
对 `dict` 类型用 `json.dumps()` 而非 `str()`，确保前端可稳定解析。

## 相关文件
- `webui/static/pages/core.js` — `renderTtsAudioBars()` + `toggleTtsAudio()`
- `ai_agent/core/agent.py` — `_format_tool_result()`
- `ai_agent/tools/tts_tool.py` — TTS 工具实现

## 历史
- 2026-08-04: 三重修复完成（DOM 查找替代 _streamBubbleWrap、非流式路径补充、JSON 解析）
