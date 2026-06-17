// components/model-test.js — 模型验证功能
// 从 js/model-test.js 迁移

import { CAP_LABELS, CAP_ICONS } from '../utils/capabilities.js';
import { toast } from './toast.js';

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
// 优先使用传入参数，回退到 window 全局变量（事件委托场景）
export async function verifyGlobalModel(idx, settingsModelsCache, allGlobalModels, globalModelsList, toast, renderSettingsModelsList, autoSaveModels, loadAvailableModels, renderAgentModelSection) {
  // 事件委托场景：只传 idx，其他参数从 window 读取
  if (!settingsModelsCache && window.settingsModelsCache) {
    settingsModelsCache = window.settingsModelsCache;
    allGlobalModels = window.settingsModelsCache;
    globalModelsList = window.settingsModelsCache;
    renderSettingsModelsList = window.renderSettingsModelsList;
    autoSaveModels = window.autoSaveModels;
    renderAgentModelSection = window.renderAgentModelSection;
  }
  const m = settingsModelsCache ? settingsModelsCache[idx] : null;
  if (!m) return;
  if (!m.base_url || !m.api_key) {
    if (toast) toast.warning(m.name + ' 未配置 base_url 或 api_key，无法验证');
    return;
  }
  if (toast) toast.info('正在验证 ' + m.name + '...');
  m._verified = 'pending';
  if (typeof renderSettingsModelsList === 'function') renderSettingsModelsList();

  const d = await testModel(m.base_url, m.api_key, m.name, m.provider);

  if (d.success) {
    const caps = d.capabilities || [];
    const capStr = caps.length ? caps.map(c => (CAP_LABELS[c] || c)).join(' · ') : '仅基础对话';
    if (caps.length) {
      const merged = Array.from(new Set([...(m.capabilities || []), ...caps]));
      m.capabilities = merged;
      if (typeof allGlobalModels !== 'undefined') {
        const gi = allGlobalModels.findIndex(gm => gm.name === m.name);
        if (gi >= 0) allGlobalModels[gi].capabilities = merged;
      }
      if (typeof globalModelsList !== 'undefined') {
        const li = globalModelsList.findIndex(gm => gm.name === m.name);
        if (li >= 0) globalModelsList[li].capabilities = merged;
      }
      if (typeof renderSettingsModelsList === 'function') renderSettingsModelsList();
      if (typeof autoSaveModels === 'function') autoSaveModels();
      if (typeof loadAvailableModels === 'function') loadAvailableModels();
      if (typeof renderAgentModelSection === 'function' && typeof globalModelsList !== 'undefined') {
        renderAgentModelSection(globalModelsList);
      }
    }
    m._verified = true;
    m._latency = d.latency_ms;
    m._ttft = d.ttft_ms;
    m._streaming = d.streaming;
    m._json_mode = d.json_mode;
    m._context_window_tested = d.context_window_tested;
    m.ttft = d.ttft_ms;
    m.streaming = d.streaming;
    m.json_mode = d.json_mode;
    m.context_window_tested = d.context_window_tested;
    m._error = null;
    // Update context_window if tested value is available and larger than configured
    if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) {
      m.context_window = d.context_window_tested;
    }
    if (typeof renderSettingsModelsList === 'function') renderSettingsModelsList();
    // Re-save after context_window update
    if (typeof autoSaveModels === 'function') autoSaveModels();
    // Build info string
    const infoParts = [d.latency_ms + 'ms'];
    if (d.ttft_ms) infoParts.push('TTFT ' + d.ttft_ms + 'ms');
    if (d.streaming) infoParts.push('流式');
    if (d.context_window_tested) {
      const cw = d.context_window_tested >= 1000000 ? (d.context_window_tested / 1000000).toFixed(1) + 'M' : (d.context_window_tested / 1000).toFixed(0) + 'K';
      infoParts.push('ctx ' + cw);
    }
    if (toast) toast.success(m.name + ' 验证通过 (' + infoParts.join(' · ') + ') — ' + capStr, 4000);
  } else {
    m._verified = false;
    m._error = d.error || '连接失败';
    if (typeof renderSettingsModelsList === 'function') renderSettingsModelsList();
    if (toast) toast.error(m.name + ' 验证失败：' + (d.error || '连接失败'), 4000);
  }
}

