// chat-pages/monitor.js — 统计页面（性能 + 词元 + 日志）
// 目录已提升为独立页面

// 注册 page_cache 回调：后端推送新数据时自动刷新
import { escapeHtml } from '../../utils/escape.js';

if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('monitor', function(data) {
    if (data.perf && typeof _applyPerfData === 'function') _applyPerfData(data.perf);
    if (data.token && typeof _applyTokenData === 'function' && data.token.total_requests > 0) _applyTokenData(data.token);
    if (data.logs && typeof _applyLogsData === 'function') _applyLogsData(data.logs);
  });
}

export function switchMonitorTab(tab) {
  const tabs = document.querySelectorAll('#monitorTabs .siper-settings-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  ['token','logs','performance'].forEach(t => {
    const el = document.getElementById('monitorTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.classList.toggle('js-hidden', t !== tab);
  });
  // 更新 hash（不触发 hashchange，因为 hashchange 会调用 navigateToPage 再次渲染）
  if (location.hash !== '#/monitor?tab=' + tab) {
    history.replaceState(null, '', '#/monitor?tab=' + tab);
  }
  if (tab === 'logs') {
    const logsContainer = document.getElementById('monitorTabLogs');
    if (logsContainer && !logsContainer.querySelector('#chatLogsList')) {
      logsContainer.innerHTML = `<div class="siper-page-toolbar js-toolbar-logs">
        <input type="text" id="chatLogSearchInput" placeholder="搜索..." class="siper-input" style="width:140px;" oninput="window.applyLogLogsDebounced()" aria-label="日志搜索">
        <select id="chatLogLogLevel" class="siper-input js-w-auto" onchange="window.applyChatLogLevelFilter()" aria-label="日志级别"><option value="">全部级别</option><option value="DEBUG">DEBUG</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select>
        <select id="logSourceFilter" class="siper-input js-w-auto" onchange="window.applyLogFilters()" aria-label="日志来源"><option value="">全部来源</option></select>
        <span id="chatLogStats" class="text-dim js-text-xs"></span>
      </div>
      <div id="logLevelFilters" class="js-mb-6"></div>
      <div id="chatLogsList" class="js-code-block"></div>
      <div id="chatLogPagination"></div>`;
    }
    if (typeof window.refreshLogs === 'function') window.refreshLogs(true);
  }
  if (tab === 'performance') renderMonitorPerformance();
  if (tab === 'token') {
    if (typeof renderMonitorTokenTab === 'function') renderMonitorTokenTab();
    // 延迟渲染图表，等容器可见后 ECharts 才能正确获取尺寸
    setTimeout(() => {
      if (typeof _renderTokenCharts === 'function') _renderTokenCharts();
      if (typeof _mResizeCharts === 'function') _mResizeCharts();
    }, 60);
  }
}

