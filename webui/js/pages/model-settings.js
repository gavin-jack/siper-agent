// pages/model-settings.js — 模型管理独立页面
// 从 settings.js 拆出全部模型管理逻辑
// 2026-07-25: 模型管理从全局设置页独立为单独页面

import { t } from '../utils/i18n.js';
import { escapeHtml } from '../utils/escape.js';
import { confirmDeleteModel, showConfirm } from '../components/toast.js';
import { toast } from '../components/toast.js';
import { renderCapBadges } from '../utils/capabilities.js';

// ===== Models State =====
export let settingsModelsCache = [];
export let discoveredModelsCache = [];

// ===== Models Management =====

export async function loadSettingsModels() {
  // Show loading state immediately
  const list = document.getElementById('settingsModelsList');
  if (list) list.innerHTML = '<div class="js-empty-state-lg" style="padding:24px;text-align:center;">⏳ 加载模型数据中...</div>';
  try {
    let d;
    // 起源：优先从快照 page_cache 获取
    if (typeof window.__getPageCache === 'function') {
      const cache = window.__getPageCache('model-settings');
      if (cache && cache.models) {
        d = { models: cache.models };
      }
    }
    // 过渡期：HTTP 请求兜底
    if (!d) {
      const r = await fetch('/api/models/global');
      d = await r.json();
    }
    settingsModelsCache = (d.models || []).map(m => ({
      ...m,
      _ttft: m.ttft ?? m._ttft ?? null,
      _streaming: m.streaming ?? m._streaming ?? null,
      _context_window_tested: m.context_window_tested ?? m._context_window_tested ?? null,
      _json_mode: m.json_mode ?? m._json_mode ?? null,
      ttft: m.ttft ?? m._ttft ?? null,
      streaming: m.streaming ?? m._streaming ?? null,
      context_window_tested: m.context_window_tested ?? m._context_window_tested ?? null,
      json_mode: m.json_mode ?? m._json_mode ?? null,
    }));
    window.settingsModelsCache = settingsModelsCache;
    const _defaultModel = settingsModelsCache.find(m => m.is_default);
    const def = _defaultModel ? _defaultModel.name : '';
    settingsModelsCache.forEach(m => { m._isDefault = (m.name === def); });
    renderSettingsModelsList();
    // Update title with model count
    const _titleEl = document.querySelector('.siper-form-title span');
    if (_titleEl && _titleEl.textContent.includes('可用模型')) {
      _titleEl.textContent = `可用模型（${settingsModelsCache.length}）`;
    }
    if (settingsModelsCache.length === 0) {
      if (toast) toast.warning('模型数据库为空，请先添加模型配置', 3000);
    } else {
      if (toast) toast.success('已刷新 ' + settingsModelsCache.length + ' 个模型', 2000);
    }
  } catch(e) {
    console.error('loadSettingsModels error:', e);
    const list = document.getElementById('settingsModelsList');
    if (list) list.innerHTML = '<div class="settings-empty-msg">加载失败</div>';
  }
}

