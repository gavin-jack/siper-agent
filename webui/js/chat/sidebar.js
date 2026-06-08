// chat/sidebar.js — 中间栏、会话列表、右键菜单、Agent 配置
import {
  chatSessionId, chatCurrentAgent, chatAgents, chatExpandedAgents,
  _unreadSessions, _chatStreamAcc, _chatStreamRow, _chatStreamBubble, _thinkingSteps, _isThinking,
  _syncStreamFromCurrent, _syncStreamToCurrent,
  _chatAgentData, _chatSelectedAgent, _agentConfigName, _chatAgentFiles, _chatCurAgentFile,
  _ctxMenu,
  setChatAgents, setChatSessionId, setChatCurrentAgent, setSelectedAgent, setAgentConfigName,
  setChatAgentData, setChatAgentFiles, setChatCurAgentFile, setCtxMenu, setChatExpandedAgents,
  setChatStreamAcc, setChatStreamRow, setChatStreamBubble, setIsSending, getWs, resetSessionReady, updateStreamingBadge
} from './state.js';
import { chatEscapeHtml, chatLoadSessionMessages, chatRenderMarkdown, chatClearMessages } from './message.js';
import { updateChatHeader } from './input.js';
import { toast } from '../components/toast.js';

// ===== Agent Loading =====

export function loadChatAgents() {
  const midList = document.getElementById('chatMiddleList');
  if (chatAgents.length > 0) {
    renderMiddleList();
    // 后台静默刷新
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => {
        const agents = (data && data.agents) || (data && data.data && data.data.agents) || [];
        if (agents.length > 0) {
          setChatAgents(agents.map(a => ({
            name: a.name || a.id || '',
            display_name: a.display_name || a.label || a.name || 'Agent',
            description: a.description || '',
            avatar: '/api/avatar?agent=' + encodeURIComponent(a.name),
            sessions: [],
            available_models: a.available_models || [],
            default_chat_model: a.default_chat_model || '',
            default_vision_model: a.default_vision_model || '',
          })));
          renderMiddleList();
          chatLoadAllSessions();
        }
      }).catch(() => {});
    return Promise.resolve();
  }
  if (midList) midList.innerHTML = '<div style="padding:40px;text-align:center;color:var(--color-text-dim)"><div style="font-size:24px;margin-bottom:8px">⏳</div>加载中...</div>';
  return fetch('/api/agents')
    .then(r => r.json())
    .then(data => {
      const agents = (data && data.agents) || (data && data.data && data.data.agents) || [];
      if (!Array.isArray(agents)) return;
      setChatAgents(agents.map(a => ({
        name: a.name || a.id || '',
        display_name: a.display_name || a.label || a.name || 'Agent',
        description: a.description || '',
        avatar: '/api/avatar?agent=' + encodeURIComponent(a.name),
        sessions: [],
        available_models: a.available_models || [],
        default_chat_model: a.default_chat_model || '',
        default_vision_model: a.default_vision_model || '',
      })));
      renderMiddleList();
      chatLoadAllSessions();
    })
    .catch(() => {
      const c = document.getElementById('chatMiddleList');
      if (c) c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--color-danger);font-size:13px">加载失败</div>';
    });
}

export function chatLoadAllSessions() {
  fetch('/api/sessions')
    .then(r => r.json())
    .then(data => {
      const sessions = (data && data.sessions) || (data && data.data && data.data.sessions) || [];
      for (const s of sessions) {
        const agentName = s.agent_name || (chatAgents.length > 0 ? chatAgents[0].name : null);
        const agent = chatAgents.find(a => a.name === agentName);
        const target = agent || (chatAgents.length > 0 ? chatAgents[0] : null);
        if (!target) continue;
        const exists = target.sessions.some(es => es.session_id === s.session_id);
        if (!exists) target.sessions.push(s);
      }
      renderMiddleList();
    })
    .catch(() => {});
}

// ===== Unread Badge =====

export function markSessionUnread(sessionId) {
  if (!sessionId) return;
  _unreadSessions.add(sessionId);
  renderMiddleList();
}

export function clearSessionUnread(sessionId) {
  if (!sessionId) return;
  _unreadSessions.delete(sessionId);
  renderMiddleList();
}

