# CSS 消息气泡箭头实现

## 技术方案：clip-path: polygon() 实现三角形箭头

在 `.msg.user` 和 `.msg.agent` 上使用 `::before` 伪元素创建聊天气泡箭头：

```css
/* 用户消息 — 右下角箭头 */
.msg.user::before {
  content: '';
  position: absolute;
  bottom: 0;
  right: -6px;
  width: 12px;
  height: 12px;
  background: var(--user-msg-bg);
  clip-path: polygon(0 0, 0 100%, 100% 100%);
}

/* Agent 消息 — 左下角箭头（带边框） */
.msg.agent::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: -6px;
  width: 12px;
  height: 12px;
  background: var(--agent-msg-bg);
  border-left: 1px solid var(--agent-msg-border);
  border-bottom: 1px solid var(--agent-msg-border);
  clip-path: polygon(100% 0, 0 100%, 100% 100%);
}
```

## 关键点

1. `.msg` 必须有 `position: relative` — 作为伪元素的定位基准
2. `bottom: 0` — 箭头对齐消息气泡底部
3. `right/left: -6px` — 箭头向外突出
4. agent 箭头需要边框 — 用 `border-left` + `border-bottom` 匹配 agent 消息的 border

## 相关修复

- commit `c2515fa` — 首次添加气泡箭头
- 同时补全了缺失的 `--user-msg-bg`, `--agent-msg-bg` 等 CSS 变量
- 将消息变量从 `:root` 移至 `html {}` 规则（避免截断问题，见陷阱 #45）
