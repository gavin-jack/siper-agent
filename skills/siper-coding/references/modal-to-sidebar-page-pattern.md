# 弹窗迁移为侧边栏页面模式（v0.9.31+）

## 适用场景
将弹窗（modal）内容迁移为侧边栏导航页面（sidebar page）。

## 关键步骤
1. 在 index.html 创建 `<div class="page" id="page-xxx">`
2. 侧边栏添加 `<div class="nav-item" data-page="xxx">`
3. 按钮 `onclick` 从 `toggleSidebarSettings()` 改为 `navigateToPage('xxx')`
4. 删除弹窗 HTML
5. 更新所有 JS 引用（showLlmConfigPrompt 等）
6. core.js navigateToPage 添加新页面刷新

## ⚠️ 陷阱：大 patch 误删相邻页面
删除弹窗时 patch 边界可能包含相邻页面开头。**patch 后必须 `grep -n "page-"` 检查相邻页面完整。**

## ⚠️ 陷阱：showLlmConfigPrompt 未更新
弹窗删除后 `showLlmConfigPrompt()` 若仍调用 `toggleSidebarSettings()` 则无反应。必须改为 `navigateToPage('xxx')`。

## 检查清单
- [ ] 侧边栏有新导航项
- [ ] 按钮 onclick 已更新
- [ ] 弹窗 HTML 已删除
- [ ] showLlmConfigPrompt 已更新
- [ ] 相邻页面未被误删