export function isSessionUnread(sessionId) {
  return _unreadSessions.has(sessionId);
}

// ===== Middle Column Rendering =====

let _renderMiddleTimer = null;
export function renderMiddleList() {
  // Debounce: coalesce rapid successive calls (e.g. loadChatAgents → renderMiddleList + chatLoadAllSessions → renderMiddleList)
  // Schedule rebuild on next microtask; if another call arrives before execution, the timer resets
  if (_renderMiddleTimer) clearTimeout(_renderMiddleTimer);
  _renderMiddleTimer = setTimeout(_doRenderMiddle, 16); // 1 frame @60fps
}
function _doRenderMiddle() {
  _renderMiddleTimer = null;
  const container = document.getElementById('chatMiddleList');
  if (!container) return;
  container.innerHTML = '';
  if (!chatAgents.length) {
    container.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;font-size:13px;">加载中...</div>';
    return;
  }
  // Sort agents by latest session reply time descending
  const sortedAgents = [...chatAgents].sort((a, b) => {
    const aLatest = (a.sessions && a.sessions[0]?.updated_at) || (a.sessions && a.sessions[0]?.created_at) || '';
    const bLatest = (b.sessions && b.sessions[0]?.updated_at) || (b.sessions && b.sessions[0]?.created_at) || '';
    return bLatest < aLatest ? -1 : bLatest > aLatest ? 1 : 0;
  });
  for (const agent of sortedAgents) {
    // Sort sessions by updated_at descending (latest reply first)
    if (agent.sessions && agent.sessions.length > 1) {
      agent.sessions.sort((a, b) => {
        const ta = a.updated_at || a.created_at || '';
        const tb = b.updated_at || b.created_at || '';
        return tb < ta ? -1 : tb > ta ? 1 : 0;
      });
    }
    const isExpanded = !!chatExpandedAgents[agent.name];
    const isActiveAgent = chatCurrentAgent && chatCurrentAgent.name === agent.name;
    const group = document.createElement('div');
    group.className = 'siper-agent-group' + (isExpanded ? ' expanded' : '');
    const header = document.createElement('div');
    header.className = 'siper-agent-header' + (isActiveAgent ? ' active' : '');
    header.onclick = (e) => {
      if (e.target.classList.contains('siper-agent-add-btn')) {
        e.stopPropagation();
        const agentName = e.target.dataset.agentName;
        const agent = chatAgents.find(a => a.name === agentName);
        if (agent && typeof window.startNewChat === 'function') window.startNewChat(agent);
        return;
      }
      chatToggleAgent(agent.name);
    };
    header.innerHTML = `
      <span class="siper-agent-arrow">${isExpanded ? '▼' : '▶'}</span>
      <img src="/api/avatar?agent=${agent.name}" class="siper-agent-avatar" alt="" onerror="this.src='/static/default_avatar.webp';this.onerror=function(){this.src='/static/default_avatar_256.png'}">
      <div class="siper-agent-info">
        <div class="siper-agent-name">${chatEscapeHtml(agent.display_name)}</div>
        <div class="siper-agent-desc">${chatEscapeHtml(agent.description || '')}</div>
      </div>
      <span class="siper-agent-count">${agent.sessions.length}</span>
      <button class="siper-agent-add-btn" title="新对话" data-agent-name="${agent.name}">+</button>
    `;
    group.appendChild(header);
    const sessionsWrap = document.createElement('div');
    sessionsWrap.className = 'siper-agent-sessions';
    if (isExpanded) {
      if (!agent.sessions.length) {
        const empty = document.createElement('div');
        empty.className = 'siper-session-empty';
        empty.textContent = '暂无会话';
        sessionsWrap.appendChild(empty);
      } else {
        const SHOW_MAX = 5;
        agent.sessions.forEach((session, idx) => {
          const item = document.createElement('div');
          const isActiveSession = chatSessionId === session.session_id;
          const _unread = !isActiveSession && isSessionUnread(session.session_id);
          item.className = 'siper-session-item' + (isActiveSession ? ' active' : '') + (_unread ? ' unread' : '');
          item.dataset.sessionId = session.session_id;
          if (idx >= SHOW_MAX) item.classList.add('hidden');
          item.onclick = (e) => { e.stopPropagation(); selectChatSession(session, agent); };
          item.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); chatShowSessionMenu(e, session, agent); };
          item.ondblclick = (e) => { e.stopPropagation(); renameChatSession(session, agent); };
          const preview = (session.last_message || '').replace(/\n/g, ' ').substring(0, 60);
          const displayName = session.title || session.session_id.substring(0, 20);
          item.innerHTML = `
            <div class="siper-session-info">
              <div class="siper-session-name">${chatEscapeHtml(displayName)}</div>
              <div class="siper-session-preview">${chatEscapeHtml(preview)}</div>
            </div>
            ${_unread ? '<span class="siper-session-unread-dot"></span>' : ''}
            ${isActiveSession ? '<button class="siper-session-delete-btn" title="删除会话">×</button>' : ''}
          `;
          const delBtn = item.querySelector('.siper-session-delete-btn');
          if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deleteChatSessionConfirm(session, agent); };
          sessionsWrap.appendChild(item);
        });
        if (agent.sessions.length > SHOW_MAX) {
          const moreBtn = document.createElement('button');
          moreBtn.className = 'siper-show-more-btn';
          moreBtn.textContent = `查看更多 (${agent.sessions.length - SHOW_MAX})`;
          moreBtn.onclick = (e) => {
            e.stopPropagation();
            const hidden = sessionsWrap.querySelectorAll('.siper-session-item.hidden');
            if (hidden.length) { hidden.forEach(el => el.classList.remove('hidden')); moreBtn.textContent = '收起'; }
            else { const items = sessionsWrap.querySelectorAll('.siper-session-item'); items.forEach((el, i) => { if (i >= SHOW_MAX) el.classList.add('hidden'); }); moreBtn.textContent = `查看更多 (${agent.sessions.length - SHOW_MAX})`; }
          };
          sessionsWrap.appendChild(moreBtn);
        }
      }
    }
    group.appendChild(sessionsWrap);
    container.appendChild(group);
  }
}

