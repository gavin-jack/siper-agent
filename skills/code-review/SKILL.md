---
name: code-review
description: Review code for bugs, security issues, style violations, and suggest improvements
version: "1.0.0"
author: SiPer
triggers:
  keywords: ["代码审查", "code review", "review", "检查代码", "bug", "安全", "漏洞", "优化代码", "重构", "refactor", "代码质量", "code quality", "审计", "audit"]
  patterns:
    - "审查.*代码"
    - "检查.*代码"
    - "review.*code"
    - "代码.*有问题"
    - "代码.*优化"
    - "代码.*重构"
    - "find.*bug"
    - "check.*code"
  semantic: "用户需要对代码进行审查、查找bug、检查安全漏洞、优化代码质量、重构建议"
capabilities: [code_review, bug_detection, security_audit, refactoring]
when_to_use: "当用户需要审查代码、查找bug、检查安全漏洞、优化代码质量、获得重构建议时使用"
requires:
  tools: ["read_file", "search_files"]
metadata:
  siper:
    priority: 6
    token_budget: 600
---

# Code Review Skill

## 何时使用
当用户需要对代码进行审查时使用此技能。包括：
- 查找代码中的 bug
- 检查安全漏洞
- 代码风格审查
- 性能优化建议
- 重构建议

## 执行步骤
1. **获取代码**：读取用户指定的文件或代码片段
2. **分析代码**：
   - 语法错误检查
   - 逻辑错误检查
   - 安全漏洞扫描（SQL注入、XSS、路径穿越等）
   - 代码风格评估
   - 性能问题识别
3. **生成报告**：列出发现的问题，按严重程度排序
4. **提供建议**：给出具体的修复建议

## 审查维度
| 维度 | 检查项 |
|------|--------|
| 正确性 | 逻辑错误、边界条件、空值处理 |
| 安全性 | 注入攻击、路径穿越、权限控制 |
| 性能 | 不必要的循环、内存泄漏、N+1查询 |
| 可读性 | 命名规范、注释、复杂度 |
| 可维护性 | 耦合度、重复代码、魔法数字 |

## 输出格式
```
## 代码审查报告

### 🔴 严重问题 (必须修复)
- ...

### 🟡 警告 (建议修复)
- ...

### 🟢 建议 (可选优化)
- ...
```

## 注意事项
- 不要只指出问题，要给出具体的修复建议
- 区分"必须修复"和"建议优化"
- 对于大型项目，优先审查核心模块
