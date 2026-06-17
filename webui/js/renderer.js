/**
 * renderer.js — 统一 DOM 渲染
 *
 * 职责：
 *   renderFull(snapshot) — 全量快照 → 完整页面
 *   applyDelta(changes) — 增量更新 → 精确 DOM 操作
 *   registerAllHandlers() — 注册所有路径处理器
 *
 * 设计：
 *   路径 → 处理函数映射（精确匹配 + 前缀匹配）
 *   page_cache 更新由页面级 renderer 处理
 */

// ===== 路径 → 处理函数映射 =====
const _handlers = {};

export function register(path, fn) {
    _handlers[path] = fn;
}

// ===== 全量快照渲染 =====
export function renderFull(s) {
    if (!s) return;
    // 按依赖顺序渲染（父状态先于子状态）
    const order = [
        'current_page', 'sidebar_expanded', 'sidebar_search',
        'active_session_id', 'chat_header_name',
        'is_streaming', 'stream_text', 'is_thinking', 'thinking_text',
        'is_sending', 'sessions', 'messages', 'agents', 'expanded_agents',
        'thinking_steps', 'toasts', 'dialog',
    ];
    for (const key of order) {
        if (s[key] !== undefined && _handlers[key]) {
            _handlers[key](s[key]);
        }
    }
}

// ===== 增量更新 =====
export function applyDelta(changes) {
    if (!changes || !Array.isArray(changes)) return;
    for (const c of changes) {
        if (c.op === 'replace') {
            // 精确匹配
            if (_handlers[c.path]) {
                _handlers[c.path](c.value);
                continue;
            }
            // 前缀匹配（如 sessions[0].last_message → sessions）
            const prefix = c.path.replace(/\[\d+\].*/, '');
            if (_handlers[prefix]) {
                _handlers[prefix](c.value);
                continue;
            }
            // page_cache 更新
            if (c.path.startsWith('page_cache.')) {
                if (typeof window.__onPageCacheUpdate === 'function') {
                    window.__onPageCacheUpdate(c.path.slice(11), c.value);
                }
                continue;
            }
            // 未注册的路径，静默忽略
        } else if (c.op === 'insert') {
            if (typeof window.__onListInsert === 'function') {
                window.__onListInsert(c.path, c.index, c.value);
            }
        } else if (c.op === 'remove') {
            if (typeof window.__onListRemove === 'function') {
                window.__onListRemove(c.path, c.index);
            }
        } else if (c.op === 'move') {
            if (typeof window.__onListMove === 'function') {
                window.__onListMove(c.path, c.from, c.to);
            }
        }
    }
}

// 导出给 core.js 使用
export { _handlers };

// ===== Message rendering (migrated from dom.js) =====

import { escapeHtml } from './utils/escape.js';

/**
 * Add a message bubble to the chat.
 * Legacy wrapper — delegates to chatAddMessage if available.
 */
export function addMsg(content, role, meta) {
    if (typeof window.chatAddMessage === 'function') {
        window.chatAddMessage(content, role || 'assistant', meta);
    }
}

/**
 * Append metadata to a message container.
 * Legacy no-op — meta rendering is now handled by chatAddMessage.
 */
export function appendMeta(container, meta, messageId) {
    // No-op: meta rendering handled by chatAddMessage
}

/**
 * Syntax highlight for debug JSON display.
 */
export function debugHighlight(json) {
    try {
        return escapeHtml(JSON.stringify(json, null, 2));
    } catch (e) {
        return escapeHtml(String(json));
    }
}

// ===== 注册所有路径处理器 =====

export function registerAllHandlers() {
    register('current_page', (v) => {
        if (typeof window.siPerNavigate === 'function') {
            window.siPerNavigate(v, true);
        }
    });

    register('sidebar_expanded', (v) => {
        const sidebar = document.getElementById('chatSidebar');
        if (sidebar) {
            sidebar.classList.toggle('expanded', !!v);
            sidebar.classList.toggle('collapsed', !v);
        }
    });

    register('sidebar_search', (v) => {
        const inp = document.getElementById('chatSidebarSearch');
        if (inp) inp.value = v || '';
    });

    register('active_session_id', (v) => {
        // 高亮当前会话
        const items = document.querySelectorAll('.siper-session-item');
        for (const item of items) {
            item.classList.toggle('active', item.dataset.sessionId === v);
        }
    });

    register('is_streaming', (v) => {
        // 流式状态由 stream.js 处理
    });

    register('stream_text', (v) => {
        // 流式文本由 stream.js 处理
    });

    register('is_thinking', (v) => {
        if (v) {
            const panel = document.getElementById('chatThinkingPanel');
            if (panel) panel.classList.add('open');
        } else {
            const panel = document.getElementById('chatThinkingPanel');
            if (panel) panel.classList.remove('open');
        }
    });

    register('thinking_text', (v) => {
        if (v) {
            const body = document.getElementById('chatThinkingBody');
            if (body) {
                const prev = body.querySelector('.siper-thinking-text-row');
                if (prev) prev.remove();
                const row = document.createElement('div');
                row.className = 'siper-thinking-text-row';
                row.textContent = v;
                body.appendChild(row);
            }
        }
    });

    register('is_sending', (v) => {
        const sb = document.getElementById('chatSendBtn');
        if (sb) sb.disabled = !!v;
        const stb = document.getElementById('chatStopBtn');
        if (stb) stb.classList.toggle('hidden', !v);
    });

    register('sessions', (v) => {
        // 中栏容器存在时才渲染（避免 renderFull 早于 initChatPage 时无效重建）
        if (document.getElementById('chatMiddleList') && typeof window.renderMiddleList === 'function') {
            window.renderMiddleList();
        }
    });

    register('messages', (v) => {
        // 消息容器存在时才渲染
        if (document.getElementById('chatMessages') && typeof window.renderChatMessages === 'function') {
            window.renderChatMessages(v);
        }
    });

    register('agents', (v) => {
        if (typeof window.renderAgentList === 'function') {
            window.renderAgentList(v);
        }
    });

    register('thinking_steps', (v) => {
        if (v && v.length > 0) {
            const panel = document.getElementById('chatThinkingPanel');
            if (panel) panel.classList.add('open');
        }
    });

    register('toasts', (v) => {
        if (v && v.length > 0) {
            const t = v[v.length - 1];
            if (typeof window.showToast === 'function') {
                window.showToast(t);
            } else if (typeof window.toast === 'function') {
                window.toast(t.message || '', t.type || 'info');
            }
        }
    });

    register('dialog', (v) => {
        if (!v) return;
        if (typeof window.showDialog === 'function') {
            window.showDialog(v);
        } else if (typeof window.showConfirm === 'function' && v.type === 'confirm') {
            if (typeof v.title === 'object' && v.title !== null) {
                window.showConfirm(v.title);
            } else {
                window.showConfirm({ title: v.title || '确认', msg: v.message || '', onConfirm: v.onConfirm });
            }
        }
    });

    // page_cache 更新 → 通知所有页面
    register('page_cache', (v) => {
        if (typeof window.__onPageCacheUpdate === 'function' && v) {
            for (const [page, data] of Object.entries(v)) {
                window.__onPageCacheUpdate(page, data);
            }
        }
    });
}
