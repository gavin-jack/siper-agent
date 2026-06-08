# HTML 类属性陷阱

## 问题描述

HTML 中不能重复使用 `class` 属性。如果写成：

```html
<div class="page-body" class="page-body-flex">
```

浏览器会**静默忽略第二个 `class` 属性**，不会报错，也不会合并类名。这导致 `page-body-flex` 类从未生效。

## 排查方法

1. 浏览器开发者工具检查元素，确认实际应用的 class
2. 用 `grep -n 'class=' <file>` 查找 HTML 中所有 class 属性
3. 检查是否有同一元素上出现多个 `class=`

## 修复

将多个 class 合并到单个 class 属性中：

```html
<!-- 错误 -->
<div class="page-body" class="page-body-flex">

<!-- 正确 -->
<div class="page-body page-body-flex">
```

## 批量修复脚本

当有大量重复 class 属性时，用 Python 脚本逐行处理：

```python
import re

path = "/home/gavin/.siper/webui/templates/index.html"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

fixed = 0
new_lines = []
for line in lines:
    classes = re.findall(r'class="([^"]+)"', line)
    if len(classes) >= 2:
        merged = " ".join(c.strip() for c in classes)
        new_line = re.sub(r'\s*class="[^"]*"', '', line)
        m = re.match(r'(\s*<\w+)', new_line)
        if m:
            insert_pos = m.end()
            new_line = new_line[:insert_pos] + f' class="{merged}"' + new_line[insert_pos:]
            fixed += 1
        new_lines.append(new_line)
    else:
        new_lines.append(line)

with open(path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)
```

## index.html 被覆盖为 shell 命令字符串

### 问题描述

使用 `write_file` 写入 `index.html` 时，如果 content 参数传的是 shell 命令字符串（如 `$(cat /tmp/xxx.html)`），文件内容会变成这个命令文本而非 HTML。页面会直接显示该字符串。

### 排查

```bash
head -3 /home/gavin/.siper/webui/templates/index.html
# 如果输出是 $(cat /tmp/xxx.html) 而非 <!DOCTYPE html>，说明被覆盖了
```

### 修复

```bash
cp /tmp/xxx.html /home/gavin/.siper/webui/templates/index.html
```

### 预防

- `write_file` 的 content 参数必须传实际文件内容，不能传 shell 命令
- 写入 index.html 前先 `read_file` 确认当前内容
- 操作后验证：`head -1 index.html` 应为 `<!DOCTYPE html>`

## 相关案例

- **会话页面右侧消失（v0.6.7）**：`page-sessions` 页面的 `page-body` 元素写了两个 class 属性，导致 `page-body-flex`（控制左右分栏布局）未生效，`session-preview` 被挤压或隐藏。
- **27 处双 class 属性（2026-05-17）**：之前的批量操作产生了 27 处 `class="x" class="y"`，用逐行 Python 脚本修复。
- **index.html 显示 shell 命令（2026-05-17）**：文件被覆盖为 `$(cat /tmp/index_renamed.html)`，页面直接显示该字符串。从 `/tmp/index_renamed.html` 恢复。

## 相关案例

- **会话页面右侧消失（v0.6.7）**：`page-sessions` 页面的 `page-body` 元素写了两个 class 属性，导致 `page-body-flex`（控制左右分栏布局）未生效，`session-preview` 被挤压或隐藏。
- **27 处双 class 属性（2026-05-17）**：之前的批量操作产生了 27 处 `class="x" class="y"`，用逐行 Python 脚本修复。
- **index.html 显示 shell 命令（2026-05-17）**：文件被覆盖为 `$(cat /tmp/index_renamed.html)`，页面直接显示该字符串。从 `/tmp/index_renamed.html` 恢复。

---

## CSS `!important` 覆盖内联样式的陷阱

### 问题描述

当 CSS 中有 `.hidden { display: none !important; }` 时，用 JS 设置 `element.style.display = 'flex'` **无法覆盖** `!important` 规则。

`!important` 的优先级高于内联样式（`style` 属性），这与直觉相反。

```js
// ❌ 无效 — !important 优先级更高
container.style.display = 'flex';
// computed style 仍然是 none

// ✅ 正确 — 移除 !important 规则所在的 class
container.classList.remove('hidden');
```

### 排查方法

1. 浏览器 DevTools → Elements → Computed → 查看 `display` 实际值
2. 检查 Styles 面板中是否有 `!important` 规则
3. 用 `window.getComputedStyle(el).display` 获取实际计算值

### 修复原则

- **永远不要**用 `element.style.display` 去覆盖带 `!important` 的 CSS 规则
- 应该操作 class：`classList.add()` / `classList.remove()` / `classList.toggle()`
- 这也适用于其他 `!important` 属性（`visibility`、`opacity`、`position` 等）

### 相关案例

- **附件缩略图不显示（2026-05-18）**：`filePreviewContainer` 初始有 `hidden` class（`display: none !important`），`renderFilePreviews()` 用 `container.style.display = 'flex'` 显示，但被 `!important` 覆盖，容器始终不可见。修复：改为 `container.classList.remove('hidden')`。

---

## `search_files` 内容搜索对 JS 文件失效

### 问题描述

`search_files(target='content')` 在 `/home/gavin/.siper/webui/static/` 目录下的 JS 文件中**持续返回 0 结果**，即使文件存在且包含匹配内容。

```python
# ❌ 返回 0 结果
search_files(path='/home/gavin/.siper/webui/static', pattern='stream_delta', target='content')

# ✅ 用 terminal grep 替代
terminal("grep -rn 'stream_delta' /home/gavin/.siper/webui/static/ --include='*.js'")
```

### 排查方法

1. 先用 `search_files(target='files')` 确认文件存在
2. 再用 `terminal(grep -rn ...)` 搜索内容

### 修复原则

- JS/CSS 文件内容搜索 → 统一用 `terminal(grep -rn ...)`
- 文件名搜索 → `search_files(target='files')` 正常可用
- Python 文件内容搜索 → `search_files` 可能正常（未验证）

---

## 兄弟 Subagent 并发修改文件警告

### 问题描述

当 patch 工具返回 `_warning` 提示文件被兄弟 subagent 修改过时，**必须重新 read_file 确认最新内容**再继续操作，否则可能基于过期行号写入，导致代码错位或丢失。

```
_warning: "...was modified by sibling subagent... Re-read the file before writing."
```

### 修复原则

- 看到此 warning → 立即 `read_file` 重新读取 → 重新定位 old_string → 再 patch
- 不要忽略 warning 继续操作

## 预防措施

- 修改 HTML 时，用 `grep -n 'class='` 检查是否有重复
- 使用 patch 工具时，注意 old_string 的精确匹配，避免意外产生重复 class
- 修改后在浏览器中验证布局是否正常
- 写入 index.html 后立即验证文件头部是 `<!DOCTYPE html>`
- JS 内容搜索用 `terminal(grep)` 而非 `search_files`
- 收到 sibling subagent warning 后必须重新 read_file
