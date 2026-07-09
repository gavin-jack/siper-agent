// chat-pages/model-settings.js — 模型设置页面
// 2026-08-25: 提取常量映射、CSS class 替代内联 style、简化 copyModelName
import { fmtSpeed } from '../../utils/format.js?v=1783620257626';
import { apiGetCached } from '../../utils/api.js?v=1783620257626';

// ===== 状态 =====
export let settingsModelsCache = [];
export let discoveredModelsCache = [];
let _selectedCaps = new Set();
let _sortDir = 'asc';
let _lastRenderCount = 0;
let _autoSaveTimer = null;

// ===== 常量映射（单一来源）========================

var CAP_ICONS = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', function_calling: '🔧', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏' };
var CAP_LABELS = { vision: '视觉', reasoning: '推理', code: '代码', chat: '对话', function_calling: '工具', tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文' };
var CAP_ORDER = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };

var PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1', moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1', longcat: '',
  zhipuai: 'https://open.bigmodel.cn/api/paas/v4', minimax: 'https://api.minimax.chat/v1',
  groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1',
  ollama: '', custom: '',
};
var LOCKED_PROVIDERS = new Set(['openai','anthropic','deepseek','moonshot','qwen','zhipuai','minimax','groq','openrouter']);

// ===== 辅助函数 ──────────────────────────────────────

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _fmtCtx(ctx) {
  if (!ctx) return '-';
  return ctx >= 1000000 ? (ctx / 1000000).toFixed(1) + 'M' : (ctx / 1000).toFixed(0) + 'K';
}
// _fmtCtx is kept for model card context formatting (format.js fmtNum doesn't handle M suffix)

// ===== Tab 切换 ──────────────────────────────────────

export function switchModelTab(tabName) {
  var tabs = document.querySelectorAll('.siper-settings-tab');
  var contents = document.querySelectorAll('.js-model-settings-tab-content');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  contents.forEach(function(c) { c.style.display = 'none'; });
  var activeTab = document.querySelector('.siper-settings-tab[data-tab="' + tabName + '"]');
  var activeContent = document.getElementById('modelSettingsTab-' + tabName);
  if (activeTab) activeTab.classList.add('active');
  if (activeContent) activeContent.style.display = '';
  if (location.hash !== '#/model-settings?tab=' + tabName) {
    history.replaceState(null, '', '#/model-settings?tab=' + tabName);
  }
}

// ===== 渲染模型设置页面 ──────────────────────────────

export function renderModelSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content page-model-settings';
  container.innerHTML =
    '<div class="siper-settings-tabs">' +
    '<button class="siper-settings-tab active" data-tab="models" onclick="window.switchModelTab(\'models\')">' + (window.t ? window.t('tabModels') : '模型管理') + '</button>' +
    '<button class="siper-settings-tab" data-tab="auxiliary" onclick="window.switchModelTab(\'auxiliary\')">' + (window.t ? window.t('tabAuxiliary') : '辅助') + '</button>' +
    '</div>' +
    '<div id="modelSettingsTab-models" class="js-model-settings-tab-content">' +
    '<div class="js-model-settings-grid">' +
    // 可用模型卡片
    '<div class="siper-form-card js-form-card">' +
    '<div class="siper-form-title js-form-title">' +
    '<span>可用模型</span>' +
    '<div class="js-spacer"></div>' +
    '<div class="js-search-wrapper">' +
    '<input type="text" id="modelSearchInput" placeholder="搜索模型..." class="siper-input js-input-xs" oninput="window.filterModelsList()">' +
    '<span id="modelSearchClear" onclick="window.clearModelSearch()" class="js-search-clear" title="清空">✕</span>' +
    '</div>' +
    '<div id="capFilterDropdown" class="js-cap-filter-wrap">' +
    '<button id="capFilterBtn" class="siper-input js-cap-filter-btn" onclick="window.toggleCapFilterDropdown()" aria-label="按功能筛选">' +
    '<span id="capFilterLabel">全部功能</span></button>' +
    '<div id="capFilterMenu" class="js-cap-filter-menu">' +
    '<div class="js-cap-filter-options">' +
    _capFilterOptions() +
    '</div>' +
    '<div class="js-cap-filter-actions">' +
    '<button class="siper-btn js-btn-xs" onclick="window.clearCapFilter()">清除</button>' +
    '<button class="siper-btn primary js-btn-xs" onclick="window.applyCapFilter()">确定</button>' +
    '</div></div></div>' +
    '<div class="js-sort-wrapper">' +
    '<select id="modelSortBy" class="siper-input js-sort-select" onchange="window.filterModelsList()" aria-label="排序">' +
    '<option value="">排序</option><option value="name">按名称</option><option value="ttft">按响应时间</option><option value="latency">按延迟</option><option value="context">按上下文窗口</option><option value="caps">按能力数量</option></select>' +
    '<button id="sortDirBtn" class="siper-input js-sort-dir-btn" onclick="window.toggleSortDir()" title="切换排序方向">↑</button>' +
    '</div>' +
    '<button class="siper-btn primary js-btn-verify-all" onclick="window.verifyAllModels()">验证全部</button>' +
    '</div>' +
    '<div id="settingsModelsList"></div>' +
    '</div>' +
    // 发现模型侧栏
    _tplDiscoverForm() +
    // 辅助 tab
    '<div id="modelSettingsTab-auxiliary" class="js-model-settings-tab-content" style="display:none">' +
    '<div class="siper-form-card"><div class="siper-form-title">🔧 辅助模型</div>' +
    '<div class="text-dim" style="margin-bottom:12px">辅助模型配置功能开发中，敬请期待...</div>' +
    '<div id="auxiliaryModelsContainer"></div></div></div>';
  if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
}

