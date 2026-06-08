// pages/settings.js — 全局设置
// 从 pages/page-settings.js 迁移

import { t } from '../utils/i18n.js';
import { escapeHtml } from '../utils/escape.js';
import { confirmDeleteModel, showConfirm } from '../components/toast.js';
import { toast } from '../components/toast.js';
import { CAP_ICONS, CAP_LABELS, CAP_ORDER, renderCapBadges } from '../utils/capabilities.js';

// ===== Global Settings =====
export let settingsCache = null;
export let settingsModelsCache = [];  // models list for settings modal
export let discoveredModelsCache = []; // models discovered from provider

// ===== Models Management =====

export async function loadSettingsModels() {
  try {
    const r = await fetch('/api/models/global');
    const d = await r.json();
    settingsModelsCache = (d.models || []).map(m => ({
      ...m,
      // Normalize: ensure both _prefix and non-prefix fields exist
      _ttft: m.ttft ?? m._ttft ?? null,
      _streaming: m.streaming ?? m._streaming ?? null,
      _context_window_tested: m.context_window_tested ?? m._context_window_tested ?? null,
      _json_mode: m.json_mode ?? m._json_mode ?? null,
      ttft: m.ttft ?? m._ttft ?? null,
      streaming: m.streaming ?? m._streaming ?? null,
      context_window_tested: m.context_window_tested ?? m._context_window_tested ?? null,
      json_mode: m.json_mode ?? m._json_mode ?? null,
    }));
    // Sync to window for event delegation verifyGlobalModel fallback
    window.settingsModelsCache = settingsModelsCache;
    // Mark default
    const def = d.default_model || '';
    settingsModelsCache.forEach(m => { m._isDefault = (m.name === def); });
    renderSettingsModelsList();
  } catch(e) {
    console.error('loadSettingsModels error:', e);
    document.getElementById('chatSettingsModelsList').innerHTML = '<div class="settings-empty-msg">加载失败</div>';
  }
}

export function renderSettingsModelsList() {
  const list = document.getElementById('chatSettingsModelsList') || document.getElementById('settingsModelsList');
  if (!settingsModelsCache || settingsModelsCache.length === 0) {
    list.innerHTML = '<div class="settings-empty-msg">' + t('settings.addModel') + '</div>';
    return;
  }
  const cards = settingsModelsCache.map((m, i) => {
    const alias = m.alias ? ` (${m.alias})` : '';
    const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window/1000000).toFixed(1)+'M' : (m.context_window/1000).toFixed(0)+'K') : '-';
    const capBadges = renderCapBadges(m.capabilities, CAP_ICONS, true);
    const ctxTested = m.context_window_tested ? (m.context_window_tested >= 1000000 ? (m.context_window_tested/1000000).toFixed(1)+'M' : (m.context_window_tested/1000).toFixed(0)+'K') : '';
    const ttft = m.ttft ? 'TTFT ' + m.ttft + 'ms' : '';
    const streaming = m.streaming ? '⚡流式' : '';
    const jsonMode = m.json_mode === true ? '📋JSON模式' : '';
    const metaTags = [ctxTested, ttft, streaming, jsonMode].filter(Boolean).map(t => '<span class="siper-meta-tag">' + t + '</span>').join('');
    const verifyIcon = m._verified === true ? '<span class="model-verify-icon model-verify-pass" title="验证通过' + (m._latency ? ' (' + m._latency + 'ms)' : '') + (m.ttft ? ', TTFT ' + m.ttft + 'ms' : '') + '">✅</span>' :
                         m._verified === false ? '<span class="model-verify-icon model-verify-fail" title="验证失败' + (m._error ? ': ' + escapeHtml(m._error) : '') + '">❌</span>' :
                         m._verified === "pending" ? '<span class="model-verify-icon model-verify-pending" title="正在检测模型能力...">⏳</span>' :
                         '';
    const verifyBtnHtml = m._verified === "pending"
      ? `<button class="btn-sm btn-sm-disabled" disabled title="检测中...">⏳</button>`
      : `<button class="btn-sm btn-verify" data-idx="${i}" title="验证可用性">🔍</button>`;
    return `
    <div class="model-card card-left-accent${m._verified === 'pending' ? ' model-card-verifying' : ''}">
      <div class="model-card-header">
        <div class="model-name-scroll">
          <span class="model-name-text" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
        </div>
        <button class="btn-sm btn-copy-model" onclick="copyModelName(event,${JSON.stringify(m.name)})" title="复制模型名称">📋</button>
      </div>
      <div class="model-card-provider">${alias ? escapeHtml(alias) : escapeHtml(m.provider || '')}</div>
      <div class="siper-model-meta">${metaTags}</div>
      ${m._verified === "pending" ? `<div class="model-card-pending"><span class="pulse">⏳</span> 正在更新模型能力...</div>` : (m._verified === false && m._error ? `<div class="model-card-error" style="font-size:11px;color:var(--color-danger);margin-top:2px;">❌ ${escapeHtml(m._error)}</div>` : (capBadges ? `<div class="model-card-caps">${capBadges}</div>` : ''))}
      <div class="model-card-actions">
        ${verifyBtnHtml}
        <button class="btn-sm danger" onclick="removeSettingsModel(${i})">✕</button>
      </div>
    </div>`;
  }).join('');
  list.innerHTML = `<div class="models-grid">${cards}</div>`;
  // Enable scroll animation for overflowing model names
  requestAnimationFrame(() => {
    list.querySelectorAll('.model-name-scroll').forEach(el => {
      const text = el.querySelector('.model-name-text');
      if (text && text.scrollWidth > el.clientWidth) {
        el.classList.add('model-name-scrollable');
        text.style.setProperty('--scroll-distance', (el.clientWidth - text.scrollWidth) + 'px');
      }
    });
  });
}

