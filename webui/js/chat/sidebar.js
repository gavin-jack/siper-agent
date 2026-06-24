// chat/sidebar.js — 中间栏、会话列表、右键菜单、Agent 配置
import { getWs } from '../core.js?v=1782281677851';
import {
  _chatSessionId, _chatCurrentAgent,
  _unreadSessions, _chatStreamAcc, _chatStreamRow, _chatStreamBubble, _thinkingSteps, _isThinking,
  _chatAgentData, _chatSelectedAgent, _agentConfigName, _chatAgentFiles, _chatCurAgentFile,
  _ctxMenu,
  setChatSessionId, setChatCurrentAgent, setSelectedAgent, setAgentConfigName,
  setChatAgentData, setChatAgentFiles, setChatCurAgentFile, setCtxMenu,
  setChatStreamAcc, setChatStreamRow, setChatStreamBubble, setIsSending, setThinkingSteps, setIsThinking, resetSessionReady, updateStreamingBadge, reapplyAllStreamingBadges,
  syncStreamToCurrent, syncStreamFromCurrent
} from './state.js?v=1782281677851';
import { chatEscapeHtml, chatRenderMarkdown, chatClearMessages, updateCtxInfoDisplay, buildMetaHtml } from './message.js?v=1782281677851';
import { chatThinkingHide } from './thinking.js?v=1782281677851';
import { updateChatHeader } from './input.js?v=1782281677851';
import { toast, showInput } from '../components/toast.js?v=1782281677851';
import { chatConfirm } from './toast.js?v=1782281677851';

// ===== 从 page_cache 读取 agents 列表 =====
function getAgentsFromCache() {
  if (typeof window.__getPageCache === 'function') {
    const agents = window.__getPageCache('agents');
    if (agents) return agents;
  }
  return [];
}

// ===== Per-session DOM 缓存 =====
// 保存每个会话的 chatMessages innerHTML + streamRow，切换会话时保留流式 DOM
// key = sessionId, value = { html: string, streamRow: HTMLElement|null }
const _sessionDomCache = new Map();
// 暴露给 stream.js 用于跨会话 delta 更新缓存 DOM
window._sessionDomCache = _sessionDomCache;

/** 保存当前会话的 DOM 到缓存 */
function _saveDomCache(sessionId) {
  if (!sessionId) return;
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const streamRow = container.querySelector('.siper-stream-row');
  if (streamRow) streamRow.remove();
  _sessionDomCache.set(sessionId, { html: container.innerHTML, streamRow: streamRow || null });
}

