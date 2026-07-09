/**
 * sessions.js — 会话管理页面
 *
 * 数据由后端快照通过 WS 推送（page_cache）。
 * 保留 UI 交互逻辑（点击、预览、删除确认、撤销）。
 * DOM 构建改用模板字符串 + innerHTML，消除 ~80 行 createElement 代码。
 */
import { t } from '../utils/i18n.js?v=1783614260116';
import { escapeHtml } from '../utils/escape.js?v=1783614260116';
import { fmtTime } from '../utils/format.js?v=1783614260116';
import { showConfirm, _getNotifRoot } from '../components/toast.js?v=1783614260116';
import { toast } from '../components/toast.js?v=1783614260116';

// ===== 页面模板 =====
export function _tplSessionsPage() {
  return `<div class="page-header">
    <h2 data-i18n="sessions.title">会话管理</h2>
    <div class="actions">
      <button class="btn-sm primary" onclick="newSession()" data-i18n="sessions.new">+ 新会话</button>
      <button class="btn-sm" onclick="refreshSessions()" data-i18n="sessions.refresh">刷新</button>
    </div>
  </div>
  <div class="page-body page-body-flex">
    <div class="session-list" id="sessionsList"></div>
    <div class="session-preview" id="sessionPreview">
      <div class="empty-state" data-i18n="sessions.selectPrompt">← 点击会话查看消息</div>
    </div>
  </div>`;
}
// 模块级状态
let _currentSession = null;
let _sessionsList = [];
let _previewMessages = [];

// ===== 渲染函数 =====

/**
 * 渲染会话列表（从快照数据）
 * @param {Array} list — SessionSummary 列表
 */
export function renderSessions(list) {
  _sessionsList = list || [];
  const el = document.getElementById('sessionsList');
  if (!el) return;
  if (!_sessionsList.length) {
    el.innerHTML = '<div class="sessions-empty-msg">' + t('sessions.empty') +
      '<br><span class="sessions-empty-hint">' + t('sessions.autoCreate') + '</span></div>';
    return;
  }
  el.innerHTML = _sessionsList.map(s => _buildSessionItemHtml(s)).join('');
}

/** 构建单个会话项 HTML */
function _buildSessionItemHtml(s) {
  const isActive = s.session_id === _currentSession;
  const timeStr = fmtTime(s.last_time || s.updated_at || s.created_at);
  const lastMsg = s.last_message ? escapeHtml(s.last_message) : '';
  const activeBadge = s.active ? '<span class="session-active-badge">' + t('sessions.active') + '</span>' : '';
  const msgHtml = lastMsg ? '<div class="session-last-msg" title="' + lastMsg + '">💬 ' + lastMsg + '</div>' : '';
  return '<div class="session-item' + (isActive ? ' active-session' : '') + '" data-sid="' + s.session_id + '">' +
    '<div class="session-left">' +
      '<div class="session-header">' +
        '<span class="sid">' + s.session_id.slice(0, 12) + '...</span>' +
        activeBadge +
        '<span class="session-time">' + timeStr + '</span>' +
      '</div>' +
      '<div class="sinfo">' + s.message_count + ' ' + t('sessions.messages') + ' · ' + (s.agent_name || 'default') + '</div>' +
      msgHtml +
    '</div>' +
    '<span class="sdelete" title="' + t('sessions.delete') + '">✕</span>' +
  '</div>';
}

/**
 * 渲染会话预览（从快照数据）
 * @param {string} sid — 会话 ID
 * @param {Array} messages — MessageEntry 列表
 */
export function renderSessionPreview(sid, messages) {
  _previewMessages = messages || [];
  const preview = document.getElementById('sessionPreview');
  if (!preview) return;

  if (!_previewMessages.length) {
    preview.innerHTML = '<div class="sessions-empty-msg">' + t('sessions.empty') + '</div>';
    return;
  }

  const msgCount = _previewMessages.length;
  const infoText = (sid || '').slice(0, 16) + '... · ' + msgCount + ' ' + t('sessions.messages') +
    (msgCount >= 100 ? ' (最新100条)' : '');

  const msgsHtml = _previewMessages
    .filter(m => m.role !== 'tool' && !(m.role === 'assistant' && !m.content && !m.meta))
    .map(m => _buildPreviewMsgHtml(m))
    .join('');

  preview.innerHTML =
    '<div class="preview-top-bar">' +
      '<div class="preview-info">' + infoText + '</div>' +
      '<button class="btn-sm primary" id="previewOpenBtn">' + t('sessions.openChat') + '</button>' +
    '</div>' +
    '<div class="preview-msgs">' + msgsHtml + '</div>' +
    '<div class="preview-input">' +
      '<input type="text" class="preview-input-field" placeholder="' + (t('sessions.quickReply') || '输入消息...') + '" id="previewInputField">' +
      '<button class="preview-send-btn" title="' + (t('sessions.send') || '发送') + '" id="previewSendBtn">➤</button>' +
    '</div>';

  // 绑定事件（模板已渲染为字符串，需 querySelector）
  document.getElementById('previewOpenBtn').onclick = () => _switchSession(sid);
  document.getElementById('previewSendBtn').onclick = () => _sendPreviewMessage(sid, document.getElementById('previewInputField'));
  const inputField = document.getElementById('previewInputField');
  inputField.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendPreviewMessage(sid, inputField); } };
  preview.scrollTop = preview.scrollTop;
}

