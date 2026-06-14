// chat-pages/plugins.js — 插件页面渲染
// 从 pages/chat.js 拆分

export function renderPluginsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div class="page-header"><h2>🔌 插件管理</h2></div><div class="page-body"><div class="empty-state">插件管理功能开发中...</div></div></div>';
}
