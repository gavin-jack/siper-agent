// chat/message.js — 消息渲染与管理
import { getWs } from '../core.js';
import {
  _chatSessionId, _chatCurrentAgent,
  _chatCurrentModel, _chatModelContextWindow,
  _chatStreamAcc, _chatStreamRow, _chatStreamBubble,
  setChatStreamAcc, setChatStreamRow, setChatStreamBubble, setIsSending,
  fmtTokens,
  markSessionReady,
  syncStreamFromCurrent, syncStreamToCurrent,
  getChatSessionId, getChatCurrentAgent,
  setChatCurrentModel, setChatModelContextWindow,
  setChatSessionId, getIsSending, getStreamState,
  _isSending,
} from '../chat/state.js';
import { resetSendState } from '../chat/session.js';
import { chatThinkingHide } from '../chat/thinking.js';
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
  row.classList.add('msg-animate-in');
  // Remove animation class after it plays so re-renders don't re-trigger
  setTimeout(() => row.classList.remove('msg-animate-in'), 300);
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
  const avatarUrl = _chatCurrentAgent && _chatCurrentAgent.name
    ? '/api/avatar?agent=' + encodeURIComponent(_chatCurrentAgent.name)
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
  row.classList.add('msg-animate-in');
  setTimeout(() => row.classList.remove('msg-animate-in'), 300);
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
  _animateCodeBlocks(row);
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

/** 构建 meta HTML 字符串（供流式路径和历史消息路径共享） */
export function buildMetaHtml(meta) {
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
    if (notUsed.length) lines.push('<span class="js-opacity-50">💡 推荐：' + notUsed.join(', ') + '</span>');
  }
  if (meta.finish_reason && meta.finish_reason !== 'stop') lines.push('🏁 ' + meta.finish_reason);
  return lines.map(l => l.startsWith('<span') ? '<div>' + l + '</div>' : '<div>' + chatEscapeHtml(l) + '</div>').join('');
}

function _renderMessageMeta(row, meta, messageId) {
  const bubbleEl = row.querySelector('.siper-bubble');
  if (!bubbleEl) return;
  const metaEl = document.createElement('div');
  metaEl.className = 'siper-bubble-meta';
  metaEl.innerHTML = buildMetaHtml(meta);
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
      }
      // 只要有 message_id 就追加 dict 按钮（历史消息可能 meta 不完整）
      if (messageId) {
        const _metaForDict = parsedMeta && typeof parsedMeta === 'object' ? parsedMeta : {};
        _appendDictBtn(row, { message_id: messageId, ..._metaForDict });
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

// ===== Window Mounts (for renderer handlers) =====
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
  const tokens = window.chatCtxTokens || { used: 0, total: _chatModelContextWindow || 0 };
  const total = tokens.total || _chatModelContextWindow || 0;
  const used = tokens.used || 0;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  valEl.textContent = total > 0 ? fmtTokens(used) + '/' + fmtTokens(total) : '--/--';
  pctEl.textContent = total > 0 ? pct + '%' : '--%';
  pctEl.classList.remove('warn', 'danger');
  if (pct >= 90) pctEl.classList.add('danger');
  else if (pct >= 70) pctEl.classList.add('warn');
}

// ===== ECharts =====

// ===== Window Mounts (for renderer handlers) =====

/**
 * Render message list from backend snapshot data.
 * Clears container and re-renders all messages.
 * @param {Array} messages - [{role, content, timestamp, meta, message_id, agent_name}]
 */
window.renderChatMessages = function(messages) {
  if (!Array.isArray(messages)) return;
  const container = document.getElementById('chatMessages');
  if (!container) return;
  // Clear but keep empty state
  container.innerHTML = '';
  if (messages.length === 0) {
    container.innerHTML = '<div class="siper-empty-state" id="chatEmptyState"><div class="siper-empty-state-icon">💬</div><div>通过agent发送消息</div></div>';
    return;
  }
  for (const msg of messages) {
    const role = msg.role || 'assistant';
    const isAgent = role !== 'user';
    const meta = msg.meta || {};
    // Attachments injection
    if (msg.attachments) meta.attachments = msg.attachments;
    chatAddMessage(
      msg.content || '',
      isAgent,
      meta,
      msg.timestamp || null,
      false,
      msg.agent_name || null,
      msg.message_id || null
    );
  }
  // 所有消息渲染完毕后滚动到底部
  requestAnimationFrame(function() {
    container.scrollTop = container.scrollHeight;
  });
};

// ===== 复制/插入消息 =====
window.copyChatMsg = function(btn) {
  var row = btn && typeof btn.closest === 'function' ? btn.closest('.siper-msg-row') : null;
  var text = row ? row.dataset.rawText : '';
  if (!text) return;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(function() {
      if (typeof window.toast !== 'undefined' && window.toast && window.toast.success) window.toast.success('已复制');
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); if (window.toast && window.toast.success) window.toast.success('已复制'); } catch(e) {}
    document.body.removeChild(ta);
  }
};

window.insertChatMsg = function(btn) {
  var row = btn && typeof btn.closest === 'function' ? btn.closest('.siper-msg-row') : null;
  var text = row ? row.dataset.rawText : '';
  if (!text) return;
  var input = document.getElementById('chatInput');
  if (input) {
    input.value = text;
    input.focus();
    // Trigger input event for auto-resize
    var evt = document.createEvent('Event');
    evt.initEvent('input', true, true);
    input.dispatchEvent(evt);
  }
};
