/**
 * chat/badge.js — 流式徽章 + 新消息指示器 + 未读标记
 * 从 core.js 拆出。
 */
import { _unreadSessions } from './state.js?v=1783954506464';

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

// ===== Unread Badge (未读标记功能已移至 sidebar.js) =====
// markSessionUnread / clearSessionUnread / isSessionUnread 定义在 chat/sidebar.js