// chat-pages/monitor.js — 统计页面（性能 + 词元 + 日志）
import { escapeHtml } from '../../utils/escape.js?v=1783575508437';
import { fmtNum } from '../../utils/format.js?v=1783575508437';
import { apiGetCached } from '../../utils/api.js?v=1783575508437';

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('monitor', function(data) {
    if (data.perf && typeof _applyPerfData === 'function') _applyPerfData(data.perf);
    if (data.token && typeof _applyTokenData === 'function' && data.token.total_requests > 0) _applyTokenData(data.token);
    if (data.logs && typeof _applyLogsData === 'function') _applyLogsData(data.logs);
  });
}

// ── 模板函数 ──────────────────────────────────────────

function _tplMonitorShell() {
  return '<div class="siper-page-toolbar js-toolbar-flex-wrap">' +
    '<div class="siper-settings-tabs" id="monitorTabs">' +
    '<button class="siper-settings-tab active" data-tab="performance" onclick="window.switchMonitorTab(\'performance\')">性能</button>' +
    '<button class="siper-settings-tab" data-tab="token" onclick="window.switchMonitorTab(\'token\')">词元</button>' +
    '<button class="siper-settings-tab" data-tab="logs" onclick="window.switchMonitorTab(\'logs\')">日志</button>' +
    '</div></div>' +
    '<div id="monitorContent">' +
    '<div id="monitorTabPerformance"></div>' +
    '<div id="monitorTabToken" class="js-hidden"></div>' +
    '<div id="monitorTabLogs" class="js-hidden"></div>' +
    '</div>';
}

function _tplPerfShell() {
  return '<div class="page-header"><h3>系统信息</h3></div>' +
    '<div class="page-body">' +
    '<div class="perf-section"><div class="perf-section-title">🖥️ 系统概览</div>' +
    '<div class="perf-grid perf-grid-2">' +
    _perfCard('perfOS', '💻', '操作系统', 'perfKernel') +
    _perfCard('perfCPU', '🔧', 'CPU', 'perfCPUCores') +
    _perfCard('perfGPU', '🎮', '显卡', 'perfGPUUtil') +
    _perfCard('perfRAM', '🧠', '内存', 'perfRAMUsed') +
    _perfCard('perfDisk', '💾', '磁盘', 'perfDiskDetail') +
    _perfCard('perfSwap', '🔄', '交换分区', 'perfSwapDetail') +
    _perfCard('perfLoad', '📊', '系统负载', 'perfProcessCount') +
    _perfCard('perfPyVer', '🐍', 'Python / SiPer', 'perfSiperVer') +
    '</div></div>' +
    '<div class="perf-section"><div class="perf-section-title">📊 资源使用</div>' +
    '<div class="perf-grid">' +
    _perfCardBig('perfMemory', '📈', '进程内存 RSS', 'perfMemoryBar', 'perfMemoryDetail') +
    _perfCard('perfUptime', '⏱️', '运行时长', 'perfStartTime') +
    _perfCard('perfPort', '🔌', '端口', 'perfWsPort') +
    '</div></div>' +
    '<div class="perf-section"><div class="perf-section-title">💾 数据库</div>' +
    '<div class="perf-grid">' +
    _perfCard('perfSessionsDb', '🗄️', 'sessions.db', 'perfSessionsCount') +
    _perfCard('perfTokenDb', '🎫', 'token.db', 'perfTokenCount') +
    _perfCard('perfModelsDb', '📦', 'models.db', 'perfModelsCount') +
    '</div></div>' +
    '<div class="perf-section"><div class="perf-section-title">📈 内存趋势</div>' +
    '<div class="perf-chart-box"><div id="perfMemHistory" style="width:100%;height:200px"></div></div>' +
    '</div>';
}

function _perfCard(id, icon, title, detailId) {
  return '<div class="card perf-card card-hover">' +
    '<div class="card-header"><span class="card-icon">' + icon + '</span><span class="card-title">' + title + '</span></div>' +
    '<div class="perf-card-value perf-card-value-sm" id="' + id + '">--</div>' +
    '<div class="perf-card-detail" id="' + detailId + '"></div></div>';
}

function _perfCardBig(id, icon, title, barId, detailId) {
  return '<div class="card perf-card card-hover" id="perfMemoryCard">' +
    '<div class="card-header"><span class="card-icon">' + icon + '</span><span class="card-title">' + title + '</span></div>' +
    '<div class="perf-card-value" id="' + id + '">--</div>' +
    '<div class="perf-card-bar"><div class="perf-card-bar-fill" id="' + barId + '"></div></div>' +
    '<div class="perf-card-detail" id="' + detailId + '"></div></div>';
}

