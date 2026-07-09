// chat-pages/api-docs.js — API 文档页面（Swagger UI）
// CSS 由 app.js navigateToPage 加载 api-docs.css
import { t } from '../../utils/i18n.js?v=1783612457431';

// ── 翻译映射 ──────────────────────────────────────────

// CSS 选择器 → i18n key（suffix 模式：只替换英文后缀）
const _selMap = [
  ['.servers-title', 'apiDocs.servers'],
  ['.servers select option', 'apiDocs.devServer', true],
  ['td.col_header.response-col_status', 'apiDocs.code'],
  ['td.col_header.response-col_description', 'apiDocs.description'],
  ['td.col_header.response-col_links', 'apiDocs.links'],
  ['button.try-out__btn', 'apiDocs.tryItOut'],
  ['button.cancel', 'apiDocs.cancel'],
  ['button.execute', 'apiDocs.execute'],
];

// 英文原文 → i18n key
const _textMap = {
  'Success': 'apiDocs.success',
  'Internal Server Error': 'apiDocs.internalError',
  'No links': 'apiDocs.noLinks',
  'No parameters': 'apiDocs.noParameters',
  'Responses': 'apiDocs.responses',
  'Parameters': 'apiDocs.parameters',
};

const _localized = new WeakSet();
let _observer = null;
let _rafId = null;

// 共享：覆盖 Swagger UI 内联宽度 → 全宽
function _forceFullWidth() {
  var block = document.querySelector('#swagger-ui .block.col-12');
  if (block) { block.style.width = '100% !important'; block.style.maxWidth = '100% !important'; }
  var wrapper = document.querySelector('#swagger-ui .wrapper');
  if (wrapper) { wrapper.style.width = '100%'; wrapper.style.maxWidth = '100%'; }
}

// bfcache 恢复：重新翻译已缓存的 DOM
window.addEventListener('pageshow', function(e) {
  if (e.persisted && document.getElementById('swagger-ui')) {
    _localized.clear();
    _localizeAll();
  }
});

// ── 页面渲染入口 ──────────────────────────────────────

export function renderApiDocsPageChat(container) {
  container.className = 'siper-content siper-full-content page-api-docs';
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

// ── Swagger UI 加载 ────────────────────────────────────

function _loadSwaggerUI() {
  if (window.SwaggerUIBundle) { _renderSwagger(); return; }
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/static/swagger/swagger-ui.css?v=' + Math.floor(Date.now() / 1000);
  document.head.appendChild(link);

  var script = document.createElement('script');
  script.src = '/static/swagger/swagger-ui-bundle.js?v=' + Math.floor(Date.now() / 1000);
  script.onload = function() { _renderSwagger(); };
  script.onerror = function() {
    document.getElementById('swagger-ui').innerHTML =
      '<div class="empty-state">⚠️ ' + t('apiDocs.loadFailed') + '<br><br>' +
      '<a href="/api/openapi.json" target="_blank">' + t('apiDocs.viewJson') + '</a></div>';
  };
  document.head.appendChild(script);
}

function _renderSwagger() {
  var el = document.getElementById('swagger-ui');
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
  _hideSwaggerInfo();
  _startObserver();
}

// ── 隐藏 Swagger UI 冗余区域（两阶段轮询）──────────────

var _infoHideTimer = null;

function _hideSwaggerInfo() {
  if (_infoHideTimer) clearInterval(_infoHideTimer);
  var infoDone = false;
  _infoHideTimer = setInterval(function() {
    if (!infoDone) {
      // 阶段 1：删除 info + scheme 容器
      var el;
      while (el = document.querySelector('#swagger-ui .information-container')) el.remove();
      while (el = document.querySelector('#swagger-ui .scheme-container')) el.remove();
      if (!document.querySelector('#swagger-ui .information-container') &&
          !document.querySelector('#swagger-ui .scheme-container')) {
        infoDone = true;
      }
    } else {
      // 阶段 2：删除 SVG 图标库 + 空 div + 覆盖宽度
      var svg = document.querySelector('#swagger-ui svg.svg-assets');
      if (svg) svg.parentElement.remove();
      // 只清理 Swagger UI 内部的空 div（不碰子树中的空元素）
      var emptyDivs = document.querySelectorAll('#swagger-ui > div');
      for (var i = 0; i < emptyDivs.length; i++) {
        var d = emptyDivs[i];
        if (!d.children.length && !d.textContent.trim() && !d.id && !d.className) d.remove();
      }
      _forceFullWidth();
      if (!document.querySelector('#swagger-ui svg.svg-assets')) {
        clearInterval(_infoHideTimer);
        _infoHideTimer = null;
      }
    }
  }, 100);
  setTimeout(function() {
    if (_infoHideTimer) { clearInterval(_infoHideTimer); _infoHideTimer = null; }
  }, 15000);
}

// ── 增量翻译（MutationObserver + RAF 防抖）─────────────

function _startObserver() {
  var el = document.getElementById('swagger-ui');
  if (!el) return;
  _localizeAll();
  if (_observer) _observer.disconnect();
  _observer = new MutationObserver(function() {
    if (_rafId) return;
    _rafId = requestAnimationFrame(function() {
      _rafId = null;
      _localizeAll();
    });
  });
  _observer.observe(el, { childList: true, subtree: true });
}

// ── 核心翻译函数 ──────────────────────────────────────

function _localizeAll() {
  var el = document.getElementById('swagger-ui');
  if (!el) return;

  // 1. CSS 选择器匹配
  for (var i = 0; i < _selMap.length; i++) {
    var sel = _selMap[i][0], key = _selMap[i][1], suffixMode = _selMap[i][2];
    el.querySelectorAll(sel).forEach(function(node) {
      if (_localized.has(node)) return;
      if (suffixMode) {
        var curr = node.textContent.trim();
        var enSuffix = ' - Development server';
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

  // 2. 文本节点匹配
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    var node = walker.currentNode;
    var txt = node.textContent.trim();
    if (_textMap[txt] && !_localized.has(node)) {
      node.textContent = t(_textMap[txt]);
      _localized.add(node);
    }
  }

  // 3. 覆盖宽度
  _forceFullWidth();
}