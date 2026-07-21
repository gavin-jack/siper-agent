// chat-pages/token.js — Token 统计页面
// 从 pages/chat.js 拆分
import { fmtNum } from '../../utils/format.js?v=1784626478121';
import { apiGetCached } from '../../utils/api.js?v=1784626478121';
import { renderMonitorCharts } from './monitor.js?v=1784626478121';

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('token', function(data) {
    if (data.token && typeof _applyTokenData === 'function') {
      _applyTokenData(data.token);
    }
  });
}

// ── 模板函数 ──────────────────────────────────────────

function _buildStatsHtml(data) {
  return '<div class="siper-token-charts-row">' +
    _statCard('总请求数', data.total_requests || 0) +
    _statCard('总词元', fmtNum(data.total_tokens)) +
    _statCard('提示词元', fmtNum(data.total_prompt_tokens), 'text-success') +
    _statCard('完成词元', fmtNum(data.total_completion_tokens), 'text-warning') +
    '</div>';
}

function _statCard(label, value, colorCls) {
  var cls = colorCls ? ' ' + colorCls : '';
  return '<div class="card siper-token-chart-card card-hover">' +
    '<div class="card-title">' + label + '</div>' +
    '<div class="siper-token-value' + cls + '">' + value + '</div>' +
    '</div>';
}

function _buildChartsHtml() {
  return '<div class="siper-token-charts-row">' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">📊 分模型 Token 分布</div><div id="monitorChartModel" class="js-chart-box"></div></div>' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">⏰ 24小时 Token 分布</div><div id="monitorChartHourly" class="js-chart-box"></div></div>' +
    '</div>' +
    '<div class="siper-token-chart-card card-hover js-mt-12"><div class="card-title">📈 每日 Token 趋势</div><div id="monitorChartDate" class="js-chart-box"></div></div>' +
    '<div class="siper-token-charts-row js-mt-12">' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">⚡ 模型效率对比</div><div id="monitorChartEfficiency" class="js-chart-box"></div></div>' +
    '<div class="card siper-token-chart-card card-hover"><div class="card-title">📅 活跃时段热力图</div><div id="monitorChartHeatmap" class="js-chart-box"></div></div>' +
    '</div>';
}

// ── 页面渲染入口 ──────────────────────────────────────

export function renderTokenPageChat(container) {
  container.className = 'siper-content siper-full-content page-token';
  container.innerHTML =
    '<div class="page-header"><h3>📊 Token 统计</h3></div>' +
    '<div class="page-body">' +
    '<div id="monitorTokenStats"></div>' +
    _buildChartsHtml() +
    '</div>';
  // 容器此时可见，直接用 RAF 确保 DOM 完成渲染后再初始化图表
  requestAnimationFrame(function() {
    if (typeof window.refreshTokenStats === 'function') window.refreshTokenStats();
  });
}

// ── Token 数据加载 ────────────────────────────────────

function refreshTokenStats() {
  var statsBox = document.getElementById('monitorTokenStats');
  if (!statsBox) return;
  // 优先从 page_cache 读取
  var cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('monitor') : null;
  if (cached && cached.token) {
    _applyTokenData(cached.token);
    return;
  }
  apiGetCached('/api/token', 'monitor')
    .then(function(data) {
      if (!data) {
        statsBox.innerHTML = '<div class="siper-empty">加载失败</div>';
        return;
      }
      _applyTokenData(data);
    })
    .catch(function() {
      statsBox.innerHTML = '<div class="siper-empty">加载失败</div>';
    });
}

function _applyTokenData(data) {
  var statsBox = document.getElementById('monitorTokenStats');
  if (!statsBox) return;
  statsBox.innerHTML = _buildStatsHtml(data);
  // 渲染 ECharts（复用监控页渲染函数）
  if (typeof renderMonitorCharts === 'function') {
    renderMonitorCharts(data);
  }
}

// 暴露给外部调用
window.refreshTokenStats = refreshTokenStats;