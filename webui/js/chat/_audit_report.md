# chat/ 模块函数审计报告

## 总览

总计审阅 11 个文件、约 3120 行代码，发现 **13 处可显著简化/优化** 的函数跨 7 个文件。

| 文件 | 可优化函数数 | 高复杂度 | 中复杂度 | 低(冗余/重复) |
|------|:----:|:----:|:----:|:----:|
| stream.js | 4 | 1 | 2 | 1 |
| sidebar.js | 2 | 2 | 0 | 0 |
| message.js | 2 | 1 | 1 | 0 |
| input.js | 4 | 2 | 2 | 0 |
| thinking.js | 1 | 0 | 1 | 0 |

---

## 1. stream.js (316 行)

### 1.1 【高优先级】handleStopped 与 finalizeStream 大量重复代码

| 维度 | 评估 |
|------|------|
| handleStopped | L251-289, **39 行** |
| finalizeStream 重复部分 | ~25 行与其重叠 |
| 复杂度 | 中（含 Markdown 渲染 + DOM 清理） |
| 问题 | 两个函数都做相同的 `_chatStreamRow` Markdown 渲染、`_chatState` 重置、thinking 清理 |

**简化方案**：提取公共辅助函数 `_finalizeStreamRowToMarkdown` 和 `_cleanupStreamState`，让 `handleStopped` 和 `finalizeStream` 共用。

**简化后代码**：
```javascript
// ★ 新增：公共辅助
function _cleanupStreamRowMarkdown(text, renderMarkdown, chatRenderMarkdown, chatEscapeHtml) {
    const streamTextEl = _chatStreamRow.querySelector('.siper-stream-text');
    if (streamTextEl) {
        const parent = streamTextEl.parentElement;
        if (parent) {
            parent.innerHTML = '';
            if (text) {
                if (typeof renderMarkdown === 'function') parent.appendChild(renderMarkdown(text));
                else parent.innerHTML = chatRenderMarkdown(text);
            }
        }
    }
}

function _cleanupStreamState(text, opts = {}) {
    _cleanupStreamRowMarkdown(text, renderMarkdown, chatRenderMarkdown, chatEscapeHtml);
    setChatStreamAcc('');
    setChatStreamRow(null);
    setChatStreamBubble(null);
    _thinkingSteps.length = 0;
    setIsThinking(false);
    if (typeof updateStreamingBadge === 'function') updateStreamingBadge(_chatSessionId, false);
    resetSendState();
    _hideNewMsgIndicator();
    chatThinkingClear();
    chatThinkingHide();
}

// ★ simplified handleStopped: 39 → 18 行
export function handleStopped() {
    syncStreamFromCurrent();
    const stoppedSessionId = _chatSessionId;
    _cleanupStreamState(_chatStreamAcc);
    refreshAgentsAndRender();
    playNotifySound();
    if (_chatSessionId && stoppedSessionId && _chatSessionId !== stoppedSessionId) {
        markSessionUnread(stoppedSessionId);
    }
}

// ★ simplified finalizeStream: 原 127 行, 重复部分替换为 _cleanupStreamState 调用
//   剩余行数(不含重复)约 80 行
export function finalizeStream(data, streamSessionId) {
    // 跨会话分支保持独立（不变）
    if (streamSessionId && _chatSessionId && streamSessionId !== _chatSessionId) { ... }

    syncStreamFromCurrent();
    const text = _chatStreamAcc;
    const steps = [..._thinkingSteps];
    if (data?.usage) updateCtxFromStreamEnd(data.usage);

    if (_chatStreamRow) {
        _chatStreamRow.classList.remove('siper-stream-row');
        const cursorEl = _chatStreamRow.querySelector('.siper-stream-cursor');
        if (cursorEl) cursorEl.style.display = 'none';
        // 渲染内容...
        _renderStreamContent(_chatStreamRow, text, data);
        _renderStreamMeta(_chatStreamRow, data);
        _renderStreamAttachments(_chatStreamRow, data);
        _renderStreamActions(_chatStreamRow, data);
        // 时间戳...
    }

    _cleanupStreamState('');
    syncStreamToCurrent();
    if (data?.message_id) { /* dictBtn 已在上方统一添加 */ }
    refreshAgentsAndRender();
    playNotifySound();
    if (_chatSessionId && streamSessionId && _chatSessionId !== streamSessionId) {
        markSessionUnread(streamSessionId);
    }
}
```

