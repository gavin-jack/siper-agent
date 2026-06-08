# 全局设置页面简化模式（v0.9.32+）

## 适用场景

当需要从全局设置页面移除不需要的 UI 区域（卡片、表单区块）时，遵循本模式确保干净删除无残留。

## 操作步骤

### 1. 删除 HTML 卡片区块

用 Python 脚本精确替换，**禁止**用大 patch 一次性删除多个区块（容易误删相邻页面）。

```python
# 精确删除模式：找到 start_marker 和 end_marker，替换为连接文本
start = '      <!-- ===== System Parameters ===== -->'
end = '      <!-- ===== Appearance ===== -->'
idx_start = html.index(start)
idx_end = html.index(end)
html = html[:idx_start] + html[idx_end:]
```

逐个删除，每次删除后验证文件结构完整。

### 2. 检查 JS 残留引用

删除 HTML 元素后，**必须** grep 所有引用这些元素的 JS 函数：

```bash
# 检查已删除元素的 ID 是否还在 JS 中被引用
grep -rn 'newModelName\|newModelProvider\|newModelBaseUrl\|newModelApiKey\|newModelCtx\|addModelToSettings\|saveMetaConfig\|cfgAgentName\|cfgPort\|cfgMaxTools\|cfgLogLevel\|cfgIcon\|cfgAvatar\|cfgMetaTokens\|cfgMetaDebug' webui/static/pages/
```

如果有残留，同步修改 JS 中对应的函数。

### 3. 合并手动输入到预设下拉

将"手动添加"表单合并到"自动发现"的 Provider 预设中：

```html
<!-- 在 providerPreset select 末尾加"自定义"选项 -->
<option value="custom">自定义</option>
```

```javascript
// applyProviderPreset() 中处理 custom
if (preset === 'custom') {
    document.getElementById('discoverBaseUrl').value = '';
    document.getElementById('discoverApiKey').value = '';
    document.getElementById('discoverBaseUrl').focus();
    return;
}
```

### 4. 更新相关文案

- 重置确认提示：删除已移除区域的描述
- 空状态提示：如"已配置模型"为空时的引导文字

## 常见陷阱

| 陷阱 | 症状 | 修复 |
|---|---|---|
| 大 patch 误删相邻页面 | Gateway/Agent 页面消失 | 逐个删除，每次验证 |
| JS 引用已删除元素 | 控制台 TypeError | grep 检查残留引用 |
| 删除卡片但保留空 card div | 页面出现空白卡片 | 连同外层 div 一起删除 |
| confirm 提示引用已删除区域 | 用户看到无关描述 | 同步更新 scope 文案 |

## 验证清单

- [ ] 页面只保留需要的卡片
- [ ] grep 已删除元素 ID 在 JS 中无残留
- [ ] Provider 预设"自定义"选项正常工作
- [ ] 重置确认提示文案已更新
- [ ] 浏览器硬刷新后效果正确
- [ ] Windows 部署包已同步

---

## page-body 空白空间压缩（v0.9.33+）

### 问题诊断方法

当 page-body 出现多余空白时，用以下 JS 精确测量：

```javascript
// 1. 检查 page-body 可见高度 vs 滚动高度
const pb = document.querySelector('#page-global-settings .page-body');
console.log({ clientH: pb.clientHeight, scrollH: pb.scrollHeight });

// 2. 检查每个子元素的高度+margin
Array.from(pb.children).forEach(c => {
  const cs = getComputedStyle(c);
  console.log(c.className, c.offsetHeight, 'mt:', cs.marginTop, 'mb:', cs.marginBottom);
});

// 3. 检查内容实际底部位置（最准确方法）
const all = pb.querySelectorAll('*');
let maxBottom = 0;
all.forEach(el => {
  const rect = el.getBoundingClientRect();
  const pbRect = pb.getBoundingClientRect();
  maxBottom = Math.max(maxBottom, rect.bottom - pbRect.top);
});
console.log('contentBottom:', maxBottom, 'clientH:', pb.clientHeight);
// maxBottom <= clientH → 内容全部可见，无溢出
```

### 间距压缩清单（v0.9.34+）

删除卡片后内容仍溢出时，按以下清单逐项压缩：

