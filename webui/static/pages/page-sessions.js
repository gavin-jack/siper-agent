// ===== Sessions =====
async function refreshSessions() {
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
      item.onclick = () => previewSession(s.session_id);

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
      del.onclick = (e) => { e.stopPropagation(); deleteSession(s.session_id); };

      item.appendChild(left);
      item.appendChild(del);
      list.appendChild(item);
    }
  } catch(e) { console.error('refreshSessions error:', e); toast.error(t('sessions.refreshFailed')); }
  toast.info(t('sessions.refreshed'), 1500);
}

function formatTime(isoStr) {
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

async function switchSession(sid) {
  currentSession = sid;
  navigateToPage('chat');
  // Load selected session history via HTTP (WS get_history not supported by backend)
  await loadSessionHistory(sid);
}

async function loadSessionHistory(sid, limit = 50) {
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
    // Show truncation notice if backend returned exactly 50 (may have more)
    if (messages.length >= limit) {
      const notice = document.createElement('div');
      notice.className = 'msg-truncate-notice';
      notice.textContent = t('chat.truncateNotice', limit);
      chatEl.appendChild(notice);
    }
    // Render messages in batches to avoid blocking the main thread
    const BATCH_SIZE = 20;
    let _msgIdx = 0;
    const _t0 = performance.now();
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
      // Yield to main thread between batches
      if (i + BATCH_SIZE < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    console.log(`loadSessionHistory: ${_msgIdx} messages rendered in ${Math.round(performance.now() - _t0)}ms`);
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch(e) {
    console.error('loadSessionHistory error:', e);
  }
}

// Load the most recent session that has messages (for page refresh recovery)
// loadRecentSession is defined in core.js (loaded first, but core.js version
// is intentionally used because it checks currentPage === 'chat' before loading)

async function previewSession(sid) {
  if (!sid) return;
  // Update active state in list
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active-session'));
  const item = document.querySelector(`.session-item[onclick*="${sid}"]`);
  if (item) item.classList.add('active-session');
  // Load messages into preview pane
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
    openBtn.onclick = () => switchSession(sid);
    topBar.appendChild(openBtn);
    preview.appendChild(topBar);

    const msgsDiv = document.createElement('div');
    msgsDiv.className = 'preview-msgs';

    for (const m of data.messages) {
      // Skip tool result messages — they are internal, not for display
      if (m.role === 'tool') continue;
      // Skip assistant messages with empty content (tool_calls-only placeholders)
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

    // Preview input area at bottom
    const pInput = document.createElement('div');
    pInput.className = 'preview-input';

    const pField = document.createElement('input');
    pField.type = 'text';
    pField.className = 'preview-input-field';
    pField.placeholder = t('sessions.quickReply') || '输入消息...';
    pField.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPreviewMessage(sid, pField);
      }
    };
    pInput.appendChild(pField);

    const pSend = document.createElement('button');
    pSend.className = 'preview-send-btn';
    pSend.textContent = '➤';
    pSend.title = t('sessions.send') || '发送';
    pSend.onclick = () => sendPreviewMessage(sid, pField);
    pInput.appendChild(pSend);

    preview.appendChild(pInput);
    preview.scrollTop = preview.scrollHeight;
  } catch(e) {
    preview.innerHTML = '<div class="sessions-empty-msg sessions-empty-err">Error: ' + e.message + '</div>';
  }
}

async function deleteSession(sid) {
  showConfirm({
    title: '删除会话',
    msg: '确定删除会话 ' + sid.slice(0, 8) + '...？',
    impact: '⚠ 该会话的所有对话记录将被永久删除，不可恢复',
    danger: true,
    okText: '确认删除',
    onConfirm: async () => {
      await fetch('/api/sessions/' + sid, { method: 'DELETE' });
      refreshSessions();
      toast.success(t('sessions.refreshed'), 1500);
    }
  });
}

function newSession() {
  currentSession = null;
  document.getElementById('chatMessages').innerHTML = '';
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type: 'new_session'}));
  }
  navigateToPage('chat');
}

async function sendPreviewMessage(sid, inputEl) {
  const text = inputEl.value.trim();
  if (!text) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  inputEl.value = '';
  inputEl.disabled = true;

  // Append user message bubble to preview
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

  // Send via WS
  ws.send(JSON.stringify({ type: 'message', content: text, session_id: sid }));
  inputEl.disabled = false;
  inputEl.focus();
}