export function chatToggleAgent(agentName) {
  // 切换展开/折叠
  chatExpandedAgents[agentName] = !chatExpandedAgents[agentName];
  // 选中 agent + 打开设置面板（不论展开/折叠）
  switchToAgent(agentName);
  selectChatAgent(agentName);
}

/**
 * 切换到指定 agent：后端切换 + 刷新会话列表 + 加载聊天面板
 */
async function switchToAgent(agentName) {
  try {
    const r = await fetch('/api/agents', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ action: 'switch', agent: agentName })
    });
    const d = await r.json();
    if (!d.success) {
      if (window.toast) toast.error(t('agent.switchFailed') + ': ' + (d.error || ''));
      return;
    }
    // 更新当前 agent
    const agent = chatAgents.find(a => a.name === agentName);
    if (agent) {
      setChatCurrentAgent(agent);
      setSelectedAgent(agentName);
    }
    // 重新加载 agent 列表 + 会话
    await new Promise(r => setTimeout(r, 100)); // 等后端写入
    loadChatAgents();
    // 清空当前会话，等待用户选择
    setChatSessionId(null);
    // 不调用 chatSwitchPage — 调用方决定切换到哪个页面
    if (typeof updateChatHeader === 'function') updateChatHeader();
    // 刷新设置页 agent 面板
    if (typeof window.refreshConfigAgentPanel === 'function') window.refreshConfigAgentPanel();
  } catch(e) {
    console.error('switchToAgent error:', e);
  }
}

// ===== Session CRUD =====

