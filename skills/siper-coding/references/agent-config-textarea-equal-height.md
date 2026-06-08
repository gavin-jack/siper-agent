# 智能体配置文件 Textarea 等高自适应

## 问题

智能体配置页面（Tab 2: 配置文件）的 soul.md 和 agent.md 两个 textarea 需要：
1. 左右高度一致
2. 高度自适应，填充到页面底部（距底部 10px）

## 布局链

```
#page-agent-config .page-body (flex: 1, display: flex, flex-direction: column)
  ├── .agent-tabs (flex-shrink: 0) — tab 栏不压缩
  └── .agent-tab-content-flex (flex: 1, display: flex, flex-direction: column)
        └── .grid-2col-12.flex-1 (flex: 1, min-height: 0)
              ├── .card.card-flex-col
              │     ├── .card-title
              │     ├── textarea.agent-file-editor (flex: 1, min-height: 0)
              │     └── .flex-end-row
              └── .card.card-flex-col (同上)
```

## 关键 CSS

```css
#page-agent-config .page-body {
  flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
#page-agent-config .page-body > .agent-tabs { flex-shrink: 0; }
#page-agent-config .page-body > .agent-tab-content-flex {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
}
.grid-2col-12 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: stretch;
}
.grid-2col-12.flex-1 { flex: 1; min-height: 0; }
.agent-file-editor {
  width: 100%; box-sizing: border-box; flex: 1; min-height: 0;
  resize: none; font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px; line-height: 1.6; padding: 10px;
  background: var(--bg); color: var(--text); border: 1px solid var(--border);
  border-radius: 6px; outline: none;
}
```

## 陷阱

1. page-body 默认 overflow-y:auto 阻止 flex 子元素拉伸 — 必须覆盖为 overflow: hidden
2. grid 容器在 flex 中需要 min-height:0
3. textarea 需要 resize:none