// ===== Performance Tab =====
export function renderMonitorPerformance() {
  const container = document.getElementById('monitorTabPerformance');
  if (!container) return;
  container.innerHTML = `<div class="page-header"><h3>系统信息</h3></div>
<div class="page-body">
  <div class="perf-section">
    <div class="perf-section-title">🖥️ 系统概览</div>
    <div class="perf-grid perf-grid-2">
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">💻</span><span class="perf-card-label">操作系统</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfOS">--</div>
        <div class="perf-card-detail" id="perfKernel"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🔧</span><span class="perf-card-label">CPU</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfCPU">--</div>
        <div class="perf-card-detail" id="perfCPUCores"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🎮</span><span class="perf-card-label">显卡</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfGPU">--</div>
        <div class="perf-card-detail" id="perfGPUUtil"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🧠</span><span class="perf-card-label">内存</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfRAM">--</div>
        <div class="perf-card-detail" id="perfRAMUsed"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">💾</span><span class="perf-card-label">磁盘</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfDisk">--</div>
        <div class="perf-card-detail" id="perfDiskDetail"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🔄</span><span class="perf-card-label">交换分区</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfSwap">--</div>
        <div class="perf-card-detail" id="perfSwapDetail"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">📊</span><span class="perf-card-label">系统负载</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfLoad">--</div>
        <div class="perf-card-detail" id="perfProcessCount"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🐍</span><span class="perf-card-label">Python / SiPer</span></div>
        <div class="perf-card-value perf-card-value-sm" id="perfPyVer">--</div>
        <div class="perf-card-detail" id="perfSiperVer"></div>
      </div>
    </div>
  </div>
  <div class="perf-section">
    <div class="perf-section-title">📊 资源使用</div>
    <div class="perf-grid">
      <div class="siper-card perf-card card-hover" id="perfMemoryCard">
        <div class="perf-card-header"><span class="perf-card-icon">📈</span><span class="perf-card-label">进程内存 RSS</span></div>
        <div class="perf-card-value" id="perfMemory">--</div>
        <div class="perf-card-bar"><div class="perf-card-bar-fill" id="perfMemoryBar"></div></div>
        <div class="perf-card-detail" id="perfMemoryDetail"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">⏱️</span><span class="perf-card-label">运行时长</span></div>
        <div class="perf-card-value" id="perfUptime">--</div>
        <div class="perf-card-detail" id="perfStartTime"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🔌</span><span class="perf-card-label">端口</span></div>
        <div class="perf-card-value" id="perfPort">--</div>
        <div class="perf-card-detail" id="perfWsPort"></div>
      </div>
    </div>
  </div>
  <div class="perf-section">
    <div class="perf-section-title">💾 数据库</div>
    <div class="perf-grid">
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🗄️</span><span class="perf-card-label">sessions.db</span></div>
        <div class="perf-card-value" id="perfSessionsDb">--</div>
        <div class="perf-card-detail" id="perfSessionsCount"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">🎫</span><span class="perf-card-label">token.db</span></div>
        <div class="perf-card-value" id="perfTokenDb">--</div>
        <div class="perf-card-detail" id="perfTokenCount"></div>
      </div>
      <div class="siper-card perf-card card-hover">
        <div class="perf-card-header"><span class="perf-card-icon">📦</span><span class="perf-card-label">models.db</span></div>
        <div class="perf-card-value" id="perfModelsDb">--</div>
        <div class="perf-card-detail" id="perfModelsCount"></div>
      </div>
    </div>
  </div>
  <div class="perf-section">
    <div class="perf-section-title">📈 内存趋势</div>
    <div class="perf-chart-box"><div id="perfMemHistory" style="width:100%;height:200px;"></div></div>
  </div>
</div>`;

  // 加载实时数据
  _loadPerfData();
  // 启动内存历史采集
  _startMemHistory();
}

let _memHistory = [];
let _memHistoryTimer = null;
let _mTokenData = null; // 缓存 token 数据供延迟图表渲染
const _memHistoryMax = 600; // 保留600个数据点

function _renderTokenCharts() {
  if (_mTokenData && typeof renderMonitorCharts === 'function') {
    renderMonitorCharts(_mTokenData);
  }
}

function _startMemHistory() {
  if (_memHistoryTimer) clearInterval(_memHistoryTimer);
  _memHistory = [];
  // 立即采集一次
  _collectMemPoint();
  _memHistoryTimer = setInterval(_collectMemPoint, 1000);
}

function _collectMemPoint() {
  fetch('/api/stats').then(r => r.json()).then(data => {
    if (data.memory_rss_mb) {
      _memHistory.push({ t: Date.now(), v: data.memory_rss_mb });
      if (_memHistory.length > _memHistoryMax) _memHistory.shift();
      _renderMemHistory();
    }
  }).catch(e => { console.error('[monitor] _collectMemPoint failed:', e); });
}

