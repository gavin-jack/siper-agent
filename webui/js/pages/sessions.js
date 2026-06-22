/**
 * sessions.js — 会话管理页面（起源版：纯渲染）
 * 
 * 删除所有 fetch 调用，数据由后端快照通过 WS 推送。
 * 保留 UI 交互逻辑（点击、预览、删除确认）。
 */
import { t } from '../utils/i18n.js?v=1782146353242';
import { escapeHtml } from '../utils/escape.js?v=1782146353242';
import { showConfirm, _getNotifRoot } from '../components/toast.js?v=1782146353242';
import { toast } from '../components/toast.js?v=1782146353242';

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
  el.innerHTML = '';
  for (const s of _sessionsList) {
    const isActive = s.session_id === _currentSession;
    const timeStr = _formatTime(s.last_time || s.updated_at || s.created_at);
    const lastMsg = s.last_message ? escapeHtml(s.last_message) : '';
    const item = document.createElement('div');
    item.className = 'session-item' + (isActive ? ' active-session' : '');
    item.dataset.sid = s.session_id;
    item.onclick = () => _switchSession(s.session_id);

    const left = document.createElement('div');
    left.className = 'session-left';

    const header = document.createElement('div');
    header.className = 'session-header';
    const sid = document.createElement('span');
    sid.className = 'sid';
    sid.textContent = s.session_id.slice(0, 12) + '...';
    header.appendChild(sid);
    if (s.active) {
      const badge = document.createElement('span');
      badge.className = 'session-active-badge';
      badge.textContent = t('sessions.active');
      header.appendChild(badge);
    }
    const timeEl = document.createElement('span');
    timeEl.className = 'session-time';
    timeEl.textContent = timeStr;
    header.appendChild(timeEl);
    left.appendChild(header);

    const sinfo = document.createElement('div');
    sinfo.className = 'sinfo';
    sinfo.textContent = s.message_count + ' ' + t('sessions.messages') + ' · ' + (s.agent_name || 'default');
    left.appendChild(sinfo);

    if (lastMsg) {
      const msgEl = document.createElement('div');
      msgEl.className = 'session-last-msg';
      msgEl.title = lastMsg;
      msgEl.textContent = '💬 ' + lastMsg;
      left.appendChild(msgEl);
    }

    const del = document.createElement('span');
    del.className = 'sdelete';
    del.textContent = '✕';
    del.onclick = (e) => { e.stopPropagation(); _deleteSession(s.session_id); };

    item.appendChild(left);
    item.appendChild(del);
    el.appendChild(item);
  }
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

  preview.innerHTML = '';
  const topBar = document.createElement('div');
  topBar.className = 'preview-top-bar';
  const info = document.createElement('div');
  info.className = 'preview-info';
  const msgCount = _previewMessages.length;
  info.textContent = (sid || '').slice(0, 16) + '... · ' + msgCount + ' ' + t('sessions.messages') +
    (msgCount >= 100 ? ' (最新100条)' : '');
  topBar.appendChild(info);
  const openBtn = document.createElement('button');
  openBtn.className = 'btn-sm primary';
  openBtn.textContent = t('sessions.openChat');
  openBtn.onclick = () => _switchSession(sid);
  topBar.appendChild(openBtn);
  preview.appendChild(topBar);

  const msgsDiv = document.createElement('div');
  msgsDiv.className = 'preview-msgs';
  for (const m of _previewMessages) {
    if (m.role === 'tool') continue;
    if (m.role === 'assistant' && !m.content && !m.meta) continue;
    const isUser = m.role === 'user';
    const wrap = document.createElement('div');
    wrap.className = 'preview-msg-wrap' + (isUser ? ' preview-msg-user' : ' preview-msg-agent');
    const label = document.createElement('div');
    label.className = 'preview-msg-label';
    label.textContent = (isUser ? t('chat.user') : t('chat.agent')) + ' · ' + _formatTime(m.timestamp);
    wrap.appendChild(label);
    const bubble = document.createElement('div');
    bubble.className = 'preview-msg-bubble' + (isUser ? ' preview-msg-bubble-user' : ' preview-msg-bubble-agent');
    bubble.textContent = m.content || '';
    wrap.appendChild(bubble);
    msgsDiv.appendChild(wrap);
  }
  preview.appendChild(msgsDiv);

  // 快速回复输入框
  const pInput = document.createElement('div');
  pInput.className = 'preview-input';
  const pField = document.createElement('input');
  pField.type = 'text';
  pField.className = 'preview-input-field';
  pField.placeholder = t('sessions.quickReply') || '输入消息...';
  pField.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendPreviewMessage(sid, pField); } };
  pInput.appendChild(pField);
  const pSend = document.createElement('button');
  pSend.className = 'preview-send-btn';
  pSend.textContent = '➤';
  pSend.title = t('sessions.send') || '发送';
  pSend.onclick = () => _sendPreviewMessage(sid, pField);
  pInput.appendChild(pSend);
  preview.appendChild(pInput);
  preview.scrollTop = preview.scrollTop;
}

