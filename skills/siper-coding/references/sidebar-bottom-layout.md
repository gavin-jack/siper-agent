# 侧边栏底部布局（v0.6.2）

## 结构

侧边栏底部（sidebar-footer 之前）放置版本号和 Powered By 信息：

```html
<div class="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-header-row">
      <img src="/static/default_avatar.png" class="sidebar-avatar" alt="avatar">
      <span class="sidebar-brand">SiPer</span>
    </div>
    <div class="sidebar-status" id="sidebarStatus">
      <span class="status-dot" id="statusDot"></span>
      <span class="status-text" id="statusText">Disconnected</span>
    </div>
  </div>
  <nav class="sidebar-nav">...</nav>
  <!-- 版本号行：在 footer 之前、nav 之后 -->
  <div class="sidebar-version-row">
    <span class="sidebar-version" id="sidebarVersion">v1.0.0</span>
    <span class="sidebar-powered">Powered By Gavin</span>
  </div>
  <div class="sidebar-footer">
    <!-- 语言下拉 + 配色 select + ⚙️ 按钮 -->
  </div>
</div>
```

## CSS

```css
/* 版本号行：flex 左右分布 */
.sidebar-version-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 12px 4px;
}

.sidebar-version {
  font-size: 12px;
  color: var(--text-dim);
  opacity: 0.5;
}

.sidebar-powered {
  font-size: 12px;
  color: var(--text-dim);
  opacity: 0.5;
}
```

## 关键规则

- 版本号行在 `</nav>` 之后、`.sidebar-footer` 之前
- 不是 sidebar-header 或 sidebar-footer 的子元素
- flex `space-between` 让版本号居左、Powered By 居右
- 字号 12px，opacity 0.5（比 sidebar-status 更淡）
- 配色 select 选项文本：`青绿`（value=light）/ `深蓝`（value=dark）

## Sidebar 宽度

通过 CSS 变量控制：`--sidebar-width: 160px;`（.sidebar 和 .main 都引用此变量）

## 演变

- v0.5.4: 版本号在 sidebar-header 内
- v0.6.2: 版本号移到 sidebar-footer 上方，加 Powered By Gavin
- v0.7.3: sidebar-footer 内按钮统一样式（24x24），修复按钮不对齐问题
