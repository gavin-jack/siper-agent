// chat/stream.js — 流式响应处理
// 从 page-chat.js 拆分
import {
  chatSessionId, chatCurrentAgent,
  _chatStreamAcc, _chatStreamRow, _chatStreamBubble, _thinkingSteps,
  chatModelContextWindow, isSending,
  _getStreamState, _syncStreamFromCurrent, _syncStreamToCurrent,
  chatAgents, setChatStreamAcc, setChatStreamRow, setChatStreamBubble, setIsSending, updateStreamingBadge,
  setIsThinking, updateSessionPreview,
  resetSendState
} from './state.js';
import { chatEscapeHtml, chatRenderMarkdown, updateCtxInfoDisplay, buildMetaHtml } from './message.js';
import { chatThinkingHide } from './state.js';
import { renderMiddleList } from './sidebar.js';

// ===== Stream Handlers =====

export function chatHandleStreamDelta(delta, streamSessionId) {
  // If user already stopped, ignore late deltas
  if (!isSending) return;
  if (streamSessionId && chatSessionId && streamSessionId !== chatSessionId) {
    const s = _getStreamState(streamSessionId);
    s.acc += delta || '';
    return;
  }
  _syncStreamFromCurrent();
  const msgs = document.getElementById('chatMessages');
  if (!msgs) { _syncStreamToCurrent(); return; }
  const empty = document.getElementById('chatEmptyState');
  if (empty) empty.style.display = 'none';
  setChatStreamAcc(_chatStreamAcc + (delta || ''));

  if (!_chatStreamRow) {
    // Thinking panel already shown by chatSendMessage, just update text
    chatThinkingClear();
    chatThinkingAddTextRow('正在生成回复...');
  }

  if (!_chatStreamRow) {
    const row = document.createElement('div');
    row.className = 'siper-msg-row agent siper-stream-row';
    const avatarUrl = chatCurrentAgent && chatCurrentAgent.name
      ? '/api/avatar?agent=' + encodeURIComponent(chatCurrentAgent.name)
      : '/static/default_avatar.webp';
    row.innerHTML = `
      <img src="${avatarUrl}" class="siper-msg-avatar" alt="" onerror="this.src='/static/default_avatar_256.png'">
      <div class="siper-bubble-col">
        <div class="siper-msg-time"></div>
        <div class="siper-bubble agent-bubble"><div class="siper-msg-body"><span class="siper-stream-text"></span><span class="siper-stream-cursor" style="display:none">▊</span></div></div>
        <div class="siper-msg-actions"></div>
      </div>
    `;
    msgs.appendChild(row);
    setChatStreamRow(row);
    if (chatSessionId) updateStreamingBadge(chatSessionId, true);
  }

  const textEl = _chatStreamRow.querySelector('.siper-stream-text');
  const cursorEl = _chatStreamRow.querySelector('.siper-stream-cursor');
  if (cursorEl) cursorEl.style.display = 'inline';
  if (textEl) {
    // Throttle markdown render: only render every 3rd delta to reduce CPU usage
    // The final stream_end will always render the complete text
    const _accLen = _chatStreamAcc.length;
    if (_accLen < 200 || _accLen % 3 === 0 || delta.length > 50) {
      textEl.innerHTML = '';
      if (typeof renderMarkdown === 'function') {
        textEl.appendChild(renderMarkdown(_chatStreamAcc));
      } else {
        textEl.innerHTML = chatRenderMarkdown(_chatStreamAcc);
      }
    }
  }
  _chatStreamRow.dataset.rawText = _chatStreamAcc;
  const _msgs = msgs;
  const _distanceFromBottom = _msgs.scrollHeight - _msgs.scrollTop - _msgs.clientHeight;
  if (_distanceFromBottom < 80) {
    // 用户在底部，自动滚动
    _msgs.scrollTop = _msgs.scrollHeight;
    _hideNewMsgIndicator();
  } else {
    // 用户不在底部，显示新消息指示器
    _showNewMsgIndicator();
  }
  _syncStreamToCurrent();
}

