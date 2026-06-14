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
} from './state.js';
import { chatEscapeHtml, chatRenderMarkdown, buildMetaHtml, updateCtxInfoDisplay } from './message.js';
import { updateCtxFromStreamEnd, resetSendState } from './session.js';
import { chatThinkingHide, chatThinkingClear, chatThinkingAddTextRow, chatThinkingShow } from './thinking.js';
import { _showNewMsgIndicator, _hideNewMsgIndicator } from './badge.js';
import { renderFull, applyDelta } from '../renderer.js';

// 流式 DOM 元素（当前会话）
let _streamTextEl = null;
let _streamRenderTimer = null;
let _streamAcc = '';  // 独立累加器（不依赖 state.js 的 _chatStreamAcc）

/**
 * 处理 stream_delta 消息
 * 对应 core.js 的 _appendStream() + chatHandleStreamDelta()
 */
export function appendStream(delta, streamSessionId) {
    // 如果用户已经停止，忽略晚期 delta
    if (!_isSending) return;

    // 跨会话流式：只更新状态，不渲染
    if (streamSessionId && _chatSessionId && streamSessionId !== _chatSessionId) {
        const s = getStreamState(streamSessionId);
        s.acc += delta || '';
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
            if (typeof renderMarkdown === 'function') {
                textEl.appendChild(renderMarkdown(_streamAcc));
            } else {
                textEl.innerHTML = chatRenderMarkdown(_streamAcc);
            }
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
export function finalizeStream(data, streamSessionId) {
    // 跨会话：只清理状态
    if (streamSessionId && _chatSessionId && streamSessionId !== _chatSessionId) {
        const s = getStreamState(streamSessionId);
        s.thinking = false;
        s.thinkingSteps = [];
        setIsThinking(false);
        chatThinkingHide();
        s.row = null; s.bubble = null; s.acc = '';
        updateStreamingBadge(streamSessionId, false);
        return;
    }

    syncStreamFromCurrent();
    const text = _chatStreamAcc;

    if (data && data.usage) updateCtxFromStreamEnd(data.usage);

    // 保存 response dict 到 sessions.db
    if (data && data.message_id) {
        fetch('/api/save-response-dict', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message_id: data.message_id, response_dict: data })
        }).catch(() => {});
    }

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

    setChatStreamAcc('');
    setChatStreamRow(null);
    setChatStreamBubble(null);
    _thinkingSteps.length = 0;
    setIsThinking(false);
    if (_chatSessionId) updateStreamingBadge(_chatSessionId, false);
    syncStreamToCurrent();
    resetSendState();
    _hideNewMsgIndicator();
    chatThinkingHide();
    // 起源：侧边栏更新由 agents delta 自动处理（sync_agents → renderAgentList → renderMiddleList）
    // 不再需要 updateSessionPreview 旧链路
}

/**
 * 处理 stopped 消息
 * 对应 core.js 的 chatHandleStopped()
 */
export function handleStopped() {
    syncStreamFromCurrent();
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
    if (_chatSessionId && typeof updateStreamingBadge === 'function') updateStreamingBadge(_chatSessionId, false);
    // 起源：侧边栏更新由 agents delta 自动处理
}

/**
 * 处理 stream_delta 的旧入口（core.js dispatch 转发）
 * 保持向后兼容
 */
export function chatHandleStreamDelta(delta, streamSessionId) {
    appendStream(delta, streamSessionId);
}

/**
 * 处理 stream_end 的旧入口（core.js dispatch 转发）
 */
export function chatHandleStreamEnd(data, streamSessionId) {
    finalizeStream(data, streamSessionId);
}

/**
 * 处理 stopped 的旧入口
 */
export function chatHandleStopped() {
    handleStopped();
}
