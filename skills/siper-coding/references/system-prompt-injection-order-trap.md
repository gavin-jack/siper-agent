# System Prompt 注入顺序陷阱

## 问题描述

在 `_get_system_prompt()` 中注入动态内容（如当前模型名）时，如果注入位置在 memory 注入之后，当 memory 配置为 `after_system` 时会提前 `return`，导致动态内容不被包含。

## 错误模式

```python
def _get_system_prompt(self, ...):
    base = self._soul_content or self._agent_config_content or default
    
    # Memory 注入（可能提前 return）
    if memory_block:
        return base + '\n\n' + memory_block  # ← 提前返回！
    
    # 动态模型名注入（永远不会执行到这里如果 memory 存在）
    if self.llm_client:
        base += f"\n\n## 当前运行模型\n- 模型：{self.llm_client.model}"
    
    return base
```

## 正确模式

```python
def _get_system_prompt(self, ...):
    base = self._soul_content or self._agent_config_content or default
    
    # 1. 先注入动态内容（model info 等）
    if self.llm_client:
        base += f"\n\n## 当前运行模型\n- 模型：{self.llm_client.model}"
    
    # 2. 再注入 memory（提前 return 也不影响 model info）
    if memory_block:
        return base + '\n\n' + memory_block
    
    return base
```

## 规则

在 `_get_system_prompt()` 中，所有动态注入内容（model name、runtime info 等）必须在 memory 注入之前。

## 实际案例（2026-08-04）

- 现象：切换模型后 SiPer 仍回答 "LongCat-2.0-Preview"
- 根因：model info 注入在 memory 注入之后，memory 配置为 `after_system` 时提前 return
- 修复：将 model info 注入移到 base prompt 确定之后、memory 注入之前