/** 构建单条预览消息 HTML */
function _buildPreviewMsgHtml(m) {
  const isUser = m.role === 'user';
  const wrapCls = isUser ? ' preview-msg-user' : ' preview-msg-agent';
  const bubbleCls = isUser ? ' preview-msg-bubble-user' : ' preview-msg-bubble-agent';
  const label = (isUser ? t('chat.user') : t('chat.agent')) + ' · ' + fmtTime(m.timestamp);
  return '<div class="preview-msg-wrap' + wrapCls + '">' +
    '<div class="preview-msg-label">' + label + '</div>' +
    '<div class="preview-msg-bubble' + bubbleCls + '">' + (m.content || '') + '</div>' +
  '</div>';
}

/**
 * 渲染消息列表（从快照数据）
 * @param {Array} messages — MessageEntry 列表
 */
export function renderMessages(messages) {
  const chatEl = document.getElementById('chatMessages');
  if (!chatEl) return;
  chatEl.innerHTML = '';
  if (!messages || !messages.length) return;

  const BATCH_SIZE = 20;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    for (const m of batch) {
      if (m.role === 'assistant' && !m.content && !m.meta) continue;
      if (m.role === 'tool') continue;
      const role = m.role === 'user' ? 'user' : 'agent';
      const meta = (role === 'agent' && m.meta) ? (typeof m.meta === 'string' ? JSON.parse(m.meta) : m.meta) : undefined;
      if (typeof window.addMsg === 'function') {
        window.addMsg(m.content || '', role, meta);
      }
    }
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ===== 用户操作 =====

function _switchSession(sid) {
  _currentSession = sid;
  if (typeof window.siPerSwitchSession === 'function') {
    window.siPerSwitchSession(sid);
  }
  if (typeof window.siPerNavigate === 'function') {
    window.siPerNavigate('chat');
  }
  document.querySelectorAll('.session-item').forEach(el => {
    el.classList.toggle('active-session', el.dataset.sid === sid);
  });
}

function _deleteSession(sid) {
  showConfirm({
    title: '删除会话',
    msg: '确定删除会话 ' + escapeHtml(sid.slice(0, 8)) + '...？',
    impact: '⚠ 该会话的所有对话记录将被永久删除，不可恢复',
    danger: true,
    okText: '确认删除',
    onConfirm: async () => {
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'delete_session', session_id: sid });
      }
      try {
        await fetch('/api/sessions/' + sid, { method: 'DELETE' });
      } catch(e) {}
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'refresh_sessions' });
      }
      // 带撤销的 toast
      const undoEl = document.createElement('div');
      undoEl.className = 'siper-notif siper-notif-info siper-notif-in';
      undoEl.setAttribute('role', 'status');
      undoEl.setAttribute('aria-live', 'polite');
      undoEl.innerHTML =
        '<span class="siper-notif-icon">ℹ</span>' +
        '<span class="siper-notif-msg">' + t('sessions.deleted') + '</span>' +
        '<button class="siper-notif-undo">' + t('sessions.undo') + '</button>' +
        '<span class="siper-notif-progress"><span class="siper-notif-progress-bar"></span></span>';
      _getNotifRoot().appendChild(undoEl);
      requestAnimationFrame(() => {
        const bar = undoEl.querySelector('.siper-notif-progress-bar');
        if (bar) bar.style.width = '100%';
      });
      let undone = false;
      undoEl.querySelector('.siper-notif-undo').onclick = () => {
        undone = true;
        undoEl.remove();
        toast.info('已撤销删除');
      };
      setTimeout(() => { if (!undone) undoEl.remove(); }, 5000);
    },
  });
}

function _sendPreviewMessage(sid, inputEl) {
  const content = inputEl.value.trim();
  if (!content) return;
  inputEl.value = '';
  if (typeof window.siPerSendMessage === 'function') {
    window.siPerSendMessage(content, sid, null, null, null);
  }
}

// ===== 事件委托（在 renderSessions 渲染后绑定一次） =====
// session-item 的 onclick 和 .sdelete 的 onclick 通过内联事件属性绑定

// ===== 向后兼容映射 =====
window.renderSessions = renderSessions;
window.renderSessionPreview = renderSessionPreview;
window.renderMessages = renderMessages;