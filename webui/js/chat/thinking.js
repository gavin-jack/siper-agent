/**
 * chat/thinking.js — 思考面板
 * 从 core.js 拆出。处理思考面板的显示/隐藏/添加步骤。
 */
import { _thinkingSteps, setIsThinking } from './state.js?v=1784626478121';
import { escapeHtml } from '../utils/escape.js?v=1784626478121';

// ===== 面板元状态 =====
let _thinkingStartTime = null;
let _thinkingTimerInterval = null;
let _thinkingCurrentModel = '';
let _thinkingCurrentRound = 0;
let _thinkingTokenUsage = null;
let _thinkingClarifyPending = false;

export function chatThinkingShow() {
    const panel = document.getElementById('chatThinkingPanel');
    if (!panel) return;
    const header = document.getElementById('chatRightHeader');
    if (header) panel.style.top = header.offsetHeight + 'px';
    panel.classList.add('open');
    _startThinkingTimer();
}

export function chatThinkingHide() {
    const panel = document.getElementById('chatThinkingPanel');
    if (panel) panel.classList.remove('open');
    _stopThinkingTimer();
}

export function chatThinkingClear() {
    const body = document.getElementById('chatThinkingBody');
    if (body) body.innerHTML = '';
    _thinkingSteps.length = 0;
    _thinkingCurrentRound = 0;
    _thinkingTokenUsage = null;
    _thinkingClarifyPending = false;
    _clearThinkingHeader();
    _clearThinkingFooter();
    _stopThinkingTimer();
}

// ===== 面板头部（模型名 + 总耗时） =====
function _clearThinkingHeader() {
    const header = document.getElementById('chatThinkingHeader');
    if (header) header.innerHTML = '';
}

export function chatThinkingSetHeader(model) {
    if (!model) return;
    _thinkingCurrentModel = model;
    const header = document.getElementById('chatThinkingHeader');
    if (!header) return;
    header.innerHTML = '<span class="siper-thinking-header-model">' + escapeHtml(model) + '</span><span class="siper-thinking-header-timer">0s</span>';
    _thinkingStartTime = Date.now();
    _startThinkingTimer();
}

function _startThinkingTimer() {
    if (_thinkingTimerInterval) return;
    _thinkingTimerInterval = setInterval(() => {
        const header = document.getElementById('chatThinkingHeader');
        if (!header) return;
        const timerEl = header.querySelector('.siper-thinking-header-timer');
        if (timerEl && _thinkingStartTime) {
            const elapsed = ((Date.now() - _thinkingStartTime) / 1000).toFixed(0);
            timerEl.textContent = elapsed + 's';
        }
    }, 1000);
}

function _stopThinkingTimer() {
    if (_thinkingTimerInterval) {
        clearInterval(_thinkingTimerInterval);
        _thinkingTimerInterval = null;
    }
}

// ===== 面板底部（Token 用量） =====
function _clearThinkingFooter() {
    const footer = document.getElementById('chatThinkingFooter');
    if (footer) footer.innerHTML = '';
}

export function chatThinkingSetFooter(usage) {
    if (!usage) return;
    const prompt = usage.prompt_tokens || 0;
    const completion = usage.completion_tokens || 0;
    const total = usage.total_tokens || (prompt + completion);
    if (total === 0 && prompt === 0 && completion === 0) return;
    _thinkingTokenUsage = usage;
    const footer = document.getElementById('chatThinkingFooter');
    if (!footer) return;
    footer.innerHTML = '<span class="siper-thinking-footer-token">in: ' + _formatTokens(prompt) + ' / out: ' + _formatTokens(completion) + '</span>';
}

