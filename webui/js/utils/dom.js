// utils/dom.js — 全局 DOM 操作
// 从 core.js 迁移

import { escapeHtml } from './escape.js';
import { toast } from '../components/toast.js';
import { t, currentLang } from './i18n.js';
import { setWs, setIsSending, setChatSessionId, chatSessionId, chatCurrentAgent, chatAgents, chatExpandedAgents, chatModelContextWindow, markSessionReady, setIsThinking, updateStreamingBadge } from '../chat/state.js';
import { chatHandleStreamDelta, chatHandleStreamEnd, chatHandleToolProgress, chatThinkingHide, chatThinkingClear } from '../chat/stream.js';

// Pages rendered inside #page-chat three-column layout (migrated from core.js)
const _CHAT_RENDERED_PAGES = new Set(['chat','skills','token','global-settings','logs']);
let currentPage = 'chat';
let currentSession = null;  // null until first WS connection or session load
let ws = null;  // WebSocket connection — set by connectWS(), used by _sendClarifyResponse
let wsConnId = null;  // WS connection ID, set by server 'connected' message
let _audioCtx = null;  // Web Audio context — lazily initialized by playReplySound()

export function navigateToPage(page, skipHash) {
  if (!page) return;

  // Chat-family pages (rendered inside #page-chat three-column layout)
  if (_CHAT_RENDERED_PAGES.has(page)) {
    // Show chat page, hide dynamic page container
    const chatPage = document.getElementById('page-chat');
    const dynamicPage = document.getElementById('page-dynamic');
    if (chatPage) chatPage.style.display = 'flex';
    if (dynamicPage) dynamicPage.style.display = 'none';
    currentPage = page;
    if (typeof window.chatSwitchPage === 'function') {
      window.chatSwitchPage(page, true); // true = fromNavigate, skip hash update
    }
    return;
  }

  // Standalone pages (rendered into #page-dynamic)
  const chatPage = document.getElementById('page-chat');
  const dynamicPage = document.getElementById('page-dynamic');
  if (chatPage) chatPage.style.display = 'none';
  if (dynamicPage) {
    dynamicPage.style.display = 'flex';
    dynamicPage.innerHTML = ''; // Clear previous page
  }
  currentPage = page;
  if (!skipHash) location.hash = '#/' + page;

  // Clone template DOM into #page-dynamic (templates are in hidden #tpl-* divs)
  const tplMap = {
    'sessions': 'tpl-sessions',
    'memory': 'tpl-memory',
    'agent-config': 'tpl-agent-config',
    'theme-settings': 'tpl-theme-settings',
  };
  const tplId = tplMap[page];
  if (tplId) {
    const tpl = document.getElementById(tplId);
    if (tpl && dynamicPage) {
      const clone = tpl.cloneNode(true);
      clone.style.display = '';
      clone.removeAttribute('id');
      dynamicPage.appendChild(clone);
    }
  }

  // cloneNode(true) does not clone HTML event handler attributes (onchange, onclick, etc.)
  // Re-bind them manually after cloning
  if (page === 'agent-config') {
    const avatarInput = dynamicPage.querySelector('#avatarFileInput');
    if (avatarInput && typeof window.uploadAgentAvatar === 'function') {
      avatarInput.addEventListener('change', window.uploadAgentAvatar);
    }
    // Re-bind avatar image click to trigger file input (cloneNode loses onclick)
    const avatarImg = dynamicPage.querySelector('#cfgAgentAvatar');
    if (avatarImg) {
      avatarImg.addEventListener('click', function() {
        const inp = document.getElementById('avatarFileInput');
        if (inp) inp.click();
      });
    }
  }

  // Page-specific init — render standalone pages into #page-dynamic
  if (page === 'sessions') {
    if (typeof window.refreshSessions === 'function') window.refreshSessions();
  }
  if (page === 'memory') {
    if (typeof window.populateMemoryAgentSelector === 'function') {
      window.populateMemoryAgentSelector();
    }
    if (typeof window.refreshMemoryPage === 'function') {
      window.refreshMemoryPage();
    }
  }
  if (page === 'agent-config') {
    setChatSessionId(null);
    if (typeof window.refreshConfigAgentPanel === 'function') window.refreshConfigAgentPanel();
    if (typeof window.loadAgentSettings === 'function') window.loadAgentSettings();
    if (typeof window.renderMiddleList === 'function') window.renderMiddleList();
  }
  if (page === 'theme-settings') {
    if (typeof window.showThemeSettings === 'function') window.showThemeSettings();
  }
  if (page === 'models') {
    if (typeof window.refreshModelsPage === 'function') window.refreshModelsPage();
  }
  if (page === 'file-browser') {
    if (typeof window.refreshFileList === 'function') window.refreshFileList();
  }
}

// ===== Clarify Response =====
// Send user's clarification answer back to the server during tool-call ambiguity
export function _sendClarifyResponse(sessionId, answer) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type: 'clarify_response', session_id: sessionId, answer: answer}));
  }
  setIsSending(false);
  const _sb = document.getElementById('chatSendBtn');
  if (_sb) _sb.disabled = false;
}

