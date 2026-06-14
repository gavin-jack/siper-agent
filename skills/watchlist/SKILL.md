---
name: tv-watchlist
description: 管理用户电视剧观看记录，支持添加、删除、查看已看剧集
version: "1.0.0"
author: SiPer
triggers:
  keywords: ["观看记录", "已看", "追剧", "watchlist", "观看列表", "看过的剧", "标记已看", "记录观看"]
  patterns:
    - "记录.*观看"
    - "标记.*已看"
    - "已看.*列表"
    - "观看.*记录"
    - "watchlist"
    - "add.*watch"
    - "mark.*watched"
  semantic: "用户需要管理电视剧的观看记录，包括添加已看剧集、查看已看列表、删除记录等"
capabilities: [watchlist_add, watchlist_remove, watchlist_list, watchlist_check]
when_to_use: "当用户需要记录已看剧集、查看已看列表、管理观看记录时使用"
requires:
  tools: ["read_file", "write_file", "memory"]
metadata:
  siper:
    priority: 8
    token_budget: 400
---

# TV Watchlist Skill — 电视剧观看记录管理

## 何时使用
当用户需要管理电视剧观看记录时使用此技能。包括：
- 记录已看剧集
- 查看已看列表
- 删除观看记录
- 检查某剧是否已看

## 数据存储
观看记录存储在 agent 数据目录下的 `watchlist.json` 文件中：
- 路径：`agents/tv-recommender/watchlist.json`
- 格式：JSON 数组，每个元素为一个剧集对象

### 剧集对象结构
```json
{
  "title": "剧名（中文）",
  "original_title": "原名（如有）",
  "year": 2024,
  "genre": ["类型1", "类型2"],
  "rating": 9.2,
  "watched_at": "2024-01-15",
  "notes": "用户备注（可选）"
}
```

## 执行步骤

### 1. 获取已看列表
1. 读取 `agents/tv-recommender/watchlist.json`
2. 如果文件不存在，返回空列表
3. 返回 JSON 数组

### 2. 添加观看记录
1. 读取现有列表
2. 检查是否已存在（按 title + year 匹配）
3. 如不存在，添加新记录
4. 写回文件
5. 确认添加成功

### 3. 删除观看记录
1. 读取现有列表
2. 按 title 匹配找到目标
3. 删除该记录
4. 写回文件
5. 确认删除成功

### 4. 检查是否已看
1. 读取现有列表
2. 按 title（模糊匹配）检查
3. 返回 true/false

## 工具选择
| 操作 | 工具 |
|------|------|
| 读取列表 | read_file |
| 写入列表 | write_file |
| 持久化偏好 | memory |

## 注意事项
- 文件路径固定为 `agents/tv-recommender/watchlist.json`
- 写入操作会覆盖同名文件
- 剧名匹配使用模糊匹配（包含关系）
- 年份用于区分同名剧集的不同版本