export function renderSettingsModelsList() {
  const list = document.getElementById('settingsModelsList');
  if (!list) return;
  if (!settingsModelsCache || settingsModelsCache.length === 0) {
    list.innerHTML = '<div class="settings-empty-msg">' + t('settings.addModel') + '</div>';
    return;
  }

  // Determine if we should show groups (not during active search/filter/sort)
  const searchText = (document.getElementById('modelSearchInput')?.value || '').trim();
  const hasCapFilter = _selectedCaps.size > 0;
  const hasSort = _sortDir !== 'asc';
  const showGroups = !searchText && !hasCapFilter && !hasSort;

  // Calculate dynamic max-height for the list container (synchronous)
  const rect = list.getBoundingClientRect();
  const availableH = window.innerHeight - rect.top - 20;
  list.style.maxHeight = Math.max(200, availableH) + 'px';
  list.style.overflowY = 'auto';

  let html = '';

  if (showGroups) {
    // Group models by base_url
    const groups = new Map();
    settingsModelsCache.forEach((m, i) => {
      const key = m.base_url || '';
      if (!groups.has(key)) groups.set(key, { base_url: key, models: [], provider: m.provider || '', provider_name: m.provider_name || '' });
      groups.get(key).models.push({ ...m, _idx: i });
    });

    // Sort groups: default provider first, then by name
    const sortedGroups = [...groups.values()].sort((a, b) => {
      const aHasDefault = a.models.some(m => m._isDefault);
      const bHasDefault = b.models.some(m => m._isDefault);
      if (aHasDefault && !bHasDefault) return -1;
      if (!aHasDefault && bHasDefault) return 1;
      return a.base_url.localeCompare(b.base_url);
    });

    sortedGroups.forEach(group => {
      const providerLabel = group.provider_name || group.base_url;
      html += `<div class="model-group-header" data-base-url="${escapeHtml(group.base_url)}" style="display:flex;align-items:center;gap:6px;margin-top:10px;margin-bottom:4px;padding:4px 0;border-bottom:1px solid var(--color-border);">`;
      html += `<span class="model-group-label" class="js-model-name" onclick="window.editProviderName('${escapeHtml(group.base_url)}')" title="点击编辑 Provider 名称">${escapeHtml(providerLabel)}</span>`;
      html += `<span class="model-group-count" class="js-text-dim-xs">(${group.models.length})</span>`;
      html += `</div>`;

      const cards = group.models.map((m) => buildCardHtml(m, m._idx)).join('');
      html += `<div class="models-grid">${cards}</div>`;
    });
  } else {
    // Flat view during search/filter
    const cards = settingsModelsCache.map((m, i) => buildCardHtml(m, i)).join('');
    html += `<div class="models-grid">${cards}</div>`;
    // Flat view during search/filter/sort — show restore button
    if (searchText || hasCapFilter || hasSort) {
      const parts = [];
      if (searchText) parts.push(`搜索: "${escapeHtml(searchText)}"`);
      if (hasCapFilter) parts.push(`${_selectedCaps.size}项筛选`);
      if (hasSort) parts.push(`排序: ${_sortDir === 'desc' ? '↓' : '↑'}`);
      const desc = parts.join(' + ');
      html = `<div class="js-model-card">` +
        `<span class="js-text-dim">📋 ${desc}</span>` +
        `<button class="siper-btn" class="js-btn-xs" onclick="window.clearModelFilter()">恢复分组</button>` +
        `</div>` + html;
    }
  }

  list.innerHTML = html;

  // Entrance animation: animate only newly added cards (stagger 30ms)
  const currentCount = list.querySelectorAll('.model-card').length;
  const prevCount = _lastRenderCount;
  _lastRenderCount = currentCount;
  if (currentCount > prevCount) {
    requestAnimationFrame(() => {
      const allCards = list.querySelectorAll('.model-card');
      for (let i = prevCount; i < allCards.length; i++) {
        const card = allCards[i];
        card.classList.add('model-card-animate');
        card.style.animationDelay = `${(i - prevCount) * 30}ms`;
        setTimeout(() => {
          card.classList.remove('model-card-animate');
          card.style.animationDelay = '';
        }, 250 + (i - prevCount) * 30 + 50);
      }
    });
  }

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

/** Build a single model card HTML string */
function buildCardHtml(m, i) {
  const alias = m.alias ? ` (${m.alias})` : '';
  const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window/1000000).toFixed(1)+'M' : (m.context_window/1000).toFixed(0)+'K') : '-';
  const capBadges = renderCapBadges(m.capabilities);
  const ctxTested = m.context_window_tested ? (m.context_window_tested >= 1000000 ? (m.context_window_tested/1000000).toFixed(1)+'M' : (m.context_window_tested/1000).toFixed(0)+'K') : '';
  const ttft = m.ttft ? formatSpeed(m.ttft) : '';
  const latency = (m._latency || m.latency) ? `${formatSpeed(m._latency || m.latency)}` : '';
  const streaming = m.streaming ? '⚡流式' : '';
  const jsonMode = m.json_mode ? '📋json' : '';
  // Deduplicate: only show latency in meta if not already shown as ttft
  const latencyOnly = m._latency && !m.ttft ? latency : '';
  const metaTags = [ctxTested, ttft, latencyOnly, streaming, jsonMode].filter(Boolean).map(t2 => '<span class="siper-meta-tag">' + t2 + '</span>').join('');
  const verifyBtnHtml = m._verified === "pending"
    ? `<button class="btn-sm btn-verify-pending" disabled title="检测中...">⏳</button>`
    : `<button class="btn-sm btn-verify" data-idx="${i}" title="验证可用性">🔍</button>`;
  return `
    <div class="model-card card-left-accent${m._verified === 'pending' ? ' model-card-verifying' : m._verified === true ? ' model-verify-pass' : m._verified === false ? ' model-verify-fail' : ''}" data-model-name="${escapeHtml(m.name)}" data-caps="${(m.capabilities || []).join(',')}" data-ttft="${m.ttft || 99999}" data-latency="${m._latency || m.latency || 99999}" data-context="${m.context_window || 0}">
      <div class="model-card-header">
        <div class="model-name-scroll">
          <span class="model-name-text" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
        </div>
        <div class="model-card-actions">
          <button class="btn-sm btn-copy-model" data-name="${escapeHtml(m.name)}" title="复制模型名称">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="5" width="9" height="9" rx="1.5" opacity="0.6"/><rect x="2" y="2" width="9" height="9" rx="1.5"/></svg>
          </button>
          <button class="btn-sm danger" onclick="window.removeSettingsModel(${i})" title="删除模型">✕</button>
        </div>
      </div>
      <div class="siper-model-meta">${ctx ? '<span class="siper-meta-tag">ctx ' + ctx + '</span>' : ''}${metaTags}</div>
      ${m._verified === false && m._error ? `<div class="model-card-error" class="js-text-danger-sm">❌ ${escapeHtml(m._error)}</div>` : ''}
      <div class="model-card-actions-bottom">
        <div class="model-caps-scroll">
          ${m._verified === "pending" ? `<div class="model-caps-inner" class="js-text-warning-sm"><span class="pulse">⏳</span> 正在更新模型能力...</div>` : (capBadges ? `<div class="model-caps-inner">${capBadges}</div>` : '')}
        </div>
        ${verifyBtnHtml}
      </div>
    </div>`;
}