export function selectChatSession(session, agent) {
  // Reset sending state from previous session — resume button availability
  setIsSending(false);
  const _ssb = document.getElementById('chatSendBtn');
  if (_ssb) _ssb.disabled = false;
  const _sstb = document.getElementById('chatStopBtn');
  if (_sstb) _sstb.classList.add('hidden');
  _syncStreamToCurrent();
  // Hide stream row instead of removeChild — preserves DOM for seamless restore
  if (_chatStreamRow) _chatStreamRow.style.display = 'none';
  const prevSid = chatSessionId;
  // Stop wave badge for previous session when switching away
  if (prevSid && typeof updateStreamingBadge === 'function') updateStreamingBadge(prevSid, false);
  setChatSessionId(session.session_id);
  setChatCurrentAgent(agent);
  clearSessionUnread(session.session_id);
  _syncStreamFromCurrent();
  if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('chat');
  if (typeof updateChatHeader === 'function') updateChatHeader();
  window.chatCtxTokens = null;
  updateCtxInfoDisplay();
  if (typeof loadChatModels === 'function') loadChatModels();
  // Hide thinking panel on switch; restore from _thinkingSteps if target session has active thinking
  if (typeof chatThinkingHide === 'function') chatThinkingHide();
  // Restore thinking panel if target session has active thinking/stream
  if ((_thinkingSteps && _thinkingSteps.length > 0) || _isThinking) {
    const panel = document.getElementById('chatThinkingPanel');
    const body = document.getElementById('chatThinkingBody');
    if (panel && body) {
      body.innerHTML = '';
      // If still in thinking phase (no tool steps yet), show "正在思考..."
      if (_isThinking && (!_thinkingSteps || _thinkingSteps.length === 0)) {
        if (typeof chatThinkingAddTextRow === 'function') chatThinkingAddTextRow('正在思考...');
      }
      for (const step of (_thinkingSteps || [])) {
        if (step.type === 'text') {
          if (typeof chatThinkingAddTextRow === 'function') chatThinkingAddTextRow(step.text);
        } else {
          if (typeof chatThinkingAddToolStep === 'function') chatThinkingAddToolStep(step.callId, step.toolName, step.status, step.params, step.resultSummary);
        }
      }
      panel.classList.add('open');
    }
  }
  // If target session has active stream, show it immediately
  if (_chatStreamRow) {
    _chatStreamRow.style.display = '';
    // Re-render text in case deltas arrived while hidden
    const textEl = _chatStreamRow.querySelector('.siper-stream-text');
    if (textEl && _chatStreamAcc) {
      textEl.innerHTML = '';
      if (typeof renderMarkdown === 'function') textEl.appendChild(renderMarkdown(_chatStreamAcc));
      else textEl.innerHTML = chatRenderMarkdown(_chatStreamAcc);
    }
    const container = document.getElementById('chatMessages');
    if (container) container.scrollTop = container.scrollHeight;
    // Start wave badge for resumed stream
    if (typeof updateStreamingBadge === 'function') updateStreamingBadge(session.session_id, true);
  }
  setTimeout(() => { chatLoadSessionMessages(session.session_id); }, 50);
  // Lightweight update: only toggle active class instead of full rebuild
  if (prevSid !== session.session_id) {
    const items = document.querySelectorAll('.siper-session-item');
    items.forEach(el => {
      const sid = el.dataset && el.dataset.sessionId;
      if (sid === session.session_id) el.classList.add('active');
      else if (sid === prevSid) el.classList.remove('active');
    });
  } else {
    renderMiddleList();
  }
}

export function startNewChat(agent) {
  setChatStreamAcc('');
  setChatStreamRow(null);
  setChatStreamBubble(null);
  setIsSending(false);
  resetSessionReady(); // Reset session readiness for new session
  const _ssb = document.getElementById('chatSendBtn');
  if (_ssb) _ssb.disabled = false;
  const _sstb = document.getElementById('chatStopBtn');
  if (_sstb) _sstb.classList.add('hidden');
  if (agent) setChatCurrentAgent(agent);
  setChatSessionId(null);
  if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('chat');
  const headerName = document.getElementById('chatRightHeaderName');
  if (headerName) headerName.textContent = agent ? agent.display_name : '对话';
  chatClearMessages();
  window.chatCtxTokens = null;
  updateCtxInfoDisplay();
  const emptyState = document.getElementById('chatEmptyState');
  if (emptyState) { emptyState.style.display = 'flex'; emptyState.querySelector('div:last-child').textContent = '发送消息开始新对话'; }
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'new_session', agent: agent ? agent.name : 'default' }));
}