// ===== Verify for Chat page =====
export async function verifyChatModel(idx, _toast) {
  // toast is imported at module level; ignore _toast param (legacy compat)
  try {
    const resp = await fetch('/api/models/global');
    const data = await resp.json();
    const models = data.models || [];
    const m = models[idx];
    if (!m) return;
    const modelName = m.name;
    if (!m.base_url || !m.api_key) {
      if (toast) toast.warning(m.name + ' 未配置 base_url 或 api_key');
      return;
    }
    if (toast) toast.info('正在验证 ' + m.name + '...');

    const card = document.querySelector('[data-model-name="' + modelName.replace(/"/g, '\\"') + '"]');
    if (card) {
      const capsEl = card.querySelector('.siper-model-caps');
      if (capsEl) capsEl.innerHTML = '<span class="js-text-xs">⏳ 正在验证模型功能</span>';
      card.style.borderColor = 'var(--color-warning)';
    }

    const d = await testModel(m.base_url, m.api_key, modelName, m.provider);

    if (d.success) {
      const caps = d.capabilities || [];
      const capStr = caps.length ? caps.join(' · ') : '仅基础对话';
      // Sync capabilities to backend
      if (caps.length && typeof window.settingsModelsCache !== 'undefined') {
        const si = window.settingsModelsCache.findIndex(gm => gm.name === modelName);
        if (si >= 0) {
          window.settingsModelsCache[si].capabilities = Array.from(new Set([...(window.settingsModelsCache[si].capabilities || []), ...caps]));
        }
      }
      // Update tested metadata on cache
      if (typeof window.settingsModelsCache !== 'undefined') {
        const mi = window.settingsModelsCache.findIndex(gm => gm.name === modelName);
        if (mi >= 0) {
          window.settingsModelsCache[mi]._ttft = d.ttft_ms;
          window.settingsModelsCache[mi]._streaming = d.streaming;
          window.settingsModelsCache[mi]._json_mode = d.json_mode;
          window.settingsModelsCache[mi]._context_window_tested = d.context_window_tested;
          window.settingsModelsCache[mi].ttft = d.ttft_ms;
          window.settingsModelsCache[mi].streaming = d.streaming;
          window.settingsModelsCache[mi].json_mode = d.json_mode;
          window.settingsModelsCache[mi].context_window_tested = d.context_window_tested;
          if (d.context_window_tested && d.context_window_tested > (window.settingsModelsCache[mi].context_window || 0)) {
            window.settingsModelsCache[mi].context_window = d.context_window_tested;
          }
        }
      }
      // Build info string
      const infoParts = [d.latency_ms + 'ms'];
      if (d.ttft_ms) infoParts.push('TTFT ' + d.ttft_ms + 'ms');
      if (d.streaming) infoParts.push('流式');
      if (d.context_window_tested) {
        const cw = d.context_window_tested >= 1000000 ? (d.context_window_tested / 1000000).toFixed(1) + 'M' : (d.context_window_tested / 1000).toFixed(0) + 'K';
        infoParts.push('ctx ' + cw);
      }
      if (toast) toast.success((d.model || modelName) + ' 验证通过 (' + infoParts.join(' · ') + ') — ' + capStr, 4000);
      if (card) {
        const capsHtml = caps.map(function(c){ return '<span class="cap-badge cap-badge-' + c + '" title="' + c + '">' + (CAP_ICONS[c] || c) + '</span>'; }).join('');
        const capsEl = card.querySelector('.siper-model-caps');
        if (capsEl) capsEl.innerHTML = capsHtml;
        else {
          const providerEl = card.querySelector('.siper-model-provider');
          if (providerEl) providerEl.insertAdjacentHTML('afterend', '<div class="siper-model-caps">' + capsHtml + '</div>');
        }
        card.style.borderColor = 'var(--color-primary)';
        card.style.boxShadow = '0 0 8px color-mix(in srgb, var(--color-primary) 30%, transparent)';
        setTimeout(function(){ card.style.borderColor = ''; card.style.boxShadow = ''; }, 2000);
      }
      // Persist to backend
      if (typeof window.autoSaveModels === 'function') window.autoSaveModels();
    } else {
      if (toast) toast.error('验证失败：' + (d.error || '连接失败'), 4000);
      if (card) card.style.borderColor = 'var(--color-danger)';
    }
  } catch(e) {
    if (toast) toast.error('验证请求失败：' + (e.message || e), 5000);
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
    if (grid) {
        if (typeof verifyChatModelFn === 'function') verifyChatModelFn(idx);
    } else {
        if (typeof verifyGlobalModelFn === 'function') verifyGlobalModelFn(idx);
    }
  });
}

// loadAvailableModels: removed (dead code, empty stub)
