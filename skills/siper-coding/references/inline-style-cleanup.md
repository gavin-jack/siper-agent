# 内联样式清理模式

## 背景

随着功能迭代，大量 `style="..."` 内联样式堆积在 HTML 模板和 JS 文件中，导致：
- 样式散落在 HTML/JS 中难以维护
- 同样样式重复写多次
- 优先级高于 CSS 文件，容易被意外覆盖
- JS 中 `style.cssText` 字符串与 HTML 内联样式同样有害

## 清理范围

### 1. index.html（模板）

**统计内联样式：**
```python
import re
from collections import Counter

with open('webui/templates/index.html', 'r') as f:
    html = f.read()

styles = re.findall(r' style="([^"]+)"', html)
counts = Counter(styles)
for style, count in counts.most_common():
    print(f"{count}x  {style[:80]}")
```

**批量替换策略：** 高频样式 → 通用工具类，中频 → 语义类，低频 → 专属类。

### 2. page-*.js / core.js（动态 DOM）

JS 中的内联样式分两类：

**A. style.cssText 字符串（可提取）：**
```javascript
el.style.cssText = 'display:flex;align-items:center;gap:6px';
// → el.className = 'session-header'
```

**B. 动态值（保留）：**
```javascript
// 动态 CSS 变量值 — 合理保留
el.style.cssText = 'color:' + C.textDim + ';font-style:italic;';
// 动态计算值 — 合理保留
text.style.setProperty('--scroll-distance', (el.clientWidth - text.scrollWidth) + 'px');
```

**检测方法：**
```bash
grep -n 'style="' webui/static/pages/*.js
grep -n 'style\.cssText' webui/static/pages/*.js
grep -n 'style\.display' webui/static/pages/*.js
```

**注意：** `style.setProperty('--var', value)` 用于 CSS 变量，通常是合理的动态样式，不要强制提取。

### 3. JS 中 style.display → classList 替换

**反模式（旧代码）：**
```javascript
contents.forEach(c => c.style.display = 'none');
el.style.display = '';
```

**正确模式：**
```javascript
contents.forEach(c => c.classList.add('hidden'));
el.classList.remove('hidden');
```

**前提：** CSS 中 `.hidden` 不能有 `!important`，否则 classList 也无法覆盖。

## CSS 类命名规范

| 类别 | 命名模式 | 例子 |
|------|---------|------|
| 显示/隐藏 | `.hidden` | `display: none` |
| 宽度 | `.w-full`, `.w-100` | `width: 100%` |
| 弹性布局 | `.flex-center`, `.flex-wrap` | `display: flex; align-items: center` |
| 网格 | `.grid-2col`, `.grid-3col` | `display: grid; grid-template-columns: 1fr 1fr` |
| 间距 | `.gap-4`, `.mb-10`, `.mt-8` | `gap: 8px`, `margin-bottom: 10px` |
| 文本 | `.text-10`, `.text-dim-small` | `font-size: 10px` |
| 组件 | `.modal-overlay`, `.modal-box` | 弹窗、分页等 |
| 功能 | `.settings-empty-msg` | 特定功能相关 |

## 新增 CSS 类（v20260803b 添加）

### 模型管理
- `.models-grid` — 模型卡片网格（4列）
- `.discover-result-header` — 发现结果头部 flex 布局
- `.discover-count` — 发现数量高亮
- `.btn-discover-add-all` — 全部添加按钮
- `.cap-checkbox-label` — 能力标签 checkbox 行内布局

### 编辑弹窗
- `.edit-modal-dialog` — max-width:480px
- `.edit-modal-body/.row/.label/.input/.input-sm/.caps/.details/.summary/.advanced`

### Copy Name Modal
- `.copy-name-modal-overlay/.box/.title/.input/.footer`

### 会话列表/预览
- `.session-left/.header/.time/.active-badge/.last-msg`
- `.preview-top-bar/.info/.msgs/.msg-wrap/.msg-user/.msg-agent/.msg-label/.msg-bubble/.msg-bubble-user/.msg-bubble-agent`

### 空状态
- `.sessions-empty-msg/.hint/.err`
- `.settings-empty-msg/.err`

### 其他
- `.vision-warning-title/.close`
- `.msg-avatar-hidden`
- `.settings-divider-mt/.model-count`
- `.grid-2col-mb-sm/.form-input-cursor`

## 陷阱

- **script 标签内的 style**：`<script>` 标签中的 `style=` 不是内联样式，不要替换。
- **已有 class 冲突**：如果元素已有 `class="..."`，直接追加 class 值即可。
- **display:none 分号变体**：注意 `style="display:none"` 和 `style="display:none;"` 两种写法。
- **patch 工具误操作**：new_string 中不要包含 CSS 规则（会写入 HTML/JS）。CSS 规则应单独追加到 style.css。
- **JS 压缩格式 CSS**：SiPer 的 style.css 可能是压缩格式（一行多个规则），patch 时需要用精确匹配，不能用 replace_all。
- **core.js 中的语法高亮内联样式**：`renderValue()` 函数中的 `style="color:..."` 是动态 CSS 变量值，属于功能性内联样式，不要提取。
- **style.setProperty('--var')**：用于 CSS 变量的动态设置，合理保留。

## CSS 死代码检测

```bash
cd webui/static
for css_class in $(grep -oP '^\.[\w-]+' style.css | sed 's/^\.//' | sort -u); do
  count=$(grep -r "$css_class" ../templates/ ../pages/ --include="*.html" --include="*.js" | grep -v "style.css" | grep -c "$css_class" 2>/dev/null)
  if [ "$count" -eq 0 ]; then echo "UNUSED: .$css_class"; fi
done
```

## 历史数据

### index.html 清理（v0.9.85 系列）
- 清理前：149 处 → 清理后：0 处
- 新增 CSS 规则：约 78 条

### JS 文件清理（v20260803b）
- page-settings.js：28 处 → 0 处
- page-chat.js：3 处 → 0 处
- page-sessions.js：4 处 → 0 处
- core.js：功能性内联样式保留
- index.html：6 处 → 0 处
- 新增 CSS 规则：约 45 条
