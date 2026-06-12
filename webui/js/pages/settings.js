// pages/settings.js — 全局设置
// 从 pages/page-settings.js 迁移

import { t } from '../utils/i18n.js';
import { escapeHtml } from '../utils/escape.js';
import { confirmDeleteModel, showConfirm, showInput } from '../components/toast.js';
import { toast } from '../components/toast.js';
import { CAP_ICONS, CAP_LABELS, CAP_ORDER, renderCapBadges } from '../utils/capabilities.js';
import { testModel } from '../components/model-test.js';

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
    if (toast) toast.success('已删除模型: ' + m.name, 1500);
  });
}

// verifyModel 已迁移到 model-test.js

// ===== Model Discovery (Auto-detect) =====

export async function discoverModels() {
  const baseUrl = document.getElementById('discoverBaseUrl').value.trim();
  const apiKey = document.getElementById('discoverApiKey').value.trim();
  if (!baseUrl) { if (toast) toast.warning(t('toast.enterBaseUrl')); return; }
  if (!apiKey) { if (toast) toast.warning(t('toast.enterApiKey')); return; }

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
if (toast) toast.warning(t('toast.modelExists') + ': ' + m.name);
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
  if (toast) toast.success('已添加 ' + added + ' 个模型');
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
            if (toast) toast.success(t('settings.modelSaved'), 1500);
          });
        } else {
          if (toast) toast.success(t('settings.modelSaved'), 1500);
        }
      }
    } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
  }, 300);
}

// ===== Quick Provider Presets =====

export function applyProviderPreset() {
  const preset = document.getElementById('providerPreset').value;
  const urlInput = document.getElementById('discoverBaseUrl');
  if (!preset) return;
  if (preset === 'custom') {
    urlInput.value = '';
    urlInput.disabled = false;
    document.getElementById('discoverApiKey').value = '';
    urlInput.focus();
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
    urlInput.value = p.base_url;
    urlInput.disabled = true;
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
      if (document.getElementById('sysPort')) document.getElementById('sysPort').value = sys.port || 9724;
      if (document.getElementById('sysLogLevel')) document.getElementById('sysLogLevel').value = sys.log_level || 'INFO';
    }

if (toast) toast.info(t('settings.refreshed'), 1500);
  } catch(e) {
    console.error('refreshGlobalSettings error:', e);
    if (toast) toast.error(t('settings.refreshFailed'));
  }
}

export function autoSaveRuntimeSettings() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    const defModel = settingsModelsCache.find(m => m._isDefault || m.is_default);
    // Only save model-related and runtime fields; agent identity fields (name/icon/avatar)
    // are managed by agent-config page and must NOT be overwritten from global settings
    const body = {
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
if (toast) toast.success(t('settings.saved') || '设置已保存', 1500);
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
if (toast) toast.success(t('settings.resetDone'), 1500);
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

export function copyModelName(evt, name) {
  const btn = evt.currentTarget || (evt.target && evt.target.closest('button'));
  if (!btn) return;
  navigator.clipboard.writeText(name).then(() => {
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = '📋'; }, 1500);
  }).catch(() => {
    toast.warning('自动复制失败，请手动复制模型名称');
  });
}

// Event delegation for verify buttons 已迁移到 model-test.js

// ===== Auto-Save for Global Settings =====
// (autoSaveModels and autoSaveRuntimeSettings defined above)

export function attachSettingsAutoSaveListeners() {
  // System params — auto-save on input
  const sysFields = ['sysWsHeartbeatTimeout', 'sysSessionListLimit', 'sysLogBufferSize', 'sysTokenUsageMax', 'sysCtxWindowDefault', 'sysPort', 'sysLogLevel'];
  let bound = 0;
  sysFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', autoSaveSystemParams);
      if (el.tagName === 'SELECT') el.addEventListener('change', autoSaveSystemParams);
      bound++;
    }
  });
  // Meta config — save to localStorage
  const metaFields = ['cfgMetaTokens', 'cfgMetaTokensBr', 'cfgMetaCached', 'cfgMetaCachedBr', 'cfgMetaTools', 'cfgMetaToolsBr', 'cfgMetaSkills', 'cfgMetaSkillsBr', 'cfgMetaTime', 'cfgMetaTimeBr', 'cfgMetaToolSteps', 'cfgMetaDebug'];
  metaFields.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', saveMetaConfig); });
}

