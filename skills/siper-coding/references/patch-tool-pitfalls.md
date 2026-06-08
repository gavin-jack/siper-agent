# Patch 工具陷阱与修复模式（v0.9.84+）

## 陷阱1：Fuzzy Matching 消耗相邻行

**现象**：patch 的 `old_string` 匹配时可能消耗掉相邻的代码行，导致 `self,`、`) -> str:` 等被意外替换。

**案例**：
```python
# 意图：在 _filter_memory_by_relevance 后添加 _get_system_prompt
# old_string 包含了 return 后面的 self, 和 def 签名
# 结果：return '\n'.join(...)
#         self,        ← 这行残留
#         skills_active: ...
```

**修复**：
1. 确保 `old_string` 不包含目标区域之外的行
2. 如果 patch 后语法错误，检查残留的孤立 token（如单独的 `self,`）
3. 用 `python3 -c "import ast; ast.parse(open('file').read())"` 验证

## 陷阱2：total_chars 类型错误

**现象**：`total_chars = 0` (int)，但 `total_chars += str(content)` 尝试 int + str。

**修复**：改为 `total_chars += len(str(content))`。

## 陷阱3：方法签名被 patch 破坏

**现象**：patch 替换时把 `def method(self,` 中的 `self,` 吃掉了，导致方法签名变成 `def method(`。

**修复**：patch 后立即检查方法签名是否完整。

## 安全 patch 检查清单

每次 patch 后必须执行：
1. `python3 -c "import ast; ast.parse(open('file').read())"` — 语法检查
2. `grep -n "def " file.py` — 确认方法签名完整
3. `grep -n "self," file.py` — 确认无残留孤立 token
4. 人工检查 diff 是否只修改了预期区域
