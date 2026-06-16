// chat-pages/token.js — Token 统计页面渲染
// 从 pages/chat.js 拆分
import { renderMonitorCharts } from './monitor.js';

export function renderTokenPageChat(container) {
  container.className = 'siper-content siper-full-content';
  // 使用与监控页相同的 ID（monitorChart*），以便复用 renderMonitorCharts
  container.innerHTML = '<div class="token-stats" id="monitorTokenStats"></div><div class="siper-token-charts-row"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📊 分模型 Token 分布</div><div id="monitorChartModel" class="js-chart-box"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⏰ 24小时 Token 分布</div><div id="monitorChartHourly" class="js-chart-box"></div></div></div><div class="siper-token-chart-card card-hover js-mt-12"><div class="siper-token-chart-title">📈 每日 Token 趋势</div><div id="monitorChartDate" class="js-chart-box"></div></div><div class="siper-token-charts-row js-mt-12"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⚡ 模型效率对比</div><div id="monitorChartEfficiency" class="js-chart-box"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📅 活跃时段热力图</div><div id="monitorChartHeatmap" class="js-chart-box"></div></div></div>';
  // 延迟渲染图表，等容器可见后 ECharts 才能正确获取尺寸
  setTimeout(() => {
    if (typeof window.refreshTokenStats === 'function') window.refreshTokenStats();
  }, 60);
}

// ------- Token 数据加载与图表渲染 -------
function _fmtNum(n) {
  if (n == null) return '--';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function refreshTokenStats() {
  const statsBox = document.getElementById('monitorTokenStats');
  if (!statsBox) return;
  // 优先从 page_cache 读取
  const cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('monitor') : null;
  if (cached && cached.token) {
    _applyTokenData(cached.token);
    return;
  }
  fetch('/api/token')
    .then(r => r.json())
    .then(data => {
      if (!data) {
        statsBox.innerHTML = '<div class="empty-state">加载失败</div>';
        return;
      }
      _applyTokenData(data);
    })
    .catch(() => {
      statsBox.innerHTML = '<div class="empty-state">加载失败</div>';
    });
}

function _applyTokenData(data) {
  const statsBox = document.getElementById('monitorTokenStats');
  if (!statsBox) return;
  statsBox.innerHTML = `<div class="siper-token-charts-row">
    <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">总请求数</div><div class="siper-token-value">${data.total_requests || 0}</div></div>
    <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">总词元</div><div class="siper-token-value">${_fmtNum(data.total_tokens)}</div></div>
    <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">提示词元</div><div class="siper-token-value" style="color:var(--color-success)">${_fmtNum(data.total_prompt_tokens)}</div></div>
    <div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">完成词元</div><div class="siper-token-value" style="color:var(--color-warning)">${_fmtNum(data.total_completion_tokens)}</div></div>
  </div>`;
  // 渲染 ECharts（复用监控页渲染函数）
  if (typeof renderMonitorCharts === 'function') {
    renderMonitorCharts(data);
  }
}

// 暴露给外部调用
window.refreshTokenStats = refreshTokenStats;
