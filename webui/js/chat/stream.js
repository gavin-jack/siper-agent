/**
 * chat/stream.js — 流式响应处理
 * 从 core.js 拆出。处理 stream_delta / stream_end / stopped 事件。
 */
import {
    _chatStreamAcc, _chatStreamRow, _chatStreamBubble,
    _thinkingSteps, _isThinking,
    _chatSessionId, _isSending, _chatCurrentAgent,
    _streamState,
    getStreamState, syncStreamFromCurrent, syncStreamToCurrent,
    setChatStreamAcc, setChatStreamRow, setChatStreamBubble,
    setIsThinking, updateStreamingBadge,
} from './state.js?v=1783612457431';
import { chatEscapeHtml, chatRenderMarkdown, buildMetaHtml, updateCtxInfoDisplay, playNotifySound } from './message.js?v=1783612457431';
import { updateCtxFromStreamEnd, resetSendState } from './session.js?v=1783612457431';
import { chatThinkingHide, chatThinkingClear, chatThinkingAddTextRow, chatThinkingShow } from './thinking.js?v=1783612457431';
import { _showNewMsgIndicator, _hideNewMsgIndicator } from './badge.js?v=1783612457431';
import { renderFull, applyDelta } from '../renderer.js?v=1783612457431';
import { markSessionUnread, renderMiddleList, refreshAgentsAndRender } from './sidebar.js?v=1783612457431';

// 流式 DOM 元素（当前会话）
let _streamTextEl = null;
let _streamRenderTimer = null;
let _streamAcc = '';  // 独立累加器（不依赖 state.js 的 _chatStreamAcc）

// Markdown 渲染辅助（一次性 feature-detect，避免每次渲染重复判断）
const _renderMd = typeof renderMarkdown === 'function'
  ? (el, text) => { el.innerHTML = ''; el.appendChild(renderMarkdown(text)); }
  : (el, text) => { el.innerHTML = chatRenderMarkdown(text); };

/**
 * 处理 stream_delta 消息
 * 对应 core.js 的 _appendStream() + chatHandleStreamDelta()
 */
export function appendStream(delta, streamSessionId) {
    // 如果用户已经停止，忽略晚期 delta
    if (!_isSending) return;

    // 跨会话流式：更新状态 + 缓存中的 DOM（如果存在）
    if (streamSessionId && _chatSessionId && streamSessionId !== _chatSessionId) {
        const s = getStreamState(streamSessionId);
        s.acc += delta || '';
        const cached = window._sessionDomCache?.get(streamSessionId);
        const textEl = cached?.streamRow?.querySelector('.siper-stream-text');
        if (textEl) {
            const accLen = s.acc.length;
            if (accLen < 200 || accLen % 3 === 0 || (delta && delta.length > 50)) {
                _renderMd(textEl, s.acc);
            }
            cached.streamRow.dataset.rawText = s.acc;
        }
        return;
    }

    syncStreamFromCurrent();
    const msgs = document.getElementById('chatMessages');
    if (!msgs) { syncStreamToCurrent(); return; }
    const empty = document.getElementById('chatEmptyState');
    if (empty) empty.style.display = 'none';

    _streamAcc = _chatStreamAcc + (delta || '');
    setChatStreamAcc(_streamAcc);

    // 首次 delta：创建流式 DOM 行
    if (!_chatStreamRow) {
        chatThinkingClear();
        chatThinkingAddTextRow('正在生成回复...');
        const row = document.createElement('div');
        row.className = 'siper-msg-row agent siper-stream-row';
        const avatarUrl = _chatCurrentAgent && _chatCurrentAgent.name
            ? '/api/avatar?agent=' + encodeURIComponent(_chatCurrentAgent.name)
            : '/static/default_avatar.webp';
        row.innerHTML =
            '<img src="' + avatarUrl + '" class="siper-msg-avatar" alt="" onerror="this.src=\'/static/default_avatar_256.png\'">' +
            '<div class="siper-bubble-col">' +
            '<div class="siper-msg-time"></div>' +
            '<div class="siper-bubble agent-bubble"><div class="siper-msg-body"><span class="siper-stream-text"></span><span class="siper-stream-cursor" class="js-hidden">▊</span></div></div>' +
            '<div class="siper-msg-actions"></div>' +
            '</div>';
        msgs.appendChild(row);
        setChatStreamRow(row);
        _streamTextEl = row.querySelector('.siper-stream-text');
        if (_chatSessionId) updateStreamingBadge(_chatSessionId, true);
    }

    const textEl = _chatStreamRow.querySelector('.siper-stream-text');
    const cursorEl = _chatStreamRow.querySelector('.siper-stream-cursor');
    if (cursorEl) cursorEl.style.display = 'inline';
    if (textEl) {
        // 节流 Markdown 渲染：<200字符逐次，之后每 3 次，或 delta >50 字符
        const accLen = _streamAcc.length;
        if (accLen < 200 || accLen % 3 === 0 || delta.length > 50) {
            textEl.innerHTML = '';
            _renderMd(textEl, _streamAcc);
        }
    }
    _chatStreamRow.dataset.rawText = _streamAcc;

    // 自动滚动或显示新消息指示器
    const distanceFromBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
    if (distanceFromBottom < 80) {
        msgs.scrollTop = msgs.scrollHeight;
        _hideNewMsgIndicator();
    } else {
        _showNewMsgIndicator();
    }
    syncStreamToCurrent();
}

/**
 * 处理 stream_end 消息
 * 对应 core.js 的 chatHandleStreamEnd()
 */
