# JS HTML 字符串拼接 → DOM API 重构模式

## 问题

`innerHTML` 字符串拼接存在 XSS 风险，且难以维护：

```javascript
// 旧模式（不安全）
list.innerHTML = data.sessions.map(s => `
  <div class="item" onclick="doSomething('${s.id}')">
    <span>${s.name}</span>
  </div>
`).join('');
```

**风险**：如果 `s.id` 或 `s.name` 包含 `'`、`<`、`>` 等字符，会破坏 HTML 结构或注入脚本。即使调用了 `escapeHtml()`，onclick 中的字符串参数仍可能逃逸。

## 重构模式

使用 `createElement` + `textContent` + `addEventListener`：

```javascript
// 新模式（安全）
list.innerHTML = '';
for (const s of data.sessions) {
  const item = document.createElement('div');
  item.className = 'item';
  item.onclick = () => doSomething(s.id);  // 闭包捕获，无需字符串转义

  const name = document.createElement('span');
  name.textContent = s.name;  // 自动转义，等价于 escapeHtml
  item.appendChild(name);

  list.appendChild(item);
}
```

## 关键规则

1. **文本内容** 用 `textContent`，不用 `innerHTML`
2. **事件绑定** 用 `addEventListener` 或 `element.onclick = () => ...`，不用 `onclick="..."` HTML 属性
3. **动态值** 通过闭包捕获，不拼接到字符串中
4. **style 设置** 用 `element.style.cssText = '...'` 或 `element.style.property = '...'`
5. **class 设置** 用 `element.className`，不用 `setAttribute('class', ...)`

## 适用场景

- 列表渲染（session 列表、消息列表等）
- 动态弹窗内容
- 任何包含用户数据的 HTML 生成

## 例外

- 纯静态 HTML（无用户数据）可以用模板字符串
- `innerHTML` 用于设置纯样式包装（如 `<div class="wrapper">`）是安全的
- 如果后端已保证数据不包含特殊字符，可以酌情使用模板字符串

## 实例参考

`page-sessions.js` 的 `refreshSessions()` 和 `previewSession()` 函数已用此模式重构（v0.6.6）。
