---
name: company-research
description: 专业的企业情报调研技能，从互联网多渠道采集、交叉验证、深度分析公司信息。
version: "1.0.0"
author: SiPer
triggers:
  keywords: ["公司调研", "企业分析", "company research", "调研公司", "分析公司", "了解公司", "查公司", "企业信息", "工商信息", "竞品分析"]
  patterns:
    - "调研.*公司"
    - "分析.*公司"
    - "了解.*公司"
    - "查.*公司"
    - "research.*company"
  semantic: "用户需要调研某家公司的基本信息、财务状况、产品业务、创始人团队、舆情风险等"
capabilities: [company_research, business_intelligence, market_analysis]
when_to_use: "当用户需要调研/分析/了解某家公司的工商信息、财务数据、产品业务、创始人团队、舆情风险时使用"
requires:
  tools: ["web_search", "web_fetch"]
metadata:
  siper:
    priority: 6
    token_budget: 800
---

# Company Research Skill - 公司调研技能

## 技能描述
专业的企业情报调研技能，从互联网多渠道采集、交叉验证、深度分析公司信息。

## 触发条件
当用户要求调研/分析/了解某家公司时触发。

## 调研流程

### Step 1: 确定调研范围
- 确认公司全称（用户可能只提供简称）
- 确认调研重点维度（全面调研 or 特定维度）
- 确认是否需要跨境电商产品调研

### Step 2: 基础信息收集
按以下顺序搜索：

```python
# 1. 工商信息搜索
web_search("{公司全称} 工商信息 天眼查")

# 2. 官方网站
web_search("{公司全称} 官方网站")
web_fetch(官网URL)

# 3. 基本信息汇总
web_search("{公司全称} 成立时间 注册资本 法人")
```

### Step 3: 深度信息挖掘
```python
# 创始人信息
web_search("{公司全称} 创始人 CEO 高管团队")

# 产品业务
web_search("{公司全称} 主营业务 产品")
web_search("{公司全称} 官网 产品中心")

# 财务信息
web_search("{公司全称} 营业收入 财务 财报")
web_search("{公司全称} 融资 估值")

# 舆情新闻
web_search("{公司全称} 最新新闻")
web_search("{公司全称} 诉讼 风险")
```

### Step 4: 跨境电商产品调研（如适用）
```python
# Amazon
web_search("site:amazon.com {品牌名}")
web_search("amazon {品牌名} store")

# 阿里巴巴
web_search("alibaba {公司英文名} supplier")
web_search("1688 {公司名} 品牌名")

# 其他平台
web_search("{品牌名} ebay shopify")
```

### Step 5: 交叉验证
- 对比不同来源的关键数据
- 标注信息可信度
- 识别矛盾信息并说明

### Step 6: 结构化输出
按报告模板输出，包含所有必要维度。

## 搜索技巧

### 处理搜索干扰
当搜索结果被无关内容污染时：
1. 使用引号精确匹配：`"公司全称"`
2. 添加行业限定词：`{公司名} + 行业关键词`
3. 使用 site 限定：`site:tianyancha.com {公司名}`
4. 尝试英文名搜索

### 处理反爬限制
当直接访问受限时：
1. 使用 web_search 代替 web_fetch
2. 尝试 web_fetch 不同的子页面
3. 使用 browser_navigate 访问
4. 搜索缓存版本：`webcache.googleusercontent.com`

## 异常处理

| 异常 | 处理方式 |
|------|----------|
| 搜索结果为空 | 尝试同义词、简称、英文名 |
| 网站无法访问 | 尝试 web_fetch 其他页面或使用搜索缓存 |
| 信息相互矛盾 | 标注矛盾，优先采用官方来源 |
| 信息严重不足 | 如实告知用户，建议提供更多线索 |