---

### 1.2 【中优先级】appendStream 中 Markdown 渲染的 feature-detect 重复

| 维度 | 评估 |
|------|------|
| 当前行数 | L30-114, **85 行** |
| 复杂度 | 中（跨会话分支 + 首次 delta 创建 + 节流渲染） |
| 问题 | `typeof renderMarkdown === 'function'` 判断出现 **4 次**（appendStream × 1, finalizeStream × 2, handleStopped × 1） |

**简化方案**：引入模块级常量 `_hasRenderMarkdown = typeof renderMarkdown === 'function'`，配合辅助函数 `_renderMd(el, text)`。

```javascript
// ★ 模块级（替代跨 4 处的 typeof 检查）
const _hasRenderMarkdown = typeof renderMarkdown === 'function';
function _renderMd(el, text) {
    el.innerHTML = '';
    if (_hasRenderMarkdown) el.appendChild(renderMarkdown(text));
    else el.innerHTML = chatRenderMarkdown(text);
}

// ★ 调用处简化：
// 原: if (typeof renderMarkdown === 'function') textEl.appendChild(renderMarkdown(_streamAcc));
//     else textEl.innerHTML = chatRenderMarkdown(_streamAcc);
// 新:
_renderMd(textEl, _streamAcc);
```

---

### 1.3 【低优先级】buildThinkingDetails 可与 chatThinkingAddToolStep 共用

| 维度 | 评估 |
|------|------|
| 当前行数 | L294-316, **23 行** |
| 复杂度 | 低 |
| 问题 | 渲染 thinking steps 时需两次 DOM 操作构建 icon+name 行，可提取渲染函数 |

```javascript
// ★ 提取公共 helper
function _renderThinkingStepRow(step, isDetail) {
    if (step.type === 'text') {
        const row = document.createElement('div');
        row.className = isDetail ? 'siper-thinking-detail-text' : 'siper-thinking-text-row';
        row.textContent = step.text || '';
        return row;
    }
    if (step.toolName) {
        const row = document.createElement('div');
        row.className = isDetail ? 'siper-thinking-detail-tool' : 'siper-thinking-detail-tool';
        const icon = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '⟳';
        row.innerHTML = `<span class="siper-thinking-detail-icon">${icon}</span>
            <span class="siper-thinking-detail-name">${chatEscapeHtml(step.toolName)}</span>`;
        if (step.callId && step.callId !== step.toolName) {
            row.innerHTML += ` <span class="siper-thinking-detail-id">${chatEscapeHtml(step.callId)}</span>`;
        }
        return row;
    }
    return null;
}
```

---

## 2. sidebar.js (644 行)

### 2.1 【高优先级】selectChatSession

| 维度 | 评估 |
|------|------|
| 当前行数 | L329-440, **112 行** |
| 复杂度 | 高（DOM 缓存、agent 切换、thinking 恢复、输入恢复、model 加载等 8+ 件事） |
| 问题 | God Function — 职责过多，应拆为若干子函数 |

**简化方案** — 拆为 5 个单一职责函数：

```javascript
// 拆后:
export function selectChatSession(session, agent) {
    _prepareForSessionSwitch(session, agent);    // 前置状态重置 + 缓存
    _applySessionState(session, agent);           // 设置会话 ID + 清理旧 active
    _restoreSessionUI(session, agent);           // 恢复 header + 输入 + ctx
    _restoreThinkingPanel(session);               // 恢复思考面板
    _restoreOrLoadMessages(session);              // 消息加载或恢复缓存
}

function _prepareForSessionSwitch(session, agent) {
    setIsSending(false);
    _disableSendBtn(false);
    _hideStopBtn();
    syncStreamToCurrent();
    setThinkingSteps([]);
    setIsThinking(false);
    if (typeof _chatStreamRow !== 'undefined' && _chatStreamRow) _chatStreamRow.style.display = 'none';
    const prevSid = _chatSessionId;
    if (prevSid) _saveDomCache(prevSid);
    if (typeof saveInputCache === 'function') saveInputCache();
}

function _applySessionState(session, agent) {
    setChatSessionId(session.session_id);
    setChatCurrentAgent(agent);
    if (session.model) setChatCurrentModel(session.model);
    // ...model context window update...
    if (_chatSessionId !== session.session_id) _updateDomActiveClass(session.session_id, prevSid);
    clearSessionUnread(session.session_id);
    syncStreamFromCurrent();
    _expandedAgents.set(agent.name, true);
    if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('chat');
    _renderChatContentArea();
    if (typeof restoreInputCache === 'function') restoreInputCache(session.session_id);
    if (typeof updateSendBtns === 'function') updateSendBtns();
    if (typeof updateChatHeader === 'function') updateChatHeader();
    window.chatCtxTokens = null;
    updateCtxInfoDisplay();
}

// 每个子函数控制在 15-25 行以内
```