function _tplTokenShell() {
  return '<div id="monitorTokenStats" class="js-mb-12"></div>' +
    '<div class="siper-token-charts-row">' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">📈 每日 Token 趋势</div><div id="monitorChartDate" class="js-chart-box"></div></div>' +
    '</div>' +
    '<div class="siper-token-charts-row">' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">⚡ 模型效率对比</div><div id="monitorChartEfficiency" class="js-chart-box"></div></div>' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">📅 活跃时段热力图</div><div id="monitorChartHeatmap" class="js-chart-box"></div></div>' +
    '</div>' +
    '<div class="siper-token-charts-row">' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">📊 分模型 Token 分布</div><div id="monitorChartModel" class="js-chart-box"></div></div>' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">⏰ 24小时 Token 分布</div><div id="monitorChartHourly" class="js-chart-box"></div></div>' +
    '</div>';
}

function _tplLogsShell() {
  return '<div class="page-header"><h3>📋 系统日志</h3></div>' +
    '<div class="siper-page-toolbar js-toolbar-logs">' +
    '<input type="text" id="chatLogSearchInput" placeholder="搜索..." class="siper-input" style="width:140px;" oninput="window.applyLogLogsDebounced()" aria-label="日志搜索">' +
    '<select id="chatLogLogLevel" class="siper-input js-w-auto" onchange="window.applyChatLogLevelFilter()" aria-label="日志级别">' +
    '<option value="">全部级别</option><option value="DEBUG">DEBUG</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select>' +
    '<select id="logSourceFilter" class="siper-input js-w-auto" onchange="window.applyLogFilters()" aria-label="日志来源"><option value="">全部来源</option></select>' +
    '<span id="chatLogStats" class="text-dim js-text-xs"></span>' +
    '</div>' +
    '<div id="logLevelFilters" class="js-mb-6"></div>' +
    '<div id="chatLogsList" class="js-code-block"></div>' +
    '<div id="chatLogPagination"></div>';
}

// ── Tab 切换 ──────────────────────────────────────────

