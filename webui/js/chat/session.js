/**
 * chat/session.js — 会话管理
 * 从 core.js 拆出。处理会话创建/切换/停止/消息发送/预览更新。
 */
import {
    _chatSessionId, _chatCurrentAgent, _isSending, _chatCurrentModel,
    _chatModelContextWindow,
    setIsSending, setChatSessionId, setChatCurrentAgent,
    setChatCurrentModel, setChatModelContextWindow,
    setCurrentModel,
} from './state.js?v=1782233785732';
import { send } from '../core.js?v=1782233785732';
import { chatThinkingHide } from './thinking.js?v=1782233785732';
import { updateStreamingBadge } from './state.js?v=1782233785732';
import { _hideNewMsgIndicator } from './badge.js?v=1782233785732';

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

export function newSession(agent) {
    send({ type: 'new_session', agent: agent || 'default' });
    // expose globally for debugging / manual triggers
    if (typeof window !== 'undefined') window.newSession = newSession;
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

// ===== Context Info =====

export function updateCtxFromStreamEnd(usage) {
    if (!usage) return;
    const used = usage.prompt_tokens || 0;
    window.chatCtxTokens = { used: used, total: _chatModelContextWindow };
    if (typeof updateCtxInfoDisplay === 'function') updateCtxInfoDisplay();
}

export { _isSending as isSending };
