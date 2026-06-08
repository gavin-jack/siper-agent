# SiPer TTS 语音合成完整架构

## 概述

SiPer 使用 `edge-tts` 库（Microsoft Edge TTS）实现文字转语音。

## 后端链路

### 1. TTS 工具 (`ai_agent/tools/tts_tool.py`)

```python
import edge_tts

class TtsTool:
    async def execute(self, text: str, voice: str = "zh-CN-XiaoxiaoNeural"):
        output_path = f"uploads/audio/tts_{int(time.time())}.mp3"
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)
        return {"audio_path": f"/uploads/audio/tts_{timestamp}.mp3"}
```

- 默认语音：`zh-CN-XiaoxiaoNeural`
- 输出路径：`/home/gavin/.siper/uploads/audio/tts_{timestamp}.mp3`
- 前端可访问路径：`/uploads/audio/tts_{timestamp}.mp3`（通过静态文件路由映射）

### 2. TTS 能力探测 (`siper_web.py:~2347`)

通过关键词匹配探测模型是否支持 TTS 能力。

## 前端链路

### 3. 音频条渲染 (`core.js:~1723`)

```javascript
function renderTtsAudioBars(toolSteps) {
  // 查找最后一个 agent bubble
  const bubbles = chatMessages.querySelectorAll('.msg-bubble-agent');
  const lastBubble = bubbles[bubbles.length - 1];
  if (!lastBubble) return;
  
  // 渲染 .tts-audio-bar
  const bar = document.createElement('div');
  bar.className = 'tts-audio-bar';
  bar.innerHTML = `
    <button class="tts-play-btn" onclick="toggleTtsAudio(this)">
      <svg class="tts-play-icon">▶</svg>
    </button>
    <div class="tts-waveform">
      <div class="tts-wave-bar"></div>
      ...
    </div>
    <span class="tts-label">TTS</span>
    <audio class="tts-audio" src="${audioPath}"></audio>
  `;
  lastBubble.appendChild(bar);
}
```

### 4. 播放控制 (`core.js:~3892`)

```javascript
function toggleTtsAudio(btn) {
  const audio = btn.closest('.tts-audio-bar').querySelector('.tts-audio');
  // 全局互斥：停止其他正在播放的音频
  document.querySelectorAll('audio').forEach(a => {
    if (a !== audio) { a.pause(); a.currentTime = 0; }
  });
  if (audio.paused) {
    audio.play();
    btn.classList.add('playing');
  } else {
    audio.pause();
    btn.classList.remove('playing');
  }
}
```

## CSS 类

- `.tts-audio-bar` — 音频条容器（flex 布局）
- `.tts-play-btn` — 播放/暂停按钮
- `.tts-play-icon` — 播放图标（▶/⏸）
- `.tts-waveform` — 波形动画容器
- `.tts-wave-bar` — 波形条（CSS animation）
- `.tts-label` — "TTS" 标签
- `.tts-audio` — `<audio>` 元素（display: none）

## 路径映射

| 后端路径 | 前端 URL |
|---------|---------|
| `/home/gavin/.siper/uploads/` | `/uploads/` |

## 已知限制

- `edge-tts 7.2.7` 需要网络连接访问 Microsoft 服务
- HTTP 下 clipboard API 不可用（不影响 TTS 播放）
- 非流式 response 路径需要单独渲染 TTS 音频条（stream_end 路径已处理）

## 历史修复

- **commit 392546d**: TTS 前端渲染 bug 修复（_streamBubbleWrap 提前置 null、非流式路径缺失渲染、dict→JSON）
