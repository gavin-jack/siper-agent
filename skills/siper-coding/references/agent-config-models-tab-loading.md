# Agent 模型配置 Tab 加载中永不消失（v0.9.55+）

## 症状

智能体 → 模型配置 tab 始终显示"加载中..."，默认占位符从未被替换为实际内容。

## 根因分析

三个独立问题叠加：

1. **`loadGlobalModelsForAgent()` 调用时机错误**：该函数只在 `loadAgentSettings()` 中被调用，而 `loadAgentSettings()` 有前置条件 `currentConfigAgent && agentConfigData && agentConfigData.agents`，如果条件不满足（如页面刚加载时 `agentConfigData` 还未获取），模型永远不会加载。

2. **Tab 切换不触发加载**：`switchConfigAgentPageTab('models')` 只切换 CSS 显示/隐藏，不检查模型是否已加载。

3. **异步竞态**：`selectConfigAgent()` 在 `refreshConfigAgentPanel()` 中被调用（第 223 行），尝试操作 `agentDefaultChatModel`/`agentDefaultVisionModel` 等 DOM 元素。但此时 `loadGlobalModelsForAgent()` 是异步的，`renderAgentModelSection()` 还没执行，这些元素不存在。`getElementById` 返回 null，`if (chatSel)` 守卫跳过，模型引用静默丢失。

## 修复方案

### 1. 添加 `modelsLoaded` 标志 + Tab 切换触发

```javascript
let modelsLoaded = false;

function switchConfigAgentPageTab(tab) {
  // ... existing tab switching code ...
  
  // Auto-load models when switching to models tab
  if (tab === 'models' && !modelsLoaded) {
    modelsLoaded = true;
    loadGlobalModelsForAgent();
  }
}
```

### 2. 添加 `_pendingAgentModels` + `applyAgentModelRefs()`

```javascript
let _pendingAgentModels = null;

function applyAgentModelRefs() {
  if (!_pendingAgentModels) return;
  const { avail, defChat, defVision } = _pendingAgentModels;
  document.querySelectorAll('.agent-avail-mcb').forEach(cb => {
    cb.checked = avail.includes(cb.value);
  });
  const chatSel = document.getElementById('agentDefaultChatModel');
  const visionSel = document.getElementById('agentDefaultVisionModel');
  if (chatSel) chatSel.value = defChat;
  if (visionSel) visionSel.value = defVision;
}
```

### 3. 修改 `selectConfigAgent()` — 保存引用而非直接操作

```javascript
// 替换原来的直接 DOM 操作：
_pendingAgentModels = {
  avail: agent.available_models || [],
  defChat: agent.default_chat_model || '',
  defVision: agent.default_vision_model || '',
};
applyAgentModelRefs();  // 如果模型已加载，立即应用
```

### 4. 修改 `renderAgentModelSection()` — 渲染完后应用引用

```javascript
// 在函数末尾（listContainer innerHTML 设置后）添加：
applyAgentModelRefs();
```

## 验证方法

1. 刷新页面 → 点击"智能体"栏目 → 切换到"模型配置" tab
2. 检查 `agentDefaultModelSection` 和 `agentModelListSection` 的 innerHTML 不再包含"加载中..."
3. 检查 `agentDefaultChatModel.value` 和 `agentDefaultVisionModel.value` 是否正确设置
4. 检查 `.agent-avail-mcb` checkbox 是否根据 agent 配置正确勾选

## 关键陷阱

- `modelsLoaded` 是会话级标志（不是持久化），页面刷新后重置
- `applyAgentModelRefs()` 被两处调用（`selectConfigAgent` 和 `renderAgentModelSection`），`_pendingAgentModels` 为 null 时 early return，不会重复操作
- 无论 `selectConfigAgent` 和 `loadGlobalModelsForAgent` 的执行顺序如何，最终都能正确应用模型引用