function _formatTokens(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

// ===== 轮次计数 =====
export function chatThinkingSetRound(round) {
    _thinkingCurrentRound = round;
    const header = document.getElementById('chatThinkingHeader');
    if (!header) return;
    const roundEl = header.querySelector('.siper-thinking-header-round');
    if (roundEl) {
        roundEl.textContent = '第 ' + round + ' 轮';
    } else {
        const span = document.createElement('span');
        span.className = 'siper-thinking-header-round';
        span.textContent = '第 ' + round + ' 轮';
        header.appendChild(span);
    }
}

// ===== 工具步骤（增强版） =====
export function chatThinkingAddToolStep(callId, toolName, status, params, resultSummary, elapsedMs) {
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    const existing = body.querySelector('[data-call-id="' + callId + '"]');
    if (existing) existing.remove();
    let paramStr = '';
    if (params) {
        if (toolName === 'web_search' && params.query) paramStr = params.query;
        else if (toolName === 'web_extract' && params.urls) paramStr = (Array.isArray(params.urls) ? params.urls.length : 1) + ' urls';
        else if (toolName === 'execute_command' && params.command) paramStr = params.command.substring(0, 60);
        else if (toolName === 'list_dir' && params.path) paramStr = params.path;
        else if (toolName === 'read_file' && params.path) paramStr = params.path;
    }
    const stepEl = document.createElement('div');
    stepEl.className = 'siper-thinking-step';
    stepEl.dataset.callId = callId;
    const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⟳';
    const elapsedStr = elapsedMs != null ? ' <span class="siper-step-time">' + elapsedMs + 'ms</span>' : '';
    stepEl.innerHTML = '<span class="siper-step-icon">' + icon + '</span><span class="siper-step-name">' + escapeHtml(toolName) + '</span>' + elapsedStr + (paramStr ? '<span class="siper-step-params">' + escapeHtml(paramStr) + '</span>' : '');
    if (resultSummary) {
        const resultEl = document.createElement('div');
        resultEl.className = 'siper-step-result';
        resultEl.textContent = resultSummary.substring(0, 100);
        if (resultSummary.length > 100) {
            resultEl.classList.add('siper-step-result-expand');
            resultEl.title = '点击展开';
            resultEl.addEventListener('click', () => {
                if (resultEl.classList.contains('expanded')) {
                    resultEl.textContent = resultSummary.substring(0, 100);
                    resultEl.classList.remove('expanded');
                } else {
                    resultEl.textContent = resultSummary;
                    resultEl.classList.add('expanded');
                }
            });
        }
        stepEl.appendChild(resultEl);
    }
    if (status === 'failed') {
        stepEl.classList.add('siper-step-error');
    }
    body.appendChild(stepEl);
    body.scrollTop = body.scrollHeight;
}

// ===== 文本行 =====
export function chatThinkingAddTextRow(text) {
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    const row = document.createElement('div');
    row.className = 'siper-thinking-text-row';
    row.textContent = text;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
}

// ===== 推理过程（折叠块） =====
export function chatThinkingAddReasoning(text) {
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    let block = body.querySelector('.siper-reasoning-block');
    if (!block) {
        block = document.createElement('div');
        block.className = 'siper-reasoning-block';
        block.innerHTML = '<div class="siper-reasoning-header">💭 推理过程</div><div class="siper-reasoning-body"></div>';
        block.querySelector('.siper-reasoning-header').addEventListener('click', () => {
            block.classList.toggle('collapsed');
        });
        body.appendChild(block);
    }
    const reasoningBody = block.querySelector('.siper-reasoning-body');
    const line = document.createElement('div');
    line.className = 'siper-reasoning-line';
    line.textContent = text;
    reasoningBody.appendChild(line);
}

// ===== 流式预览 =====
export function chatThinkingSetStreamPreview(text) {
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    let preview = body.querySelector('.siper-stream-preview');
    if (!preview) {
        preview = document.createElement('div');
        preview.className = 'siper-stream-preview';
        body.appendChild(preview);
    }
    preview.textContent = text;
}

// ===== Clarify 等待状态 =====
export function chatThinkingSetClarifyPending(pending) {
    _thinkingClarifyPending = pending;
    const body = document.getElementById('chatThinkingBody');
    if (!body) return;
    let indicator = body.querySelector('.siper-clarify-indicator');
    if (pending) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'siper-clarify-indicator';
            indicator.textContent = '⏳ 等待用户回答...';
            body.appendChild(indicator);
        }
    } else if (indicator) {
        indicator.remove();
    }
}