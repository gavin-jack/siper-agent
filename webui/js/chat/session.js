/**
 * chat/session.js — 会话管理
 * 从 core.js 拆出。处理会话创建/切换/停止/消息发送/预览更新。
 */
import {
    _chatSessionId, _chatCurrentAgent, _isSending, _chatCurrentModel,
    _chatModelContextWindow, _chatAgents,
    setIsSending, setChatSessionId, setChatCurrentAgent,
    setChatCurrentModel, setChatModelContextWindow,
    setCurrentModel,
} from './state.js';
import { send } from '../core.js';
import { chatThinkingHide } from './thinking.js';
import { updateStreamingBadge } from './state.js';
import { _hideNewMsgIndicator } from './badge.js';

// ===== Send State Reset =====

export function resetSendState() {
    setIsSending(false);
    const sb = document.getElementById('chatSendBtn');
    if (sb) sb.disabled = false;
    const stb = document.getElementById('chatStopBtn');
    if (stb) stb.classList.add('hidden');
    chatThinkingHide();
}

// ===== Send Operations =====

export function navigate(page) {
    send({ type: 'navigate', page });
}

export function newSession(agent) {
    send({ type: 'new_session', agent: agent || 'default' });
}

export function switchSession(sessionId) {
    send({ type: 'switch_session', session_id: sessionId });
}

export function stopGeneration() {
    send({ type: 'stop' });
}

export function sendMessage(content, sessionId, agent, model, images) {
    send({
        type: 'message',
        content,
        session_id: sessionId,
        agent: agent || 'default',
        model: model || '',
        images: images || [],
    });
}

// ===== Session Preview =====

export function updateSessionPreview(sessionId, text, updatedAt) {
    if (!sessionId || !_chatCurrentAgent) return;
    const _agent = _chatAgents.find(a => a.name === _chatCurrentAgent.name);
    if (!_agent) return;
    const _sess = _agent.sessions.find(s => s.session_id === sessionId);
    if (!_sess) return;
    if (text !== undefined) {
        _sess.last_message = text.replace(/\n/g, ' ').substring(0, 60);
    }
    if (updatedAt !== undefined) {
        _sess.updated_at = updatedAt;
    } else if (text !== undefined) {
        _sess.updated_at = new Date().toISOString();
    }
    const container = document.getElementById('chatMiddleList');
    if (container) {
        const items = container.querySelectorAll('.siper-session-item');
        for (const item of items) {
            if (item.dataset.sessionId === sessionId) {
                if (text !== undefined) {
                    const preview = item.querySelector('.siper-session-preview');
                    if (preview) preview.textContent = _sess.last_message;
                }
                if (updatedAt !== undefined) {
                    const timeEl = item.querySelector('.siper-session-time');
                    if (timeEl && updatedAt) {
                        timeEl.textContent = new Date(updatedAt).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
                    }
                }
                break;
            }
        }
    }
    if (updatedAt !== undefined && typeof renderMiddleList === 'function') {
        renderMiddleList();
    }
}

// ===== Context Info =====

export function updateCtxFromStreamEnd(usage) {
    if (!usage) return;
    const used = usage.prompt_tokens || 0;
    window.chatCtxTokens = { used: used, total: _chatModelContextWindow };
    if (typeof updateCtxInfoDisplay === 'function') updateCtxInfoDisplay();
}

// Re-export for backward compat
export { _chatSessionId as chatSessionId, _chatCurrentAgent as chatCurrentAgent, _isSending as isSending };

// ===== Load Session History =====
// Called by pages/chat.js to load a session's message history
export async function loadSessionHistory(sessionId) {
    if (!sessionId) return;
    try {
        const resp = await fetch(`/api/sessions/${sessionId}/messages`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (typeof chatClearMessages === 'function') chatClearMessages();
        if (data.messages && Array.isArray(data.messages)) {
            for (const msg of data.messages) {
                if (msg.role === 'user') {
                    if (typeof chatAppendUserMsg === 'function') {
                        chatAppendUserMsg(msg.content || '');
                    }
                } else if (msg.role === 'assistant') {
                    if (typeof window.addMsg === 'function') {
                        window.addMsg(msg.content || '', 'assistant', msg);
                    }
                }
            }
        }
        if (typeof updateChatHeader === 'function') updateChatHeader();
    } catch (e) {
        console.error('[loadSessionHistory]', e);
    }
}
