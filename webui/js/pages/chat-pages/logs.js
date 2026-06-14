// chat-pages/logs.js — 日志页面渲染
// 从 pages/chat.js 拆分

export function renderLogsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div class="siper-page-toolbar js-toolbar-logs"><button class="siper-btn" onclick="window.refreshLogs()">刷新</button><button class="siper-btn danger" onclick="window.clearLogs()">清空显示</button><input type="text" id="chatLogSearchInput" placeholder="搜索..." class="siper-input" style="width:140px;" oninput="window.applyLogLogsDebounced()" aria-label="日志搜索"><select id="chatLogLogLevel" class="siper-input js-w-auto" onchange="window.applyChatLogLevelFilter()" aria-label="日志级别"><option value="">全部级别</option><option value="DEBUG">DEBUG</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select><select id="logSourceFilter" class="siper-input js-w-auto" onchange="window.applyLogFilters()" aria-label="日志来源"><option value="">全部来源</option></select><span id="chatLogStats" class="text-dim js-text-xs"></span></div><div id="logLevelFilters" class="js-mb-6"></div><div id="chatLogsList" class="js-code-block"></div><div id="chatLogPagination"></div>';
  if (typeof window.refreshLogs === 'function') window.refreshLogs();
}
