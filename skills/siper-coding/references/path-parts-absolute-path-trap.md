# Path.parts 绝对路径陷阱

## 描述

`Path.parts` 返回完整绝对路径的所有组件。对于路径 `/home/gavin/.siper/skills/web-search/SKILL.md`，`parent.parts` 返回 `('/', 'home', 'gavin', '.siper', 'skills', 'web-search')`，其中包含 `.siper`。

如果用 `any(p.startswith('.') for p in path.parts)` 来排除隐藏目录，会**误判所有文件为隐藏**，因为绝对路径中常包含 `.siper`、`.hermes`、`.gradle` 等以 `.` 开头的目录名。

## 事故经过（v20260807）

在 `skill_registry.py` 的 `scan()` 方法中，用以下代码排除隐藏目录：
```python
if any(p.startswith(".") or p == "__pycache__" for p in md_path.parent.parts):
    continue
```

这导致所有 SKILL.md 文件都被排除，因为 `md_path.parent.parts` 包含 `.siper`。

## 正确做法

使用相对路径的 parts：
```python
try:
    rel_parts = md_path.parent.relative_to(self.skills_dir).parts
except ValueError:
    continue
if any(p.startswith(".") or p == "__pycache__" for p in rel_parts):
    continue
```

## 适用范围

所有需要检查路径组件是否为隐藏目录的场景，都应该使用相对路径而非绝对路径。
