// chat-pages/logs.js — 日志页面渲染
import { t } from '../../utils/i18n.js?v=1783611558619';

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('logs', function(data) {
    if (data.logs && typeof _applyLogsData === 'function') _applyLogsData(data.logs);
  });
}

// ── 模板函数 ──────────────────────────────────────────

function _tplLogsPage() {
  return '<div class="siper-page-toolbar js-toolbar-logs">' +
    '<button class="siper-btn" onclick="window.refreshLogs()">' + t('logs.refresh') + '</button>' +
    '<button class="siper-btn danger" onclick="window.clearLogs()">' + t('logs.clear') + '</button>' +
    '<input type="text" id="chatLogSearchInput" placeholder="' + t('logs.search') + '" class="siper-input" style="width:140px;" oninput="window.applyLogLogsDebounced()" aria-label="日志搜索">' +
    '<select id="chatLogLogLevel" class="siper-input js-w-auto" onchange="window.applyChatLogLevelFilter()" aria-label="日志级别">' +
    '<option value="">' + t('logs.allLevels') + '</option><option value="DEBUG">DEBUG</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select>' +
    '<select id="logSourceFilter" class="siper-input js-w-auto" onchange="window.applyLogFilters()" aria-label="日志来源"><option value="">' + t('logs.allSources') + '</option></select>' +
    '<span id="chatLogStats" class="text-dim js-text-xs"></span>' +
    '</div>' +
    '<div id="logLevelFilters" class="log-level-chips js-mb-6"></div>' +
    '<div id="chatLogsList" class="js-code-block"></div>' +
    '<div id="chatLogPagination"></div>';
}

// ── 页面渲染入口 ──────────────────────────────────────

export function renderLogsPageChat(container) {
  container.className = 'siper-content siper-full-content page-logs';
  container.innerHTML = '<div class="page-header"><h3>📋 ' + t('logs.title') + '</h3></div><div class="page-body">' + _tplLogsPage() + '</div>';
  if (typeof window.refreshLogs === 'function') window.refreshLogs();
}

// ── 清空日志 ──────────────────────────────────────────

function clearLogs() {
  var list = document.getElementById('chatLogsList');
  if (list) { list.innerHTML = ''; list.dataset.loaded = '0'; }
  var stats = document.getElementById('chatLogStats');
  if (stats) stats.textContent = '';
  var ids = ['chatLogSearchInput', 'chatLogLogLevel', 'logSourceFilter'];
  ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
}
window.clearLogs = clearLogs;