function _capFilterOptions() {
  var caps = ['chat', 'vision', 'reasoning', 'code', 'function_calling', 'tts', 'embedding', 'image_gen', 'long_context'];
  return caps.map(function(c) {
    return '<div class="cap-filter-option js-cap-filter-option" data-cap="' + c + '" onclick="window.selectCapFilter(\'' + c + '\')">' +
      '<input type="checkbox" class="js-checkbox"> ' + (CAP_ICONS[c] || '') + CAP_LABELS[c] + '</div>';
  }).join('');
}


function _tplDiscoverForm() {
  return '<div class="siper-form-card js-form-card-sidebar">' +
    '<form class="js-discover-form">' +
    '<div class="siper-form-title">🔍 发现模型</div>' +
    '<div class="js-sort-group">' +
    '<div style="flex:1"><div class="text-dim js-label-sm">Provider</div>' +
    '<select id="providerPreset" class="siper-input js-input-sm" onchange="window.applyProviderPreset()" aria-label="Provider 预设">' +
    '<option value="">— 选择 —</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="moonshot">Moonshot</option><option value="qwen">Qwen</option><option value="longcat">LongCat</option><option value="zhipuai">ZhipuAI</option><option value="minimax">MiniMax</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama</option><option value="custom">自定义</option></select>' +
    '</div>' +
    '<div style="flex:1.5"><div class="text-dim js-label-sm">Base URL</div>' +
    '<input type="text" class="siper-input js-input-sm" id="discoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL">' +
    '</div></div>' +
    '<div class="js-mb-6"><div class="text-dim js-label-sm">API Key</div>' +
    '<input type="password" class="siper-input js-input-sm" id="discoverApiKey" placeholder="sk-..." autocomplete="off" aria-label="发现 API Key">' +
    '</div>' +
    '<div class="js-select-group">' +
    '<button class="siper-btn primary" onclick="window.discoverModels()">获取模型列表</button>' +
    '<div id="discoverFilterWrap" class="js-discover-filter">' +
    '<input type="text" class="siper-input js-input-search" id="discoverFilter" placeholder="筛选模型..." aria-label="筛选发现的模型" oninput="window.chatFilterDiscovered()">' +
    '<button id="discoverFilterClear" onclick="window.chatClearDiscoverFilter()" class="js-model-card-action" title="清空筛选">×</button>' +
    '</div></div>' +
    '<div id="discoverResult" class="js-scroll-flex"></div>' +
    '</div></div></form></div>';
}

// ===== 加载模型列表 ──────────────────────────────────

export function loadSettingsModels() {
  var list = document.getElementById('settingsModelsList');
  if (list) list.innerHTML = '<div class="siper-loading siper-loading--sm">加载模型数据中...</div>';
  apiGetCached('/api/models/global', 'model-settings').then(function(data) {
    var models = data && Array.isArray(data.models) ? data.models : [];
    settingsModelsCache = models.map(function(m) {
      return Object.assign({}, m, {
        _ttft: m.ttft ?? m._ttft ?? null, _streaming: m.streaming ?? m._streaming ?? null,
        _context_window_tested: m.context_window_tested ?? m._context_window_tested ?? null,
        _json_mode: m.json_mode ?? m._json_mode ?? null,
      });
    });
    window.settingsModelsCache = settingsModelsCache;
    var defaultModel = settingsModelsCache.find(function(m) { return m.is_default; });
    var defName = defaultModel ? defaultModel.name : '';
    settingsModelsCache.forEach(function(m) { m._isDefault = (m.name === defName); });
    renderSettingsModelsList();
  }).catch(function(e) {
    console.error('loadSettingsModels error:', e);
    var list = document.getElementById('settingsModelsList');
    if (list) list.innerHTML = '<div class="settings-empty-msg">加载失败</div>';
  });
}

// ===== 渲染模型列表 ──────────────────────────────────

const SORT_FNS = {
  ttft: m => m.ttft || 99999,
  latency: m => m.latency || m._latency || 99999,
  context: m => m.context_window || 0,
  caps: m => (m.capabilities || []).length,
};

function _filterModels() {
  const searchText = (document.getElementById('modelSearchInput')?.value || '').trim();
  const hasCapFilter = _selectedCaps.size > 0;
  const hasSort = (document.getElementById('modelSortBy')?.value || 'name') !== 'name' || _sortDir !== 'asc';
  const showGroups = !searchText && !hasCapFilter && !hasSort;
  let filtered = settingsModelsCache.slice();
  
  if (searchText) {
    const q = searchText.toLowerCase();
    filtered = filtered.filter(m => (m.name || '').toLowerCase().includes(q));
  }
  if (hasCapFilter) {
    filtered = filtered.filter(m => Array.from(_selectedCaps).every(c => (m.capabilities || []).includes(c)));
  }
  return { filtered, showGroups, searchText, hasCapFilter, hasSort };
}

function _sortModels(filtered) {
  const sortKey = document.getElementById('modelSortBy')?.value || '';
  if (!sortKey) return filtered;
  const dir = _sortDir === 'asc' ? 1 : -1;
  if (sortKey === 'name') {
    return filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '') * dir);
  }
  const fn = SORT_FNS[sortKey] || (() => 0);
  return filtered.sort((a, b) => (fn(a) - fn(b)) * dir);
}