export function handleChatSearch(query) {
  const q = query.toLowerCase().trim();
  const container = document.getElementById('chatMiddleList');
  if (!container) return;
  const groups = container.querySelectorAll('.siper-agent-group');
  for (const group of groups) {
    const header = group.querySelector('.siper-agent-header');
    const text = header ? header.textContent.toLowerCase() : '';
    const match = !q || text.includes(q);
    group.style.display = match ? '' : 'none';
    if (match && q) {
      const nameEl = header.querySelector('.siper-agent-name');
      if (nameEl) {
        const agent = chatAgents.find(a => a.display_name === nameEl.textContent);
        if (agent) chatExpandedAgents[agent.name] = true;
      }
    }
  }
  if (q) renderMiddleList();
}

// ===== Context Menu =====

export function chatShowSessionMenu(e, session, agent) {
  chatHideSessionMenu();
  var menu = document.createElement('div');
  menu.className = 'siper-ctx-menu';
  menu.style.position = 'fixed';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.style.zIndex = '10000';
  menu.innerHTML = '<div class="siper-ctx-menu-item" data-action="rename"><span>✏️</span> 重命名</div><div class="siper-ctx-menu-item danger" data-action="delete"><span>🗑️</span> 删除</div><div class="siper-ctx-menu-item" data-action="copy"><span>📋</span> 复制ID</div>';
  menu.dataset.sessionId = session.session_id;
  menu.dataset.agentName = agent.name;
  document.body.appendChild(menu);
  setCtxMenu(menu);
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
  menu.querySelector('[data-action="rename"]').onclick = function() { renameChatSession(session, agent); chatHideSessionMenu(); };
  menu.querySelector('[data-action="delete"]').onclick = function() { deleteChatSessionConfirm(session, agent); chatHideSessionMenu(); };
  menu.querySelector('[data-action="copy"]').onclick = function() { copyChatSessionId(session.session_id); chatHideSessionMenu(); };
}

export function chatHideSessionMenu() {
  if (_ctxMenu) { _ctxMenu.remove(); setCtxMenu(null); }
}

export function copyChatSessionId(id) {
  if (navigator.clipboard) { navigator.clipboard.writeText(id).catch(function(){}); }
  showChatToast('已复制会话ID');
}

// ===== Rename Session =====

export function renameChatSession(session, agent) {
  if (!session) return;
  var currentName = session.title || session.session_id.substring(0, 8);
  var overlay = document.createElement('div');
  overlay.className = 'siper-rename-overlay';
  overlay.innerHTML = '<div class="siper-rename-dialog"><div class="siper-rename-title">重命名会话</div><input type="text" id="chatRenameInput" class="siper-rename-input" value="' + chatEscapeHtml(currentName) + '" maxlength="50" / aria-label="重命名"><div class="siper-rename-actions"><button class="siper-rename-cancel">取消</button><button class="siper-rename-ok">确认</button></div></div>';
  document.body.appendChild(overlay);
  var input = document.getElementById('chatRenameInput');
  input.focus(); input.select();
  var close = function() { overlay.remove(); };
  overlay.querySelector('.siper-rename-cancel').onclick = close;
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
  var doRename = function() {
    var newName = input.value.trim();
    if (!newName) { close(); return; }
    newName = newName.substring(0, 50);
    fetch('/api/sessions/' + session.session_id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newName }) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) { session.title = newName; renderMiddleList(); showChatToast('重命名成功'); updateChatHeader(); }
        else showChatToast(data.error || '重命名失败', 'error');
      })
      .catch(function() { showChatToast('网络错误', 'error'); });
    close();
  };
  overlay.querySelector('.siper-rename-ok').onclick = doRename;
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') close(); });
}

// ===== Delete Session =====

export function deleteChatSessionConfirm(session, agent) {
  if (!session) return;
  var displayName = session.title || session.session_id.substring(0, 8) + '...';
  chatConfirm({
    title: '删除会话',
    msg: '确定删除会话「' + displayName + '」？此操作不可恢复。',
    danger: true,
    okText: '确认删除',
    onConfirm: function() {
      fetch('/api/sessions/' + session.session_id, { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.success) {
            var idx = agent.sessions.indexOf(session);
            if (idx >= 0) agent.sessions.splice(idx, 1);
            if (chatSessionId === session.session_id) {
              setChatSessionId(null);
              chatClearMessages();
              var headerName = document.getElementById('chatRightHeaderName');
              if (headerName) headerName.textContent = '';
              var emptyState = document.getElementById('chatEmptyState');
              if (emptyState) { emptyState.style.display = 'flex'; emptyState.querySelector('div:last-child').textContent = '选择左侧 Agent 开始聊天'; }
            }
            renderMiddleList();
            showChatToast('会话已删除');
          } else showChatToast(data.error || '删除失败', 'error');
        })
        .catch(function() { showChatToast('网络错误', 'error'); });
    }
  });
}

