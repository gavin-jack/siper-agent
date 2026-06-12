// chat/message.js — 消息渲染与管理
import {
  chatSessionId, chatCurrentAgent, chatExpandedAgents,
  chatCurrentModel, chatModelContextWindow,
  _chatStreamAcc, _chatStreamRow, _chatStreamBubble,
  _syncStreamFromCurrent, _syncStreamToCurrent,
  _unreadSessions, chatAgents, setChatStreamAcc, setChatStreamRow, setChatStreamBubble, setIsSending,
  getWs,
  fmtTokens, resetSendState
} from './state.js';
import { toast } from '../components/toast.js';

// ===== Markdown & HTML Helpers =====

export function chatEscapeHtml(text) {
  return window.escapeHtml ? window.escapeHtml(text) : String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function chatRenderMarkdown(text) {
  if (!text) return '';
  let h = chatEscapeHtml(text);
  h = h.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

export function playNotifySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

// ===== Message Rendering =====

export function chatAppendUserMsg(text) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const empty = document.getElementById('chatEmptyState');
  if (empty) empty.style.display = 'none';
  const row = document.createElement('div');
  row.className = 'siper-msg-row user';
  const timeStr = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  row.innerHTML = `
    <div class="siper-bubble-col">
      <div class="siper-msg-time">${timeStr}</div>
      <div class="siper-bubble user-bubble">${chatRenderMarkdown(text)}</div>
      <div class="siper-msg-actions">
        <button class="siper-msg-action-btn" onclick="copyChatMsg(this)" title="复制">📋</button>
        <button class="siper-msg-action-btn" onclick="insertChatMsg(this)" title="嵌入">↩</button>
      </div>
    </div>
  `;
  row.dataset.rawText = text;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
  return row;
}

export function chatAppendAgentMsg(text, meta) {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const empty = document.getElementById('chatEmptyState');
  if (empty) empty.style.display = 'none';
  const row = document.createElement('div');
  row.className = 'siper-msg-row agent';
  const timeStr = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const avatarUrl = chatCurrentAgent && chatCurrentAgent.name
    ? '/api/avatar?agent=' + encodeURIComponent(chatCurrentAgent.name)
    : '/static/default_avatar.webp';
  row.innerHTML = `
    <img src="${avatarUrl}" class="siper-msg-avatar" alt="" onerror="this.src='/static/default_avatar_256.png'">
    <div class="siper-bubble-col">
      <div class="siper-msg-time">${timeStr}</div>
      <div class="siper-bubble agent-bubble"></div>
      <div class="siper-msg-actions">
        <button class="siper-msg-action-btn" onclick="copyChatMsg(this)" title="复制">📋</button>
        <button class="siper-msg-action-btn" onclick="insertChatMsg(this)" title="嵌入">↩</button>
      </div>
    </div>
  `;
  const bubble = row.querySelector('.siper-bubble');
  if (bubble && typeof renderMarkdown === 'function') {
    bubble.appendChild(renderMarkdown(text || ''));
  } else if (bubble) {
    bubble.innerHTML = chatRenderMarkdown(text);
  }
  row.dataset.rawText = text;
  if (meta && meta.message_id) {
    const dictData = meta._raw || meta;
    const actions = row.querySelector('.siper-msg-actions');
    if (actions) {
      const existing = actions.querySelector('.siper-dict-btn');
      if (existing) existing.remove();
      const dictBtn = document.createElement('button');
      dictBtn.className = 'siper-msg-action-btn siper-dict-btn';
      dictBtn.innerHTML = '{}';
      dictBtn.title = '查看完整响应数据';
      dictBtn.addEventListener('click', (e) => { e.stopPropagation(); showDictModal(dictData); });
      actions.appendChild(dictBtn);
    }
  }
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
  playNotifySound();
  return row;
}

// ===== Message History =====

export function chatClearMessages() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const rows = container.querySelectorAll('.siper-msg-row:not(.siper-stream-row)');
  rows.forEach(r => r.remove());
}