---

### 2.2 【高优先级】_doRenderMiddle

| 维度 | 评估 |
|------|------|
| 当前行数 | L140-265, **126 行** |
| 复杂度 | 高（sort + render + event binding 全部揉在一起） |
| 问题 | 混杂数据排序、DOM 创建、事件绑定、展开/折叠逻辑 |

**简化方案**：拆为 `renderAgentGroup` / `renderSessionItem` 两个函数，主体做 orchestration

```javascript
function _doRenderMiddle() {
    const container = document.getElementById('chatMiddleList');
    if (!container) return;
    container.innerHTML = '';
    const agents = getAgentsFromCache();
    if (!agents.length) {
        container.innerHTML = '<div class="siper-loading siper-loading--sm">加载中...</div>';
        return;
    }
    _ensureAgentsExpanded(agents);
    _sortAgents(agents);
    for (const agent of agents) _sortSessions(agent.sessions);
    for (const agent of agents) {
        container.appendChild(_buildAgentGroup(agent));
    }
    if (typeof reapplyAllStreamingBadges === 'function') reapplyAllStreamingBadges();
}

function _buildAgentGroup(agent) {
    const isExpanded = _expandedAgents.get(agent.name) === true;
    const isActiveAgent = _chatCurrentAgent?.name === agent.name;
    const group = document.createElement('div');
    group.className = 'siper-agent-group' + (isExpanded ? ' expanded' : '');
    group.appendChild(_buildAgentHeader(agent, isExpanded, isActiveAgent));
    group.appendChild(_buildSessionsWrap(agent, isExpanded));
    return group;
}

// _buildAgentHeader ~ 20 行, _buildSessionsWrap ~ 50 行, 主体仅 15 行
```

---

## 3. message.js (388 行)

### 3.1 【高优先级】chatAddMessage 双路径 + 双重 JSON.parse

| 维度 | 评估 |
|------|------|
| 当前行数 | L221-280, **60 行** |
| 复杂度 | 高（用户/Agent 两个大分支 + meta 双重 JSON.parse + 附件注入） |
| 问题 | 两个路径构建 DOM 的方式完全不同；meta 解析做了双重 JSON.parse 很可疑 |

**简化方案**：
1. 用户/Agent 的 meta 分支抽取为 `renderAgentMeta`
2. 附件注入独立为 `injectAttachments`
3. 移除双重 JSON.parse — 外层 caller 确保 meta 已是 object

```javascript
// ★ 双重 JSON.parse 的隐患：原代码 try-catch 两次 JSON.parse
// 如果 response 是 '""', 第一次 parse → "", 第二次 parse → 报错 → {}
// 应改为一次 try + 早退:
let parsedMeta = meta;
if (typeof parsedMeta === 'string') { try { parsedMeta = JSON.parse(parsedMeta); } catch { parsedMeta = {}; } }

// ★ 简化后: ~35 行（不含子函数）
export function chatAddMessage(text, isAgent, meta, timestamp, scroll, agentName, messageId) {
    try {
        const container = document.getElementById('chatMessages');
        if (!container) return null;
        const row = _buildMessageRow(text, isAgent, meta, timestamp, agentName);
        if (isAgent) _renderAgentBody(row, text, meta, messageId);
        else _renderUserBody(row, text);
        if (meta?.attachments) _injectAttachments(container, meta.attachments);
        container.appendChild(row);
        if (scroll !== false) container.scrollTop = container.scrollHeight;
        return row;
    } catch (e) {
        console.error('chatAddMessage error:', e);
        toast.error('消息显示失败');
        return null;
    }
}
```

