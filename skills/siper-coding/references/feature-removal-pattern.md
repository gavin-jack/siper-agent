# 前端功能移除模式

## 场景

需要从 Siper 前端彻底移除一个功能模块（如会议、Token 统计等）。

## 步骤

### 1. 定位所有引用

```bash
# 在全部前端文件中搜索功能关键词
grep -rn "keyword" webui/templates/index.html
grep -rn "keyword" webui/static/app.js
grep -rn "keyword" webui/static/pages/
grep -rn "keyword" webui/static/style.css
```

### 2. 按依赖顺序删除（从叶子到根）

1. **删除独立 JS 页面文件**（如 `page-meeting.js`）
2. **删除 index.html 中的页面 HTML 块**（用 Python 脚本按行号范围删除）
3. **删除 index.html 中的 script 引用**（`<script src="/static/pages/page-xxx.js">`）
4. **删除 app.js 中的 JS 函数块**（从 `let xxxPollTimer` 到结束标记）
5. **删除 app.js / core.js 中的 i18n 条目**（`'xxx.yyy': 'zzz',` 格式）
6. **删除 style.css 中的 CSS 规则块**（从注释到最后一个相关规则）
7. **删除导航条目**（`nav.xxx` i18n 条目）

### 3. 验证

```bash
# 确认无残留
grep -rn "keyword" webui/templates/ webui/static/ --include="*.html" --include="*.js" --include="*.css"
# 应返回空
```

### 4. 重启验证

```bash
kill <siper_pid>
# 重启 siper
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9724/
# 应返回 200
curl -s http://127.0.0.1:9724/ | grep -i "keyword"
# 应无匹配
```

## 注意事项

- **i18n 条目跨多语言块**：app.js 和 core.js 各有 zh/en/tw 三个语言块，每个块都有独立的 i18n 条目，必须全部删除。
- **JS 函数块可能很长**：用内容标记（如 `// ===== Meeting Room =====` 注释）定位起止，比行号更可靠。
- **删除后行号会偏移**：如果按行号删除多段，从后往前删或一次性标记所有要删的行号。
- **`rm` 需要审批**：用 `mv /path/to/file /tmp/file.deleted` 代替 `rm`。
- **空 catch 块**：`catch (e) {}` 在 `JSON.parse(localStorage)` 中是合理的（首次访问无数据），不要改为 console.error。
