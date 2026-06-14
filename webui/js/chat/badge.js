/**
 * chat/badge.js — 流式徽章 + 新消息指示器 + 未读标记
 * 从 core.js 拆出。
 */
import { _unreadSessions, updateStreamingBadge, reapplyAllStreamingBadges } from './state.js';

// ===== New Message Indicator =====

export function _showNewMsgIndicator() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    if (msgs.querySelector('.siper-new-msg-indicator')) return;
    const btn = document.createElement('div');
    btn.className = 'siper-new-msg-indicator';
    btn.innerHTML = '▼ 新消息';
    btn.onclick = function() {
        msgs.scrollTop = msgs.scrollHeight;
        _hideNewMsgIndicator();
    };
    msgs.appendChild(btn);
}

export function _hideNewMsgIndicator() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    const btn = msgs.querySelector('.siper-new-msg-indicator');
    if (btn) btn.remove();
}

// ===== Unread Badge =====

export function markSessionUnread(sessionId) {
    if (!sessionId) return;
    _unreadSessions.add(sessionId);
    if (typeof renderMiddleList === 'function') renderMiddleList();
}

export function clearSessionUnread(sessionId) {
    if (!sessionId) return;
    _unreadSessions.delete(sessionId);
    if (typeof renderMiddleList === 'function') renderMiddleList();
}

export function isSessionUnread(sessionId) {
    return _unreadSessions.has(sessionId);
}

// Re-export for backward compat
export { updateStreamingBadge, reapplyAllStreamingBadges };
