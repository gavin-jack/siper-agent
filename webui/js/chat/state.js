/**
 * chat/state.js — 聊天模块共享状态 + getter/setter
 * 从 core.js 拆出，core.js 保留这些变量的引用。
 * 此文件只定义变量和 getter/setter，不处理 WS/流式/导航等逻辑。
 */

// ===== Getter/Setter: Core Chat State =====
export let _chatCurrentAgent = null;
export let _chatPendingFiles = [];
export let _isSending = false;
export let _chatAgents = [];
export let _chatExpandedAgents = {};
export let _chatSidebarExpanded = true;

// Legacy aliases (被旧代码直接引用)
export let _chatStreamAcc = '';
export let _chatStreamRow = null;
export let _chatStreamBubble = null;
export let _thinkingSteps = [];
export let _isThinking = false;

// Per-Session Streaming State
export const _streamState = new Map();

// Unread session badge
export const _unreadSessions = new Set();

// Model Selection
export let _chatCurrentModel = '';
export let _chatModelContextWindow = 8192;

// ECharts instances
export let _chatChartModel = null;
export let _chatChartDate = null;
export let _chatChartHourly = null;

// Agent Config State
export let _chatAgentData = null;
export let _chatSelectedAgent = null;
export let _agentConfigName = null;
export let _chatAgentFiles = { soul: '', config: '' };
export let _chatCurAgentFile = 'soul';

// Logs State
export let _logsData = [];

// Context Menu
export let _ctxMenu = null;

// Session Readiness
export let _sessionReady = false;

// Connection State
export let _isConnected = false;
export function setConnected(val) { _isConnected = val; }
export let _sessionWaiters = [];

// Streaming sessions (per-session streaming badge) — removed, 0 external refs
// export const _streamingSessions = new Set();

// ===== Getter/Setter: Core Chat State =====
let _chatCurrentPage = 'chat';  // internal only, no external refs

export function setCurrentPage(page) { _chatCurrentPage = page; }

export function getChatSessionId() { return _chatSessionId; }
export function setChatSessionId(sid) { _chatSessionId = sid; }

export function getChatCurrentAgent() { return _chatCurrentAgent; }
export function setChatCurrentAgent(agent) { _chatCurrentAgent = agent; }

export function setChatPendingFiles(files) { _chatPendingFiles = files; }

export function getIsSending() { return _isSending; }
export function setIsSending(val) { _isSending = val; }

export function getChatAgents() { return _chatAgents; }
export function setChatAgents(agents) { _chatAgents = agents; }

export function setChatExpandedAgents(expanded) { _chatExpandedAgents = expanded; }

export function getChatSidebarExpanded() { return _chatSidebarExpanded; }
export function setChatSidebarExpanded(v) { _chatSidebarExpanded = v; }

// ===== Getter/Setter: Streaming State =====
export function setChatStreamAcc(acc) { _chatStreamAcc = acc; }

export function setChatStreamRow(row) { _chatStreamRow = row; }

export function setChatStreamBubble(bubble) { _chatStreamBubble = bubble; }

export function setThinkingSteps(v) { _thinkingSteps = v; }

export function setIsThinking(val) { _isThinking = val; }

// ===== Getter/Setter: Model Selection =====
export function setCurrentModel(model) { _chatCurrentModel = model; }
export function setChatCurrentModel(model) { _chatCurrentModel = model; }

export function setModelContextWindow(ctx) { _chatModelContextWindow = ctx; }
export function setChatModelContextWindow(ctx) { _chatModelContextWindow = ctx; }

// ===== Getter/Setter: Agent Config State =====
export function getChatAgentData() { return _chatAgentData; }
export function setChatAgentData(data) { _chatAgentData = data; }

export function getChatSelectedAgent() { return _chatSelectedAgent; }
export function setSelectedAgent(name) { _chatSelectedAgent = name; }

export function getAgentConfigName() { return _agentConfigName; }
export function setAgentConfigName(name) { _agentConfigName = name; }