| CSS 属性 | 旧值 | 新值 | 节省 |
|---|---|---|---|
| `.page-body` padding | `20px 24px` | `12px 16px` | ~16px |
| `.card` padding | `16px` | `12px` | 8px |
| `.card` margin-bottom | `12px` | `0`（用 `.card+.card { margin-top: 8px }` 替代）| 12px |
| `.card-title` margin-bottom | `10px` | `6px` | 4px |
| `.form-row` margin-bottom | `10px` | `6px` | 4px |
| `.form-row` gap | `12px` | `10px` | - |
| `.settings-divider` margin | `16px 0 10px` | `10px 0 6px` | ~12px |
| `.settings-divider` padding-top | `12px` | `8px` | 4px |
| `.section-subtitle` margin-bottom | `8px` | `4px` | 4px |
| `.grid-2col` gap | `8px` | `6px` | - |
| `.mb-12` margin-bottom | `12px` | `8px` | 8px |
| `.border-top-sep` padding-top | `12px` | `8px` | 4px |
| `.stats-grid` gap | `10px` | `8px` | - |
| `.stats-grid` margin-bottom | `12px` | `8px` | 4px |
| `.stat-card` padding | `14px 16px` | `10px 12px` | 8px |
| `.stat-card .value` font-size | `24px` | `18px` | ~8px |

### 关键注意事项

- `scrollH > clientH` 不一定是溢出——scrollH 包含 padding，clientH 不包含
- 用 `maxBottom <= clientH` 判断内容是否全部可见
- browser tool 有独立 CSS 缓存，修改 style.css 后需用 JS 强制刷新：
  ```javascript
  document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
    l.href = l.href.split('?')[0] + '?t=' + Date.now();
  });
  ```
- 压缩后验证：全局设置页面内容应全部可见（maxBottom ≈ 500px，clientH ≈ 513px）

**关键区分**：scrollH > clientH 不一定意味着内容溢出——scrollH 包含 padding，clientH 不包含。用 `maxBottom <= clientH` 判断内容是否全部可见。

### CSS 压缩策略

按优先级从高到低压缩空白：

| CSS 属性 | 典型旧值 | 压缩目标 | 说明 |
|---|---|---|---|
| `.page-body` padding | `20px 24px` | `12px 16px` | 最大收益来源 |
| `.card` padding | `16px` | `12px` | 每个 card 省 8px |
| `.card` margin-bottom | `12px` | `0` | 用 `.card + .card { margin-top: 8px }` 替代 |
| `.card-title` margin-bottom | `10px` | `6px` | |
| `.form-row` margin-bottom | `10px` | `6px` | |
| `.settings-divider` margin | `16px 0 10px` | `10px 0 6px` | 两个 divider 省 ~12px |
| `.settings-divider` padding-top | `12px` | `8px` | |
| `.section-subtitle` margin-bottom | `8px` | `4px` | |
| `.grid-2col` gap | `8px` | `6px` | |
| `.mb-12` margin-bottom | `12px` | `8px` | |
| `.border-top-sep` padding-top | `12px` | `8px` | |
| `.stats-grid` gap | `10px` | `8px` | |
| `.stats-grid` margin-bottom | `12px` | `8px` | |
| `.stat-card` padding | `14px 16px` | `10px 12px` | |
| `.stat-card .value` font-size | `24px` | `18px` | 减小行高 |
| `.form-row` gap | `12px` | `10px` | |

### stat-card 高度异常诊断

stat-card 高度异常高（如 167px）时，检查：
1. `font-size` 和 `line-height` — 中文环境下 24px font-size 行高可达 40px+
2. `padding` — 上下 padding 直接叠加
3. `grid-template-columns` — 窄宽度下列数少，每列被拉伸

```javascript
// 检查 stat-card 实际高度组成
const sc = document.querySelector('#settingsStats .stat-card');
const cs = getComputedStyle(sc);
const v = sc.querySelector('.value');
const vs = getComputedStyle(v);
console.log({ cardH: sc.offsetHeight, padding: cs.padding, valueFontSize: vs.fontSize, valueLineHeight: vs.lineHeight, valueH: v.offsetHeight });
```

### Browser Tool CSS 缓存问题

**browser tool 有独立缓存机制**，修改 style.css 后：
1. browser tool 可能仍加载旧版 CSS
2. 用 `getComputedStyle()` 验证实际生效的 CSS 值
3. 强制刷新 CSS：`document.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.href = l.href.split('?')[0] + '?t=' + Date.now())`
4. 刷新后等 2 秒再测量高度
5. **browser tool 中验证 ≠ 用户浏览器也能看到**，始终要让用户硬刷新（Ctrl+Shift+R）

### 验证标准

- `maxBottom <= clientH`（内容全部可见）
- 无滚动条（或滚动条可忽略的 < 20px）
- 视觉上无明显多余空白
