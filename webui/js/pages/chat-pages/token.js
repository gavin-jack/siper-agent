// chat-pages/token.js — Token 统计页面渲染
// 从 pages/chat.js 拆分

export function renderTokenPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div class="token-stats" id="chatTokenStats"></div><div class="siper-token-charts-row"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📊 分模型 Token 分布</div><div id="chatChartModel" class="js-chart-box"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⏰ 24小时 Token 分布</div><div id="chatChartHourly" class="js-chart-box"></div></div></div><div class="siper-token-chart-card card-hover js-mt-12"><div class="siper-token-chart-title">📈 每日 Token 趋势</div><div id="chatChartDate" class="js-chart-box"></div></div><div class="siper-token-charts-row js-mt-12"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⚡ 模型效率对比</div><div id="chatChartEfficiency" class="js-chart-box"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📅 活跃时段热力图</div><div id="chatChartHeatmap" class="js-chart-box"></div></div></div>';
  if (typeof window.refreshTokenStats === 'function') window.refreshTokenStats();
}