---

### 3.2 【中优先级】chatAppendUserMsg 与 chatAppendAgentMsg 大量重复

| 维度 | 评估 |
|------|------|
| chatAppendUserMsg | L74-99, **26 行** |
| chatAppendAgentMsg | L101-151, **51 行** |
| 复杂度 | 中 |
| 问题 | 两函数都创建 div、设 className、设 innerHTML、追加动画、滚动 |

**简化方案**：提取 `_createMsgRow(className, isAgent)`，两者共享

```javascript
// ★ 共享 helper
function _createMsgBubbleRow(timeStr, isAgent, extraHtml = '') {
    const row = document.createElement('div');
    row.className = 'siper-msg-row ' + (isAgent ? 'agent' : 'user');
    row.innerHTML = `
        ${isAgent ? `<img src="/api/avatar?agent=..." class="siper-msg-avatar" ...>` : ''}
        <div class="siper-bubble-col">
            <div class="siper-msg-time">${timeStr}</div>
            <div class="siper-bubble ${isAgent ? 'agent-bubble' : 'user-bubble'}"></div>
            <div class="siper-msg-actions">
                <button class="siper-msg-action-btn" onclick="copyChatMsg(this)" title="复制">📋</button>
                <button class="siper-msg-action-btn" onclick="insertChatMsg(this)" title="嵌入">↩</button>
            </div>
        </div>
        ${extraHtml}
    `;
    return row;
}
```

---

## 4. input.js (641 行)

### 4.1 【高优先级】chatSendMessage

| 维度 | 评估 |
|------|------|
| 当前行数 | L424-494, **71 行** |
| 复杂度 | 高（防卫式 sending 状态 + 输入清空 + 用户气泡 + 文件上传 + WS payload 构建 + session touch） |
| 问题 | 一件事情有 4 个独立分支，且 `_wsSend` 出现了 3 次 |

**简化方案**：提取 `_buildAndSendPayload` + 利用非空短路

```javascript
// ★ 简化后: ~40 行
export async function chatSendMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = (input.value || input.textContent || input.innerText || '').trim();
    if (!text && !chatPendingFiles.length) return;

    if (getIsSending()) resetSendState();
    input.value = '';
    renderChatFilePreviews();
    _adjustInputHeight(input);
    chatAppendUserMsg(text || '[文件]');
    refreshAgentsAndRender();

    _enterSendingState();
    await ensureSessionReady();
    if (!_chatSessionId) { resetSendState(); return; }

    updateStreamingBadge(_chatSessionId, true);
    setIsThinking(true);
    chatThinkingShow();
    chatThinkingClear();
    chatThinkingAddTextRow('正在思考...');

    const filesToUpload = [...chatPendingFiles];
    const ok = await _sendMessagePayload(text, filesToUpload);
    if (!ok) { resetSendState(); return; }

    _touchSession(_chatSessionId);
    chatPendingFiles.length = 0;
    renderChatFilePreviews();
}

function _sendMessagePayload(text, filesToUpload) {
    if (filesToUpload.length > 0) {
        const { content, images } = _splitFilesForSend(text, filesToUpload);
        chatUploadFiles(filesToUpload).catch(e => console.error('[input] upload failed:', e));
        if (!_wsSend({ type: 'message', content, session_id: _chatSessionId, agent: _chatCurrentAgent?.name || 'default' })) return false;
        if (images.length && !_wsSend({ type: 'message', content, session_id: _chatSessionId, images, agent: _chatCurrentAgent?.name || 'default' })) return false;
    } else {
        if (!_wsSend({ type: 'message', content: text, session_id: _chatSessionId, agent: _chatCurrentAgent?.name || 'default' })) return false;
    }
    return true;
}
```

---

### 4.2 【高优先级】loadChatModels 嵌套链

| 维度 | 评估 |
|------|------|
| 当前行数 | L266-325, **60 行** |
| 复杂度 | 高（3 层 fallback: agent.models → API → global + 缓存修复） |
| 问题 | 嵌套 try/catch + if/else 形成金字塔 |

**简化方案**：使用 early return + 拆 `loadAgentModels` / `loadGlobalModels`

