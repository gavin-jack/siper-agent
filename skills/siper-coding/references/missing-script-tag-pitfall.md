# index.html 缺少 page-agent-config.js script 引用

## 问题描述

SiPer Web UI 的 `index.html` 中 script 加载列表缺少 `page-agent-config.js`，导致智能体配置页面的所有 JS 函数（`switchAgentPageTab`、`selectAgent`、`refreshAgentConfig` 等）未定义。

## 症状

- 点击侧边栏"智能体"导航到 `#agent-config` 页面
- "关于智能体"标签页正常显示（HTML 内联内容）
- "智能体配置文件"标签页点击后无任何内容显示
- 浏览器控制台无明显错误（函数不存在时点击按钮静默失败）

## 修复

在 `index.html` 的 script 加载区域添加：
```html
<script src="/static/pages/page-agent-config.js"></script>
```

位置：在 `page-memory.js` 之后、`main.js` 之前。

## 教训

新增 `page-*.js` 文件后，必须在 `index.html` 中添加对应的 `<script>` 标签。验证方法：
```bash
grep 'page-' /home/gavin/.siper/webui/templates/index.html
```
确保所有 `static/pages/page-*.js` 文件都有对应的 script 标签。
