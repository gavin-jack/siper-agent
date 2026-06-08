# .gitignore 运行时文件管理

## 规则

**运行时生成的文件不应提交到 git。** 必须在 `.gitignore` 中明确列出。

## 必须忽略的文件

```
# 会话数据库（运行时生成，每次对话都会变化）
agents/*/sessions.db
agents/*/sessions.db-journal
agents/*/sessions.db-wal

# Agent 运行时元数据
agents/*/meta.json

# 模型配置（含 API Key，不应提交）
models.json

# 环境变量（含敏感信息）
.env
```

## 常见陷阱

1. **sessions.db 被意外提交**：如果之前已提交，需要 `git rm --cached` 移除
2. **.env 重复条目**：检查 .gitignore 中是否有重复的 `.env`
3. **models.json 含 API Key**：即使 Key 被屏蔽显示，实际文件中仍有明文 Key

## 诊断命令

```bash
# 检查哪些运行时文件被 git 跟踪
git ls-files agents/*/sessions.db models.json .env

# 从 git 中移除但保留本地文件
git rm --cached agents/default/sessions.db
```

## 注意

用户明确要求："模型配置、对话数据等非可以初始化生成的文件，不要保存到 git"。
这意味着这些文件应该加入 .gitignore，而不是提交到仓库。
