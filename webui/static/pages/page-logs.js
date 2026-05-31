// ===== Logs =====
let logState = {
  levels: [],       // selected levels e.g. ["INFO","ERROR"]
  source: "",       // selected logger source
  search: "",       // keyword search
  limit: 100,       // page size
  offset: 0,        // current offset
  total: 0,         // total matching
  autoRefresh: false,
  autoRefreshTimer: null,
  availableLevels: [],
  availableSources: [],
};
let logSearchDebounce = null;

async function refreshLogs() {
  try {
    const params = new URLSearchParams();
    if (logState.levels.length) params.set("levels", logState.levels.join(","));
    if (logState.source) params.set("source", logState.source);
    if (logState.search) params.set("search", logState.search);
    params.set("limit", logState.limit);
    params.set("offset", logState.offset);
    params.set("lang", currentLang);

    const r = await fetch('/api/logs?' + params.toString());
    const d = await r.json();

    // Update available filters on first load
    if (d.levels && d.levels !== undefined) {
      logState.availableLevels = d.levels || [];
      logState.availableSources = d.sources || [];
      renderLogLevelFilters();
      renderLogSourceOptions();
    }

    logState.total = d.total || 0;

    // Render logs
    const list = document.getElementById('logsList');
    if (!d.logs || d.logs.length === 0) {
      list.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:40px">' + t('logs.empty') + '</div>';
    } else {
      list.innerHTML = d.logs.map(l => {
        const levelClass = l.level || 'info';
        const loggerName = l.logger || '';
        const escapedMsg = escapeHtml(l.message || '');
        const sourceTag = loggerName ? `<span style="color:var(--accent2);margin-right:6px;font-size:10px;opacity:0.7">[${escapeHtml(loggerName)}]</span>` : '';
        return `<div class="log-entry ${levelClass}"><span class="time">${l.time || ''}</span>${sourceTag}${escapedMsg}</div>`;
      }).join('');
    }

    toast.info(t('logs.refreshed'), 1500);

    // Stats
    const start = logState.offset + 1;
    const end = Math.min(logState.offset + (d.logs || []).length, logState.total);
    document.getElementById('logStats').textContent = logState.total > 0
      ? `显示 ${start}-${end} / 共 ${logState.total} 条`
      : '共 0 条';

    // Pagination
    renderLogPagination();
  } catch(e) {
    document.getElementById('logsList').innerHTML = '<div style="color:var(--red);padding:12px">' + t('logs.loadFailed') + ': ' + e.message + '</div>';
  }
}

function renderLogLevelFilters() {
  const container = document.getElementById('logLevelFilters');
  const levelColors = {
    'DEBUG': 'var(--cyan)',
    'INFO': "var(--accent)",
    'WARNING': "var(--yellow)",
    'WARN': "var(--yellow)",
    'ERROR': "var(--red)",
    'CRITICAL': "var(--red)",
    'HEARTBEAT': "var(--green)",
  };
  container.innerHTML = logState.availableLevels.map(lvl => {
    const isActive = logState.levels.includes(lvl);
    const color = levelColors[lvl] || "var(--text-dim)";
    const bg = isActive ? color : 'transparent';
    const textColor = isActive ? '#fff' : color;
    const border = `1px solid ${color}`;
    return `<span class="log-level-chip" data-level="${lvl}" onclick="toggleLogLevel('${lvl}')" style="cursor:pointer;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;border:${border};background:${bg};color:${textColor};margin-right:4px;user-select:none;transition:all 0.15s">${lvl}</span>`;
  }).join('');
}

function toggleLogLevel(lvl) {
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

function renderLogSourceOptions() {
  const sel = document.getElementById('logSourceFilter');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="" data-i18n="logs.all">全部</option>' +
    logState.availableSources.map(s => `<option value="${escapeHtml(s)}" ${s === currentVal ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

function applyLogFilters() {
  logState.source = document.getElementById('logSourceFilter').value;
  logState.limit = parseInt(document.getElementById('logPageSize').value) || 100;
  logState.offset = 0;
  refreshLogs();
}

function applyLogLogsDebounced() {
  clearTimeout(logSearchDebounce);
  logSearchDebounce = setTimeout(() => {
    logState.search = document.getElementById('logSearchInput').value;
    logState.offset = 0;
    refreshLogs();
  }, 300);
}

function renderLogPagination() {
  const container = document.getElementById('logPagination');
  const totalPages = Math.ceil(logState.total / logState.limit);
  const currentPage = Math.floor(logState.offset / logState.limit) + 1;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  // Prev
  html += `<button class="btn-sm" onclick="gotoLogPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>‹ 上一页</button>`;

  // Page numbers (show max 7)
  let startPage = Math.max(1, currentPage - 3);
  let endPage = Math.min(totalPages, startPage + 6);
  if (endPage - startPage < 6) startPage = Math.max(1, endPage - 6);

  for (let i = startPage; i <= endPage; i++) {
    const isActive = i === currentPage;
    html += `<button class="btn-sm ${isActive ? 'primary' : ''}" onclick="gotoLogPage(${i})" style="min-width:32px;padding:4px 8px">${i}</button>`;
  }

  // Next
  html += `<button class="btn-sm" onclick="gotoLogPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>下一页 ›</button>`;

  html += `<span style="font-size:11px;color:var(--text-dim);margin-left:8px">第 ${currentPage}/${totalPages} 页</span>`;
  container.innerHTML = html;
}

function gotoLogPage(page) {
  const totalPages = Math.ceil(logState.total / logState.limit);
  page = Math.max(1, Math.min(page, totalPages));
  logState.offset = (page - 1) * logState.limit;
  refreshLogs();
}

function toggleAutoRefresh() {
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

function clearLogs() {
  // Just clears the display - backend keeps logs
  document.getElementById('logsList').innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:40px">' + t('logs.cleared') + '</div>';
  document.getElementById('logStats').textContent = '';
  document.getElementById('logPagination').innerHTML = '';
}


// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshLogs);
