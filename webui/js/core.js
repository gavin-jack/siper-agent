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
import { renderFull, applyDelta } from './renderer.js?v=1782146353242';
import { appendStream, finalizeStream, handleStopped } from './chat/stream.js?v=1782146353242';
import { setConnected, getStreamState, markSessionReady, setChatSessionId, setIsSending, setIsThinking, setThinkingSteps } from './chat/state.js?v=1782146353242';
import { chatThinkingShow, chatThinkingAddToolStep, chatThinkingAddTextRow } from './chat/thinking.js?v=1782146353242';
import { renderChatPage } from './pages/chat-pages/chat.js?v=1782146353242';

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
        // Auto‑create a session as soon as WS is ready – guarantees the backend receives a `new_session`
        if (typeof window !== 'undefined' && window.newSession) {
            console.log('[SiPer] auto‑newSession() after WS open');
            window.newSession();
        }
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
    console.log('[send] outgoing message', obj);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

export function getWs() { return ws; }
export function setWs(val) { ws = val; }

// ===== Message Dispatch =====

function dispatch(msg) {
    console.log('[dispatch] incoming message', msg);
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
            // 起源：工具调用时更新思考状态
            {
                const sid = msg.session_id || '';
                const ss = getStreamState(sid);
                const steps = ss.thinkingSteps;
                // 避免重复添加同一 call_id
                const exists = steps.some(s => s.callId === msg.call_id);
                if (!exists) {
                    steps.push({
                        callId: msg.call_id || msg.tool_name,
                        toolName: msg.tool_name,
                        status: msg.status,
                        info: msg.info || {},
                    });
                    setThinkingSteps(steps);
                    setIsThinking(true);
                }
                // 实时渲染到 thinking-panel body
                chatThinkingShow();
                chatThinkingAddToolStep(
                    msg.call_id || msg.tool_name,
                    msg.tool_name,
                    msg.status || 'running',
                    msg.params || {},
                    msg.result_summary || ''
                );
            }
            break;
        case 'thinking_text':
            // 过程思考文本（DeepSeek R1 等推理模型）
            if (msg.text) {
                chatThinkingShow();
                chatThinkingAddTextRow(msg.text);
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
            // WS 重连后重置发送状态，防止 _isSending 残留导致后续消息被拦截
            if (typeof setIsSending === 'function') setIsSending(false);
            // The backend includes session_id in the connected message – treat it as session ready
            if (msg.session_id) {
                if (typeof setChatSessionId === 'function') setChatSessionId(msg.session_id);
                if (typeof markSessionReady === 'function') markSessionReady();
                // expose globally for debugging / external callers
                if (typeof window !== 'undefined') {
                    window._chatSessionId = msg.session_id;
                    window._sessionReady = true;
                    // 直接渲染右栏（不通过事件中转，避免监听器时序问题）
                    var chatContent = document.getElementById('chatContentArea');
                    if (chatContent && typeof renderChatPage === 'function') {
                        renderChatPage(chatContent);
                    }
                }
            }
            break;
        case 'session_created':
            console.log('[SiPer] new session:', msg.session_id);
            // 保存会话 ID 并标记已就绪，解除 ensureSessionReady 的等待
            if (typeof setChatSessionId === 'function') setChatSessionId(msg.session_id);
            if (typeof markSessionReady === 'function') markSessionReady();
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
export { setConnected } from './chat/state.js?v=1782146353242';