// refreshGlobalSettings() 已迁移到 switchSettingsTab('system') 和 renderSettingsPageChat 中调用
// DOMContentLoaded 在 ESM deferred 模块中可能已触发过，且系统参数 DOM 尚未创建

// ===== System Parameters =====

export function resetSystemParams() {
  document.getElementById('sysWsHeartbeatTimeout').value = 300;
  document.getElementById('sysSessionListLimit').value = 50;
  document.getElementById('sysLogBufferSize').value = 2000;
  document.getElementById('sysTokenUsageMax').value = 500;
  document.getElementById('sysCtxWindowDefault').value = 8192;
  document.getElementById('sysPort').value = 9724;
  document.getElementById('sysLogLevel').value = 'INFO';
  autoSaveSystemParams();
  if (toast) toast.info('已重置为默认值', 1500);
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
      port: parseInt(document.getElementById('sysPort').value) || 9724,
      log_level: document.getElementById('sysLogLevel').value || 'INFO',
    };
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system }),
      });
      const d = await r.json();
      if (d.success) {
        toast.success('系统参数已保存', 1000);
      } else {
        toast.error('保存失败: ' + (d.error || 'unknown'));
      }
    } catch(e) {
      toast.error('保存失败: ' + e.message);
    }
  }, 500);
}

// ===== Chat Mode Helpers =====

export function switchSettingsTab(tab) {
  window._currentSettingsTab = tab;
  const tabs = document.querySelectorAll('.siper-settings-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const sys = document.getElementById('chatSystemSettings');
  const agents = document.getElementById('chatGlobalAgents');
  const models = document.getElementById('chatGlobalModels');
  if (sys) sys.style.display = (tab === 'system') ? '' : 'none';
  if (tab === 'system' && typeof refreshGlobalSettings === 'function') {
    refreshGlobalSettings();
  }
  if (agents) agents.style.display = (tab === 'agents') ? '' : 'none';
  if (models) {
    models.style.display = (tab === 'models') ? '' : 'none';
    if (tab === 'models' && typeof renderChatGlobalModels === 'function') {
      renderChatGlobalModels();
    }
  }
  if (tab === 'agents' && typeof renderGlobalAgents === 'function') {
    renderGlobalAgents();
  }
}

// ===== Agent Management (Global Settings Tab) =====
// Agent 增删完全基于文件系统，不写入全局配置文件
// 卡片模式 + 详情面板：点击卡片展开详情，支持重命名、编辑文件

let _agentListCache = []; // cache agent list for detail panel

export function renderGlobalAgents() {
  const grid = document.getElementById('globalAgentCards');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-dim);font-size:13px">加载中…</div>';
  fetch('/api/agents').then(r => r.json()).then(data => {
    const agents = data.agents || data || [];
    _agentListCache = agents;
    if (agents.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim);font-size:13px">暂无智能体<br><span style="font-size:11px">点击右上角「+ 新增智能体」创建</span></div>';
      return;
    }
    grid.innerHTML = '';
    agents.forEach(a => {
      const card = document.createElement('div');
      card.className = 'agent-card' + (a.is_active ? ' agent-card-active' : '');
      card.dataset.name = a.name;
      const avatarHtml = a.avatar
        ? '<img src="/' + escapeHtml(a.avatar) + '" class="agent-card-avatar" alt="">'
        : '<div class="agent-card-avatar agent-card-avatar-placeholder">' + escapeHtml(a.icon || '🎭') + '</div>';
      const badges = [];
      if (a.is_active) badges.push('<span class="agent-card-badge badge-current">当前</span>');
      if (a.has_soul) badges.push('<span class="agent-card-badge badge-ok">Soul</span>');
      if (a.has_config) badges.push('<span class="agent-card-badge badge-ok">Config</span>');
      const modelCount = (a.available_models || []).length;
      card.innerHTML =
        '<div class="agent-card-header">' +
          avatarHtml +
          '<div class="agent-card-info">' +
            '<div class="agent-card-name">' + escapeHtml(a.display_name || a.name) + '</div>' +
            '<div class="agent-card-dir"><code>agents/' + escapeHtml(a.name) + '/</code></div>' +
          '</div>' +
          '<div class="agent-card-actions">' +
            '<button class="agent-card-btn" onclick="window._agentCardSelect(\'' + escapeHtml(a.name) + '\')" title="详情">ℹ</button>' +
            '<button class="agent-card-btn danger" onclick="window._agentCardDelete(\'' + escapeHtml(a.name) + '\')" title="删除">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="agent-card-badges">' + badges.join('') + '</div>' +
        '<div class="agent-card-meta">' +
          '<span>🎭 ' + escapeHtml(a.icon || '🎭') + '</span>' +
          '<span>📦 ' + modelCount + ' 个模型</span>' +
        '</div>';
      grid.appendChild(card);
    });
  }).catch(() => {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--danger);font-size:13px">加载失败</div>';
  });
}

