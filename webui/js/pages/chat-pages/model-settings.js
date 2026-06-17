// chat-pages/model-settings.js — 模型设置页面
// 集成 v0.1.7 的完整功能：按 base_url 分组、走马灯、复制模型名、速度颜色、入场动画
// 2026-07-28: 从 472 行升级至 ~700 行，功能对齐 v0.1.7

// ===== 状态 =====
export let settingsModelsCache = [];
export let discoveredModelsCache = [];
let _selectedCaps = new Set();
let _sortDir = 'asc';
let _lastRenderCount = 0;
let _autoSaveTimer = null;

// ===== Tab 切换 =====
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

// ===== 渲染模型设置页面 =====
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
        <input type="text" id="modelSearchInput" placeholder="搜索模型..." class="siper-input js-input-xs" oninput="window.filterModelsList()">
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
            <button class="siper-btn js-btn-xs" onclick="window.clearCapFilter()">清除</button>
            <button class="siper-btn primary js-btn-xs" onclick="window.applyCapFilter()">确定</button>
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
        <div class="text-dim js-label-sm">Provider</div>
        <select id="providerPreset" class="siper-input js-input-sm" onchange="window.applyProviderPreset()" aria-label="Provider 预设">
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
        <div class="text-dim js-label-sm">Base URL</div>
        <input type="text" class="siper-input" id="discoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL" class="js-input-sm">
      </div>
    </div>
    <div class="js-mb-6">
      <div class="text-dim js-label-sm">API Key</div>
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
  if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
}

