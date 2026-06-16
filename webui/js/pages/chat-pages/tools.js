/**
 * tools.js — 工具管理页面（卡片式展示所有已注册工具）
 * 优先从 page_cache 读取，后端推送时自动刷新
 */

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('tools', function(data) {
    if (data.tools) {
      const el = document.getElementById('toolsContainer');
      if (el) _renderTools(el, data.tools, data.categories || {});
      var badge = document.getElementById('toolHeaderBadge');
      if (badge) badge.textContent = (data.total || data.tools.length) + ' 个';
    }
  });
}

// 分类图标映射
const _CAT_ICONS = {
  core: '⚙️',
  web: '🌐',
  file: '📄',
  data: '📊',
  communication: '💬',
  utility: '🔧',
};

// 分类名称映射
const _CAT_NAMES = {
  core: '核心',
  web: '网络',
  file: '文件',
  data: '数据',
  communication: '通信',
  utility: '工具',
};

/**
 * 渲染工具页面
 */
export function renderToolsPage(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="page-header">
  <h3>🔧 工具列表 <span class="tool-header-badge" id="toolHeaderBadge">--</span></h3>
</div>
<div class="page-body">
  <div id="toolsContainer" class="tools-container">
    <div style="padding:20px;color:var(--color-text-dim)">加载中...</div>
  </div>
</div>`;
  _loadTools();
}

/**
 * 加载工具数据
 */
function _loadTools() {
  const el = document.getElementById('toolsContainer');
  if (!el) return;
  // 优先从 page_cache 读取
  const cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('tools') : null;
  if (cached && cached.tools) {
    _renderTools(el, cached.tools, cached.categories || {});
    var badge = document.getElementById('toolHeaderBadge');
    if (badge) badge.textContent = (cached.total || cached.tools.length) + ' 个';
    return;
  }
  fetch('/api/tools').then(r => r.json()).then(data => {
    if (!data || !data.tools || data.tools.length === 0) {
      el.innerHTML = '<div style="padding:20px;color:var(--color-error-text)">暂无工具</div>';
      return;
    }
    _renderTools(el, data.tools, data.categories || {});
    var badge = document.getElementById('toolHeaderBadge');
    if (badge) badge.textContent = data.total + ' 个';
  }).catch(err => {
    el.innerHTML = '<div style="padding:20px;color:var(--color-error-text)">加载失败: ' + _escHtml(err.message) + '</div>';
  });
}

/**
 * 渲染工具卡片
 */
function _renderTools(container, tools, categories) {
  // 按分类分组
  const grouped = {};
  for (const t of tools) {
    const cat = t.category || 'utility';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  }

  let html = '';
  // 按分类顺序渲染
  const catOrder = ['core', 'web', 'file', 'data', 'communication', 'utility'];
  for (const cat of catOrder) {
    if (!grouped[cat] || grouped[cat].length === 0) continue;
    const icon = _CAT_ICONS[cat] || '🔧';
    const name = _CAT_NAMES[cat] || cat;
    html += `<div class="tools-section">`;
    html += `<div class="tools-section-title">${icon} ${name} <span class="tools-section-count">${grouped[cat].length}</span></div>`;
    html += `<div class="tools-grid">`;
    for (const t of grouped[cat]) {
      html += _renderToolCard(t);
    }
    html += `</div></div>`;
  }

  // 处理未在 catOrder 中的分类
  for (const cat of Object.keys(grouped)) {
    if (catOrder.includes(cat)) continue;
    html += `<div class="tools-section">`;
    html += `<div class="tools-section-title">🔧 ${cat} <span class="tools-section-count">${grouped[cat].length}</span></div>`;
    html += `<div class="tools-grid">`;
    for (const t of grouped[cat]) {
      html += _renderToolCard(t);
    }
    html += `</div></div>`;
  }

  container.innerHTML = html;
}

/**
 * 渲染单个工具卡片
 */
function _renderToolCard(tool) {
  const name = _escHtml(tool.name);
  const desc = _escHtml(tool.description || '');
  const toolsets = (tool.toolsets || []).join(', ');
  const params = _renderParams(tool.schema);
  return `<div class="tool-card card-hover" data-tool="${name}">
    <div class="tool-card-header">
      <span class="tool-card-name">${name}</span>
      ${toolsets ? `<span class="tool-card-toolset">${_escHtml(toolsets)}</span>` : ''}
    </div>
    <div class="tool-card-desc">${desc}</div>
    ${params ? `<div class="tool-card-params">${params}</div>` : ''}
  </div>`;
}

/**
 * 渲染工具参数列表
 */
function _renderParams(schema) {
  if (!schema || !schema.properties) return '';
  const props = schema.properties;
  const required = schema.required || [];
  const keys = Object.keys(props);
  if (keys.length === 0) return '';

  let html = '';
  for (const key of keys.slice(0, 5)) {
    const p = props[key];
    const isReq = required.includes(key);
    const pDesc = p.description || '';
    const pType = p.type || '';
    html += `<div class="tool-param">
      <span class="tool-param-name ${isReq ? 'tool-param-required' : ''}">${_escHtml(key)}</span>
      <span class="tool-param-type">${_escHtml(pType)}</span>
      ${pDesc ? `<span class="tool-param-desc">${_escHtml(pDesc)}</span>` : ''}
    </div>`;
  }
  if (keys.length > 5) {
    html += `<div class="tool-param tool-param-more">+${keys.length - 5} 个参数</div>`;
  }
  return html;
}

function _escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
