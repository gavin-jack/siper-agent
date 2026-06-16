// chat-pages/model-settings.js — 模型设置页面渲染
// 从 pages/chat.js 拆分
// 包含模型管理和辅助两个 tab

export function switchModelTab(tabName) {
  const tabs = document.querySelectorAll('.siper-settings-tab');
  const contents = document.querySelectorAll('.js-model-settings-tab-content');
  tabs.forEach(t => t.classList.remove('active'));
  contents.forEach(c => c.style.display = 'none');
  const activeTab = document.querySelector(`.siper-settings-tab[data-tab="${tabName}"]`);
  const activeContent = document.getElementById(`modelSettingsTab-${tabName}`);
  if (activeTab) activeTab.classList.add('active');
  if (activeContent) activeContent.style.display = '';
  if (location.hash !== '#/model-settings?tab=' + tabName) {
    history.replaceState(null, '', '#/model-settings?tab=' + tabName);
  }
}

export function renderModelSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="siper-settings-tabs">
  <button class="siper-settings-tab active" data-tab="models" onclick="window.switchModelTab('models')">${window.t ? window.t('tabModels') : '模型管理'}</button>
  <button class="siper-settings-tab" data-tab="auxiliary" onclick="window.switchModelTab('auxiliary')">${window.t ? window.t('tabAuxiliary') : '辅助'}</button>
</div>
<div id="modelSettingsTab-models" class="js-model-settings-tab-content">
<div class="js-model-settings-grid">
  <div class="siper-form-card js-form-card">
    <div class="siper-form-title js-form-title">
      <span>可用模型</span>
      <div class="js-spacer"></div>
      <div class="js-search-wrapper">
        <input type="text" id="modelSearchInput" placeholder="搜索模型..." class="siper-input" class="js-input-xs" oninput="window.filterModelsList()">
        <span id="modelSearchClear" onclick="window.clearModelSearch()" class="js-search-clear" title="清空">✕</span>
      </div>
      <div id="capFilterDropdown" class="js-cap-filter-wrap">
        <button id="capFilterBtn" class="siper-input js-cap-filter-btn" onclick="window.toggleCapFilterDropdown()" aria-label="按功能筛选">
          <span id="capFilterLabel">全部功能</span>
        </button>
        <div id="capFilterMenu" class="js-cap-filter-menu">
          <div class="js-cap-filter-options">
            <div class="cap-filter-option" data-cap="chat" onclick="window.selectCapFilter('chat')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 💬对话
            </div>
            <div class="cap-filter-option" data-cap="vision" onclick="window.selectCapFilter('vision')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 👁视觉
            </div>
            <div class="cap-filter-option" data-cap="reasoning" onclick="window.selectCapFilter('reasoning')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🧠推理
            </div>
            <div class="cap-filter-option" data-cap="code" onclick="window.selectCapFilter('code')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 💻代码
            </div>
            <div class="cap-filter-option" data-cap="function_calling" onclick="window.selectCapFilter('function_calling')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🔧工具
            </div>
            <div class="cap-filter-option" data-cap="tts" onclick="window.selectCapFilter('tts')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🔊语音
            </div>
            <div class="cap-filter-option" data-cap="embedding" onclick="window.selectCapFilter('embedding')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 📎嵌入
            </div>
            <div class="cap-filter-option" data-cap="image_gen" onclick="window.selectCapFilter('image_gen')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🎨生图
            </div>
            <div class="cap-filter-option" data-cap="long_context" onclick="window.selectCapFilter('long_context')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 📏长上下文
            </div>
          </div>
          <div class="js-cap-filter-actions">
            <button class="siper-btn" class="js-btn-xs" onclick="window.clearCapFilter()">清除</button>
            <button class="siper-btn primary" class="js-btn-xs" onclick="window.applyCapFilter()">确定</button>
          </div>
        </div>
      </div>
      <div class="js-sort-wrapper">
        <select id="modelSortBy" class="siper-input js-sort-select" onchange="window.filterModelsList()" aria-label="排序">
          <option value="name">按名称</option>
          <option value="ttft">按响应时间</option>
          <option value="latency">按延迟</option>
          <option value="context">按上下文窗口</option>
          <option value="caps">按能力数量</option>
        </select>
        <button id="sortDirBtn" class="siper-input js-sort-dir-btn" onclick="window.toggleSortDir()" title="切换排序方向">↑</button>
      </div>
      <button class="siper-btn primary js-btn-verify-all" onclick="window.verifyAllModels()">验证全部</button>
    </div>
    <div id="settingsModelsList"></div>
  </div>
  <div class="siper-form-card js-form-card-sidebar">
    <div class="siper-form-title">🔍 发现模型</div>
    <div class="js-sort-group">
      <div style="flex:1;">
        <div class="text-dim" class="js-label-sm">Provider</div>
        <select id="providerPreset" class="siper-input" class="js-input-sm" onchange="window.applyProviderPreset()" aria-label="Provider 预设">
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
        <div class="text-dim" class="js-label-sm">Base URL</div>
        <input type="text" class="siper-input" id="discoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL" class="js-input-sm">
      </div>
    </div>
    <div class="js-mb-6">
      <div class="text-dim" class="js-label-sm">API Key</div>
      <input type="password" class="siper-input" id="discoverApiKey" placeholder="sk-..." autocomplete="off" aria-label="发现 API Key" class="js-input-sm">
    </div>
    <div class="js-select-group">
      <button class="siper-btn primary" onclick="window.discoverModels()">获取模型列表</button>
      <div id="discoverFilterWrap" class="js-discover-filter">
        <input type="text" class="siper-input js-input-search" id="discoverFilter" placeholder="筛选模型..." aria-label="筛选发现的模型" oninput="window.chatFilterDiscovered()">
        <button id="discoverFilterClear" onclick="window.chatClearDiscoverFilter()" class="js-model-card-action" title="清空筛选">×</button>
      </div>
    </div>
    <div id="discoverResult" class="js-scroll-flex"></div>
  </div>
