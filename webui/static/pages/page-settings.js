// ===== Global Settings =====
let settingsCache = null;
let settingsModelsCache = [];  // models list for settings modal
let discoveredModelsCache = []; // models discovered from provider

// ===== Settings Modal Tab Switching =====
function switchSettingsTab(tabName) {
  const tabs = document.querySelectorAll('.settings-tab');
  tabs.forEach(t => t.classList.remove('active'));
  const contents = document.querySelectorAll('.settings-tab-content');
  contents.forEach(c => c.classList.add('hidden'));
  if (tabName === 'basic') {
    document.querySelector('.settings-tab[data-i18n="settings.basic"]').classList.add('active');
    document.getElementById('settingsTabBasic').classList.remove('hidden');
  } else if (tabName === 'models') {
    document.querySelector('.settings-tab[data-i18n="settings.models"]').classList.add('active');
    document.getElementById('settingsTabModels').classList.remove('hidden');
    loadSettingsModels();
  }
}

// ===== Models Management =====

async function loadSettingsModels() {
  try {
    const r = await fetch('/api/models/global');
    const d = await r.json();
    settingsModelsCache = d.models || [];
    // Mark default
    const def = d.default_model || '';
    settingsModelsCache.forEach(m => { m._isDefault = (m.name === def); });
    renderSettingsModelsList();
  } catch(e) {
    console.error('loadSettingsModels error:', e);
    document.getElementById('settingsModelsList').innerHTML = '<div class="settings-empty-msg">加载失败</div>';
  }
}