export function getChatAgentFiles() { return _chatAgentFiles; }
export function setChatAgentFiles(files) { _chatAgentFiles = files; }

export function getChatCurAgentFile() { return _chatCurAgentFile; }
export function setChatCurAgentFile(type) { _chatCurAgentFile = type; }

// ===== Getter/Setter: Logs State (removed — 0 external refs) =====

// ===== Getter/Setter: Context Menu =====
export function getCtxMenu() { return _ctxMenu; }
export function setCtxMenu(menu) { _ctxMenu = menu; }

// ===== Getter/Setter: WebSocket =====
// ws 变量保留在 core.js 中（connectWS/send 需要它）

// ===== Session Readiness =====
export function markSessionReady() {
    _sessionReady = true;
    const w = _sessionWaiters.splice(0);
    w.forEach(r => r());
}
export function resetSessionReady() {
    _sessionReady = false;
    _sessionWaiters = [];
}
export function ensureSessionReady() {
    if (_sessionReady && _chatSessionId) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Session ready timeout')), 10000);
        _sessionWaiters.push(() => { clearTimeout(timer); resolve(); });
    });
}

// ===== Per-Session Streaming Helpers =====
export function getStreamState(sessionId) {
    if (!_streamState.has(sessionId)) {
        _streamState.set(sessionId, { acc: '', row: null, bubble: null, thinkingSteps: [], thinking: false });
    }
    return _streamState.get(sessionId);
}

export function syncStreamFromCurrent() {
    const sid = _chatSessionId;
    if (!sid) { _chatStreamAcc = ''; _chatStreamRow = null; _chatStreamBubble = null; return; }
    const s = getStreamState(sid);
    _chatStreamAcc = s.acc; _chatStreamRow = s.row; _chatStreamBubble = s.bubble;
    _thinkingSteps = s.thinkingSteps || [];
    _isThinking = s.thinking || false;
}

export function syncStreamToCurrent() {
    const sid = _chatSessionId;
    if (!sid) return;
    const s = getStreamState(sid);
    s.acc = _chatStreamAcc; s.row = _chatStreamRow; s.bubble = _chatStreamBubble;
    s.thinkingSteps = _thinkingSteps || [];
    s.thinking = _isThinking || false;
}

// ===== Streaming Badge =====
export function updateStreamingBadge(sessionId, active) {
    if (active) _streamingSessions.add(sessionId);
    else _streamingSessions.delete(sessionId);
    applyStreamingBadge(sessionId);
}

function applyStreamingBadge(sessionId) {
    const items = document.querySelectorAll('.siper-session-item');
    for (const el of items) {
        if (el.dataset.sessionId === sessionId) {
            if (_streamingSessions.has(sessionId)) el.classList.add('streaming');
            else el.classList.remove('streaming');
        }
    }
}

export function reapplyAllStreamingBadges() {
    const items = document.querySelectorAll('.siper-session-item');
    for (const el of items) {
        const sid = el.dataset.sessionId;
        if (sid && _streamingSessions.has(sid)) el.classList.add('streaming');
    }
}

// ===== Token Formatting =====
export function fmtTokens(n) {
    if (n == null) return '--';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

// ===== Legacy Aliases (backward compat — 旧代码从 core.js 导入的名称) =====
// core.js 之前用 export { _chatSessionId as chatSessionId } 等方式导出
// 现在 state.js 接管，只保留名称不同的别名（_chatSessionId → chatSessionId 等）
export { _chatSessionId as chatSessionId };
export { _chatCurrentAgent as chatCurrentAgent };
export { _chatAgents as chatAgents };
export { _chatExpandedAgents as chatExpandedAgents };
export { _chatCurrentModel as chatCurrentModel };
export { _chatModelContextWindow as chatModelContextWindow };
export { _chatCurrentPage as chatCurrentPage };
export { _chatPendingFiles as chatPendingFiles };
export { _chatSidebarExpanded as chatSidebarExpanded };