function _groupModels(filtered) {
  const groups = new Map();
  filtered.forEach(m => {
    const key = m.base_url || '';
    if (!groups.has(key)) {
      groups.set(key, { base_url: key, models: [], provider: m.provider || '', provider_name: m.provider_name || '' });
    }
    groups.get(key).models.push(m);
  });
  return Array.from(groups.values()).sort((a, b) => {
    const aHasDef = a.models.some(m => m._isDefault);
    const bHasDef = b.models.some(m => m._isDefault);
    if (aHasDef !== bHasDef) return aHasDef ? -1 : 1;
    return a.base_url.localeCompare(b.base_url);
  });
}

function _buildGroupHtml(group) {
  const providerAlias = group.provider_name || group.provider || '';
  const displayName = providerAlias ? providerAlias + ' (' + group.base_url + ')' : (group.base_url || '默认');
  const html = '<div class="model-group-header" data-base-url="' + escapeAttr(group.base_url) + '" style="display:flex;align-items:center;gap:6px;margin-top:10px;margin-bottom:4px;padding:4px 0;border-bottom:1px solid var(--color-border);">' +
    '<span class="model-group-label model-name-text" data-base-url="' + escapeAttr(group.base_url) + '" title="双击修改名称" ondblclick="window.editProviderName(\'' + escapeAttr(group.base_url) + '\')">' + escapeHtml(displayName) + '</span>' +
    '<span class="model-group-count text-dim" style="font-size:11px">(' + group.models.length + ')</span></div>' +
    '<div class="models-grid">' + group.models.map(m => buildCardHtml(m)).join('') + '</div>';
  return html;
}

function _buildFilteredHtml(filtered, searchText, hasCapFilter, hasSort) {
  let html = '<div class="models-grid">' + filtered.map(m => buildCardHtml(m)).join('') + '</div>';
  if (searchText || hasCapFilter || hasSort) {
    const parts = [];
    if (searchText) parts.push('搜索: "' + escapeHtml(searchText) + '"');
    if (hasCapFilter) parts.push(_selectedCaps.size + '项筛选');
    if (hasSort) parts.push('排序');
    html = '<div class="js-model-card" style="display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:12px;color:var(--color-text-dim);">' +
      '<span>📋 ' + parts.join(' + ') + '</span>' +
      '<button class="siper-btn js-btn-xs" onclick="window.clearModelFilter()">恢复分组</button></div>' + html;
  }
  return html;
}

function _animateNewCards(list) {
  const currentCount = list.querySelectorAll('.card.model-card').length;
  if (currentCount > _lastRenderCount) {
    requestAnimationFrame(() => {
      const allCards = list.querySelectorAll('.card.model-card');
      for (let i = _lastRenderCount; i < allCards.length; i++) {
        const card = allCards[i];
        card.classList.add('model-card-animate');
        card.style.animationDelay = (i - _lastRenderCount) * 30 + 'ms';
        ((c, idx) => setTimeout(() => {
          c.classList.remove('model-card-animate');
          c.style.animationDelay = '';
        }, 250 + (idx - _lastRenderCount) * 30 + 50))(card, i);
      }
    });
  }
  _lastRenderCount = currentCount;
}

