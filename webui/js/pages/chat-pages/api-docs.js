// chat-pages/api-docs.js — API 文档页面（Swagger UI）
// CSS 由 app.js navigateToPage 加载 api-docs.css
import { t } from '../../utils/i18n.js?v=1782146353242';

// DOM 翻译映射：CSS 选择器 → i18n key
const _selMap = [
  ['.servers-title', 'apiDocs.servers'],
  ['.servers select option', 'apiDocs.devServer', true],  // suffix 模式
  ['td.col_header.response-col_status', 'apiDocs.code'],
  ['td.col_header.response-col_description', 'apiDocs.description'],
  ['td.col_header.response-col_links', 'apiDocs.links'],
  ['button.try-out__btn', 'apiDocs.tryItOut'],
  ['button.cancel', 'apiDocs.cancel'],
  ['button.execute', 'apiDocs.execute'],
];

// 文本节点映射：英文原文 → i18n key
const _textMap = {
  'Success': 'apiDocs.success',
  'Internal Server Error': 'apiDocs.internalError',
  'No links': 'apiDocs.noLinks',
  'No parameters': 'apiDocs.noParameters',
  'Responses': 'apiDocs.responses',
  'Parameters': 'apiDocs.parameters',
};

// 已翻译节点标记（增量翻译时跳过）
const _localized = new WeakSet();
let _observer = null;
let _rafId = null;

// bfcache 恢复：重新翻译已缓存的 DOM
window.addEventListener('pageshow', (e) => {
  if (e.persisted && document.getElementById('swagger-ui')) {
    _clearFlags();
    _localizeAll();
  }
});

export function renderApiDocsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML =
    '<div class="page-header">' +
      '<h3>📖 ' + t('apiDocs.title') + ' <span class="tool-header-badge">OpenAPI 3.0</span></h3>' +
      '<div class="actions">' +
        '<a class="siper-btn" href="/api/openapi.json" target="_blank" download>⬇️ ' + t('apiDocs.download') + '</a>' +
      '</div>' +
    '</div>' +
    '<div class="page-body">' +
      '<div id="swagger-ui" style="width:100%"></div>' +
    '</div>';
  _loadSwaggerUI();
}

function _loadSwaggerUI() {
  if (window.SwaggerUIBundle) {
    _renderSwagger();
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/static/swagger/swagger-ui.css?v=' + Date.now();
  document.head.appendChild(link);

  const script = document.createElement('script');
  script.src = '/static/swagger/swagger-ui-bundle.js?v=' + Date.now();
  script.onload = () => { _renderSwagger(); };
  script.onerror = () => {
    document.getElementById('swagger-ui').innerHTML =
      '<div class="empty-state">⚠️ ' + t('apiDocs.loadFailed') + '<br><br>' +
      '<a href="/api/openapi.json" target="_blank">' + t('apiDocs.viewJson') + '</a></div>';
  };
  document.head.appendChild(script);
}

function _renderSwagger() {
  const el = document.getElementById('swagger-ui');
  if (!el || !window.SwaggerUIBundle) return;
  try {
    window.SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: false,
      presets: [window.SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  } catch(e) {
    el.innerHTML = '<div class="empty-state">⚠️ ' + t('apiDocs.renderFailed') + e.message + '</div>';
    return;
  }
  // 启动 MutationObserver 持续翻译增量 DOM
  _startObserver();
}

function _startObserver() {
  const el = document.getElementById('swagger-ui');
  if (!el) return;
  // 先做一次全量翻译（此时标题栏等已渲染）
  _localizeAll();
  // 监听子树变化，增量翻译新增节点
  if (_observer) _observer.disconnect();
  _observer = new MutationObserver(() => {
    // 用 RAF 防抖：同一帧内多次 mutation 只翻译一次
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      _localizeAll();
    });
  });
  _observer.observe(el, { childList: true, subtree: true });
  // 全局 click 监听：操作展开/折叠后翻译新增 DOM
  document.addEventListener('click', _onClick);
}

function _onClick() {
  // click 后翻译（等 Swagger UI 完成 DOM 更新）
  // 用 RAF 确保在 UI 更新后执行
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      _clearFlags();
      _localizeAll();
    });
  });
}

function _clearFlags() {
  const el = document.getElementById('swagger-ui');
  if (!el) return;
  el.querySelectorAll('[data-js-localized]').forEach(n => {
    n.removeAttribute('data-js-localized');
  });
  _localized.clear();
}

// ── 核心翻译函数 ──────────────────────────────────────

function _localizeAll() {
  const el = document.getElementById('swagger-ui');
  if (!el) return;

  // 1. CSS 选择器匹配的元素
  for (const [sel, key, suffixMode] of _selMap) {
    el.querySelectorAll(sel).forEach(node => {
      if (_localized.has(node)) return;
      if (suffixMode) {
        const curr = node.textContent.trim();
        const enSuffix = ' - Development server';
        if (curr.endsWith(enSuffix)) {
          node.textContent = curr.slice(0, -enSuffix.length) + ' - ' + t(key);
          _localized.add(node);
        }
      } else {
        node.textContent = t(key);
        _localized.add(node);
      }
    });
  }

  // 2. h4 标签
  el.querySelectorAll('h4').forEach(h4 => {
    if (_localized.has(h4)) return;
    const txt = h4.textContent.trim();
    if (txt === 'Responses') { h4.textContent = t('apiDocs.responses'); _localized.add(h4); }
    else if (txt === 'Parameters') { h4.textContent = t('apiDocs.parameters'); _localized.add(h4); }
  });

  // 3. 文本节点
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const txt = node.textContent.trim();
    if (txt in _textMap && !_localized.has(node)) {
      node.textContent = t(_textMap[txt]);
      _localized.add(node);
    }
  }
}