function renderSettingsModelsList() {
  const list = document.getElementById('settingsModelsList');
  if (!settingsModelsCache || settingsModelsCache.length === 0) {
    list.innerHTML = '<div class="settings-empty-msg">' + t('settings.addModel') + '</div>';
    return;
  }
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
  const capColors = { vision: '#7c3aed', reasoning: '#059669', code: '#2563eb', chat: '#6b7280', tts: '#d97706', embedding: '#6366f1', image_gen: '#ec4899', long_context: '#0891b2', function_calling: '#f59e0b' };
  const capLabels = { vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文', function_calling: '工具调用' };
  // Sort capabilities: tools (function_calling) always last
  const capOrder = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };
  // Grid container: 4 columns
  const cards = settingsModelsCache.map((m, i) => {
    const alias = m.alias ? ` (${m.alias})` : '';
    const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window/1000000).toFixed(1)+'M' : (m.context_window/1000).toFixed(0)+'K') : '-';
    const caps = (m.capabilities || []).slice().sort((a, b) => (capOrder[a] ?? 50) - (capOrder[b] ?? 50));
    const capBadges = caps.map(c => `<span class="cap-badge" title="${capLabels[c] || c}">${capIcons[c] || c}</span>`).join('');
    const verifyIcon = m._verified === true ? '<span class="model-verify-icon model-verify-pass" title="验证通过' + (m._latency ? ' (' + m._latency + 'ms)' : '') + '">✅</span>' :
                         m._verified === false ? '<span class="model-verify-icon model-verify-fail" title="验证失败' + (m._error ? ': ' + m._error : '') + '">❌</span>' :
                         m._verified === "pending" ? '<span class="model-verify-icon model-verify-pending" title="正在检测模型能力...">⏳</span>' :
                         '';
    const verifyBtnHtml = m._verified === "pending"
      ? `<button class="btn-sm btn-sm-disabled" disabled title="检测中...">⏳</button>`
      : `<button class="btn-sm" onclick="verifyModel(${i})" title="验证可用性">🔍</button>`;
    return `
    <div class="model-card">
      <div class="model-card-header">
        <div class="model-name-scroll">
          <span class="model-name-text" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
        </div>
        <button class="btn-sm btn-copy-model" onclick="copyModelName(event,${JSON.stringify(m.name)})" title="复制模型名称">📋</button>
      </div>
      <div class="model-card-provider">${alias ? escapeHtml(alias) : (escapeHtml(m.provider || '') + (ctx !== '-' ? ' · ' + ctx : ''))}</div>
      ${m._verified === "pending" ? `<div class="model-card-pending"><span class="pulse">⏳</span> 正在更新模型能力...</div>` : (capBadges ? `<div class="model-card-caps">${capBadges}</div>` : '')}
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

function removeSettingsModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  confirmDeleteModel(m.name, () => {
    settingsModelsCache.splice(idx, 1);
    renderSettingsModelsList();
    autoSaveModels();
    toast.success('已删除模型: ' + m.name, 1500);
  });
}

async function verifyModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  if (!m.base_url || !m.api_key) {
    toast.warning(m.name + ' 未配置 base_url 或 api_key，无法验证');
    return;
  }
  toast.info('正在验证 ' + m.name + '...');
  // Set pending state — triggers loading UI on the card
  m._verified = "pending";
  renderSettingsModelsList();
  try {
    const r = await fetch('/api/models/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: m.base_url, api_key: m.api_key, model: m.name }),
    });
    const d = await r.json();
    if (d.success) {
      const caps = d.capabilities || [];
      const capLabels = { vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', tts: '语音', embedding: '嵌入', image_gen: '生图', function_calling: '工具调用', long_context: '长上下文' };
      const capStr = caps.length
        ? caps.map(c => (capLabels[c] || c)).join(' · ')
        : '仅基础对话';
      // Merge detected capabilities into model cache
      if (caps.length) {
        const merged = Array.from(new Set([...(m.capabilities || []), ...caps]));
        m.capabilities = merged;
        // Sync to allGlobalModels (page-chat.js) for chat model selector
        if (typeof allGlobalModels !== 'undefined') {
          const globalIdx = allGlobalModels.findIndex(gm => gm.name === m.name);
          if (globalIdx >= 0) allGlobalModels[globalIdx].capabilities = merged;
        }
        // Sync to globalModelsList (page-agent-config.js) for agent model config
        if (typeof globalModelsList !== 'undefined') {
          const agentIdx = globalModelsList.findIndex(gm => gm.name === m.name);
          if (agentIdx >= 0) globalModelsList[agentIdx].capabilities = merged;
        }
        renderSettingsModelsList();
        autoSaveModels();
        if (typeof loadAvailableModels === 'function') loadAvailableModels();
        // Refresh agent model section if visible
        if (typeof renderAgentModelSection === 'function' && typeof globalModelsList !== 'undefined') {
          renderAgentModelSection(globalModelsList);
        }
      }
      m._verified = true;
      m._latency = d.latency_ms;
      m._error = null;
      renderSettingsModelsList();
      toast.success(`${m.name} 验证通过 (${d.latency_ms}ms) — ${capStr}`, 4000);
    } else {
      m._verified = false;
      m._error = d.error || '连接失败';
      renderSettingsModelsList();
      toast.error(m.name + ' 验证失败：' + (d.error || '连接失败'), 4000);
    }
  } catch(e) {
    toast.error('验证请求失败：' + e.message);
  }
}

// ===== Model Discovery (Auto-detect) =====

async function discoverModels() {
  const baseUrl = document.getElementById('discoverBaseUrl').value.trim();
  const apiKey = document.getElementById('discoverApiKey').value.trim();
  if (!baseUrl) { toast.warning(t('toast.enterBaseUrl')); return; }
  if (!apiKey) { toast.warning(t('toast.enterApiKey')); return; }

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


function renderDiscoveredModels(models, provider, count) {
  const resultEl = document.getElementById('discoverResult');
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
  const capColors = { vision: '#7c3aed', reasoning: '#059669', code: '#2563eb', chat: '#6b7280', tts: '#d97706', embedding: '#6366f1', image_gen: '#ec4899', long_context: '#0891b2', function_calling: '#f59e0b' };
  const capLabels = { vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文', function_calling: '工具调用' };
  const capOrder = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };
  resultEl.innerHTML = `
    <div class="discover-result-header">
      ✅ 发现 <strong class="discover-count">${count}</strong> 个模型 · Provider: <strong>${escapeHtml(provider || '-')}</strong>
      <button class="btn-sm primary btn-discover-add-all" onclick="addAllDiscoveredModels()">全部添加</button>
    </div>
    ${models.map((m, i) => {
      const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window/1000000).toFixed(1)+'M' : (m.context_window/1000).toFixed(0)+'K') : '-';
      const caps = (m.capabilities || []).slice().sort((a, b) => (capOrder[a] ?? 50) - (capOrder[b] ?? 50));
      const capBadges = caps.map(c => `<span class="cap-badge" title="${capLabels[c] || c}">${capIcons[c] || c}</span>`).join('');
      return `
      <div class="model-card model-card-discover">
        <div class="model-discover-info">
          <div class="model-discover-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name.length > 22 ? m.name.substring(0, 20) + '..' : m.name)}</div>
          <div class="model-discover-meta">${escapeHtml(m.provider || '')} · ctx:${ctx}</div>
          ${capBadges ? `<div class="model-card-caps">${capBadges}</div>` : ''}
        </div>
        <button class="btn-sm primary btn-discover-add" onclick="addDiscoveredModel(${i})">添加</button>
      </div>`;
    }).join('')}
  `;
}

function addDiscoveredModel(idx) {
  const m = discoveredModelsCache[idx];
  if (!m) return;
  // Check duplicate
  if (settingsModelsCache.find(x => x.name === m.name && x.provider === m.provider)) {
    toast.warning(t('toast.modelExists') + ': ' + m.name);
    return;
  }
  doAddDiscoveredModel(idx);
}

function doAddDiscoveredModel(idx) {
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
  // If first model, set as default
  if (settingsModelsCache.length === 1) {
    settingsModelsCache[0]._isDefault = true;
    if (settingsCache) settingsCache.default_model = settingsModelsCache[0].name;
  }
  renderSettingsModelsList();
  autoSaveModels();
}

function addAllDiscoveredModels() {
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
  if (settingsModelsCache.length > 0 && !settingsModelsCache.find(m => m._isDefault)) {
    settingsModelsCache[0]._isDefault = true;
  }
  renderSettingsModelsList();
  autoSaveModels();
  toast.success('已添加 ' + added + ' 个模型');
}

// ===== Manual Add Model =====

// ===== Auto Save =====

let _autoSaveTimer = null;

function autoSaveModels() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    try {
      const modelsToSave = settingsModelsCache.map(m => ({
        id: m.id || m.name,
        name: m.name,
        alias: m.alias || '',
        provider: m.provider,
        base_url: m.base_url,
        api_key: m.api_key,
        context_window: m.context_window,
        capabilities: m.capabilities || [],
        is_default: m._isDefault || false,
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
        toast.success(t('settings.modelSaved'), 1500);
        if (typeof loadAvailableModels === 'function') loadAvailableModels();
      }
    } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
  }, 300);
}

// ===== Quick Provider Presets =====

function applyProviderPreset() {
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

async function refreshGlobalSettings() {
  try {
    const r = await fetch('/api/config');
    const data = await r.json();
    settingsCache = data;
    const uptime = data.uptime ? Math.floor(data.uptime) : 0;
    const uptimeStr = uptime > 3600 ? Math.floor(uptime/3600) + 'h ' + Math.floor((uptime%3600)/60) + 'm' : Math.floor(uptime/60) + 'm';
    const metrics = data.metrics || {};
    document.getElementById('settingsStats').innerHTML = `
      <div class="stat-card"><div class="value">${data.llm_configured ? '✅' : '❌'}</div><div class="label">LLM</div></div>
      <div class="stat-card"><div class="value">${data.model || '-'}</div><div class="label">当前模型</div></div>
      <div class="stat-card"><div class="value">${data.provider || '-'}</div><div class="label">Provider</div></div>
      <div class="stat-card"><div class="value">${uptimeStr}</div><div class="label">运行时间</div></div>
      <div class="stat-card"><div class="value">${metrics.total_requests || 0}</div><div class="label">总请求</div></div>
      <div class="stat-card"><div class="value">${data.port || 9724}</div><div class="label">端口</div></div>
    `;
    // Sync models from config to cache and render
    const models = data.models || [];
    const defaultModel = data.default_model || '';
    settingsModelsCache = models;
    settingsModelsCache.forEach(m => { m._isDefault = (m.name === defaultModel); });
    renderSettingsModelsList();
    // Update model count badge
    const countEl = document.getElementById('settingsModelCount');
    if (countEl) countEl.textContent = '(' + models.length + ' 个)';
    // Fill runtime settings (now in agent-config page)
    // cfgPort / cfgLogLevel are managed by page-agent-config.js
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

    toast.info(t('settings.refreshed'), 1500);
  } catch(e) {
    console.error('refreshGlobalSettings error:', e);
    toast.error(t('settings.refreshFailed'));
  }
}

async function saveSidebarSettings() {
  // Deprecated: auto-save handles all settings now.
  // Kept for backward compatibility with any remaining callers.
  autoSaveModels();
  autoSaveRuntimeSettings();
}

function autoSaveRuntimeSettings() {
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
        toast.success(t('settings.saved') || '设置已保存', 1500);
        if (typeof loadAvailableModels === 'function') loadAvailableModels();
      }
    } catch(e) { toast.error(t('settings.saveFailed')); }
  }, 800);
}

function resetSettingsModels() {
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
      toast.success(t('settings.resetDone'), 1500);
    }
  });
}

function resetGlobalSettings() {
  resetSettingsModels();
}

// ===== Meta Config =====

function saveMetaConfig() {
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

function loadMetaConfig() {
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

const ALL_CAPABILITIES = ['chat', 'reasoning', 'code', 'vision', 'tts', 'embedding', 'image_gen', 'function_calling'];
const CAP_LABELS = { chat: '💬 对话', reasoning: '🧠 推理', code: '💻 代码', vision: '👁 视觉', tts: '🔊 语音', embedding: '📎 嵌入', image_gen: '🎨 生图', function_calling: '🔧 工具调用' };

function editModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  const curCaps = m.capabilities || [];
  const capCheckboxes = ALL_CAPABILITIES.map(c => {
    const checked = curCaps.includes(c) ? 'checked' : '';
    return `<label class="cap-checkbox-label">
      <input type="checkbox" value="${c}" ${checked} class="edit-cap-cb"> ${CAP_LABELS[c] || c}
    </label>`;
  }).join('');
  const html = `
  <div class="modal-overlay-base open" id="editModelOverlay">
    <div class="modal-dialog-base edit-modal-dialog">
      <div class="modal-header-base">
        <span>✏️ 编辑模型</span>
        <button class="modal-close-base" onclick="closeEditModelModal()">✕</button>
      </div>
      <div class="modal-body-base edit-modal-body">
        <div class="edit-modal-row">
          <label class="edit-modal-label">模型名称</label>
          <input id="editModelName" value="${escapeHtml(m.name)}" class="edit-modal-input" readonly>
        </div>
        <div class="edit-modal-row">
          <label class="edit-modal-label">别名（可选，显示用）</label>
          <input id="editModelAlias" value="${escapeHtml(m.alias || '')}" placeholder="如：闪轻、GPT-4" class="edit-modal-input">
        </div>
        <div class="edit-modal-row">
          <label class="edit-modal-label">能力标签</label>
          <div class="edit-modal-caps">${capCheckboxes}</div>
        </div>
        <details class="edit-modal-details">
          <summary class="edit-modal-summary">高级：per-model API 配置（留空则使用 provider 级别）</summary>
          <div class="edit-modal-advanced">
            <input id="editModelBaseUrl" value="${escapeHtml(m.base_url || '')}" placeholder="Base URL（可选）" class="edit-modal-input edit-modal-input-sm">
            <input id="editModelApiKey" value="${escapeHtml(m.api_key || '')}" placeholder="API Key（可选）" type="password" class="edit-modal-input edit-modal-input-sm">
          </div>
        </details>
      </div>
      <div class="modal-footer-base">
        <button class="btn-sm" onclick="closeEditModelModal()">取消</button>
        <button class="btn-sm primary" onclick="saveModelEdit(${idx})">保存</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeEditModelModal() {
  const el = document.getElementById('editModelOverlay');
  if (el) el.remove();
}

