// pages/logs.js — 日志管理
// 从 pages/page-logs.js 迁移

import { t, currentLang } from '../utils/i18n.js';
import { escapeHtml } from '../utils/escape.js';
import { toast } from '../components/toast.js';

// 模块级状态
const logState = {
  levels: [],
  source: '',
  search: '',
  limit: 100,
  offset: 0,
  total: 0,
  autoRefresh: false,
  autoRefreshTimer: null,
  availableLevels: [],
  availableSources: [],
};
let logSearchDebounce = null;

export async function refreshLogs() {
  try {
    const params = new URLSearchParams();
    if (logState.levels.length) params.set('levels', logState.levels.join(','));
    if (logState.source) params.set('source', logState.source);
    if (logState.search) params.set('search', logState.search);
    params.set('limit', logState.limit);
    params.set('offset', logState.offset);
    params.set('lang', currentLang);

    const r = await fetch('/api/logs?' + params.toString());
    const d = await r.json();

    if (d.levels && d.levels !== undefined) {
      logState.availableLevels = d.levels || [];
      logState.availableSources = d.sources || [];
      renderLogLevelFilters();
      renderLogSourceOptions();
    }

    logState.total = d.total || 0;

    const list = document.getElementById('chatLogsList');
    if (!d.logs || d.logs.length === 0) {
      list.innerHTML = '<div class="js-empty-state-lg">' + t('logs.empty') + '</div>';
    } else {
      list.innerHTML = d.logs.map(l => {
        const level = (l.level || 'info').toUpperCase();
        const loggerName = l.logger || '';
        const escapedMsg = escapeHtml(l.message || '');
        const timeStr = l.time || '';
        const levelColor = ({
          DEBUG: 'var(--color-primary)', INFO: 'var(--color-primary)',
          WARNING: 'var(--color-warning)', WARN: 'var(--color-warning)',
          ERROR: 'var(--color-danger)', CRITICAL: 'var(--color-danger)',
          HEARTBEAT: 'var(--color-success)',
        })[level] || 'var(--color-text-dim)';
        const sourceBadge = loggerName
          ? `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;background:color-mix(in srgb, ${levelColor} 12%, transparent);color:${levelColor};margin-right:6px;vertical-align:middle;letter-spacing:0.3px">${escapeHtml(loggerName)}</span>`
          : '';
        return `<div class="log-entry" style="background:var(--color-surface);border-left:4px solid ${levelColor};border-radius:var(--border-radius);padding:8px 12px;margin-bottom:6px;box-shadow:0 1px 2px var(--shadow-sm);transition:background 0.15s" onmouseover="this.style.background='var(--color-hover)'" onmouseout="this.style.background='var(--color-surface)'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span class="js-log-time">${timeStr}</span>${sourceBadge}<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${levelColor}">${level}</span></div><div class="js-log-msg">${escapedMsg}</div></div>`;
      }).join('');
    }

    toast.info(t('logs.refreshed'), 1500);

    const start = logState.offset + 1;
    const end = Math.min(logState.offset + (d.logs || []).length, logState.total);
    document.getElementById('chatLogStats').textContent = logState.total > 0
      ? `显示 ${start}-${end} / 共 ${logState.total} 条`
      : '共 0 条';

    renderLogPagination();
  } catch(e) {
    document.getElementById('chatLogsList').innerHTML = '<div class="js-text-error">' + t('logs.loadFailed') + ': ' + e.message + '</div>';
  }
}

export function renderLogLevelFilters() {
  const container = document.getElementById('logLevelFilters');
  const levelColors = {
    'DEBUG': 'var(--cyan)', 'INFO': 'var(--accent)',
    'WARNING': 'var(--yellow)', 'WARN': 'var(--yellow)',
    'ERROR': 'var(--red)', 'CRITICAL': 'var(--red)',
    'HEARTBEAT': 'var(--green)',
  };
  container.innerHTML = logState.availableLevels.map(lvl => {
    const isActive = logState.levels.includes(lvl);
    const color = levelColors[lvl] || 'var(--text-dim)';
    const bg = isActive ? color : 'transparent';
    const textColor = isActive ? 'var(--color-surface)' : color;
    const border = `1px solid ${color}`;
    return `<span class="log-level-chip" data-level="${lvl}" onclick="toggleLogLevel('${lvl}')" style="cursor:pointer;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;border:${border};background:${bg};color:${textColor};margin-right:4px;user-select:none;transition:all 0.15s">${lvl}</span>`;
  }).join('');
}