```javascript
// ★ 简化后: 主体约 25 行
export async function loadChatModels() {
    try {
        setCurrentModel('');
        const models = await _fetchAvailableModels();
        const noModels = !_hasModelsForCurrentAgent();
        const finalModels = models.length ? models : [];

        if (!finalModels.length && !noModels) {
            const r = await fetch('/api/models/global');
            const d = await r.json();
            finalModels.push(...(d.models || []));
        }

        const globalDefault = finalModels[0]?.name || '';
        setCurrentModel(globalDefault);
        const cur = finalModels.find(m => m.name === globalDefault);
        if (cur?.context_window) setModelContextWindow(cur.context_window);

        renderChatModelDropdown(finalModels, noModels);
        updateCtxInfoDisplay();
        updateChatHeader();
        _wireModelBtn(noModels || !finalModels.length);
    } catch (e) {
        console.error('chatLoadModels error:', e);
        toast.error(t ? t('chat.loadModelsFailed') : '模型加载失败');
    }
}
```

---

### 4.3 【中优先级】renderChatModelDropdown 重复逻辑

| 维度 | 评估 |
|------|------|
| 当前行数 | L327-382, **56 行** |
| 复杂度 | 中 |
| 问题 | `showNoModels` 和 `!models.length` 的点击 handler 完全相同（都跳转 model-settings） |

**简化方案**：合并相同分支

```javascript
// ★ showNoModels 和 !models.length 行为完全一致，合二为一
if (showNoModels || !models.length) {
    if (btnName) btnName.textContent = '未设置可选模型';
    const item = document.createElement('div');
    item.className = 'siper-model-item siper-model-item-disabled js-cursor-pointer';
    item.textContent = showNoModels
        ? '未设置可选模型，点击前往模型管理'
        : '暂无可选模型，点击前往模型管理';
    item.addEventListener('click', () => {
        closeChatModelDropdown();
        if (typeof chatSwitchPage === 'function') chatSwitchPage('model-settings');
    });
    menu.appendChild(item);
    return;
}
// 节省 ~15 行
```

---

### 4.4 【中优先级】bindChatInput 中的 inline 输入 token 计算

| 维度 | 评估 |
|------|------|
| 当前行数 | L569-619, **51 行** |
| 复杂度 | 中 |
| 问题 | `input` 事件里有 15 行 token 估算逻辑，冲淡了主体 |

**简化方案**：提取 `_estimateInputTokens(value)`

```javascript
// ★ 提取 token 估算
function _estimateAndDisplayCtx(inputValue) {
    const baseUsed = window.chatCtxTokens?.used || 0;
    const total = _chatModelContextWindow || 0;
    const inputTokens = inputValue ? Math.max(1, Math.ceil(inputValue.length / 4)) : 0;
    const estimated = baseUsed + inputTokens;
    const pct = total > 0 ? Math.min(100, Math.round((estimated / total) * 100)) : 0;
    const valEl = document.getElementById('chatCtxValue');
    const pctEl = document.getElementById('chatCtxPct');
    if (valEl) valEl.textContent = total > 0 ? fmtTokens(estimated) + '/' + fmtTokens(total) : '--/--';
    if (!pctEl) return;
    pctEl.textContent = total > 0 ? pct + '%' : '--%';
    pctEl.classList.remove('warn', 'danger');
    if (pct >= 90) pctEl.classList.add('danger');
    else if (pct >= 70) pctEl.classList.add('warn');
}
// bindChatInput 中的 input handler 从 15 行变 3 行
```

---

## 5. thinking.js (86 行)

### 5.1 【中优先级】chatThinkingAddToolStep 长链 if/else

| 维度 | 评估 |
|------|------|
| 当前行数 | L28-69, **42 行** |
| 复杂度 | 中（tool params 的 if/else chain + DOM 构建 + state 追踪） |
| 问题 | L35-42 的 if/else 链可用 Map 替代 |

**简化方案**：用查找表（Map）替代 if/else 链