// ===== 加载模型列表 =====
export function loadSettingsModels() {
  const list = document.getElementById('settingsModelsList');
  if (list) list.innerHTML = '<div class="js-empty-state-lg" style="padding:24px;text-align:center;">⏳ 加载模型数据中...</div>';
  fetch('/api/models/global').then(r => r.json()).then(data => {
    settingsModelsCache = (data.models || []).map(m => ({
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
    const defaultModel = settingsModelsCache.find(m => m.is_default);
    const defName = defaultModel ? defaultModel.name : '';
    settingsModelsCache.forEach(m => { m._isDefault = (m.name === defName); });
    renderSettingsModelsList();
  }).catch(e => {
    console.error('loadSettingsModels error:', e);
    const list = document.getElementById('settingsModelsList');
    if (list) list.innerHTML = '<div class="settings-empty-msg">加载失败</div>';
  });
}

// ===== 渲染模型列表 =====
export function renderSettingsModelsList() {
  const list = document.getElementById('settingsModelsList');
  if (!list) return;
  if (!settingsModelsCache || settingsModelsCache.length === 0) {
    list.innerHTML = '<div class="settings-empty-msg">暂无模型，请添加</div>';
    return;
  }

  // 是否分组（无搜索/筛选/排序时分组）
  const searchText = (document.getElementById('modelSearchInput')?.value || '').trim();
  const hasCapFilter = _selectedCaps.size > 0;
  const hasSort = document.getElementById('modelSortBy') && document.getElementById('modelSortBy').value !== 'name' || _sortDir !== 'asc';
  const showGroups = !searchText && !hasCapFilter && !hasSort;

  // 过滤器
  let filtered = [...settingsModelsCache];
  if (searchText) {
    const q = searchText.toLowerCase();
    filtered = filtered.filter(m => (m.name || '').toLowerCase().includes(q));
  }
  if (_selectedCaps.size > 0) {
    filtered = filtered.filter(m => {
      const caps = m.capabilities || [];
      return [..._selectedCaps].every(c => caps.includes(c));
    });
  }

  // 排序
  const sortKey = document.getElementById('modelSortBy')?.value || 'name';
  const dir = _sortDir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    if (sortKey === 'name') return (a.name || '').localeCompare(b.name || '') * dir;
    const va = sortKey === 'ttft' ? (a.ttft || 99999) : sortKey === 'latency' ? (a.latency || a._latency || 99999) : sortKey === 'context' ? (a.context_window || 0) : (a.capabilities || []).length;
    const vb = sortKey === 'ttft' ? (b.ttft || 99999) : sortKey === 'latency' ? (b.latency || b._latency || 99999) : sortKey === 'context' ? (b.context_window || 0) : (b.capabilities || []).length;
    return (va - vb) * dir;
  });

  // 动态高度
  const rect = list.getBoundingClientRect();
  list.style.maxHeight = Math.max(200, window.innerHeight - rect.top - 20) + 'px';
  list.style.overflowY = 'auto';

  let html = '';
  if (showGroups) {
    // 按 base_url 分组
    const groups = new Map();
    filtered.forEach((m, i) => {
      const key = m.base_url || '';
      if (!groups.has(key)) groups.set(key, { base_url: key, models: [], provider: m.provider || '', provider_name: m.provider_name || '' });
      groups.get(key).models.push({ ...m, _idx: i });
    });
    const sortedGroups = [...groups.values()].sort((a, b) => {
      const aHasDef = a.models.some(m => m._isDefault);
      const bHasDef = b.models.some(m => m._isDefault);
      if (aHasDef && !bHasDef) return -1;
      if (!aHasDef && bHasDef) return 1;
      return a.base_url.localeCompare(b.base_url);
    });
    sortedGroups.forEach(group => {
      const providerAlias = group.provider_name || group.provider || '';
      const displayName = providerAlias ? `${providerAlias} (${group.base_url})` : (group.base_url || '默认');
      html += `<div class="model-group-header" data-base-url="${escapeAttr(group.base_url)}" style="display:flex;align-items:center;gap:6px;margin-top:10px;margin-bottom:4px;padding:4px 0;border-bottom:1px solid var(--color-border);">`;
      html += `<span class="model-group-label model-name-text" data-base-url="${escapeAttr(group.base_url)}" title="双击修改名称" ondblclick="window.editProviderName('${escapeAttr(group.base_url)}')">${escapeHtml(displayName)}</span>`;
      html += `<span class="model-group-count text-dim" style="font-size:11px;">(${group.models.length})</span></div>`;
      html += `<div class="models-grid">${group.models.map(m => buildCardHtml(m, m._idx)).join('')}</div>`;
    });
  } else {
    html += `<div class="models-grid">${filtered.map((m, i) => buildCardHtml(m, i)).join('')}</div>`;
    if (searchText || hasCapFilter || hasSort) {
      const parts = [];
      if (searchText) parts.push(`搜索: "${escapeHtml(searchText)}"`);
      if (hasCapFilter) parts.push(`${_selectedCaps.size}项筛选`);
      if (hasSort) parts.push(`排序`);
      html = `<div class="js-model-card" style="display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:12px;color:var(--color-text-dim);">` +
        `<span>📋 ${parts.join(' + ')}</span>` +
        `<button class="siper-btn js-btn-xs" onclick="window.clearModelFilter()">恢复分组</button></div>` + html;
    }
  }
  list.innerHTML = html;

  // 入场动画（仅新卡片）
  const currentCount = list.querySelectorAll('.model-card').length;
  if (currentCount > _lastRenderCount) {
    requestAnimationFrame(() => {
      const allCards = list.querySelectorAll('.model-card');
      for (let i = _lastRenderCount; i < allCards.length; i++) {
        const card = allCards[i];
        card.classList.add('model-card-animate');
        card.style.animationDelay = `${(i - _lastRenderCount) * 30}ms`;
        setTimeout(() => {
          card.classList.remove('model-card-animate');
          card.style.animationDelay = '';
        }, 250 + (i - _lastRenderCount) * 30 + 50);
      }
    });
  }
  _lastRenderCount = currentCount;

  // 走马灯检测
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

/** 构建单张模型卡片 HTML */
function buildCardHtml(m, i) {
  const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window/1000000).toFixed(1)+'M' : (m.context_window/1000).toFixed(0)+'K') : '-';
  const capBadges = renderCapBadges(m.capabilities);
  const ctxTested = m.context_window_tested ? (m.context_window_tested >= 1000000 ? (m.context_window_tested/1000000).toFixed(1)+'M' : (m.context_window_tested/1000).toFixed(0)+'K') : '';
  const ttft = m.ttft ? formatSpeed(m.ttft) : '';
  const latency = (m._latency || m.latency) ? `${formatSpeed(m._latency || m.latency)}` : '';
  const streaming = m.streaming ? '⚡流式' : '';
  const jsonMode = m.json_mode ? '📋json' : '';
  const latencyOnly = m._latency && !m.ttft ? latency : '';
  const metaTags = [ctxTested, ttft, latencyOnly, streaming, jsonMode].filter(Boolean).map(t2 => '<span class="siper-meta-tag">' + t2 + '</span>').join('');
  const verifyBtnHtml = m._verified === "pending"
    ? '<button class="btn-sm btn-verify-pending" disabled title="检测中...">⏳</button>'
    : `<button class="btn-sm btn-verify" data-name="${escapeAttr(m.name)}" title="验证可用性">🔍</button>`;
  return `
    <div class="model-card card-left-accent${m._verified === 'pending' ? ' model-card-verifying' : m._verified === true ? ' model-verify-pass' : m._verified === false ? ' model-verify-fail' : ''}" data-model-name="${escapeAttr(m.name)}" data-caps="${escapeAttr((m.capabilities || []).join(','))}" data-ttft="${m.ttft || 99999}" data-latency="${m._latency || m.latency || 99999}" data-context="${m.context_window || 0}">
      <div class="model-card-header">
        <div class="model-name-scroll">
          <span class="model-name-text" title="${escapeAttr(m.name)}">${escapeHtml(m.name)}</span>
        </div>
        <div class="model-card-actions">
          <button class="btn-sm btn-copy-model" data-name="${escapeAttr(m.name)}" title="复制模型名称">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="5" width="9" height="9" rx="1.5" opacity="0.6"/><rect x="2" y="2" width="9" height="9" rx="1.5"/></svg>
          </button>
          <button class="btn-sm danger" onclick="window.removeSettingsModelByName('${escapeAttr(m.name)}')" title="删除模型">✕</button>
        </div>
      </div>
      <div class="siper-model-meta">${ctx ? '<span class="siper-meta-tag">ctx ' + ctx + '</span>' : ''}${metaTags}</div>
      ${m._verified === false && m._error ? `<div class="model-card-error text-danger-sm">❌ ${escapeHtml(m._error)}</div>` : ''}
      <div class="model-card-actions-bottom">
        <div class="model-caps-scroll">
          ${m._verified === "pending" ? '<div class="model-caps-inner text-warning-sm"><span class="pulse">⏳</span> 正在更新模型能力...</div>' : (capBadges ? `<div class="model-caps-inner">${capBadges}</div>` : '')}
        </div>
        ${verifyBtnHtml}
      </div>
    </div>`;
}

