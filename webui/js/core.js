/**
 * core.js — 前端核心：WS 连接 + 消息分发
 *
 * 职责：
 *   维护 WebSocket 连接 + 自动重连
 *   接收后端消息 → 分发到对应模块
 *   发送用户操作到后端
 *
 * 所有状态变量 → chat/state.js
 *   流式处理 → chat/stream.js
 *   思考面板 → chat/thinking.js
 *   徽章/指示器 → chat/badge.js
 *   页面导航 → chat/nav.js
 *   会话管理 → chat/session.js
 */
import { renderFull, applyDelta } from './renderer.js';
import { appendStream, finalizeStream, handleStopped } from './chat/stream.js';
import { setConnected } from './chat/state.js';

let ws = null;
let _ver = 0;

// ===== WebSocket Connection =====

export function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = parseInt(location.port) + 1;
    ws = new WebSocket(`${proto}//${location.hostname}:${wsPort}`);

    ws.onopen = () => {
        console.log('[SiPer] WS connected');
        setConnected(true);
    };

    ws.onmessage = (e) => {
        try {
            dispatch(JSON.parse(e.data));
        } catch (err) {
            console.error('[SiPer] parse error:', err);
        }
    };

    ws.onclose = () => {
        console.warn('[SiPer] WS closed, reconnect in 3s...');
        setConnected(false);
        setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
        // onclose will fire after this
    };
}

// ===== Send =====

export function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

export function getWs() { return ws; }
export function setWs(val) { ws = val; }

// ===== Message Dispatch =====

function dispatch(msg) {
    switch (msg.type) {
        case 'state_full':
            _ver = msg.version;
            renderFull(msg.data);
            break;
        case 'state_delta':
            _ver = msg.version;
            applyDelta(msg.changes);
            break;
        case 'state_deltas':
            _ver = msg.to_version;
            applyDelta(msg.changes);
            break;
        case 'stream_delta':
            appendStream(msg.delta, msg.session_id);
            break;
        case 'stream_end':
            finalizeStream(msg.data, msg.session_id);
            break;
        case 'tool_progress':
            if (typeof window.__onToolProgress === 'function') {
                window.__onToolProgress(msg);
            }
            break;
        case 'toast':
            if (typeof window.showToast === 'function') {
                window.showToast(msg.data);
            } else if (typeof window.toast === 'function') {
                const d = msg.data;
                window.toast(d.message || d.type || '', d.type || 'info');
            }
            break;
        case 'dialog':
            if (typeof window.showDialog === 'function') {
                window.showDialog(msg.data);
            } else if (typeof window.showConfirm === 'function' && msg.data?.type === 'confirm') {
                window.showConfirm(msg.data.title, msg.data.message, msg.data.onConfirm);
            }
            break;
        case 'connected':
            console.log('[SiPer] server connected:', msg.connection_id);
            break;
        case 'session_created':
            console.log('[SiPer] new session:', msg.session_id);
            break;
        case 'stopped':
            handleStopped();
            break;
        case 'error':
            console.error('[SiPer] server error:', msg.message);
            break;
        default:
            // 兼容旧消息类型，不告警
            break;
    }
}

// Re-export from state.js for app.js backward compat
export { setConnected } from './chat/state.js';