// Close context menu on click elsewhere
document.addEventListener('click', function() { chatHideSessionMenu(); });

// ===== Agent Config =====

var _agentConfigHtmlTemplate = '\
    <div class="agent-tabs">\
      <button class="agent-tab active" id="agentTabAbout" onclick="switchConfigAgentPageTab(\'about\')"><span class="tab-icon">👤</span><span data-i18n="agent.tabAbout">关于</span></button>\
      <button class="agent-tab" id="agentTabFiles" onclick="switchConfigAgentPageTab(\'files\')"><span class="tab-icon">📄</span><span data-i18n="agent.tabFiles">配置文件</span></button>\
      <button class="agent-tab" id="agentTabMemory" onclick="switchConfigAgentPageTab(\'memory\')"><span class="tab-icon">🧠</span><span data-i18n="agent.tabMemory">记忆</span></button>\
    </div>\
    <div class="agent-tab-content" id="agentTabContentAbout">\
      <div class="agent-settings-grid">\
        <div class="card card-identity">\
          <div class="card-body">\
            <div class="identity-avatar-row">\
              <div class="identity-avatar-wrap" onclick="document.getElementById(\'avatarFileInput\').click()" title="点击更换头像">\
                <img id="cfgAvatarPreview" class="avatar-preview-lg">\
                <div class="avatar-overlay"><span>📷</span></div>\
                <input type="file" id="avatarFileInput" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" aria-label="上传头像">\
              </div>\
              <div class="identity-fields">\
                <div class="identity-name-row">\
                  <input type="text" id="cfgAgentName" class="field-input identity-name-input" value="Siper Agent" aria-label="智能体名称" placeholder="智能体名称">\
                  <button class="btn-icon identity-icon-btn" id="cfgAgentIconBtn" onclick="toggleIconPicker(event)" title="选择图标">🎭</button>\
                </div>\
                <div class="identity-meta-row">\
                  <span class="identity-hint">点击头像更换 · 自动保存</span>\
                </div>\
              </div>\
            </div>\
            <div class="field-group"><label class="field-label" data-i18n="agent.defaultModel">默认模型</label><div id="agentDefaultModelSection" style="margin-top:4px"><div class="empty-state" style="padding:8px;font-size:12px">加载中...</div></div></div>\
            <div class="field-group"><label class="field-label" data-i18n="agent.availableModels">可用模型</label><div id="agentModelListSection" style="margin-top:4px;max-height:200px;overflow-y:auto"><div class="empty-state" style="padding:8px;font-size:12px">加载中...</div></div></div>\
          </div>\        </div>\
        <div class="card"><div class="card-header"><span class="card-icon">⚡</span><span class="card-title-text" data-i18n="agent.limitsLlm">LLM 调用</span><span id="currentAgentLabelLimits" class="card-subtitle"></span></div><div class="card-body"><div class="field-group"><label class="field-label" data-i18n="agent.llmTimeout">请求超时 (秒)</label><small class="field-hint" data-i18n="agent.llmTimeoutHint">单次 API 调用等待时间</small><input type="number" id="agentCfgLlmTimeout" class="field-input field-input-sm" min="10" max="600" value="120" aria-label="LLM 超时"></div><div class="field-group"><label class="field-label" data-i18n="agent.llmMaxTokens">最大输出 Token</label><small class="field-hint" data-i18n="agent.llmMaxTokensHint">单次回复最大长度</small><input type="number" id="agentCfgLlmMaxTokens" class="field-input field-input-sm" min="256" max="32768" value="8192" aria-label="LLM 最大 Token"></div><div class="field-group"><label class="field-label" data-i18n="agent.llmMaxRetries">最大重试次数</label><small class="field-hint" data-i18n="agent.llmMaxRetriesHint">超时后自动重试轮数</small><input type="number" id="agentCfgLlmMaxRetries" class="field-input field-input-sm" min="0" max="5" value="2" aria-label="LLM 最大重试次数"></div></div></div>\
        <div class="card"><div class="card-header"><span class="card-icon">🔧</span><span class="card-title-text" data-i18n="agent.limitsTool">工具调用</span></div><div class="card-body"><div class="field-group"><label class="field-label" data-i18n="agent.maxToolRounds">最大工具轮数</label><small class="field-hint" data-i18n="agent.maxToolRoundsHint">单条消息最多工具调用轮次</small><input type="number" id="agentCfgMaxToolRounds" class="field-input field-input-sm" min="1" max="200" value="100" aria-label="最大工具轮次"></div><div class="field-group"><label class="field-label" data-i18n="agent.maxTools">最大并发工具数</label><small class="field-hint" data-i18n="agent.maxToolsHint">同时执行的工具数上限</small><input type="number" id="agentCfgMaxTools" class="field-input field-input-sm" min="1" max="500" value="300" aria-label="最大并发工具数"></div></div></div>\
        <div class="card"><div class="card-header"><span class="card-icon">💬</span><span class="card-title-text" data-i18n="agent.limitsSession">会话</span></div><div class="card-body"><div class="field-group"><label class="field-label" data-i18n="agent.sessionTimeout">会话超时 (秒)</label><small class="field-hint" data-i18n="agent.sessionTimeoutHint">空闲会话保留时间</small><input type="number" id="agentCfgSessionTimeout" class="field-input field-input-sm" min="60" max="86400" value="3600" aria-label="会话超时"></div><div class="field-group"><label class="field-label" data-i18n="agent.maxHistoryMessages">历史消息加载数</label><small class="field-hint" data-i18n="agent.maxHistoryMessagesHint">每次加载的历史消息条数</small><input type="number" id="agentCfgMaxHistoryMessages" class="field-input field-input-sm" min="10" max="200" value="50" aria-label="最大历史消息数"></div></div></div>\
      </div>\
    </div>\
    <div class="agent-tab-content hidden" id="agentTabContentFiles">\
      <div class="files-grid">\
        <div class="card card-editor"><div class="card-header"><span class="card-title-text">soul.md</span></div><div class="card-body"><textarea class="code-editor" id="agentSoulContent" placeholder="（暂无内容）" aria-label="灵魂内容"></textarea></div><div class="card-footer"><button class="btn-sm" onclick="refreshAgentFile(\'soul\')" data-i18n="agent.reset">重置</button><button class="btn-sm primary" onclick="saveAgentFile(\'soul\')">保存</button></div></div>\
        <div class="card card-editor"><div class="card-header"><span class="card-title-text">agent.md</span></div><div class="card-body"><textarea class="code-editor" id="agentMdContent" placeholder="（暂无内容）" aria-label="配置内容"></textarea></div><div class="card-footer"><button class="btn-sm" onclick="refreshAgentFile(\'config\')" data-i18n="agent.reset">重置</button><button class="btn-sm primary" onclick="saveAgentFile(\'config\')">保存</button></div></div>\
      </div>\
    </div>\
    <div class="agent-tab-content hidden" id="agentTabContentMemory">\
      <div class="files-grid">\
        <div class="card card-editor"><div class="card-header"><span class="card-title-text">记忆文件</span></div><div class="card-body"><textarea class="code-editor" id="agentMemoryContent" placeholder="（暂无记忆内容）" aria-label="记忆内容"></textarea></div><div class="card-footer"><button class="btn-sm" onclick="refreshAgentFile(\'memory\')" data-i18n="agent.reset">重置</button><button class="btn-sm primary" onclick="saveAgentFile(\'memory\')">保存</button></div></div>\
        <div class="card"><div class="card-header"><span class="card-icon">📋</span><span class="card-title-text">记忆 & 技能配置</span></div><div class="card-body"><div class="field-group"><label class="field-label" data-i18n="agent.memoryMaxTokens">记忆最大 Token</label><small class="field-hint" data-i18n="agent.memoryMaxTokensHint">记忆整合到提示词的最大长度</small><input type="number" id="agentCfgMemoryMaxTokens" class="field-input field-input-sm" min="500" max="50000" value="20000" aria-label="记忆最大 Token"></div><div class="field-group"><label class="field-label" data-i18n="agent.skillPreFilterTopK">技能预筛选 Top-K</label><small class="field-hint" data-i18n="agent.skillPreFilterTopKHint">预筛选返回的技能数量</small><input type="number" id="agentCfgSkillPreFilterTopK" class="field-input field-input-sm" min="1" max="20" value="5" aria-label="技能预筛选 Top-K"></div><div class="field-group"><label class="field-label">记忆文件路径</label><input type="text" id="agentCfgMemoryPath" class="field-input" placeholder="agents/{name}/memory.md" readonly aria-label="记忆文件路径"></div></div><div class="card-footer"><span class="auto-save-hint" data-i18n="agent.autoSaveHint">✦ 修改后自动保存</span><button class="btn-sm" onclick="resetAgentLimits()" data-i18n="agent.resetLimits">重置默认</button></div></div>\
      </div>\
    </div>';

