// pages/sessions.js — 会话管理
// 从 pages/page-sessions.js 迁移

import { t } from '../utils/i18n.js';
import { escapeHtml } from '../utils/escape.js';
import { addMsg } from '../utils/dom.js';
import { navigateToPage } from '../utils/dom.js';
import { showConfirm, _getNotifRoot } from '../components/toast.js';
import { toast } from '../components/toast.js';

// 模块级变量（原全局变量由 app.js 管理）
let _msgIdx = 0;
let currentSession = null;

export async function refreshSessions(currentSession, ws) {
  try {
    const r = await fetch('/api/sessions');
    const data = await r.json();
    const list = document.getElementById('sessionsList');
    if (!data.sessions.length) {
      list.innerHTML = '<div class="sessions-empty-msg">' + t('sessions.empty') + '<br><span class="sessions-empty-hint">' + t('sessions.autoCreate') + '</span></div>';
      return;
    }
    list.innerHTML = '';
    for (const s of data.sessions) {
      const isActive = s.session_id === currentSession;
      const timeStr = formatTime(s.updated_at || s.created_at);
      const lastMsg = s.last_message ? escapeHtml(s.last_message) : '';

      const item = document.createElement('div');
      item.className = 'session-item' + (isActive ? ' active-session' : '');
      item.onclick = () => previewSession(s.session_id, ws);

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

      const sinfo = document.createElement('div');
      sinfo.className = 'sinfo';
      sinfo.textContent = s.messages + ' ' + t('sessions.messages') + ' · ' + s.user_id;

      left.appendChild(header);
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
      del.onclick = (e) => { e.stopPropagation(); deleteSession(s.session_id, ws); };

      item.appendChild(left);
      item.appendChild(del);
      list.appendChild(item);
    }
  } catch(e) { console.error('refreshSessions error:', e); toast.error(t('sessions.refreshFailed')); }
  toast.info(t('sessions.refreshed'), 1500);
}

