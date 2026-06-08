# Patch 工具嵌套作用域陷阱

## 描述

当用 patch 工具替换类中的方法时，如果 old_string 的边界包含了相邻方法/类的定义，替换后新方法可能被错误地嵌套到相邻的类或函数内部，导致 `object has no attribute` 错误。

## 事故经过（v20260807）

在 `agent.py` 中替换 `_load_default_skills` 方法时，patch 的 old_string 边界问题导致：

1. `_load_default_skills` 被插入到 `_MDSkillWrapper` 类内部
2. `shutdown` 方法也被插入到 `_MDSkillWrapper` 类内部
3. Python 解析器认为 `_load_default_skills` 是 `_MDSkillWrapper` 的方法
4. 运行时错误：`'AIAgent' object has no attribute '_load_default_skills'`

尝试用 patch 修复时，又产生了嵌套函数（`async def _load_default_skills` 内部又定义了 `async def _load_default_skills`），因为 patch 工具在替换时复制了方法签名。

## 根本原因

1. patch 工具的 `old_string` 必须精确到方法级别，不包含相邻的类/函数定义
2. 当替换内容包含类定义时，patch 可能将后续方法缩进到类内部
3. 多次 patch 同一区域会累积错误

## 正确做法

1. **old_string 精确边界**：只包含要替换的方法本身
2. **替换后验证**：
   ```bash
   grep -n "def \|class " file.py  # 检查缩进层级
   python3 -c "import ast; ast.parse(open('file').read())"  # 语法验证
   ```
3. **复杂替换用 execute_code**：涉及类定义移动或多层嵌套时，用 Python 字符串操作更安全
4. **恢复优先**：发现嵌套错误时，`git checkout file.py` 恢复后重新用 execute_code 修改

## 修复方法

```bash
# 1. 恢复原始文件
git checkout ai_agent/core/agent.py

# 2. 用 execute_code 做精确字符串替换
# 在 Python 脚本中用 content.replace(old, new)

# 3. 验证
python3 -c "import ast; ast.parse(open('ai_agent/core/agent.py').read())"
grep -n "def \|class " ai_agent/core/agent.py
```
