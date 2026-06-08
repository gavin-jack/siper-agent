# 智能体配置文件编辑器配色区分

## 需求

智能体配置页面的 soul.md 和 agent.md 两个 textarea 需要有背景色和文字颜色区分，让用户一眼分辨。

## 实现

### HTML — 添加专属 CSS 类

```html
<!-- soul.md — 使用 accent 色系（蓝绿） -->
<textarea class="agent-file-editor code-editor code-editor-soul" id="agentSoulContent"></textarea>

<!-- agent.md — 使用 accent2 色系（紫色） -->
<textarea class="agent-file-editor code-editor code-editor-agent" id="agentMdContent"></textarea>
```

### CSS — color-mix 生成淡背景

```css
/* soul.md — accent 色 8% 混入背景 */
.code-editor-soul {
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 25%, var(--border));
}
.code-editor-soul:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

/* agent.md — accent2 色 8% 混入背景 */
.code-editor-agent {
  background: color-mix(in srgb, var(--accent2) 8%, var(--bg));
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent2) 25%, var(--border));
}
.code-editor-agent:focus {
  border-color: var(--accent2);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent2) 20%, transparent);
}
```

## 关键点

- 使用 `color-mix(in srgb, var(--accent) 8%, var(--bg))` 生成与主题一致的淡背景
- `8%` 混入比例足够区分但不刺眼
- focus 时边框高亮 + box-shadow，与背景色同色系
- 所有颜色通过 `var()` 引用，适配所有主题配色
