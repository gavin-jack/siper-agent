# browser_navigate 与 DOMContentLoaded 陷阱

## 发现时间
v0.4.46 (2026-05-22)

## 问题描述
`browser_navigate` 工具导航到 URL 时，**不会触发 `DOMContentLoaded` 事件**。

## 影响范围
- hash 路由恢复逻辑（DOMContentLoaded 中读 `location.hash` 并调用 `navigateToPage`）不会执行
- 页面初始显示的是 HTML 默认状态
- 用 `browser_navigate` 测试 hash 路由会得到错误结果

## 验证方法
```js
// 在 DOMContentLoaded 回调中设置标记
document.addEventListener('DOMContentLoaded', () => {
  sessionStorage.setItem('domLoaded', 'true');
});

// browser_navigate 后检查标记
browser_console(expression="sessionStorage.getItem('domLoaded')")
// 返回 null → DOMContentLoaded 未触发
```

## 正确测试方式
用 `browser_console` 直接修改 hash 触发 `hashchange`：
```js
browser_console(expression="location.hash='sessions'")
```
然后检查页面是否切换到 sessions。

## 注意
这只影响自动化浏览器工具。真实浏览器 F5 刷新**会**正常触发 DOMContentLoaded。

## 相关陷阱
- 陷阱 #111: navigateToPage 的 skipHash 参数影响刷新后页面恢复
- 陷阱 #87: Hash 路由刷新时 chat 页面闪烁
