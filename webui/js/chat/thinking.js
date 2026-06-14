/**
 * chat/thinking.js — 思考面板
 * 从 core.js 拆出。处理思考面板的显示/隐藏/添加步骤。
 */
import { _thinkingSteps, setIsThinking } from './state.js';

export function chatThinkingShow() {
    const panel = document.getElementById('chatThinkingPanel');
    if (panel) panel.classList.add('open');
}

export function chatThinkingHide() {
    const panel = document.getElementById('chatThinkingPanel');
    if (panel) panel.classList.remove('open');
}

export function chatThinkingClear() {
    const body = document.getElementById('chatThinkingBody');
    if (body) body.innerHTML = '';
    _thinkingSteps.length = 0;
}

export function chatThinkingAddToolStep(callId, toolName, status, params, resultSummary) {
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    const existing = body.querySelector('[data-call-id="' + callId + '"]');
    if (existing) existing.remove();
    let paramStr = '';
    if (params) {
        if (toolName === 'web_search' && params.query) paramStr = params.query;
        else if (toolName === 'web_extract' && params.urls) paramStr = (Array.isArray(params.urls) ? params.urls.length : 1) + ' urls';
        else if (toolName === 'execute_code') paramStr = 'code';
        else if (toolName === 'read_file' && params.path) paramStr = params.path;
        else if (toolName === 'write_file' && params.path) paramStr = params.path;
        else if (toolName === 'patch' && params.path) paramStr = params.path;
        else if (toolName === 'skill_view' && params.name) paramStr = params.name;
        else paramStr = Object.keys(params).join(', ');
    }
    if (paramStr.length > 80) paramStr = paramStr.substring(0, 77) + '...';
    let resultStr = '';
    if (status === 'completed' && resultSummary) {
        resultStr = resultSummary;
        if (resultStr.length > 100) resultStr = resultStr.substring(0, 97) + '...';
    }
    const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⟳';
    const iconClass = status === 'completed' ? 'done' : status === 'failed' ? 'error' : 'running';
    const step = document.createElement('div');
    step.className = 'siper-thinking-step';
    step.setAttribute('data-call-id', callId);
    step.innerHTML =
        '<span class="siper-thinking-step-icon ' + iconClass + '">' + icon + '</span>' +
        '<span><span class="siper-thinking-step-name">' + chatEscapeHtml(toolName) + '</span>' +
        (paramStr ? '<span class="siper-thinking-step-params">(' + chatEscapeHtml(paramStr) + ')</span>' : '') +
        (resultStr ? '<span class="siper-thinking-step-result">' + chatEscapeHtml(resultStr) + '</span>' : '') +
        '</span>';
    body.appendChild(step);
    const steps = body.querySelectorAll('.siper-thinking-step');
    if (steps.length > 6) steps[0].remove();
    // Track in _thinkingSteps for cross-session persistence
    const existingIdx = _thinkingSteps.findIndex(s => s.type === 'tool' && s.callId === callId);
    const entry = { type: 'tool', callId, toolName, status, params: paramStr, resultSummary: resultStr };
    if (existingIdx >= 0) _thinkingSteps[existingIdx] = entry;
    else _thinkingSteps.push(entry);
}

export function chatThinkingAddTextRow(text) {
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    const prev = body.querySelector('.siper-thinking-text-row');
    if (prev) prev.remove();
    const row = document.createElement('div');
    row.className = 'siper-thinking-text-row';
    row.textContent = text;
    body.appendChild(row);
    const existingIdx = _thinkingSteps.findIndex(s => s.type === 'text');
    if (existingIdx >= 0) _thinkingSteps[existingIdx] = { type: 'text', text };
    else _thinkingSteps.push({ type: 'text', text });
}

// 需要 escapeHtml — 从 message.js 导入会有循环依赖，改用内联
function chatEscapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export { chatEscapeHtml as chatEscapeHtml_thinking };