export function chatHandleStreamEnd(data, streamSessionId) {
  // Cross-session stream end — just clear state, don't render
  if (streamSessionId && chatSessionId && streamSessionId !== chatSessionId) {
    const s = _getStreamState(streamSessionId);
    s.thinking = false;
    s.thinkingSteps = [];
    setIsThinking(false);
    chatThinkingHide();
    s.row = null; s.bubble = null; s.acc = '';
    updateStreamingBadge(streamSessionId, false);
    return;
  }

  _syncStreamFromCurrent();
  const text = _chatStreamAcc;

  if (data && data.usage) updateCtxFromStreamEnd(data.usage);

  // Save response dict to sessions.db via API
  if (data && data.message_id) {
    fetch('/api/save-response-dict', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ message_id: data.message_id, response_dict: data })
    }).catch(() => {});
  }

  // 复用流式 DOM，直接更新内容（避免移除重建导致的闪烁）
  if (_chatStreamRow) {
    _chatStreamRow.classList.remove('siper-stream-row');
    const cursorEl = _chatStreamRow.querySelector('.siper-stream-cursor');
    if (cursorEl) cursorEl.style.display = 'none';
    // 替换流式文本为渲染后的 markdown
    const streamTextEl = _chatStreamRow.querySelector('.siper-stream-text');
    if (streamTextEl) {
      const parent = streamTextEl.parentElement;
      if (parent) {
        parent.innerHTML = '';
        if (text) {
          if (typeof renderMarkdown === 'function') parent.appendChild(renderMarkdown(text));
          else parent.innerHTML = chatRenderMarkdown(text);
        } else if (data && data.tool_call_steps && data.tool_call_steps.length) {
          const toolNames = data.tool_call_steps.map(s => s.tool_name).filter(Boolean);
          const summary = document.createElement('div');
          summary.className = 'siper-tool-summary';
          summary.textContent = '🔧 执行工具：' + (toolNames.length ? toolNames.join(', ') : data.tool_call_steps.length + ' calls');
          parent.appendChild(summary);
        }
      }
    }
    // 追加 meta 信息（复用 message.js 的 buildMetaHtml）
    if (data && (data.usage || data.model || data.processing_time_ms || data.tool_call_steps || data.skills_used || data.finish_reason)) {
      const bubbleEl = _chatStreamRow.querySelector('.siper-bubble');
      if (bubbleEl) {
        const metaEl = document.createElement('div');
        metaEl.className = 'siper-bubble-meta';
        metaEl.innerHTML = buildMetaHtml(data);
        bubbleEl.appendChild(metaEl);
      }
    }
    // 渲染附件（与 chatAddMessage 保持一致）
    if (data && data.attachments) {
      const bubble = _chatStreamRow.querySelector('.siper-bubble');
      if (bubble) {
        let attHtml = '';
        for (const att of data.attachments) {
          if (att.category === 'image' || att.type === 'image') attHtml += '<img src="' + (att.url || att.data || '') + '" class="siper-img" alt="' + chatEscapeHtml(att.name || 'image') + '" onclick="window.open(this.src)">';
        }
        if (attHtml) { const w = document.createElement('div'); w.className = 'siper-attachments'; w.innerHTML = attHtml; bubble.appendChild(w); }
      }
    }
    // 追加复制/嵌入按钮（流式结束后才创建）
    const actionsEl = _chatStreamRow.querySelector('.siper-msg-actions');
    if (actionsEl && !actionsEl.querySelector('.siper-copy-btn')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'siper-msg-action-btn siper-copy-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = '复制';
      copyBtn.setAttribute('onclick', 'copyChatMsg(this)');
      actionsEl.appendChild(copyBtn);
      const insertBtn = document.createElement('button');
      insertBtn.className = 'siper-msg-action-btn siper-insert-btn';
      insertBtn.textContent = '↩';
      insertBtn.title = '嵌入';
      insertBtn.setAttribute('onclick', 'insertChatMsg(this)');
      actionsEl.appendChild(insertBtn);
    }
    // 追加 dict 按钮
    if (data && data.message_id) {
      const actions = _chatStreamRow.querySelector('.siper-msg-actions');
      if (actions && !actions.querySelector('.siper-dict-btn')) {
        const dictBtn = document.createElement('button');
        dictBtn.className = 'siper-msg-action-btn siper-dict-btn';
        dictBtn.innerHTML = '{}';
        dictBtn.title = '查看完整响应数据';
        dictBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showDictModal(data);
        });
        actions.appendChild(dictBtn);
      }
    }
    // 更新时间戳
    const timeEl = _chatStreamRow.querySelector('.siper-msg-time');
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }

  setChatStreamAcc('');
  setChatStreamRow(null);
  setChatStreamBubble(null);
  _thinkingSteps.length = 0;
  setIsThinking(false);
  if (chatSessionId) updateStreamingBadge(chatSessionId, false);
  _syncStreamToCurrent();
  resetSendState();
  _hideNewMsgIndicator();
  // 使用后端 server_time 更新会话预览
  if (chatSessionId && chatCurrentAgent) {
    const _resp = (data && data.response) || text || '';
    updateSessionPreview(chatSessionId, _resp, data && data.server_time);
  }
  chatThinkingHide();
}

