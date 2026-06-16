// chat-pages/api-docs.js — API 文档页面（Swagger UI）
export function renderApiDocsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div class="page-header"><h3>📖 API 文档 <span class="tool-header-badge">OpenAPI 3.0</span></h3><div class="actions"><a class="siper-btn" href="/api/openapi.json" target="_blank" download>⬇️ 下载 JSON</a></div></div><div class="page-body"><div id="swagger-ui" style="width:100%"></div></div>';
  _loadSwaggerUI();
}

function _loadSwaggerUI() {
  // 动态加载 Swagger UI CDN
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
  script.onload = _renderSwagger;
  script.onerror = () => {
    document.getElementById('swagger-ui').innerHTML = '<div class="empty-state">⚠️ Swagger UI 加载失败，请检查网络连接<br><br><a href="/api/openapi.json" target="_blank">直接查看 OpenAPI JSON</a></div>';
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
    el.innerHTML = '<div class="empty-state">⚠️ Swagger UI 渲染失败: ' + e.message + '</div>';
  }
}