export function onGlobalAgentSelect(name) {
  // Highlight selected card
  const cards = document.querySelectorAll('#globalAgentCards .agent-card');
  cards.forEach(c => c.classList.toggle('agent-card-selected', c.dataset.name === name));
  const detail = document.getElementById('globalAgentCardDetail');
  if (!name || !detail) { if (detail) detail.style.display = 'none'; return; }
  const agent = _agentListCache.find(a => a.name === name);
  if (!agent) { detail.style.display = 'none'; return; }
  detail.style.display = '';
  detail.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
    (agent.avatar
      ? '<img src="/' + escapeHtml(agent.avatar) + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover">'
      : '<div style="width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px">' + escapeHtml(agent.icon || '🎭') + '</div>') +
    '<div><b>' + escapeHtml(agent.display_name || agent.name) + '</b> <span style="font-size:11px;color:var(--text-dim)">' + escapeHtml(agent.name) + '</span></div>' +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="siper-btn" onclick="window._agentRename(\'' + escapeHtml(name) + '\')">✏ 重命名</button>' +
      '<button class="siper-btn" onclick="window._agentEditFile(\'' + escapeHtml(name) + '\',\'soul\')">📝 Soul.md</button>' +
      '<button class="siper-btn" onclick="window._agentEditFile(\'' + escapeHtml(name) + '\',\'config\')">📝 Agent.md</button>' +
    '</div>' +
    '<div id="agentFileEditor" style="display:none">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span id="agentFileEditorTitle" style="font-size:12px;font-weight:600"></span>' +
        '<div style="display:flex;gap:4px">' +
          '<button class="siper-btn primary" onclick="window._agentSaveFile()" style="padding:4px 10px;font-size:12px">保存</button>' +
          '<button class="siper-btn" onclick="window._agentCloseEditor()" style="padding:4px 10px;font-size:12px">取消</button>' +
        '</div>' +
      '</div>' +
      '<textarea id="agentFileEditorArea" class="siper-input" style="width:100%;min-height:200px;font-family:monospace;font-size:12px;resize:vertical" aria-label="文件编辑器"></textarea>' +
    '</div>';
}

export function confirmDeleteGlobalAgent() {
  const selected = document.querySelector('#globalAgentCards .agent-card-selected');
  const name = selected ? selected.dataset.name : null;
  if (!name) return;
  if (typeof showConfirm !== 'function') return;
  showConfirm({
    title: '删除智能体',
    msg: '将删除整个目录 <code>agents/' + escapeHtml(name) + '/</code>，包括所有配置、会话和记忆文件。<br><br>此操作不可恢复！',
    danger: true,
    okText: '确认删除',
    onConfirm: () => {
      const _btn = document.querySelector('.siper-confirm-ok');
      if (_btn) { _btn.disabled = true; _btn.textContent = '删除中...'; }
      fetch('/api/agents/' + name, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
          if (_btn) { _btn.disabled = false; _btn.textContent = '确认删除'; }
          if (data.success) {
            if (typeof toast !== 'undefined') toast.success('已删除: ' + name);
            document.getElementById('globalAgentCardDetail').style.display = 'none';
            renderGlobalAgents();
            if (typeof window.loadChatAgents === 'function') window.loadChatAgents();
          } else {
            if (typeof toast !== 'undefined') toast.error(data.error || '删除失败');
          }
        })
        .catch(() => { if (_btn) { _btn.disabled = false; _btn.textContent = '确认删除'; } if (typeof toast !== 'undefined') toast.error('网络错误'); });
    }
  });
}

// ===== Rename Modal =====
// Generic rename modal: { title, currentName, onConfirm(newName) }
window.showRenameModal = function(opts) {
  var title = opts.title || '重命名';
  var currentName = opts.currentName || '';
  var onConfirm = opts.onConfirm || function(){};
  showInput({
    title: title,
    placeholder: currentName,
    onConfirm: function(val) {
      if (!val.trim()) return;
      onConfirm(val.trim());
    }
  });
};

