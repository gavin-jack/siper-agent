---
name: file-operations
description: Read, write, and manage files on the local filesystem with safety checks
version: "1.0.0"
author: SiPer
triggers:
  keywords: ["文件", "读写", "file", "read", "write", "目录", "folder", "path", "创建文件", "删除文件", "修改文件", "读取文件", "写入文件", "list", "directory", "create file", "delete file", "modify file"]
  patterns:
    - "读取.*文件"
    - "写入.*文件"
    - "创建.*文件"
    - "删除.*文件"
    - "修改.*文件"
    - "read.*file"
    - "write.*file"
    - "create.*file"
    - "delete.*file"
    - "list.*directory"
    - "list.*files"
  semantic: "用户需要对文件进行读写、创建、删除、修改等操作，或需要列出目录内容"
capabilities: [file_read, file_write, file_manage, directory_list]
when_to_use: "当用户需要读取文件内容、写入文件、创建/删除/修改文件、列出目录内容、检查文件是否存在时使用"
requires:
  tools: ["read_file", "write_file", "list_dir", "search_files"]
metadata:
  siper:
    priority: 8
    token_budget: 400
---

# File Operations Skill

## 何时使用
当用户需要对文件系统进行操作时使用此技能。包括：
- 读取文件内容
- 写入或创建文件
- 删除或修改文件
- 列出目录内容
- 搜索文件

## 执行步骤
1. **确定操作类型**：读/写/创建/删除/列表/搜索
2. **路径安全检查**：确保路径合法，防止路径穿越
3. **执行操作**：调用对应工具
4. **返回结果**：操作结果或文件内容

## 安全规则
- **禁止路径穿越**：路径不能包含 `..` 或指向系统敏感目录
- **写入前确认**：覆盖已有文件前需确认
- **大小限制**：读取大文件时分块处理

## 工具选择
| 操作 | 工具 |
|------|------|
| 读取文件 | read_file |
| 写入文件 | write_file |
| 列出目录 | list_dir |
| 搜索文件 | search_files |
| 查找内容 | search_files (content mode) |

## 注意事项
- 文件路径使用绝对路径或相对于项目根目录的路径
- 大文件（>1MB）读取时注意内存
- 写入操作会覆盖同名文件