export function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPort = parseInt(location.port) + 1;
  const wsUrl = `${proto}//${location.hostname}:${wsPort}`;
  ws = new WebSocket(wsUrl);
  setWs(ws);

  ws.onopen = () => {
    setConnected(true);
    addLog('info', t('log.wsConnected'), currentLang);
  };
  ws.onclose = (e) => {
    setConnected(false);
    const _te = document.getElementById('typing');
    if (_te) _te.className = 'typing';
    // Reset send state on disconnect
    setIsSending(false);
    const _sb = document.getElementById('sendBtn');
    const _stb = document.getElementById('stopBtn');
    if (_sb) _sb.disabled = false;
    if (_stb) _stb.classList.add('hidden');
    addLog('warn', t('chat.disconnected'), currentLang);
    setTimeout(connectWS, 3000);
  };
  ws.onerror = () => {};
  // ===== Streaming state (aggregated: all deltas → single bubble) =====
  let _streamAcc = '';
  let _streamBubble = null;
  let _streamBubbleWrap = null;
  let _streamRow = null;
  let _streamRawData = null;

  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'stream_delta') {
        // Route to chat page — chatHandleStreamDelta will handle per-session state
        if (currentPage === 'chat' && typeof chatHandleStreamDelta === 'function') {
          chatHandleStreamDelta(d.delta || '', d.session_id || null);
          return;
        }
        _streamAcc += d.delta || '';
        const chatEl = document.getElementById('chatMessages');
        if (!chatEl) return;
        if (!_streamBubble) {
          _streamRow = document.createElement('div');
          _streamRow.className = 'msg-row agent msg-row-horizontal';
          const avatarWrap = document.createElement('div');
          avatarWrap.className = 'msg-avatar-wrap';
          const agentName = (typeof chatCurrentAgent !== 'undefined' && chatCurrentAgent && chatCurrentAgent.name) ? chatCurrentAgent.name : '';
          avatarWrap.innerHTML = agentName
            ? `<img class="msg-avatar-img" src="/api/avatar?agent=${encodeURIComponent(agentName)}" alt="Agent" onerror="this.src='/static/default_avatar_256.png'">`
            : getAvatarHtml('agent');
          _streamBubbleWrap = document.createElement('div');
          _streamBubbleWrap.className = 'msg agent-bubble';
          _streamBubble = document.createElement('div');
          _streamBubble.className = 'msg-body';
          _streamBubbleWrap.appendChild(_streamBubble);
          _streamRow.appendChild(avatarWrap);
          _streamRow.appendChild(_streamBubbleWrap);
          chatEl.appendChild(_streamRow);
        }
        // Throttled markdown render for non-chat stream deltas
        _streamBubble.textContent = '';
        _streamBubble.appendChild(renderMarkdown(_streamAcc));
      } else if (d.type === 'stream_end') {
        const _endData = d.data || {};
        const _replySid = _endData.session_id || null;
        // Route to chat page — chatHandleStreamEnd will handle per-session state
        if (currentPage === 'chat' && typeof chatHandleStreamEnd === 'function') {
          chatHandleStreamEnd(_endData, _replySid);
          setIsSending(false);
          const _sb = document.getElementById('chatSendBtn');
          if (_sb) _sb.disabled = false;
          // Play notification sound
          if (typeof playReplySound === 'function') playReplySound();
          // Mark unread if reply belongs to a different session
          if (_replySid && _replySid !== chatSessionId) {
            if (typeof markSessionUnread === 'function') markSessionUnread(_replySid);
          }
          // Update last_message in middle column session list
          if (chatSessionId && chatCurrentAgent) {
            const _agent = chatAgents.find(a => a.name === chatCurrentAgent.name);
            if (_agent) {
              const _sess = _agent.sessions.find(s => s.session_id === chatSessionId);
              if (_sess) {
                const _resp = _endData.response || _chatStreamAcc || '';
                _sess.last_message = _resp.replace(/\n/g, ' ').substring(0, 60);
                _sess.updated_at = new Date().toISOString();
                // 只更新对应 session item 的 DOM，不重新渲染整个中栏
                const container = document.getElementById('chatMiddleList');
                if (container) {
                  const items = container.querySelectorAll('.siper-session-item');
                  for (const item of items) {
                    if (item.dataset.sessionId === chatSessionId) {
                      const preview = item.querySelector('.siper-session-preview');
                      if (preview) preview.textContent = _sess.last_message;
                      break;
                    }
                  }
                }
              }
            }
          }
          return;
        }
        const _data = _endData;
        const _usage = _data.usage;
        const _tools_used = _data.tool_calls_executed;
        const _tool_call_steps = _data.tool_call_steps || [];
        const _skills_active = _data.skills_active;
        const _skills_used = _data.skills_used || [];
        const _skills_recommended = _data.skills_recommended || [];
        const _processing_time_ms = _data.processing_time_ms;
        const _model = _data.model;
        const _attachments = _data.attachments || [];
        const _success = _data.success !== false;
        // Save raw data for debug display
        _streamRawData = _data;
        // If response is empty and no attachments and no tool calls, skip rendering (air bubble fix)
        if (!_streamAcc.trim() && _attachments.length === 0 && !_tool_call_steps.length) {
          // Reset streaming state without rendering
          _streamAcc = '';
          _streamBubble = null;
          _streamBubbleWrap = null;
          _streamRow = null;
          setIsSending(false);
          const _sb = document.getElementById('sendBtn');
          const _stb = document.getElementById('stopBtn');
          if (_sb) _sb.disabled = false;
          if (_stb) _stb.classList.add('hidden');
          chatThinkingHide();
          return;
        }
        // If success=false and there is stream text, show error styling on the bubble
        if (!_success && _streamBubbleWrap) {
          _streamBubbleWrap.classList.add('msg-error');
        }
        // Replace stream bubble content with rendered Markdown
        if (_streamBubble) {
          try {
            _streamBubble.textContent = '';
            _streamBubble.appendChild(renderMarkdown(_streamAcc));
          } catch(e) {
            console.error('[stream_end] renderMarkdown error:', e);
            _streamBubble.textContent = _streamAcc;
            toast.error('消息渲染失败');
          }
        }
        // Add actions-below to the streamed message
        if (_streamRow && _streamBubbleWrap) {
          try {
            const actions = document.createElement('div');
            actions.className = 'msg-actions-below';
            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'msg-action-btn';
            copyBtn.innerHTML = '📋';
            copyBtn.title = '复制内容';
            copyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(_streamAcc).then(() => {
                copyBtn.innerHTML = '✓';
                setTimeout(() => copyBtn.innerHTML = '📋', 1500);
              });
            });
            actions.appendChild(copyBtn);
            // Insert button
            const insertBtn = document.createElement('button');
            insertBtn.className = 'msg-action-btn';
            insertBtn.innerHTML = '↩';
            insertBtn.title = '填入输入框';
            insertBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const input = document.getElementById('chatInput');
              if (input) {
                input.value = _streamAcc;
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 262) + 'px';
                input.focus();
              }
            });
            actions.appendChild(insertBtn);
            // Dict button — show full response dict (only for successful responses)
            if (_success) {
              const dictBtn = document.createElement('button');
              dictBtn.className = 'msg-action-btn';
              dictBtn.innerHTML = '{}';
              dictBtn.title = 'dict';
              dictBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDictModal(_data);
                // Save response dict to sessions.db via API
                if (_data.message_id) {
                  fetch('/api/save-response-dict', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                      message_id: _data.message_id,
                      response_dict: _data
                    })
                  }).catch(() => {});
                }
              });
              actions.appendChild(dictBtn);
            }
            _streamRow.appendChild(actions);
          } catch(e) {}
        }
        // Render meta (tokens, tools, etc.) on the streamed message
        if (_streamBubbleWrap) {
          try {
            const _metaCfg = getMetaConfig();
            const _meta = {
              usage: _usage,
              tools_used: _tools_used,
              tool_call_steps: _tool_call_steps,
              skills_active: _skills_active,
              skills_used: _skills_used,
              skills_recommended: _skills_recommended,
              processing_time_ms: _processing_time_ms,
            };
            // Only attach raw data for successful responses
            if (_success) _meta._raw = _data;
            if (_data.attachments) _meta.attachments = _data.attachments;
            appendMeta(_streamBubbleWrap, _meta);
          } catch(e) {}
        }
        // Reset streaming state
        _streamAcc = '';
        _streamBubble = null;
        _streamBubbleWrap = null;
        _streamRow = null;
        setIsSending(false);
        chatThinkingHide();
        // Post-render enhancements (code highlight, mermaid, katex)
        if (_streamBubbleWrap && _streamBubble) {
          try { postRenderEnhance(_streamBubble); } catch(e) {}
        }
        const _sb = document.getElementById('sendBtn');
        const _stb = document.getElementById('stopBtn');
        if (_sb) _sb.disabled = false;
        if (_stb) _stb.classList.add('hidden');
        playReplySound();
        // Render attachments on the last streamed message
        if (_attachments.length > 0) {
          try {
            const chatEl = document.getElementById('chatMessages');
            if (chatEl) {
              const rows = chatEl.querySelectorAll('.msg-row.agent');
              if (rows.length > 0) {
                const lastRow = rows[rows.length - 1];
                const bubble = lastRow.querySelector('.siper-msg-body');
                if (bubble) {
                  let attHtml = '<div class="msg-attachments">';
                  for (const att of _attachments) {
                    if (att.category === 'image' || att.type === 'image') {
                      const src = att.url || att.data || '';
                      const alt = escapeHtml(att.name || att.filename || 'image');
                      attHtml += `<img src="${src}" class="chat-image" alt="${alt}" onclick="window.open(this.src)">`;
                    } else {
                      const icon = FILE_ICONS[att.category] || FILE_ICONS.other;
                      const name = escapeHtml(att.name || att.filename || att.url || 'file');
                      attHtml += `<div class="chat-file-ref">${icon} ${name}</div>`;
                    }
                  }
                  attHtml += '</div>';
                  const attWrap = document.createElement('div');
                  attWrap.innerHTML = attHtml;
                  bubble.appendChild(attWrap);
                }
              }
            }
          } catch(e) {}
        }
        // Render TTS audio bar on the last agent message
        renderTtsAudioBars(_tool_call_steps);
        // Debug: append raw data block to the last agent bubble
        if (_streamRawData) {
          try {
            const cfg = getMetaConfig();
            if (cfg.showDebug) {
              const chatEl = document.getElementById('chatMessages');
              if (chatEl) {
                const rows = chatEl.querySelectorAll('.msg-row.agent');
                if (rows.length > 0) {
                  const lastRow = rows[rows.length - 1];
                  const bubble = lastRow.querySelector('.siper-msg-body');
                  if (bubble) {
                    const dbg = document.createElement('div');
                    dbg.className = 'msg-debug-block';
                    // Header with copy button
                    const hdr = document.createElement('div');
                    hdr.className = 'msg-debug-header';
                    const title = document.createElement('span');
                    title.className = 'msg-debug-title';
                    title.textContent = '🔍 Response';
                    hdr.appendChild(title);
                    let rawJson = '';
                    try { rawJson = JSON.stringify(_streamRawData, null, 2); } catch(e) { rawJson = String(_streamRawData); }
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'msg-debug-copy';
                    copyBtn.textContent = '📋';
                    copyBtn.title = '复制 JSON';
                    copyBtn.addEventListener('click', () => {
                      navigator.clipboard.writeText(rawJson).then(() => {
                        copyBtn.textContent = '✓';
                        setTimeout(() => copyBtn.textContent = '📋', 1500);
                      });
                    });
                    hdr.appendChild(copyBtn);
                    dbg.appendChild(hdr);
                    // Highlighted pre
                    const pre = document.createElement('pre');
                    pre.className = 'msg-debug-pre';
                    pre.innerHTML = debugHighlight(rawJson);
                    dbg.appendChild(pre);
                    bubble.appendChild(dbg);
                  }
                }
              }
            }
          } catch(e) {}
          _streamRawData = null;
        }
        // Update token usage
        if (_usage) {
          tokenHistory.push({
            time: new Date().toLocaleTimeString(),
            model: _model || '',
            prompt: _usage.prompt_tokens || 0,
            completion: _usage.completion_tokens || 0,
            total: _usage.total_tokens || 0
          });
          if (tokenHistory.length > 50) tokenHistory.shift();
          if (currentPage === 'token') refreshTokenStats();
        }
        // Hide typing indicator after all rendering is complete
        const _te = document.getElementById('typing');
        if (_te) _te.className = 'typing';
        // Clear tool progress panel
        const _tt = document.getElementById('typingTools');
        if (_tt) _tt.innerHTML = '';
      } else if (d.type === 'clarify_request') {
        // LLM is asking the user a clarification question
        const _cq = d.question || '';
        const _cOpts = d.options || null;
        const _cCtx = d.context || '';
        const _cSess = d.session_id || chatSessionId || '';
        // Show typing indicator with question
        const _te = document.getElementById('typing');
        if (_te) {
          _te.className = 'typing visible';
          _te.innerHTML = '<span class="typing-text">🤔 ' + escapeHtml(_cq) + '</span>';
        }
        // Build clarify UI
        const _cw = document.createElement('div');
        _cw.className = 'clarify-wrap';
        _cw.id = 'clarifyWrap';
        if (_cCtx) {
          const _ctxEl = document.createElement('div');
          _ctxEl.className = 'clarify-context';
          _ctxEl.textContent = _cCtx;
          _cw.appendChild(_ctxEl);
        }
        const _qEl = document.createElement('div');
        _qEl.className = 'clarify-question';
        _qEl.textContent = _cq;
        _cw.appendChild(_qEl);
        if (_cOpts && _cOpts.length > 0) {
          const _opts = document.createElement('div');
          _opts.className = 'clarify-options';
          _cOpts.forEach((opt, _idx) => {
            const _btn = document.createElement('button');
            _btn.className = 'clarify-option-btn';
            _btn.textContent = (_idx + 1) + '. ' + opt;
            _btn.addEventListener('click', () => {
              _sendClarifyResponse(_cSess, opt);
              _cw.remove();
              if (_te) _te.className = 'typing';
            });
            _opts.appendChild(_btn);
          });
          _cw.appendChild(_opts);
        } else {
          const _iw = document.createElement('div');
          _iw.className = 'clarify-input-wrap';
          const _inp = document.createElement('input');
          _inp.type = 'text';
          _inp.className = 'clarify-input';
          _inp.placeholder = '输入你的回答...';
          _inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && _inp.value.trim()) {
              _sendClarifyResponse(_cSess, _inp.value.trim());
              _cw.remove();
              if (_te) _te.className = 'typing';
            }
          });
          const _sb = document.createElement('button');
          _sb.className = 'clarify-send-btn';
          _sb.textContent = '发送';
          _sb.addEventListener('click', () => {
            if (_inp.value.trim()) {
              _sendClarifyResponse(_cSess, _inp.value.trim());
              _cw.remove();
              if (_te) _te.className = 'typing';
            }
          });
          _iw.appendChild(_inp);
          _iw.appendChild(_sb);
          _cw.appendChild(_iw);
          setTimeout(() => _inp.focus(), 100);
        }
        const _cm = document.getElementById('chatMessages');
        if (_cm) { _cm.appendChild(_cw); _cm.scrollTop = _cm.scrollHeight; }
        setIsSending(true);
        const _sbtn = document.getElementById('chatSendBtn');
        if (_sbtn) _sbtn.disabled = true;
      } else if (d.type === 'connected') {
        wsConnId = d.connection_id;
        if (!currentSession) {
          currentSession = d.session_id || wsConnId;
        }
        if (d.session_id) setChatSessionId(d.session_id);
        addLog('info', t('log.connection') + ': ' + d.connection_id, currentLang);
        markSessionReady();
        // Don't auto-load recent session on connect — history loading is heavy
        // (100 messages, renderMarkdown each) and blocks the main thread.
        // User can click a session in the sidebar to load history manually.
        // loadRecentSession();
      } else if (d.type === 'session_created') {
        console.log('[WS] session_created received:', d.session_id, 'agent:', d.agent);
        currentSession = d.session_id;
        addLog('info', '新会话已创建：' + d.session_id, currentLang);
        setChatSessionId(d.session_id);
        markSessionReady();
        const agentName = d.agent || 'default';
        const agent = chatAgents.find(a => a.name === agentName);
        if (agent) {
          // 查找乐观更新插入的占位会话（new_ 开头）
          const placeholder = agent.sessions.find(s => s.session_id.startsWith('new_'));
          if (placeholder) {
            // 用真实 session_id 替换占位
            placeholder.session_id = d.session_id;
            // 更新中栏 DOM 中对应的 data-session-id
            const container = document.getElementById('chatMiddleList');
            if (container) {
              const items = container.querySelectorAll('.siper-session-item');
              for (const item of items) {
                if (item.dataset.sessionId && item.dataset.sessionId.startsWith('new_')) {
                  item.dataset.sessionId = d.session_id;
                  item.onclick = (e) => { e.stopPropagation(); selectChatSession(placeholder, agent); };
                  break;
                }
              }
            }
          } else if (!agent.sessions.find(s => s.session_id === d.session_id)) {
            agent.sessions.unshift({
              session_id: d.session_id,
              last_message: '',
              created_at: new Date().toISOString(),
              agent_name: agentName,
            });
          }
          chatExpandedAgents[agentName] = true;
          // 更新中栏 DOM session_id（startNewChat 已调用 selectChatSession 渲染右栏）
          if (placeholder) {
            const container = document.getElementById('chatMiddleList');
            if (container) {
              const items = container.querySelectorAll('.siper-session-item');
              for (const item of items) {
                if (item.dataset.sessionId && item.dataset.sessionId.startsWith('new_')) {
                  item.dataset.sessionId = d.session_id;
                  item.onclick = (e) => { e.stopPropagation(); selectChatSession(placeholder, agent); };
                  break;
                }
              }
            }
          }
        }
      } else if (d.type === 'tool_progress') {
        // Route to chat thinking panel if active and message belongs to current session
        if (currentPage === 'chat' && typeof chatHandleToolProgress === 'function') {
          if (!d.session_id || !chatSessionId || d.session_id === chatSessionId) {
            chatHandleToolProgress(d);
          }
        }
        // Clear any streamed text from the first LLM call when tool execution starts,
        // so that only the final response after tool execution is shown in the bubble.
        if (d.status === 'running') {
          _streamAcc = '';
          if (_streamBubble) _streamBubble.textContent = '';
        }
        // Show tool execution progress inside the typing indicator area
        const typingTools = document.getElementById('typingTools');
        if (typingTools) {
          const toolName = d.tool_name || 'unknown';
          const status = d.status || 'running';
          const callId = d.call_id || toolName;
          // Find existing step by call_id (unique per invocation, not merged by name)
          let step = typingTools.querySelector('[data-call-id="' + callId + '"]');
          if (!step) {
            step = document.createElement('div');
            step.setAttribute('data-call-id', callId);
            step.setAttribute('data-tool', toolName);
            typingTools.appendChild(step);
            // Keep only the latest 10 tool steps
            while (typingTools.children.length > 10) {
              typingTools.removeChild(typingTools.firstChild);
            }
          }
          step.className = 'typing-tool-step';
          const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⟳';
          const statusClass = status === 'completed' ? 'tool-step-done' : status === 'failed' ? 'tool-step-error' : 'tool-step-running';
          // Build param summary from info (no truncation)
          let paramSummary = '';
          if (d.info && d.info.parameters) {
            const params = d.info.parameters;
            if (toolName === 'web_search' && params.query) {
              paramSummary = '("' + params.query + '")';
            } else if (toolName === 'web_extract' && params.urls) {
              paramSummary = '(' + (Array.isArray(params.urls) ? params.urls.length : 1) + ' urls)';
            } else if (toolName === 'execute_code') {
              paramSummary = '(code)';
            } else if (toolName === 'read_file' && params.path) {
              paramSummary = '("' + params.path + '")';
            } else if (toolName === 'write_file' && params.path) {
              paramSummary = '("' + params.path + '")';
            } else if (toolName === 'patch' && params.path) {
              paramSummary = '("' + params.path + '")';
            } else if (toolName === 'skill_view' && params.name) {
              paramSummary = '("' + params.name + '")';
            } else {
              paramSummary = '(' + Object.keys(params).join(', ') + ')';
            }
          }
          // Result summary for completed (no truncation)
          let resultSummary = '';
          if (status === 'completed' && d.info) {
            if (toolName === 'web_search' && d.info.metadata && d.info.metadata.count) {
              resultSummary = ' → ' + d.info.metadata.count + ' results';
            } else if (d.info.result && typeof d.info.result === 'string') {
              const r = d.info.result.replace(/\n/g, ' ');
              resultSummary = ' → ' + r;
            }
          }
          step.innerHTML = '<span class="tool-step-icon ' + statusClass + '">' + icon + '</span>' +
            '<span class="tool-step-name">' + escapeHtml(toolName + paramSummary) + '</span>' +
            '<span class="tool-step-result-summary">' + escapeHtml(resultSummary) + '</span>';
          // Auto-scroll chat to keep typing area visible
          const chatEl = document.getElementById('chatMessages');
          if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
        }
      } else if (d.type === 'stopped') {
        setIsSending(false);
        if (typeof chatHandleStopped === 'function') {
          chatHandleStopped();
          return;
        }
        // Fallback if chatHandleStopped not available yet
        if (currentPage === 'chat') {
          const _sb = document.getElementById('chatSendBtn');
          if (_sb) _sb.disabled = false;
          const _cstb = document.getElementById('chatStopBtn');
          if (_cstb) _cstb.classList.add('hidden');
          chatThinkingHide();
          return;
        }
        const _sb = document.getElementById('sendBtn');
        const _stb = document.getElementById('stopBtn');
        if (_sb) _sb.disabled = false;
        if (_stb) _stb.classList.add('hidden');
        const _te = document.getElementById('typing');
        if (_te) _te.className = 'typing';
        const _tt = document.getElementById('typingTools');
        if (_tt) _tt.innerHTML = '';
        chatThinkingHide();
        if (_streamBubble && _streamRow && _streamBubbleWrap) {
          // Ensure final MD render of accumulated text
          _streamBubble.textContent = '';
          _streamBubble.appendChild(renderMarkdown(_streamAcc));
          // Add action buttons
          try {
            const actions = document.createElement('div');
            actions.className = 'msg-actions-below';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'msg-action-btn';
            copyBtn.innerHTML = '📋';
            copyBtn.title = '复制内容';
            copyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(_streamAcc).then(() => {
                copyBtn.innerHTML = '✓';
                setTimeout(() => copyBtn.innerHTML = '📋', 1500);
              });
            });
            actions.appendChild(copyBtn);
            const insertBtn = document.createElement('button');
            insertBtn.className = 'msg-action-btn';
            insertBtn.innerHTML = '↩';
            insertBtn.title = '填入输入框';
            insertBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const input = document.getElementById('chatInput');
              if (input) {
                input.value = _streamAcc;
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 262) + 'px';
                input.focus();
              }
            });
            actions.appendChild(insertBtn);
            _streamRow.appendChild(actions);
          } catch(e) {}
        }
        // Reset streaming state
        _streamAcc = '';
        _streamBubble = null;
        _streamBubbleWrap = null;
        _streamRow = null;
      } else if (d.type === 'response') {
        setIsSending(false);
        const _replySid = d.session_id || null;
        // Route to chat page if active
        if (currentPage === 'chat') {
          const _sb2 = document.getElementById('chatSendBtn');
          if (_sb2) _sb2.disabled = false;
          const _cstb = document.getElementById('chatStopBtn');
          if (_cstb) _cstb.classList.add('hidden');
          chatThinkingHide();
          chatThinkingClear();
          setIsThinking(false);
          if (chatSessionId) updateStreamingBadge(chatSessionId, false);
          const _data = d.data || {};
          const _content = _data.response || _data.content || '';
          const _success = _data.success !== false;
          if (!_success) {
            chatAddMessage(_content || '服务暂时没有响应，请重试', true, null);
          } else if (!_content.trim() && !_data.attachments && !_data.tool_call_steps?.length) {
            // Empty response with no tool calls — skip
          } else if (!_content.trim() && _data.tool_call_steps?.length) {
            // Tool-calls-only response with no text — show tool summary
            chatAddMessage('', true, _data);
          } else {
            chatAddMessage(_content, true, _data.attachments ? {attachments: _data.attachments} : null);
          }
          // Play notification sound
          if (typeof playReplySound === 'function') playReplySound();
          // Mark unread if reply belongs to a different session
          if (_replySid && _replySid !== chatSessionId) {
            if (typeof markSessionUnread === 'function') markSessionUnread(_replySid);
          }
          // Update last_message in middle column session list
          if (chatSessionId && chatCurrentAgent) {
            const _agent = chatAgents.find(a => a.name === chatCurrentAgent.name);
            if (_agent) {
              const _sess = _agent.sessions.find(s => s.session_id === chatSessionId);
              if (_sess) {
                _sess.last_message = (_content || '').replace(/\n/g, ' ').substring(0, 60);
                _sess.updated_at = new Date().toISOString();
                // 只更新对应 session item 的 DOM，不重新渲染整个中栏
                const container = document.getElementById('chatMiddleList');
                if (container) {
                  const items = container.querySelectorAll('.siper-session-item');
                  for (const item of items) {
                    if (item.dataset.sessionId === chatSessionId) {
                      const preview = item.querySelector('.siper-session-preview');
                      if (preview) preview.textContent = _sess.last_message;
                      break;
                    }
                  }
                }
              }
            }
          }
          return;
        }
        const _sb2 = document.getElementById('sendBtn');
        const _stb2 = document.getElementById('stopBtn');
        if (_sb2) _sb2.disabled = false;
        if (_stb2) _stb2.classList.add('hidden');
        chatThinkingHide();
        chatThinkingClear();
        setIsThinking(false);
        if (d.session_id) currentSession = d.session_id;
        const _data = d.data || {};
        const _content = _data.response || _data.content || '';
        const _success = _data.success !== false;
        const _usage = _data.usage;
        const _tools_used = _data.tool_calls_executed;
        const _tool_call_steps = _data.tool_call_steps || [];
        const _skills_active = _data.skills_active;
        const _skills_used = _data.skills_used || [];
        const _skills_recommended = _data.skills_recommended || [];
        const _processing_time_ms = _data.processing_time_ms;
        const _model = _data.model;
        const _prompt_context = _data.prompt_context;
        if (!_success) {
          addMsg(_content || '服务暂时没有响应，请重试', 'error');
        } else if (!_content.trim() && !_data.attachments) {
          // Empty response with no attachments — skip rendering (air bubble fix)
        } else {
          const meta = {
            usage: _usage,
            tools_used: _tools_used,
            tool_call_steps: _tool_call_steps,
            skills_active: _skills_active,
            processing_time_ms: _processing_time_ms,
            _raw: _data,
          };
          if (_data.attachments) meta.attachments = _data.attachments;
          addMsg(_content, 'agent', meta);
        }
        playReplySound();
        // Render TTS audio bar for non-streaming response
        renderTtsAudioBars(_tool_call_steps);
        if (_usage) {
          tokenHistory.push({
            time: new Date().toLocaleTimeString(),
            model: _model || '',
            prompt: _usage.prompt_tokens || 0,
            completion: _usage.completion_tokens || 0,
            total: _usage.total_tokens || 0
          });
          if (tokenHistory.length > 50) tokenHistory.shift();
          if (currentPage === 'token') refreshTokenStats();
        }
        if (_prompt_context) {
          try {
            const chatEl = document.getElementById('chatMessages');
            if (chatEl) {
              const rows = chatEl.querySelectorAll('.msg-row.user');
              if (rows.length > 0) {
                rows[rows.length - 1].setAttribute('data-prompt-context', _prompt_context);
              }
            }
          } catch(e) {}
        }
        // Hide typing indicator after all rendering is complete
        const _te2 = document.getElementById('typing');
        if (_te2) _te2.className = 'typing';
      } else if (d.type === 'error') {
        setIsSending(false);
        // Route to chat page if active
        if (currentPage === 'chat') {
          const _sb3 = document.getElementById('chatSendBtn');
          if (_sb3) _sb3.disabled = false;
          chatThinkingHide();
          chatThinkingClear();
          setIsThinking(false);
          if (chatSessionId) updateStreamingBadge(chatSessionId, false);
          chatAddMessage(d.message || '服务暂时没有响应，请重试', true, null);
          return;
        }
        const _sb3 = document.getElementById('sendBtn');
        const _stb3 = document.getElementById('stopBtn');
        if (_sb3) _sb3.disabled = false;
        if (_stb3) _stb3.classList.add('hidden');
        const _te = document.getElementById('typing');
        if (_te) _te.className = 'typing';
        const _tt = document.getElementById('typingTools');
        if (_tt) _tt.innerHTML = '';
        chatThinkingHide();
        chatThinkingClear();
        setIsThinking(false);
        // Reset streaming state on error
        _streamAcc = '';
        _streamBubble = null;
        _streamBubbleWrap = null;
        _streamRow = null;
        addMsg(t('chat.error') + d.message, 'error');
        addLog('error', d.message, currentLang);
      }
    } catch (err) {
      // Ensure isSending is reset on any unhandled error
      setIsSending(false);
      const _sb = document.getElementById('sendBtn');
      const _stb = document.getElementById('stopBtn');
      if (_sb) _sb.disabled = false;
      if (_stb) _stb.classList.add('hidden');
      const _te = document.getElementById('typing');
      if (_te) _te.className = 'typing';
      console.error('[ws.onmessage] unhandled error:', err);
    }
  };
}