</div>
</div>
<div id="modelSettingsTab-auxiliary" class="js-model-settings-tab-content" style="display:none;">
  <div class="siper-form-card">
    <div class="siper-form-title">${window.t ? window.t('auxiliaryTitle') : '🔧 辅助模型'}</div>
    <div class="text-dim" style="margin-bottom:12px;">${window.t ? window.t('auxiliaryDesc') : '辅助模型配置功能开发中，敬请期待...'}</div>
    <div id="auxiliaryModelsContainer"></div>
  </div>
</div>`;
  // 独立页面模式下，重置按钮添加到 page-header 中
  const pageHeader = container.querySelector('.page-header');
  if (pageHeader && !pageHeader.querySelector('.siper-page-header-btn')) {
    const btn = document.createElement('button');
    btn.className = 'siper-page-header-btn siper-page-header-btn-text';
    btn.textContent = '重置';
    btn.onclick = () => { if (typeof window.resetSettingsModels === 'function') window.resetSettingsModels(); };
    const actions = pageHeader.querySelector('.actions');
    if (actions) actions.appendChild(btn);
    else pageHeader.appendChild(btn);
  }

  if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
}

// ===== Provider Preset (发现模型) =====
const PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  longcat: '',
  zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: '',
  custom: '',
};
const LOCKED_PROVIDERS = new Set(['openai','anthropic','deepseek','moonshot','qwen','zhipuai','minimax','groq','openrouter']);

export function applyProviderPreset() {
  const sel = document.getElementById('providerPreset');
  const urlInput = document.getElementById('discoverBaseUrl');
  if (!sel || !urlInput) return;
  const val = sel.value;
  if (!val) return;
  const presetUrl = PROVIDER_URLS[val];
  if (presetUrl) {
    urlInput.value = presetUrl;
    urlInput.readOnly = LOCKED_PROVIDERS.has(val);
    urlInput.style.background = LOCKED_PROVIDERS.has(val) ? 'var(--color-bg)' : 'var(--color-surface)';
    urlInput.style.cursor = LOCKED_PROVIDERS.has(val) ? 'not-allowed' : 'text';
  } else {
    urlInput.value = '';
    urlInput.readOnly = false;
    urlInput.style.background = '';
    urlInput.style.cursor = 'text';
    urlInput.placeholder = val === 'ollama' ? 'http://localhost:11434/v1' : 'https://...';
    urlInput.focus();
  }
}

export function discoverModels() {
  const urlInput = document.getElementById('discoverBaseUrl');
  const keyInput = document.getElementById('discoverApiKey');
  const resultEl = document.getElementById('discoverResult');
  const btn = document.querySelector('[onclick="window.discoverModels()"]');
  if (!urlInput || !resultEl) return;
  const baseUrl = urlInput.value.trim();
  const apiKey = keyInput ? keyInput.value.trim() : '';
  if (!baseUrl) { alert('请输入 Base URL'); urlInput.focus(); return; }
  resultEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--color-text-dim)">正在获取模型列表...</div>';
  if (btn) btn.disabled = true;
  fetch('/api/models/discover', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({base_url: baseUrl, api_key: apiKey})
  })
  .then(r => r.json())
  .then(data => {
    if (btn) btn.disabled = false;
    if (!data.success) {
      resultEl.innerHTML = '<div style="padding:20px;color:var(--color-danger)">获取失败: ' + data.error + '</div>';
      return;
    }
    if (!data.models || data.models.length === 0) {
      resultEl.innerHTML = '<div style="padding:20px;color:var(--color-text-dim)">未发现模型</div>';
      return;
    }
    let html = '<div style="padding:8px 0;font-size:12px;color:var(--color-text-dim)">发现 ' + data.count + ' 个模型 (' + data.provider + ')</div>';
    data.models.forEach(m => {
      const caps = (m.capabilities || []).map(c => '<span class="cap-badge">' + c + '</span>').join('');
      html += '<div class="model-card" style="margin-bottom:6px;padding:8px 10px;cursor:pointer" onclick="window.addDiscoveredModel(\'' + (m.id || '').replace(/'/g, "\\'") + '\')">' +
        '<div class="model-card-header"><span class="model-name-text">' + (m.id || '') + '</span></div>' +
        '<div class="model-card-caps">' + caps + '</div></div>';
    });
    html += '<button class="siper-btn primary" style="width:100%;margin-top:8px" onclick="window.addAllDiscoveredModels()">全部添加 (' + data.count + ' 个)</button>';
    resultEl.innerHTML = html;
    resultEl._discoveredModels = data.models;
  })
  .catch(e => {
    if (btn) btn.disabled = false;
    resultEl.innerHTML = '<div style="padding:20px;color:var(--color-danger)">请求失败: ' + e.message + '</div>';
  });
}

export function addDiscoveredModel(modelId) {
  const el = document.getElementById('discoverResult');
  if (!el || !el._discoveredModels) return;
  const model = el._discoveredModels.find(m => m.id === modelId);
  if (!model) return;
  const card = el.querySelector(`[onclick*="${modelId}"]`);
  if (card) { card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }
  fetch('/api/models/global', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({models: [model]})
  }).then(r => r.json()).then(() => {
    if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
  }).catch(e => console.error('[model-settings] add model failed:', e));
}

export function addAllDiscoveredModels() {
  const el = document.getElementById('discoverResult');
  if (!el || !el._discoveredModels) return;
  const models = el._discoveredModels;
  fetch('/api/models/global', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({models: models})
  }).then(r => r.json()).then(() => {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--color-success)">✅ 已添加 ' + models.length + ' 个模型</div>';
    el._discoveredModels = null;
    if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
  }).catch(e => {
    el.innerHTML += '<div style="color:var(--color-danger)">添加失败: ' + e.message + '</div>';
  });
}

export function chatFilterDiscovered() {
  const input = document.getElementById('discoverFilter');
  const el = document.getElementById('discoverResult');
  if (!input || !el || !el._discoveredModels) return;
  const q = input.value.trim().toLowerCase();
  const cards = el.querySelectorAll('.model-card');
  cards.forEach((card, i) => {
    const name = el._discoveredModels[i] ? el._discoveredModels[i].id.toLowerCase() : '';
    card.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

export function chatClearDiscoverFilter() {
  const input = document.getElementById('discoverFilter');
  if (input) { input.value = ''; }
  chatFilterDiscovered();
}

// ===== 模型列表管理 =====
let _settingsSearchVal = '';
let _settingsCapFilter = new Set();
let _settingsSortDir = 'asc';

export function loadSettingsModels() {
  fetch('/api/models/global').then(r => r.json()).then(data => {
    const models = data.models || [];
    window.settingsModelsCache = models;
    window.renderSettingsModelsList = _renderSettingsModels;
    _renderSettingsModels(models);
  }).catch(e => console.error('[model-settings] load failed:', e));
}

function _renderSettingsModels(models) {
  const el = document.getElementById('settingsModelsList');
  if (!el) return;
  let filtered = models;
  if (_settingsSearchVal) {
    const q = _settingsSearchVal.toLowerCase();
    filtered = filtered.filter(m => (m.name || m.id || '').toLowerCase().includes(q));
  }
  if (_settingsCapFilter.size > 0) {
    filtered = filtered.filter(m => {
      const caps = m.capabilities || [];
      return [..._settingsCapFilter].every(c => caps.includes(c));
    });
  }
  const sortKey = document.getElementById('modelSortBy');
  const key = sortKey ? sortKey.value : 'name';
  const dir = _settingsSortDir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    let va, vb;
    if (key === 'name') { va = (a.name || a.id || '').toLowerCase(); vb = (b.name || b.id || '').toLowerCase(); return va < vb ? -dir : va > vb ? dir : 0; }
    if (key === 'ttft') { va = a.ttft || 99999; vb = b.ttft || 99999; }
    if (key === 'latency') { va = a.latency || 99999; vb = b.latency || 99999; }
    if (key === 'context') { va = a.context_window || 0; vb = b.context_window || 0; }
    if (key === 'caps') { va = (a.capabilities || []).length; vb = (b.capabilities || []).length; }
    return (va - vb) * dir;
  });
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state">无匹配模型</div>';
    return;
  }
  let html = '';
  filtered.forEach((m, i) => {
    const caps = (m.capabilities || []).map(c => '<span class="cap-badge">' + c + '</span>').join('');
    const ttftColor = m.ttft ? (m.ttft < 500 ? '#2d9e6a' : m.ttft < 1500 ? '#b7950b' : '#c0392b') : 'var(--color-text-dim)';
    const verifyClass = m._verified === 'pending' ? ' model-card-verifying' : (m._verified ? '' : '');
    html += '<div class="model-card' + verifyClass + '" data-idx="' + i + '">' +
      '<div class="model-card-header">' +
        '<span class="model-name-text">' + escapeHtml(m.name || m.id || '') + '</span>' +
        '<span class="model-default-badge" style="' + (m.is_default ? '' : 'display:none') + '">默认</span>' +
        '<div class="model-card-actions"><span style="color:' + ttftColor + ';font-size:12px">' + (m.ttft ? m.ttft + 'ms' : '--') + '</span></div>' +
      '</div>' +
      '<div class="model-card-caps">' + caps + '</div>' +
      '<div class="model-card-actions-bottom">' +
        '<button class="btn-sm" onclick="window.verifySingleModel(' + i + ')">验证</button>' +
        '<button class="btn-sm danger" onclick="window.deleteModel(' + i + ')">删除</button>' +
      '</div></div>';
  });
  el.innerHTML = html;
}

export function filterModelsList() {
  const input = document.getElementById('modelSearchInput');
  _settingsSearchVal = input ? input.value.trim() : '';
  _renderSettingsModels(window.settingsModelsCache || []);
}

export function clearModelSearch() {
  const input = document.getElementById('modelSearchInput');
  if (input) input.value = '';
  _settingsSearchVal = '';
  _renderSettingsModels(window.settingsModelsCache || []);
}

export function toggleCapFilterDropdown() {
  const menu = document.getElementById('capFilterMenu');
  if (!menu) return;
  menu.style.display = menu.style.display !== 'none' ? 'none' : 'block';
}

export function selectCapFilter(cap) {
  if (_settingsCapFilter.has(cap)) _settingsCapFilter.delete(cap);
  else _settingsCapFilter.add(cap);
  const label = document.getElementById('capFilterLabel');
  if (label) label.textContent = _settingsCapFilter.size ? _settingsCapFilter.size + ' 项' : '全部功能';
  document.querySelectorAll('.cap-filter-option').forEach(function(el) {
    const cb = el.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = _settingsCapFilter.has(el.dataset.cap);
  });
}

export function clearCapFilter() {
  _settingsCapFilter.clear();
  const label = document.getElementById('capFilterLabel');
  if (label) label.textContent = '全部功能';
  document.querySelectorAll('.cap-filter-option input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
}

export function applyCapFilter() {
  const menu = document.getElementById('capFilterMenu');
  if (menu) menu.style.display = 'none';
  _renderSettingsModels(window.settingsModelsCache || []);
}

export function toggleSortDir() {
  _settingsSortDir = _settingsSortDir === 'asc' ? 'desc' : 'asc';
  const btn = document.getElementById('sortDirBtn');
  if (btn) btn.textContent = _settingsSortDir === 'asc' ? '↑' : '↓';
  _renderSettingsModels(window.settingsModelsCache || []);
}

export function verifyAllModels() {
  const models = window.settingsModelsCache || [];
  if (models.length === 0) return;
  if (typeof window.toast !== 'undefined' && window.toast.info) window.toast.info('开始验证 ' + models.length + ' 个模型...');
  models.forEach(function(m, i) {
    setTimeout(function() {
      if (typeof window.verifySingleModel === 'function') window.verifySingleModel(i);
    }, i * 600);
  });
}

export function verifySingleModel(idx) {
  const models = window.settingsModelsCache;
  if (!models || !models[idx]) return;
  const m = models[idx];
  m._verified = 'pending';
  _renderSettingsModels(models);
  fetch('/api/models/test', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({base_url: m.base_url, api_key: m.api_key, model: m.name || m.id, provider_id: m.provider || 0})
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.success) {
      const caps = d.capabilities || [];
      if (caps.length) {
        m.capabilities = Array.from(new Set([...(m.capabilities || []), ...caps]));
      }
      m._verified = true;
      m.ttft = d.ttft_ms;
      m.latency = d.latency_ms;
      m.streaming = d.streaming;
      m.context_window_tested = d.context_window_tested;
      // 保存验证结果到 models.db
      fetch('/api/models/global', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({models: [m]})
      }).catch(function(e) { console.error('[model-settings] save verify result failed:', e); });
      if (typeof window.toast !== 'undefined' && window.toast.success) {
        window.toast.success(m.name + ' 验证通过 (' + (d.latency_ms || '?') + 'ms)');
      }
    } else {
      m._verified = false;
      m._error = d.error;
      if (typeof window.toast !== 'undefined' && window.toast.error) {
        window.toast.error(m.name + ' 验证失败: ' + (d.error || ''));
      }
    }
    _renderSettingsModels(models);
  }).catch(function(e) {
    m._verified = false;
    m._error = e.message;
    _renderSettingsModels(models);
    if (typeof window.toast !== 'undefined' && window.toast.error) window.toast.error(m.name + ' 请求失败');
  });
}

export function deleteModel(idx) {
  const models = window.settingsModelsCache;
  if (!models || !models[idx]) return;
  const m = models[idx];
  if (!confirm('确定删除 "' + (m.name || m.id) + '"？')) return;
  fetch('/api/models/' + encodeURIComponent(m.name || m.id), { method: 'DELETE' })
    .then(function(r) { return r.json(); }).then(function() {
      loadSettingsModels();
    }).catch(function(e) { console.error('[model-settings] delete failed:', e); });
}
export function resetSettingsModels() {
  if (!confirm('重置所有模型配置？此操作不可恢复。')) return;
  fetch('/api/models/reset', { method: 'POST' }).then(function(r) { return r.json(); }).then(function() {
    loadSettingsModels();
  }).catch(function(e) { console.error('[model-settings] reset failed:', e); });
}