function _detectMarquee(list) {
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

export function renderSettingsModelsList() {
  const list = document.getElementById('settingsModelsList');
  if (!list) return;
  if (!settingsModelsCache || settingsModelsCache.length === 0) {
    list.innerHTML = '<div class="settings-empty-msg">暂无模型，请添加</div>';
    return;
  }
  const { filtered, showGroups, searchText, hasCapFilter, hasSort } = _filterModels();
  const sorted = _sortModels(filtered);
  list.style.maxHeight = Math.max(200, window.innerHeight - 200) + 'px';
  list.style.overflowY = 'auto';
  const html = showGroups
    ? _groupModels(sorted).map(g => _buildGroupHtml(g)).join('')
    : _buildFilteredHtml(sorted, searchText, hasCapFilter, hasSort);
  list.innerHTML = html;
  _animateNewCards(list);
  _detectMarquee(list);
}

// ===== 模型卡片 ──────────────────────────────────────

function buildCardHtml(m) {
  var ctx = _fmtCtx(m.context_window);
  var capBadges = renderCapBadges(m.capabilities);
  var ctxTested = m.context_window_tested ? _fmtCtx(m.context_window_tested) : '';
  var ttft = m.ttft ? fmtSpeed(m.ttft) : null;
  var latency = (m._latency || m.latency) ? fmtSpeed(m._latency || m.latency) : null;
  var streaming = m.streaming ? '⚡流式' : '';
  var jsonMode = m.json_mode ? '📋json' : '';
  var latencyOnly = m._latency && !m.ttft ? latency : null;
  var metaTags = [ctxTested, ttft, latencyOnly, streaming, jsonMode].filter(Boolean).map(function(t) {
    return '<span class="siper-meta-tag ' + (t.cls || '') + '">' + (t.label || t) + '</span>';
  }).join('');
  var verifyBtnHtml = m._verified === 'pending'
    ? '<button class="btn-sm btn-verify-pending" disabled title="检测中...">⏳</button>'
    : '<button class="btn-sm btn-verify" data-name="' + escapeAttr(m.name) + '" title="验证可用性">🔍</button>';
  var verifyClass = m._verified === 'pending' ? ' model-card-verifying' : m._verified === true ? ' model-verify-pass' : m._verified === false ? ' model-verify-fail' : '';
  return '<div class="card model-available card-left-accent' + verifyClass + '" data-model-name="' + escapeAttr(m.name) + '" data-caps="' + escapeAttr((m.capabilities || []).join(',')) + '" data-ttft="' + (m.ttft || 99999) + '" data-latency="' + (m._latency || m.latency || 99999) + '" data-context="' + (m.context_window || 0) + '">' +
    '<div class="model-card-header">' +
    '<div class="model-name-scroll"><span class="model-name-text" title="' + escapeAttr(m.name) + '">' + escapeHtml(m.name) + '</span></div>' +
    '<div class="model-card-actions">' +
    '<button class="btn-sm btn-copy-model" data-name="' + escapeAttr(m.name) + '" title="复制模型名称">' +
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="5" width="9" height="9" rx="1.5" opacity="0.6"/><rect x="2" y="2" width="9" height="9" rx="1.5"/></svg></button>' +
    '<button class="btn-sm danger" onclick="window.removeSettingsModelByName(\'' + escapeAttr(m.name) + '\')" title="删除模型">✕</button>' +
    '</div></div>' +
    '<div class="siper-model-meta">' + (ctx ? '<span class="siper-meta-tag">ctx ' + ctx + '</span>' : '') + metaTags + '</div>' +
    (m._verified === false && m._error ? '<div class="model-card-error text-danger-sm">❌ ' + escapeHtml(m._error) + '</div>' : '') +
    '<div class="model-card-actions-bottom">' +
    '<div class="model-caps-scroll">' +
    (m._verified === 'pending' ? '<div class="model-caps-inner text-warning-sm"><span class="pulse">⏳</span> 正在更新模型能力...</div>' : (capBadges ? '<div class="model-caps-inner">' + capBadges + '</div>' : '')) +
    '</div>' + verifyBtnHtml +
    '</div></div>';
}

function renderCapBadges(capabilities) {
  if (!capabilities || !capabilities.length) return '';
  return capabilities.map(function(c) {
    return '<span class="cap-badge cap-badge-' + c + '" title="' + (CAP_LABELS[c] || c) + '">' + (CAP_ICONS[c] || c) + '</span>';
  }).join('');
}

// ===== 搜索 / 筛选 / 排序 ────────────────────────────

export function filterModelsList() {
  var input = document.getElementById('modelSearchInput');
  var clearBtn = document.getElementById('modelSearchClear');
  if (input && clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
  renderSettingsModelsList();
}

export function clearModelSearch() {
  var input = document.getElementById('modelSearchInput');
  if (input) input.value = '';
  renderSettingsModelsList();
}

export function toggleCapFilterDropdown() {
  var menu = document.getElementById('capFilterMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

export function selectCapFilter(cap) {
  if (_selectedCaps.has(cap)) _selectedCaps.delete(cap); else _selectedCaps.add(cap);
  var label = document.getElementById('capFilterLabel');
  if (label) {
    if (_selectedCaps.size === 0) label.textContent = '全部功能';
    else if (_selectedCaps.size <= 2) label.textContent = Array.from(_selectedCaps).map(function(c) { return (CAP_ICONS[c] || '') + (CAP_LABELS[c] || c); }).join('+');
    else label.textContent = _selectedCaps.size + '项筛选';
  }
  document.querySelectorAll('.cap-filter-option').forEach(function(el) {
    var cb = el.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = _selectedCaps.has(el.dataset.cap);
  });
}

export function applyCapFilter() {
  var menu = document.getElementById('capFilterMenu');
  if (menu) menu.style.display = 'none';
  renderSettingsModelsList();
}

export function clearCapFilter() {
  _selectedCaps.clear();
  var label = document.getElementById('capFilterLabel');
  if (label) label.textContent = '全部功能';
  document.querySelectorAll('.cap-filter-option input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
}

export function clearModelFilter() {
  _selectedCaps.clear(); _sortDir = 'asc';
  var input = document.getElementById('modelSearchInput');
  if (input) input.value = '';
  var label = document.getElementById('capFilterLabel');
  if (label) label.textContent = '全部功能';
  document.querySelectorAll('.cap-filter-option input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
  var menu = document.getElementById('capFilterMenu');
  if (menu) menu.style.display = 'none';
  var sortSelect = document.getElementById('modelSortBy');
  if (sortSelect) sortSelect.value = '';
  var sortBtn = document.getElementById('sortDirBtn');
  if (sortBtn) sortBtn.textContent = '↑';
  renderSettingsModelsList();
}

export function toggleSortDir() {
  _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  var btn = document.getElementById('sortDirBtn');
  if (btn) btn.textContent = _sortDir === 'asc' ? '↑' : '↓';
  renderSettingsModelsList();
}

// ===== 编辑 Provider 名称 ────────────────────────────

export function editProviderName(baseUrl) {
  var current = settingsModelsCache.find(function(m) { return m.base_url === baseUrl; });
  var currentName = current ? (current.provider_name || current.provider || baseUrl) : baseUrl;
  window.showInput({
    title: '编辑 Provider 名称',
    placeholder: '请输入 Provider 名称（留空使用 Base URL）',
    onConfirm: function(newName) {
      if (!newName || !newName.trim() || newName.trim() === currentName) return;
      _doRename(baseUrl, newName.trim());
    }
  });
}

function _doRename(baseUrl, trimmed) {
  if (!trimmed) return;
  settingsModelsCache.forEach(function(m) { if (m.base_url === baseUrl) m.provider_name = trimmed || ''; });
  renderSettingsModelsList();
  fetch('/api/models/provider/rename', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl, provider_alias: trimmed }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (!d.success && window.toast) window.toast.warning('名称已本地更新，但数据库保存失败');
  }).catch(function() {});
  autoSaveModels();
}

// ===== 删除模型 ──────────────────────────────────────

export function removeSettingsModel(idx) {
  var m = settingsModelsCache[idx];
  if (!m) return;
  window.showConfirm({ title: '删除模型', msg: '确定删除 "' + (m.name || m.id) + '"？', danger: true, onConfirm: function() { _doRemove(idx); } });
}

function _doRemove(idx) {
  var m = settingsModelsCache[idx];
  if (!m) return;
  fetch('/api/models/' + encodeURIComponent(m.id || m.name) + '?provider=' + encodeURIComponent(m.provider || ''), { method: 'DELETE' })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.success) { window.toast.error('删除失败: ' + (d.error || 'unknown')); return; }
      settingsModelsCache.splice(idx, 1);
      renderSettingsModelsList();
      window.toast.success('已删除模型: ' + m.name);
    }).catch(function(e) { window.toast.error('删除失败: ' + e.message); });
}

export function removeSettingsModelByName(name) {
  for (var _i = 0; _i < settingsModelsCache.length; _i++) {
    if (settingsModelsCache[_i].name === name) { removeSettingsModel(_i); return; }
  }
  window.toast.error('未找到模型: ' + name);
}

// ===== 复制模型名 ──────────────────────────────────────

export function copyModelName(e, name) {
  var btn = (e && e.target && e.target.closest('button')) || (e && e.currentTarget);
  if (!btn || !btn.classList.contains('btn-copy-model')) return;
  var showOk = function() {
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="var(--green)"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>';
    setTimeout(function() { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="5" width="9" height="9" rx="1.5" opacity="0.6"/><rect x="2" y="2" width="9" height="9" rx="1.5"/></svg>'; }, 1200);
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(name).then(function() { showOk(); window.toast.success('已复制'); }).catch(function() {
      try {
        var ta = document.createElement('textarea'); ta.value = name; ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        if (document.execCommand('copy')) { document.body.removeChild(ta); showOk(); window.toast.success('已复制'); return; }
        document.body.removeChild(ta);
      } catch(ex) {}
      _copyFallback(name); showOk();
    });
  } else { _copyFallback(name); showOk(); }
}

function _copyFallback(name) {
  window.showDictModal('复制', name);
}

// ===== 模型发现 ──────────────────────────────────────

export function discoverModels() {
  var baseUrl = document.getElementById('discoverBaseUrl')?.value.trim();
  var apiKey = document.getElementById('discoverApiKey')?.value.trim();
  if (!baseUrl) { window.toast.warning('请输入 Base URL'); return; }
  if (!apiKey) { window.toast.warning('请输入 API Key'); return; }
  var resultEl = document.getElementById('discoverResult');
  if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">⏳ 正在获取模型列表...</div>';
  fetch('/api/models/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }) })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.success || !d.models || d.models.length === 0) {
        if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">' + (d.success ? '未找到可用模型' : ('❌ ' + escapeHtml(d.error || '获取失败'))) + '</div>';
        return;
      }
      fetch('/api/models/global').then(function(r2) { return r2.json(); }).then(function(existing) {
        var existingNames = new Set((existing.models || []).map(function(m) { return m.name; }));
        var allModels = d.models.map(function(m) { return Object.assign({}, m, { _exists: existingNames.has(m.name || m.id) }); });
        var newModels = allModels.filter(function(m) { return !m._exists; });
        discoveredModelsCache = allModels;
        var filterInput = document.getElementById('discoverFilter');
        if (filterInput) filterInput.value = '';
        renderDiscoveredModels(allModels, newModels.length, d.provider, d.count);
      }).catch(function() {
        var allModels = d.models.map(function(m) { return Object.assign({}, m, { _exists: false }); });
        discoveredModelsCache = allModels;
        renderDiscoveredModels(allModels, allModels.length, d.provider, d.count);
      });
    }).catch(function(e) {
      if (resultEl) resultEl.innerHTML = '<div class="settings-empty-msg">❌ ' + escapeHtml(e.message) + '</div>';
    });
}

export function renderDiscoveredModels(allModels, newCount, provider, totalCount) {
  var resultEl = document.getElementById('discoverResult');
  if (!resultEl) return;
  var showModels = allModels.filter(function(m) { return !m._exists; });
  var existingCount = allModels.length - showModels.length;
  var html = '<div class="discover-result-header">';
  if (existingCount > 0) {
    html += '✅ 发现 <strong class="discover-count">' + totalCount + '</strong> 个（已添 ' + existingCount + '）';
  } else {
    html += '✅ 发现 <strong class="discover-count">' + totalCount + '</strong> 个模型 · Provider: <strong>' + escapeHtml(provider || '-') + '</strong>';
  }
  if (showModels.length > 0) {
    html += '<span class="discover-header-actions">' +
      '<button class="btn-sm primary btn-discover-add-all" onclick="window.addAllDiscoveredModels()" title="全选">☑</button>' +
      '<button class="btn-sm btn-discover-add-one btn-discover-add-green" onclick="window.addSelectedDiscoveredModels()" title="添加选中的模型">+</button>' +
      '</span>';
  }
  html += '</div>';
  if (showModels.length === 0) {
    html += '<div class="settings-empty-msg">所有模型均已添加</div>';
  } else {
    html += '<div class="models-grid models-grid-discover">';
    showModels.forEach(function(m) {
      var caps = (m.capabilities || []).slice().sort(function(a, b) { return (CAP_ORDER[a] ?? 50) - (CAP_ORDER[b] ?? 50); });
      var capBadges = caps.map(function(c) { return '<span class="cap-badge cap-badge-' + c + '" title="' + c + '">' + (CAP_ICONS[c] || c) + '</span>'; }).join('');
      var ctx = _fmtCtx(m.context_window);
      html += '<div class="card model-discover card-left-accent" data-name="' + escapeAttr(m.name || m.id) + '">' +
        '<div class="model-card-header">' +
        '<input type="checkbox" class="discover-check" data-name="' + escapeAttr(m.name || m.id) + '" style="flex-shrink:0;cursor:pointer">' +
        '<div class="model-name-scroll">' +
        '<span class="model-name-text" title="' + escapeAttr(m.name || m.id) + '">' + escapeHtml((m.name || m.id).length > 20 ? (m.name || m.id).substring(0, 18) + '..' : (m.name || m.id)) + '</span>' +
        '</div></div>' +
        '<div class="siper-model-meta"><span class="siper-meta-tag">ctx ' + ctx + '</span>' + (capBadges ? ' ' + capBadges : '') + '</div>' +
        '</div>';
    });
    html += '</div>';
  }
  resultEl.innerHTML = html;
  var filterWrap = document.getElementById('discoverFilterWrap');
  if (filterWrap) filterWrap.style.display = allModels.length >= 6 ? 'block' : 'none';
}

export function chatFilterDiscovered() {
  var input = document.getElementById('discoverFilter');
  var clearBtn = document.getElementById('discoverFilterClear');
  if (input && clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
  var text = (input?.value || '').trim().toLowerCase();
  var cards = document.querySelectorAll('#discoverResult .model-discover');
  var shown = 0;
  cards.forEach(function(card) {
    var name = (card.dataset.name || '').toLowerCase();
    var match = !text || name.includes(text);
    card.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  var header = document.querySelector('#discoverResult .discover-result-header');
  if (header) {
    var total = cards.length;
    var newCount = discoveredModelsCache.filter(function(m) { return !m._exists; }).length;
    var existingCount = discoveredModelsCache.length - newCount;
    if (text) {
      header.innerHTML = '🔍 筛选: <strong>"' + escapeHtml(text) + '"</strong> · 匹配 ' + shown + '/' + total + ' 个';
    } else if (existingCount > 0) {
      header.innerHTML = '✅ 发现 <strong class="discover-count">' + discoveredModelsCache.length + '</strong> 个（已添 ' + existingCount + '）';
    } else {
      header.innerHTML = '✅ 发现 <strong class="discover-count">' + total + '</strong> 个模型';
    }
    if (newCount > 0) {
      header.innerHTML += '<span class="discover-header-actions"><button class="btn-sm primary btn-discover-add-all" onclick="window.addAllDiscoveredModels()" title="全选">☑</button><button class="btn-sm btn-discover-add-one btn-discover-add-green" onclick="window.addSelectedDiscoveredModels()" title="添加选中的模型">+</button></span>';
    }
  }
}

export function chatClearDiscoverFilter() {
  var input = document.getElementById('discoverFilter');
  if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
}

export function addSelectedDiscoveredModels() {
  var checkboxes = document.querySelectorAll('#discoverResult .discover-check:checked');
  if (checkboxes.length === 0) { window.toast.warning('请先勾选要添加的模型'); return; }
  var names = Array.from(checkboxes).map(function(cb) { return cb.dataset.name; });
  var models = discoveredModelsCache.filter(function(m) { return names.includes(m.name || m.id); });
  _addDiscoveredModels(models);
}

function _addDiscoveredModels(models) {
  if (!models.length) return;
  var baseUrls = Array.from(new Set(models.map(function(m) { return m.base_url; })));
  var added = 0;
  var promises = baseUrls.map(function(baseUrl) {
    var prov = models.find(function(m) { return m.base_url === baseUrl; });
    return fetch('/api/models/global').then(function(r) { return r.json(); }).then(function(data) {
      var existingProv = (data.models || []).find(function(m) { return m.base_url === baseUrl; });
      if (existingProv) return _saveModelsForProvider(existingProv.provider || 0, models.filter(function(m) { return m.base_url === baseUrl; }));
      return fetch('/api/models/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: baseUrl, api_key: prov.api_key, provider: prov.provider || '', provider_alias: prov.provider_alias || '' }) })
        .then(function(r) { return r.json(); }).then(function(d) {
          if (!d.success && !d.provider_id) throw new Error(d.error || '创建 Provider 失败');
          return _saveModelsForProvider(d.provider_id || d.id || 0, models.filter(function(m) { return m.base_url === baseUrl; }));
        });
    });
  });
  Promise.all(promises).then(function(results) {
    results.forEach(function(r) { added += r; });
    if (added > 0) {
      window.toast.success('已添加 ' + added + ' 个模型');
      if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
      var addedNames = models.map(function(m) { return m.name || m.id; });
      discoveredModelsCache.forEach(function(m) { if (addedNames.includes(m.name || m.id)) m._exists = true; });
      renderDiscoveredModels(discoveredModelsCache, 0, '', discoveredModelsCache.length);
    }
  }).catch(function(e) { window.toast.error('添加失败: ' + e.message); });
}

function _saveModelsForProvider(providerId, models) {
  if (!models.length) return Promise.resolve(0);
  var payload = models.map(function(m) {
    return { id: m.id || m.name, name: m.name || m.id, alias: m.alias || '', provider: providerId, provider_name: m.provider_name || m.provider || '', base_url: m.base_url, api_key: m.api_key, context_window: m.context_window, capabilities: m.capabilities || [] };
  });
  return fetch('/api/models/global', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models: payload }) })
    .then(function(r) { return r.json(); }).then(function(d) { if (!d.success) throw new Error(d.error || '保存失败'); return models.length; });
}

export function addAllDiscoveredModels() {
  var checkboxes = document.querySelectorAll('#discoverResult .discover-check');
  var allChecked = Array.from(checkboxes).every(function(cb) { return cb.checked; });
  checkboxes.forEach(function(cb) { cb.checked = !allChecked; });
}

// ===== 自动保存 ──────────────────────────────────────

async function saveModelsImmediate() {
  var modelsToSave = settingsModelsCache.map(function(m) {
    return { id: m.id || m.name, name: m.name, alias: m.alias || '', provider: m.provider, provider_name: m.provider_name || '', base_url: m.base_url, api_key: m.api_key, context_window: m.context_window, capabilities: m.capabilities || [], is_default: m._isDefault || false, ttft: m.ttft || null, latency: m._latency || m.latency || null, streaming: m.streaming || null, context_window_tested: m.context_window_tested || null, json_mode: m.json_mode || null };
  });
  try {
    var r = await fetch('/api/models/global', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models: modelsToSave }) });
    var d = await r.json();
    if (!d.success && window.toast) window.toast.error('保存失败: ' + (d.error || 'unknown'));
  } catch(e) { window.toast.error('保存失败: ' + e.message); }
}