function _renderMessageMeta(row, meta, messageId) {
  const bubbleEl = row.querySelector('.siper-bubble');
  if (!bubbleEl) return;
  const metaEl = document.createElement('div');
  metaEl.className = 'siper-bubble-meta';
  const lines = [];
  if (meta.usage) {
    const u = meta.usage;
    const fmt = fmtTokens;
    const parts = [];
    if (u.prompt_tokens != null) parts.push('⬆️ 输入token：~ ' + fmt(u.prompt_tokens));
    if (u.completion_tokens != null) parts.push('⬇️ 输出token：~ ' + fmt(u.completion_tokens));
    if (meta.model) parts.push('🤖 ' + meta.model);
    if (meta.processing_time_ms) {
      const ms = meta.processing_time_ms;
      const t = ms < 1000 ? ms + 'ms' : ms < 60000 ? (ms/1000).toFixed(1) + 's' : Math.floor(ms/60000) + 'm ' + Math.floor((ms%60000)/1000) + 's';
      parts.push('⏱ ' + t);
    }
    if (parts.length) lines.push(parts.join('；'));
  }
  if (meta.tool_call_steps && meta.tool_call_steps.length) {
    const toolNames = meta.tool_call_steps.map(s => s.tool_name).filter(Boolean);
    lines.push('🔧 工具：' + (toolNames.length ? toolNames.join(', ') : meta.tool_call_steps.length + ' calls'));
  }
  if (meta.skills_used && meta.skills_used.length) lines.push('🧩 技能：' + meta.skills_used.join(', '));
  if (meta.skills_recommended && meta.skills_recommended.length) {
    const notUsed = meta.skills_recommended.filter(s => !meta.skills_used || !meta.skills_used.includes(s));
    if (notUsed.length) lines.push('<span style="opacity:0.5">💡 推荐：' + notUsed.join(', ') + '</span>');
  }
  if (meta.finish_reason && meta.finish_reason !== 'stop') lines.push('🏁 ' + meta.finish_reason);
  metaEl.innerHTML = lines.map(l => '<div>' + chatEscapeHtml(l) + '</div>').join('');
  bubbleEl.appendChild(metaEl);
  if (meta.response_dict) _appendDictBtn(row, meta.response_dict);
}

function _appendDictBtn(row, responseDict) {
  const actions = row.querySelector('.siper-msg-actions');
  if (!actions) return;
  if (actions.querySelector('.siper-dict-btn')) return;
  const dictBtn = document.createElement('button');
  dictBtn.className = 'siper-msg-action-btn siper-dict-btn';
  dictBtn.innerHTML = '{}';
  dictBtn.title = '查看完整响应数据';
  dictBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showDictModal(responseDict);
  });
  actions.appendChild(dictBtn);
}

