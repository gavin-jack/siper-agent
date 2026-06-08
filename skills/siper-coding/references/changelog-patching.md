# CHANGELOG.md 编辑陷阱

## 问题：patch 工具匹配 CHANGELOG 表格行时多处命中

### 现象
修改 CHANGELOG.md 中的某一行时，patch 工具返回 `Found 26 matches for old_string`。

### 根因
CHANGELOG.md 使用 Markdown 表格格式，每行格式为 `| 类型 | 描述 | commit |`。其中：
- 类型 emoji（如 `🐛`）在文件中大量重复
- 短描述文本可能与其他行相似
- 管道符 `|` 是表格的常规分隔符，不具备区分度

### 解决方案（优先级从高到低）

#### 1. 增加上下文行（推荐）
使用前后各 2-3 行作为上下文，使 `old_string` 唯一。包含 commit hash 作为锚点。

#### 2. 使用 commit hash 作为锚点
commit hash（如 `2aa8001`）在文件中是唯一的，包含它可确保匹配唯一。

#### 3. 使用 V4A patch 格式
当 replace 模式无法精确匹配时，使用 `mode='patch'` 的 V4A 格式：
```
*** Update File: /home/gavin/.siper/CHANGELOG.md
@@ context hint @@
 | 🐛 | 修复网关页面"重启全部"按钮引号转义错误 | `2aa8001` |
+| 🐛 | 修复 page-chat.js 中重复 let 声明导致 SyntaxError | `14a2203` |
+| 🔧 | 静态文件缓存策略优化 + cache-buster | `14a2203` |
*** End Patch
```

#### 4. 追加行时使用行号定位
读取文件确认目标行的行号，使用包含行号附近唯一内容的上下文。

### 预防建议
- CHANGELOG 表格中每条记录的描述应足够详细
- commit hash 始终包含在表格中作为唯一标识符
- 编辑前先 `grep -n "描述关键词" CHANGELOG.md` 确认匹配数量