export function renderAgentPage(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div id="chatAgentPage" style="display:flex;flex-direction:column;height:100%;"></div>';
  loadAgentsForConfig();
}

function loadAgentsForConfig() {
  var page = document.getElementById('chatAgentPage');
  if (!page) return;
  fetch('/api/agents')
    .then(r => r.json())
    .then(data => {
      setChatAgentData(data);
      var agents = (data && data.agents) || [];
      var active = (data && data.active) || '';
      if (!agents.length) { page.innerHTML = '<div class="text-dim" style="padding:40px;text-align:center;">暂无智能体</div>'; return; }
      var selHtml = '<div class="bg-bg" style="padding:8px 10px;border-bottom:1px solid var(--color-border);flex-shrink:0;"><div style="font-size:12px;font-weight:600;margin-bottom:6px;" class="text-normal">选择智能体</div><div style="display:flex;gap:4px;flex-wrap:wrap;">';
      for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        var isActive = a.name === active;
        var btnClass = isActive ? 'siper-btn primary' : 'siper-btn';
        selHtml += '<button class="' + btnClass + ' onclick="selectChatAgent(\'' + a.name + '\')" style="font-size:12px;padding:5px 12px;">' + chatEscapeHtml(a.display_name || a.name) + (isActive ? ' ●' : '') + '</button>';
      }
      selHtml += '</div></div>';
      page.innerHTML = selHtml + '<div id="chatAgentDetail" style="flex:1;overflow-y:auto;padding:10px;"></div>';
      if (agents.length > 0) selectChatAgent(agents[0].name);
    })
    .catch(() => { page.innerHTML = '<div class="text-danger" style="padding:20px;">加载失败</div>'; });
}