/** Edit provider name for a base_url group */
export async function editProviderName(baseUrl) {
  const current = settingsModelsCache.find(m => m.base_url === baseUrl);
  const currentName = current ? (current.provider_name || current.provider || baseUrl) : baseUrl;
  const newName = prompt('请输入 Provider 名称（留空使用 Base URL）:', currentName);
  if (newName === null) return; // cancelled
  const trimmed = newName.trim();

  try {
    // 起源：通过 WS 通知后端
    if (typeof window.siPerSend === 'function') {
      window.siPerSend({ type: 'edit_provider_name', base_url: baseUrl, provider: trimmed });
    }
    // 过渡期：HTTP 请求
    const r = await fetch('/api/providers/update_name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, provider: trimmed }),
    });
    const d = await r.json();
    if (d.success) {
      // Update frontend cache
      settingsModelsCache.forEach(m => {
        if (m.base_url === baseUrl) {
          m.provider_name = trimmed || '';
        }
      });
      renderSettingsModelsList();
      autoSaveModels();
      if (toast) toast.success('Provider 已重命名: ' + oldId + ' → ' + newId, 2000);
    } else {
      if (toast) toast.error('重命名失败: ' + (d.error || '未知错误'));
    }
  } catch(e) {
    if (toast) toast.error('重命名失败: ' + e.message);
  }
}

export async function removeSettingsModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  confirmDeleteModel(m.name, async () => {
    // 起源：通过 WS 通知后端
    if (typeof window.siPerSend === 'function') {
      window.siPerSend({ type: 'delete_model', id: m.id || m.name, provider: m.provider });
    }
    // 过渡期：HTTP 请求
    try {
      const r = await fetch(`/api/models/${encodeURIComponent(m.id || m.name)}?provider=${encodeURIComponent(m.provider || '')}`, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) {
        if (toast) toast.error('删除失败: ' + (d.error || 'unknown'));
        return;
      }
    } catch(e) {
      if (toast) toast.error('删除失败: ' + e.message);
      return;
    }
    // 2. Remove from frontend cache + UI
    settingsModelsCache.splice(idx, 1);
    renderSettingsModelsList();
    // Update title count
    const _titleEl = document.querySelector('.siper-form-title span');
    if (_titleEl && _titleEl.textContent.includes('可用模型')) {
      _titleEl.textContent = `可用模型（${settingsModelsCache.length}）`;
    }
    if (toast) toast.success('已删除模型: ' + m.name, 1500);
  });
}

// ===== Model Discovery =====

export async function discoverModels() {
  const baseUrl = document.getElementById('discoverBaseUrl')?.value.trim();
  const apiKey = document.getElementById('discoverApiKey')?.value.trim();
  if (!baseUrl) { if (toast) toast.warning(t('toast.enterBaseUrl')); return; }
  if (!apiKey) { if (toast) toast.warning(t('toast.enterApiKey')); return; }

  const resultEl = document.getElementById('discoverResult');
  const btn = document.getElementById('discoverBtn');
  if (btn) { btn.disabled = true; btn.textContent = '获取中...'; }
  if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">⏳ 正在获取模型列表...</div>';

  try {
    // 起源：通过 WS 通知后端
    if (typeof window.siPerSend === 'function') {
      window.siPerSend({ type: 'discover_models', base_url: baseUrl, api_key: apiKey });
    }
    // 过渡期：HTTP 请求
    const r = await fetch('/api/models/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
    });
    const d = await r.json();
    if (d.success && d.models && d.models.length > 0) {
      discoveredModelsCache = d.models;
      // Clear previous filter
      const filterInput = document.getElementById('discoverFilter');
      if (filterInput) filterInput.value = '';
      renderDiscoveredModels(discoveredModelsCache, d.provider, d.count);
    } else if (d.success && d.models && d.models.length === 0) {
      if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">未找到可用模型</div>';
    } else {
      if (resultEl) resultEl.innerHTML = `<div class="settings-empty-msg settings-empty-err">❌ ${escapeHtml(d.error || '获取失败')}</div>`;
    }
  } catch(e) {
    if (resultEl) resultEl.innerHTML = `<div class="settings-empty-msg settings-empty-err">❌ ${escapeHtml(e.message)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 获取模型列表'; }
  }
}

export function renderDiscoveredModels(models, provider, count) {
  const resultEl = document.getElementById('discoverResult');
  if (!resultEl) return;
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
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
      const capBadges = caps.map(c => `<span class="cap-badge cap-badge-${c}" title="${capLabels[c] || c}">${capIcons[c] || c}</span>`).join('');
      return `
      <div class="model-card model-card-discover" data-name="${escapeHtml(m.name)}">
        <div class="model-discover-info">
          <div class="model-discover-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name.length > 22 ? m.name.substring(0, 20) + '..' : m.name)}</div>
          <div class="model-discover-meta">${escapeHtml(m.provider || '')} · ctx:${ctx} · ${escapeHtml(m.base_url || '')}</div>
          ${capBadges ? `<div class="model-card-caps">${capBadges}</div>` : ''}
        </div>
        <button class="btn-sm primary btn-discover-add" onclick="addDiscoveredModel(${i})">添加</button>
      </div>`;
    }).join('')}
  `;
  // Show filter bar when 6+ models
  const filterWrap = document.getElementById('discoverFilterWrap');
  if (filterWrap) filterWrap.style.display = models.length >= 6 ? 'block' : 'none';
}

