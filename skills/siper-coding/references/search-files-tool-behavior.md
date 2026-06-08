# search_files 工具行为与陷阱

## 工具位置
`ai_agent/tools/search_files_tool.py`

## 核心参数
- `pattern` (必填): 正则（content）或 glob（files）
- `target`: "content" 或 "files"
- `path`: 搜索目录，默认 "."
- `file_glob`: content 模式过滤，如 "*.py"。None=搜索所有文件
- `max_depth`: 默认 10
- `limit`: 默认 50，硬上限 200

## 陷阱

### 1. file_glob=None 时包含噪音目录和二进制文件
`rglob("*")` 递归所有文件。防护：过滤 `__pycache__`、`.git`、`node_modules`、`.venv`、`venv`；二进制检测（前 8KB 含 `\x00` 则跳过）。

### 2. 文件大小限制 200KB
旧版 50KB 导致 style.css（61KB）被跳过，LLM 搜 CSS 类名找不到定义，陷入工具调用死循环。已修复为 200KB。

### 3. LLM 传 file_glob 可能过度限制
LLM 可能传 `file_glob="*.py"` 导致跳过 CSS/HTML。引导 LLM 搜索代码时不传此参数。

### 4. LLM 传 file_glob 可能过度限制
LLM 可能传 `file_glob="*.py"` 导致跳过 CSS/HTML。引导 LLM 搜索代码时不传此参数。

### 5. Placeholder 路径（v0.9.49+）
LLM 传入 `<项目目录>` 或 `<project_dir>` 作为 path 参数。必须在 execute() 开头替换为实际项目根路径，路径不存在时回退到项目根。详见 `references/placeholder-path-replacement.md`。

## 诊断
```python
import asyncio
from ai_agent.tools.search_files_tool import SearchFilesTool
async def test():
    tool = SearchFilesTool()
    r = await tool.execute({'pattern': '目标', 'path': '.', 'target': 'content'})
    print(r.data, r.metadata)
asyncio.run(test())
```

## 修改历史
| 版本 | 变更 |
|---|---|
| v0.9.49 | 文件大小 50KB→200KB，噪音目录过滤，二进制检测，去排序 |