export function setConnected(connected) {
  // No-op: status display removed with old sidebar
}

export async function loadRecentSession() {
  try {
    const r = await fetch('/api/sessions');
    const data = await r.json();
    if (!data.sessions || !data.sessions.length) return;
    const sorted = data.sessions
      .filter(s => s.active === true && s.messages > 0)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    if (!sorted.length) return;
    const latest = sorted[0];
    // Only switch UI to chat page if user is already on chat page
    // On non-chat pages (logs, sessions, etc.) just update currentSession silently
    if (currentPage === 'chat') {
      // Don't overwrite chat if user already has real messages displayed
      const chatEl = document.getElementById('chatMessages');
      if (chatEl && chatEl.querySelectorAll('.siper-msg-row').length > 0) return;
      // Show loading state
      if (chatEl) chatEl.innerHTML = '<div class="msg-loading">加载历史消息中...</div>';
      currentSession = latest.session_id;
      // Old sidebar nav-item highlight removed — chat sidebar handled by page-chat.js
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-chat').classList.add('active');
      // Use chat page's own message renderer (chatAddMessage) instead of
      // page-sessions.js's loadSessionHistory which calls core.js's stub addMsg
      if (typeof chatLoadSessionMessages === 'function') {
        chatLoadSessionMessages(currentSession);
      } else {
        await loadSessionHistory(currentSession);
      }
    } else {
      currentSession = latest.session_id;
    }
  } catch(e) { console.error('loadRecentSession error:', e); }
}

