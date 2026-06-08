# Web Audio API 提示音实现

## 场景
AI 消息回复后播放提示音，无需外部音频文件。

## 实现代码

```javascript
let _audioCtx = null;
function playReplySound() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    // Two-tone chime: C5 -> E5
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });
  } catch(e) {}
}
```

## 调用位置
在 WS 消息处理中，`addMsg(d.content, 'agent', meta)` 之后：
```javascript
addMsg(d.content, 'agent', meta);
playReplySound();
```

## 参数说明
- `523.25` Hz = C5（Do），`659.25` Hz = E5（Mi）
- 间隔 0.12s，音量 0.15（0~1），衰减 0.4s
- `exponentialRampToValueAtTime` 实现自然衰减

## 注意事项
1. **AudioContext 需要用户交互**：浏览器策略要求 AudioContext 必须在用户手势（点击/按键）后才能 `resume()`。首次播放时如果 context 处于 suspended 状态，需要在用户点击后调用 `ctx.resume()`。
2. **延迟初始化**：`_audioCtx` 延迟到首次播放时创建，避免浏览器自动暂停。
3. **静默失败**：try/catch 包裹，音频不是核心功能，失败不影响聊天。
4. **兼容性**：`window.webkitAudioContext` 兼容旧版 Safari。

## 可定制参数
- 频率数组：改音高（如 `[440, 554, 659]` = A major chord）
- 间隔时间：改节奏（如 `0.2` = 更慢）
- 音量：改响度（如 `0.3` = 更响）
- 衰减时间：改长短（如 `0.8` = 更长）
- 波形：`osc.type = 'square'/'sawtooth'/'triangle'` 改音色