// Card mode helpers
window._agentCardSelect = function(name) {
  if (typeof window.onGlobalAgentSelect === 'function') window.onGlobalAgentSelect(name);
};
window._agentCardDelete = function(name) {
  if (typeof window.confirmDeleteGlobalAgent === 'function') window.confirmDeleteGlobalAgent();
};

// Rename agent (folder rename)
window._agentRename = function(name) {
  if (typeof window.showRenameModal !== 'function') return;
  window.showRenameModal({
    title: '重命名智能体',
    currentName: name,
    onConfirm: (newName) => {
      fetch('/api/agents/' + name + '/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName }),
      }).then(r => r.json()).then(data => {
        if (data.success) {
          if (typeof toast !== 'undefined') toast.success('已重命名: ' + name + ' → ' + newName);
          document.getElementById('globalAgentCardDetail').style.display = 'none';
          renderGlobalAgents();
          if (typeof window.loadChatAgents === 'function') window.loadChatAgents();
        } else {
          if (typeof toast !== 'undefined') toast.error(data.error || '重命名失败');
        }
      }).catch(() => { if (typeof toast !== 'undefined') toast.error('网络错误'); });
    }
  });
};

// Edit agent file (soul.md or agent.md)
let _agentEditName = '', _agentEditType = '';
window._agentEditFile = function(name, type) {
  _agentEditName = name;
  _agentEditType = type;
  const editor = document.getElementById('agentFileEditor');
  const title = document.getElementById('agentFileEditorTitle');
  const area = document.getElementById('agentFileEditorArea');
  if (!editor || !title || !area) return;
  editor.style.display = '';
  title.textContent = (type === 'soul' ? 'Soul.md' : 'Agent.md') + ' — ' + name;
  area.disabled = true;
  area.value = '加载中…';
  fetch('/api/agents/' + name + '/' + (type === 'soul' ? 'soul' : 'config'))
    .then(r => r.json())
    .then(data => {
      area.value = data.config || data.content || data.soul || '';
      area.disabled = false;
    })
    .catch(() => { area.value = '加载失败'; });
};

window._agentSaveFile = function() {
  const area = document.getElementById('agentFileEditorArea');
  if (!area || !_agentEditName || !_agentEditType) return;
  const content = area.value;
  fetch('/api/agents/' + _agentEditName + '/' + (_agentEditType === 'soul' ? 'soul' : 'config'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content }),
  }).then(r => r.json()).then(data => {
    if (data.success) {
      if (typeof toast !== 'undefined') toast.success('已保存');
      window._agentCloseEditor();
    } else {
      if (typeof toast !== 'undefined') toast.error(data.error || '保存失败');
    }
  }).catch(() => { if (typeof toast !== 'undefined') toast.error('网络错误'); });
};

