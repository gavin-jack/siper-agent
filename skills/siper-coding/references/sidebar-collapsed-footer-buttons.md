# 折叠后 Sidebar 底部竖排按钮布局（v20260806c+）

## 需求
折叠后 sidebar 底部显示语言/色系/设置按钮，竖排居中，尺寸与 nav-item 图标一致。

## 关键尺寸（折叠状态）
- nav-item: `padding: 8px 0`, font-size: 16px, 总高约 42px
- footer 按钮: 统一 `width: 100%; height: 42px; padding: 8px 0; font-size: 16px`
- footer 容器: `flex-direction: column; align-items: center; gap: 0; border-top: none`

## theme-palette-trigger 空 button 陷阱
**theme-palette-trigger 原本是空 button**（无 emoji 子元素，只有 CSS 渐变背景）。
折叠时 `width: 100%` 在 flex column 容器里不生效（无内容撑开），导致宽度为 0。

**修复**：
1. HTML 中添加 `<span>🎨</span>` 子元素
2. CSS 中加 `min-width: 32px; box-sizing: border-box; background: transparent; border: none`
3. 折叠时去掉渐变背景（与 nav-item 风格一致）

## CSS 规则（折叠状态）
```css
.sidebar.collapsed .sidebar-footer {
  padding: 0;
  flex-direction: column;
  align-items: center;
  gap: 0;
  border-top: none;
}
.sidebar.collapsed .lang-dropdown-trigger,
.sidebar.collapsed .theme-palette-trigger,
.sidebar.collapsed .sidebar-settings-toggle {
  width: 100%;
  height: 42px;
  padding: 8px 0;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-size: 16px;
}
.sidebar.collapsed .theme-palette-trigger {
  background: transparent;
  border: none;
}
```

## Dropdown 菜单定位（折叠时）
```css
.sidebar.collapsed .lang-dropdown-menu {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 4px;
}
.sidebar.collapsed .theme-palette-menu {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 4px;
}
```

## Tooltip 支持（footer 按钮）
在 core.js 的 tooltip 逻辑中添加 footer 按钮支持：
```javascript
sidebar.querySelectorAll('.sidebar-footer > *, .sidebar-footer .lang-dropdown-trigger, .sidebar-footer .theme-palette-trigger, .sidebar-footer .sidebar-settings-toggle').forEach(function(btn) {
  btn.addEventListener('mouseenter', function(e) {
    if (!sidebar.classList.contains('collapsed')) return;
    const title = btn.getAttribute('title');
    if (title) {
      tooltip.textContent = title;
      tooltip.style.opacity = '1';
      const rect = btn.getBoundingClientRect();
      tooltip.style.left = (rect.right + 8) + 'px';
      tooltip.style.top = (rect.top + rect.height / 2 - 10) + 'px';
    }
  });
  btn.addEventListener('mouseleave', function() {
    tooltip.style.opacity = '0';
  });
});
```

## ⚠️ forEach 括号匹配陷阱
添加事件监听器块时，结尾容易多写一个 `)` 变成 `}));`。
这会导致整个 core.js 解析失败，所有页面函数未定义。
**修改后必须 `node -c core.js` 验证语法。**

## 验证方法
```javascript
// browser_console 中执行
const s = document.querySelector('.sidebar');
const f = document.querySelector('.sidebar-footer');
const btns = f.querySelectorAll('button');
// 检查：width=48, collapsed=true, footerFlexDir=column, btns 全部 h=42
```