/** 渲染能力徽章 */
function renderCapBadges(capabilities) {
  if (!capabilities || !capabilities.length) return '';
  const iconMap = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', function_calling: '🔧', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏' };
  const labelMap = { vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', function_calling: '工具', tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文' };
  return capabilities.map(c => `<span class="cap-badge cap-badge-${c}" title="${labelMap[c] || c}">${iconMap[c] || c}</span>`).join('');
}

/** 格式化速度（带颜色） */
function formatSpeed(ms) {
  if (!ms || ms <= 0) return '';
  let color, label;
  if (ms < 500) { color = '#3b82f6'; label = ms < 100 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }
  else if (ms < 1500) { color = '#f59e0b'; label = `${(ms / 1000).toFixed(1)}s`; }
  else { color = '#ef4444'; label = `${(ms / 1000).toFixed(1)}s`; }
  return `<span style="color:${color};font-weight:500;">${label}</span>`;
}

// ===== 搜索 / 筛选 / 排序 =====
export function filterModelsList() {
  // 切换清除按钮
  const input = document.getElementById('modelSearchInput');
  const clearBtn = document.getElementById('modelSearchClear');
  if (input && clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
  renderSettingsModelsList();
}

export function clearModelSearch() {
  const input = document.getElementById('modelSearchInput');
  if (input) input.value = '';
  renderSettingsModelsList();
}

export function toggleCapFilterDropdown() {
  const menu = document.getElementById('capFilterMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

export function selectCapFilter(cap) {
  if (_selectedCaps.has(cap)) _selectedCaps.delete(cap);
  else _selectedCaps.add(cap);
  const label = document.getElementById('capFilterLabel');
  if (label) {
    const capLabels = { chat: '💬对话', vision: '👁视觉', reasoning: '🧠推理', code: '💻代码', function_calling: '🔧工具', tts: '🔊语音', embedding: '📎嵌入', image_gen: '🎨生图', long_context: '📏长上下文' };
    if (_selectedCaps.size === 0) label.textContent = '全部功能';
    else if (_selectedCaps.size <= 2) label.textContent = [..._selectedCaps].map(c => capLabels[c] || c).join('+');
    else label.textContent = `${_selectedCaps.size}项筛选`;
  }
  document.querySelectorAll('.cap-filter-option').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = _selectedCaps.has(el.dataset.cap);
  });
}

export function applyCapFilter() {
  const menu = document.getElementById('capFilterMenu');
  if (menu) menu.style.display = 'none';
  renderSettingsModelsList();
}

export function clearCapFilter() {
  _selectedCaps.clear();
  const label = document.getElementById('capFilterLabel');
  if (label) label.textContent = '全部功能';
  document.querySelectorAll('.cap-filter-option input[type="checkbox"]').forEach(cb => { cb.checked = false; });
}

export function clearModelFilter() {
  _selectedCaps.clear();
  _sortDir = 'asc';
  const input = document.getElementById('modelSearchInput');
  if (input) { input.value = ''; }
  const label = document.getElementById('capFilterLabel');
  if (label) label.textContent = '全部功能';
  document.querySelectorAll('.cap-filter-option input[type="checkbox"]').forEach(cb => { cb.checked = false; });
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
}

// ===== 编辑 Provider 名称 =====
export function editProviderName(baseUrl) {
  const current = settingsModelsCache.find(m => m.base_url === baseUrl);
  const currentName = current ? (current.provider_name || current.provider || baseUrl) : baseUrl;
  const newName = prompt('请输入 Provider 名称（留空使用 Base URL）:', currentName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (trimmed === currentName) return;
  // 更新本地缓存
  settingsModelsCache.forEach(m => {
    if (m.base_url === baseUrl) m.provider_name = trimmed || '';
  });
  renderSettingsModelsList();
  // 持久化到数据库（provider_alias 字段）
  fetch('/api/models/provider/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl, provider_alias: trimmed }),
  }).then(r => r.json()).then(d => {
    if (!d.success && window.toast) window.toast.warning('名称已本地更新，但数据库保存失败');
  }).catch(() => {});
  autoSaveModels();
}

// ===== 删除模型 =====
export function removeSettingsModel(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  if (typeof window.confirmDeleteModel === 'function') {
    window.confirmDeleteModel(m.name, () => _doRemove(idx));
  } else {
    if (!confirm('确定删除 "' + (m.name || m.id) + '"？')) return;
    _doRemove(idx);
  }
}

function _doRemove(idx) {
  const m = settingsModelsCache[idx];
  if (!m) return;
  fetch('/api/models/' + encodeURIComponent(m.id || m.name) + '?provider=' + encodeURIComponent(m.provider || ''), { method: 'DELETE' })
    .then(r => r.json()).then(d => {
      if (!d.success) { if (window.toast) window.toast.error('删除失败: ' + (d.error || 'unknown')); return; }
      settingsModelsCache.splice(idx, 1);
      renderSettingsModelsList();
      if (window.toast) window.toast.success('已删除模型: ' + m.name, 1500);
    }).catch(e => { if (window.toast) window.toast.error('删除失败: ' + e.message); });
}

/** 按名称删除模型（onclick 调用，避免索引错位） */
export function removeSettingsModelByName(name) {
  for (var _i = 0; _i < settingsModelsCache.length; _i++) {
    if (settingsModelsCache[_i].name === name) {
      removeSettingsModel(_i);
      return;
    }
  }
  if (window.toast) window.toast.error('未找到模型: ' + name);
}

// ===== 复制模型名 =====
export function copyModelName(e, name) {
  const btn = (e && e.target && e.target.closest('button')) || (e && e.currentTarget);
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
    overlay.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:90%;min-width:300px"><div style="font-weight:600;margin-bottom:12px">复制</div><input type="text" value="' + escapeAttr(name) + '" readonly style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;box-sizing:border-box" onclick="this.select()"><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button id="copyNameModalClose" class="btn-sm primary">关闭</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#copyNameModalClose').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    setTimeout(() => { const inp = overlay.querySelector('input'); if (inp) { inp.focus(); inp.select(); } }, 50);
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(name).then(() => { showOk(); if (window.toast) window.toast.success('已复制'); }).catch(() => {
      try {
        const ta = document.createElement('textarea'); ta.value = name; ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        if (document.execCommand('copy')) { document.body.removeChild(ta); showOk(); if (window.toast) window.toast.success('已复制'); return; }
        document.body.removeChild(ta);
      } catch(e) {}
      fallbackModal(); showOk();
    });
  } else { fallbackModal(); showOk(); }
}

