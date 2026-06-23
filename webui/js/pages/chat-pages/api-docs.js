// chat-pages/api-docs.js — API 文档页面（Swagger UI）
// CSS 由 app.js navigateToPage 加载 api-docs.css
import { t } from '../../utils/i18n.js?v=1782233785732';

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
    _localized.clear();
    _localizeAll();
  }
});

export function renderApiDocsPageChat(container) {
  container.id = 'page-api-docs';
  container.className = 'siper-content siper-full-content';
  container.innerHTML =
    '<div class="page-header">' +
      '<h3>📖 SiPer AI Agent API <span class="tool-header-badge">OAS 3.0</span></h3>' +
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
  link.href = '/static/swagger/swagger-ui.css?v=' + Math.floor(Date.now() / 1000);
  document.head.appendChild(link);

  const script = document.createElement('script');
  script.src = '/static/swagger/swagger-ui-bundle.js?v=' + Math.floor(Date.now() / 1000);
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
  // 隐藏 Swagger UI 的 info 区域（标题/版本/描述已在 page-header 中显示）
  _hideSwaggerInfo();
  // 启动 MutationObserver 持续翻译增量 DOM
  _startObserver();
}

var _infoHideTimer = null;

function _hideSwaggerInfo() {
  // Swagger UI 异步加载 openapi.json 后才会渲染 info 区域，轮询删除
  if (_infoHideTimer) clearInterval(_infoHideTimer);
  var infoDone = false;
  _infoHideTimer = setInterval(function() {
    if (!infoDone) {
      var el;
      while (el = document.querySelector('#swagger-ui .information-container')) el.remove();
      while (el = document.querySelector('#swagger-ui .scheme-container')) el.remove();
      if (!document.querySelector('#swagger-ui .information-container') &&
          !document.querySelector('#swagger-ui .scheme-container')) {
        infoDone = true;
      }
    } else {
      // info/scheme 清理完后，清理 SVG、空 div，并覆盖宽度为全宽
      var svg = document.querySelector('#swagger-ui svg.svg-assets');
      if (svg) svg.parentElement.remove();
      document.querySelectorAll('#swagger-ui div').forEach(function(d) {
        if (!d.children.length && !d.textContent.trim() && !d.id && !d.className) d.remove();
      });
      // 覆盖 Swagger UI 内联宽度 533px → 全宽
      var block = document.querySelector('#swagger-ui .block.col-12');
      if (block) { block.style.width = '100% !important'; block.style.maxWidth = '100% !important'; }
      var wrapper = document.querySelector('#swagger-ui .wrapper');
      if (wrapper) { wrapper.style.width = '100%'; wrapper.style.maxWidth = '100%'; }
      if (!document.querySelector('#swagger-ui svg.svg-assets')) {
        clearInterval(_infoHideTimer);
        _infoHideTimer = null;
      }
    }
  }, 100);
  // 15 秒后自动停止
  setTimeout(function() {
    if (_infoHideTimer) { clearInterval(_infoHideTimer); _infoHideTimer = null; }
  }, 15000);
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

  // 文本节点（含 h4）
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const txt = node.textContent.trim();
    if (txt in _textMap && !_localized.has(node)) {
      node.textContent = t(_textMap[txt]);
      _localized.add(node);
    }
  }
  // 覆盖 Swagger UI 内联宽度 533px → 全宽
  var block = document.querySelector('#swagger-ui .block.col-12');
  if (block) { block.style.width = '100% !important'; block.style.maxWidth = '100% !important'; }
}
