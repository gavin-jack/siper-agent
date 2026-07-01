# 贡献指南

感谢你对 SiPer 的贡献！

## 如何贡献

### 报告 Bug

使用 [Bug 报告模板](ISSUE_TEMPLATE/bug_report.md) 提交 Issue。

### 请求功能

使用 [功能请求模板](ISSUE_TEMPLATE/feature_request.md) 提交 Issue。

### 提交 Pull Request

1. Fork 仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交变更：`git commit -m "feat: 描述"`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 PR，使用 [PR 模板](PULL_REQUEST_TEMPLATE.md)

## 开发规范

### Python 后端

- Python 3.8+，纯 stdlib + openai/websockets/jinja2
- 禁止 `python3 -c`，写入 .py 文件再执行
- 所有用户输入必须 `escapeHtml`
- WS 消息校验 `d.type`，未知类型忽略
- 文件操作禁止路径穿越

### JS 前端

- ESM 模块化，44 个文件
- JS 禁止硬编码样式，统一放 CSS
- CSS 颜色必须通过 `var()` 引用
- 删除函数时必须清理所有引用点

### Commit 规范

```
feat: 新功能
fix: Bug 修复
refactor: 重构
docs: 文档
chore: 杂务
```

## Code Review

所有 PR 需要至少一次 review 才能合并。

## License

提交贡献即表示你同意在 MIT License 下授权。