export function removeSettingsModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  confirmDeleteModel(m.name, () => {
    settingsModelsCache.splice(idx, 1);
    renderSettingsModelsList();
    autoSaveModels();
    if (toast) window.toast.success('已删除模型: ' + m.name, 1500);
  });
}

// verifyModel 已迁移到 model-test.js

// ===== Model Discovery (Auto-detect) =====

export async function discoverModels() {
  const baseUrl = document.getElementById('discoverBaseUrl').value.trim();
  const apiKey = document.getElementById('discoverApiKey').value.trim();
  if (!baseUrl) { if (toast) window.toast.warning(t('toast.enterBaseUrl')); return; }
  if (!apiKey) { if (toast) window.toast.warning(t('toast.enterApiKey')); return; }

  const resultEl = document.getElementById('discoverResult');
  const btn = document.getElementById('discoverBtn');
  btn.disabled = true;
  btn.textContent = '获取中...';
  resultEl.innerHTML = '<div class="settings-empty-msg">⏳ 正在获取模型列表...</div>';

  try {
    const r = await fetch('/api/models/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
    });
    const d = await r.json();
    if (d.success && d.models && d.models.length > 0) {
      discoveredModelsCache = d.models;
      renderDiscoveredModels(discoveredModelsCache, d.provider, d.count);
    } else if (d.success && d.models && d.models.length === 0) {
      resultEl.innerHTML = '<div class="settings-empty-msg">未找到可用模型</div>';
    } else {
      resultEl.innerHTML = `<div class="settings-empty-msg settings-empty-err">❌ ${escapeHtml(d.error || '获取失败')}</div>`;
    }
  } catch(e) {
    resultEl.innerHTML = `<div class="settings-empty-msg settings-empty-err">❌ ${escapeHtml(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 获取模型列表';
  }
}


export function renderDiscoveredModels(models, provider, count) {
  const resultEl = document.getElementById('discoverResult');
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
  const capColors = { vision: '#7c3aed', reasoning: '#059669', code: '#2563eb', chat: '#6b7280', tts: '#d97706', embedding: '#6366f1', image_gen: '#ec4899', long_context: '#0891b2', function_calling: '#f59e0b' };
  const capLabels = { vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文', function_calling: '工具调用' };
  const capOrder = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };
  resultEl.innerHTML = `
    <div class="discover-result-header">
      ✅ 发现 <strong class="discover-count">${count}</strong> 个模型 · Provider: <strong>${escapeHtml(provider || '-')}</strong>
      <span class="discover-header-actions">
        <button class="btn-sm btn-discover-add-one" onclick="addDiscoveredModel(0)">添加模型</button>
        <button class="btn-sm primary btn-discover-add-all" onclick="addAllDiscoveredModels()">全部添加</button>
      </span>
    </div>
    ${models.map((m, i) => {
      const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window/1000000).toFixed(1)+'M' : (m.context_window/1000).toFixed(0)+'K') : '-';
      const caps = (m.capabilities || []).slice().sort((a, b) => (capOrder[a] ?? 50) - (capOrder[b] ?? 50));
      const capBadges = caps.map(c => `<span class="cap-badge" title="${capLabels[c] || c}">${capIcons[c] || c}</span>`).join('');
      return `
      <div class="model-card model-card-discover">
        <div class="model-discover-info">
          <div class="model-discover-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name.length > 22 ? m.name.substring(0, 20) + '..' : m.name)}</div>
          <div class="model-discover-meta">${escapeHtml(m.provider || '')} · ctx:${ctx} · ${escapeHtml(m.base_url || '')}</div>
          ${capBadges ? `<div class="model-card-caps">${capBadges}</div>` : ''}
        </div>
        <button class="btn-sm primary btn-discover-add" onclick="addDiscoveredModel(${i})">添加</button>
      </div>`;
    }).join('')}
  `;
}

export function addDiscoveredModel(idx) {
  const m = discoveredModelsCache[idx];
  if (!m) return;
  // Check duplicate
  if (settingsModelsCache.find(x => x.name === m.name && x.provider === m.provider)) {
if (toast) window.toast.warning(t('toast.modelExists') + ': ' + m.name);
    return;
  }
  doAddDiscoveredModel(idx);
}

export function doAddDiscoveredModel(idx) {
  const m = discoveredModelsCache[idx];
  if (!m) return;
  settingsModelsCache.push({
    id: m.id || m.name,
    name: m.name,
    alias: m.alias || '',
    provider: m.provider,
    base_url: m.base_url,
    api_key: m.api_key,
    context_window: m.context_window,
    capabilities: m.capabilities || [],
  });
  // First model auto-set as default (no "use global default" concept for global settings)
  if (settingsModelsCache.length === 1) {
    settingsModelsCache[0]._isDefault = true;
    if (settingsCache) settingsCache.default_model = settingsModelsCache[0].name;
  }
  renderSettingsModelsList();
  autoSaveModels();
}

export function addAllDiscoveredModels() {
  let added = 0;
  discoveredModelsCache.forEach(m => {
    if (settingsModelsCache.find(x => x.name === m.name && x.provider === m.provider)) return;
    settingsModelsCache.push({
      id: m.id || m.name,
      name: m.name,
      alias: m.alias || '',
      provider: m.provider,
      base_url: m.base_url,
      api_key: m.api_key,
      context_window: m.context_window,
      capabilities: m.capabilities || [],
    });
    added++;
  });
  // First model auto-set as default (no "use global default" concept for global settings)
  if (settingsModelsCache.length > 0 && !settingsModelsCache.find(m => m._isDefault)) {
    settingsModelsCache[0]._isDefault = true;
    if (settingsCache) settingsCache.default_model = settingsModelsCache[0].name;
  }
  renderSettingsModelsList();
  autoSaveModels();
  if (toast) window.toast.success('已添加 ' + added + ' 个模型');
}

// ===== Manual Add Model =====

// ===== Auto Save =====

export let _autoSaveTimer = null;

export function autoSaveModels() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    try {
      const modelsToSave = settingsModelsCache.map(m => ({
        id: m.id || m.name,
        name: m.name,
        alias: m.alias || '',
        provider: m.provider,
        base_url: m.base_url,
        api_key: m.api_key && m.api_key.startsWith('*') ? '' : m.api_key,
        context_window: m.context_window,
        capabilities: m.capabilities || [],
        is_default: m._isDefault || false,
        ttft: m.ttft || null,
        streaming: m.streaming || null,
        context_window_tested: m.context_window_tested || null,
        json_mode: m.json_mode || null,
      }));
      const defaultModel = settingsModelsCache.find(m => m._isDefault || m.is_default);
      const r = await fetch('/api/models/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: modelsToSave,
          default_model: defaultModel ? defaultModel.name : '',
        }),
      });
      const d = await r.json();
      if (!d.success) toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
      else {
        // Refresh agent cache and model dropdown before showing success
        if (typeof loadChatAgents === 'function') {
          loadChatAgents().then(() => {
            if (typeof loadChatModels === 'function') loadChatModels();
            if (toast) window.toast.success(t('settings.modelSaved'), 1500);
          });
        } else {
          if (toast) window.toast.success(t('settings.modelSaved'), 1500);
        }
      }
    } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
  }, 300);
}

// ===== Quick Provider Presets =====

export function applyProviderPreset() {
  const preset = document.getElementById('providerPreset').value;
  if (!preset) return;
  if (preset === 'custom') {
    document.getElementById('discoverBaseUrl').value = '';
    document.getElementById('discoverApiKey').value = '';
    document.getElementById('discoverBaseUrl').focus();
    return;
  }
  const presets = {
    openai: { base_url: 'https://api.openai.com/v1' },
    anthropic: { base_url: 'https://api.anthropic.com/v1' },
    deepseek: { base_url: 'https://api.deepseek.com/v1' },
    moonshot: { base_url: 'https://api.moonshot.cn/v1' },
    qwen: { base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    longcat: { base_url: 'https://api.longcat.chat/openai' },
    zhipuai: { base_url: 'https://open.bigmodel.cn/api/paas/v4' },
    minimax: { base_url: 'https://api.minimaxi.chat/v1' },
    groq: { base_url: 'https://api.groq.com/openai/v1' },
    openrouter: { base_url: 'https://openrouter.ai/api/v1' },
    ollama: { base_url: 'http://localhost:11434/v1' },
  };
  const p = presets[preset];
  if (p) {
    document.getElementById('discoverBaseUrl').value = p.base_url;
  }
}

// ===== Refresh / Load Settings =====

export async function refreshGlobalSettings() {
  try {
    const r = await fetch('/api/config');
    const data = await r.json();
    settingsCache = data;
    // Sync models from config to cache and render
    const models = data.models || [];
    const defaultModel = data.default_model || '';
    settingsModelsCache = models;
    settingsModelsCache.forEach(m => { m._isDefault = (m.name === defaultModel); });
    // Update model count badge
    const countEl = document.getElementById('chatSettingsModelCount') || document.getElementById('settingsModelCount');
    if (countEl) countEl.textContent = '(' + models.length + ' 个)';
    // Fill runtime settings (now in agent-config page)
    if (document.getElementById('cfgMaxTools')) {
      document.getElementById('cfgMaxTools').value = data.max_tools || 30;
      document.getElementById('cfgMaxToolRounds').value = data.max_tool_rounds || 100;
      document.getElementById('cfgSessionTimeout').value = data.session_timeout || 3600;
      document.getElementById('cfgAgentName').value = data.agent_name || 'Siper Agent';
      document.getElementById('cfgIcon').value = data.icon || '🎭';
      document.getElementById('cfgAvatar').value = data.avatar || '';
    }
    // Fill system parameters
    const sys = data.system || {};
    if (document.getElementById('sysWsHeartbeatTimeout')) {
      document.getElementById('sysWsHeartbeatTimeout').value = sys.ws_heartbeat_timeout || 300;
      document.getElementById('sysSessionListLimit').value = sys.session_list_limit || 50;
      document.getElementById('sysLogBufferSize').value = sys.log_buffer_size || 2000;
      document.getElementById('sysTokenUsageMax').value = sys.token_usage_max || 500;
      document.getElementById('sysCtxWindowDefault').value = sys.context_window_default || 8192;
    }

if (toast) window.toast.info(t('settings.refreshed'), 1500);
  } catch(e) {
    console.error('refreshGlobalSettings error:', e);
if (toast) window.toast.error(t('settings.refreshFailed'));
  }
}

export function autoSaveRuntimeSettings() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    const defModel = settingsModelsCache.find(m => m._isDefault || m.is_default);
    const body = {
      agent_name: '',
      max_tools: 30,
      max_tool_rounds: 100,
      session_timeout: 3600,
      icon: '',
      avatar: '',
      models: settingsModelsCache.map(m => ({
        id: m.id || m.name, name: m.name, provider: m.provider,
        base_url: m.base_url, api_key: m.api_key,
        context_window: m.context_window, capabilities: m.capabilities || [],
        is_default: m._isDefault || false,
      })),
      default_model: defModel ? defModel.name : '',
      model: defModel ? defModel.name : '',
      base_url: defModel ? (defModel.base_url || '') : '',
      api_key: defModel ? (defModel.api_key || '') : '',
    };
    try {
      const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.success) toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
      else {
if (toast) window.toast.success(t('settings.saved') || '设置已保存', 1500);
      }
    } catch(e) { toast.error(t('settings.saveFailed')); }
  }, 800);
}

export function resetSettingsModels() {
  showConfirm({
    title: t('settings.confirmReset') || '重置模型',
    msg: '确定要清空所有已添加的模型吗？',
    impact: '⚠ 所有已添加的模型配置、默认模型设置将丢失',
    danger: true,
    okText: '确认清空',
    onConfirm: () => {
      settingsModelsCache = [];
      discoveredModelsCache = [];
      document.getElementById('discoverBaseUrl').value = '';
      document.getElementById('discoverApiKey').value = '';
      document.getElementById('discoverResult').innerHTML = '';
      document.getElementById('newModelName').value = '';
      document.getElementById('newModelProvider').value = '';
      document.getElementById('newModelBaseUrl').value = '';
      document.getElementById('newModelApiKey').value = '';
      document.getElementById('newModelCtx').value = '8192';
      renderSettingsModelsList();
if (toast) window.toast.success(t('settings.resetDone'), 1500);
    }
  });
}

// ===== Meta Config =====

export function saveMetaConfig() {
  const cfg = {
    showTokens: document.getElementById('cfgMetaTokens').checked,
    showCached: document.getElementById('cfgMetaCached').checked,
    showTools: document.getElementById('cfgMetaTools').checked,
    showSkills: document.getElementById('cfgMetaSkills').checked,
    showTime: document.getElementById('cfgMetaTime').checked,
    showToolSteps: document.getElementById('cfgMetaToolSteps').checked,
    showDebug: document.getElementById('cfgMetaDebug').checked,
    brTokens: document.getElementById('cfgMetaTokensBr').checked,
    brCached: document.getElementById('cfgMetaCachedBr').checked,
    brTools: document.getElementById('cfgMetaToolsBr').checked,
    brSkills: document.getElementById('cfgMetaSkillsBr').checked,
    brTime: document.getElementById('cfgMetaTimeBr').checked,
  };
  localStorage.setItem('siper_meta_config', JSON.stringify(cfg));
}

export function loadMetaConfig() {
  try {
    const raw = localStorage.getItem('siper_meta_config');
    const cfg = raw ? JSON.parse(raw) : null;
    if (cfg) {
      document.getElementById('cfgMetaTokens').checked = !!cfg.showTokens;
      document.getElementById('cfgMetaCached').checked = !!cfg.showCached;
      document.getElementById('cfgMetaTools').checked = !!cfg.showTools;
      document.getElementById('cfgMetaSkills').checked = !!cfg.showSkills;
      document.getElementById('cfgMetaTime').checked = !!cfg.showTime;
      document.getElementById('cfgMetaToolSteps').checked = !!cfg.showToolSteps;
      document.getElementById('cfgMetaDebug').checked = !!cfg.showDebug;
      document.getElementById('cfgMetaTokensBr').checked = !!cfg.brTokens;
      document.getElementById('cfgMetaCachedBr').checked = !!cfg.brCached;
      document.getElementById('cfgMetaToolsBr').checked = !!cfg.brTools;
      document.getElementById('cfgMetaSkillsBr').checked = !!cfg.brSkills;
      document.getElementById('cfgMetaTimeBr').checked = !!cfg.brTime;
    }
  } catch(e) {}
}

// ===== Model Edit Modal =====

// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshGlobalSettings);

// Event delegation for verify buttons 已迁移到 model-test.js

// ===== Auto-Save for Global Settings =====
// (autoSaveModels and autoSaveRuntimeSettings defined above)

export function attachSettingsAutoSaveListeners() {
  // System params — auto-save on input
  const sysFields = ['sysWsHeartbeatTimeout', 'sysSessionListLimit', 'sysLogBufferSize', 'sysTokenUsageMax', 'sysCtxWindowDefault'];
  sysFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', autoSaveSystemParams);
  });
  // Runtime settings — auto-save on change (fields now in agent-config page)
  const runtimeFields = [];
  runtimeFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', autoSaveRuntimeSettings);
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
        el.addEventListener('input', autoSaveRuntimeSettings);
      }
    }
  });
  // Meta config — save to localStorage
  const metaFields = ['cfgMetaTokens', 'cfgMetaTokensBr', 'cfgMetaCached', 'cfgMetaCachedBr', 'cfgMetaTools', 'cfgMetaToolsBr', 'cfgMetaSkills', 'cfgMetaSkillsBr', 'cfgMetaTime', 'cfgMetaTimeBr', 'cfgMetaToolSteps', 'cfgMetaDebug'];
  metaFields.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', saveMetaConfig); });
}

export function copyModelName(evt, name) {
  const btn = evt.currentTarget || (evt.target && evt.target.closest('button'));
  if (!btn) return;
  navigator.clipboard.writeText(name).then(() => {
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = '📋'; }, 1500);
  }).catch(() => {
    // Fallback: show modal with selectable text
    const existing = document.getElementById('copyNameModal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'copyNameModal';
    overlay.className = 'copy-name-modal-overlay';
    overlay.innerHTML = '<div class="copy-name-modal-box"><div class="copy-name-modal-title">复制模型名称</div><input type="text" value="' + name.replace(/"/g, '&quot;') + '" readonly class="copy-name-modal-input" onclick="this.select()"><div class="copy-name-modal-footer"><button id="copyNameModalClose" class="btn-sm primary">关闭</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#copyNameModalClose').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    setTimeout(() => { const inp = overlay.querySelector('input'); if (inp) { inp.focus(); inp.select(); } }, 50);
  });
}

// ===== System Parameters =====

export async function saveSystemParams() {
  const system = {
    ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value) || 300,
    session_list_limit: parseInt(document.getElementById('sysSessionListLimit').value) || 50,
    log_buffer_size: parseInt(document.getElementById('sysLogBufferSize').value) || 2000,
    token_usage_max: parseInt(document.getElementById('sysTokenUsageMax').value) || 500,
    context_window_default: parseInt(document.getElementById('sysCtxWindowDefault').value) || 8192,
  };
  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system }),
    });
    const d = await r.json();
    if (d.success) {
if (toast) window.toast.success(t('settings.systemParamsSaved'), 2000);
      // Trigger gateway restart
      setTimeout(async () => {
        try { await fetch('/api/gateway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restart_all' }) }); } catch(e) {}
      }, 1000);
    } else {
if (toast) window.toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
    }
  } catch(e) {
if (toast) window.toast.error(t('settings.saveFailed') + ': ' + e.message);
  }
}

export function resetSystemParams() {
  document.getElementById('sysWsHeartbeatTimeout').value = 300;
  document.getElementById('sysSessionListLimit').value = 50;
  document.getElementById('sysLogBufferSize').value = 2000;
  document.getElementById('sysTokenUsageMax').value = 500;
  document.getElementById('sysCtxWindowDefault').value = 8192;
  autoSaveSystemParams();
  if (toast) window.toast.info('已重置为默认值', 1500);
}

let _sysSaveTimer = null;
export function autoSaveSystemParams() {
  if (_sysSaveTimer) clearTimeout(_sysSaveTimer);
  _sysSaveTimer = setTimeout(async () => {
    const system = {
      ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value) || 300,
      session_list_limit: parseInt(document.getElementById('sysSessionListLimit').value) || 50,
      log_buffer_size: parseInt(document.getElementById('sysLogBufferSize').value) || 2000,
      token_usage_max: parseInt(document.getElementById('sysTokenUsageMax').value) || 500,
      context_window_default: parseInt(document.getElementById('sysCtxWindowDefault').value) || 8192,
    };
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system }),
      });
      const d = await r.json();
      if (d.success) {
        if (toast) window.toast.success('系统参数已保存', 1000);
      } else {
        if (toast) window.toast.error('保存失败: ' + (d.error || 'unknown'));
      }
    } catch(e) {
      if (toast) window.toast.error('保存失败: ' + e.message);
    }
  }, 500);
}

document.addEventListener('DOMContentLoaded', attachSettingsAutoSaveListeners);
// ===== Chat Mode Helpers =====

export function switchSettingsTab(tab) {
  window._currentSettingsTab = tab;
  const tabs = document.querySelectorAll('.siper-settings-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const sys = document.getElementById('chatSystemSettings');
  const models = document.getElementById('chatGlobalModels');
  if (sys) sys.style.display = (tab === 'system') ? '' : 'none';
  if (models) {
    models.style.display = (tab === 'models') ? '' : 'none';
    if (tab === 'models') renderChatGlobalModels();
  }
}

// ===== Chat Mode: Models Tab Rendering =====
// Renders model management content into #chatGlobalModels (chat subpage)
// Uses settingsModelsCache from settings.js as data source

const _providerUrlMap = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
  moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  longcat: 'https://api.longcat.chat/openai',
  zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimaxi.chat/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
};

export function renderChatGlobalModels() {
  const el = document.getElementById('chatGlobalModels');
  if (!el) return;
  // If already rendered, skip (unless force refresh needed)
  if (window._modelsRendered && el.children.length > 0) return;

  Promise.all([
    fetch('/api/models/global').then(r => r.json()),
    fetch('/api/config').then(r => r.json()),
  ]).then(([data, cfg]) => {
    const models = data.models || data || [];
    const settings = (cfg && cfg.settings) || cfg || {};
    // Sync to settingsModelsCache
    settingsModelsCache = models.map(m => ({ ...m, _isDefault: m.is_default || false }));

    const modelOptions = models.map(m => {
      const alias = m.alias ? ` (${m.alias})` : '';
      return `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}${escapeHtml(alias)}</option>`;
    }).join('');

    const modelCards = models.map((m, i) => {
      const alias = m.alias ? ` (${m.alias})` : '';
      const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window / 1000000).toFixed(1) + 'M' : (m.context_window / 1000).toFixed(0) + 'K') : '-';
      const capBadges = renderCapBadges(m.capabilities);
      const ctxTested = m.context_window_tested ? (m.context_window_tested >= 1000000 ? (m.context_window_tested / 1000000).toFixed(1) + 'M' : (m.context_window_tested / 1000).toFixed(0) + 'K') : '';
      const ttft = m.ttft ? m.ttft + 'ms' : '';
      const streaming = m.streaming ? '⚡流式' : '';
      const jsonMode = m.json_mode === true ? '📋JSON模式' : '';
      const metaTags = [ctxTested, ttft, streaming, jsonMode].filter(Boolean).map(t => '<span class="siper-meta-tag">' + t + '</span>').join('');
      return `<div class="siper-model-card card-hover" data-model-name="${escapeHtml(m.name)}">
        <div class="siper-model-card-header">
          <span class="siper-model-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
          <button class="siper-btn small danger btn-model-delete" onclick="window.chatRemoveModel(${i})" title="删除">✕</button>
        </div>
        <div class="siper-model-provider">${escapeHtml(m.provider || '')}${alias}</div>
        <div class="siper-model-meta">
          ${ctxTested ? `<span class="siper-meta-tag">${ctxTested}</span>` : ''}
          ${ttft ? `<span class="siper-meta-tag">TTFT ${ttft}</span>` : ''}
          ${streaming ? `<span class="siper-meta-tag">${streaming}</span>` : ''}
          ${m.json_mode === true ? '<span class="siper-meta-tag">📋JSON模式</span>' : ''}
        </div>
        <div class="siper-model-caps-wrap">
          ${capBadges ? `<div class="siper-model-caps">${capBadges}</div>` : ''}
          <button class="siper-btn small btn-verify" data-idx="${i}" title="验证">🔍</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
        <div class="siper-form-card">
          <div class="siper-form-title">模型管理</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
            <div>
              <div class="text-dim" style="font-size:12px;margin-bottom:4px">默认对话模型</div>
              <select id="chatDefaultChatModel" class="siper-input" style="width:100%;" aria-label="默认对话模型">
                <option value="">— 使用全局默认 —</option>${modelOptions}
              </select>
            </div>
            <div>
              <div class="text-dim" style="font-size:12px;margin-bottom:4px">默认视觉模型</div>
              <select id="chatDefaultVisionModel" class="siper-input" style="width:100%;" aria-label="默认视觉模型">
                <option value="">— 使用全局默认 —</option>${modelOptions}
              </select>
            </div>
          </div>
          <div class="siper-models-grid">${modelCards}</div>
        </div>
        <div class="siper-form-card">
          <div class="siper-form-title">🔍 自动发现模型</div>
          <div class="siper-form-row"><label>Provider</label>
            <select id="wcfgProviderPreset" class="siper-input" style="width:auto;" onchange="window.chatApplyProviderPreset()" aria-label="Provider 预设">
              <option value="">— 选择 Provider —</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="deepseek">DeepSeek</option>
              <option value="moonshot">Moonshot</option>
              <option value="qwen">Qwen</option>
              <option value="longcat">LongCat</option>
              <option value="zhipuai">ZhipuAI</option>
              <option value="minimax">MiniMax</option>
              <option value="groq">Groq</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div class="siper-form-row"><label>Base URL</label><input type="text" class="siper-input" id="wcfgDiscoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL"></div>
          <div class="siper-form-row"><label>API Key</label><input type="password" class="siper-input" id="wcfgDiscoverApiKey" placeholder="sk-..." aria-label="发现 API Key"></div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button class="siper-btn primary" onclick="window.chatDiscoverModels()">获取模型列表</button>
          </div>
          <div id="wcfgDiscoverResult" style="margin-top:6px;"></div>
        </div>
      </div>
    `;

    // Set current defaults
    const chatSel = document.getElementById('chatDefaultChatModel');
    const visionSel = document.getElementById('chatDefaultVisionModel');
    if (chatSel) chatSel.value = settings.model || '';
    if (visionSel) visionSel.value = settings.vision_model || '';

    window._modelsRendered = true;
  }).catch(() => {
    el.innerHTML = '<div class="siper-form-card"><div class="siper-form-title">模型管理</div><div class="text-danger">加载失败</div></div>';
  });
}

// Chat-mode model management functions (called by HTML onclick in chat subpage)

export function chatLoadGlobalModels() {
  window._modelsRendered = false;
  renderChatGlobalModels();
}

export function chatRemoveModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  confirmDeleteModel(m.name, () => {
    settingsModelsCache.splice(idx, 1);
    window._modelsRendered = false;
    renderChatGlobalModels();
    autoSaveModels();
  });
}

export function chatSaveGlobalModels() {
  const chatModel = document.getElementById('chatDefaultChatModel')?.value || '';
  const visionModel = document.getElementById('chatDefaultVisionModel')?.value || '';
  fetch('/api/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: chatModel, vision_model: visionModel }),
  }).then(r => r.json()).then(d => {
    if (d.success) { if (window.toast) window.toast.success('模型配置已保存'); }
    else { if (window.toast) window.toast.error('保存失败'); }
  }).catch(() => { if (window.toast) window.toast.error('保存失败'); });
}

export function chatApplyProviderPreset() {
  const preset = document.getElementById('wcfgProviderPreset')?.value;
  const urlInput = document.getElementById('wcfgDiscoverBaseUrl');
  if (urlInput && _providerUrlMap[preset]) urlInput.value = _providerUrlMap[preset];
}

export function chatDiscoverModels() {
  const baseUrl = document.getElementById('wcfgDiscoverBaseUrl')?.value.trim();
  const apiKey = document.getElementById('wcfgDiscoverApiKey')?.value.trim();
  const resultEl = document.getElementById('wcfgDiscoverResult');
  if (!baseUrl || !apiKey) { toast.warning('请填写 Base URL 和 API Key'); return; }
  if (resultEl) resultEl.innerHTML = '<div class="text-dim" style="font-size:12px;">获取中...</div>';
  fetch('/api/models/discover', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
  }).then(r => r.json()).then(data => {
    if (data && data.models && data.models.length) {
      let html = '<div class="text-primary" style="font-size:12px;margin-bottom:4px;">发现 ' + data.models.length + ' 个模型</div>';
      html += '<div style="max-height:180px;overflow-y:auto;">';
      data.models.forEach(m => {
        const name = typeof m === 'string' ? m : (m.name || m.id || JSON.stringify(m));
        const caps = (m.capabilities || []).map(c => CAP_ICONS[c] || c).join('');
        html += '<div class="siper-model-card" style="margin-bottom:4px;cursor:pointer;" onclick="window.chatAddDiscoveredModel(\'' + escapeHtml(name) + '\')">';
        html += '<div class="siper-model-name">' + escapeHtml(name) + '</div>';
        if (caps) html += '<div class="siper-model-caps" style="margin-top:2px;">' + caps + '</div>';
        html += '</div>';
      });
      html += '</div>';
      if (resultEl) resultEl.innerHTML = html;
    } else {
      if (resultEl) resultEl.innerHTML = '<div class="text-danger">未发现模型或接口错误</div>';
    }
  }).catch(() => { if (resultEl) resultEl.innerHTML = '<div class="text-danger">请求失败</div>'; });
}

export function chatAddDiscoveredModel(name) {
  if (settingsModelsCache.find(m => m.name === name)) {
    if (window.toast) window.toast.error('模型已存在');
    return;
  }
  const baseUrl = document.getElementById('wcfgDiscoverBaseUrl')?.value.trim() || '';
  const apiKey = document.getElementById('wcfgDiscoverApiKey')?.value.trim() || '';
  settingsModelsCache.push({ id: name, name: name, base_url: baseUrl, api_key: apiKey, capabilities: ['chat'], is_default: false });
  // Save to backend
  const modelsToSave = settingsModelsCache.map(m => ({
    id: m.id || m.name, name: m.name, alias: m.alias || '', provider: m.provider,
    base_url: m.base_url, api_key: m.api_key, context_window: m.context_window,
    capabilities: m.capabilities || [], is_default: m._isDefault || false,
  }));
  fetch('/api/models/global', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models: modelsToSave }),
  }).then(r => r.json()).then(d => {
    if (d.success) {
      if (window.toast) window.toast.success('模型已添加: ' + name);
      window._modelsRendered = false;
      renderChatGlobalModels();
    }
  }).catch(() => { if (window.toast) window.toast.error('添加失败'); });
}