function _renderMemHistory() {
  if (typeof window.echarts === 'undefined' || _memHistory.length < 2) return;
  const el = document.getElementById('perfMemHistory');
  if (!el) return;
  if (!_memHistoryTimer) return; // tab not active
  let chart = window.echarts.getInstanceByDom(el);
  if (chart) { chart.dispose(); chart = null; }
  chart = window.echarts.init(el);
  const firstT = _memHistory[0].t;
  const times = _memHistory.map(d => {
    const diffSec = Math.round((d.t - firstT) / 1000);
    if (diffSec < 60) return diffSec + 's';
    return Math.floor(diffSec / 60) + 'm';
  });
  const vals = _memHistory.map(d => d.v);
  // 只在初始渲染时启用动画
  const isFirstRender = !_memHistory._rendered;
  _memHistory._rendered = true;
  chart.setOption({
    backgroundColor: 'transparent',
    animation: isFirstRender,
    animationDuration: 800,
    animationEasing: 'cubicOut',
    grid: { left: 50, right: 16, top: 16, bottom: 30 },
    xAxis: {
      type: 'category', data: times,
      axisLabel: {
        color: '#888', fontSize: 10,
        interval: Math.max(0, Math.floor(_memHistory.length / 7) - 1),
      },
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.12)' } },
    },
    yAxis: {
      type: 'value', name: 'MB', nameTextStyle: { color: '#888' },
      axisLabel: { color: '#888' },
      splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
    },
    series: [{
      type: 'line', data: vals, smooth: true,
      lineStyle: { color: '#1aad6f', width: 2 },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(26,173,111,0.25)' },
            { offset: 1, color: 'rgba(26,173,111,0.02)' },
          ],
        },
      },
      symbol: 'circle', symbolSize: 2,
    }],
    tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}<br/>内存: ${p[0].value} MB` },
  });
}

function _loadPerfData() {
  // 优先从 page_cache 读取
  const cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('monitor') : null;
  if (cached && cached.perf) {
    _applyPerfData(cached.perf);
    return;
  }
  fetch('/api/stats').then(r => r.json()).then(data => {
    _applyPerfData(data);
  }).catch(e => { console.error('[monitor] _loadPerfData failed:', e); });
}

function _applyPerfData(data) {
  if (!data) return;
  // 系统概览
  if (data.system) {
      const sys = data.system;
      if (sys.os) {
        const osStr = sys.os + (sys.os_version ? ' ' + sys.os_version : '');
        document.getElementById('perfOS').textContent = osStr;
      }
      if (sys.kernel) document.getElementById('perfKernel').textContent = sys.kernel;
      if (sys.cpu_model) document.getElementById('perfCPU').textContent = sys.cpu_model;
      const cpuDetail = (sys.cpu_cores ? sys.cpu_cores + ' 核' : '') + (sys.cpu_freq_mhz ? ' / ' + sys.cpu_freq_mhz + ' MHz' : '') + (sys.cpu_percent != null ? ' / ' + sys.cpu_percent + '%' : '');
      if (cpuDetail) document.getElementById('perfCPUCores').textContent = cpuDetail;
      if (sys.gpu_info) document.getElementById('perfGPU').textContent = sys.gpu_info;
      if (sys.gpu_percent) document.getElementById('perfGPUUtil').textContent = '利用率 ' + sys.gpu_percent + '%';
      if (sys.total_ram_mb) {
        document.getElementById('perfRAM').textContent = sys.total_ram_mb + ' MB';
        const ramUsed = data.memory_rss_mb ? `进程 ${data.memory_rss_mb} MB` : '';
        const ramPct = sys.ram_percent != null ? `系统 ${sys.ram_percent}%` : '';
        document.getElementById('perfRAMUsed').textContent = [ramUsed, ramPct].filter(Boolean).join(' / ');
      }
      if (sys.available_ram_mb != null && sys.total_ram_mb) {
        const availPct = Math.round(sys.available_ram_mb / sys.total_ram_mb * 100);
        // 追加到 RAM detail
      }
      if (sys.disk_total_gb) document.getElementById('perfDisk').textContent = `${sys.disk_used_gb} / ${sys.disk_total_gb} GB`;
      if (sys.disk_percent != null) {
        let diskDetail = `使用率 ${sys.disk_percent}%`;
        if (sys.disk_read_mb != null) diskDetail += ` / 读 ${sys.disk_read_mb} MB`;
        if (sys.disk_write_mb != null) diskDetail += ` / 写 ${sys.disk_write_mb} MB`;
        document.getElementById('perfDiskDetail').textContent = diskDetail;
      }
      if (sys.swap_total_mb != null && sys.swap_total_mb > 0) {
        document.getElementById('perfSwap').textContent = `${sys.swap_used_mb || 0} / ${sys.swap_total_mb} MB`;
        if (sys.swap_total_mb > 0) {
          const swPct = Math.round((sys.swap_used_mb || 0) / sys.swap_total_mb * 100);
          document.getElementById('perfSwapDetail').textContent = `使用率 ${swPct}%`;
        }
      } else {
        document.getElementById('perfSwap').textContent = '无';
      }
      if (sys.load_avg) {
        document.getElementById('perfLoad').textContent = `${sys.load_avg[0]} / ${sys.load_avg[1]} / ${sys.load_avg[2]}`;
      }
      if (sys.process_count) {
        document.getElementById('perfProcessCount').textContent = sys.process_count + ' 个进程';
      }
      if (sys.hostname) {
        // 可显示在 OS detail
      }
      if (sys.python_version) document.getElementById('perfPyVer').textContent = sys.python_version;
      if (sys.siper_version) document.getElementById('perfSiperVer').textContent = 'SiPer ' + sys.siper_version;
    }
    // 进程内存 RSS
    if (data.memory_rss_mb) {
      document.getElementById('perfMemory').textContent = data.memory_rss_mb + ' MB';
      document.getElementById('perfMemoryDetail').textContent = `进程物理内存占用`;
      const bar = document.getElementById('perfMemoryBar');
      if (bar) {
        const totalMb = data.system?.total_ram_mb || 8192;
        const pct = Math.min(100, Math.round(data.memory_rss_mb / totalMb * 100));
        bar.style.width = pct + '%';
        bar.style.background = pct > 80 ? '#dc2626' : pct > 50 ? '#fa0' : '#1aad6f';
      }
    }
    // 运行时长
    if (data.uptime_seconds) {
      const s = data.uptime_seconds;
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      document.getElementById('perfUptime').textContent = d > 0 ? `${d}天${h}时${m}分` : h > 0 ? `${h}时${m}分` : `${m}分`;
      if (data.start_time) {
        document.getElementById('perfStartTime').textContent = '启动: ' + data.start_time;
      }
    }
    // 端口
    if (data.port) {
      document.getElementById('perfPort').textContent = data.port;
      if (data.ws_port) document.getElementById('perfWsPort').textContent = 'WS: ' + data.ws_port;
    }
    // 数据库
    if (data.db_sizes) {
      if (data.db_sizes.sessions_db_mb) {
        document.getElementById('perfSessionsDb').textContent = data.db_sizes.sessions_db_mb + ' MB';
      }
      if (data.db_sizes.token_db_kb) {
        document.getElementById('perfTokenDb').textContent = data.db_sizes.token_db_kb + ' KB';
      }
      if (data.db_sizes.models_db_kb) {
        document.getElementById('perfModelsDb').textContent = data.db_sizes.models_db_kb + ' KB';
      }
    }
    if (data.session_count != null) document.getElementById('perfSessionsCount').textContent = data.session_count + ' 个会话';
    if (data.token_usage_count != null) document.getElementById('perfTokenCount').textContent = data.token_usage_count + ' 条记录';
    if (data.model_count != null) document.getElementById('perfModelsCount').textContent = data.model_count + ' 个模型';
}

// ===== Monitor Page Shell =====
export async function renderMonitorPageChat(container) {
  // 按需加载 echarts（index.html 已移除全量加载）
  if (typeof window.echarts === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/static/js/echarts.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="siper-page-toolbar js-toolbar-flex-wrap">
  <div class="siper-settings-tabs" id="monitorTabs">
    <button class="siper-settings-tab active" data-tab="performance" onclick="window.switchMonitorTab('performance')">性能</button>
    <button class="siper-settings-tab" data-tab="token" onclick="window.switchMonitorTab('token')">词元</button>
    <button class="siper-settings-tab" data-tab="logs" onclick="window.switchMonitorTab('logs')">日志</button>
  </div>
  <div class="js-flex-shrink-0">
    <button class="siper-btn" onclick="window.refreshMonitorTab()">刷新</button>
  </div>
</div>
<div id="monitorContent">
  <div id="monitorTabPerformance"></div>
  <div id="monitorTabToken" class="js-hidden"></div>
  <div id="monitorTabLogs" class="js-hidden"></div>
</div>`;
  renderMonitorPerformance();
}