export function toggleLogLevel(lvl) {
  const idx = logState.levels.indexOf(lvl);
  if (idx >= 0) {
    logState.levels.splice(idx, 1);
  } else {
    logState.levels.push(lvl);
  }
  logState.offset = 0;
  renderLogLevelFilters();
  refreshLogs();
}

export function renderLogSourceOptions() {
  const sel = document.getElementById('logSourceFilter');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="" data-i18n="logs.all">全部</option>' +
    logState.availableSources.map(s => `<option value="${escapeHtml(s)}" ${s === currentVal ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

export function applyLogFilters() {
  logState.source = document.getElementById('logSourceFilter').value;
  logState.limit = parseInt(document.getElementById('logPageSize').value) || 100;
  logState.offset = 0;
  refreshLogs();
}

export function applyLogLogsDebounced() {
  clearTimeout(logSearchDebounce);
  logSearchDebounce = setTimeout(() => {
    logState.search = document.getElementById('chatLogSearchInput').value;
    logState.offset = 0;
    refreshLogs();
  }, 300);
}

// Chat page: single-select level filter (updates logState.levels then refreshes)
export function applyChatLogLevelFilter() {
  const sel = document.getElementById('chatLogLogLevel');
  if (!sel) return;
  const val = sel.value;
  logState.levels = val ? [val.toUpperCase()] : [];
  logState.offset = 0;
  refreshLogs();
}

export function renderLogPagination() {
  const container = document.getElementById('chatLogPagination') || document.getElementById('logPagination');
  const totalPages = Math.ceil(logState.total / logState.limit);
  const currentPage = Math.floor(logState.offset / logState.limit) + 1;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button class="btn-sm" ${currentPage <= 1 ? 'disabled' : ''} data-action="log-page" data-page="${currentPage - 1}">‹ 上一页</button>`;

  let startPage = Math.max(1, currentPage - 3);
  let endPage = Math.min(totalPages, startPage + 6);
  if (endPage - startPage < 6) startPage = Math.max(1, endPage - 6);

  for (let i = startPage; i <= endPage; i++) {
    const isActive = i === currentPage;
    html += `<button class="btn-sm ${isActive ? 'primary' : ''}" data-action="log-page" data-page="${i}" class="js-badge-sm">${i}</button>`;
  }

  html += `<button class="btn-sm" ${currentPage >= totalPages ? 'disabled' : ''} data-action="log-page" data-page="${currentPage + 1}">下一页 ›</button>`;
  html += `<span class="js-page-info" style="color:var(--text-dim)">第 ${currentPage}/${totalPages} 页</span>`;
  container.innerHTML = html;
}

export function gotoLogPage(page) {
  const totalPages = Math.ceil(logState.total / logState.limit);
  page = Math.max(1, Math.min(page, totalPages));
  logState.offset = (page - 1) * logState.limit;
  refreshLogs();
}

export function toggleAutoRefresh() {
  logState.autoRefresh = !logState.autoRefresh;
  const btn = document.getElementById('btnAutoRefresh');
  btn.textContent = t('logs.auto' + (logState.autoRefresh ? 'On' : 'Off'));
  btn.className = 'btn-sm' + (logState.autoRefresh ? ' primary' : '');
  if (logState.autoRefresh) {
    logState.autoRefreshTimer = setInterval(refreshLogs, 3000);
  } else {
    clearInterval(logState.autoRefreshTimer);
    logState.autoRefreshTimer = null;
  }
}

export function clearLogs() {
  document.getElementById('chatLogsList').innerHTML = '<div class="js-empty-state-lg">' + t('logs.cleared') + '</div>';
  document.getElementById('chatLogStats').textContent = '';
  const lp = document.getElementById('chatLogPagination') || document.getElementById('logPagination');
  if (lp) lp.innerHTML = '';
}

// DOMContentLoaded 由 app.js 统一触发
