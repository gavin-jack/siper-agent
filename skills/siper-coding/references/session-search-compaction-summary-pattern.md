# session_search 返回 Compaction Summary 时的处理模式

## 问题
session_search 返回的结果通常是 compaction summary，原始用户消息被压缩在 `## Active Task` 等字段中。

## 正确处理流程
1. session_search(query="关键词", limit=20, sort="oldest")
2. 结果文件在 /tmp/hermes-results/call_*.txt，用 read_file 分段读取
3. 从 content JSON 中提取：## Active Task（最可靠）、User asked: "..."、## Pending User Asks
4. 用 terminal grep 快速定位关键内容
5. 整理成清单回复，不要主动修改代码

## 关键规则
- 用户说"不要改动代码"时严格遵守
- ## Active Task 是最可靠的原始请求来源
- 结果文件可能很大（数MB），需要 offset/limit 分段读取

## 版本历史
- v0.9.68: 首次记录