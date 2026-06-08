# JS 函数重复声明检测

## 背景

SiPer 的所有 page-*.js 和 core.js 共享全局作用域。如果同名函数在多个文件中定义，后加载的文件会覆盖先加载的版本，可能导致：
- 静默行为变化（旧版本代码被新版本覆盖）
- 调试困难（断点停在错误版本）

## 检测方法

```bash
# 列出所有文件的函数定义
cd webui/static/pages
for f in *.js; do
  echo "=== $f ==="
  grep -oP 'function \K\w+' "$f" | sort
done

# 查找重复函数名
for f in *.js; do
  grep -oP 'function \K\w+' "$f"
done | sort | uniq -d
```

## 已知重复（v20260803 发现）

| 函数名 | core.js | page-chat.js | 说明 |
|--------|---------|-------------|------|
| `cv` | ✅ | ✅ | 完全相同，page-chat.js 版本覆盖 core.js |
| `buildActionsForStream` | — | ✅ | 空函数，死代码 |

## 修复原则

1. **重复函数**：保留一个（通常是 core.js 中的），删除 page-*.js 中的副本
2. **死函数**：确认无调用后直接删除
3. **重命名优于删除**：如果两个版本功能不同，重命名其中一个

## 相关参考

- `references/duplicate-let-declaration-across-js-files.md` — 跨文件 let/const 重复声明
