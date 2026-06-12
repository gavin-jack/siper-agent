// chat/state.js — 聊天模块共享状态
// 所有模块级变量集中管理，其他模块通过 import 使用（ES module live binding）

// ===== Core Chat State =====
export let chatCurrentPage = 'chat';
export let chatSessionId = null;
export let chatCurrentAgent = null;
export let chatPendingFiles = [];
export let isSending = false;
export let chatAgents = [];
export let chatExpandedAgents = {};
export let chatSidebarExpanded = true;

// ===== Per-Session Streaming State =====
// Each entry: { acc: string, row: HTMLElement|null, bubble: HTMLElement|null, thinkingSteps: array, thinking: bool }
export const _streamState = new Map();

// Legacy aliases for current session (kept for backward compat with core.js)
export let _chatStreamAcc = '';
export let _chatStreamRow = null;
export let _chatStreamBubble = null;
export let _thinkingSteps = [];
export let _isThinking = false;

// ===== Unread session badge =====
export const _unreadSessions = new Set();

// ===== Model Selection =====
export let chatCurrentModel = '';
export let chatModelContextWindow = 8192;

// ===== ECharts instances =====
export let _chatChartModel = null;
export let _chatChartDate = null;
export let _chatChartHourly = null;

// ===== Agent Config State =====
export var _chatAgentData = null;
export var _chatSelectedAgent = null;
export var _agentConfigName = null;
export var _chatAgentFiles = { soul: '', config: '' };
export var _chatCurAgentFile = 'soul';

// ===== Logs State =====
export let _logsData = [];

// ===== Context Menu =====
export var _ctxMenu = null;

// ===== Session Readiness (prevents sending before session_created) =====
let _sessionReady = false;
let _sessionWaiters = [];
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
  if (_sessionReady && chatSessionId) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Session ready timeout')), 10000);
    _sessionWaiters.push(() => { clearTimeout(timer); resolve(); });
  });
}
let _ws = null;
export function getWs() { return _ws; }
export function setWs(val) { _ws = val; }

// ===== Helpers =====
export function _getStreamState(sessionId) {
  if (!_streamState.has(sessionId)) {
    _streamState.set(sessionId, { acc: '', row: null, bubble: null, thinkingSteps: [], thinking: false });
  }
  return _streamState.get(sessionId);
}

export function _syncStreamFromCurrent() {
  const sid = chatSessionId;
  if (!sid) { _chatStreamAcc = ''; _chatStreamRow = null; _chatStreamBubble = null; return; }
  const s = _getStreamState(sid);
  _chatStreamAcc = s.acc; _chatStreamRow = s.row; _chatStreamBubble = s.bubble;
  _thinkingSteps = s.thinkingSteps || [];
  _isThinking = s.thinking || false;
}

export function _syncStreamToCurrent() {
  const sid = chatSessionId;
  if (!sid) return;
  const s = _getStreamState(sid);
  s.acc = _chatStreamAcc; s.row = _chatStreamRow; s.bubble = _chatStreamBubble;
  s.thinkingSteps = _thinkingSteps || [];
  s.thinking = _isThinking || false;
}