export function filterDiscovered() {
  const filterInput = document.getElementById('discoverFilter');
  const clearBtn = document.getElementById('discoverFilterClear');
  if (filterInput && clearBtn) {
    clearBtn.style.display = filterInput.value ? 'block' : 'none';
  }
  const text = (filterInput?.value || '').trim().toLowerCase();
  const cards = document.querySelectorAll('#discoverResult .model-card-discover');
  let shown = 0;
  cards.forEach(card => {
    const name = (card.dataset.name || '').toLowerCase();
    const match = !text || name.includes(text);
    card.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  const header = document.querySelector('#discoverResult .discover-result-header');
  if (header && text) {
    header.innerHTML = `🔍 筛选: <strong>"${escapeHtml(text)}"</strong> · 匹配 ${shown}/${cards.length} 个
      <span class="discover-header-actions">
        <button class="btn-sm btn-discover-add-one" onclick="addDiscoveredModel(0)">添加模型</button>
        <button class="btn-sm primary btn-discover-add-all" onclick="addAllDiscoveredModels()">全部添加</button>
      </span>`;
  } else if (header) {
    header.innerHTML = `✅ 发现 <strong class="discover-count">${cards.length}</strong> 个模型
      <span class="discover-header-actions">
        <button class="btn-sm btn-discover-add-one" onclick="addDiscoveredModel(0)">添加模型</button>
        <button class="btn-sm primary btn-discover-add-all" onclick="addAllDiscoveredModels()">全部添加</button>
      </span>`;
  }
}

export function clearDiscoverFilter() {
  const filterInput = document.getElementById('discoverFilter');
  if (filterInput) {
    filterInput.value = '';
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function addDiscoveredModel(idx) {
  const m = discoveredModelsCache[idx];
  if (!m) return;
  if (settingsModelsCache.find(x => x.name === m.name && x.provider === m.provider)) {
    if (toast) toast.warning(t('toast.modelExists') + ': ' + m.name);
    return;
  }
  doAddDiscoveredModel(idx);
}

export async function doAddDiscoveredModel(idx) {
  const m = discoveredModelsCache[idx];
  if (!m) return;
  settingsModelsCache.push({
    id: m.id || m.name,
    name: m.name,
    alias: m.alias || '',
    provider: m.provider,
    provider_name: m.provider_name || '',
    base_url: m.base_url,
    api_key: m.api_key,
    context_window: m.context_window,
    capabilities: m.capabilities || [],
  });
  if (settingsModelsCache.length === 1) {
    settingsModelsCache[0]._isDefault = true;
  }
  renderSettingsModelsList();
  await saveModelsImmediate();
}

export async function addAllDiscoveredModels() {
  let added = 0;
  discoveredModelsCache.forEach(m => {
    if (settingsModelsCache.find(x => x.name === m.name && x.provider === m.provider)) return;
    settingsModelsCache.push({
      id: m.id || m.name,
      name: m.name,
      alias: m.alias || '',
      provider: m.provider,
      provider_name: m.provider_name || '',
      base_url: m.base_url,
      api_key: m.api_key,
      context_window: m.context_window,
      capabilities: m.capabilities || [],
    });
    added++;
  });
  if (settingsModelsCache.length > 0 && !settingsModelsCache.find(m => m._isDefault)) {
    settingsModelsCache[0]._isDefault = true;
  }
  renderSettingsModelsList();
  await saveModelsImmediate();
  if (toast) toast.success('已添加 ' + added + ' 个模型');
}

// ===== Auto Save =====

export let _autoSaveTimer = null;

async function saveModelsImmediate() {
  try {
    const modelsToSave = settingsModelsCache.map(m => ({
      id: m.id || m.name,
      name: m.name,
      alias: m.alias || '',
      provider: m.provider,
      provider_name: m.provider_name || '',
      base_url: m.base_url,
      api_key: m.api_key,
      context_window: m.context_window,
      capabilities: m.capabilities || [],
      is_default: m._isDefault || false,
      ttft: m.ttft || null,
      latency: m._latency || m.latency || null,
      streaming: m.streaming || null,
      context_window_tested: m.context_window_tested || null,
      json_mode: m.json_mode || null,
    }));
    const defaultModel = settingsModelsCache.find(m => m._isDefault || m.is_default);
    // 起源：通过 WS 通知后端
    if (typeof window.siPerSend === 'function') {
      window.siPerSend({ type: 'save_models', models: modelsToSave });
    }
    // 过渡期：HTTP 请求
    const r = await fetch('/api/models/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models: modelsToSave }),
    });
    const d = await r.json();
    if (!d.success) toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
    else {
      if (typeof loadChatAgents === 'function') {
        loadChatAgents().then(() => {
          if (typeof loadChatModels === 'function') loadChatModels();
        });
      }
    }
  } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
}

export function autoSaveModels() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    await saveModelsImmediate();
    if (toast) toast.success(t('settings.modelSaved'), 1500);
  }, 300);
}

