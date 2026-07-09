// chat-pages/tasks.js — 任务页面渲染
import { t } from '../../utils/i18n.js?v=1783612457431';

export function renderTasksPageChat(container) {
  container.className = 'siper-content siper-full-content page-tasks';
  container.innerHTML =
    '<div class="page-header"><h3>📋 ' + t('tasks.title') + '</h3></div>' +
    '<div class="page-body"><div class="empty-state">' + t('tasks.comingSoon') + '</div></div>';
}