// ===== 模型发现 =====
export function discoverModels() {
  const baseUrl = document.getElementById('discoverBaseUrl')?.value.trim();
  const apiKey = document.getElementById('discoverApiKey')?.value.trim();
  if (!baseUrl) { if (window.toast) window.toast.warning('请输入 Base URL'); return; }
  if (!apiKey) { if (window.toast) window.toast.warning('请输入 API Key'); return; }

  const resultEl = document.getElementById('discoverResult');
  if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">⏳ 正在获取模型列表...</div>';

  fetch('/api/models/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
  }).then(r => r.json()).then(d => {
    if (!d.success || !d.models || d.models.length === 0) {
      if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">' + (d.success ? '未找到可用模型' : ('❌ ' + escapeHtml(d.error || '获取失败'))) + '</div>';
      return;
    }
    // 查数据库对比哪些已存在
    fetch('/api/models/global').then(r2 => r2.json()).then(existing => {
      const existingNames = new Set((existing.models || []).map(m => m.name));
      const allModels = d.models.map(m => ({ ...m, _exists: existingNames.has(m.name || m.id) }));
      const newModels = allModels.filter(m => !m._exists);
      discoveredModelsCache = allModels;
      const filterInput = document.getElementById('discoverFilter');
      if (filterInput) filterInput.value = '';
      renderDiscoveredModels(allModels, newModels.length, d.provider, d.count);
    }).catch(() => {
      // DB 查询失败，全部当作新模型
      const allModels = d.models.map(m => ({ ...m, _exists: false }));
      discoveredModelsCache = allModels;
      renderDiscoveredModels(allModels, allModels.length, d.provider, d.count);
    });
  }).catch(e => {
    if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">❌ ' + escapeHtml(e.message) + '</div>';
  });
}