export function addLog(level, message, lang) {
  const list = document.getElementById('logsList');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'log-entry ' + (level || 'info');
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.innerHTML = `<span class="time">${time}</span>${escapeHtml(message || '')}`;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

export function applySidebarTheme(presetKey) {
  const presets = {
    light: {
      '--bg': '#c8ebe5', '--bg-sidebar': '#b8ddd6', '--bg-card': '#ddf0ec',
      '--bg-hover': '#a8d5cc', '--border': '#8bbfb5', '--text': '#0a1f1a',
      '--text-dim': '#3a6b5e', '--accent': '#2d9e8a', '--accent2': '#6b5ca8',
      '--green': '#2d9e6a', '--red': '#c0392b', '--yellow': '#b7950b',
      '--orange': '#ca6f1e', '--cyan': '#1abc9c',
      '--agent-msg-bg': '#ddf0ec', '--agent-msg-border': '#8bbfb5', '--agent-msg-text': '#0a1f1a',
      '--user-msg-bg': '#2d9e8a', '--user-msg-text': '#ffffff',
    },
    dark: {
      '--bg': '#0d1117', '--bg-sidebar': '#161b22', '--bg-card': '#1c2333',
      '--bg-hover': '#242d3d', '--border': '#30363d', '--text': '#e6edf3',
      '--text-dim': '#8b949e', '--accent': '#58a6ff', '--accent2': '#a371f7',
      '--green': '#3fb950', '--red': '#f85149', '--yellow': '#d29922',
      '--orange': '#f0883e', '--cyan': '#39d2c0',
      '--agent-msg-bg': '#1c2333', '--agent-msg-border': '#30363d', '--agent-msg-text': '#e6edf3',
      '--user-msg-bg': '#1a3a5c', '--user-msg-text': '#cce0ff',
    },
    sunset: {
      '--bg': '#fefae0', '--bg-sidebar': '#faedcd', '--bg-card': '#fefae0',
      '--bg-hover': '#e9c46a', '--border': '#dda15e', '--text': '#3a2d1e',
      '--text-dim': '#8b6f47', '--accent': '#e63946', '--accent2': '#f4a261',
      '--green': '#2a9d8f', '--red': '#e63946', '--yellow': '#e9c46a',
      '--orange': '#f4a261', '--cyan': '#48cae4',
      '--agent-msg-bg': '#faedcd', '--agent-msg-border': '#dda15e', '--agent-msg-text': '#3a2d1e',
      '--user-msg-bg': '#e63946', '--user-msg-text': '#ffffff',
    },
    forest: {
      '--bg': '#1b4332', '--bg-sidebar': '#0b2618', '--bg-card': '#2d6a4f',
      '--bg-hover': '#40916c', '--border': '#52b788', '--text': '#d8f3dc',
      '--text-dim': '#95d5b2', '--accent': '#40916c', '--accent2': '#74c69d',
      '--green': '#52b788', '--red': '#e63946', '--yellow': '#ffd166',
      '--orange': '#f4a261', '--cyan': '#48cae4',
      '--agent-msg-bg': '#2d6a4f', '--agent-msg-border': '#52b788', '--agent-msg-text': '#d8f3dc',
      '--user-msg-bg': '#40916c', '--user-msg-text': '#ffffff',
    },
    rose: {
      '--bg': '#fff0f3', '--bg-sidebar': '#ffe3e8', '--bg-card': '#fff0f3',
      '--bg-hover': '#ffc2d1', '--border': '#ffb3c6', '--text': '#3a0ca3',
      '--text-dim': '#7209b7', '--accent': '#e85d75', '--accent2': '#f72585',
      '--green': '#4cc9f0', '--red': '#f72585', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#4cc9f0',
      '--agent-msg-bg': '#ffe3e8', '--agent-msg-border': '#ffb3c6', '--agent-msg-text': '#3a0ca3',
      '--user-msg-bg': '#e85d75', '--user-msg-text': '#ffffff',
    },
    midnight: {
      '--bg': '#0a0a1a', '--bg-sidebar': '#12122a', '--bg-card': '#1a1a3e',
      '--bg-hover': '#2a2a5e', '--border': '#3a3a7e', '--text': '#e0e0ff',
      '--text-dim': '#9090cc', '--accent': '#7b2ff7', '--accent2': '#c77dff',
      '--green': '#06d6a0', '--red': '#ef476f', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#06d6a0',
      '--agent-msg-bg': '#1a1a3e', '--agent-msg-border': '#3a3a7e', '--agent-msg-text': '#e0e0ff',
      '--user-msg-bg': '#2a1a5e', '--user-msg-text': '#e0e0ff',
    },
    sakura: {
      '--bg': '#fff5f8', '--bg-sidebar': '#ffe8f0', '--bg-card': '#fff0f5',
      '--bg-hover': '#ffd6e8', '--border': '#ffb3d9', '--text': '#4a1942',
      '--text-dim': '#8b4b76', '--accent': '#ff69b4', '--accent2': '#c9184a',
      '--green': '#52b788', '--red': '#c9184a', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#48cae4',
      '--agent-msg-bg': '#ffe8f0', '--agent-msg-border': '#ffb3d9', '--agent-msg-text': '#4a1942',
      '--user-msg-bg': '#ff69b4', '--user-msg-text': '#ffffff',
    },
    slate: {
      '--bg': '#1e293b', '--bg-sidebar': '#0f172a', '--bg-card': '#334155',
      '--bg-hover': '#475569', '--border': '#64748b', '--text': '#e2e8f0',
      '--text-dim': '#94a3b8', '--accent': '#475569', '--accent2': '#64748b',
      '--green': '#10b981', '--red': '#ef4444', '--yellow': '#f59e0b',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#334155', '--agent-msg-border': '#64748b', '--agent-msg-text': '#e2e8f0',
      '--user-msg-bg': '#475569', '--user-msg-text': '#ffffff',
    },
    black: {
      '--bg': '#000000', '--bg-sidebar': '#0a0a0a', '--bg-card': '#141414',
      '--bg-hover': '#1f1f1f', '--border': '#2a2a2a', '--text': '#e5e5e5',
      '--text-dim': '#737373', '--accent': '#3b82f6', '--accent2': '#60a5fa',
      '--green': '#22c55e', '--red': '#ef4444', '--yellow': '#eab308',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#141414', '--agent-msg-border': '#2a2a2a', '--agent-msg-text': '#e5e5e5',
      '--user-msg-bg': '#1e3a5f', '--user-msg-text': '#dbeafe',
    },
  };
  const preset = presets[presetKey];
  if (!preset) return;
  Object.keys(preset).forEach(k => document.documentElement.style.setProperty(k, preset[k]));
  // Save to localStorage
  const saved = {};
  Object.keys(preset).forEach(k => saved[k] = preset[k]);
  saved._preset = presetKey;
  localStorage.setItem('siper_theme', JSON.stringify(saved));
  // Sync theme palette trigger
  updateThemePaletteTrigger(presetKey);
  // Notify ECharts to re-render with new theme
  document.documentElement.dispatchEvent(new CustomEvent('siper-theme-changed'));
}

export function updateThemePaletteTrigger(presetKey) {
  const trigger = document.getElementById('themePaletteTrigger');
  const preset = PALETTE_PRESETS[presetKey];
  if (trigger && preset) {
    trigger.style.background = `linear-gradient(135deg, ${preset.bg} 33%, ${preset.accent} 33% 66%, ${preset.sidebar} 66%)`;
    trigger.title = preset.label;
  }
}

export function buildThemePaletteMenu() {
  const menu = document.getElementById('themePaletteMenu');
  if (!menu) return;
  menu.innerHTML = '';
  Object.keys(PALETTE_PRESETS).forEach(key => {
    const preset = PALETTE_PRESETS[key];
    const item = document.createElement('div');
    item.className = 'theme-palette-item';
    item.dataset.key = key;
    const swatch = document.createElement('span');
    swatch.className = 'theme-palette-swatch';
    swatch.style.background = `linear-gradient(135deg, ${preset.bg} 33%, ${preset.accent} 33% 66%, ${preset.sidebar} 66%)`;
    item.appendChild(swatch);
    const label = document.createElement('span');
    label.textContent = preset.label;
    item.appendChild(label);
    item.onclick = () => { applySidebarTheme(key); closeThemePalette(); };
    menu.appendChild(item);
  });
}

export function toggleThemePalette() {
  const menu = document.getElementById('themePaletteMenu');
  if (!menu) return;
  if (menu.classList.contains('open')) {
    closeThemePalette();
  } else {
    buildThemePaletteMenu();
    // Highlight current
    let currentKey = '';
    try { currentKey = JSON.parse(localStorage.getItem('siper_theme') || '{}')._preset || ''; } catch(e) {}
    menu.querySelectorAll('.theme-palette-item').forEach(item => {
      item.classList.toggle('active', item.dataset.key === currentKey);
    });
    menu.classList.add('open');
  }
}

export function closeThemePalette() {
  const menu = document.getElementById('themePaletteMenu');
  if (menu) menu.classList.remove('open');
}

export function getAvatarHtml(cls) {
  if (cls === 'agent') {
    return `<img class="msg-avatar-img" src="${typeof agentAvatarUrl !== 'undefined' ? agentAvatarUrl : '/static/default_avatar.webp'}" alt="Agent" onerror="this.src='/static/default_avatar_256.png'">`;
  } else if (cls === 'user') {
    return `<div class="msg-avatar">👤</div>`;
  }
  return '';
}

export function debugHighlight(json) {
  // Legacy stub — not used in chat mode
  try { return escapeHtml(JSON.stringify(json, null, 2)); } catch(e) { return escapeHtml(String(json)); }
}

export function playReplySound() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    // Two-tone chime: C5 -> E5
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });
  } catch(e) {}
}

