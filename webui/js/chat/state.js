/**
 * chat/state.js — 聊天模块共享状态 + getter/setter
 * 从 core.js 拆出，core.js 保留这些变量的引用。
 * 此文件只定义变量和 getter/setter，不处理 WS/流式/导航等逻辑。
 *
 * 设计原则：
 *   - 只保留"纯聊天"交互必需的状态（发送、流式、思考、模型选择、连接）
 *   - agents 数据由 page_cache 同步，不独立维护 _chatAgents
 *   - expanded_agents 为纯 UI 状态（sidebar 展开/折叠），保留在 sidebar.js 中
 */

// ===== Core Chat State =====
export let _chatCurrentAgent = null;
export let _chatSidebarExpanded = true;

// Per-Session Streaming State（每个会话独立的流式/思考/发送状态）
export const _streamState = new Map();

// 当前 session 的快捷访问（从 _streamState 同步，切换会话时由 syncStreamFromCurrent 更新）
export let _chatStreamAcc = '';
export let _chatStreamRow = null;
export let _chatStreamBubble = null;
export let _thinkingSteps = [];
export let _isThinking = false;

// _isSending 也改为 per-session，全局变量保留为当前 session 的快捷访问
export let _isSending = false;

// Unread session badge
export const _unreadSessions = new Set();

// Model Selection
export let _chatCurrentModel = '';
export let _chatModelContextWindow = 8192;

// Agent Config State
export let _chatAgentData = null;
export let _chatSelectedAgent = null;
export let _agentConfigName = null;
export let _chatAgentFiles = { soul: '', config: '' };
export let _chatCurAgentFile = 'soul';

// Context Menu
export let _ctxMenu = null;

// Session Readiness
export let _sessionReady = false;

// Connection State
export let _isConnected = false;
export function setConnected(val) { _isConnected = val; }
export let _sessionWaiters = [];

// Core Chat State — _chatSessionId 是会话 ID 的核心变量
export let _chatSessionId = null;

// Streaming sessions (per-session streaming badge)
export const _streamingSessions = new Set();

// ===== Getter/Setter: Core Chat State =====
export let _chatCurrentPage = 'chat';

export function setCurrentPage(page) { _chatCurrentPage = page; }

export function getChatSessionId() { return _chatSessionId; }
export function setChatSessionId(sid) { _chatSessionId = sid; if (sid) localStorage.setItem('siper_last_session', sid); else localStorage.removeItem('siper_last_session'); }

export function getChatCurrentAgent() { return _chatCurrentAgent; }
export function setChatCurrentAgent(agent) { _chatCurrentAgent = agent; }

// ===== Getter/Setter: Per-Session Sending/Thinking =====
// _isSending / _isThinking 是全局快捷访问，对应 _chatSessionId 的 per-session 状态
// 切换会话时由 syncStreamFromCurrent() 从 _streamState 恢复
export function getIsSending() { return _isSending; }
export function setIsSending(val) {
    _isSending = val;
    // 同步写入 per-session 状态
    if (_chatSessionId) {
        const s = getStreamState(_chatSessionId);
        s.sending = val;
    }
}

export function setThinkingSteps(v) { _thinkingSteps = v; }

export function setIsThinking(val) {
    _isThinking = val;
    // 同步写入 per-session 状态
    if (_chatSessionId) {
        const s = getStreamState(_chatSessionId);
        s.thinking = val;
    }
}

// ===== Getter/Setter: Streaming State =====
export function setChatStreamAcc(acc) { _chatStreamAcc = acc; }
export function setChatStreamRow(row) { _chatStreamRow = row; }
export function setChatStreamBubble(bubble) { _chatStreamBubble = bubble; }

export function getChatSidebarExpanded() { return _chatSidebarExpanded; }
export function setChatSidebarExpanded(v) { _chatSidebarExpanded = v; }

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
        _streamState.set(sessionId, { acc: '', row: null, bubble: null, thinkingSteps: [], thinking: false, sending: false });
    }
    return _streamState.get(sessionId);
}

export function syncStreamFromCurrent() {
    const sid = _chatSessionId;
    if (!sid) { _chatStreamAcc = ''; _chatStreamRow = null; _chatStreamBubble = null; _isSending = false; _isThinking = false; return; }
    const s = getStreamState(sid);
    _chatStreamAcc = s.acc; _chatStreamRow = s.row; _chatStreamBubble = s.bubble;
    _thinkingSteps = s.thinkingSteps || [];
    _isThinking = s.thinking || false;
    _isSending = s.sending || false;
}

export function syncStreamToCurrent() {
    const sid = _chatSessionId;
    if (!sid) return;
    const s = getStreamState(sid);
    s.acc = _chatStreamAcc; s.row = _chatStreamRow; s.bubble = _chatStreamBubble;
    s.thinkingSteps = _thinkingSteps || [];
    s.thinking = _isThinking || false;
    s.sending = _isSending || false;
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

// ===== page_cache 同步 =====
// agents 数据由 page_cache.agents 同步，不再独立维护 _chatAgents
// 当 page_cache 更新 agents 时，通过 __onPageCacheUpdate 回调同步
export function syncAgentsFromPageCache() {
    if (typeof window.__getPageCache === 'function') {
        const agents = window.__getPageCache('agents');
        if (agents) {
            // 更新当前 agent 引用
            if (_chatCurrentAgent) {
                const updated = agents.find(a => a.name === _chatCurrentAgent.name);
                if (updated) _chatCurrentAgent = updated;
            }
        }
    }
}

// ===== Legacy Aliases (backward compat — 旧代码从 core.js 导入的名称) =====
// 所有变量均在 state.js 中有同名 export let，re-export 供旧代码使用
export { _chatSessionId as chatSessionId };
export { _chatCurrentPage as chatCurrentPage };
export { _chatCurrentAgent as chatCurrentAgent };
export { _chatCurrentModel as chatCurrentModel };
export { _chatModelContextWindow as chatModelContextWindow };
export { _chatSidebarExpanded as chatSidebarExpanded };

// -------------------------------------------------------------------------
// Expose key session functions to the global `window` object.
// This ensures they are accessible from any script (including console or
// modules that may import `core.js` without direct import of `state.js`).
// -------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  window.markSessionReady = markSessionReady;
  window.setChatSessionId = setChatSessionId;
  window.resetSessionReady = resetSessionReady;
  window.ensureSessionReady = ensureSessionReady;
  window.setChatCurrentAgent = setChatCurrentAgent;
  // 用 getter 确保 window._chatCurrentAgent 总是返回最新值
  Object.defineProperty(window, '_chatCurrentAgent', {
    get: function() { return _chatCurrentAgent; },
    configurable: true
  });
}
