// chat-pages/monitor.js — 监控页面渲染
// 从 pages/chat.js 拆分
// 包含 Token 用量、日志、性能、目录四个 tab

function switchMonitorTab(tab) {
  const tabs = document.querySelectorAll('#monitorTabs .siper-settings-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  ['token','logs','performance','directory'].forEach(t => {
    const el = document.getElementById('monitorTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.classList.toggle('js-hidden', t !== tab);
  });
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
  if (tab === 'directory') renderMonitorDirectory();
  if (tab === 'token' && typeof window.echarts !== 'undefined') {
    setTimeout(() => {
      if (typeof _mResizeCharts === 'function') _mResizeCharts();
    }, 50);
  }
}

function renderMonitorPerformance() {
  const container = document.getElementById('monitorTabPerformance');
  if (!container) return;
  container.innerHTML = `<div class="page-header"><h3>系统性能</h3></div><div class="page-body"><div class="siper-settings-section"><div class="siper-settings-section-title">系统信息</div><div class="siper-settings-row"><label>端口</label><span id="perfPort">9724</span></div><div class="siper-settings-row"><label>运行时间</label><span id="perfUptime">加载中...</span></div><div class="siper-settings-row"><label>内存使用</label><span id="perfMemory">加载中...</span></div><div class="siper-settings-row"><label>CPU 使用</label><span id="perfCpu">加载中...</span></div></div><div class="siper-settings-section"><div class="siper-settings-section-title">资源使用</div><div class="siper-settings-row"><label>models.db</label><span id="perfModelsDb">加载中...</span></div><div class="siper-settings-row"><label>sessions.db</label><span id="perfSessionsDb">加载中...</span></div><div class="siper-settings-row"><label>token.db</label><span id="perfTokenDb">加载中...</span></div></div><div class="siper-settings-section"><div class="siper-settings-section-title">大文件</div><div id="perfLargeFiles" class="js-scroll-list"></div></div></div>`;
  // 加载性能数据
  fetch('/api/status').then(r => r.json()).then(data => {
    if (data.port) document.getElementById('perfPort').textContent = data.port;
    if (data.uptime) document.getElementById('perfUptime').textContent = data.uptime;
    if (data.memory) document.getElementById('perfMemory').textContent = data.memory;
    if (data.cpu) document.getElementById('perfCpu').textContent = data.cpu;
  }).catch(() => {});
  // 加载数据库大小
  fetch('/api/config').then(r => r.json()).then(data => {
    // 从后端获取文件信息
  }).catch(() => {});
}

function renderMonitorDirectory() {
  const container = document.getElementById('monitorTabDirectory');
  if (!container) return;
  container.innerHTML = `<div class="page-header"><h3>项目目录</h3></div><div class="page-body"><div id="dirTree" class="js-code-block"></div></div>`;
  const dirTree = document.getElementById('dirTree');
  if (dirTree) {
    dirTree.textContent = '项目目录结构（后端 API 待开发）\n\nsiper/\n├── ai_agent/\n│   ├── core/\n│   ├── tools/\n│   ├── skills/\n│   ├── sessions/\n│   └── utils/\n├── webui/\n│   ├── js/\n│   ├── css/\n│   └── static/\n├── agents/\n├── skills/\n├── models.db\n├── siper_web.py\n└── setup.py';
  }
}

function renderMonitorPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="siper-page-toolbar js-toolbar-flex-wrap">
  <div class="siper-settings-tabs" id="monitorTabs">
    <button class="siper-settings-tab active" data-tab="token" onclick="window.switchMonitorTab('token')">Token用量</button>
    <button class="siper-settings-tab" data-tab="logs" onclick="window.switchMonitorTab('logs')">日志</button>
    <button class="siper-settings-tab" data-tab="performance" onclick="window.switchMonitorTab('performance')">性能</button>
    <button class="siper-settings-tab" data-tab="directory" onclick="window.switchMonitorTab('directory')">目录</button>
  </div>
  <div class="js-flex-shrink-0">
    <button class="siper-btn" onclick="window.refreshMonitorTab()">刷新</button>
  </div>
