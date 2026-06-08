# 模型能力检测中 loading 状态（v0.9.87s+）

## 问题

点击 🔍 验证按钮后，用户不知道检测是否在进行中（API 请求耗时 15-25s）。

## 解决方案

### 1. verifyModel() 开始时设 pending 状态

```js
async function verifyModel(idx) {
  // ...
  m._verified = "pending";
  renderSettingsModelsList();  // 立即刷新显示 loading
  try {
    const r = await fetch('/api/models/test', { ... });
    // ...
  }
}
```

### 2. 渲染时检测 pending 状态

```js
// 能力徽章区域
${m._verified === "pending"
  ? `<div style="font-size:10px;color:var(--accent);padding:2px 0;display:flex;align-items:center;gap:4px">
       <span style="animation:pulse 1s infinite">⏳</span> 正在更新模型能力...
     </div>`
  : (capBadges
      ? `<div style="display:flex;flex-wrap:wrap;gap:2px;overflow:hidden;height:16px">${capBadges}</div>`
      : '')
}

// 验证按钮 — pending 时禁用
const verifyBtnHtml = m._verified === "pending"
  ? `<button class="btn-sm" style="font-size:10px;padding:2px 6px;opacity:0.5;cursor:not-allowed" disabled title="检测中...">⏳</button>`
  : `<button class="btn-sm" style="font-size:10px;padding:2px 6px" onclick="verifyModel(${i})" title="验证可用性">🔍</button>`;
```

### 3. verifyIcon 也显示 pending

```js
const verifyIcon = m._verified === true ? '<span style="color:var(--green);font-size:10px" title="验证通过...">✅</span>' :
                 m._verified === false ? '<span style="color:var(--red);font-size:10px" title="验证失败...">❌</span>' :
                 m._verified === "pending" ? '<span style="font-size:10px;animation:pulse 1s infinite" title="正在检测模型能力...">⏳</span>' :
                 '';
```

### 4. CSS 脉冲动画

```css
/* style.css */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```