// ===== Quick Provider Presets =====

export function applyProviderPreset() {
  const preset = document.getElementById('providerPreset')?.value;
  const urlInput = document.getElementById('discoverBaseUrl');
  if (!preset) return;
  if (preset === 'custom') {
    if (urlInput) { urlInput.value = ''; urlInput.disabled = false; }
    const apiKeyEl = document.getElementById('discoverApiKey');
    if (apiKeyEl) apiKeyEl.value = '';
    if (urlInput) urlInput.focus();
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
  if (p && urlInput) {
    urlInput.value = p.base_url;
    urlInput.disabled = true;
  }
}

// ===== Reset =====

export function resetSettingsModels() {
  showConfirm({
    title: t('settings.confirmReset') || '重置模型',
    msg: '确定要清除所有模型配置吗？',
    impact: '⚠ 将删除 models.db 数据库，清空所有已添加的模型、默认模型设置、Provider 配置，并清理所有 Agent 中的模型引用。此操作不可恢复！',
    danger: true,
    okText: '确认清除',
    onConfirm: async () => {
      // 起源：通过 WS 通知后端
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'reset_models' });
      }
      // 过渡期：HTTP 请求
      try {
        const r = await fetch('/api/models/reset', { method: 'POST' });
        const d = await r.json();
        if (d.success) {
          settingsModelsCache = [];
          discoveredModelsCache = [];
          const ids = ['discoverBaseUrl','discoverApiKey','discoverResult','newModelName','newModelProvider','newModelBaseUrl','newModelApiKey','newModelCtx'];
          ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = (id === 'newModelCtx' ? '8192' : ''); });
          renderSettingsModelsList();
          if (toast) toast.success('已清除所有模型配置', 2000);
        } else {
          if (toast) toast.error(d.error || '重置失败');
        }
      } catch(e) {
        if (toast) toast.error('重置失败: ' + (e.message || e));
      }
    }
  });
}

// ===== Copy Model Name =====

export function copyModelName(evt, name) {
  // 事件委托场景：evt.target 是实际被点击的元素（可能是 SVG），需要 closest('button')
  const btn = (evt && evt.target && evt.target.closest('button')) || (evt && evt.currentTarget);
  if (!btn || !btn.classList.contains('btn-copy-model')) return;

  const showOk = () => {
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="var(--green)"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>';
    setTimeout(() => {
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="5" width="9" height="9" rx="1.5" opacity="0.6"/><rect x="2" y="2" width="9" height="9" rx="1.5"/></svg>';
    }, 1200);
  };

  const fallbackModal = () => {
    const existing = document.getElementById('copyNameModal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'copyNameModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:90%;min-width:300px"><div style="font-weight:600;margin-bottom:12px">复制</div><input type="text" value="' + name.replace(/"/g, '&quot;') + '" readonly style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;box-sizing:border-box" onclick="this.select()"><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button id="copyNameModalClose" class="btn-sm primary">关闭</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#copyNameModalClose').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    setTimeout(() => { const inp = overlay.querySelector('input'); if (inp) { inp.focus(); inp.select(); } }, 50);
  };

  // Strategy 1: Clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(name).then(() => { showOk(); if (toast) toast.success('已复制'); }).catch(() => {
      // Strategy 2: execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = name;
        ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        if (document.execCommand('copy')) { document.body.removeChild(ta); showOk(); if (toast) toast.success('已复制'); return; }
        document.body.removeChild(ta);
      } catch(e) {}
      // Strategy 3: modal
      fallbackModal();
      showOk();
    });
  } else {
    fallbackModal();
    showOk();
  }
}

// ===== Window Mount =====
window.addDiscoveredModel = addDiscoveredModel;
window.addAllDiscoveredModels = addAllDiscoveredModels;
window.chatFilterDiscovered = filterDiscovered;
window.chatClearDiscoverFilter = clearDiscoverFilter;
window.filterModelsList = filterModelsList;
window.removeSettingsModel = removeSettingsModel;
window.verifyAllModels = verifyAllModels;
window.clearModelSearch = clearModelSearch;
window.toggleCapFilterDropdown = toggleCapFilterDropdown;
window.selectCapFilter = selectCapFilter;
window.applyCapFilter = applyCapFilter;
window.clearCapFilter = clearCapFilter;
window.clearModelFilter = clearModelFilter;
window.toggleSortDir = toggleSortDir;
window.editProviderName = editProviderName;
window.discoverModels = discoverModels;
window.resetSettingsModels = resetSettingsModels;
window.addModelFromForm = addModelFromForm;

/** Refresh model settings page — called by navigateToPage */
export function refreshModelsPage() {
  loadSettingsModels();
}