```javascript
// ★ 用查找表替代 if/else 链
const _toolParamExtractors = {
    web_search:     p => p.query,
    web_extract:    p => (Array.isArray(p.urls) ? p.urls.length : 1) + ' urls',
    execute_code:   () => 'code',
    read_file:      p => p.path,
    write_file:     p => p.path,
    patch:          p => p.path,
    skill_view:     p => p.name,
};

export function chatThinkingAddToolStep(callId, toolName, status, params, resultSummary) {
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    body.querySelector(`[data-call-id="${callId}"]`)?.remove();

    const extractor = _toolParamExtractors[toolName];
    let paramStr = params ? (extractor ? extractor(params) : Object.keys(params).join(', ')) : '';
    if (paramStr && paramStr.length > 80) paramStr = paramStr.substring(0, 77) + '...';

    let resultStr = '';
    if (status === 'completed' && resultSummary) {
        resultStr = resultSummary.length > 100 ? resultSummary.substring(0, 97) + '...' : resultSummary;
    }

    const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⟳';
    const iconClass = status === 'completed' ? 'done' : status === 'failed' ? 'error' : 'running';

    const step = document.createElement('div');
    step.className = 'siper-thinking-step';
    step.dataset.callId = callId;
    step.innerHTML = `
        <span class="siper-thinking-step-icon ${iconClass}">${icon}</span>
        <span>
            <span class="siper-thinking-step-name">${chatEscapeHtml(toolName)}</span>
            ${paramStr ? `<span class="siper-thinking-step-params">(${chatEscapeHtml(paramStr)})</span>` : ''}
            ${resultStr ? `<span class="siper-thinking-step-result">${chatEscapeHtml(resultStr)}</span>` : ''}
        </span>
    `;
    body.appendChild(step);

    const steps = body.querySelectorAll('.siper-thinking-step');
    if (steps.length > 6) steps[0].remove();

    const entry = { type: 'tool', callId, toolName, status, params: paramStr, resultSummary: resultStr };
    const idx = _thinkingSteps.findIndex(s => s.type === 'tool' && s.callId === callId);
    if (idx >= 0) _thinkingSteps[idx] = entry;
    else _thinkingSteps.push(entry);
}
// 42 → 33 行，且 if/else 链从 8 条变为查表
```

---

## 6. message.js bonus: copyChatMsg 的 fallback 写法

| 维度 | 评估 |
|------|------|
| 当前行数 | L358-375, **18 行** |
| 复杂度 | 低 |
| 问题 | `navigator.clipboard.writeText` 和 `document.execCommand('copy')` 同步/异步路径不对称 |

```javascript
// ★ 使用 textarea + execCommand 作为单一 fallback（现代浏览器 clipboard API 已稳定）
window.copyChatMsg = function(btn) {
    const row = btn?.closest?.('.siper-msg-row');
    const text = row?.dataset.rawText;
    if (!text) return;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => window.toast?.success?.('已复制'));
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); window.toast?.success?.('已复制'); } catch {}
        document.body.removeChild(ta);
    }
};
```

---

## 总结：优先级执行建议

| # | 文件 | 函数 | 效果 | 优先级 |
|---|------|------|------|--------|
| 1 | stream.js | handleStopped + finalizeStream | 消除 ~30 行重复 | 🔴 高 |
| 2 | sidebar.js | selectChatSession | 112→4×15 行长子函数 | 🔴 高 |
| 3 | sidebar.js | _doRenderMiddle | 126→3×20 + 主体15 | 🔴 高 |
| 4 | message.js | chatAddMessage | 60→35+子函数 | 🔴 高 |
| 5 | input.js | chatSendMessage | 71→40 | 🟠 中高 |
| 6 | input.js | loadChatModels | 60→25 + 子函数 | 🟠 中高 |
| 7 | stream.js | feature-detect 重复 | 4处×6行→1处定义 | 🟡 中 |
| 8 | input.js | renderChatModelDropdown | 合并重复分支 -15行 | 🟡 中 |
| 9 | thinking.js | chatThinkingAddToolStep | if/else→查表 -9行 | 🟡 中 |
| 10 | message.js | 双气泡函数 | 统一 helper | 🟡 中 |
| 11 | input.js | bindChatInput token 估算 | 提取函数 | 🟢 低 |
| 12 | stream.js | buildThinkingDetails | 提取共用 helper | 🟢 低 |
| 13 | message.js | copyChatMsg cleanup | 微调 | 🟢 低 |

预计总减少代码行数：~80-100 行（含消除重复），可读性提升显著。