export function selectChatAgent(name) {
  setSelectedAgent(name);
  var agent = chatAgents.find(function(a) { return a.name === name; });
  if (!agent) return;
  setAgentConfigName(name);
  var content = document.getElementById('chatContentArea');
  var headerName = document.getElementById('chatRightHeaderName');
  if (!content) return;
  if (headerName) headerName.innerHTML = '<strong>' + chatEscapeHtml(agent.name) + ' - 设置</strong>';
  content.innerHTML = _agentConfigHtmlTemplate;
  content.className = 'siper-content siper-full-content';
  if (typeof window.attachAgentAutoSaveListeners === 'function') window.attachAgentAutoSaveListeners();
  // 动态注入 grid card 间距修复（避免 .card + .card margin-top:8px 影响 grid 布局）
  if (!document.getElementById('grid-card-fix-style')) {
    var _style = document.createElement('style');
    _style.id = 'grid-card-fix-style';
    _style.textContent = '.agent-settings-grid > .card + .card, .files-grid > .card + .card { margin-top: 0 !important; }';
    document.head.appendChild(_style);
  }
  fetch('/api/agents')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      window.agentConfigData = data;
      window.currentConfigAgent = name;
      if (typeof window.selectConfigAgent === 'function') window.selectConfigAgent(name);
      if (typeof window.loadGlobalModelsForAgent === 'function') window.loadGlobalModelsForAgent();
    })
    .catch(function() {});
}

// Agent config operations moved to agent-config.js — old wcfg-prefixed functions removed
