// ===== Token Stats with ECharts =====
function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// Chart instances (for resize/dispose)
let _chartModel = null, _chartDate = null, _chartHourly = null;

// Read CSS variables — tries inline style first (set by applySidebarTheme), then computed style
function _cssVar(name) {
  // Inline style has highest priority and is always up-to-date after theme switch
  const inline = document.documentElement.style.getPropertyValue(name);
  if (inline) return inline.trim();
  // Fallback: read from stylesheet via a temporary element
  const d = document.createElement('div');
  d.style.color = `var(${name})`;
  document.body.appendChild(d);
  const computed = getComputedStyle(d).color;
  document.body.removeChild(d);
  if (computed && computed !== 'rgb(0, 0, 0)') return computed;
  // Final fallback: default teal theme
  const defaults = {
    '--text': '#0a1f1a', '--text-dim': '#3a6b5e',
    '--accent': '#2d9e8a', '--accent2': '#6b5ca8',
    '--green': '#2d9e6a', '--red': '#c0392b',
    '--yellow': '#b7950b', '--orange': '#ca6f1e',
    '--cyan': '#1abc9c', '--border': '#8bbfb5', '--bg-card': '#ddf0ec',
  };
  return defaults[name] || '';
}

function _echartsColors() {
  return {
    text: _cssVar('--text'),
    textDim: _cssVar('--text-dim'),
    accent: _cssVar('--accent'),
    accent2: _cssVar('--accent2'),
    green: _cssVar('--green'),
    red: _cssVar('--red'),
    yellow: _cssVar('--yellow'),
    orange: _cssVar('--orange'),
    cyan: _cssVar('--cyan'),
    border: _cssVar('--border'),
    bgCard: _cssVar('--bg-card'),
  };
}

// Pie chart palette derived from theme
function _palette() {
  const c = _echartsColors();
  return [c.accent, c.accent2, c.cyan, c.green, c.orange, c.yellow, c.red, '#8b5cf6', '#06b6d4', '#f472b6'];
}