</div>
<div id="monitorContent">
  <div id="monitorTabToken"></div>
  <div id="monitorTabLogs" class="js-hidden"></div>
  <div id="monitorTabPerformance" class="js-hidden"></div>
  <div id="monitorTabDirectory" class="js-hidden"></div>
</div>`;
  // 默认显示 token tab
  const tokenEl = document.getElementById('monitorTabToken');
  if (tokenEl) tokenEl.classList.remove('js-hidden');
  // 加载 token 数据（独立渲染，不依赖旧 token 页面）
  renderMonitorTokenTab();
}

function renderMonitorTokenTab() {
  const container = document.getElementById('monitorTabToken');
  if (!container) return;
  container.innerHTML = `<div id="monitorTokenStats" class="js-mb-12"></div>
<div class="siper-token-charts-row">
  <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📊 分模型 Token 分布</div><div id="monitorChartModel" class="js-chart-box"></div></div>
  <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⏰ 24小时 Token 分布</div><div id="monitorChartHourly" class="js-chart-box"></div></div>
</div>
<div class="siper-token-chart-card card-hover js-mt-12"><div class="siper-token-chart-title">📈 每日 Token 趋势</div><div id="monitorChartDate" class="js-chart-box"></div></div>
<div class="siper-token-charts-row js-mt-12">
  <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⚡ 模型效率对比</div><div id="monitorChartEfficiency" class="js-chart-box"></div></div>
  <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📅 活跃时段热力图</div><div id="monitorChartHeatmap" class="js-chart-box"></div></div>
