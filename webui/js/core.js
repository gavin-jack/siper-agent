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
import { renderFull, applyDelta } from './renderer.js?v=1784626478121';
import { appendStream, finalizeStream, handleStopped } from './chat/stream.js?v=1784626478121';
import { setConnected, getStreamState, markSessionReady, setChatSessionId, setIsSending, setIsThinking, setThinkingSteps } from './chat/state.js?v=1784626478121';
import { chatThinkingShow, chatThinkingAddToolStep, chatThinkingAddTextRow, chatThinkingAddReasoning, chatThinkingSetClarifyPending, chatThinkingSetHeader, chatThinkingSetFooter, chatThinkingSetRound, chatThinkingSetStreamPreview } from './chat/thinking.js?v=1784626478121';
import { showToastCompat, showDialogCompat } from './utils/ws-compat.js?v=1784626478121';

let ws = null;
let _ver = 0;

// ===== WebSocket Connection =====

export function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.hostname}:${parseInt(location.port) + 1}`);
    ws.onopen = () => {
        setConnected(true);
        // 恢复上次会话（如有），否则新建
        const lastSid = localStorage.getItem('siper_last_session');
        if (lastSid) {
            const restore = () => {
                const s = window.switchSession || (window.session?.switchSession);
                if (s) s(lastSid);
            };
            setTimeout(restore, 300);
        } else {
            window.newSession?.();
        }
    };
    ws.onmessage = (e) => {
        try { dispatch(JSON.parse(e.data)); }
        catch (err) { console.error('[SiPer] parse error:', err); }
    };
    ws.onclose = () => { setConnected(false); setTimeout(connectWS, 3000); };
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
                // 只有当前会话才显示思考面板，非当前会话只更新 per-session 状态
                if (!_chatSessionId || sid === _chatSessionId) {
                    chatThinkingShow();
                    if (!document.getElementById('chatThinkingHeader')?.textContent) {
                        chatThinkingSetHeader(_chatCurrentModel || document.getElementById('chatModelBtnName')?.textContent || '');
                    }
                    const elapsedMs = msg.info?.elapsedMs;
                    const resultSummary = msg.info?.resultSummary || msg.result_summary || '';
                    chatThinkingAddToolStep(
                        msg.call_id || msg.tool_name,
                        msg.tool_name,
                        msg.status || 'running',
                        msg.params || {},
                        resultSummary,
                        elapsedMs
                    );
                }
            }
            break;
        case 'clarify_request':
            if (!_chatSessionId || msg.session_id === _chatSessionId) {
                chatThinkingSetClarifyPending(true);
            }
            break;
        case 'clarify_response':
            if (!_chatSessionId || msg.session_id === _chatSessionId) {
                chatThinkingSetClarifyPending(false);
            }
            break;
        case 'thinking_text':
            // 过程思考文本（DeepSeek R1 等推理模型）
            // thinking_text 无 session_id，只对当前会话显示
            if (msg.text && (!_chatSessionId || msg.session_id === _chatSessionId)) {
                chatThinkingShow();
                chatThinkingAddReasoning(msg.text);
            }
            break;
        case 'toast': showToastCompat(msg.data); break;
        case 'dialog': showDialogCompat(msg.data); break;
        case 'connected':
            setIsSending(false);
            if (msg.session_id) {
                setChatSessionId(msg.session_id);
                markSessionReady();
                window._chatSessionId = msg.session_id;
                window._sessionReady = true;
            }
            break;
        case 'session_created':
            setChatSessionId(msg.session_id);
            markSessionReady();
            break;
        case 'session_switched':
            if (typeof window.__onSessionSwitched === 'function') {
                window.__onSessionSwitched(msg);
            }
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
export { setConnected } from './chat/state.js?v=1784626478121';