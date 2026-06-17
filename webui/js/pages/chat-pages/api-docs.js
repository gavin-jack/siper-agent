// chat-pages/api-docs.js — API 文档页面（Swagger UI）
// CSS 由 app.js navigateToPage 加载 api-docs.css
import { t } from '../../utils/i18n.js';

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
  // 替换 Swagger UI 固定英文为 i18n 文本（Swagger UI 异步渲染，需等待 DOM 就绪）
  _waitForSwaggerDOM(() => _localizeSwaggerUI());
  // hash/复制事件由 app.js 全局守卫处理，不再重复绑定
}

function _waitForSwaggerDOM(callback) {
  const el = document.getElementById('swagger-ui');
  if (el && el.querySelector('.servers-title')) {
    callback();
    return;
  }
  // Swagger UI 异步渲染，每 200ms 检查一次，最多 3s
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

function _localizeSwaggerUI() {
  const el = document.getElementById('swagger-ui');
  if (!el) return;
  // "Servers" → 翻译
  const serversTitle = el.querySelector('.servers-title');
  if (serversTitle) serversTitle.textContent = t('apiDocs.servers');
  // "Development server" → 翻译（option 文本）
  const serverOption = el.querySelector('.servers select option');
  if (serverOption) {
    serverOption.textContent = serverOption.textContent.replace(/ - Development server$/, ' - ' + t('apiDocs.devServer'));
  }
}