async function refreshTokenStats() {
  try {
    const r = await fetch('/api/token');
    const data = await r.json();

    // Summary cards
    const stats = document.getElementById('tokenStats');
    stats.innerHTML = `
      <div class="stat-card"><div class="value">${data.total_requests}</div><div class="label">${t('token.totalCalls')}</div></div>
      <div class="stat-card"><div class="value">${fmt(data.total_tokens)}</div><div class="label">${t('token.totalTokens')}</div></div>
      <div class="stat-card"><div class="value">${fmt(data.total_prompt_tokens)}</div><div class="label">${t('token.prompt')}</div></div>
      <div class="stat-card"><div class="value">${fmt(data.total_completion_tokens)}</div><div class="label">${t('token.completion')}</div></div>
    `;

    // Context window bar
    const ctxWindow = data.context_window || 1_000_000;
    const total = data.total_tokens || 0;
    const pct = Math.min((total / ctxWindow) * 100, 100);
    const bar = document.getElementById('ctxBar');
    bar.style.width = pct.toFixed(1) + '%';
    bar.className = 'token-bar-fill ' + (pct > 80 ? 'red' : pct > 50 ? 'yellow' : 'green');
    document.getElementById('ctxUsed').textContent = `${fmt(total)} / ${fmt(ctxWindow)}`;

    // History table
    const hist = data.history || [];
    document.getElementById('tokenHistory').innerHTML = hist.slice(-20).reverse().map(t =>
      `<tr><td>${t.time}</td><td>${t.model}</td><td>${t.prompt_tokens}</td><td>${t.completion_tokens}</td><td>${t.total_tokens}</td></tr>`
    ).join('');

    // Model stats table
    const modelStats = data.model_stats || [];
    document.getElementById('tokenModelStats').innerHTML = modelStats.map(m =>
      `<tr><td>${m.model}</td><td>${m.requests}</td><td>${fmt(m.prompt_tokens)}</td><td>${fmt(m.completion_tokens)}</td><td>${fmt(m.total_tokens)}</td></tr>`
    ).join('');

    // ===== ECharts =====
    if (typeof echarts === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // Dispose old charts
    if (_chartModel) { _chartModel.dispose(); _chartModel = null; }
    if (_chartDate) { _chartDate.dispose(); _chartDate = null; }
    if (_chartHourly) { _chartHourly.dispose(); _chartHourly = null; }

    const colors = _echartsColors();
    const palette = _palette();

    // --- Chart 1: Model distribution (pie) ---
    const modelPieData = modelStats.map(m => ({
      name: m.model.length > 20 ? m.model.slice(0, 18) + '…' : m.model,
      value: m.total_tokens,
      fullName: m.model,
    }));
    if (modelPieData.length > 0) {
      _chartModel = echarts.init(document.getElementById('chartModel'));
      _chartModel.setOption({
        tooltip: {
          trigger: 'item',
          formatter: (p) => {
            const item = modelPieData.find(d => d.name === p.name);
            const fullName = item ? item.fullName : p.name;
            return `${fullName}<br/>Tokens: ${fmt(p.value)}<br/>占比: ${p.percent}%`;
          },
        },
        legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: colors.text } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          data: modelPieData,
          label: { color: colors.text },
          itemStyle: { borderRadius: 4, borderColor: colors.bgCard, borderWidth: 2 },
          color: palette,
        }],
      });
    }

    // --- Chart 2: Daily trend (bar + line) ---
    const dateStats = data.date_stats || {};
    const dateKeys = Object.keys(dateStats).sort();
    if (dateKeys.length > 0) {
      _chartDate = echarts.init(document.getElementById('chartDate'));
      _chartDate.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['Prompt', 'Completion', 'Total'], textStyle: { color: colors.text } },
        grid: { left: 40, right: 20, top: 40, bottom: 30 },
        xAxis: {
          type: 'category',
          data: dateKeys.map(d => d.slice(5)),
          axisLabel: { color: colors.textDim },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: colors.textDim, formatter: (v) => fmt(v) },
        },
        series: [
          { name: 'Prompt', type: 'bar', stack: 'tokens', data: dateKeys.map(d => dateStats[d].prompt_tokens), itemStyle: { color: colors.accent } },
          { name: 'Completion', type: 'bar', stack: 'tokens', data: dateKeys.map(d => dateStats[d].completion_tokens), itemStyle: { color: colors.green } },
          { name: 'Total', type: 'line', data: dateKeys.map(d => dateStats[d].total_tokens), itemStyle: { color: colors.orange }, smooth: true },
        ],
      });
    }

    // --- Chart 3: Hourly bar (last 24h) — gradient colors from theme ---
    const hourlyStats = data.hourly_stats || [];
    if (hourlyStats.length > 0) {
      _chartHourly = echarts.init(document.getElementById('chartHourly'));
      _chartHourly.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const idx = params[0].dataIndex;
            const d = hourlyStats[idx];
            return `${d.hour}<br/>Tokens: ${fmt(d.total_tokens)}<br/>调用: ${d.requests}`;
          },
        },
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
        xAxis: {
          type: 'category',
          data: hourlyStats.map(h => h.hour),
          axisLabel: { color: colors.textDim, rotate: 45 },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: colors.textDim, formatter: (v) => fmt(v) },
        },
        series: [{
          type: 'bar',
          data: hourlyStats.map((h, idx) => ({
            value: h.total_tokens,
            itemStyle: {
              color: (() => {
                const v = h.total_tokens;
                if (v === 0) return colors.border;
                // Use theme-aware gradient: accent → orange → red based on intensity
                const maxVal = Math.max(...hourlyStats.map(x => x.total_tokens));
                if (maxVal === 0) return colors.accent;
                const ratio = v / maxVal;
                if (ratio > 0.7) return colors.red;
                if (ratio > 0.4) return colors.orange;
                if (ratio > 0.15) return colors.accent;
                return colors.cyan;
              })(),
              borderRadius: [4, 4, 0, 0],
            },
          })),
        }],
      });
    }

    // Resize on window resize
    window.removeEventListener('resize', _resizeCharts);
    window.addEventListener('resize', _resizeCharts);

    toast.info(t('token.refreshed'), 1500);
  } catch (e) {
    console.error('Token stats error:', e);
    toast.error(t('token.refreshFailed'));
  }
}

function _resizeCharts() {
  if (_chartModel) _chartModel.resize();
  if (_chartDate) _chartDate.resize();
  if (_chartHourly) _chartHourly.resize();
}

// Listen for theme changes → re-render charts with new colors
document.documentElement.addEventListener('siper-theme-changed', () => {
  const tokenPage = document.getElementById('page-token');
  if (tokenPage && tokenPage.classList.contains('active')) {
    refreshTokenStats();
  }
});

// Auto-load on page load
document.addEventListener('DOMContentLoaded', refreshTokenStats);