export function renderDiscoveredModels(allModels, newCount, provider, totalCount) {
  const resultEl = document.getElementById('discoverResult');
  if (!resultEl) return;
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
  const capOrder = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };

  // 只显示未添加的模型
  const showModels = allModels.filter(m => !m._exists);
  const existingCount = allModels.length - showModels.length;

  let html = `<div class="discover-result-header">`;
  if (existingCount > 0) {
    html += `✅ 发现 <strong class="discover-count">${totalCount}</strong> 个模型 · <span style="color:var(--color-success)">已添加 ${existingCount}</span> · <span style="color:var(--color-primary)">未添加 ${showModels.length}</span>`;
  } else {
    html += `✅ 发现 <strong class="discover-count">${totalCount}</strong> 个模型 · Provider: <strong>${escapeHtml(provider || '-')}</strong>`;
  }
  html += `<span class="discover-header-actions">`;
  if (showModels.length > 0) {
    html += `<button class="btn-sm btn-discover-add-one" onclick="window.addSelectedDiscoveredModels()">添加选中</button>`;
    html += `<button class="btn-sm primary btn-discover-add-all" onclick="window.addAllDiscoveredModels()">全部添加</button>`;
  }
  html += `</span></div>`;

  if (showModels.length === 0) {
    html += '<div class="settings-empty-msg">所有模型均已添加</div>';
  } else {
    html += '<div class="models-grid models-grid-discover">';
    showModels.forEach(m => {
      const caps = (m.capabilities || []).slice().sort((a, b) => (capOrder[a] ?? 50) - (capOrder[b] ?? 50));
      const capBadges = caps.map(c => `<span class="cap-badge cap-badge-${c}" title="${c}">${capIcons[c] || c}</span>`).join('');
      const ctx = m.context_window ? (m.context_window >= 1000000 ? (m.context_window / 1000000).toFixed(1) + 'M' : (m.context_window / 1000).toFixed(0) + 'K') : '-';
      html += `<div class="model-card card-left-accent model-card-discover" data-name="${escapeAttr(m.name || m.id)}">
        <div class="model-card-header">
          <input type="checkbox" class="discover-check" data-name="${escapeAttr(m.name || m.id)}" style="flex-shrink:0;cursor:pointer;">
          <div class="model-name-scroll">
            <span class="model-name-text" title="${escapeAttr(m.name || m.id)}">${escapeHtml((m.name || m.id).length > 20 ? (m.name || m.id).substring(0, 18) + '..' : (m.name || m.id))}</span>
          </div>
        </div>
        <div class="siper-model-meta"><span class="siper-meta-tag">ctx ${ctx}</span>${capBadges ? ' ' + capBadges : ''}</div>
      </div>`;
    });
    html += '</div>';
  }
  resultEl.innerHTML = html;

  // 6+ 模型时显示筛选栏
  const filterWrap = document.getElementById('discoverFilterWrap');
  if (filterWrap) filterWrap.style.display = allModels.length >= 6 ? 'block' : 'none';
}

export function chatFilterDiscovered() {
  const input = document.getElementById('discoverFilter');
  const clearBtn = document.getElementById('discoverFilterClear');
  if (input && clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
  const text = (input?.value || '').trim().toLowerCase();
  const cards = document.querySelectorAll('#discoverResult .model-card-discover');
  let shown = 0;
  cards.forEach(card => {
    const name = (card.dataset.name || '').toLowerCase();
    const match = !text || name.includes(text);
    card.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  const header = document.querySelector('#discoverResult .discover-result-header');
  if (header) {
    const total = cards.length;
    const newCount = discoveredModelsCache.filter(m => !m._exists).length;
    const existingCount = discoveredModelsCache.length - newCount;
    if (text) {
      header.innerHTML = `🔍 筛选: <strong>"${escapeHtml(text)}"</strong> · 匹配 ${shown}/${total} 个<span class="discover-header-actions"><button class="btn-sm btn-discover-add-one" onclick="window.addSelectedDiscoveredModels()">添加选中</button><button class="btn-sm primary btn-discover-add-all" onclick="window.addAllDiscoveredModels()">全部添加</button></span>`;
    } else if (existingCount > 0) {
      header.innerHTML = `✅ 发现 <strong class="discover-count">${discoveredModelsCache.length}</strong> 个模型 · <span style="color:var(--color-success)">已添加 ${existingCount}</span> · <span style="color:var(--color-primary)">未添加 ${newCount}</span><span class="discover-header-actions"><button class="btn-sm btn-discover-add-one" onclick="window.addSelectedDiscoveredModels()">添加选中</button><button class="btn-sm primary btn-discover-add-all" onclick="window.addAllDiscoveredModels()">全部添加</button></span>`;
    } else {
      header.innerHTML = `✅ 发现 <strong class="discover-count">${total}</strong> 个模型<span class="discover-header-actions"><button class="btn-sm btn-discover-add-one" onclick="window.addSelectedDiscoveredModels()">添加选中</button><button class="btn-sm primary btn-discover-add-all" onclick="window.addAllDiscoveredModels()">全部添加</button></span>`;
    }
  }
}

export function chatClearDiscoverFilter() {
  const input = document.getElementById('discoverFilter');
  if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
}

export function addSelectedDiscoveredModels() {
  const checkboxes = document.querySelectorAll('#discoverResult .discover-check:checked');
  if (checkboxes.length === 0) { if (window.toast) window.toast.warning('请先勾选要添加的模型'); return; }
  const names = [...checkboxes].map(cb => cb.dataset.name);
  const models = discoveredModelsCache.filter(m => names.includes(m.name || m.id));
  _addDiscoveredModels(models);
}

function _addDiscoveredModels(models) {
  if (!models.length) return;
  // 按 base_url 分组，先处理 providers
  const baseUrls = [...new Set(models.map(m => m.base_url))];
  let added = 0;
  const promises = baseUrls.map(baseUrl => {
    const prov = models.find(m => m.base_url === baseUrl);
    // 查 providers 表是否已有此 base_url
    return fetch('/api/models/global').then(r => r.json()).then(data => {
      const existingProv = (data.models || []).find(m => m.base_url === baseUrl);
      if (existingProv) {
        // provider 已存在，直接添加模型
        return _saveModelsForProvider(existingProv.provider || 0, models.filter(m => m.base_url === baseUrl));
      }
      // provider 不存在，先创建 provider
      return fetch('/api/models/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: baseUrl,
          api_key: prov.api_key,
          provider: prov.provider || '',
          provider_alias: prov.provider_alias || '',
        }),
      }).then(r => r.json()).then(d => {
        if (!d.success && !d.provider_id) {
          throw new Error(d.error || '创建 Provider 失败');
        }
        const providerId = d.provider_id || d.id || 0;
        return _saveModelsForProvider(providerId, models.filter(m => m.base_url === baseUrl));
      });
    });
  });
  Promise.all(promises).then(results => {
    results.forEach(r => { added += r; });
    if (added > 0) {
      if (window.toast) window.toast.success('已添加 ' + added + ' 个模型');
      if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
      // 刷新发现列表
      const allModels = discoveredModelsCache.map(m => ({ ...m, _exists: true }));
      discoveredModelsCache = allModels;
      renderDiscoveredModels(allModels, 0, '', allModels.length);
    }
  }).catch(e => {
    if (window.toast) window.toast.error('添加失败: ' + e.message);
  });
}

