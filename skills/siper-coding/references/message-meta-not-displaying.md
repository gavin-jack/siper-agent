# 消息 Meta 信息（Token/工具/技能）不显示

## 现象

用户反馈"LLM 回复完消息后，消息信息（token、工具、技能等）不能展示全面"。

## 诊断过程

1. 检查 CSS：`.msg-meta` 样式正常（font-size: 14px, opacity: 0.8）
2. 检查 JS：`appendMeta()` 在 `addMsg()` 中被正确调用（page-chat.js:261）
3. 检查 `getMetaConfig()`：默认所有显示选项都是 true
4. 检查后端：stream_end 消息包含 usage、tool_call_steps、skills_active 等字段
5. **关键发现**：当前所有消息都是 fallback stub（LLM API 429），没有 meta 数据

## 根因

**LLM API 429（Token 额度不足）导致所有消息都是 fallback stub**，后端返回空 usage/tool_calls/skills 数据，前端没有东西可以显示。

这不是前端 bug，而是后端 LLM 不可用。

**补充根因（v0.9.65+）：`skills_active` 字段缺失**

`agent.py` 的 result 字典中缺少 `'skills_active': skills_active` 字段，导致前端 `appendMeta()` 中 `meta.skills_active` 为 undefined，显示 `🧩 skills × 0`。

检查点：
- `agent.py` 正常 result：是否包含 `'skills_active': skills_active`
- `agent.py` 异常 result：是否包含 `'skills_active': []`
- `siper_web.py` 异常 result：是否包含 `"skills_active": []`

## 诊断方法

1. 检查页面是否有 `.msg-meta` 元素：`document.querySelectorAll('.msg-meta').length`
2. 如果为 0，说明所有消息都没有 meta 数据
3. 检查最后一条消息内容：如果是中文 fallback stub，说明 LLM 调用失败
4. 检查 API Key 额度：登录 https://longcat.chat/platform/feedback
5. **检查 skills 显示**：如果显示 `🧩 skills × 0` 但实际有技能被激活，说明 `skills_active` 字段未从后端传入

## 修复方案

### 短期（解决 LLM 429）
- 充值 LongCat API 额度
- 或更换 API Key

### 长期（前端容错）
- 即使 LLM 返回空数据，前端也应显示默认 meta（如 "⏱️ 0s"）
- 考虑在 fallback stub 中添加基本的时间信息

### skills_active 字段修复（v0.9.65+）
- 在 `agent.py` 正常 result 中添加 `'skills_active': skills_active`
- 在 `agent.py` 和 `siper_web.py` 的异常 result 中添加 `"skills_active": []`
- 重启 SiPer 服务生效

## 相关代码

- `webui/static/pages/page-chat.js:309-436` — `appendMeta()` 函数
- `webui/static/pages/page-chat.js:438-447` — `getMetaConfig()` 函数
- `webui/static/pages/core.js:1709-1718` — stream_end 中构建 meta 的逻辑
- `ai_agent/core/llm_client.py:354` — LLM 重试循环（range(2)，仅 2 次尝试）