/** Add model from the manual add form */
export function addModelFromForm() {
  const name = document.getElementById('newModelName')?.value.trim();
  const provider = document.getElementById('newModelProvider')?.value.trim() || 'custom';
  const base_url = document.getElementById('newModelBaseUrl')?.value.trim();
  const api_key = document.getElementById('newModelApiKey')?.value.trim();
  const ctx = parseInt(document.getElementById('newModelCtx')?.value) || 8192;
  if (!name) { if (toast) toast.warning('请输入模型名称'); return; }
  if (settingsModelsCache.find(x => x.name === name)) {
    if (toast) toast.warning('模型已存在: ' + name); return;
  }
  settingsModelsCache.push({
    id: name, name, alias: '', provider, base_url, api_key,
    context_window: ctx, capabilities: [],
  });
  if (settingsModelsCache.length === 1) settingsModelsCache[0]._isDefault = true;
  renderSettingsModelsList();
  saveModelsImmediate();
  // Clear form
  ['newModelName','newModelProvider','newModelBaseUrl','newModelApiKey'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  if (toast) toast.success('已添加模型: ' + name, 1500);
}

// ===== Search / Filter / Sort =====

// Selected capabilities for multi-select filter
let _selectedCaps = new Set();
let _sortDir = 'asc'; // 'asc' or 'desc'
let _lastRenderCount = 0; // track model count to animate only new cards

/**
 * Format TTFT/latency ms into human-readable string with color.
 * < 500ms = fast (blue), 500-1500ms = medium (orange), > 1500ms = slow (red)
 */
function formatSpeed(ms) {
  if (!ms || ms <= 0) return '';
  let color, label;
  if (ms < 500) {
    color = '#3b82f6'; // blue — fast
    label = ms < 100 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  } else if (ms < 1500) {
    color = '#f59e0b'; // amber — medium
    label = `${(ms / 1000).toFixed(1)}s`;
  } else {
    color = '#ef4444'; // red — slow
    label = `${(ms / 1000).toFixed(1)}s`;
  }
  return `<span style="color:${color};font-weight:500;">${label}</span>`;
}

export function filterModelsList() {
  const searchText = (document.getElementById('modelSearchInput')?.value || '').trim().toLowerCase();
  const sortBy = document.getElementById('modelSortBy')?.value || 'name';

  // Toggle clear button
  const clearBtn = document.getElementById('modelSearchClear');
  if (clearBtn) clearBtn.style.display = searchText ? 'block' : 'none';

  const cards = document.querySelectorAll('#settingsModelsList .model-card');
  let visibleCount = 0;

  cards.forEach(card => {
    const name = (card.dataset.modelName || '').toLowerCase();
    const caps = (card.dataset.caps || '').toLowerCase();
    const matchSearch = !searchText || name.includes(searchText);
    // Multi-cap filter: card must have ALL selected caps
    const capsArr = caps ? caps.split(',').filter(Boolean) : [];
    const matchCap = _selectedCaps.size === 0 || [..._selectedCaps].every(c => capsArr.includes(c));
    const show = matchSearch && matchCap;
    card.style.display = show ? '' : 'none';
    if (show) visibleCount++;
  });

  // Hide group headers when all their cards are hidden
  const grids = document.querySelectorAll('#settingsModelsList .models-grid');
  grids.forEach(grid => {
    const gridCards = grid.querySelectorAll('.model-card');
    const allHidden = gridCards.length > 0 && [...gridCards].every(c => c.style.display === 'none');
    const prevHeader = grid.previousElementSibling;
    if (prevHeader && prevHeader.classList.contains('model-group-header')) {
      prevHeader.style.display = allHidden ? 'none' : '';
    }
  });

  // Sort visible cards
  const grid = document.getElementById('settingsModelsList')?.querySelector('.models-grid');
  if (grid && sortBy) {
    const sorted = [...cards].filter(c => c.style.display !== 'none');
    const dir = _sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = (a.dataset.modelName || '').localeCompare(b.dataset.modelName || '');
      } else if (sortBy === 'ttft') {
        cmp = (parseInt(a.dataset.ttft) || 99999) - (parseInt(b.dataset.ttft) || 99999);
      } else if (sortBy === 'latency') {
        cmp = (parseInt(a.dataset.latency) || 99999) - (parseInt(b.dataset.latency) || 99999);
      } else if (sortBy === 'context') {
        cmp = (parseInt(a.dataset.context) || 0) - (parseInt(b.dataset.context) || 0);
      } else if (sortBy === 'caps') {
        cmp = ((a.dataset.caps || '').split(',').filter(Boolean).length) - ((b.dataset.caps || '').split(',').filter(Boolean).length);
      }
      return cmp * dir;
    });
    sorted.forEach(c => grid.appendChild(c));
  }

  // Update header count
  const total = cards.length;
  const header = document.querySelector('#chatRightHeader .siper-chat-header-name');
  if (header) {
    const base = header.dataset.baseTitle || header.textContent;
    header.dataset.baseTitle = base;
    header.textContent = visibleCount < total ? `${base} (${visibleCount}/${total})` : base;
  }
}