/**
 * 清理流式状态（finalizeStream / handleStopped 共用）
 */
function _cleanupStreamState() {
    setChatStreamAcc('');
    setChatStreamRow(null);
    setChatStreamBubble(null);
    _thinkingSteps.length = 0;
    setIsThinking(false);
    if (_chatSessionId) updateStreamingBadge(_chatSessionId, false);
    resetSendState();
    _hideNewMsgIndicator();
    chatThinkingClear();
    chatThinkingHide();
    refreshAgentsAndRender();
    playNotifySound();
}

export function finalizeStream(data, streamSessionId) {
    // 跨会话：清理 per-session 状态 + 缓存中的流式 DOM
    if (streamSessionId && _chatSessionId && streamSessionId !== _chatSessionId) {
        const s = getStreamState(streamSessionId);
        s.thinking = false;
        s.thinkingSteps = [];
        s.row = null; s.bubble = null; s.acc = '';
        if (typeof window._sessionDomCache !== 'undefined' && window._sessionDomCache.has(streamSessionId)) {
            window._sessionDomCache.delete(streamSessionId);
        }
        updateStreamingBadge(streamSessionId, false);
        return;
    }

    syncStreamFromCurrent();
    const text = _chatStreamAcc;

    if (data && data.usage) updateCtxFromStreamEnd(data.usage);

    const steps = [..._thinkingSteps];

    // 复用流式 DOM，直接更新内容
    if (_chatStreamRow) {
        _chatStreamRow.classList.remove('siper-stream-row');
        const cursorEl = _chatStreamRow.querySelector('.siper-stream-cursor');
        if (cursorEl) cursorEl.style.display = 'none';
        const streamTextEl = _chatStreamRow.querySelector('.siper-stream-text');
        if (streamTextEl) {
            const parent = streamTextEl.parentElement;
            if (parent) {
                parent.innerHTML = '';
                if (text) _renderMd(parent, text);
                else if (data && data.tool_call_steps && data.tool_call_steps.length) {
                    const toolNames = data.tool_call_steps.map(s => s.tool_name).filter(Boolean);
                    const summary = document.createElement('div');
                    summary.className = 'siper-tool-summary';
                    summary.textContent = '🔧 执行工具：' + (toolNames.length ? toolNames.join(', ') : data.tool_call_steps.length + ' calls');
                    parent.appendChild(summary);
                }
                if (data && data.success === false) {
                    const errEl = document.createElement('div');
                    errEl.className = 'siper-stream-error';
                    errEl.textContent = '⚠️ LLM 响应异常';
                    parent.appendChild(errEl);
                }
            }
        }
        // 追加 meta
        if (data && (data.usage || data.model || data.processing_time_ms || data.tool_call_steps || data.skills_used || data.finish_reason)) {
            const bubbleEl = _chatStreamRow.querySelector('.siper-bubble');
            if (bubbleEl) {
                const metaEl = document.createElement('div');
                metaEl.className = 'siper-bubble-meta';
                metaEl.innerHTML = buildMetaHtml(data);
                bubbleEl.appendChild(metaEl);
            }
        }
        // 追加附件
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
        // 追加复制/嵌入/dict 按钮
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
        if (data && data.message_id) {
            const actions = _chatStreamRow.querySelector('.siper-msg-actions');
            if (actions && !actions.querySelector('.siper-dict-btn')) {
                const dictBtn = document.createElement('button');
                dictBtn.className = 'siper-msg-action-btn siper-dict-btn';
                dictBtn.innerHTML = '{}';
                dictBtn.title = '查看完整响应数据';
                dictBtn.addEventListener('click', (e) => { e.stopPropagation(); showDictModal(data); });
                actions.appendChild(dictBtn);
            }
        }
        // 更新时间戳
        const timeEl = _chatStreamRow.querySelector('.siper-msg-time');
        if (timeEl) timeEl.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }

    _cleanupStreamState();
    syncStreamToCurrent();
    if (_chatSessionId && streamSessionId && _chatSessionId !== streamSessionId) {
        markSessionUnread(streamSessionId);
    }
}

/**
 * 处理 stopped 消息
 */
export function handleStopped() {
    syncStreamFromCurrent();
    const stoppedSessionId = _chatSessionId;
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
                if (text) _renderMd(parent, text);
                }
            }
        }
    }
    _cleanupStreamState();
    if (_chatSessionId && stoppedSessionId && _chatSessionId !== stoppedSessionId) {
        markSessionUnread(stoppedSessionId);
    }
}

/**
 * 构建过程思考/工具调用详情 HTML
 */
function buildThinkingDetails(steps) {
    if (!steps || steps.length === 0) return null;
    const container = document.createElement('div');
    container.className = 'siper-thinking-details';
    for (const step of steps) {
        if (step.type === 'text') {
            const row = document.createElement('div');
            row.className = 'siper-thinking-detail-text';
            row.textContent = step.text || '';
            container.appendChild(row);
        } else if (step.toolName) {
            const row = document.createElement('div');
            row.className = 'siper-thinking-detail-tool';
            const icon = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '⟳';
            row.innerHTML = '<span class="siper-thinking-detail-icon">' + icon + '</span><span class="siper-thinking-detail-name">' + chatEscapeHtml(step.toolName) + '</span>';
            if (step.callId && step.callId !== step.toolName) {
                row.innerHTML += ' <span class="siper-thinking-detail-id">' + chatEscapeHtml(step.callId) + '</span>';
            }
            container.appendChild(row);
        }
    }
    return container;
}