export function chatAddMessage(text, isAgent, meta, timestamp, scroll, agentName, messageId) {
  try {
    const container = document.getElementById('chatMessages');
    if (!container) return null;
    const row = document.createElement('div');
    row.className = 'siper-msg-row' + (isAgent ? ' agent' : ' user');
    const time = timestamp
      ? new Date(timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})
      : new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    const avatarSrc = isAgent
      ? (agentName ? '/api/avatar?agent=' + encodeURIComponent(agentName) : '/static/default_avatar.webp')
      : '/static/user_avatar.png';
    if (isAgent) {
      row.innerHTML = `<img src="${avatarSrc}" class="siper-msg-avatar" alt="agent" onerror="this.src='/static/default_avatar_256.png'"><div class="siper-bubble-col"><div class="siper-msg-time">${time}</div><div class="siper-bubble agent-bubble"><div class="siper-msg-body"></div></div><div class="siper-msg-actions"><button class="siper-msg-action-btn" onclick="copyChatMsg(this)" title="复制">📋</button><button class="siper-msg-action-btn" onclick="insertChatMsg(this)" title="嵌入">↩</button></div></div>`;
      const body = row.querySelector('.siper-msg-body');
      if (text) {
        body.appendChild(renderMarkdown(text));
      } else if (meta && meta.tool_call_steps && meta.tool_call_steps.length) {
        const toolNames = meta.tool_call_steps.map(s => s.tool_name).filter(Boolean);
        const summary = document.createElement('div');
        summary.className = 'siper-tool-summary';
        summary.innerHTML = '🔧 执行工具：' + (toolNames.length ? toolNames.join(', ') : meta.tool_call_steps.length + ' calls');
        body.appendChild(summary);
      }
      row.dataset.rawText = text || '';
      // 解析 meta（处理双重 JSON 编码）
      let parsedMeta = meta;
      if (typeof meta === 'string') { try { parsedMeta = JSON.parse(meta); } catch(e) { parsedMeta = {}; } }
      if (typeof parsedMeta === 'string') { try { parsedMeta = JSON.parse(parsedMeta); } catch(e) { parsedMeta = {}; } }
      // 渲染 meta 信息
      if (parsedMeta && (parsedMeta.usage || parsedMeta.model || parsedMeta.processing_time_ms || parsedMeta.tool_call_steps || parsedMeta.skills_used || parsedMeta.skills_recommended || parsedMeta.finish_reason)) {
        _renderMessageMeta(row, parsedMeta, messageId);
      } else if (messageId && parsedMeta) {
        // 无详细 meta 但有 messageId 和 meta，用 meta 数据作 dict
        _appendDictBtn(row, { message_id: messageId, ...parsedMeta });
      }
    } else {
      row.innerHTML = `<div class="siper-bubble-col"><div class="siper-msg-time">${time}</div><div class="siper-bubble user-bubble"><div class="siper-msg-body"></div></div><div class="siper-msg-actions"><button class="siper-msg-action-btn" onclick="copyChatMsg(this)" title="复制">📋</button><button class="siper-msg-action-btn" onclick="insertChatMsg(this)" title="嵌入">↩</button></div></div>`;
      const body = row.querySelector('.siper-msg-body');
      if (text && typeof renderMarkdown === 'function') body.appendChild(renderMarkdown(text));
      else if (text) body.textContent = text;
      row.dataset.rawText = text || '';
    }
    if (meta && meta.attachments) {
      const bubble = row.querySelector('.siper-bubble');
      let attHtml = '';
      for (const att of meta.attachments) {
        if (att.category === 'image' || att.type === 'image') attHtml += `<img src="${att.url || att.data || ''}" class="siper-img" alt="${chatEscapeHtml(att.name || 'image')}" onclick="window.open(this.src)">`;
      }
      if (attHtml) { const w = document.createElement('div'); w.className = 'siper-attachments'; w.innerHTML = attHtml; bubble.appendChild(w); }
    }
    container.appendChild(row);
    if (scroll !== false) container.scrollTop = container.scrollHeight;
    return row;
  } catch(e) {
    console.error('chatAddMessage error:', e);
    toast.error('消息显示失败');
    return null;
  }
}

