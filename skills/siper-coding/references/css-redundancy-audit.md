# CSS 冗余规则清理指南

## 问题描述

style.css 随着迭代积累，可能出现以下冗余：

1. **重复的规则块**：多个子代理并发写入时，同一选择器可能出现两次
2. **死规则**：选择器嵌套错误（如 `.template-actions .card-title` 但 card-title 不在 template-actions 内）
3. **重复的 active 状态**：同一规则声明两次（如 `.sidebar-settings-toggle.active` 出现两行）
4. **可合并的规则**：属性值完全相同但选择器不同的规则

## 排查方法

```bash
# 检查特定选择器出现次数
grep -c '\.agent-tab {' style.css

# 检查重复的选择器定义
grep -n '^\.' style.css | grep -v '/\*' | awk -F: '{print $2}' | sort | uniq -d
```

## 清理策略

1. 删除完全重复的规则块（保留先出现的）
2. 删除死规则（选择器嵌套错误导致无法匹配任何元素）
3. 属性值完全相同时，保留更具体的选择器版本
4. 删除重复的 active 状态声明

## 案例：v0.6.7 冗余清理

清理了 34 行冗余：
- 827-857 行：重复的 agent-tab/agent-tab-content/fadeIn/btn-sm:hover 块（31行）
- 336 行：重复的 `.image-preview-item .remove-img:hover`（1行）
- 931 行：重复的 `.sidebar-settings-toggle.active`（1行）
- 825 行：死规则 `.template-actions .card-title`（1行）

1217 → 1183 行，53KB → 52KB

## 预防措施

- 修改 CSS 后用 `grep -n '<selector>' style.css` 验证无重复
- 避免多个子代理并发修改同一 CSS 文件
- 定期审计 style.css 结构