function _saveModelsForProvider(providerId, models) {
  if (!models.length) return Promise.resolve(0);
  const payload = models.map(m => ({
    id: m.id || m.name,
    name: m.name || m.id,
    alias: m.alias || '',
    provider: providerId,
    provider_name: m.provider_name || m.provider || '',
    base_url: m.base_url,
    api_key: m.api_key,
    context_window: m.context_window,
    capabilities: m.capabilities || [],
  }));
  return fetch('/api/models/global', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models: payload }),
  }).then(r => r.json()).then(d => {
    if (!d.success) throw new Error(d.error || '保存失败');
    return models.length;
  });
}

export function addAllDiscoveredModels() {
  const newModels = discoveredModelsCache.filter(m => !m._exists);
  if (newModels.length === 0) { if (window.toast) window.toast.info('没有未添加的模型'); return; }
  _addDiscoveredModels(newModels);
}

// ===== 自动保存 =====
async function saveModelsImmediate() {
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
  try {
    const r = await fetch('/api/models/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models: modelsToSave }),
    });
    const d = await r.json();
    if (!d.success && window.toast) window.toast.error('保存失败: ' + (d.error || 'unknown'));
  } catch(e) { if (window.toast) window.toast.error('保存失败: ' + e.message); }
}

export function autoSaveModels() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    await saveModelsImmediate();
  }, 300);
}

// ===== Provider 预设 =====
const PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1', moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1', longcat: '',
  zhipuai: 'https://open.bigmodel.cn/api/paas/v4', minimax: 'https://api.minimax.chat/v1',
  groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1',
  ollama: '', custom: '',
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

// ===== 重置 =====
export function resetSettingsModels() {
  if (typeof window.showConfirm === 'function') {
    window.showConfirm({
      title: '重置模型',
      msg: '确定要清除所有模型配置吗？',
      impact: '⚠ 将删除 models.db 数据库，清空所有模型、默认模型、Provider 配置。此操作不可恢复！',
      danger: true,
      okText: '确认清除',
      onConfirm: async () => {
        try {
          const r = await fetch('/api/models/reset', { method: 'POST' });
          const d = await r.json();
          if (d.success) {
            settingsModelsCache = []; discoveredModelsCache = [];
            renderSettingsModelsList();
            if (window.toast) window.toast.success('已清除所有模型配置', 2000);
          } else { if (window.toast) window.toast.error(d.error || '重置失败'); }
        } catch(e) { if (window.toast) window.toast.error('重置失败: ' + (e.message || e)); }
      }
    });
  } else {
    if (!confirm('重置所有模型配置？此操作不可恢复。')) return;
    fetch('/api/models/reset', { method: 'POST' }).then(r => r.json()).then(() => {
      loadSettingsModels();
    }).catch(e => console.error('[model-settings] reset failed:', e));
  }
}

