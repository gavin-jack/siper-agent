// pages/token.js — Token 统计（含 ECharts）
// 配色直接从 style.css :root 变量读取，不依赖旧变量名

import { t } from '../utils/i18n.js';
import { toast } from '../components/toast.js';

// 模块级状态
let _chartModel = null, _chartDate = null, _chartHourly = null, _chartEfficiency = null, _chartHeatmap = null;

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ---- CSS variable resolution ----
function _readCssVar(name) {
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

let _cachedPalette = null;
function _resolveColors() {
  if (_cachedPalette) return _cachedPalette;
  const primary = _readCssVar('--color-primary');
  const text = _readCssVar('--color-text');
  const textDim = _readCssVar('--color-text-dim');
  const border = _readCssVar('--color-border');
  const surface = _readCssVar('--color-surface');
  const success = _readCssVar('--color-success');
  const errorText = _readCssVar('--color-error-text');
  const warning = _readCssVar('--color-warning');
  _cachedPalette = {
    primary: primary || '#1aad6f',
    text: text || '#1a1a1a',
    textDim: textDim || '#888888',
    border: border || 'rgba(0,0,0,0.12)',
    surface: surface || '#ffffff',
    success: success || '#1aad6f',
    errorText: errorText || '#dc2626',
    warning: warning || '#fa0',
  };
  return _cachedPalette;
}

function _echartsPalette() {
  const c = _resolveColors();
  return [
    c.primary, '#06b6d4', '#8b5cf6', c.success, '#f59e0b',
    '#ec4899', c.errorText, '#10b981', '#6366f1', '#f97316',
  ];
}

export async function refreshTokenStats() {
  // Show loading state immediately
  const stats = document.getElementById('chatTokenStats') || document.getElementById('TokenStats');
  if (stats) stats.innerHTML = '<div class="js-empty-state-lg" style="padding:24px;text-align:center;">⏳ 加载 Token 数据中...</div>';
  try {
    // 起源：优先从快照 page_cache 获取数据
    let data = null;
    if (typeof window.__getPageCache === 'function') {
      const cache = window.__getPageCache('token');
      if (cache && cache.stats) data = cache;
    }
    // 过渡期：HTTP 请求兜底
    if (!data) {
      const r = await fetch('/api/token');
      if (!r.ok) return;
      data = await r.json();
    }

    function el(id) { return document.getElementById('chat' + id.charAt(0).toUpperCase() + id.slice(1)) || document.getElementById(id); }

    const colors = _resolveColors();
    const palette = _echartsPalette();

    // Summary cards
    const stats = el('TokenStats');
    stats.innerHTML = `
      <div class="stat-card card-left-accent"><div class="value">${data.total_requests}</div><div class="label">${t('token.totalCalls')}</div></div>
      <div class="stat-card card-left-accent"><div class="value">${fmt(data.total_tokens)}</div><div class="label">${t('token.totalTokens')}</div></div>
      <div class="stat-card card-left-accent"><div class="value">${fmt(data.total_prompt_tokens)}</div><div class="label">${t('token.prompt')}</div></div>
      <div class="stat-card card-left-accent"><div class="value">${fmt(data.total_completion_tokens)}</div><div class="label">${t('token.completion')}</div></div>
    `;

    // History table — removed
    const histEl = el('TokenHistory');
    if (histEl) histEl.innerHTML = '';

    // Model stats table — removed, but modelStats still needed for charts
    const modelStats = data.model_stats || [];
    const modelEl = el('TokenModelStats');
    if (modelEl) modelEl.innerHTML = '';

    // ===== ECharts =====
    if (typeof window.echarts === 'undefined') {
      console.warn('ECharts not loaded, skipping charts');
      return;
    }
    if (_chartModel) { _chartModel.dispose(); _chartModel = null; }
    if (_chartDate) { _chartDate.dispose(); _chartDate = null; }
    if (_chartHourly) { _chartHourly.dispose(); _chartHourly = null; }
    if (_chartEfficiency) { _chartEfficiency.dispose(); _chartEfficiency = null; }
    if (_chartHeatmap) { _chartHeatmap.dispose(); _chartHeatmap = null; }

    const textStyle = { color: colors.text };
    const tooltipStyle = { backgroundColor: colors.surface, textStyle };
    const axisLabelStyle = { color: colors.textDim };
    const axisLineStyle = { lineStyle: { color: colors.border } };
    const splitLineStyle = { lineStyle: { color: colors.border, type: 'dashed', opacity: 0.4 } };

    // Chart 1: Model distribution (donut)
    const modelPieData = modelStats.map(m => ({
      name: m.model.length > 20 ? m.model.slice(0, 18) + '…' : m.model,
      value: m.total_tokens,
      fullName: m.model,
    }));
    if (modelPieData.length > 0) {
      _chartModel = window.echarts.init(el('ChartModel'));
      _chartModel.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item', ...tooltipStyle,
          formatter: (p) => {
            const item = modelPieData.find(d => d.name === p.name);
            const fullName = item ? item.fullName : p.name;
            return `${fullName}<br/>Tokens: ${fmt(p.value)}<br/>占比: ${p.percent}%`;
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

    // Chart 2: Daily trend (stacked bar + line)
    const dateStats = data.date_stats || {};
    const dateKeys = Object.keys(dateStats).sort();
    if (dateKeys.length > 0) {
      _chartDate = window.echarts.init(el('ChartDate'));
      _chartDate.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', ...tooltipStyle, axisPointer: { type: 'shadow' } },
        legend: { data: ['Prompt', 'Completion', 'Total'], textStyle, top: 4 },
        grid: { left: 50, right: 24, top: 44, bottom: 30 },
        xAxis: { type: 'category', data: dateKeys.map(d => d.slice(5)), axisLabel: axisLabelStyle, axisLine: axisLineStyle },
        yAxis: { type: 'value', axisLabel: { ...axisLabelStyle, formatter: v => fmt(v) }, axisLine: axisLineStyle, splitLine: splitLineStyle },
        series: [
          { name: 'Prompt', type: 'bar', stack: 'tokens', data: dateKeys.map(d => dateStats[d].prompt_tokens), itemStyle: { color: colors.primary }, barWidth: '40%' },
          { name: 'Completion', type: 'bar', stack: 'tokens', data: dateKeys.map(d => dateStats[d].completion_tokens), itemStyle: { color: colors.success, borderRadius: [4, 4, 0, 0] } },
          { name: 'Total', type: 'line', data: dateKeys.map(d => dateStats[d].total_tokens), itemStyle: { color: colors.warning }, lineStyle: { width: 2.5 }, symbol: 'circle', symbolSize: 6, smooth: true },
        ],
      });
    }

    // Chart 3: Hourly bar (last 24h) with gradient intensity
    const hourlyStats = data.hourly_stats || [];
    if (hourlyStats.length > 0) {
      const maxVal = Math.max(...hourlyStats.map(x => x.total_tokens));
      _chartHourly = window.echarts.init(el('ChartHourly'));
      _chartHourly.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis', ...tooltipStyle,
          formatter: (params) => {
            const idx = params[0].dataIndex;
            const d = hourlyStats[idx];
            return `${d.hour}<br/>Tokens: ${fmt(d.total_tokens)}<br/>调用: ${d.requests}`;
          },
        },
        grid: { left: 50, right: 24, top: 24, bottom: 46 },
        xAxis: { type: 'category', data: hourlyStats.map(h => h.hour), axisLabel: { ...axisLabelStyle, rotate: 45 }, axisLine: axisLineStyle },
        yAxis: { type: 'value', axisLabel: { ...axisLabelStyle, formatter: v => fmt(v) }, axisLine: axisLineStyle, splitLine: splitLineStyle },
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

    // Chart 4: Model efficiency — avg tokens + completion ratio (bar + line combo)
    if (modelStats.length > 0) {
      const effModels = modelStats.filter(m => m.total_tokens > 0);
      if (effModels.length > 0) {
        const maxAvg = Math.max(...effModels.map(m => m.avg_tokens || Math.round(m.total_tokens / m.requests)));
        _chartEfficiency = window.echarts.init(el('ChartEfficiency'));
        _chartEfficiency.setOption({
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
              axisLabel: { ...axisLabelStyle, formatter: v => fmt(v) },
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

    // Chart 5: Day-of-week × hour heatmap
    const heatmapData = data.heatmap || [];
    if (heatmapData.length > 0) {
      const maxHeat = Math.max(...heatmapData.map(h => h.total_tokens));
      const heatDays = DAY_NAMES;
      const heatHours = Array.from({length: 24}, (_, i) => `${i}时`);
      const heatSeriesData = heatmapData
        .filter(h => h.total_tokens > 0)
        .map(h => [h.hour, h.dow, h.total_tokens]);

      _chartHeatmap = window.echarts.init(el('ChartHeatmap'));
      _chartHeatmap.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          ...tooltipStyle,
          formatter: (p) => {
            const d = p.data;
            return `${heatDays[d[1]]} ${d[0]}时<br/>Tokens: ${fmt(d[2])}<br/>调用: ${heatmapData.find(h => h.hour === d[0] && h.dow === d[1])?.requests || 0}`;
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

    // Resize handler
    window.removeEventListener('resize', _resizeCharts);
    window.addEventListener('resize', _resizeCharts);

    toast.info(t('token.refreshed'), 1500);
  } catch (e) {
    console.error('Token stats error:', e);
    toast.error(t('token.refreshFailed'));
  }
}

export function _resizeCharts() {
  if (_chartModel) _chartModel.resize();
  if (_chartDate) _chartDate.resize();
  if (_chartHourly) _chartHourly.resize();
  if (_chartEfficiency) _chartEfficiency.resize();
  if (_chartHeatmap) _chartHeatmap.resize();
}

// Re-render charts when theme changes
document.documentElement.addEventListener('siper-theme-changed', () => {
  _cachedPalette = null;
  if (typeof refreshTokenStats === 'function') refreshTokenStats();
});
