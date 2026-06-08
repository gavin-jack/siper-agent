# Markdown 渲染方案对比：SiPer 手写 vs Hermes Web UI（markdown-it）

## 方案概览

| | SiPer（当前） | Hermes Web UI |
|---|---|---|
| 渲染器 | 手写 regex 链（零依赖） | markdown-it 14.1.1 |
| 代码量 | ~469 行 renderMarkdown + ~152 行预处理 | 依赖库 ~2000+ 行（打包后） |
| 依赖 | 零（纯 stdlib） | markdown-it + 插件 |
| 框架 | 原生 JS，无构建步骤 | Vue 3 + Vite + Naive UI |

## SiPer 手写方案优势

1. **零依赖**：符合 SiPer 核心设计原则
2. **体积小**：~620 行 JS，gzip 后约 2-3KB
3. **可控性强**：遇到 LLM 输出格式问题可直接 patch
4. **预处理灵活**：针对 LLM 非标准输出定制处理
5. **无构建步骤**：直接编辑 .js 文件

## SiPer 手写方案劣势

1. **覆盖不全**：缺少任务列表、脚注、定义列表、表格对齐、嵌套表格、HTML 混合等
2. **维护成本高**：每遇新 LLM 格式问题需手写新逻辑，预处理代码持续增长
3. **边界情况多**：手写 regex 容易遗漏边界
4. **无标准化**：不遵循 CommonMark / GFM 规范

## Hermes Web UI（markdown-it）方案优势

1. **标准化**：基于 CommonMark + GFM，渲染结果可预测
2. **特性完整**：开箱即用支持表格、任务列表、删除线等
3. **插件生态**：可通过插件扩展（anchor、toc、mermaid 等）
4. **维护成本低**：社区维护
5. **安全性好**：内置 XSS 防护
6. **性能优**：大文档渲染更快

## Hermes Web UI 方案劣势

1. **引入依赖**：markdown-it ~15KB gzip
2. **构建步骤**：需要 npm + vite/webpack
3. **黑盒**：调试和修改不如手写直接
4. **过度工程**：大部分功能用不上

## 具体问题对比

| 问题 | SiPer（手写） | Hermes Web UI |
|---|---|---|
| text | table | 混合行 | 需手写预处理分割 | 正确识别为段落 |
| Tab 分隔数据行 | 需手写 Tab→pipe 转换 | 原生不支持 |
| Bold 跨行 | 需手写合并逻辑 | 默认不支持（符合规范） |
| 表格单元格内 code | 需确保 inline() 被调用 | 自动处理 |

## 建议

**短期**：继续优化当前手写方案（零依赖原则 + 遇到问题直接 patch）

**长期**：如果 Markdown 渲染问题持续增加，考虑：
1. 引入 markdown-it 作为可选依赖
2. 混合方案：保留手写预处理 + markdown-it 渲染
3. 轻量替代：marked（~6KB）或 micromark（~4KB）

**风险**：手写方案维护成本随 LLM 输出格式多样性线性增长。未来如需支持 Mermaid 图表、数学公式等，建议切换到 markdown-it。