export function autoSaveModels() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async function() { await saveModelsImmediate(); }, 300);
}

// ===== Provider 预设 ──────────────────────────────────

export function applyProviderPreset() {
  var sel = document.getElementById('providerPreset');
  var urlInput = document.getElementById('discoverBaseUrl');
  if (!sel || !urlInput) return;
  var val = sel.value;
  if (!val) return;
  var presetUrl = PROVIDER_URLS[val];
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

// ===== 重置 ──────────────────────────────────────────

export function resetSettingsModels() {
  if (typeof window.showConfirm === 'function') {
    window.showConfirm({
      title: '重置模型', msg: '确定要清除所有模型配置吗？',
      impact: '⚠ 将删除 models.db 数据库，清空所有模型、默认模型、Provider 配置。此操作不可恢复！',
      danger: true, okText: '确认清除',
      onConfirm: async function() {
        try {
          var r = await fetch('/api/models/reset', { method: 'POST' });
          var d = await r.json();
          if (d.success) { settingsModelsCache = []; discoveredModelsCache = []; renderSettingsModelsList(); window.toast.success('已清除所有模型配置'); }
          else { window.toast.error(d.error || '重置失败'); }
        } catch(e) { window.toast.error('重置失败: ' + (e.message || e)); }
      }
    });
  } else {
    if (!confirm('重置所有模型配置？此操作不可恢复。')) return;
    fetch('/api/models/reset', { method: 'POST' }).then(function(r) { return r.json(); }).then(function() { loadSettingsModels(); }).catch(function(e) { console.error('[model-settings] reset failed:', e); });
  }
}


/** 应用验证结果到模型对象（verifySingleModel 和 verifyAllModels 共用） */
function _applyVerifyResult(m, d) {
  if (d.success) {
    var caps = d.capabilities || [];
    if (caps.length) m.capabilities = Array.from(new Set((m.capabilities || []).concat(caps)));
    m._verified = true; m._latency = d.latency_ms; m._ttft = d.ttft_ms; m.ttft = d.ttft_ms;
    m.streaming = d.streaming; m._streaming = d.streaming || d._streaming;
    m.json_mode = d.json_mode; m._json_mode = d.json_mode || d._json_mode;
    m.context_window_tested = d.context_window_tested; m._context_window_tested = d.context_window_tested || d._context_window_tested;
    m._error = null;
    if (d.context_window_tested && d.context_window_tested > (m.context_window || 0)) m.context_window = d.context_window_tested;
    return true;
  } else {
    m._verified = false; m._error = d.error || '连接失败';
    return false;
  }
}

// ===== 验证 ──────────────────────────────────────────

export function verifySingleModel(modelName) {
  var idx = -1, m = null;
  if (typeof modelName === 'string') {
    for (var _i = 0; _i < settingsModelsCache.length; _i++) { if (settingsModelsCache[_i].name === modelName) { idx = _i; m = settingsModelsCache[_i]; break; } }
  } else if (typeof modelName === 'number') { idx = modelName; m = settingsModelsCache[idx]; }
  if (!m) return;
  if (!m.base_url || !m.api_key) { window.toast.warning((m.name || m.id) + ' 未配置 base_url 或 api_key'); return; }
  window.toast.info('正在验证 ' + (m.name || m.id) + '...');
  m._verified = 'pending';
  renderSettingsModelsList();
  fetch('/api/models/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: m.base_url, api_key: m.api_key, model: m.name || m.id, provider_id: m.provider || 0 }) })
    .then(function(r) { return r.json(); }).then(function(d) {
      _applyVerifyResult(m, d);
      renderSettingsModelsList();
      if (d.success) {
        saveModelsImmediate();
        var info = [d.latency_ms + 'ms'];
        if (d.ttft_ms) info.push('TTFT ' + d.ttft_ms + 'ms');
        if (d.streaming) info.push('流式');
        if (d.context_window_tested) info.push('ctx ' + _fmtCtx(d.context_window_tested));
        window.toast.success((m.name || m.id) + ' 验证通过 (' + info.join(' · ') + ')', 4000);
      } else {
        window.toast.error((m.name || m.id) + ' 验证失败: ' + (d.error || '连接失败'), 4000);
      }
    }).catch(function(e) { m._verified = false; m._error = e.message || '请求失败'; renderSettingsModelsList(); });
}

export function verifyAllModels() {
  if (!settingsModelsCache.length) { window.toast.warning('没有可验证的模型'); return; }
  window.toast.info('开始验证全部 ' + settingsModelsCache.length + ' 个模型...');
  var CONCURRENCY = 3;
  var queue = settingsModelsCache.entries().filter(function(item) { return item[1].base_url && item[1].api_key; });
  var done = 0, total = queue.length;
  queue.forEach(function(item) { item[1]._verified = 'pending'; });
  renderSettingsModelsList();
  var idx = 0;
  var workers = Array(Math.min(CONCURRENCY, total)).fill(null).map(async function() {
    while (idx < total) {
      var i = idx++, m = queue[i][1];
      try {
        var r = await fetch('/api/models/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: m.base_url, api_key: m.api_key, model: m.name || m.id, provider_id: m.provider || 0 }) });
        var d = await r.json();
        _applyVerifyResult(m, d);
      } catch(err) { m._verified = false; m._error = err.message || '请求失败'; }
      done++; renderSettingsModelsList();
    }
  });
  Promise.all(workers).then(function() {
    autoSaveModels();
    var passed = settingsModelsCache.filter(function(m) { return m._verified === true; }).length;
    var failed = settingsModelsCache.filter(function(m) { return m._verified === false; }).length;
    window.toast.success('验证完成: ' + passed + ' 通过, ' + failed + ' 失败', 3000);
  });
}

// ===== 事件委托 ──────────────────────────────────────

document.addEventListener('click', function(e) {
  var btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('.btn-verify') : null;
  if (!btn || !btn.dataset.name) return;
  e.preventDefault(); e.stopPropagation();
  if (!btn.closest('.models-grid')) return;
  verifySingleModel(btn.dataset.name);
});

document.addEventListener('click', function(e) {
  var btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('.btn-copy-model') : null;
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  if (btn.dataset.name) copyModelName(e, btn.dataset.name);
});

document.addEventListener('click', function(e) {
  var dropdown = document.getElementById('capFilterDropdown');
  var menu = document.getElementById('capFilterMenu');
  if (menu && dropdown && (!e.target || typeof e.target.closest !== 'function' || !dropdown.contains(e.target))) {
    menu.style.display = 'none';
  }
});

// 走马灯
document.addEventListener('mouseenter', function(e) {
  var nameEl = e.target && typeof e.target.closest === 'function' ? e.target.closest('.model-name-scroll') : null;
  if (nameEl && !nameEl._marqueeTimer && nameEl.scrollWidth > nameEl.clientWidth + 1) {
    var overflow = nameEl.scrollWidth - nameEl.clientWidth;
    var duration = Math.max(1500, overflow * 20);
    var text = nameEl.querySelector('.model-name-text');
    if (text) {
      text.style.transition = 'transform ' + duration + 'ms linear';
      text.style.transform = 'translateX(-' + overflow + 'px)';
      nameEl._marqueeTimer = setTimeout(function() { text.style.transition = 'none'; nameEl._marqueeTimer = null; }, duration);
    }
  }
  var scrollEl = e.target && typeof e.target.closest === 'function' ? e.target.closest('.model-caps-scroll') : null;
  if (scrollEl && !scrollEl._marqueeTimer) {
    var inner = scrollEl.querySelector('.model-caps-inner');
    if (inner && inner.scrollWidth > scrollEl.clientWidth + 1) {
      var overflow2 = inner.scrollWidth - scrollEl.clientWidth;
      var duration2 = Math.max(1500, overflow2 * 20);
      inner.style.transition = 'transform ' + duration2 + 'ms linear';
      inner.style.transform = 'translateX(-' + overflow2 + 'px)';
      scrollEl._marqueeTimer = setTimeout(function() { inner.style.transition = 'none'; scrollEl._marqueeTimer = null; }, duration2);
    }
  }
}, true);

document.addEventListener('mouseleave', function(e) {
  var nameEl = e.target && typeof e.target.closest === 'function' ? e.target.closest('.model-name-scroll') : null;
  if (nameEl) {
    if (nameEl._marqueeTimer) { clearTimeout(nameEl._marqueeTimer); nameEl._marqueeTimer = null; }
    var text = nameEl.querySelector('.model-name-text');
    if (text) { text.style.transition = 'transform 300ms ease-out'; text.style.transform = 'translateX(0)'; }
  }
  var scrollEl = e.target && typeof e.target.closest === 'function' ? e.target.closest('.model-caps-scroll') : null;
  if (scrollEl) {
    if (scrollEl._marqueeTimer) { clearTimeout(scrollEl._marqueeTimer); scrollEl._marqueeTimer = null; }
    var inner = scrollEl.querySelector('.model-caps-inner');
    if (inner) { inner.style.transition = 'transform 300ms ease-out'; inner.style.transform = 'translateX(0)'; }
  }
}, true);

// ===== Window 挂载 ────────────────────────────────────

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