export function chatLoadSessionMessages(sessionId) {
  chatClearMessages();
  if (!sessionId) return;
  fetch(`/api/sessions/${sessionId}`)
    .then(r => r.json())
    .then(d => {
      if (!d.messages) return;
      var lastUsage = null;
      for (const msg of d.messages) {
        if (msg.role === 'user') chatAddMessage(msg.content || '', false, null, msg.timestamp, false, null, null);
        else if (msg.role === 'tool') continue;
        else if (msg.role === 'assistant') {
          const hasContent = msg.content && msg.content.trim();
          const hasToolSteps = msg.meta && msg.meta.tool_call_steps && msg.meta.tool_call_steps.length;
          if (!hasContent && !hasToolSteps) continue;
          const agentName = (typeof chatCurrentAgent !== 'undefined' && chatCurrentAgent && chatCurrentAgent.name) ? chatCurrentAgent.name : null;
          chatAddMessage(msg.content || '', true, msg.meta, msg.timestamp, false, agentName, msg.message_id);
          if (msg.meta && msg.meta.usage) lastUsage = msg.meta.usage;
        }
      }
      // 历史消息加载完毕，滚动到底部
      const loadContainer = document.getElementById('chatMessages');
      if (loadContainer) loadContainer.scrollTop = loadContainer.scrollHeight;
      // Re-attach active stream bubble
      if (_chatStreamRow && _chatStreamBubble) {
        const container = document.getElementById('chatMessages');
        if (container) {
          container.appendChild(_chatStreamRow);
          const textEl = _chatStreamRow.querySelector('.siper-stream-text');
          if (textEl) {
            textEl.innerHTML = '';
            if (typeof renderMarkdown === 'function') textEl.appendChild(renderMarkdown(_chatStreamAcc));
            else textEl.innerHTML = chatRenderMarkdown(_chatStreamAcc);
          }
          container.scrollTop = container.scrollHeight;
        }
      } else if (_chatStreamAcc && _chatStreamAcc.trim()) {
        _syncStreamFromCurrent();
        if (!_chatStreamRow) {
          const container = document.getElementById('chatMessages');
          if (container) {
            setChatStreamRow(document.createElement('div'));
            _chatStreamRow.className = 'siper-msg-row agent siper-stream-row';
            const avatarUrl = chatCurrentAgent && chatCurrentAgent.name
              ? '/api/avatar?agent=' + encodeURIComponent(chatCurrentAgent.name)
              : '/static/default_avatar.webp';
            _chatStreamRow.innerHTML = `
              <img src="${avatarUrl}" class="siper-msg-avatar" alt="" onerror="this.src='/static/default_avatar_256.png'">
              <div class="siper-bubble-col">
                <div class="siper-msg-time"></div>
                <div class="siper-bubble agent-bubble"><div class="siper-msg-body"><span class="siper-stream-text"></span></div></div>
                <div class="siper-msg-actions">
                  <button class="siper-msg-action-btn" onclick="copyChatMsg(this)" title="复制">📋</button>
                  <button class="siper-msg-action-btn" onclick="insertChatMsg(this)" title="嵌入">↩</button>
                </div>
              </div>
            `;
            setChatStreamBubble(_chatStreamRow.querySelector('.siper-msg-body'));
            const textEl = _chatStreamRow.querySelector('.siper-stream-text');
            if (textEl) {
              textEl.innerHTML = '';
              if (typeof renderMarkdown === 'function') textEl.appendChild(renderMarkdown(_chatStreamAcc));
              else textEl.innerHTML = chatRenderMarkdown(_chatStreamAcc);
            }
            container.appendChild(_chatStreamRow);
            container.scrollTop = container.scrollHeight;
            _syncStreamToCurrent();
          }
        }
      }
      if (lastUsage) {
        var used = lastUsage.prompt_tokens || 0;
        window.chatCtxTokens = { used: used, total: chatModelContextWindow || 0 };
        updateCtxInfoDisplay();
      }
    })
    .catch(e => console.error('chatLoadSessionMessages error:', e));
}

export function chatStopGeneration() {
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
  resetSendState();
  setChatStreamAcc('');
  setChatStreamRow(null);
  setChatStreamBubble(null);
}

// ===== Context Info Display =====

export function updateCtxInfoDisplay() {
  const valEl = document.getElementById('chatCtxValue');
  const pctEl = document.getElementById('chatCtxPct');
  if (!valEl || !pctEl) return;
  const tokens = window.chatCtxTokens || { used: 0, total: chatModelContextWindow || 0 };
  const total = tokens.total || chatModelContextWindow || 0;
  const used = tokens.used || 0;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  valEl.textContent = total > 0 ? fmtTokens(used) + '/' + fmtTokens(total) : '--/--';
  pctEl.textContent = total > 0 ? pct + '%' : '--%';
  pctEl.classList.remove('warn', 'danger');
  if (pct >= 90) pctEl.classList.add('danger');
  else if (pct >= 70) pctEl.classList.add('warn');
}

// ===== ECharts =====

export { _chatStreamAcc, _chatStreamRow, _chatStreamBubble, fmtTokens };
