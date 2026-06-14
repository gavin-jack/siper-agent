// chat-pages/tasks.js — 任务页面渲染
// 从 pages/chat.js 拆分

export function renderTasksPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div class="page-header"><h2>📋 任务管理</h2></div><div class="page-body"><div class="empty-state">任务管理功能开发中...</div></div></div>';
}