export function formatTime(isoStr) {
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

export async function switchSession(sid, ws) {
  currentSession = sid;
  navigateToPage('chat');
  await loadSessionHistory(sid, ws);
}

export async function loadSessionHistory(sid, ws, limit = 50) {
  if (!sid) return;
  try {
    const r = await fetch('/api/sessions/' + sid);
    const data = await r.json();
    if (!data.success || !data.messages.length) {
      document.getElementById('chatMessages').innerHTML = '';
      addMsg(t('chat.newSession'), 'system');
      return;
    }
    const chatEl = document.getElementById('chatMessages');
    chatEl.innerHTML = '<div class="msg-loading">加载历史消息中...</div>';
    const messages = data.messages;
    if (messages.length >= limit) {
      const notice = document.createElement('div');
      notice.className = 'msg-truncate-notice';
      notice.textContent = t('chat.truncateNotice', limit);
      chatEl.appendChild(notice);
    }
    const BATCH_SIZE = 20;
    _msgIdx = 0;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      for (const m of batch) {
        if (m.role === 'assistant' && !m.content && !m.meta) { _msgIdx++; continue; }
        if (m.role === 'tool') { _msgIdx++; continue; }
        const role = m.role === 'user' ? 'user' : 'agent';
        const meta = (role === 'agent' && m.meta) ? (typeof m.meta === 'string' ? JSON.parse(m.meta) : m.meta) : undefined;
        addMsg(m.content || '', role, meta);
        _msgIdx++;
      }
      if (i + BATCH_SIZE < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch(e) {
    console.error('loadSessionHistory error:', e);
    toast.error('会话历史加载失败');
  }
}

export async function previewSession(sid, ws) {
  if (!sid) return;
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active-session'));
  const item = document.querySelector(`.session-item[onclick*="${sid}"]`);
  if (item) item.classList.add('active-session');
  const preview = document.getElementById('sessionPreview');
  preview.innerHTML = '<div class="sessions-empty-msg">' + t('chat.loading') + '</div>';
  try {
    const r = await fetch('/api/sessions/' + sid);
    const data = await r.json();
    if (!data.success || !data.messages.length) {
      preview.innerHTML = '<div class="sessions-empty-msg">' + t('sessions.empty') + '</div>';
      return;
    }
    preview.innerHTML = '';
    const topBar = document.createElement('div');
    topBar.className = 'preview-top-bar';
    const info = document.createElement('div');
    info.className = 'preview-info';
    const msgCount = data.messages.length;
    info.textContent = sid.slice(0, 16) + '... · ' + msgCount + ' ' + t('sessions.messages') + (msgCount >= 100 ? ' (最新100条)' : '');
    topBar.appendChild(info);
    const openBtn = document.createElement('button');
    openBtn.className = 'btn-sm primary';
    openBtn.textContent = t('sessions.openChat');
    openBtn.onclick = () => switchSession(sid, ws);
    topBar.appendChild(openBtn);
    preview.appendChild(topBar);
    const msgsDiv = document.createElement('div');
    msgsDiv.className = 'preview-msgs';
    for (const m of data.messages) {
      if (m.role === 'tool') continue;
      if (m.role === 'assistant' && !m.content && !m.meta) continue;
      const isUser = m.role === 'user';
      const wrap = document.createElement('div');
      wrap.className = 'preview-msg-wrap' + (isUser ? ' preview-msg-user' : ' preview-msg-agent');
      const label = document.createElement('div');
      label.className = 'preview-msg-label';
      label.textContent = (isUser ? t('chat.user') : t('chat.agent')) + ' · ' + formatTime(m.timestamp);
      wrap.appendChild(label);
      const bubble = document.createElement('div');
      bubble.className = 'preview-msg-bubble' + (isUser ? ' preview-msg-bubble-user' : ' preview-msg-bubble-agent');
      bubble.textContent = m.content || '';
      wrap.appendChild(bubble);
      msgsDiv.appendChild(wrap);
    }
    preview.appendChild(msgsDiv);
    const pInput = document.createElement('div');
    pInput.className = 'preview-input';
    const pField = document.createElement('input');
    pField.type = 'text';
    pField.className = 'preview-input-field';
    pField.placeholder = t('sessions.quickReply') || '输入消息...';
    pField.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPreviewMessage(sid, pField, ws); } };
    pInput.appendChild(pField);
    const pSend = document.createElement('button');
    pSend.className = 'preview-send-btn';
    pSend.textContent = '➤';
    pSend.title = t('sessions.send') || '发送';
    pSend.onclick = () => sendPreviewMessage(sid, pField, ws);
    pInput.appendChild(pSend);
    preview.appendChild(pInput);
    preview.scrollTop = preview.scrollHeight;
  } catch(e) {
    preview.innerHTML = '<div class="sessions-empty-msg sessions-empty-err">Error: ' + e.message + '</div>';
  }
}

async function deleteSession(sid, ws) {
  showConfirm({
    title: '删除会话',
    msg: '确定删除会话 ' + escapeHtml(sid.slice(0, 8)) + '...？',
    impact: '⚠ 该会话的所有对话记录将被永久删除，不可恢复',
    danger: true,
    okText: '确认删除',
    onConfirm: async () => {
      // 保存被删除的会话信息用于撤销
      let deletedSession = null;
      try {
        const r = await fetch('/api/sessions/' + sid);
        const data = await r.json();
        if (data.success) deletedSession = data.session;
      } catch(e) {}

      await fetch('/api/sessions/' + sid, { method: 'DELETE' });
      refreshSessions(null, ws);

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

      // 启动进度条
      requestAnimationFrame(() => {
        const bar = undoEl.querySelector('.siper-notif-progress-bar');
        if (bar) { bar.style.transitionDuration = '5000ms'; bar.style.width = '0%'; }
      });

      // 点击撤销恢复会话
      undoEl.querySelector('.siper-notif-undo').addEventListener('click', async () => {
        if (deletedSession) {
          try {
            await fetch('/api/sessions/' + sid, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ restore: true, data: deletedSession })
            });
          } catch(e) { /* session may have been purged */ }
        }
        undoEl.remove();
        refreshSessions(null, ws);
        toast.success('会话已恢复', 1500);
      });

      // 自动消失
      setTimeout(() => {
        undoEl.classList.remove('siper-notif-in');
        undoEl.classList.add('siper-notif-out');
        setTimeout(() => undoEl.remove(), 300);
      }, 5000);

      // 5 秒后自动消失
      setTimeout(() => {
        if (undoEl.parentNode) {
          undoEl.classList.remove('toast-in');
          undoEl.classList.add('toast-out');
          setTimeout(() => undoEl.remove(), 300);
        }
      }, 5000);
    }
  });
}

export function newSession() {
  currentSession = null;
  const chatMsgs = document.getElementById('chatMessages');
  if (chatMsgs) chatMsgs.innerHTML = '';
  navigateToPage('chat');
}

async function sendPreviewMessage(sid, inputEl, ws) {
  const text = inputEl.value.trim();
  if (!text) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  inputEl.value = '';
  inputEl.disabled = true;
  const preview = document.getElementById('sessionPreview');
  const msgsDiv = preview.querySelector('.preview-msgs');
  if (msgsDiv) {
    const wrap = document.createElement('div');
    wrap.className = 'preview-msg-wrap preview-msg-user';
    const label = document.createElement('div');
    label.className = 'preview-msg-label';
    label.textContent = (t('chat.user') || '用户') + ' · ' + formatTime(new Date().toISOString());
    wrap.appendChild(label);
    const bubble = document.createElement('div');
    bubble.className = 'preview-msg-bubble preview-msg-bubble-user';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    msgsDiv.appendChild(wrap);
    preview.scrollTop = preview.scrollHeight;
  }
  ws.send(JSON.stringify({ type: 'message', content: text, session_id: sid }));
  inputEl.disabled = false;
  inputEl.focus();
}

// DOMContentLoaded 由 app.js 统一触发