export function setCurrentPage(page) { chatCurrentPage = page; }
export function setCurrentModel(model) { chatCurrentModel = model; }
export function setChatCurrentModel(model) { chatCurrentModel = model; }
export function setModelContextWindow(ctx) { chatModelContextWindow = ctx; }
export function setChatModelContextWindow(ctx) { chatModelContextWindow = ctx; }
export function setChatAgents(agents) { chatAgents = agents; }
export function setChatExpandedAgents(expanded) { chatExpandedAgents = expanded; }
export function setChatSessionId(sid) { chatSessionId = sid; }
export function setCurrentAgent(agent) { chatCurrentAgent = agent; }
export function setChatCurrentAgent(agent) { chatCurrentAgent = agent; }
export function setPendingFiles(files) { chatPendingFiles = files; }
export function setChatPendingFiles(files) { chatPendingFiles = files; }
export function setSending(val) { isSending = val; }
export function setIsSending(val) { isSending = val; }
export function getIsSending() { return isSending; }
export function setChatAgentData(data) { _chatAgentData = data; }
export function setSelectedAgent(name) { _chatSelectedAgent = name; }
export function setAgentConfigName(name) { _agentConfigName = name; }
export function setChatAgentFiles(files) { _chatAgentFiles = files; }
export function setChatCurAgentFile(type) { _chatCurAgentFile = type; }
export function setIsThinking(val) { _isThinking = val; }
export function setCtxMenu(menu) { _ctxMenu = menu; }
export function setChatStreamAcc(acc) { _chatStreamAcc = acc; }
export function setChatStreamRow(row) { _chatStreamRow = row; }
export function setChatStreamBubble(bubble) { _chatStreamBubble = bubble; }
// Per-session streaming state — 独立于选中状态，跨会话/跨 agent 保持
export const _streamingSessions = new Set();

export function updateStreamingBadge(sessionId, active) {
  if (active) _streamingSessions.add(sessionId);
  else _streamingSessions.delete(sessionId);
  _applyStreamingBadge(sessionId);
}

function _applyStreamingBadge(sessionId) {
  const items = document.querySelectorAll('.siper-session-item');
  for (const el of items) {
    if (el.dataset.sessionId === sessionId) {
      if (_streamingSessions.has(sessionId)) el.classList.add('streaming');
      else el.classList.remove('streaming');
    }
  }
}

// Re-apply all streaming badges — call after renderMiddleList rebuilds DOM
export function reapplyAllStreamingBadges() {
  const items = document.querySelectorAll('.siper-session-item');
  for (const el of items) {
    const sid = el.dataset.sessionId;
    if (sid && _streamingSessions.has(sid)) el.classList.add('streaming');
  }
}
export function setLogsData(data) { _logsData = data; }

/**
 * 统一更新会话列表中指定 session 的 last_message / updated_at 和 DOM preview
 * @param {string} sessionId - 会话 ID
 * @param {string} [text] - 最后消息文本（用于 last_message 预览）
 * @param {string} [updatedAt] - ISO 时间戳（优先使用，fallback 到 new Date()）
 */
export function updateSessionPreview(sessionId, text, updatedAt) {
  if (!sessionId || !chatCurrentAgent) return;
  const _agent = chatAgents.find(a => a.name === chatCurrentAgent.name);
  if (!_agent) return;
  const _sess = _agent.sessions.find(s => s.session_id === sessionId);
  if (!_sess) return;
  if (text !== undefined) {
    _sess.last_message = text.replace(/\n/g, ' ').substring(0, 60);
  }
  if (updatedAt !== undefined) {
    _sess.updated_at = updatedAt;
  } else if (text !== undefined) {
    _sess.updated_at = new Date().toISOString();
  }
  // 只更新对应 session item 的 DOM，不重新渲染整个中栏
  const container = document.getElementById('chatMiddleList');
  if (container) {
    const items = container.querySelectorAll('.siper-session-item');
    for (const item of items) {
      if (item.dataset.sessionId === sessionId) {
        if (text !== undefined) {
          const preview = item.querySelector('.siper-session-preview');
          if (preview) preview.textContent = _sess.last_message;
        }
        break;
      }
    }
  }
}

// ===== Token Formatting =====
export function fmtTokens(n) {
  if (n == null) return '--';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// ===== Thinking Panel =====
export function chatThinkingHide() {
  const panel = document.getElementById('chatThinkingPanel');
  if (panel) panel.classList.remove('open');
}

// ===== Send State Reset =====
export function resetSendState() {
  setIsSending(false);
  const sb = document.getElementById('chatSendBtn');
  if (sb) sb.disabled = false;
  const stb = document.getElementById('chatStopBtn');
  if (stb) stb.classList.add('hidden');
  chatThinkingHide();
}