// ===== Token Tab — 4个等宽卡片一行 =====
export function renderMonitorTokenTab() {
  const container = document.getElementById('monitorTabToken');
  if (!container) return;
  container.innerHTML = `<div id="monitorTokenStats" class="js-mb-12"></div>
<div class="siper-token-charts-row">
  <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">📈 每日 Token 趋势</div><div id="monitorChartDate" class="js-chart-box"></div></div>
</div>
<div class="siper-token-charts-row">
  <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">⚡ 模型效率对比</div><div id="monitorChartEfficiency" class="js-chart-box"></div></div>
  <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">📅 活跃时段热力图</div><div id="monitorChartHeatmap" class="js-chart-box"></div></div>
</div>
<div class="siper-token-charts-row">
  <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">📊 分模型 Token 分布</div><div id="monitorChartModel" class="js-chart-box"></div></div>
  <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">⏰ 24小时 Token 分布</div><div id="monitorChartHourly" class="js-chart-box"></div></div>
</div>`;
  // 优先从 page_cache 读取（非空数据才用）
  const cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('monitor') : null;
  if (cached && cached.token && cached.token.total_requests > 0) {
    _applyTokenData(cached.token);
    return;
  }
  fetch('/api/token').then(r => r.json()).then(data => {
    _applyTokenData(data);
  }).catch(e => { console.error('[monitor] renderMonitorTokenTab fetch failed:', e); });
}