// ===== Stop Handler =====

export function chatHandleStopped() {
  // Called when backend sends 'stopped' message — clean up stream state
  _syncStreamFromCurrent();
  if (_chatStreamRow) {
    const text = _chatStreamAcc;
    const streamRow = _chatStreamRow;
    streamRow.classList.remove('siper-stream-row');
    const streamTextEl = streamRow.querySelector('.siper-stream-text');
    if (streamTextEl) {
      const parent = streamTextEl.parentElement;
      if (parent) {
        parent.innerHTML = '';
        if (text) {
          if (typeof renderMarkdown === 'function') parent.appendChild(renderMarkdown(text));
          else parent.innerHTML = chatRenderMarkdown(text);
        }
      }
    }
  }
  setChatStreamAcc('');
  setChatStreamRow(null);
  setChatStreamBubble(null);
  _thinkingSteps.length = 0;
  setIsThinking(false);
  resetSendState();
  _hideNewMsgIndicator();
  chatThinkingHide();
  // Stop wave badge for this session
  if (chatSessionId && typeof updateStreamingBadge === 'function') updateStreamingBadge(chatSessionId, false);
  // 用户停止后用前端时间更新会话预览
  if (chatSessionId && chatCurrentAgent) {
    updateSessionPreview(chatSessionId, undefined, new Date().toISOString());
  }
}

// ===== Thinking Panel =====

export function chatThinkingShow() {
  const panel = document.getElementById('chatThinkingPanel');
  if (panel) panel.classList.add('open');
}


export function chatThinkingClear() {
  const body = document.getElementById('chatThinkingBody');
  if (body) body.innerHTML = '';
  _thinkingSteps.length = 0;
}