// ===== 验证 =====
export function verifySingleModel(modelName) {
  var idx = -1;
  var m = null;
  if (typeof modelName === 'string') {
    // 按名称查找（来自事件委托的 data-name）
    for (var _i = 0; _i < settingsModelsCache.length; _i++) {
      if (settingsModelsCache[_i].name === modelName) { idx = _i; m = settingsModelsCache[_i]; break; }
    }
  } else if (typeof modelName === 'number') {
    // 按索引查找（兼容 verifyAllModels 用）
    idx = modelName;
    m = settingsModelsCache[idx];
  }
  if (!m) return;
  if (!m.base_url || !m.api_key) {
    if (window.toast) window.toast.warning((m.name || m.id) + ' 未配置 base_url 或 api_key');
    return;
  }
  if (window.toast) window.toast.info('正在验证 ' + (m.name || m.id) + '...');
  m._verified = 'pending';
  renderSettingsModelsList();

  fetch('/api/models/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: m.base_url, api_key: m.api_key, model: m.name || m.id, provider_id: m.provider || 0 }),
  }).then(r => r.json()).then(d => {
    if (d.success) {
      const caps = d.capabilities || [];
      if (caps.length) m.capabilities = Array.from(new Set([...(m.capabilities || []), ...caps]));
      m._verified = true; m._latency = d.latency_ms; m._ttft = d.ttft_ms; m.ttft = d.ttft_ms;
      m.streaming = d.streaming; m._streaming = d.streaming || d._streaming;
      m.json_mode = d.json_mode; m._json_mode = d.json_mode || d._json_mode;
      m.context_window_tested = d.context_window_tested; m._context_window_tested = d.context_window_tested || d._context_window_tested;
      m._error = null;
      if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) m.context_window = d.context_window_tested;
      renderSettingsModelsList();
      saveModelsImmediate();
      const info = [d.latency_ms + 'ms'];
      if (d.ttft_ms) info.push('TTFT ' + d.ttft_ms + 'ms');
      if (d.streaming) info.push('流式');
      if (d.context_window_tested) {
        info.push('ctx ' + (d.context_window_tested >= 1000000 ? (d.context_window_tested/1000000).toFixed(1)+'M' : (d.context_window_tested/1000).toFixed(0)+'K'));
      }
      if (window.toast) window.toast.success((m.name || m.id) + ' 验证通过 (' + info.join(' · ') + ')', 4000);
    } else {
      m._verified = false; m._error = d.error || '连接失败';
      renderSettingsModelsList();
      if (window.toast) window.toast.error((m.name || m.id) + ' 验证失败: ' + (d.error || '连接失败'), 4000);
    }
  }).catch(e => {
    m._verified = false; m._error = e.message || '请求失败';
    renderSettingsModelsList();
  });
}

export function verifyAllModels() {
  if (!settingsModelsCache.length) { if (window.toast) window.toast.warning('没有可验证的模型'); return; }
  if (window.toast) window.toast.info('开始验证全部 ' + settingsModelsCache.length + ' 个模型...');

  const CONCURRENCY = 3;
  const queue = [...settingsModelsCache.entries()].filter(([, m]) => m.base_url && m.api_key);
  let done = 0;
  const total = queue.length;

  queue.forEach(([, m]) => { m._verified = 'pending'; });
  renderSettingsModelsList();

  let idx = 0;
  const workers = Array(Math.min(CONCURRENCY, total)).fill(null).map(async () => {
    while (idx < total) {
      const i = idx++;
      const m = queue[i][1];
      try {
        const r = await fetch('/api/models/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_url: m.base_url, api_key: m.api_key, model: m.name || m.id, provider_id: m.provider || 0 }),
        });
        const d = await r.json();
        if (d.success) {
          const caps = d.capabilities || [];
          if (caps.length) m.capabilities = Array.from(new Set([...(m.capabilities || []), ...caps]));
          m._verified = true; m._latency = d.latency_ms; m._ttft = d.ttft_ms; m.ttft = d.ttft_ms;
          m.streaming = d.streaming; m._streaming = d.streaming || d._streaming;
          m.json_mode = d.json_mode; m._json_mode = d.json_mode || d._json_mode;
          m.context_window_tested = d.context_window_tested;
          m._context_window_tested = d.context_window_tested || d._context_window_tested;
          m._error = null;
          if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) m.context_window = d.context_window_tested;
        } else {
          m._verified = false; m._error = d.error || '连接失败';
        }
      } catch(err) {
        m._verified = false; m._error = err.message || '请求失败';
      }
      done++;
      renderSettingsModelsList();
    }
  });
  Promise.all(workers).then(() => {
    autoSaveModels();
    const passed = settingsModelsCache.filter(m => m._verified === true).length;
    const failed = settingsModelsCache.filter(m => m._verified === false).length;
    if (window.toast) window.toast.success('验证完成: ' + passed + ' 通过, ' + failed + ' 失败', 3000);
  });
}

