# Agent 设置页 Tab 分离模式（v0.9.52+）

## 场景

Agent 设置页内容过多时，将模型配置部分拆分为独立 tab，保持主 tab 简洁。

## 实现模式

### 1. index.html — 添加 tab 按钮和内容容器

在 agent 设置页的 tabs 栏中添加新按钮：

```html
<!-- Tab 按钮 -->
<button class="agent-page-tab" data-tab="models" id="agentTabModels">
  🤖 模型配置
</button>

<!-- Tab 内容容器：两列布局 -->
<div class="agent-tab-content hidden" id="agentTabContentModels">
  <div class="grid-2col-12">
    <!-- 左列 -->
    <div id="agentDefaultModelSection">
      <!-- 默认模型下拉框等 -->
    </div>
    <!-- 右列 -->
    <div id="agentModelListSection">
      <!-- 可用模型 checkbox 列表 -->
    </div>
  </div>
</div>
```

### 2. CSS — 两列网格

```css
.grid-2col-12 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
```

### 3. page-agent-config.js — 迁移模型配置逻辑

将模型配置相关的 DOM 操作和事件绑定从 `initAgentConfig()` 迁移到独立初始化函数：

```js
function initAgentConfigModels() {
  // 默认模型下拉框填充
  // 可用模型 checkbox 列表渲染
  // 保存逻辑
}
```

### 4. Tab 切换联动

确保 `switchAgentPageTab()` 能正确处理新 tab：

```js
case 'models':
  document.getElementById('agentTabContentModels').classList.remove('hidden');
  document.getElementById('agentTabModels').classList.add('active');
  break;
```

## 关键陷阱

1. **新 tab 的 `hidden` 类**：初始必须是 `hidden`，否则页面加载时会同时显示两个 tab 内容
2. **`grid-2col-12` 类名**：必须全局唯一，检查是否与其他页面冲突
3. **迁移时不要删除原 tab 中的模型配置**：先在新 tab 中验证功能正常，再移除旧代码
4. **JS 文件中的 `const`/`function` 名**：迁移后检查全局作用域是否与 core.js 等冲突

## 相关文件

- `webui/templates/index.html` — tab 按钮和内容容器
- `webui/static/pages/page-agent-config.js` — 模型配置逻辑
- `webui/static/style.css` — `.grid-2col-12` 等布局类