export function switchMonitorTab(tab) {
  var tabs = document.querySelectorAll('#monitorTabs .siper-settings-tab');
  tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  ['token', 'logs', 'performance'].forEach(function(t) {
    var el = document.getElementById('monitorTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.classList.toggle('js-hidden', t !== tab);
  });
  if (location.hash !== '#/monitor?tab=' + tab) {
    history.replaceState(null, '', '#/monitor?tab=' + tab);
  }
  if (tab === 'logs') {
    var logsContainer = document.getElementById('monitorTabLogs');
    if (logsContainer && !logsContainer.querySelector('#chatLogsList')) {
      logsContainer.innerHTML = _tplLogsShell();
    }
    if (typeof window.refreshLogs === 'function') window.refreshLogs(true);
  }
  if (tab === 'performance') renderMonitorPerformance();
  if (tab === 'token') {
    if (typeof renderMonitorTokenTab === 'function') renderMonitorTokenTab();
  }
}

// ── Performance Tab ───────────────────────────────────

export function renderMonitorPerformance() {
  var container = document.getElementById('monitorTabPerformance');
  if (!container) return;
  container.innerHTML = _tplPerfShell();
  _loadPerfData();
  _startMemHistory();
}

// ── Monitor Page Shell ─────────────────────────────────

function _tplMonitorPageHeader() {
  return '<div class="page-header"><h3>📊 系统监控</h3></div>';
}

export async function renderMonitorPageChat(container) {
  if (typeof window.echarts === 'undefined') {
    await new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = '/static/js/echarts.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  container.className = 'siper-content siper-full-content page-monitor';
  container.innerHTML = _tplMonitorPageHeader() + _tplMonitorShell();
  renderMonitorPerformance();
}

// ── Token Tab ─────────────────────────────────────────

export function renderMonitorTokenTab() {
  var container = document.getElementById('monitorTabToken');
  if (!container) return;
  container.innerHTML = _tplTokenShell();
  apiGet('/api/token').then(function(data) {
    _applyTokenData(data);
  }).catch(function(e) { console.error('[monitor] renderMonitorTokenTab fetch failed:', e); });
}

// ── 性能数据 ──────────────────────────────────────────

var _perfIdMap = [
  ['perfOS', 'system.os', 'system.os_version', ''],
  ['perfKernel', 'system.kernel', '', ''],
  ['perfCPU', 'system.cpu_model', '', 'perfCPUCores'],
  ['perfCPUCores', '', '', '', '_fmtCpuDetail'],
  ['perfGPU', 'system.gpu_info', '', 'perfGPUUtil'],
  ['perfGPUUtil', 'system.gpu_percent', '', ''],
  ['perfRAM', 'system.total_ram_mb', '', 'perfRAMUsed'],
  ['perfRAMUsed', '', '', '', '_fmtRamDetail'],
  ['perfDisk', 'system.disk_total_gb', 'system.disk_used_gb', 'perfDiskDetail'],
  ['perfDiskDetail', 'system.disk_percent', '', ''],
  ['perfSwap', 'system.swap_total_mb', 'system.swap_used_mb', 'perfSwapDetail'],
  ['perfSwapDetail', '', '', '', '_fmtSwapPct'],
  ['perfLoad', 'system.load_avg', '', ''],
  ['perfProcessCount', 'system.process_count', '', ''],
  ['perfPyVer', 'system.python_version', '', ''],
  ['perfSiperVer', 'system.siper_version', '', ''],
];

function _applyPerfData(data) {
  if (!data) return;
  var sys = data.system || {};
  // 批量设置 textContent
  var fields = {
    perfOS: sys.os + (sys.os_version ? ' ' + sys.os_version : ''),
    perfKernel: sys.kernel || '',
    perfCPU: sys.cpu_model || '',
    perfGPU: sys.gpu_info || '',
    perfGPUUtil: sys.gpu_percent != null ? '利用率 ' + sys.gpu_percent + '%' : '',
    perfRAM: sys.total_ram_mb ? sys.total_ram_mb + ' MB' : '',
    perfDisk: (sys.disk_used_gb != null && sys.disk_total_gb) ? sys.disk_used_gb + ' / ' + sys.disk_total_gb + ' GB' : '',
    perfSwap: (sys.swap_total_mb != null && sys.swap_total_mb > 0) ? (sys.swap_used_mb || 0) + ' / ' + sys.swap_total_mb + ' MB' : '无',
    perfLoad: sys.load_avg ? sys.load_avg[0] + ' / ' + sys.load_avg[1] + ' / ' + sys.load_avg[2] : '',
    perfProcessCount: sys.process_count ? sys.process_count + ' 个进程' : '',
    perfPyVer: sys.python_version || '',
    perfSiperVer: sys.siper_version ? 'SiPer ' + sys.siper_version : '',
  };
  for (var id in fields) {
    var el = document.getElementById(id);
    if (el && fields[id]) el.textContent = fields[id];
  }
  // 复合字段
  var cpuDetail = (sys.cpu_cores ? sys.cpu_cores + ' 核' : '') + (sys.cpu_freq_mhz ? ' / ' + sys.cpu_freq_mhz + ' MHz' : '') + (sys.cpu_percent != null ? ' / ' + sys.cpu_percent + '%' : '');
  var el = document.getElementById('perfCPUCores');
  if (el && cpuDetail) el.textContent = cpuDetail;

  var ramDetail = [];
  if (data.memory_rss_mb) ramDetail.push('进程 ' + data.memory_rss_mb + ' MB');
  if (sys.ram_percent != null) ramDetail.push('系统 ' + sys.ram_percent + '%');
  el = document.getElementById('perfRAMUsed');
  if (el) el.textContent = ramDetail.join(' / ');

  var diskDetail = sys.disk_percent != null ? '使用率 ' + sys.disk_percent + '%' : '';
  if (sys.disk_read_mb != null) diskDetail += ' / 读 ' + sys.disk_read_mb + ' MB';
  if (sys.disk_write_mb != null) diskDetail += ' / 写 ' + sys.disk_write_mb + ' MB';
  el = document.getElementById('perfDiskDetail');
  if (el && diskDetail) el.textContent = diskDetail;

  if (sys.swap_total_mb > 0) {
    var swPct = Math.round((sys.swap_used_mb || 0) / sys.swap_total_mb * 100);
    el = document.getElementById('perfSwapDetail');
    if (el) el.textContent = '使用率 ' + swPct + '%';
  }

  // 进程内存 RSS
  if (data.memory_rss_mb) {
    el = document.getElementById('perfMemory');
    if (el) el.textContent = data.memory_rss_mb + ' MB';
    el = document.getElementById('perfMemoryDetail');
    if (el) el.textContent = '进程物理内存占用';
    var bar = document.getElementById('perfMemoryBar');
    if (bar) {
      var totalMb = sys.total_ram_mb || 8192;
      var pct = Math.min(100, Math.round(data.memory_rss_mb / totalMb * 100));
      bar.style.width = pct + '%';
      bar.style.background = pct > 80 ? 'var(--color-error-text)' : pct > 50 ? 'var(--color-warning)' : 'var(--color-primary)';
    }
  }

  // 运行时长
  if (data.uptime_seconds) {
    var s = data.uptime_seconds;
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    el = document.getElementById('perfUptime');
    if (el) el.textContent = d > 0 ? d + '天' + h + '时' + m + '分' : h > 0 ? h + '时' + m + '分' : m + '分';
    el = document.getElementById('perfStartTime');
    if (el && data.start_time) el.textContent = '启动: ' + data.start_time;
  }

  // 端口
  if (data.port) {
    el = document.getElementById('perfPort');
    if (el) el.textContent = data.port;
    el = document.getElementById('perfWsPort');
    if (el && data.ws_port) el.textContent = 'WS: ' + data.ws_port;
  }

  // 数据库
  if (data.db_sizes) {
    if (data.db_sizes.sessions_db_mb) { el = document.getElementById('perfSessionsDb'); if (el) el.textContent = data.db_sizes.sessions_db_mb + ' MB'; }
    if (data.db_sizes.token_db_kb) { el = document.getElementById('perfTokenDb'); if (el) el.textContent = data.db_sizes.token_db_kb + ' KB'; }
    if (data.db_sizes.models_db_kb) { el = document.getElementById('perfModelsDb'); if (el) el.textContent = data.db_sizes.models_db_kb + ' KB'; }
  }
  if (data.session_count != null) { el = document.getElementById('perfSessionsCount'); if (el) el.textContent = data.session_count + ' 个会话'; }
  if (data.token_usage_count != null) { el = document.getElementById('perfTokenCount'); if (el) el.textContent = data.token_usage_count + ' 条记录'; }
  if (data.model_count != null) { el = document.getElementById('perfModelsCount'); if (el) el.textContent = data.model_count + ' 个模型'; }
}

function _loadPerfData() {
  var cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('monitor') : null;
  // 检查缓存中包含 stats 格式（有 system 字段或 memory_rss_mb），避免与其他 tab 的缓存混淆
  if (cached && (cached.system || cached.memory_rss_mb !== undefined)) {
    _applyPerfData(cached);
    return;
  }
  apiGet('/api/stats').then(function(data) {
    _applyPerfData(data);
  }).catch(function(e) { console.error('[monitor] _loadPerfData failed:', e); });
}

// ── 内存历史 ──────────────────────────────────────────

var _memHistory = [];
var _memHistoryTimer = null;
var _mTokenData = null;
var _memHistoryMax = 600;

function _startMemHistory() {
  if (_memHistoryTimer) clearInterval(_memHistoryTimer);
  _memHistory = [];
  _collectMemPoint();
  _memHistoryTimer = setInterval(_collectMemPoint, 1000);
}

function _collectMemPoint() {
  apiGetCached('/api/stats', 'monitor').then(function(data) {
    if (data && data.memory_rss_mb) {
      _memHistory.push({ t: Date.now(), v: data.memory_rss_mb });
      if (_memHistory.length > _memHistoryMax) _memHistory.shift();
      _renderMemHistory();
    }
  }).catch(function(e) { console.error('[monitor] _collectMemPoint failed:', e); });
}

function _renderMemHistory() {
  if (typeof window.echarts === 'undefined' || _memHistory.length < 2) return;
  var el = document.getElementById('perfMemHistory');
  if (!el || !_memHistoryTimer) return;
  var chart = window.echarts.getInstanceByDom(el);
  if (chart) { chart.dispose(); chart = null; }
  chart = window.echarts.init(el);
  var firstT = _memHistory[0].t;
  var times = _memHistory.map(function(d) {
    var diffSec = Math.round((d.t - firstT) / 1000);
    return diffSec < 60 ? diffSec + 's' : Math.floor(diffSec / 60) + 'm';
  });
  var vals = _memHistory.map(function(d) { return d.v; });
  var isFirst = !_memHistory._rendered;
  _memHistory._rendered = true;
  chart.setOption({
    backgroundColor: 'transparent', animation: isFirst, animationDuration: 800, animationEasing: 'cubicOut',
    grid: { left: 50, right: 16, top: 16, bottom: 30 },
    xAxis: { type: 'category', data: times, axisLabel: { color: '#888', fontSize: 10, interval: Math.max(0, Math.floor(_memHistory.length / 7) - 1) }, axisLine: { lineStyle: { color: 'rgba(0,0,0,0.12)' } } },
    yAxis: { type: 'value', name: 'MB', nameTextStyle: { color: '#888' }, axisLabel: { color: '#888' }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } } },
    series: [{ type: 'line', data: vals, smooth: true, lineStyle: { color: '#1aad6f', width: 2 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(26,173,111,0.25)' }, { offset: 1, color: 'rgba(26,173,111,0.02)' }] } }, symbol: 'circle', symbolSize: 2 }],
    tooltip: { trigger: 'axis', formatter: function(p) { return p[0].name + '<br/>内存: ' + p[0].value + ' MB'; } },
  });
}


// ── Token 数据 ────────────────────────────────────────

function _renderTokenCharts() {
  if (_mTokenData && typeof renderMonitorCharts === 'function') {
    renderMonitorCharts(_mTokenData);
  }
}

function _applyTokenData(data) {
  if (!data) return;
  var stats = document.getElementById('monitorTokenStats');
  if (stats) {
    stats.innerHTML = '<div class="siper-token-charts-row">' +
      '<div class="card siper-token-chart-card card-hover"><div class="card-title">总请求数</div><div class="siper-token-value">' + (data.total_requests || 0) + '</div></div>' +
      '<div class="card siper-token-chart-card card-hover"><div class="card-title">总词元</div><div class="siper-token-value">' + fmtNum(data.total_tokens) + '</div></div>' +
      '<div class="card siper-token-chart-card card-hover"><div class="card-title">提示词元</div><div class="siper-token-value text-success">' + fmtNum(data.total_prompt_tokens) + '</div></div>' +
      '<div class="card siper-token-chart-card card-hover"><div class="card-title">完成词元</div><div class="siper-token-value text-warning">' + fmtNum(data.total_completion_tokens) + '</div></div>' +
      '</div>';
  }
  _mTokenData = data;
  // 延迟渲染确保浏览器完成布局（避免 display:none 导致 0 尺寸）
  var tokenTab = document.getElementById('monitorTabToken');
  if (tokenTab && !tokenTab.classList.contains('js-hidden') && typeof renderMonitorCharts === 'function') {
    setTimeout(function() { renderMonitorCharts(data); }, 100);
  }
}

function _renderNoData(el, msg) {
  if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-dim);font-size:13px">' + msg + '</div>';
}

// ── ECharts 公共样式 ──────────────────────────────────

var _mChartModel = null, _mChartDate = null, _mChartHourly = null, _mChartEfficiency = null, _mChartHeatmap = null;
var _mCachedPalette = null;
var _mDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function _mReadCssVar(name) {
  var d = document.createElement('div');
  d.style.color = 'var(' + name + ')';
  d.style.cssText = 'position:absolute;visibility:hidden';
  document.body.appendChild(d);
  var computed = getComputedStyle(d).color;
  document.body.removeChild(d);
  return (computed && computed !== 'rgb(0, 0, 0)' && computed !== 'rgba(0, 0, 0, 0)') ? computed : '';
}

function _mResolveColors() {
  if (_mCachedPalette) return _mCachedPalette;
  _mCachedPalette = {
    primary: _mReadCssVar('--color-primary') || '#1aad6f',
    text: _mReadCssVar('--color-text') || '#1a1a1a',
    textDim: _mReadCssVar('--color-text-dim') || '#888888',
    border: _mReadCssVar('--color-border') || 'rgba(0,0,0,0.12)',
    surface: _mReadCssVar('--color-surface') || '#ffffff',
    success: _mReadCssVar('--color-success') || '#1aad6f',
    errorText: _mReadCssVar('--color-error-text') || '#dc2626',
    warning: _mReadCssVar('--color-warning') || '#fa0',
  };
  return _mCachedPalette;
}

function _mChartBase(colors) {
  return {
    textStyle: { color: colors.text },
    tooltipStyle: { backgroundColor: colors.surface, textStyle: { color: colors.text } },
    axisLabelStyle: { color: colors.textDim },
    axisLineStyle: { lineStyle: { color: colors.border } },
    splitLineStyle: { lineStyle: { color: colors.border, type: 'dashed', opacity: 0.4 } },
  };
}

export function renderMonitorCharts(data) {
  if (typeof window.echarts === 'undefined') return;
  [_mChartModel, _mChartDate, _mChartHourly, _mChartEfficiency, _mChartHeatmap].forEach(function(c) { if (c) { c.dispose(); } });
  _mChartModel = _mChartDate = _mChartHourly = _mChartEfficiency = _mChartHeatmap = null;

  var colors = _mResolveColors();
  var base = _mChartBase(colors);
  var palette = [colors.primary, '#06b6d4', '#8b5cf6', colors.success, '#f59e0b', '#ec4899', colors.errorText, '#10b981', '#6366f1', '#f97316'];
  var modelStats = data.model_stats || [];

  // Chart 1: Model distribution (donut)
  var modelPieData = modelStats.map(function(m) {
    return { name: m.model.length > 20 ? m.model.slice(0, 18) + '…' : m.model, value: m.total_tokens, fullName: m.model };
  });
  var elModel = document.getElementById('monitorChartModel');
  if (modelPieData.length > 0) {
    if (elModel) {
      _mChartModel = window.echarts.init(elModel);
      _mChartModel.setOption({
        backgroundColor: 'transparent', animation: true, animationDuration: 800, animationEasing: 'cubicOut',
        tooltip: { trigger: 'item', backgroundColor: base.tooltipStyle.backgroundColor, textStyle: base.tooltipStyle.textStyle, formatter: function(p) { var item = modelPieData.find(function(d) { return d.name === p.name; }); return (item ? item.fullName : p.name) + '<br/>Tokens: ' + fmtNum(p.value) + '<br/>占比: ' + p.percent + '%'; } },
        legend: { orient: 'vertical', right: 0, top: 'center', textStyle: base.textStyle, itemGap: 8 },
        series: [{ type: 'pie', radius: ['42%', '72%'], center: ['35%', '50%'], data: modelPieData, label: { color: colors.text, fontSize: 12 }, labelLine: { lineStyle: { color: colors.textDim } }, itemStyle: { borderRadius: 4, borderColor: colors.surface, borderWidth: 2 }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' } }, color: palette }],
      });
    }
  } else {
    _renderNoData(elModel, '暂无模型数据');
  }

  // Chart 2: Daily trend
  var dateStats = data.date_stats || {};
  var dateKeys = Object.keys(dateStats).sort();
  var elDate = document.getElementById('monitorChartDate');
  if (dateKeys.length > 0) {
    if (elDate) {
      _mChartDate = window.echarts.init(elDate);
      _mChartDate.setOption({
        backgroundColor: 'transparent', animation: true, animationDuration: 800, animationEasing: 'cubicOut',
        tooltip: { trigger: 'axis', backgroundColor: base.tooltipStyle.backgroundColor, textStyle: base.tooltipStyle.textStyle, axisPointer: { type: 'shadow' } },
        legend: { data: ['Prompt', 'Completion', 'Total'], textStyle: base.textStyle, top: 4 },
        grid: { left: 50, right: 24, top: 44, bottom: 30 },
        xAxis: { type: 'category', data: dateKeys.map(function(d) { return d.slice(5); }), axisLabel: base.axisLabelStyle, axisLine: base.axisLineStyle },
        yAxis: { type: 'value', axisLabel: Object.assign({}, base.axisLabelStyle, { formatter: function(v) { return fmtNum(v); } }), axisLine: base.axisLineStyle, splitLine: base.splitLineStyle },
        series: [
          { name: 'Prompt', type: 'bar', stack: 'tokens', data: dateKeys.map(function(d) { return dateStats[d].prompt_tokens; }), itemStyle: { color: colors.primary }, barWidth: '40%' },
          { name: 'Completion', type: 'bar', stack: 'tokens', data: dateKeys.map(function(d) { return dateStats[d].completion_tokens; }), itemStyle: { color: colors.success, borderRadius: [4, 4, 0, 0] } },
          { name: 'Total', type: 'line', data: dateKeys.map(function(d) { return dateStats[d].total_tokens; }), itemStyle: { color: colors.warning }, lineStyle: { width: 2.5 }, symbol: 'circle', symbolSize: 6, smooth: true },
        ],
      });
    }
  } else {
    _renderNoData(elDate, '暂无每日数据');
  }

  // Chart 3: Hourly bar
  var hourlyStats = data.hourly_stats || [];
  var elHourly = document.getElementById('monitorChartHourly');
  if (hourlyStats.length > 0 && hourlyStats.some(function(h) { return h.total_tokens > 0; })) {
    var maxVal = Math.max.apply(null, hourlyStats.map(function(x) { return x.total_tokens; }));
    if (elHourly) {
      _mChartHourly = window.echarts.init(elHourly);
      _mChartHourly.setOption({
        backgroundColor: 'transparent', animation: true, animationDuration: 800, animationEasing: 'cubicOut',
        tooltip: { trigger: 'axis', backgroundColor: base.tooltipStyle.backgroundColor, textStyle: base.tooltipStyle.textStyle, formatter: function(params) { var idx = params[0].dataIndex; var d = hourlyStats[idx]; return d.hour + '<br/>Tokens: ' + fmtNum(d.total_tokens) + '<br/>调用: ' + d.requests; } },
        grid: { left: 50, right: 24, top: 24, bottom: 46 },
        xAxis: { type: 'category', data: hourlyStats.map(function(h) { return h.hour; }), axisLabel: Object.assign({}, base.axisLabelStyle, { rotate: 45 }), axisLine: base.axisLineStyle },
        yAxis: { type: 'value', axisLabel: Object.assign({}, base.axisLabelStyle, { formatter: function(v) { return fmtNum(v); } }), axisLine: base.axisLineStyle, splitLine: base.splitLineStyle },
        series: [{ type: 'bar', data: hourlyStats.map(function(h) { var v = h.total_tokens; var barColor; if (v === 0) barColor = colors.border; else if (maxVal > 0) { var ratio = v / maxVal; if (ratio > 0.7) barColor = colors.errorText; else if (ratio > 0.4) barColor = '#f97316'; else if (ratio > 0.15) barColor = colors.warning; else barColor = colors.primary; } else barColor = colors.primary; return { value: v, itemStyle: { color: barColor, borderRadius: [4, 4, 0, 0] } }; }), barWidth: '60%' }],
      });
    }
  } else {
    _renderNoData(elHourly, '暂无时段数据');
  }

  // Chart 4: Heatmap
  var heatmapData = data.heatmap || [];
  var elHeatmap = document.getElementById('monitorChartHeatmap');
  if (heatmapData.length > 0 && heatmapData.some(function(h) { return h.total_tokens > 0; })) {
    var maxHeat = Math.max.apply(null, heatmapData.map(function(h) { return h.total_tokens; }));
    var heatDays = _mDAY_NAMES;
    var heatHours = Array.from({ length: 24 }, function(_, i) { return i + '时'; });
    var heatSeriesData = heatmapData.filter(function(h) { return h.total_tokens > 0; }).map(function(h) { return [h.hour, h.dow, h.total_tokens]; });
    if (elHeatmap) {
      _mChartHeatmap = window.echarts.init(elHeatmap);
      _mChartHeatmap.setOption({
        backgroundColor: 'transparent', animation: true, animationDuration: 800, animationEasing: 'cubicOut',
        tooltip: { backgroundColor: base.tooltipStyle.backgroundColor, textStyle: base.tooltipStyle.textStyle, formatter: function(p) { var d = p.data; return heatDays[d[1]] + ' ' + d[0] + '时<br/>Tokens: ' + fmtNum(d[2]) + '<br/>调用: ' + (heatmapData.find(function(h) { return h.hour === d[0] && h.dow === d[1]; })?.requests || 0); } },
        grid: { left: 50, right: 24, top: 24, bottom: 46 },
        xAxis: { type: 'category', data: heatHours, splitArea: { show: true }, axisLabel: Object.assign({}, base.axisLabelStyle, { interval: 2 }), axisLine: base.axisLineStyle },
        yAxis: { type: 'category', data: heatDays, splitArea: { show: true }, axisLabel: base.axisLabelStyle, axisLine: base.axisLineStyle },
        visualMap: { min: 0, max: maxHeat, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: [colors.border, colors.primary, colors.warning, colors.errorText] }, textStyle: base.axisLabelStyle, text: ['高', '低'], itemWidth: 14, itemHeight: 80 },
        series: [{ type: 'heatmap', data: heatSeriesData, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' } } }],
      });
    }
  } else {
    _renderNoData(elHeatmap, '暂无热力数据');
  }

  // Chart 5: Model efficiency
  var effModels = modelStats.filter(function(m) { return m.total_tokens > 0; });
  var elEfficiency = document.getElementById('monitorChartEfficiency');
  if (effModels.length > 0) {
    if (elEfficiency) {
      _mChartEfficiency = window.echarts.init(elEfficiency);
      _mChartEfficiency.setOption({
        backgroundColor: 'transparent', animation: true, animationDuration: 800, animationEasing: 'cubicOut',
        tooltip: { trigger: 'axis', backgroundColor: base.tooltipStyle.backgroundColor, textStyle: base.tooltipStyle.textStyle, axisPointer: { type: 'shadow' }, formatter: function(params) { var idx = params[0].dataIndex; var m = effModels[idx]; var ratio = m.prompt_tokens > 0 ? ((m.completion_tokens / m.prompt_tokens) * 100).toFixed(1) : '0.0'; return m.model + '<br/>平均 Token: ' + Math.round(m.total_tokens / m.requests) + '<br/>完成/提示比: ' + ratio + '%<br/>调用次数: ' + m.requests; } },
        legend: { data: ['平均 Token', '完成/提示比'], textStyle: base.textStyle, top: 4 },
        grid: { left: 50, right: 24, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: effModels.map(function(m) { return m.model; }), axisLabel: Object.assign({}, base.axisLabelStyle, { rotate: 30 }), axisLine: base.axisLineStyle },
        yAxis: [
          { type: 'value', name: 'Token', axisLabel: base.axisLabelStyle, axisLine: base.axisLineStyle, splitLine: base.splitLineStyle },
          { type: 'value', name: '%', max: 200, axisLabel: Object.assign({}, base.axisLabelStyle, { formatter: '{value}%' }), axisLine: base.axisLineStyle, splitLine: { show: false } },
        ],
        series: [
          { name: '平均 Token', type: 'bar', data: effModels.map(function(m) { return Math.round(m.total_tokens / m.requests); }), itemStyle: { color: colors.primary }, barWidth: '40%' },
          { name: '完成/提示比', type: 'line', yAxisIndex: 1, data: effModels.map(function(m) { return m.prompt_tokens > 0 ? parseFloat(((m.completion_tokens / m.prompt_tokens) * 100).toFixed(1)) : 0; }), itemStyle: { color: colors.warning }, lineStyle: { width: 2.5 }, symbol: 'circle', symbolSize: 6, smooth: true },
        ],
      });
    }
  } else {
    _renderNoData(elEfficiency, '暂无模型效率数据');
  }
  window.removeEventListener('resize', _mResizeCharts);
  window.addEventListener('resize', _mResizeCharts);
}

function _mResizeCharts() {
  if (_mChartModel) _mChartModel.resize();
  if (_mChartDate) _mChartDate.resize();
  if (_mChartHourly) _mChartHourly.resize();
  if (_mChartEfficiency) _mChartEfficiency.resize();
  if (_mChartHeatmap) _mChartHeatmap.resize();
}

// ── Logs Tab ──────────────────────────────────────────

var _logSearchDebounce = null;

export function refreshLogs(force) {
  var container = document.getElementById('chatLogsList');
  if (!container) return;
  if (!force && container.dataset.loaded === '1') return;
  container.innerHTML = '<div class="siper-loading">加载中...</div>';
  var level = document.getElementById('chatLogLogLevel') ? document.getElementById('chatLogLogLevel').value : '';
  var source = document.getElementById('logSourceFilter') ? document.getElementById('logSourceFilter').value : '';
  var search = document.getElementById('chatLogSearchInput') ? document.getElementById('chatLogSearchInput').value : '';
  var url = '/api/logs?limit=100';
  if (level) url += '&level=' + encodeURIComponent(level);
  if (source) url += '&source=' + encodeURIComponent(source);
  if (search) url += '&search=' + encodeURIComponent(search);
  fetch(url).then(function(r) { return r.json(); }).then(function(data) {
    if (!data || !data.logs) { container.innerHTML = '<div class="siper-empty">加载失败</div>'; return; }
    container.dataset.loaded = '1';
    if (data.logs.length === 0) { container.innerHTML = '<div class="siper-empty">暂无日志</div>'; return; }
    container.innerHTML = data.logs.map(function(e) {
      var lvl = (e.level || '').toUpperCase();
      var cls = lvl === 'ERROR' ? 'log-error' : lvl === 'WARN' ? 'log-warn' : lvl === 'DEBUG' ? 'log-debug' : 'log-info';
      return '<div class="log-entry ' + cls + '">'
        + '<span class="log-time">' + escapeHtml(e.time || '') + '</span>'
        + '<span class="log-level">' + escapeHtml(lvl) + '</span>'
        + '<span class="log-source">[' + escapeHtml(e.logger || '') + ']</span>'
        + '<span class="log-msg">' + escapeHtml(e.message || '') + '</span>'
        + '</div>';
    }).join('');
    var stats = document.getElementById('chatLogStats');
    if (stats) stats.textContent = '共 ' + data.total + ' 条';
    var srcFilter = document.getElementById('logSourceFilter');
    if (srcFilter && data.sources) {
      var cur = srcFilter.value;
      srcFilter.innerHTML = '<option value="">全部来源</option>'
        + data.sources.map(function(s) { return '<option value="' + escapeHtml(s) + '"' + (s === cur ? ' selected' : '') + '>' + escapeHtml(s) + '</option>'; }).join('');
    }
  }).catch(function() { container.innerHTML = '<div class="siper-empty">加载失败</div>'; });
}

window.refreshLogs = refreshLogs;

export function applyLogLogsDebounced() {
  if (_logSearchDebounce) clearTimeout(_logSearchDebounce);
  _logSearchDebounce = setTimeout(function() { refreshLogs(true); }, 300);
}

export function applyChatLogLevelFilter() { refreshLogs(true); }
export function applyLogFilters() { refreshLogs(true); }

window.applyLogLogsDebounced = applyLogLogsDebounced;
window.applyChatLogLevelFilter = applyChatLogLevelFilter;
window.applyLogFilters = applyLogFilters;