// components/model-test.js — 模型验证功能
// 从 js/model-test.js 迁移

import { CAP_LABELS, CAP_ICONS } from '../utils/capabilities.js?v=1783614889239';
import { toast } from './toast.js?v=1783614889239';

// ===== 辅助函数 =====

const CW_LABEL = cw => cw >= 1e6 ? (cw / 1e6).toFixed(1) + 'M' : (cw / 1000).toFixed(0) + 'K';

function _infoParts(d) {
    const p = [d.latency_ms + 'ms'];
    if (d.ttft_ms) p.push('TTFT ' + d.ttft_ms + 'ms');
    if (d.streaming) p.push('流式');
    if (d.context_window_tested) p.push('ctx ' + CW_LABEL(d.context_window_tested));
    return p;
}

function _syncCaps(m, caps) {
    if (!caps.length) return;
    const merged = Array.from(new Set([...(m.capabilities || []), ...caps]));
    m.capabilities = merged;
    const gi = window.settingsModelsCache?.findIndex(gm => gm.name === m.name);
    if (gi >= 0) window.settingsModelsCache[gi].capabilities = merged;
}

function _syncMeta(m, d) {
    m._ttft = m.ttft = d.ttft_ms;
    m._streaming = m.streaming = d.streaming;
    m._json_mode = m.json_mode = d.json_mode;
    m._context_window_tested = m.context_window_tested = d.context_window_tested;
    m._latency = d.latency_ms;
    if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) {
        m.context_window = d.context_window_tested;
    }
}

// ===== Core: call backend test API =====
export async function testModel(baseUrl, apiKey, modelName, providerId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
        const r = await fetch('/api/models/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, model: modelName, provider_id: providerId || 0 }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!r.ok) return { success: false, error: 'HTTP ' + r.status };
        return await r.json();
    } catch(e) {
        clearTimeout(timer);
        return { success: false, error: e.message || e.name };
    }
}

// ===== Verify for Global Settings page =====
export async function verifyGlobalModel(idx, settingsModelsCache, allGlobalModels, globalModelsList, toast, renderSettingsModelsList, autoSaveModels, loadAvailableModels, renderAgentModelSection) {
    if (!settingsModelsCache && window.settingsModelsCache) {
        settingsModelsCache = allGlobalModels = globalModelsList = window.settingsModelsCache;
        renderSettingsModelsList = window.renderSettingsModelsList;
        autoSaveModels = window.autoSaveModels;
        renderAgentModelSection = window.renderAgentModelSection;
    }
    const m = settingsModelsCache?.[idx];
    if (!m?.base_url || !m?.api_key) {
        toast?.warning(m.name + ' 未配置 base_url 或 api_key，无法验证');
        return;
    }
    toast?.info('正在验证 ' + m.name + '...');
    m._verified = 'pending';
    renderSettingsModelsList?.();

    const d = await testModel(m.base_url, m.api_key, m.name, m.provider);
    const caps = d.capabilities || [];
    const capStr = caps.length ? caps.map(c => CAP_LABELS[c] || c).join(' · ') : '仅基础对话';

    if (d.success) {
        _syncCaps(m, caps);
        _syncMeta(m, d);
        m._verified = true;
        m._error = null;
        renderSettingsModelsList?.();
        autoSaveModels?.();
        loadAvailableModels?.();
        renderAgentModelSection?.(globalModelsList);
        toast?.success(m.name + ' 验证通过 (' + _infoParts(d).join(' · ') + ') — ' + capStr, 4000);
    } else {
        m._verified = false;
        m._error = d.error || '连接失败';
        renderSettingsModelsList?.();
        toast?.error(m.name + ' 验证失败：' + (d.error || '连接失败'), 4000);
    }
}

// ===== Verify for Chat page =====
export async function verifyChatModel(idx) {
    const resp = await fetch('/api/models/global');
    const models = (await resp.json()).models || [];
    const m = models[idx];
    if (!m?.base_url || !m.api_key) {
        toast.warning?.(m.name + ' 未配置 base_url 或 api_key');
        return;
    }
    toast.info('正在验证 ' + m.name + '...');
    const modelName = m.name;
    const card = document.querySelector(`[data-model-name="${modelName.replace(/"/g, '\\"')}"]`);
    if (card) {
        const capsEl = card.querySelector('.siper-model-caps');
        if (capsEl) capsEl.innerHTML = '<span class="js-text-xs">⏳ 正在验证模型功能</span>';
        card.style.borderColor = 'var(--color-warning)';
    }

    const d = await testModel(m.base_url, m.api_key, modelName, m.provider);
    const caps = d.capabilities || [];
    const capStr = caps.length ? caps.join(' · ') : '仅基础对话';

    if (d.success) {
        _syncCaps(m, caps);
        _syncMeta(m, d);
        toast.success((d.model || modelName) + ' 验证通过 (' + _infoParts(d).join(' · ') + ') — ' + capStr, 4000);
        if (card) {
            const html = caps.map(c => `<span class="cap-badge cap-badge-${c}" title="${c}">${CAP_ICONS[c] || c}</span>`).join('');
            const el = card.querySelector('.siper-model-caps');
            if (el) el.innerHTML = html;
            else card.querySelector('.siper-model-provider')?.insertAdjacentHTML('afterend', `<div class="siper-model-caps">${html}</div>`);
            card.style.borderColor = 'var(--color-primary)';
            card.style.boxShadow = '0 0 8px color-mix(in srgb, var(--color-primary) 30%, transparent)';
            setTimeout(() => { card.style.borderColor = ''; card.style.boxShadow = ''; }, 2000);
        }
        window.autoSaveModels?.();
    } else {
        toast.error('验证失败：' + (d.error || '连接失败'), 4000);
        if (card) card.style.borderColor = 'var(--color-danger)';
    }
}

// ===== Event Delegation =====
export function initModelTestDelegation(verifyChatModelFn, verifyGlobalModelFn) {
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.btn-verify');
        if (!btn || btn.dataset.idx === undefined) return;
        e.preventDefault();
        var idx = parseInt(btn.dataset.idx);
        var grid = btn.closest('.siper-models-grid');
        if (grid) verifyChatModelFn?.(idx);
        else verifyGlobalModelFn?.(idx);
    });
}