function saveModelEdit(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  m.alias = document.getElementById('editModelAlias').value.trim();
  const caps = [];
  document.querySelectorAll('.edit-cap-cb:checked').forEach(cb => caps.push(cb.value));
  m.capabilities = caps;
  m.base_url = document.getElementById('editModelBaseUrl').value.trim();
  m.api_key = document.getElementById('editModelApiKey').value.trim();
  closeEditModelModal();
  renderSettingsModelsList();
  autoSaveModels();
}

// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshGlobalSettings);

// ===== Auto-Save for Global Settings =====
// (autoSaveModels and autoSaveRuntimeSettings defined above)

function attachSettingsAutoSaveListeners() {
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

function copyModelName(evt, name) {
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

async function saveSystemParams() {
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
      toast.success(t('settings.systemParamsSaved'), 2000);
      // Trigger gateway restart
      setTimeout(async () => {
        try { await fetch('/api/gateway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restart_all' }) }); } catch(e) {}
      }, 1000);
    } else {
      toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
    }
  } catch(e) {
    toast.error(t('settings.saveFailed') + ': ' + e.message);
  }
}

function resetSystemParams() {
  document.getElementById('sysWsHeartbeatTimeout').value = 300;
  document.getElementById('sysSessionListLimit').value = 50;
  document.getElementById('sysLogBufferSize').value = 2000;
  document.getElementById('sysTokenUsageMax').value = 500;
  document.getElementById('sysCtxWindowDefault').value = 8192;
  toast.info('已重置为默认值', 1500);
}

document.addEventListener('DOMContentLoaded', attachSettingsAutoSaveListeners);