</div>`;
  fetch('/api/token').then(r => r.json()).then(data => {
    const stats = document.getElementById('monitorTokenStats');
    if (stats && data) {
      stats.innerHTML = `<div class="siper-token-charts-row">
        <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">总请求数</div><div style="font-size:24px;font-weight:700;color:var(--color-primary)">${data.total_requests || 0}</div></div>
        <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">总 Token</div><div style="font-size:24px;font-weight:700;color:var(--color-primary)">${data.total_tokens || 0}</div></div>
        <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">Prompt Token</div><div style="font-size:24px;font-weight:700;color:var(--color-success)">${data.total_prompt_tokens || 0}</div></div>
        <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">Completion Token</div><div style="font-size:24px;font-weight:700;color:var(--color-warning)">${data.total_completion_tokens || 0}</div></div>
      </div>`;
    }
    renderMonitorCharts(data);
  }).catch(() => {});
}

let _mChartModel = null, _mChartDate = null, _mChartHourly = null, _mChartEfficiency = null, _mChartHeatmap = null;
let _mCachedPalette = null;
const _mDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function _mReadCssVar(name) {
  const inline = document.documentElement.style.getPropertyValue(name);
  if (inline) return inline.trim();
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
    primary: primary || '#1aad6f',
    text: text || '#1a1a1a',
    textDim: textDim || '#888888',
    border: border || 'rgba(0,0,0,0.12)',
    surface: surface || '#ffffff',
    success: success || '#1aad6f',
    errorText: errorText || '#dc2626',
    warning: warning || '#fa0',
  };
  return _mCachedPalette;
}

function _mEchartsPalette() {
  const c = _mResolveColors();
  return [
    c.primary, '#06b6d4', '#8b5cf6', c.success, '#f59e0b',
    '#ec4899', c.errorText, '#10b981', '#6366f1', '#f97316',
  ];
}

function _mFmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function renderMonitorCharts(data) {
  if (typeof window.echarts === 'undefined') {
    console.warn('ECharts not loaded, skipping monitor charts');
    return;
  }

  // Dispose old charts
  if (_mChartModel) { _mChartModel.dispose(); _mChartModel = null; }
  if (_mChartDate) { _mChartDate.dispose(); _mChartDate = null; }
  if (_mChartHourly) { _mChartHourly.dispose(); _mChartHourly = null; }
  if (_mChartEfficiency) { _mChartEfficiency.dispose(); _mChartEfficiency = null; }
  if (_mChartHeatmap) { _mChartHeatmap.dispose(); _mChartHeatmap = null; }

  const colors = _mResolveColors();
  const palette = _mEchartsPalette();
  const textStyle = { color: colors.text };
  const tooltipStyle = { backgroundColor: colors.surface, textStyle };
  const axisLabelStyle = { color: colors.textDim };
  const axisLineStyle = { lineStyle: { color: colors.border } };
  const splitLineStyle = { lineStyle: { color: colors.border, type: 'dashed', opacity: 0.4 } };

  const modelStats = data.model_stats || [];

  // Chart 1: Model distribution (donut)
  const modelPieData = modelStats.map(m => ({
    name: m.model.length > 20 ? m.model.slice(0, 18) + '…' : m.model,
    value: m.total_tokens,
    fullName: m.model,
  }));
  if (modelPieData.length > 0) {
    const el = document.getElementById('monitorChartModel');
    if (el) {
      _mChartModel = window.echarts.init(el);
      _mChartModel.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item', ...tooltipStyle,
          formatter: (p) => {
            const item = modelPieData.find(d => d.name === p.name);
            const fullName = item ? item.fullName : p.name;
            return `${fullName}<br/>Tokens: ${_mFmt(p.value)}<br/>占比: ${p.percent}%`;
          },
        },
        legend: { orient: 'vertical', right: 0, top: 'center', textStyle, itemGap: 8 },
        series: [{
          type: 'pie', radius: ['42%', '72%'], center: ['35%', '50%'],
          data: modelPieData,
          label: { color: colors.text, fontSize: 12 },
          labelLine: { lineStyle: { color: colors.textDim } },
          itemStyle: { borderRadius: 4, borderColor: colors.surface, borderWidth: 2 },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' } },
          color: palette,
        }],
      });
    }
  }

  // Chart 2: Daily trend (stacked bar + line)
  const dateStats = data.date_stats || {};
  const dateKeys = Object.keys(dateStats).sort();
  if (dateKeys.length > 0) {
    const el = document.getElementById('monitorChartDate');
    if (el) {
      _mChartDate = window.echarts.init(el);
      _mChartDate.setOption({
        backgroundColor: 'transparent',
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

  // Chart 3: Hourly bar (last 24h) with gradient intensity
  const hourlyStats = data.hourly_stats || [];
  if (hourlyStats.length > 0) {
    const maxVal = Math.max(...hourlyStats.map(x => x.total_tokens));
    const el = document.getElementById('monitorChartHourly');
    if (el) {
      _mChartHourly = window.echarts.init(el);
      _mChartHourly.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis', ...tooltipStyle,
          formatter: (params) => {
            const idx = params[0].dataIndex;
            const d = hourlyStats[idx];
            return `${d.hour}<br/>Tokens: ${_mFmt(d.total_tokens)}<br/>调用: ${d.requests}`;
          },
        },
        grid: { left: 50, right: 24, top: 24, bottom: 46 },
        xAxis: { type: 'category', data: hourlyStats.map(h => h.hour), axisLabel: { ...axisLabelStyle, rotate: 45 }, axisLine: axisLineStyle },
        yAxis: { type: 'value', axisLabel: { ...axisLabelStyle, formatter: v => _mFmt(v) }, axisLine: axisLineStyle, splitLine: splitLineStyle },
        series: [{
          type: 'bar',
          data: hourlyStats.map((h) => {
            const v = h.total_tokens;
            let barColor;
            if (v === 0) barColor = colors.border;
            else if (maxVal > 0) {
              const ratio = v / maxVal;
              if (ratio > 0.7) barColor = colors.errorText;
              else if (ratio > 0.4) barColor = '#f97316';
              else if (ratio > 0.15) barColor = colors.warning;
              else barColor = colors.primary;
            } else barColor = colors.primary;
            return { value: v, itemStyle: { color: barColor, borderRadius: [4, 4, 0, 0] } };
          }),
          barWidth: '60%',
        }],
      });
    }
  }

  // Chart 4: Model efficiency — avg tokens + completion ratio (bar + line combo)
  if (modelStats.length > 0) {
    const effModels = modelStats.filter(m => m.total_tokens > 0);
    if (effModels.length > 0) {
      const el = document.getElementById('monitorChartEfficiency');
      if (el) {
        _mChartEfficiency = window.echarts.init(el);
        _mChartEfficiency.setOption({
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'axis',
            ...tooltipStyle,
            axisPointer: { type: 'shadow' },
            formatter: (params) => {
              const idx = params[0].dataIndex;
              const m = effModels[idx];
              const ratio = m.prompt_tokens > 0 ? ((m.completion_tokens / m.prompt_tokens) * 100).toFixed(1) : '0.0';
              return `${m.model}<br/>平均 Token: ${Math.round(m.total_tokens / m.requests)}<br/>完成/提示比: ${ratio}%<br/>调用次数: ${m.requests}`;
            },
          },
          legend: { data: ['平均 Token', '完成/提示比'], textStyle, top: 4 },
          grid: { left: 55, right: 55, top: 44, bottom: 30 },
          xAxis: {
            type: 'category',
            data: effModels.map(m => m.model.length > 15 ? m.model.slice(0, 13) + '…' : m.model),
            axisLabel: axisLabelStyle,
            axisLine: axisLineStyle,
          },
          yAxis: [
            {
              type: 'value', name: 'Token', nameTextStyle: axisLabelStyle,
              axisLabel: { ...axisLabelStyle, formatter: v => _mFmt(v) },
              axisLine: axisLineStyle, splitLine: splitLineStyle,
            },
            {
              type: 'value', name: '比例', nameTextStyle: axisLabelStyle,
              axisLabel: { color: colors.textDim, formatter: v => v + '%' },
              axisLine: { lineStyle: { color: colors.success } },
              splitLine: { show: false },
              max: (value) => Math.max(value.max + 5, 20),
            },
          ],
          series: [
            {
              name: '平均 Token',
              type: 'bar',
              data: effModels.map(m => m.avg_tokens || Math.round(m.total_tokens / m.requests)),
              itemStyle: { color: colors.primary, borderRadius: [4, 4, 0, 0] },
              barWidth: '35%',
            },
            {
              name: '完成/提示比',
              type: 'line',
              yAxisIndex: 1,
              data: effModels.map(m => {
                const ratio = m.prompt_tokens > 0 ? Math.round((m.completion_tokens / m.prompt_tokens) * 1000) / 10 : 0;
                return ratio;
              }),
              itemStyle: { color: colors.success },
              lineStyle: { width: 2.5 },
              symbol: 'circle',
              symbolSize: 8,
              smooth: true,
            },
          ],
        });
      }
    }
  }

  // Chart 5: Day-of-week × hour heatmap
  const heatmapData = data.heatmap || [];
  if (heatmapData.length > 0) {
    const maxHeat = Math.max(...heatmapData.map(h => h.total_tokens));
    const heatDays = _mDAY_NAMES;
    const heatHours = Array.from({length: 24}, (_, i) => `${i}时`);
    const heatSeriesData = heatmapData
      .filter(h => h.total_tokens > 0)
      .map(h => [h.hour, h.dow, h.total_tokens]);

    const el = document.getElementById('monitorChartHeatmap');
    if (el) {
      _mChartHeatmap = window.echarts.init(el);
      _mChartHeatmap.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          ...tooltipStyle,
          formatter: (p) => {
            const d = p.data;
            return `${heatDays[d[1]]} ${d[0]}时<br/>Tokens: ${_mFmt(d[2])}<br/>调用: ${heatmapData.find(h => h.hour === d[0] && h.dow === d[1])?.requests || 0}`;
          },
        },
        grid: { left: 50, right: 24, top: 24, bottom: 46 },
        xAxis: {
          type: 'category',
          data: heatHours,
          splitArea: { show: true },
          axisLabel: { ...axisLabelStyle, interval: 2 },
          axisLine: axisLineStyle,
        },
        yAxis: {
          type: 'category',
          data: heatDays,
          splitArea: { show: true },
          axisLabel: axisLabelStyle,
          axisLine: axisLineStyle,
        },
        visualMap: {
          min: 0,
          max: maxHeat,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          inRange: {
            color: [colors.border, colors.primary, colors.warning, colors.errorText],
          },
          textStyle: axisLabelStyle,
          text: ['高', '低'],
          itemWidth: 14,
          itemHeight: 80,
        },
        series: [{
          type: 'heatmap',
          data: heatSeriesData,
          label: { show: false },
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' },
          },
        }],
      });
    }
  }

  // Resize handler
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