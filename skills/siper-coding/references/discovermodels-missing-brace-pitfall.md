# discoverModels() 缺少闭合大括号陷阱（v0.9.87m+）

## 问题描述

多次 patch `discoverModels()` 函数后，`finally` 块的闭合 `}` 被当作函数体的闭合 brace，导致函数缺少自己的 `}`。

## 症状

```bash
node -c page-settings.js
# SyntaxError: Unexpected end of input
```

## 根因

patch 工具删除 `verifyAllModels()` 调用时，old_string 包含了 `finally {` 块和函数闭合 `}` 之间的内容。patch 后 `finally` 的 `}` 被消耗，函数体缺少闭合 brace。

## 修复

在函数末尾添加缺失的 `}`：

```javascript
    } // finally
} // discoverModels ← 这个 brace 必须存在
```

## 预防

1. **每次 patch 后必须 `node -c <file>` 验证语法**
2. 删除函数内代码时，old_string 不要包含函数体的结构 brace
3. 复杂函数修改时，先读取完整函数体，确认 brace 匹配再 patch
4. 用深度计数法排查：每个 `{` +1，每个 `}` -1，最终应为 0