export function selectChatLangAndSave(lang) {
  if (lang) {
    localStorage.setItem('siper_lang', lang);
    location.reload();
  } else {
    const menu = document.getElementById('chatLangMenu');
    if (menu) menu.classList.toggle('show');
  }
}

// Legacy stubs — kept for backward compat (sessions.js / chat.js import these)
export function addMsg() {}
export function appendMeta() {}

// ===== Sidebar =====
export function toggleChatSidebar() {
  const sidebar = document.getElementById('chatSidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('expanded');
  const expanded = sidebar.classList.contains('expanded');
  try { localStorage.setItem('siper_sidebar_expanded', expanded ? '1' : '0'); } catch(e) {}
  // Toggle icon-only vs expanded label visibility
  const labels = sidebar.querySelectorAll('.siper-nav-item-label');
  labels.forEach(l => { l.style.display = expanded ? '' : 'none'; });
  const brand = sidebar.querySelector('.siper-sidebar-brand');
  if (brand) brand.style.display = expanded ? '' : 'none';
}

// ===== Theme Palette (wrapper for HTML onclick) =====
// toggleThemePalette is already exported at line 924

// ===== Image Lightbox（已由 toast.js 统一提供）=====
// closeImageLightbox 由 toast.js 通过 window.closeImageLightbox 提供
// 此处不再重复定义，app.js 从 toast.js import 并挂载到 window

// toggleChatModelDropdown 已迁移到 chat/input.js

