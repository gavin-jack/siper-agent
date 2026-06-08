# Placeholder 持久化误导问题

## 问题描述

当 textarea 使用 `placeholder="加载中..."` 作为占位符，而实际加载的内容为空字符串（`""`）时，placeholder 会持续显示，让用户误以为内容仍在加载中。

## 实际案例（v0.9.47）

SiPer agent-config 页面的 soul.md 编辑器：
```html
<textarea id="agentSoulContent" placeholder="加载中..."></textarea>
```

前端加载逻辑：
```javascript
const soulData = await soulRes.json();
cachedConfigSoulContent = soulData.soul || '';  // soul.md 为空时返回 ""
soulTa.value = cachedConfigSoulContent;  // 设置空字符串，placeholder 仍然显示
```

当 `soul.md` 文件存在但内容为 0 字节时，后端返回 `{"soul": ""}`，前端设置 `value = ""`，textarea 显示 `placeholder="加载中..."`。

## 诊断方法

1. 检查 API 返回：`curl /api/agents/{name}/soul` → 看 `soul` 字段是否为空字符串
2. 检查文件内容：`wc -c agents/default/soul.md` → 0 字节说明文件被清空
3. 检查前端：`document.getElementById('agentSoulContent').value` → 空字符串 + placeholder 显示 = 用户看到"加载中"

## 修复方案

**方案 A（推荐）**：修改 placeholder 文本，区分"加载中"和"空内容"状态
```html
<!-- ❌ 误导性 placeholder -->
<textarea placeholder="加载中..."></textarea>

<!-- ✅ 清晰的 placeholder -->
<textarea placeholder="（暂无内容）"></textarea>
```

**方案 B**：加载完成后显式清除 placeholder
```javascript
ta.value = content;
if (content) ta.placeholder = '';  // 有内容时清除 placeholder
else ta.placeholder = '（暂无内容）';  // 无内容时显示友好提示
```

## 通用规则

1. **不要用 `placeholder` 表示加载状态** — placeholder 是空值提示，不是加载指示器
2. **加载状态应该用独立的 loading spinner/indicator**，加载完成后移除
3. **空内容 ≠ 加载中** — 两者需要不同的 UI 表现
4. 当调试"一直加载"问题时，先检查 API 实际返回值，再检查文件内容，最后检查前端渲染逻辑

## 受影响位置（v0.9.47 修复）

- `index.html:514` — soul.md textarea placeholder
- `index.html:526` — agent.md textarea placeholder