export function clearModelSearch() {
  const input = document.getElementById('modelSearchInput');
  if (input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function toggleCapFilterDropdown() {
  const menu = document.getElementById('capFilterMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

export function selectCapFilter(cap) {
  if (cap === '') {
    _selectedCaps.clear();
  } else {
    if (_selectedCaps.has(cap)) _selectedCaps.delete(cap);
    else _selectedCaps.add(cap);
  }
  // Update button label
  const label = document.getElementById('capFilterLabel');
  if (label) {
    const capLabels = { chat: '💬对话', vision: '👁视觉', reasoning: '🧠推理', code: '💻代码', function_calling: '🔧工具调用', tts: '🔊语音', embedding: '📎嵌入', image_gen: '🎨生图', long_context: '📏长上下文' };
    if (_selectedCaps.size === 0) label.textContent = '全部功能';
    else if (_selectedCaps.size <= 2) label.textContent = [..._selectedCaps].map(c => capLabels[c] || c).join('+');
    else label.textContent = `${_selectedCaps.size}项筛选`;
  }
  // Update check marks in menu
  document.querySelectorAll('#capFilterMenu .cap-filter-option').forEach(opt => {
    const c = opt.dataset.cap;
    const cb = opt.querySelector('input[type="checkbox"]');
    if (cb) {
      if (c === '') cb.checked = _selectedCaps.size === 0;
      else cb.checked = _selectedCaps.has(c);
    }
  });
  // Do NOT close menu or apply filter — user must click 确定
}

/** Apply filter and close dropdown */
export function applyCapFilter() {
  const menu = document.getElementById('capFilterMenu');
  if (menu) menu.style.display = 'none';
  filterModelsList();
}

/** Clear all selected caps and reset UI */
export function clearCapFilter() {
  _selectedCaps.clear();
  const label = document.getElementById('capFilterLabel');
  if (label) label.textContent = '全部功能';
  document.querySelectorAll('#capFilterMenu .cap-filter-option input[type="checkbox"]').forEach(cb => {
    cb.checked = cb.closest('.cap-filter-option').dataset.cap === '';
  });
  // Do NOT auto-apply — user must click 确定
}

/** Clear all filters (search + cap filter + sort) and restore grouped view */
export function clearModelFilter() {
  _selectedCaps.clear();
  _sortDir = 'asc';
  const input = document.getElementById('modelSearchInput');
  if (input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const label = document.getElementById('capFilterLabel');
  if (label) label.textContent = '全部功能';
  document.querySelectorAll('#capFilterMenu .cap-filter-option input[type="checkbox"]').forEach(cb => {
    cb.checked = cb.closest('.cap-filter-option').dataset.cap === '';
  });
  const menu = document.getElementById('capFilterMenu');
  if (menu) menu.style.display = 'none';
  const sortBtn = document.getElementById('sortDirBtn');
  if (sortBtn) sortBtn.textContent = '↑';
  renderSettingsModelsList();
}

export function toggleSortDir() {
  _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  const btn = document.getElementById('sortDirBtn');
  if (btn) btn.textContent = _sortDir === 'asc' ? '↑' : '↓';
  renderSettingsModelsList();
  filterModelsList();
}

export async function verifyAllModels() {
  if (!settingsModelsCache.length) {
    if (toast) toast.warning('没有可验证的模型');
    return;
  }
  if (toast) toast.info(`开始验证全部 ${settingsModelsCache.length} 个模型...`);

  const CONCURRENCY = 3;
  const queue = [...settingsModelsCache.entries()].filter(([, m]) => m.base_url && m.api_key);
  let done = 0;
  const total = queue.length;

  // Mark all as pending
  queue.forEach(([, m]) => { m._verified = 'pending'; });
  renderSettingsModelsList();

  async function verifyOne(m) {
    try {
      const { testModel } = await import('../components/model-test.js');
      const d = await testModel(m.base_url, m.api_key, m.name, m.provider);
      if (d.success) {
        const caps = d.capabilities || [];
        if (caps.length) {
          m.capabilities = Array.from(new Set([...(m.capabilities || []), ...caps]));
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
        if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) {
          m.context_window = d.context_window_tested;
        }
      } else {
        m._verified = false;
        m._error = d.error || '连接失败';
      }
    } catch(err) {
      m._verified = false;
      m._error = err.message || '请求失败';
    }
    done++;
    renderSettingsModelsList();
  }

  // Process queue with concurrency limit
  let idx = 0;
  const workers = Array(Math.min(CONCURRENCY, total)).fill(null).map(async () => {
    while (idx < total) {
      const i = idx++;
      await verifyOne(queue[i][1]);
    }
  });
  await Promise.all(workers);

  autoSaveModels();
  const passed = settingsModelsCache.filter(m => m._verified === true).length;
  const failed = settingsModelsCache.filter(m => m._verified === false).length;
  if (toast) toast.success(`验证完成: ${passed} 通过, ${failed} 失败`, 3000);
}

// Event delegation for model name marquee (settings page only)
document.addEventListener('mouseenter', (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const nameEl = e.target.closest('.siper-models-grid .siper-model-name, #discoverResult .siper-model-name');
  if (!nameEl || nameEl._marqueeTimer) return;
  if (nameEl.scrollWidth <= nameEl.clientWidth + 1) return;
  const overflow = nameEl.scrollWidth - nameEl.clientWidth;
  const duration = Math.max(1500, overflow * 20);
  nameEl.style.transition = `transform ${duration}ms linear`;
  nameEl.style.transform = `translateX(-${overflow}px)`;
  nameEl._marqueeTimer = setTimeout(() => {
    nameEl.style.transition = 'none';
    nameEl._marqueeTimer = null;
  }, duration);
}, true);

document.addEventListener('mouseleave', (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const nameEl = e.target.closest('.siper-models-grid .siper-model-name, #discoverResult .siper-model-name');
  if (!nameEl) return;
  if (nameEl._marqueeTimer) {
    clearTimeout(nameEl._marqueeTimer);
    nameEl._marqueeTimer = null;
  }
  nameEl.style.transition = 'transform 300ms ease-out';
  nameEl.style.transform = 'translateX(0)';
}, true);

// Event delegation for verify buttons (.btn-verify)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-verify');
  if (!btn || btn.dataset.idx === undefined) return;
  e.preventDefault();
  e.stopPropagation();
  const idx = parseInt(btn.dataset.idx, 10);
  if (isNaN(idx)) return;
  // Only handle buttons in .models-grid (model management page)
  if (!btn.closest('.models-grid')) return;
  _handleVerify(idx);
});

async function _handleVerify(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  if (!m.base_url || !m.api_key) {
    if (toast) toast.warning(m.name + ' 未配置 base_url 或 api_key，无法验证');
    return;
  }
  if (toast) toast.info('正在验证 ' + m.name + '...');
  m._verified = 'pending';
  renderSettingsModelsList();
  try {
    const { testModel } = await import('../components/model-test.js');
    const d = await testModel(m.base_url, m.api_key, m.name, m.provider);
    if (d.success) {
      const caps = d.capabilities || [];
      if (caps.length) {
        const merged = Array.from(new Set([...(m.capabilities || []), ...caps]));
        m.capabilities = merged;
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
      if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) {
        m.context_window = d.context_window_tested;
      }
      renderSettingsModelsList();
      await saveModelsImmediate();
      const infoParts = [d.latency_ms + 'ms'];
      if (d.ttft_ms) infoParts.push('TTFT ' + d.ttft_ms + 'ms');
      if (d.streaming) infoParts.push('流式');
      if (d.context_window_tested) {
        const cw = d.context_window_tested >= 1000000 ? (d.context_window_tested / 1000000).toFixed(1) + 'M' : (d.context_window_tested / 1000).toFixed(0) + 'K';
        infoParts.push('ctx ' + cw);
      }
      const capStr = caps.length ? caps.map(c => ({ vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文', function_calling: '工具调用' }[c] || c)).join(' · ') : '仅基础对话';
      if (toast) toast.success(m.name + ' 验证通过 (' + infoParts.join(' · ') + ') — ' + capStr, 4000);
    } else {
      m._verified = false;
      m._error = d.error || '连接失败';
      renderSettingsModelsList();
      if (toast) toast.error(m.name + ' 验证失败：' + (d.error || '连接失败'), 4000);
    }
  } catch(err) {
    m._verified = false;
    m._error = err.message || '请求失败';
    renderSettingsModelsList();
  }
}

// Event delegation for caps marquee scroll in model cards
document.addEventListener('mouseenter', (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const scrollEl = e.target.closest('.model-caps-scroll');
  if (!scrollEl || scrollEl._marqueeTimer) return;
  const inner = scrollEl.querySelector('.model-caps-inner');
  if (!inner) return;
  if (inner.scrollWidth <= scrollEl.clientWidth + 1) return;
  const overflow = inner.scrollWidth - scrollEl.clientWidth;
  const duration = Math.max(1500, overflow * 20);
  inner.style.transition = `transform ${duration}ms linear`;
  inner.style.transform = `translateX(-${overflow}px)`;
  scrollEl._marqueeTimer = setTimeout(() => {
    inner.style.transition = 'none';
    scrollEl._marqueeTimer = null;
  }, duration);
}, true);

document.addEventListener('mouseleave', (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const scrollEl = e.target.closest('.model-caps-scroll');
  if (!scrollEl) return;
  const inner = scrollEl.querySelector('.model-caps-inner');
  if (!inner) return;
  if (scrollEl._marqueeTimer) {
    clearTimeout(scrollEl._marqueeTimer);
    scrollEl._marqueeTimer = null;
  }
  inner.style.transition = 'transform 300ms ease-out';
  inner.style.transform = 'translateX(0)';
}, true);

// Event delegation for copy model name buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-copy-model');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const name = btn.dataset.name;
  if (name) copyModelName(e, name);
});

// Close cap filter dropdown on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('capFilterDropdown');
  const menu = document.getElementById('capFilterMenu');
  if (menu && dropdown && !dropdown.contains(e.target)) {
    menu.style.display = 'none';
  }
});

