# 文件备份与恢复模式

## 概述

修改关键配置文件前必须备份。当文件被意外清空或损坏时，可从 `.bak` 恢复。

## 备份策略

SiPer 项目中以下文件有 `.bak` 备份：
- `agents/default/soul.md` → `soul.md.bak`
- `agents/default/agent.md` → `agent.md.bak`

## 恢复方法

```bash
# 检查备份是否存在
ls -la agents/default/*.bak

# 检查文件大小（确认备份非空）
wc -c agents/default/soul.md.bak

# 恢复
cp agents/default/soul.md.bak agents/default/soul.md
```

## 实际案例（v0.9.47）

`soul.md` 被意外清空为 0 字节，前端 textarea 显示 `placeholder="加载中..."`。

诊断：
```bash
# 1. 检查 API 返回
curl -s http://localhost:9724/api/agents/default/soul
# → {"name": "default", "soul": ""}  ← 空字符串

# 2. 检查文件
wc -c agents/default/soul.md
# → 0 agents/default/soul.md  ← 文件为空

# 3. 检查备份
wc -c agents/default/soul.md.bak
# → 5580 agents/default/soul.md.bak  ← 备份完整

# 4. 恢复
cp agents/default/soul.md.bak agents/default/soul.md
```

## 规则

1. **修改任何 agent 文件前先备份**：`cp file file.bak`
2. **备份文件应保留在同级目录**，命名格式 `.bak`
3. **定期清理过期备份**，避免磁盘浪费
4. **恢复后验证**：检查文件大小和内容是否符合预期