/** 从缓存恢复 DOM，返回是否命中 */
function _restoreDomCache(sessionId) {
  const cached = _sessionDomCache.get(sessionId);
  if (!cached) return false;
  const container = document.getElementById('chatMessages');
  if (!container) return false;
  container.innerHTML = cached.html;
  if (cached.streamRow) container.appendChild(cached.streamRow);
  return true;
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

// 展开状态用 Map 存储，不受 agent 数据重建影响
const _expandedAgents = new Map();

/** 获取 agent 中最新有 updated_at 的会话时间，新会话（无 updated_at）不参与 agent 排序 */
function _getAgentLatestUpdated(agent) {
  if (!agent || !agent.sessions) return '';
  for (const s of agent.sessions) {
    if (s.updated_at) return s.updated_at;
  }
  return '';
}

let _renderMiddleTimer = null;
let _switchingAgents = new Set();  // 防重入锁：正在切换的 agent 名集合
/** 展开所有 agent（首次加载时默认全部展开） */
export function expandAllAgents() {
  const agents = getAgentsFromCache();
  for (const agent of agents) {
    _expandedAgents.set(agent.name, true);
  }
}

export function renderMiddleList() {
  // 直接执行排序渲染，不走 debounce
  // 原因：debounce 导致 updateSessionPreview 和 chatLoadAllSessions 竞态，排序结果不稳定
  if (_renderMiddleTimer) { clearTimeout(_renderMiddleTimer); _renderMiddleTimer = null; }
  _doRenderMiddle();
}

/** 从后端拉取最新 agents+sessions 数据，更新 page_cache 并渲染中栏 */
export async function refreshAgentsAndRender() {
  try {
    const [agentsResp, sessionsResp] = await Promise.all([
      fetch('/api/agents'),
      fetch('/api/sessions'),
    ]);
    const agentsData = await agentsResp.json();
    const sessionsData = await sessionsResp.json();
    if (agentsData && agentsData.agents) {
      // 按 agent_name 分组 sessions
      const sessionsByAgent = {};
      const sessList = Array.isArray(sessionsData) ? sessionsData : (sessionsData.sessions || []);
      for (const s of sessList) {
        const name = s.agent_name || s.agent || 'default';
        if (!sessionsByAgent[name]) sessionsByAgent[name] = [];
        sessionsByAgent[name].push(s);
      }
      for (const agent of agentsData.agents) {
        agent.sessions = sessionsByAgent[agent.name] || [];
      }
      if (typeof window.__setPageCache === 'function') {
        window.__setPageCache('agents', agentsData.agents);
      }
      _doRenderMiddle();
    }
  } catch(e) {
    console.error('[sidebar] refreshAgentsAndRender failed:', e);
  }
}

function _doRenderMiddle() {
  const container = document.getElementById('chatMiddleList');
  if (!container) return;
  container.innerHTML = '';
  const agents = getAgentsFromCache();
  if (!agents.length) {
    container.innerHTML = '<div class="siper-loading siper-loading--sm">加载中...</div>';
    return;
  }
  // 默认全部展开（agent 始终展开，会话列表按需折叠）
  if (_expandedAgents.size === 0) {
    for (const agent of agents) {
      _expandedAgents.set(agent.name, true);
    }
  }
  // Sort agents by latest session updated_at descending
  // Only sessions with updated_at participate; new sessions (no updated_at) are skipped
  const sortedAgents = [...agents].sort((a, b) => {
    const aLatest = _getAgentLatestUpdated(a);
    const bLatest = _getAgentLatestUpdated(b);
    return bLatest < aLatest ? -1 : bLatest > aLatest ? 1 : 0;
  });
  for (const agent of sortedAgents) {
    // Sort sessions: new sessions (no updated_at) first, then by updated_at desc
    if (agent.sessions && agent.sessions.length > 1) {
      agent.sessions.sort((a, b) => {
        const aIsNew = !a.updated_at;
        const bIsNew = !b.updated_at;
        if (aIsNew !== bIsNew) return aIsNew ? -1 : 1; // new sessions first
        const aTime = a.updated_at || a.created_at || '';
        const bTime = b.updated_at || b.created_at || '';
        return bTime < aTime ? -1 : bTime > aTime ? 1 : 0;
      });
    }
    const isExpanded = _expandedAgents.get(agent.name) === true;
    const isActiveAgent = _chatCurrentAgent && _chatCurrentAgent.name === agent.name;
    const group = document.createElement('div');
    group.className = 'siper-agent-group' + (isExpanded ? ' expanded' : '');
    const header = document.createElement('div');
    header.className = 'siper-agent-header' + (isActiveAgent ? ' active' : '');
    header.setAttribute('role', 'button');
    header.tabIndex = 0;
    header.onclick = (e) => {
      if (e.target.classList.contains('siper-agent-add-btn')) {
        e.stopPropagation();
        const agentName = e.target.dataset.agentName;
        const agent = agents.find(a => a.name === agentName);
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
      <span class="siper-agent-count">${(agent.sessions || []).length}</span>
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
        const SHOW_MAX = 3;
        const showAll = _expandedAgents.get(agent.name + '_all') === true;
        const sessionsToShow = showAll ? agent.sessions : agent.sessions.slice(0, SHOW_MAX);
        const hiddenCount = agent.sessions.length - SHOW_MAX;
        sessionsToShow.forEach((session) => {
          const item = document.createElement('div');
          const isActiveSession = _chatSessionId === session.session_id;
          const _unread = !isActiveSession && isSessionUnread(session.session_id);
          item.className = 'siper-session-item' + (isActiveSession ? ' active' : '') + (_unread ? ' unread' : '');
          item.dataset.sessionId = session.session_id;
          item.setAttribute('role', 'button');
          item.tabIndex = 0;
          item.onclick = (e) => { e.stopPropagation(); selectChatSession(session, agent); };
          item.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); chatShowSessionMenu(e, session, agent); };
          item.ondblclick = (e) => { e.stopPropagation(); renameChatSession(session, agent); };
          const preview = (session.last_message || '').replace(/\n/g, ' ').substring(0, 60);
          const displayName = session.title || session.session_id.substring(0, 12);
          const _timeStr = session.updated_at || session.created_at || '';
          const _timeDisplay = _timeStr ? new Date(_timeStr).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
          item.innerHTML = `
            <div class="siper-session-info">
              <div class="siper-session-name">${chatEscapeHtml(displayName)}</div>
              <div class="siper-session-time">${chatEscapeHtml(_timeDisplay)}</div>
              <div class="siper-session-preview">${chatEscapeHtml(preview)}</div>
            </div>
            ${_unread ? '<span class="siper-session-unread-dot"></span>' : ''}
            <button class="siper-session-delete-btn" title="删除会话">×</button>
          `;
          const delBtn = item.querySelector('.siper-session-delete-btn');
          if (delBtn) {
            if (!isActiveSession) delBtn.style.display = 'none';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteChatSessionConfirm(session, agent); };
          }
          sessionsWrap.appendChild(item);
        });
        if (!showAll && hiddenCount > 0) {
          const moreBtn = document.createElement('button');
          moreBtn.className = 'siper-show-more-btn';
          moreBtn.textContent = `查看更多 (${hiddenCount})`;
          moreBtn.onclick = (e) => {
            e.stopPropagation();
            _expandedAgents.set(agent.name + '_all', true);
            renderMiddleList();
          };
          sessionsWrap.appendChild(moreBtn);
        }
      }
    }
    group.appendChild(sessionsWrap);
    container.appendChild(group);
  }
  // Re-apply streaming wave badges after DOM rebuild
  if (typeof reapplyAllStreamingBadges === 'function') reapplyAllStreamingBadges();
}