function _applyTokenData(data) {
  if (!data) return;
  const stats = document.getElementById('monitorTokenStats');
  if (stats) {
    stats.innerHTML = `<div class="siper-token-charts-row">
        <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">总请求数</div><div class="siper-token-value">${data.total_requests || 0}</div></div>
        <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">总词元</div><div class="siper-token-value">${_mFmt(data.total_tokens)}</div></div>
        <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">提示词元</div><div class="siper-token-value" style="color:var(--color-success)">${_mFmt(data.total_prompt_tokens)}</div></div>
        <div class="siper-card siper-token-chart-card card-hover"><div class="siper-token-chart-title">完成词元</div><div class="siper-token-value" style="color:var(--color-warning)">${_mFmt(data.total_completion_tokens)}</div></div>
      </div>`;
  }
  _mTokenData = data;
  // 数据就绪后直接渲染图表（此时容器可见）
  _renderTokenCharts();
}

// ===== ECharts =====
let _mChartModel = null, _mChartDate = null, _mChartHourly = null, _mChartEfficiency = null, _mChartHeatmap = null;
let _mCachedPalette = null;
const _mDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function _mReadCssVar(name) {
  const d = document.createElement('div');
  d.style.color = `var(${name})`;
  d.style.position = 'absolute';
  d.style.visibility = 'hidden';
  document.body.appendChild(d);
  const computed = getComputedStyle(d).color;
  document.body.removeChild(d);
  if (computed && computed !== 'rgb(0, 0, 0)' && computed !== 'rgba(0, 0, 0, 0)') return computed;
  return '';
}

function _mResolveColors() {
  if (_mCachedPalette) return _mCachedPalette;
  const primary = _mReadCssVar('--color-primary');
  const text = _mReadCssVar('--color-text');
  const textDim = _mReadCssVar('--color-text-dim');
  const border = _mReadCssVar('--color-border');
  const surface = _mReadCssVar('--color-surface');
  const success = _mReadCssVar('--color-success');
  const errorText = _mReadCssVar('--color-error-text');
  const warning = _mReadCssVar('--color-warning');
  _mCachedPalette = {
    primary: primary || '#1aad6f', text: text || '#1a1a1a', textDim: textDim || '#888888',
    border: border || 'rgba(0,0,0,0.12)', surface: surface || '#ffffff',
    success: success || '#1aad6f', errorText: errorText || '#dc2626', warning: warning || '#fa0',
  };
  return _mCachedPalette;
}

