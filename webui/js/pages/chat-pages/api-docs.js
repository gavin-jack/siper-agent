// chat-pages/api-docs.js — API 文档页面（Swagger UI）
// CSS 由 app.js navigateToPage 加载 api-docs.css
import { t } from '../../utils/i18n.js';

// bfcache 恢复时重新本地化
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    _localizeAll();
  }
});

// 中文本地化映射（不依赖 i18n.js 缓存的新 key）
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
};

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
  link.href = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css';
  document.head.appendChild(link);

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js';
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
      deepLinking: true,
      presets: [window.SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  } catch(e) {
    el.innerHTML = '<div class="empty-state">⚠️ ' + t('apiDocs.renderFailed') + e.message + '</div>';
    return;
  }
  // 等 Swagger UI 异步渲染完成后本地化
  _waitForSwaggerDOM(() => {
    _localizeAll();
    // 监听操作点击事件（bubble 阶段，在 Swagger UI 更新 DOM 后触发）
    el.addEventListener('click', () => {
      setTimeout(_localizeAll, 300);
    });
    // 监听 hash 变化（Swagger UI deepLinking 展开/折叠操作时改 hash）
    window.addEventListener('hashchange', _onHashChange);
    window.addEventListener('popstate', _onHashChange);
    // 额外安全：每 3 秒检查一次新 DOM
    setInterval(_localizeAll, 3000);
  });
  // hash/复制事件由 app.js 全局守卫处理，不再重复绑定
}

function _onHashChange() {
  // Swagger UI deepLinking 展开/折叠操作时修改 hash
  // 等待 Swagger UI 更新完 DOM 后再本地化
  setTimeout(_localizeAll, 200);
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

  // 1. CSS 选择器匹配
  const selMap = [
    ['.servers-title', 'servers'],
    ['.servers select option', 'devServer', true],
    ['td.col_header.response-col_status', 'code'],
    ['td.col_header.response-col_description', 'description'],
    ['td.col_header.response-col_links', 'links'],
    ['button.try-out__btn', 'tryItOut'],
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

  // 2. h4 精确匹配
  el.querySelectorAll('h4').forEach(h4 => {
    if (h4.dataset.jsLocalized) return;
    const txt = h4.textContent.trim();
    if (txt === 'Responses') {
      h4.textContent = L10N.responses;
      h4.dataset.jsLocalized = '1';
    } else if (txt === 'Parameters') {
      h4.textContent = L10N.parameters;
      h4.dataset.jsLocalized = '1';
    }
  });

  // 3. 文本节点扫描
  const textMap = {
    'Success': 'success',
    'Internal Server Error': 'internalError',
    'No links': 'noLinks',
    'No parameters': 'noParameters',
  };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.dataset.jsLocalized) continue;
    const txt = node.textContent.trim();
    for (const [en, key] of Object.entries(textMap)) {
      if (txt === en) {
        node.textContent = L10N[key];
        node.dataset.jsLocalized = '1';
        break;
      }
    }
  }
}