window._agentCloseEditor = function() {
  const editor = document.getElementById('agentFileEditor');
  if (editor) editor.style.display = 'none';
};

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
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div class="siper-form-card" style="flex:1;min-width:0;">
          <div class="siper-form-title">模型管理</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
            <div>
              <div class="text-dim" style="font-size:12px;margin-bottom:4px">默认对话模型</div>
              <select id="chatDefaultChatModel" class="siper-input" style="width:100%;" aria-label="默认对话模型">
                <option value="">--（空）--</option>${modelOptions}
              </select>
            </div>
            <div>
              <div class="text-dim" style="font-size:12px;margin-bottom:4px">默认视觉模型</div>
              <select id="chatDefaultVisionModel" class="siper-input" style="width:100%;" aria-label="默认视觉模型">
                <option value="">--（空）--</option>${modelOptions}
              </select>
            </div>
          </div>
          <div class="siper-models-grid">${modelCards}</div>
        </div>
        <div class="siper-form-card" style="width:380px;flex-shrink:0;display:flex;flex-direction:column;">
          <div class="siper-form-title">🔍 自动发现模型</div>
          <div style="display:flex;gap:6px;align-items:end;margin-bottom:6px;">
            <div style="flex:1;">
              <div class="text-dim" style="font-size:11px;margin-bottom:2px;height:16px;line-height:16px;">Provider</div>
              <select id="wcfgProviderPreset" class="siper-input" style="width:100%;height:32px;padding:0 8px;box-sizing:border-box;" onchange="window.chatApplyProviderPreset()" aria-label="Provider 预设">
                <option value="">— 选择 —</option>
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
            <div style="flex:1.5;">
              <div class="text-dim" style="font-size:11px;margin-bottom:2px;height:16px;line-height:16px;">Base URL</div>
              <input type="text" class="siper-input" id="wcfgDiscoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL" style="width:100%;height:32px;padding:0 8px;box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:6px;">
            <div class="text-dim" style="font-size:11px;margin-bottom:2px;height:16px;line-height:16px;">API Key</div>
            <input type="password" class="siper-input" id="wcfgDiscoverApiKey" placeholder="sk-..." aria-label="发现 API Key" style="width:100%;height:32px;padding:0 8px;box-sizing:border-box;">
          </div>
          <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
            <button class="siper-btn primary" onclick="window.chatDiscoverModels()">获取模型列表</button>
            <div id="wcfgDiscoverFilterWrap" style="flex:1;display:none;position:relative;">
              <input type="text" class="siper-input" id="wcfgDiscoverFilter" placeholder="筛选模型..." aria-label="筛选发现的模型" style="width:100%;height:32px;padding:0 28px 0 8px;box-sizing:border-box;" oninput="window.chatFilterDiscovered()">
              <button id="wcfgDiscoverFilterClear" onclick="window.chatClearDiscoverFilter()" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--color-text-dim);cursor:pointer;font-size:16px;line-height:1;padding:2px 4px;display:none;" title="清空筛选">×</button>
            </div>
          </div>
          <div id="wcfgDiscoverResult" style="overflow-y:auto;flex:1;min-height:0;"></div>
        </div>
      </div>
    `;

    // Set current defaults
    const chatSel = document.getElementById('chatDefaultChatModel');
    const visionSel = document.getElementById('chatDefaultVisionModel');
    if (chatSel) chatSel.value = settings.model || '';
    if (visionSel) visionSel.value = settings.vision_model || '';

  }).catch(() => {
    el.innerHTML = '<div class="siper-form-card"><div class="siper-form-title">模型管理</div><div class="text-danger">加载失败</div></div>';
  });
}

// Chat-mode model management functions (called by HTML onclick in chat subpage)

export function chatRemoveModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  confirmDeleteModel(m.name, () => {
    settingsModelsCache.splice(idx, 1);
    renderChatGlobalModels();
    autoSaveModels();
  });
}

export function chatSaveGlobalModels() {
  const chatModel = document.getElementById('chatDefaultChatModel')?.value || '';
  const visionModel = document.getElementById('chatDefaultVisionModel')?.value || '';
  const saveBtn = document.querySelector('[onclick*="chatSaveGlobalModels"]');
  if (saveBtn) { saveBtn.disabled = true; }
  fetch('/api/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: chatModel, vision_model: visionModel }),
  }).then(r => r.json()).then(d => {
    if (saveBtn) { saveBtn.disabled = false; }
    if (d.success) { if (toast) toast.success('模型配置已保存'); }
    else { if (toast) toast.error('保存失败'); }
  }).catch(() => { if (saveBtn) { saveBtn.disabled = false; } if (toast) toast.error('保存失败'); });
}

export function chatApplyProviderPreset() {
  const preset = document.getElementById('wcfgProviderPreset')?.value;
  const urlInput = document.getElementById('wcfgDiscoverBaseUrl');
  if (urlInput && _providerUrlMap[preset]) {
    urlInput.value = _providerUrlMap[preset];
    urlInput.disabled = true;
  } else if (preset === 'custom') {
    urlInput.value = '';
    urlInput.disabled = false;
    urlInput.focus();
  }
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
      // Store discovered models for + button access
      discoveredModelsCache = data.models.map(m => ({
        name: typeof m === 'string' ? m : (m.name || m.id || ''),
        capabilities: m.capabilities || [],
        context_window: m.context_window || null,
        provider: data.provider || '',
        base_url: baseUrl,
        api_key: apiKey,
        _verified: null,
        _verifyError: null,
      }));
      window._discoverCount = data.models.length;
      window._discoverProvider = data.provider || '';
      // Show filter only when 6+ models discovered
      const filterWrap = document.getElementById('wcfgDiscoverFilterWrap');
      if (filterWrap) filterWrap.style.display = data.models.length >= 6 ? 'block' : 'none';
      renderChatDiscoverList();
    } else {
      if (resultEl) resultEl.innerHTML = '<div class="text-danger">未发现模型或接口错误</div>';
    }
  }).catch(() => { if (resultEl) resultEl.innerHTML = '<div class="text-danger">请求失败</div>'; });
}

function renderChatDiscoverList() {
  const resultEl = document.getElementById('wcfgDiscoverResult');
  if (!resultEl || !discoveredModelsCache.length) return;
  const filterText = (document.getElementById('wcfgDiscoverFilter')?.value || '').trim().toLowerCase();
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
  // Filter out already-added models and apply text filter
  const shown = discoveredModelsCache.map((m, i) => ({ ...m, _idx: i })).filter(m => {
    if (settingsModelsCache.find(x => x.name === m.name)) return false;
    if (filterText && !m.name.toLowerCase().includes(filterText)) return false;
    return true;
  });
  if (shown.length === 0) {
    const total = discoveredModelsCache.length;
    const added = discoveredModelsCache.filter(m => settingsModelsCache.find(x => x.name === m.name)).length;
    if (added === total) {
      resultEl.innerHTML = '<div class="text-dim" style="font-size:12px;padding:8px;">所有模型已全部添加 ✓</div>';
    } else {
      resultEl.innerHTML = '<div class="text-dim" style="font-size:12px;padding:8px;">没有匹配的模型</div>';
    }
    return;
  }
  const totalAdded = discoveredModelsCache.length - shown.length;
  let html = '<div style="font-size:12px;margin-bottom:4px;">';
  html += '<span class="text-primary">发现 ' + discoveredModelsCache.length + ' 个模型' + (totalAdded > 0 ? ' · <span class="text-dim">' + totalAdded + ' 个已添加</span>' : '') + '</span>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
  shown.forEach(m => {
    const name = m.name;
    const caps = (m.capabilities || []).map(c => capIcons[c] || c).join('');
    const verifyBtn = '<button class="siper-btn small btn-verify-discover" data-idx="' + m._idx + '" title="验证" style="font-size:11px;padding:2px 6px;">🔍</button>';
    const verifyResult = m._verified === true ? '<div style="font-size:10px;color:var(--color-success);margin-top:2px;">✅ 验证通过</div>' :
                      m._verified === false ? '<div style="font-size:10px;color:var(--color-danger);margin-top:2px;">❌ ' + escapeHtml(m._verifyError || '失败') + '</div>' :
                      m._verified === 'pending' ? '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">⏳ 验证中...</div>' : '';
    html += '<div class="siper-model-card discover-card" style="margin-bottom:0;padding:8px;">';
    html += '<div class="siper-model-name" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px;" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</div>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">';
    html += caps ? '<div class="siper-model-caps" style="font-size:10px;">' + caps + '</div>' : '<div></div>';
    html += '<button class="siper-btn small primary" onclick="window.chatAddDiscoveredModel(' + m._idx + ')" style="font-size:11px;padding:2px 6px;">+</button>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">';
    html += verifyBtn;
    html += '</div>';
    html += verifyResult;
    html += '</div>';
  });
  html += '</div>';
  resultEl.innerHTML = html;
}

export function chatFilterDiscovered() {
  renderChatDiscoverList();
  const clearBtn = document.getElementById('wcfgDiscoverFilterClear');
  const filterInput = document.getElementById('wcfgDiscoverFilter');
  if (clearBtn && filterInput) {
    clearBtn.style.display = filterInput.value ? 'block' : 'none';
  }
}

export function chatClearDiscoverFilter() {
  const filterInput = document.getElementById('wcfgDiscoverFilter');
  if (filterInput) {
    filterInput.value = '';
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function chatVerifyDiscoveredModel(idx) {
  const m = discoveredModelsCache[idx];
  if (!m) return;
  if (!m.base_url || !m.api_key) {
    if (toast) toast.warning(m.name + ' 未配置 base_url 或 api_key');
    return;
  }
  m._verified = 'pending';
  renderChatDiscoverList();
  if (toast) toast.info('正在验证 ' + m.name + '...');
  testModel(m.base_url, m.api_key, m.name).then(d => {
    m._verified = d.success;
    m._verifyError = d.error || null;
    if (d.success) {
      // Save verified capability fields to discover cache for later use when adding to optional models
      if (d.capabilities) m.capabilities = d.capabilities;
      if (d.streaming !== undefined) m.streaming = d.streaming;
      if (d.json_mode !== undefined) m.json_mode = d.json_mode;
      if (d.ttft_ms !== undefined) m.ttft = d.ttft_ms;
      if (d.context_window_tested !== undefined) m.context_window_tested = d.context_window_tested;
      if (d.latency_ms !== undefined) m._latency = d.latency_ms;
      if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) {
        m.context_window = d.context_window_tested;
      }
    }
    renderChatDiscoverList();
    if (toast) {
      if (d.success) toast.success(m.name + ' 验证通过', 1200);
      else toast.error(m.name + ' 验证失败: ' + (d.error || 'unknown'), 1500);
    }
  }).catch(e => {
    m._verified = false;
    m._verifyError = e.message || '请求失败';
    renderChatDiscoverList();
  });
}

export function chatAddDiscoveredModel(idx) {
  const m = discoveredModelsCache[idx];
  if (!m) return;
  if (settingsModelsCache.find(x => x.name === m.name)) {
    if (toast) toast.warning('模型已存在: ' + m.name);
    return;
  }
  const pendingVerify = (m._verified === 'pending');
  settingsModelsCache.push({
    id: m.name, name: m.name,
    base_url: m.base_url || '', api_key: m.api_key || '',
    capabilities: m.capabilities || [],
    context_window: m.context_window || null,
    streaming: m.streaming || null,
    json_mode: m.json_mode || null,
    ttft: m.ttft || null,
    context_window_tested: m.context_window_tested || null,
  });
  // If verification still pending, register callback to auto-complete fields when done
  if (pendingVerify) {
    const checkDone = setInterval(() => {
      const dm = discoveredModelsCache.find(x => x.name === m.name);
      if (!dm || dm._verified !== 'pending') {
        clearInterval(checkDone);
        const sm = settingsModelsCache.find(x => x.name === m.name);
        if (sm && dm && dm._verified === true) {
          if (dm.capabilities) sm.capabilities = dm.capabilities;
          if (dm.streaming !== undefined) sm.streaming = dm.streaming;
          if (dm.json_mode !== undefined) sm.json_mode = dm.json_mode;
          if (dm.ttft !== undefined) sm.ttft = dm.ttft;
          if (dm.context_window_tested !== undefined) sm.context_window_tested = dm.context_window_tested;
          if (dm.context_window && dm.context_window > (sm.context_window || 0)) sm.context_window = dm.context_window;
          autoSaveModels();
        }
      }
    }, 200);
    // Safety: stop checking after 120s (max verify timeout)
    setTimeout(() => clearInterval(checkDone), 120000);
  }
  // Append new model card to chat page model grid
  const grid = document.querySelector('#chatGlobalModels .siper-models-grid');
  if (grid) {
    const capBadges = renderCapBadges(m.capabilities);
    const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window / 1000000).toFixed(1) + 'M' : (m.context_window / 1000).toFixed(0) + 'K') : '-';
    const card = document.createElement('div');
    card.className = 'siper-model-card card-hover';
    card.dataset.modelName = m.name;
    card.innerHTML =
      '<div class="siper-model-card-header">' +
        '<span class="siper-model-name" title="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + '</span>' +
        '<button class="siper-btn small danger btn-model-delete" onclick="window.chatRemoveModel(' + (settingsModelsCache.length - 1) + ')" title="删除">✕</button>' +
      '</div>' +
      '<div class="siper-model-provider">' + escapeHtml(m.provider || '') + '</div>' +
      '<div class="siper-model-meta">' +
        (ctx !== '-' ? '<span class="siper-meta-tag">' + ctx + '</span>' : '') +
      '</div>' +
      '<div class="siper-model-caps-wrap">' +
        (capBadges ? '<div class="siper-model-caps">' + capBadges + '</div>' : '') +
        '<button class="siper-btn small btn-verify" data-idx="' + (settingsModelsCache.length - 1) + '" title="验证">🔍</button>' +
      '</div>';
    grid.appendChild(card);
  }
  autoSaveModels();
  if (toast) toast.success('已添加: ' + m.name, 1200);
  // Refresh discover panel: this model disappears, filter still works
  renderChatDiscoverList();
}

export function chatAddAllDiscoveredModels() {
  let added = 0;
  const newCards = [];
  discoveredModelsCache.forEach(m => {
    if (settingsModelsCache.find(x => x.name === m.name)) return;
    settingsModelsCache.push({
      id: m.name, name: m.name,
      base_url: m.base_url || '', api_key: m.api_key || '',
      capabilities: m.capabilities || [],
      context_window: m.context_window || null,
      streaming: m.streaming || null,
      json_mode: m.json_mode || null,
      ttft: m.ttft || null,
      context_window_tested: m.context_window_tested || null,
    });
    newCards.push(m);
    added++;
  });
  if (added > 0) {
    // Append new cards to grid
    const grid = document.querySelector('#chatGlobalModels .siper-models-grid');
    if (grid) {
      newCards.forEach(m => {
        const capBadges = renderCapBadges(m.capabilities);
        const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window / 1000000).toFixed(1) + 'M' : (m.context_window / 1000).toFixed(0) + 'K') : '-';
        const card = document.createElement('div');
        card.className = 'siper-model-card card-hover';
        card.dataset.modelName = m.name;
        card.innerHTML =
          '<div class="siper-model-card-header">' +
            '<span class="siper-model-name" title="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + '</span>' +
            '<button class="siper-btn small danger btn-model-delete" onclick="window.chatRemoveModel(' + (settingsModelsCache.length - 1) + ')" title="删除">✕</button>' +
          '</div>' +
          '<div class="siper-model-provider">' + escapeHtml(m.provider || '') + '</div>' +
          '<div class="siper-model-meta">' +
            (ctx !== '-' ? '<span class="siper-meta-tag">' + ctx + '</span>' : '') +
          '</div>' +
          '<div class="siper-model-caps-wrap">' +
            (capBadges ? '<div class="siper-model-caps">' + capBadges + '</div>' : '') +
            '<button class="siper-btn small btn-verify" data-idx="' + (settingsModelsCache.length - 1) + '" title="验证">🔍</button>' +
          '</div>';
        grid.appendChild(card);
      });
    }
    autoSaveModels();
    if (toast) toast.success('已添加 ' + added + ' 个模型');
    // Re-render discover panel to hide added models
    renderChatDiscoverList();
  } else {
    if (toast) toast.info('没有新模型可添加');
  }
}

// ===== Window Mount (动态 HTML onclick 需要) =====
window.addDiscoveredModel = addDiscoveredModel;
window.addAllDiscoveredModels = addAllDiscoveredModels;
window.chatRemoveModel = chatRemoveModel;
window.chatAddAllDiscoveredModels = chatAddAllDiscoveredModels;
window.chatVerifyDiscoveredModel = chatVerifyDiscoveredModel;
window.chatFilterDiscovered = chatFilterDiscovered;
window.chatClearDiscoverFilter = chatClearDiscoverFilter;

// Event delegation for discover panel verify buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#wcfgDiscoverResult .btn-verify-discover');
  if (!btn) return;
  e.stopPropagation();
  const idx = parseInt(btn.dataset.idx, 10);
  if (!isNaN(idx) && typeof window.chatVerifyDiscoveredModel === 'function') {
    window.chatVerifyDiscoveredModel(idx);
  }
});

// Event delegation for model name marquee (siper-models-grid + discover panel)
document.addEventListener('mouseenter', (e) => {
  const nameEl = e.target.closest('.siper-models-grid .siper-model-name, #wcfgDiscoverResult .siper-model-name');
  if (!nameEl || nameEl._marqueeTimer) return;
  if (nameEl.scrollWidth <= nameEl.clientWidth + 1) return; // no overflow, skip
  const overflow = nameEl.scrollWidth - nameEl.clientWidth;
  const duration = Math.max(1500, overflow * 20); // ~20px/s, min 1.5s
  nameEl.style.transition = `transform ${duration}ms linear`;
  nameEl.style.transform = `translateX(-${overflow}px)`;
  nameEl._marqueeTimer = setTimeout(() => {
    // Stop at the end — text fully revealed
    nameEl.style.transition = 'none';
    nameEl._marqueeTimer = null;
  }, duration);
}, true);

document.addEventListener('mouseleave', (e) => {
  const nameEl = e.target.closest('.siper-models-grid .siper-model-name, #wcfgDiscoverResult .siper-model-name');
  if (!nameEl) return;
  if (nameEl._marqueeTimer) {
    clearTimeout(nameEl._marqueeTimer);
    nameEl._marqueeTimer = null;
  }
  nameEl.style.transition = 'transform 300ms ease-out';
  nameEl.style.transform = 'translateX(0)';
}, true);