function _mFmt(n) {
  if (n == null) return '--';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function renderMonitorCharts(data) {
  if (typeof window.echarts === 'undefined') return;
  if (_mChartModel) { _mChartModel.dispose(); _mChartModel = null; }
  if (_mChartDate) { _mChartDate.dispose(); _mChartDate = null; }
  if (_mChartHourly) { _mChartHourly.dispose(); _mChartHourly = null; }
  if (_mChartEfficiency) { _mChartEfficiency.dispose(); _mChartEfficiency = null; }
  if (_mChartHeatmap) { _mChartHeatmap.dispose(); _mChartHeatmap = null; }

  const colors = _mResolveColors();
  const palette = [colors.primary, '#06b6d4', '#8b5cf6', colors.success, '#f59e0b', '#ec4899', colors.errorText, '#10b981', '#6366f1', '#f97316'];
  const textStyle = { color: colors.text };
  const tooltipStyle = { backgroundColor: colors.surface, textStyle };
  const axisLabelStyle = { color: colors.textDim };
  const axisLineStyle = { lineStyle: { color: colors.border } };
  const splitLineStyle = { lineStyle: { color: colors.border, type: 'dashed', opacity: 0.4 } };
  const modelStats = data.model_stats || [];

  // Chart 1: Model distribution (donut)
  const modelPieData = modelStats.map(m => ({
    name: m.model.length > 20 ? m.model.slice(0, 18) + '…' : m.model,
    value: m.total_tokens, fullName: m.model,
  }));
  if (modelPieData.length > 0) {
    const el = document.getElementById('monitorChartModel');
    if (el) {
      _mChartModel = window.echarts.init(el);
      _mChartModel.setOption({
        backgroundColor: 'transparent',
        animation: true,
        animationDuration: 800,
        animationEasing: 'cubicOut',
        tooltip: { trigger: 'item', ...tooltipStyle, formatter: (p) => { const item = modelPieData.find(d => d.name === p.name); return `${item ? item.fullName : p.name}<br/>Tokens: ${_mFmt(p.value)}<br/>占比: ${p.percent}%`; } },
        legend: { orient: 'vertical', right: 0, top: 'center', textStyle, itemGap: 8 },
        series: [{ type: 'pie', radius: ['42%', '72%'], center: ['35%', '50%'], data: modelPieData, label: { color: colors.text, fontSize: 12 }, labelLine: { lineStyle: { color: colors.textDim } }, itemStyle: { borderRadius: 4, borderColor: colors.surface, borderWidth: 2 }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' } }, color: palette }],
      });
    }
  }

  // Chart 2: Daily trend
  const dateStats = data.date_stats || {};
  const dateKeys = Object.keys(dateStats).sort();
  if (dateKeys.length > 0) {
    const el = document.getElementById('monitorChartDate');
    if (el) {
      _mChartDate = window.echarts.init(el);
      _mChartDate.setOption({
        backgroundColor: 'transparent',
        animation: true,
        animationDuration: 800,
        animationEasing: 'cubicOut',
        tooltip: { trigger: 'axis', ...tooltipStyle, axisPointer: { type: 'shadow' } },
        legend: { data: ['Prompt', 'Completion', 'Total'], textStyle, top: 4 },
        grid: { left: 50, right: 24, top: 44, bottom: 30 },
        xAxis: { type: 'category', data: dateKeys.map(d => d.slice(5)), axisLabel: axisLabelStyle, axisLine: axisLineStyle },
        yAxis: { type: 'value', axisLabel: { ...axisLabelStyle, formatter: v => _mFmt(v) }, axisLine: axisLineStyle, splitLine: splitLineStyle },
        series: [
          { name: 'Prompt', type: 'bar', stack: 'tokens', data: dateKeys.map(d => dateStats[d].prompt_tokens), itemStyle: { color: colors.primary }, barWidth: '40%' },
          { name: 'Completion', type: 'bar', stack: 'tokens', data: dateKeys.map(d => dateStats[d].completion_tokens), itemStyle: { color: colors.success, borderRadius: [4, 4, 0, 0] } },
          { name: 'Total', type: 'line', data: dateKeys.map(d => dateStats[d].total_tokens), itemStyle: { color: colors.warning }, lineStyle: { width: 2.5 }, symbol: 'circle', symbolSize: 6, smooth: true },
        ],
      });
    }
  }

  // Chart 3: Hourly bar
  const hourlyStats = data.hourly_stats || [];
  if (hourlyStats.length > 0) {
    const maxVal = Math.max(...hourlyStats.map(x => x.total_tokens));
    const el = document.getElementById('monitorChartHourly');
    if (el) {
      _mChartHourly = window.echarts.init(el);
      _mChartHourly.setOption({
        backgroundColor: 'transparent',
        animation: true,
        animationDuration: 800,
        animationEasing: 'cubicOut',
        tooltip: { trigger: 'axis', ...tooltipStyle, formatter: (params) => { const idx = params[0].dataIndex; const d = hourlyStats[idx]; return `${d.hour}<br/>Tokens: ${_mFmt(d.total_tokens)}<br/>调用: ${d.requests}`; } },
        grid: { left: 50, right: 24, top: 24, bottom: 46 },
        xAxis: { type: 'category', data: hourlyStats.map(h => h.hour), axisLabel: { ...axisLabelStyle, rotate: 45 }, axisLine: axisLineStyle },
        yAxis: { type: 'value', axisLabel: { ...axisLabelStyle, formatter: v => _mFmt(v) }, axisLine: axisLineStyle, splitLine: splitLineStyle },
        series: [{ type: 'bar', data: hourlyStats.map((h) => { const v = h.total_tokens; let barColor; if (v === 0) barColor = colors.border; else if (maxVal > 0) { const ratio = v / maxVal; if (ratio > 0.7) barColor = colors.errorText; else if (ratio > 0.4) barColor = '#f97316'; else if (ratio > 0.15) barColor = colors.warning; else barColor = colors.primary; } else barColor = colors.primary; return { value: v, itemStyle: { color: barColor, borderRadius: [4, 4, 0, 0] } }; }), barWidth: '60%' }],
      });
    }
  }

  // Chart 4: Heatmap
  const heatmapData = data.heatmap || [];
  if (heatmapData.length > 0) {
    const maxHeat = Math.max(...heatmapData.map(h => h.total_tokens));
    const heatDays = _mDAY_NAMES;
    const heatHours = Array.from({length: 24}, (_, i) => `${i}时`);
    const heatSeriesData = heatmapData.filter(h => h.total_tokens > 0).map(h => [h.hour, h.dow, h.total_tokens]);
    const el = document.getElementById('monitorChartHeatmap');
    if (el) {
      _mChartHeatmap = window.echarts.init(el);
      _mChartHeatmap.setOption({
        backgroundColor: 'transparent',
        animation: true,
        animationDuration: 800,
        animationEasing: 'cubicOut',
        tooltip: { ...tooltipStyle, formatter: (p) => { const d = p.data; return `${heatDays[d[1]]} ${d[0]}时<br/>Tokens: ${_mFmt(d[2])}<br/>调用: ${heatmapData.find(h => h.hour === d[0] && h.dow === d[1])?.requests || 0}`; } },
        grid: { left: 50, right: 24, top: 24, bottom: 46 },
        xAxis: { type: 'category', data: heatHours, splitArea: { show: true }, axisLabel: { ...axisLabelStyle, interval: 2 }, axisLine: axisLineStyle },
        yAxis: { type: 'category', data: heatDays, splitArea: { show: true }, axisLabel: axisLabelStyle, axisLine: axisLineStyle },
        visualMap: { min: 0, max: maxHeat, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: [colors.border, colors.primary, colors.warning, colors.errorText] }, textStyle: axisLabelStyle, text: ['高', '低'], itemWidth: 14, itemHeight: 80 },
        series: [{ type: 'heatmap', data: heatSeriesData, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' } } }],
      });
    }
  }

  // Chart 5: Model efficiency
  if (modelStats.length > 0) {
    const effModels = modelStats.filter(m => m.total_tokens > 0);
    if (effModels.length > 0) {
      const el = document.getElementById('monitorChartEfficiency');
      if (el) {
        _mChartEfficiency = window.echarts.init(el);
        _mChartEfficiency.setOption({
          backgroundColor: 'transparent',
          animation: true,
        animationDuration: 800,
        animationEasing: 'cubicOut',
        tooltip: { trigger: 'axis', ...tooltipStyle, axisPointer: { type: 'shadow' }, formatter: (params) => { const idx = params[0].dataIndex; const m = effModels[idx]; const ratio = m.prompt_tokens > 0 ? ((m.completion_tokens / m.prompt_tokens) * 100).toFixed(1) : '0.0'; return `${m.model}<br/>平均 Token: ${Math.round(m.total_tokens / m.requests)}<br/>完成/提示比: ${ratio}%<br/>调用次数: ${m.requests}`; } },
          legend: { data: ['平均 Token', '完成/提示比'], textStyle, top: 4 },
          grid: { left: 55, right: 55, top: 44, bottom: 30 },
          xAxis: { type: 'category', data: effModels.map(m => m.model.length > 15 ? m.model.slice(0, 13) + '…' : m.model), axisLabel: axisLabelStyle, axisLine: axisLineStyle },
          yAxis: [
            { type: 'value', name: 'Token', nameTextStyle: axisLabelStyle, axisLabel: { ...axisLabelStyle, formatter: v => _mFmt(v) }, axisLine: axisLineStyle, splitLine: splitLineStyle },
            { type: 'value', name: '比例', nameTextStyle: axisLabelStyle, axisLabel: { color: colors.textDim, formatter: v => v + '%' }, axisLine: { lineStyle: { color: colors.success } }, splitLine: { show: false }, max: (value) => Math.max(value.max + 5, 20) },
          ],
          series: [
            { name: '平均 Token', type: 'bar', data: effModels.map(m => m.avg_tokens || Math.round(m.total_tokens / m.requests)), itemStyle: { color: colors.primary, borderRadius: [4, 4, 0, 0] }, barWidth: '35%' },
            { name: '完成/提示比', type: 'line', yAxisIndex: 1, data: effModels.map(m => { const ratio = m.prompt_tokens > 0 ? Math.round((m.completion_tokens / m.prompt_tokens) * 1000) / 10 : 0; return ratio; }), itemStyle: { color: colors.success }, lineStyle: { width: 2.5 }, symbol: 'circle', symbolSize: 8, smooth: true },
          ],
        });
      }
    }
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

// ===== Logs Tab =====
let _logSearchDebounce = null;

export function refreshLogs(force) {
  const container = document.getElementById('chatLogsList');
  if (!container) return;
  if (!force && container.dataset.loaded === '1') return;
  container.innerHTML = '<div class="siper-loading">加载中...</div>';
  const level = document.getElementById('chatLogLogLevel') ? document.getElementById('chatLogLogLevel').value : '';
  const source = document.getElementById('logSourceFilter') ? document.getElementById('logSourceFilter').value : '';
  const search = document.getElementById('chatLogSearchInput') ? document.getElementById('chatLogSearchInput').value : '';
  let url = '/api/logs?limit=100';
  if (level) url += '&levels=' + encodeURIComponent(level);
  if (source) url += '&source=' + encodeURIComponent(source);
  if (search) url += '&search=' + encodeURIComponent(search);
  fetch(url).then(r => r.json()).then(data => {
    if (!data || !data.logs) {
      container.innerHTML = '<div class="siper-empty">加载失败</div>';
      return;
    }
    container.dataset.loaded = '1';
    if (data.logs.length === 0) {
      container.innerHTML = '<div class="siper-empty">暂无日志</div>';
      return;
    }
    container.innerHTML = data.logs.map(e => {
      const lvl = (e.level || '').toUpperCase();
      const cls = lvl === 'ERROR' ? 'log-error' : lvl === 'WARN' ? 'log-warn' : lvl === 'DEBUG' ? 'log-debug' : 'log-info';
      return '<div class="log-entry ' + cls + '">'
        + '<span class="log-time">' + escapeHtml(e.time || '') + '</span>'
        + '<span class="log-level">' + escapeHtml(lvl) + '</span>'
        + '<span class="log-source">[' + escapeHtml(e.logger || '') + ']</span>'
        + '<span class="log-msg">' + escapeHtml(e.message || '') + '</span>'
        + '</div>';
    }).join('');
    const stats = document.getElementById('chatLogStats');
    if (stats) stats.textContent = '共 ' + data.total + ' 条';
    const srcFilter = document.getElementById('logSourceFilter');
    if (srcFilter && data.sources) {
      const cur = srcFilter.value;
      srcFilter.innerHTML = '<option value="">全部来源</option>'
        + data.sources.map(s => '<option value="' + escapeHtml(s) + '"' + (s === cur ? ' selected' : '') + '>' + escapeHtml(s) + '</option>').join('');
    }
  }).catch(() => {
    container.innerHTML = '<div class="siper-empty">加载失败</div>';
  });
}

window.refreshLogs = refreshLogs;

// escapeHtml imported from utils/escape.js

export function applyLogLogsDebounced() {
  if (_logSearchDebounce) clearTimeout(_logSearchDebounce);
  _logSearchDebounce = setTimeout(() => refreshLogs(true), 300);
}

export function applyChatLogLevelFilter() {
  refreshLogs(true);
}

export function applyLogFilters() {
  refreshLogs(true);
}

window.applyLogLogsDebounced = applyLogLogsDebounced;
window.applyChatLogLevelFilter = applyChatLogLevelFilter;
window.applyLogFilters = applyLogFilters;