export async function chatToggleAgent(agentName) {
  // 防重入：如果正在切换同一个 agent，忽略重复点击
  if (_switchingAgents.has(agentName)) return;
  _switchingAgents.add(agentName);
  try {
    // 切换展开/折叠
    const current = _expandedAgents.get(agentName) === true;
    _expandedAgents.set(agentName, !current);
    _expandedAgents.delete(agentName + '_all');
    // 先切换 agent（更新 _chatCurrentAgent），再渲染中栏，确保 active class 正确
    await switchToAgent(agentName);
    renderMiddleList();
    // 展开态点击 → 折叠后显示 agent 设置页面（右栏）
    if (current && typeof window.selectChatAgent === 'function') {
      window.selectChatAgent(agentName);
    }
  } finally {
    _switchingAgents.delete(agentName);
  }
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
      toast.error(t('agent.switchFailed') + ': ' + (d.error || ''));
      return;
    }
    // 更新当前 agent
    const agents = getAgentsFromCache();
    const agent = agents.find(a => a.name === agentName);
    if (agent) {
      setChatCurrentAgent(agent);
      setSelectedAgent(agentName);
    }
    // 等待 WS 推送更新 agents 数据（renderAgentList 会自动渲染）
    await new Promise(r => setTimeout(r, 100)); // 等后端写入
    // 清空当前会话，等待用户选择
    setChatSessionId(null);
    // 不调用 chatSwitchPage — 调用方决定切换到哪个页面
    if (typeof updateChatHeader === 'function') updateChatHeader();
    // 刷新设置页 agent 面板
    if (typeof window.refreshConfigAgentPanel === 'function') window.refreshConfigAgentPanel();
  } catch(e) {
    console.error('switchToAgent error:', e);
    toast.error(t ? t('chat.switchAgentFailed') : '切换 Agent 失败');
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
  syncStreamToCurrent();
  // 切换会话时清除思考状态，防止上一个会话的"正在思考"残留
  setThinkingSteps([]);
  setIsThinking(false);
  // Hide stream row instead of removeChild — preserves DOM for seamless restore
  if (typeof _chatStreamRow !== 'undefined' && _chatStreamRow) _chatStreamRow.style.display = 'none';
  const prevSid = _chatSessionId;
  const _prevAgent = _chatCurrentAgent;

  // ★ 切换前：保存当前会话 DOM 到缓存（含流式 DOM）
  if (prevSid) _saveDomCache(prevSid);

  setChatSessionId(session.session_id);
  setChatCurrentAgent(agent);
  // 中栏只更新 active class，不触发全量 rebuild（debounce 的 renderMiddleList 已足够）
  if (prevSid !== session.session_id) {
    const items = document.querySelectorAll('.siper-session-item');
    items.forEach(el => {
      const sid = el.dataset && el.dataset.sessionId;
      if (sid === session.session_id) el.classList.add('active');
      else if (sid === prevSid) el.classList.remove('active');
    });
  }
  clearSessionUnread(session.session_id);
  syncStreamFromCurrent();
  // 确保 agent 展开（点+创建新会话或切换会话时）
  _expandedAgents.set(agent.name, true);
  // 始终切换到 chat 页面确保右栏渲染消息列表+输入框
  if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('chat');
  // 每次切换会话时重新渲染右栏内容（确保 chatContentArea 有最新的消息容器）
  var _contentArea = document.getElementById('chatContentArea');
  if (_contentArea && typeof window.renderChatPage === 'function') {
    window.renderChatPage(_contentArea, true);
  }
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
  // ★ 切换后：优先从缓存恢复 DOM，无缓存则 HTTP 加载
  const _sid = session.session_id;
  const _cacheHit = _sid && _restoreDomCache(_sid);
  if (_cacheHit) {
    // 缓存命中：DOM 已恢复，恢复流式状态
    if (_chatStreamRow) {
      _chatStreamRow.style.display = '';
      const textEl = _chatStreamRow.querySelector('.siper-stream-text');
      if (textEl && _chatStreamAcc) {
        textEl.innerHTML = '';
        if (typeof renderMarkdown === 'function') textEl.appendChild(renderMarkdown(_chatStreamAcc));
        else textEl.innerHTML = chatRenderMarkdown(_chatStreamAcc);
      }
      if (typeof updateStreamingBadge === 'function' && _chatStreamAcc) updateStreamingBadge(_sid, true);
    }
    // 无论是否有流式 DOM，都滚动到底部（缓存恢复后 DOM 可能未渲染完成，用 rAF 确保）
    requestAnimationFrame(function() {
      const container = document.getElementById('chatMessages');
      if (container) container.scrollTop = container.scrollHeight;
    });
  } else {
    // 无缓存：HTTP 加载历史消息
    if (_sid) {
      fetch('/api/sessions/' + encodeURIComponent(_sid))
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.success && Array.isArray(d.messages) && typeof window.renderChatMessages === 'function') {
            window.renderChatMessages(d.messages);
          }
        })
        .catch(function(e) { console.error('[sidebar] load session messages failed:', e); });
    }
  }
}

