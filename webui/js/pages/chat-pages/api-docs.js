// chat-pages/api-docs.js — API 文档页面（Swagger UI）
// CSS 由 app.js navigateToPage 加载 api-docs.css
import { t } from '../../utils/i18n.js';

// bfcache 恢复：重新本地化已缓存的 DOM
window.addEventListener('pageshow', (e) => {
  if (e.persisted && document.getElementById('swagger-ui')) _localizeAll();
});

// 中文本地化映射（不依赖 i18n.js 缓存）
const L10N = {
  'servers': '服务器',
  'devServer': '开发服务器',
  'responses': '响应',
  'parameters': '参数',
  'code': '状态码',
  'description': '说明',
  'links': '链接',
  'tryItOut': '试用',
  'success': '成功',
  'internalError': '服务器内部错误',
  'noLinks': '无链接',
  'noParameters': '无参数',
  'execute': '执行',
  'cancel': '取消',
};

// 全局 click 监听：操作展开/折叠后重新本地化
let _docClickRegistered = false;
document.addEventListener('click', () => {
  if (!_docClickRegistered) return;
  setTimeout(_localizeAll, 300);
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
  _waitForSwaggerDOM(() => {
    _localizeAll();
    _docClickRegistered = true;
  });
}

function _waitForSwaggerDOM(callback) {
  const el = document.getElementById('swagger-ui');
  if (el && el.querySelector('.servers-title')) {
    callback();
    return;
  }
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const el2 = document.getElementById('swagger-ui');
    if (el2 && el2.querySelector('.servers-title')) {
      clearInterval(timer);
      callback();
    } else if (tries >= 15) {
      clearInterval(timer);
    }
  }, 200);
}

function _localizeAll() {
  const el = document.getElementById('swagger-ui');
  if (!el) return;

  // 1. CSS 选择器匹配的元素
  const selMap = [
    ['.servers-title', 'servers'],
    ['.servers select option', 'devServer', true],
    ['td.col_header.response-col_status', 'code'],
    ['td.col_header.response-col_description', 'description'],
    ['td.col_header.response-col_links', 'links'],
    ['button.try-out__btn', 'tryItOut'],
    ['button.cancel', 'cancel'],
    ['button.execute', 'execute'],
  ];
  for (const [sel, key, suffixMode] of selMap) {
    el.querySelectorAll(sel).forEach(node => {
      if (node.dataset.jsLocalized) return;
      if (suffixMode) {
        const curr = node.textContent.trim();
        const enSuffix = ' - Development server';
        if (curr.endsWith(enSuffix)) {
          node.textContent = curr.slice(0, -enSuffix.length) + ' - ' + L10N.devServer;
          node.dataset.jsLocalized = '1';
        }
      } else {
        node.textContent = L10N[key];
        node.dataset.jsLocalized = '1';
      }
    });
  }

  // 2. h4 标签匹配
  el.querySelectorAll('h4').forEach(h4 => {
    if (h4.dataset.jsLocalized) return;
    const txt = h4.textContent.trim();
    if (txt === 'Responses') { h4.textContent = L10N.responses; h4.dataset.jsLocalized = '1'; }
    else if (txt === 'Parameters') { h4.textContent = L10N.parameters; h4.dataset.jsLocalized = '1'; }
  });

  // 3. 文本节点扫描（注意：文本节点没有 dataset，用 parentElement.dataset）
  const textMap = {
    'Success': 'success',
    'Internal Server Error': 'internalError',
    'No links': 'noLinks',
    'No parameters': 'noParameters',
  };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (parent && parent.dataset.jsLocalized) continue;
    const txt = node.textContent.trim();
    for (const [en, key] of Object.entries(textMap)) {
      if (txt === en) {
        node.textContent = L10N[key];
        if (parent) parent.dataset.jsLocalized = '1';
        break;
      }
    }
    if (txt === 'Responses') {
      node.textContent = L10N.responses;
      if (parent) parent.dataset.jsLocalized = '1';
    }
    if (txt === 'Parameters') {
      node.textContent = L10N.parameters;
      if (parent) parent.dataset.jsLocalized = '1';
    }
  }
}
