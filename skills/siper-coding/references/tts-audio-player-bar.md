# TTS 语音合成完整架构

> 版本：v0.9.87z+ (2026-08-04 更新)
> 涉及文件：`ai_agent/tools/tts_tool.py`, `siper_web.py`, `core.js`, `page-chat.js`, `style.css`

## 核心原则

TTS 工具生成的语音文件在消息气泡中直接渲染为语音播放条（微信风格），**不在** tool-calls 折叠面板中显示。

## 完整数据流

```
用户消息 → Agent 调用 text_to_speech 工具
    ↓
tts_tool.py → edge_tts 合成 mp3 → 保存到 uploads/audio/tts_{timestamp}.mp3
    ↓
ToolResult.data = {audio_path, text_length, voice, file_size, has_audio: true}
    ↓
agent.py → _format_tool_result() → str(result.data) → step.result (字符串)
    ↓
stream_end / response → tool_call_steps → 前端渲染
    ↓
检测到 step.tool_name === 'text_to_speech' → 渲染语音条到 bubble
    ↓
用户点击播放 → <audio> 标签播放 /uploads/audio/tts_*.mp3
```

## 后端组件

### tts_tool.py（工具定义）

- **工具名**：`text_to_speech`
- **依赖**：`edge_tts`（已安装 7.2.7）
- **参数**：
  - `text`（必填）— 要合成的文本
  - `voice`（默认 `zh-CN-XiaoxiaoNeural`）— 语音名称
  - `output_path`（可选）— 自定义输出路径
- **输出**：`ToolResult(data={audio_path, text_length, voice, file_size, has_audio})`
- **音频保存路径**：`uploads/audio/tts_{timestamp}.mp3`

### siper_web.py（静态文件服务）

- `/uploads/` 路径映射到项目根目录的 `uploads/` 文件夹
- 有路径穿越防护（`resolve()` + `startswith` 检查）
- 支持的 Content-Type：png/jpg/jpeg/gif/webp/bmp/octet-stream

### siper_web.py（TTS 能力探测）

- 通过模型名称关键词（tts/whisper/speech-/text-to-speech 等）判断 TTS 能力
- 或通过 base URL 判断（v0.9.87v+ 已移除名字符串匹配 fallback）

## 前端组件

### 路径 1：流式模式（core.js stream_end）

在 `stream_end` 处理中，`appendMeta` 之后渲染 TTS 语音条：

```javascript
if (_streamBubbleWrap && _tool_call_steps.length > 0) {
  for (const step of _tool_call_steps) {
    if (step.tool_name === 'text_to_speech' && step.success) {
      const m = step.result.match(/['"]audio_path['"]\s*:\s*['"]([^'"]+)['"]/);
      if (m) audioUrl = m[1];
      if (audioUrl.startsWith('/home/gavin/.siper/uploads/')) {
        audioUrl = audioUrl.replace('/home/gavin/.siper/uploads/', '/uploads/');
      }
      // 创建 .tts-audio-bar DOM → _streamBubbleWrap.appendChild(audioEl)
    }
  }
}
```

### 路径 2：非流式模式（page-chat.js addMsg）

在 `addMsg` 的 agent 分支中，`appendMeta` 之后渲染：

```javascript
if (isAgent && meta && meta.tool_call_steps) {
  for (const step of meta.tool_call_steps) {
    if (step.tool_name === 'text_to_speech' && step.success) {
      // 同流式路径的解析逻辑 → bubble.appendChild(audioEl)
    }
  }
}
```

### renderToolCalls — 跳过 TTS

```javascript
for (const step of steps) {
  if (step.tool_name === 'text_to_speech') continue;
  // ... 正常渲染其他工具
}
```

### toggleTtsAudio 全局函数（core.js）

```javascript
window.toggleTtsAudio = function(btn, audioUrl) {
  const bar = btn.closest('.tts-audio-bar');
  const audio = bar.querySelector('.tts-audio');
  // 停止其他正在播放的 TTS（互斥播放）
  document.querySelectorAll('.tts-audio-bar.playing').forEach(other => {
    if (other === bar) return;
    other.querySelector('.tts-audio').pause();
    other.classList.remove('playing');
  });
  // 切换播放/暂停
  if (bar.classList.contains('playing')) {
    audio.pause(); audio.currentTime = 0;
    bar.classList.remove('playing');
  } else {
    audio.play().then(() => { bar.classList.add('playing'); });
  }
  audio.onended = () => { bar.classList.remove('playing'); };
};
```

## CSS 样式

```css
.tts-audio-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; margin: 4px 0;
  background: var(--bg-hover, #242d3d);
  border-radius: 8px; border: 1px solid var(--border, #30363d);
  max-width: 280px; cursor: default; user-select: none;
}
.tts-audio-bar.playing { border-color: var(--accent, #58a6ff); }
.tts-play-btn {
  width: 32px; height: 32px; border-radius: 50%; border: none;
  background: var(--accent, #58a6ff); color: #fff; font-size: 14px;
  cursor: pointer; flex-shrink: 0;
}
.tts-waveform {
  display: flex; align-items: center; gap: 2px; height: 24px; flex: 1;
}
.tts-wave-bar {
  width: 3px; height: 8px; background: var(--accent);
  border-radius: 2px;
}
.tts-waveform.playing .tts-wave-bar {
  animation: tts-wave 0.8s ease-in-out infinite;
}
@keyframes tts-wave {
  0%, 100% { height: 8px; } 50% { height: 20px; }
}
.tts-label { font-size: 12px; color: var(--text-dim); }
.tts-audio { display: none; }
```

## 支持的语音

| 语音名称 | 语言 | 性别 |
|---------|------|------|
| `zh-CN-XiaoxiaoNeural` | 中文 | 女声（默认） |
| `zh-CN-YunxiNeural` | 中文 | 男声 |
| `en-US-JennyNeural` | 英文 | 女声 |
| 其他 Edge TTS 支持的语音 | — | — |

## 调试检查清单

1. `edge_tts` 已安装：`pip3 list | grep edge`
2. `tts_tool.py` 返回的 data 包含 `has_audio: True`
3. 音频文件可通过 `/uploads/audio/tts_*.mp3` 访问
4. `core.js` stream_end 中 TTS 语音条渲染在 appendMeta 之后
5. `page-chat.js` addMsg 中 TTS 语音条渲染在 appendMeta 之后
6. `page-chat.js` renderToolCalls 中 TTS 被 skip
7. `style.css` 中 `.tts-audio-bar` 等样式存在
8. `toggleTtsAudio` 定义在 `window` 上（全局可访问）
9. `siper_web.py` 中 `/uploads/` 静态文件路由正常

## 相关参考

- `references/tool-progress-display-pattern.md` — 工具调用进度显示
- `references/streaming-realtime-md-render.md` — 流式消息渲染
- `references/model-capability-detection.md` — TTS 能力探测
