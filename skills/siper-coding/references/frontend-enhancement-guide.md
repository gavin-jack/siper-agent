# 前端炫酷升级方案参考

## 升级方向与优先级

| 优先级 | 方案 | 效果 | 工作量 |
|---|---|---|---|
| ⭐⭐⭐ | 毛玻璃 + 渐变气泡 | 立竿见影 | 1-2小时 |
| ⭐⭐⭐ | 消息滑入动画 | 提升体验 | 30分钟 |
| ⭐⭐ | 代码高亮 | 实用 | 1小时 |
| ⭐⭐ | 按钮微交互 | 细节提升 | 1小时 |
| ⭐ | 三栏布局 | 架构调整 | 半天+ |

## 已实现

### 1. 多套主题系统 (v20260805)
- `html.dark` — GitHub Dark 风格
- `html.midnight` — 深蓝紫风格
- `html.cyberpunk` — 霓虹粉紫风格
- 每套主题有完整的 `--glow-accent` / `--glow-accent-strong` 光晕变量

### 2. 毛玻璃效果
- 侧边栏：`backdrop-filter: blur(16px)` + 半透明背景
- 消息气泡：`backdrop-filter: blur(8px)` + 半透明
- Modal 背景：`backdrop-filter: blur(8px)`

### 3. 按钮 Hover 光晕
```css
.btn-sm:hover {
  box-shadow: var(--glow-accent);
  transform: translateY(-1px);
}
.btn-sm.primary {
  background: linear-gradient(135deg, var(--accent), ...);
}
```

### 4. 输入框 Focus 发光
```css
.chat-input-area textarea:focus {
  box-shadow: var(--glow-accent), inset 0 1px 3px rgba(0,0,0,0.05);
}
```

### 5. 页面过渡动画
- 消息气泡：`scaleIn 0.25s ease`
- Tab 切换：`fadeIn 0.2s ease`
- Tab 下划线：`::after` 伪元素 + `transition`
- Nav-item：左侧光条指示器

### 6. 微交互 (v20260805)
- 按钮 active：`translateY(0) scale(0.97)`
- Tab 下划线：hover 时 60% 宽度，active 时 100%
- Nav-item hover：左侧 3px 光条

### 7. 可拖拽面板 (v20260806)
- 侧边栏右边缘 4px 拖拽手柄，拖动调整宽度（120px~400px）
- 折叠/展开按钮（◀/▶），状态持久化到 localStorage
- `.sidebar.collapsed` + `.main.expanded` CSS 过渡动画
- 详见 `references/frontend-enhancement-impl-v20260806.md`

### 8. 思维链可视化 (v20260806)
- `renderCotTree(steps)` 生成树状图，4 种状态（running/done/error/pending）
- 运行中工具有脉冲动画（`cot-pulse` keyframe）
- 在 `appendMeta()`（page-chat.js）中插入，默认隐藏，通过 meta-tools-link toggle
- 详见 `references/frontend-enhancement-impl-v20260806.md`

### 9. 消息气泡增强 (v20260806)
- **代码高亮**：Prism.js CDN（prism-tomorrow 主题），支持 Python/JS/Bash/JSON/MD/YAML/SQL
- **Mermaid 图表**：` ```mermaid ` 代码块自动渲染为 SVG
- **KaTeX 公式**：`$...$` 行内 + `$$...$$` 块级，4 种分隔符支持
- **postRenderEnhance 钩子**：addMsg() 和 stream_end 后自动应用所有增强
- 详见 `references/frontend-enhancement-impl-v20260806.md`

## CSS 变量规范

```css
:root {
  --glow-accent: 0 0 12px rgba(45,158,138,0.35);
  --glow-accent-strong: 0 0 20px rgba(45,158,138,0.5);
}
html.dark {
  --glow-accent: 0 0 12px rgba(88,166,255,0.35);
  --glow-accent-strong: 0 0 20px rgba(88,166,255,0.5);
}
```

## 注意事项

- CSS 是压缩格式，必须用 execute_code 做精确字符串替换，不能用 patch 工具
- 新增 CSS 规则后必须更新 cache-buster（`?v=` 版本号）
- 主题切换通过 `applySidebarTheme()` 设置 inline style，ECharts 通过 `siper-theme-changed` 事件同步
- **appendMeta 定义在 page-chat.js，不是 core.js**
- **renderMarkdown code block**：pre 直接有 `md-code-block` class（不是 wrapper div），enhanceCodeBlocks 跳过条件要检查 pre 本身
- **Mermaid 渲染异步**：`mermaid.render()` 返回 Promise，需要 `.then()` 处理
- **禁止用 markdown-it**，用户两次否决
