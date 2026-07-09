// chat-pages/plugins.js — 插件页面渲染
import { t } from '../../utils/i18n.js?v=1783607957441';

export function renderPluginsPageChat(container) {
  container.className = 'siper-content siper-full-content page-plugins';
  container.innerHTML =
    '<div class="page-header"><h3>🔌 ' + t('plugins.title') + '</h3></div>' +
    '<div class="page-body"><div class="empty-state">' + t('plugins.comingSoon') + '</div></div>';
}