export function renameChatSession(session, agent) {
  const currentTitle = session.title || session.session_id.substring(0, 20);
  showInput({
    title: t('session.renamePrompt') || '重命名会话',
    placeholder: currentTitle,
    onConfirm: function(newTitle) {
      if (!newTitle || newTitle.trim() === '' || newTitle === currentTitle) return;
      const title = newTitle.trim();
      fetch(`/api/sessions/${encodeURIComponent(session.session_id)}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ title })
      }).then(r => r.json()).then(d => {
        if (d.success) {
          session.title = title;
          renderMiddleList();
          toast.success(t('session.renameSuccess') || '重命名成功');
        } else {
          toast.error(t('session.renameFailed') + ': ' + (d.error || ''));
        }
      }).catch(e => {
        toast.error(t('session.renameFailed') + ': ' + e.message);
      });
    }
  });
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
  // 不调用 chatSwitchPage — session_created handler 中 selectChatSession 会统一渲染右栏
  chatClearMessages();
  window.chatCtxTokens = null;
  updateCtxInfoDisplay();
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'new_session', agent: agent ? agent.name : 'default' }));

  // 乐观更新：立即在本地插入新会话 DOM，不等后端响应
  // 后端 session_created 到达后只更新 session_id，不重新渲染中栏
  if (agent) {
    const agents = getAgentsFromCache();
    const targetAgent = agents.find(a => a.name === agent.name);
    if (targetAgent) {
      // 创建新会话占位对象（session_id 稍后由后端更新）
      // 不设 updated_at，保持"新会话"身份，不参与 agent 排序
      const _newSession = {
        session_id: 'new_' + Date.now(),
        title: '',
        last_message: '',
        created_at: new Date().toISOString(),
      };
      targetAgent.sessions.unshift(_newSession);
      // 立即切换到新会话（右栏渲染 + agent 展开）
      selectChatSession(_newSession, agent);
    }
  }
}

export function handleChatSearch(query) {
  const q = query.toLowerCase().trim();
  const agents = getAgentsFromCache();
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
        const agent = agents.find(a => a.display_name === nameEl.textContent);
        if (agent) _expandedAgents.set(agent.name, true);
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
      const _btn = this.querySelector('.siper-notif-btn-danger') || this.querySelector('.siper-notif-btn-primary');
      if (_btn) { _btn.disabled = true; _btn.textContent = '删除中...'; }
      fetch('/api/sessions/' + session.session_id, { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (_btn) { _btn.disabled = false; _btn.textContent = '确认删除'; }
          if (data.success) {
            var idx = agent.sessions.indexOf(session);
            if (idx >= 0) agent.sessions.splice(idx, 1);
            if (_chatSessionId === session.session_id) {
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
          if (_btn) { _btn.disabled = false; _btn.textContent = '确认删除'; }
        })
        .catch(function() { if (_btn) { _btn.disabled = false; _btn.textContent = '确认删除'; } showChatToast('网络错误', 'error'); });
    }
  });
}

// Close context menu on click elsewhere
document.addEventListener('click', function() { chatHideSessionMenu(); });


// ===== Window Mounts (for renderer handlers) =====
window.renderMiddleList = renderMiddleList;

/**
 * Render agent list from backend snapshot data.
 * Updates page_cache and renders middle list.
 * @param {Array} agents - [{name, display_name, description, sessions: [...]}]
 */
window.renderAgentList = function(agents) {
  if (!Array.isArray(agents)) return;
  // 从旧 page_cache 保留 available_models 等字段（sync_agents 不含这些字段）
  const oldAgents = (typeof window.__getPageCache === 'function') ? (window.__getPageCache('agents') || []) : [];
  if (oldAgents.length > 0) {
    for (const newAgent of agents) {
      const old = oldAgents.find(a => a.name === newAgent.name);
      if (old) {
        // 保留旧数据中的 available_models / default_chat_model 等新字段
        for (const key of ['available_models', 'default_chat_model', 'default_vision_model', 'default_tts_model', 'appearance', 'session_timeout', 'max_tools', 'max_tool_rounds', 'llm_timeout', 'llm_max_tokens', 'llm_max_retries', 'max_history_messages', 'skill_pre_filter_top_k', 'memory_integration']) {
          if (newAgent[key] === undefined && old[key] !== undefined) {
            newAgent[key] = old[key];
          }
        }
      }
    }
  }
  // 同步到 page_cache
  if (typeof window.__onPageCacheUpdate === 'function') {
    window.__onPageCacheUpdate('agents', agents);
  }
  // 从 page_cache 同步当前 agent（不再依赖模块级 _chatCurrentAgent）
  const _pcCurrent = window.__getPageCache ? window.__getPageCache('current_agent') : null;
  if (_pcCurrent && _pcCurrent.name) {
    const updated = agents.find(a => a.name === _pcCurrent.name);
    if (updated && typeof window.__onPageCacheUpdate === 'function') {
      window.__onPageCacheUpdate('current_agent', updated);
    }
  }
  // Re-render middle list
  renderMiddleList();
};