// ===== 辅助函数 =====
function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== 事件委托 =====
// 验证按钮
document.addEventListener('click', function(e) {
  var target = e.target;
  var btn = target && typeof target.closest === 'function' ? target.closest('.btn-verify') : null;
  if (!btn || !btn.dataset.name) return;
  e.preventDefault(); e.stopPropagation();
  if (!btn.closest('.models-grid')) return;
  verifySingleModel(btn.dataset.name);
});

// 复制模型名按钮
document.addEventListener('click', function(e) {
  var target = e.target;
  var btn = target && typeof target.closest === 'function' ? target.closest('.btn-copy-model') : null;
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  var name = btn.dataset.name;
  if (name) copyModelName(e, name);
});

// 关闭 cap filter dropdown
document.addEventListener('click', function(e) {
  var target = e.target;
  var dropdown = document.getElementById('capFilterDropdown');
  var menu = document.getElementById('capFilterMenu');
  if (menu && dropdown && (!target || typeof target.closest !== 'function' || !dropdown.contains(target))) {
    menu.style.display = 'none';
  }
});

// 走马灯 — mouseenter
document.addEventListener('mouseenter', function(e) {
  var target = e.target;
  var nameEl = target && typeof target.closest === 'function' ? target.closest('.model-name-scroll') : null;
  if (nameEl && !nameEl._marqueeTimer && nameEl.scrollWidth > nameEl.clientWidth + 1) {
    const overflow = nameEl.scrollWidth - nameEl.clientWidth;
    const duration = Math.max(1500, overflow * 20);
    const text = nameEl.querySelector('.model-name-text');
    if (text) {
      text.style.transition = 'transform ' + duration + 'ms linear';
      text.style.transform = 'translateX(-' + overflow + 'px)';
      nameEl._marqueeTimer = setTimeout(() => {
        text.style.transition = 'none';
        nameEl._marqueeTimer = null;
      }, duration);
    }
  }
  // caps 走马灯
  var scrollEl = target && typeof target.closest === 'function' ? target.closest('.model-caps-scroll') : null;
  if (scrollEl && !scrollEl._marqueeTimer) {
    const inner = scrollEl.querySelector('.model-caps-inner');
    if (inner && inner.scrollWidth > scrollEl.clientWidth + 1) {
      const overflow = inner.scrollWidth - scrollEl.clientWidth;
      const duration = Math.max(1500, overflow * 20);
      inner.style.transition = 'transform ' + duration + 'ms linear';
      inner.style.transform = 'translateX(-' + overflow + 'px)';
      scrollEl._marqueeTimer = setTimeout(() => {
        inner.style.transition = 'none';
        scrollEl._marqueeTimer = null;
      }, duration);
    }
  }
}, true);

// 走马灯 — mouseleave
document.addEventListener('mouseleave', function(e) {
  var target = e.target;
  var nameEl = target && typeof target.closest === 'function' ? target.closest('.model-name-scroll') : null;
  if (nameEl) {
    if (nameEl._marqueeTimer) { clearTimeout(nameEl._marqueeTimer); nameEl._marqueeTimer = null; }
    const text = nameEl.querySelector('.model-name-text');
    if (text) {
      text.style.transition = 'transform 300ms ease-out';
      text.style.transform = 'translateX(0)';
    }
  }
  var scrollEl = target && typeof target.closest === 'function' ? target.closest('.model-caps-scroll') : null;
  if (scrollEl) {
    if (scrollEl._marqueeTimer) { clearTimeout(scrollEl._marqueeTimer); scrollEl._marqueeTimer = null; }
    const inner = scrollEl.querySelector('.model-caps-inner');
    if (inner) {
      inner.style.transition = 'transform 300ms ease-out';
      inner.style.transform = 'translateX(0)';
    }
  }
}, true);

// ===== Window 挂载 =====
window.switchModelTab = switchModelTab;
window.loadSettingsModels = loadSettingsModels;
window.renderSettingsModelsList = renderSettingsModelsList;
window.filterModelsList = filterModelsList;
window.clearModelSearch = clearModelSearch;
window.toggleCapFilterDropdown = toggleCapFilterDropdown;
window.selectCapFilter = selectCapFilter;
window.applyCapFilter = applyCapFilter;
window.clearCapFilter = clearCapFilter;
window.clearModelFilter = clearModelFilter;
window.toggleSortDir = toggleSortDir;
window.editProviderName = editProviderName;
window.removeSettingsModel = removeSettingsModel;
window.resetSettingsModels = resetSettingsModels;
window.discoverModels = discoverModels;
window.addSelectedDiscoveredModels = addSelectedDiscoveredModels;
window.addAllDiscoveredModels = addAllDiscoveredModels;
window.chatFilterDiscovered = chatFilterDiscovered;
window.chatClearDiscoverFilter = chatClearDiscoverFilter;
window.applyProviderPreset = applyProviderPreset;
window.verifySingleModel = verifySingleModel;
window.verifyAllModels = verifyAllModels;
window.copyModelName = copyModelName;
window.autoSaveModels = autoSaveModels;