/**
 * 渲染消息列表（从快照数据）
 * @param {Array} messages — MessageEntry 列表
 */
export function renderMessages(messages) {
  const chatEl = document.getElementById('chatMessages');
  if (!chatEl) return;
  chatEl.innerHTML = '';
  if (!messages || !messages.length) {
    chatEl.innerHTML = '';
    return;
  }
  const BATCH_SIZE = 20;
  let idx = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    for (const m of batch) {
      if (m.role === 'assistant' && !m.content && !m.meta) { idx++; continue; }
      if (m.role === 'tool') { idx++; continue; }
      const role = m.role === 'user' ? 'user' : 'agent';
      const meta = (role === 'agent' && m.meta) ? (typeof m.meta === 'string' ? JSON.parse(m.meta) : m.meta) : undefined;
      if (typeof window.addMsg === 'function') {
        window.addMsg(m.content || '', role, meta);
      }
      idx++;
    }
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ===== 用户操作 =====

function _switchSession(sid) {
  _currentSession = sid;
  // 通知后端切换会话（通过 core.js 的 send）
  if (typeof window.siPerSwitchSession === 'function') {
    window.siPerSwitchSession(sid);
  }
  // 导航到聊天页
  if (typeof window.siPerNavigate === 'function') {
    window.siPerNavigate('chat');
  }
  // 更新列表高亮
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
      // 通过 WS 通知后端删除
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'delete_session', session_id: sid });
      }
      // 同时通过 HTTP 删除（过渡期双写）
      try {
        await fetch('/api/sessions/' + sid, { method: 'DELETE' });
      } catch(e) {}
      // 刷新列表
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'refresh_sessions' });
      }
      // 显示带撤销的 toast
      const undoEl = document.createElement('div');
      undoEl.className = 'siper-notif siper-notif-info siper-notif-in';
      undoEl.setAttribute('role', 'status');
      undoEl.setAttribute('aria-live', 'polite');
      undoEl.innerHTML = `
        <span class="siper-notif-icon">ℹ</span>
        <span class="siper-notif-msg">${t('sessions.deleted')}</span>
        <button class="siper-notif-undo">${t('sessions.undo')}</button>
        <span class="siper-notif-progress"><span class="siper-notif-progress-bar"></span></span>
      `;
      _getNotifRoot().appendChild(undoEl);
      requestAnimationFrame(() => {
        const bar = undoEl.querySelector('.siper-notif-progress-bar');
        if (bar) bar.style.width = '100%';
      });
      const undoBtn = undoEl.querySelector('.siper-notif-undo');
      let undone = false;
      undoBtn.onclick = () => {
        undone = true;
        undoEl.remove();
        toast.info('已撤销删除');
      };
      setTimeout(() => {
        if (!undone) undoEl.remove();
      }, 5000);
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

// ===== 工具函数 =====

function _formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return t('time.justNow');
    if (diffMs < 3600000) return Math.floor(diffMs / 60000) + t('time.minAgo');
    if (diffMs < 86400000) return Math.floor(diffMs / 3600000) + t('time.hourAgo');
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch(e) {
    return isoStr.slice(0, 16);
  }
}

// ===== 向后兼容映射 =====
window.renderSessions = renderSessions;
window.renderSessionPreview = renderSessionPreview;
window.renderMessages = renderMessages;