export function chatThinkingAddToolStep(callId, toolName, status, params, resultSummary) {
  const body = document.getElementById('chatThinkingBody');
  if (!body) return;
  const existing = body.querySelector('[data-call-id="' + callId + '"]');
  if (existing) existing.remove();
  let paramStr = '';
  if (params) {
    if (toolName === 'web_search' && params.query) paramStr = params.query;
    else if (toolName === 'web_extract' && params.urls) paramStr = (Array.isArray(params.urls) ? params.urls.length : 1) + ' urls';
    else if (toolName === 'execute_code') paramStr = 'code';
    else if (toolName === 'read_file' && params.path) paramStr = params.path;
    else if (toolName === 'write_file' && params.path) paramStr = params.path;
    else if (toolName === 'patch' && params.path) paramStr = params.path;
    else if (toolName === 'skill_view' && params.name) paramStr = params.name;
    else paramStr = Object.keys(params).join(', ');
  }
  if (paramStr.length > 80) paramStr = paramStr.substring(0, 77) + '...';
  let resultStr = '';
  if (status === 'completed' && resultSummary) {
    resultStr = resultSummary;
    if (resultStr.length > 100) resultStr = resultStr.substring(0, 97) + '...';
  }
  const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⟳';
  const iconClass = status === 'completed' ? 'done' : status === 'failed' ? 'error' : 'running';
  const step = document.createElement('div');
  step.className = 'siper-thinking-step';
  step.setAttribute('data-call-id', callId);
  step.innerHTML =
    '<span class="siper-thinking-step-icon ' + iconClass + '">' + icon + '</span>' +
    '<span><span class="siper-thinking-step-name">' + chatEscapeHtml(toolName) + '</span>' +
    (paramStr ? '<span class="siper-thinking-step-params">(' + chatEscapeHtml(paramStr) + ')</span>' : '') +
    (resultStr ? '<span class="siper-thinking-step-result">' + chatEscapeHtml(resultStr) + '</span>' : '') +
    '</span>';
  body.appendChild(step);
  const steps = body.querySelectorAll('.siper-thinking-step');
  if (steps.length > 6) steps[0].remove();
  // Track in _thinkingSteps for cross-session persistence
  const existingIdx = _thinkingSteps.findIndex(s => s.type === 'tool' && s.callId === callId);
  const entry = { type: 'tool', callId, toolName, status, params: paramStr, resultSummary: resultStr };
  if (existingIdx >= 0) _thinkingSteps[existingIdx] = entry;
  else _thinkingSteps.push(entry);
}

export function chatThinkingAddTextRow(text) {
  const body = document.getElementById('chatThinkingBody');
  if (!body) return;
  const prev = body.querySelector('.siper-thinking-text-row');
  if (prev) prev.remove();
  const row = document.createElement('div');
  row.className = 'siper-thinking-text-row';
  row.textContent = text;
  body.appendChild(row);
  // Track in _thinkingSteps for cross-session persistence
  const existingIdx = _thinkingSteps.findIndex(s => s.type === 'text');
  if (existingIdx >= 0) _thinkingSteps[existingIdx] = { type: 'text', text };
  else _thinkingSteps.push({ type: 'text', text });
}

// 新消息到达指示器（用户不在底部时显示）
function _showNewMsgIndicator() {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  if (msgs.querySelector('.siper-new-msg-indicator')) return; // 已存在
  const btn = document.createElement('div');
  btn.className = 'siper-new-msg-indicator';
  btn.innerHTML = '▼ 新消息';
  btn.onclick = function() {
    msgs.scrollTop = msgs.scrollHeight;
    _hideNewMsgIndicator();
  };
  msgs.appendChild(btn);
}

function _hideNewMsgIndicator() {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const btn = msgs.querySelector('.siper-new-msg-indicator');
  if (btn) btn.remove();
}

export function chatHandleToolProgress(d) {
  if (!isSending) return;
  const toolName = d.tool_name || 'unknown';
  const status = d.status || 'running';
  const callId = d.call_id || toolName;
  const params = d.info && d.info.parameters ? d.info.parameters : null;
  let resultSummary = '';
  if (status === 'completed' && d.info) {
    if (toolName === 'web_search' && d.info.metadata && d.info.metadata.count) {
      resultSummary = '→ ' + d.info.metadata.count + ' results';
    } else if (d.info.result && typeof d.info.result === 'string') {
      resultSummary = '→ ' + d.info.result.replace(/\n/g, ' ');
    }
  }
  // Show thinking panel on any tool status if not already open
  const panel = document.getElementById('chatThinkingPanel');
  const body = document.getElementById('chatThinkingBody');
  if (panel && !panel.classList.contains('open')) {
    chatThinkingShow();
    if (!body || body.querySelectorAll('.siper-thinking-step').length === 0) {
      chatThinkingClear();
    }
  }
  chatThinkingAddToolStep(callId, toolName, status, params, resultSummary);
}

// ===== Context Info =====

export function updateCtxFromStreamEnd(usage) {
  if (!usage) return;
  const used = usage.prompt_tokens || 0;
  window.chatCtxTokens = { used: used, total: chatModelContextWindow };
  updateCtxInfoDisplay();
}
