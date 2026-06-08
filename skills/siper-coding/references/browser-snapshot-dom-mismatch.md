# Browser Tool Snapshot 与 DOM 不一致

## 问题现象

browser tool 的 snapshot 显示页面元素（如 nav-item、page-agent-config 等），但 `browser_console` 中 JS 查询返回空/null：

```
// snapshot 显示 12 个 nav-item
// 但 JS 查询：
document.querySelectorAll('.nav-item').length  // → 0
document.getElementById('page-agent-config')   // → null
```

## 根因

browser tool 的浏览器实例有**极其顽固的缓存机制**。即使服务器返回新版 HTML，browser tool 可能仍加载旧版。

更严重的情况：snapshot 是旧的（显示旧版页面的元素），但实际 DOM 已经刷新了（新页面没有这些元素）。两者完全脱节。

## 诊断方法

1. **snapshot 显示元素但 JS 找不到**：`document.getElementById('xxx')` 返回 null
2. **nav-item 数量为 0**：`document.querySelectorAll('.nav-item').length === 0`
3. **页面结构不匹配**：snapshot 显示的是旧版页面结构

## 解决方案

1. **重新 navigate**：`browser_navigate(url)` 强制重新加载
2. **等待页面加载**：navigate 后等待 3 秒再操作
3. **验证 DOM 就绪**：用 JS 查询确认元素存在后再操作
4. **不要基于 snapshot ref 直接点击**：先用 `getBoundingClientRect()` 检查元素可见性

## 典型案例（v0.9.55）

智能体→模型配置 tab 的"加载中..."问题：
- snapshot 显示页面有 nav-item 和 agent-tab
- 但 JS 查询 `agentDefaultModelSection` 返回 null
- 重新 navigate 后，等待 3 秒，再点击智能体 nav-item，模型配置正常渲染
- **实际代码没有问题**，纯粹是 browser tool 缓存导致

## 与用户浏览器的关系

browser tool 的缓存 ≠ 用户浏览器的缓存。用户浏览器可能已经正常显示新版页面，但 browser tool 仍显示旧版。

**始终要让用户 Ctrl+Shift+R 硬刷新**来验证修改效果。
