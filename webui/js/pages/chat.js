// pages/chat.js — 聊天页面薄入口
// 从 page-chat.js (3150行) 拆分，此文件仅做 ESM 导入 + window 挂载

// Utils
import { escapeHtml } from '../utils/escape.js';
import { showDictModal } from '../components/toast.js';

// Chat modules
import { siPerNavigate } from '../chat/nav.js';
import { loadSessionHistory, updateCtxFromStreamEnd } from '../chat/session.js';
import { setCurrentPage, fmtTokens, updateStreamingBadge, chatSidebarExpanded, chatSessionId, chatCurrentAgent, chatAgents } from '../chat/state.js';
import * as Message from '../chat/message.js';
import * as Input from '../chat/input.js';
import * as Sidebar from '../chat/sidebar.js';
import * as Stream from '../chat/stream.js';
import * as Lang from '../chat/lang.js';
import * as Toast from '../chat/toast.js';

// DOM utils
import { addMsg, appendMeta, debugHighlight } from '../renderer.js';
import { isSessionUnread } from '../chat/sidebar.js';
import { updateCtxInfoDisplay } from '../chat/message.js';
import { closeChatModelDropdown, updateChatHeader } from '../chat/input.js';

// ===== Page Config =====
const CHAT_PAGES = {
  chat:    { title: '对话', icon: '💬' },
  tasks:    { title: '任务', icon: '📋' },
  'model-settings': { title: '模型管理', icon: '🤖' },
  tools:    { title: '工具', icon: '🔧' },
  skills:    { title: '技能管理', icon: '🧩' },
  plugins:  { title: '插件管理', icon: '🔌' },
  monitor:  { title: '监控', icon: '📊' },
  'global-settings': { title: '全局设置', icon: '⚙️' },
};

// ===== Init =====
// bindChatInput 必须在 ESM 顶层调用（不能放 DOMContentLoaded），
// 因为 ESM <script type="module"> 默认 defer，晚于 DOMContentLoaded 执行，
// 导致监听器永远错过事件。
Input.bindChatInput();
if (chatSidebarExpanded) {
  const sidebar = document.getElementById('chatSidebar');
  if (sidebar) sidebar.classList.add('expanded');
}

// ===== Page Switching =====
export function chatSwitchPage(page, fromNavigate) {
  if (!CHAT_PAGES[page]) return;
  setCurrentPage(page);

  if (!fromNavigate) {
    if (page !== 'chat') location.hash = '#/' + page;
    else location.hash = '';
  }

  document.querySelectorAll('.siper-nav-item').forEach(el => {
    el.classList[el.dataset.page === page ? 'add' : 'remove']('active');
  });

  const headerName = document.getElementById('chatRightHeaderName');
  if (headerName) headerName.textContent = CHAT_PAGES[page].title;

  // Clean up page-specific header buttons
  const header = document.getElementById('chatRightHeader');
  if (header) {
    const oldBtn = header.querySelector('.siper-chat-header-btn');
    if (oldBtn) oldBtn.remove();
  }

  const content = document.getElementById('chatContentArea');
  const middle = document.getElementById('chatMiddle');
  if (!content) return;

  content.innerHTML = '';
  content.className = 'siper-content siper-page-enter';
  setTimeout(() => content.classList.remove('siper-page-enter'), 200);

  if (middle) middle.style.display = (page === 'chat') ? '' : 'none';

  switch (page) {
    case 'chat':    renderChatPage(content); break;
    case 'tasks':    renderTasksPageChat(content); break;
    case 'skills':    renderSkillsPageChat(content); break;
    case 'plugins':  renderPluginsPageChat(content); break;
    case 'token':     renderTokenPageChat(content); break;
    case 'global-settings': renderSettingsPageChat(content); break;
    case 'model-settings': renderModelSettingsPageChat(content); break;
    case 'logs':      renderLogsPageChat(content); break;
    case 'monitor':  renderMonitorPageChat(content); break;
  }
}

// ===== Chat Page =====
export function renderChatPage(container, skipSidebar) {
  container.className = 'siper-content siper-chat-mode';
  const hasSession = !!chatSessionId;
  const hasAgent = !!chatCurrentAgent;
  const showInput = hasSession && hasAgent;
  if (!showInput) {
    const headerName = document.getElementById('chatRightHeaderName');
    if (headerName) headerName.textContent = '选择一个 Agent 开始对话';
  } else if (typeof Input.updateChatHeader === 'function') {
    Input.updateChatHeader();
  }
  container.innerHTML = `
    <div class="siper-thinking-panel" id="chatThinkingPanel">
      <div class="siper-thinking-header"><span class="siper-thinking-icon">💭</span><span>正在思考</span></div>
      <div class="siper-thinking-body" id="chatThinkingBody"></div>
    </div>
    <div class="siper-messages" id="chatMessages" aria-live="polite" aria-atomic="false">
      <div class="siper-empty-state" id="chatEmptyState"><div class="siper-empty-state-icon">💬</div><div>通过agent发送消息</div></div>
    </div>
    ${showInput ? `\n    <div class="siper-input-area">
      <div class="siper-input-toolbar">
        <input type="file" id="chatFileInput" multiple class="hidden" onchange="handleChatFileSelect(event)" aria-label="上传文件">
        <button class="siper-attach-btn" onclick="document.getElementById('chatFileInput').click()" title="上传文件">📎</button>
        <div class="siper-model-dropdown" id="chatModelDropdown">
          <button class="siper-model-btn" id="chatModelBtn" onclick="toggleChatModelDropdown()">
            <span class="siper-model-btn-name" id="chatModelBtnName">默认模型</span>
            <span class="siper-model-btn-arrow">▾</span>
          </button>
          <div class="siper-model-menu" id="chatModelMenu"></div>
        </div>
        <div class="siper-ctx-info" id="chatCtxInfo" title="当前会话上下文使用量">
          <span class="siper-ctx-label">上下文</span>
          <span class="siper-ctx-value" id="chatCtxValue">--/--</span>
          <span class="siper-ctx-pct" id="chatCtxPct">--%</span>
        </div>
      </div>
      <div id="chatFilePreviewContainer" class="siper-file-preview-container hidden"></div>
      <div class="siper-input-row">
        <textarea id="chatInput" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="1" aria-label="聊天输入"></textarea>
        <button class="siper-send-btn" id="chatSendBtn" onclick="chatSendMessage()">发送</button>
        <button class="siper-stop-btn hidden" id="chatStopBtn" onclick="chatStopGeneration()" title="停止生成">⏹</button>
      </div>
    </div>` : ''}
  `;
  if (!showInput) {
    // Add "+" button in top-right corner for creating new agent
    const addBtn = document.createElement('button');
    addBtn.className = 'siper-btn js-btn-add-agent';
    addBtn.textContent = '+ 新增智能体';
    addBtn.tabIndex = 0;
    addBtn.onclick = function() { if (typeof window.showAddAgentModal === 'function') window.showAddAgentModal(); };
    container.classList.add('js-pos-relative');
    container.appendChild(addBtn);
  }
  if (showInput) {
    setTimeout(() => Input.bindChatInput(), 0);
    Message.chatLoadSessionMessages(chatSessionId);
  }
  if (!skipSidebar) {
    if (chatAgents.length === 0) {
      // WS 推送 agents 后 renderAgentList 会自动渲染，此处无需操作
    }
    else Sidebar.renderMiddleList();
  }
  Input.loadChatModels();
}

// ===== Page Lifecycle =====
export function onChatPageEnter() { chatSwitchPage('chat', true); }

// ===== New Page Renderers =====

function renderTasksPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="page-header"><h2>📋 任务管理</h2></div><div class="page-body"><div class="empty-state">任务管理功能开发中...</div></div></div>`;
}

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

// Monitor ECharts — mirrors token.js refreshTokenStats chart logic with monitor-prefixed IDs
let _mChartModel = null, _mChartDate = null, _mChartHourly = null, _mChartEfficiency = null, _mChartHeatmap = null;

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

let _mCachedPalette = null;
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

const _mDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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

// ===== Sub-page renderers (delegated to ESM pages) =====
// These are kept here for backward compat with HTML onclick handlers
// The actual logic is in the ESM page modules

function renderSkillsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div id="chatSkillsList"></div>`;
  if (typeof window.refreshSkills === 'function') window.refreshSkills();
}

function renderPluginsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="page-header"><h2>🔌 插件管理</h2></div><div class="page-body"><div class="empty-state">插件管理功能开发中...</div></div></div>`;
}

function renderTokenPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="token-stats" id="chatTokenStats"></div><div class="siper-token-charts-row"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📊 分模型 Token 分布</div><div id="chatChartModel" class="js-chart-box"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⏰ 24小时 Token 分布</div><div id="chatChartHourly" class="js-chart-box"></div></div></div><div class="siper-token-chart-card card-hover" class="js-mt-12"><div class="siper-token-chart-title">📈 每日 Token 趋势</div><div id="chatChartDate" class="js-chart-box"></div></div><div class="siper-token-charts-row" class="js-mt-12"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⚡ 模型效率对比</div><div id="chatChartEfficiency" class="js-chart-box"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📅 活跃时段热力图</div><div id="chatChartHeatmap" class="js-chart-box"></div></div></div>`;
  if (typeof window.refreshTokenStats === 'function') window.refreshTokenStats();
}

function renderSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="siper-page-toolbar js-toolbar-flex-wrap"><div class="siper-settings-tabs" id="settingsTabs"><button class="siper-settings-tab active" data-tab="system" onclick="window.switchSettingsTab('system')">系统参数</button><button class="siper-settings-tab" data-tab="agents" onclick="window.switchSettingsTab('agents')">Agent管理</button></div><div class="js-flex-shrink-0"><button class="siper-btn" onclick="window.resetSystemParams()">重置</button><button class="siper-btn" onclick="window.refreshGlobalSettings()">刷新</button></div></div><div id="chatGlobalSettings"><div id="chatSystemSettings" class="js-hidden"><div class="siper-settings-section"><div class="siper-settings-section-title">运行时</div><div class="siper-settings-row"><label>WS 心跳超时 (秒)</label><input type="number" id="sysWsHeartbeatTimeout" class="siper-input" min="60" max="3600" value="300" aria-label="WS 心跳超时"></div><div class="siper-settings-row"><label>会话列表加载数</label><input type="number" id="sysSessionListLimit" class="siper-input" min="10" max="500" value="50" aria-label="会话列表加载数"></div><div class="siper-settings-row"><label>日志缓冲区大小</label><input type="number" id="sysLogBufferSize" class="siper-input" min="100" max="10000" value="2000" aria-label="日志缓冲区大小"></div><div class="siper-settings-row"><label>Token 记录上限</label><input type="number" id="sysTokenUsageMax" class="siper-input" min="100" max="5000" value="500" aria-label="Token 记录上限"></div><div class="siper-settings-row"><label>上下文窗口默认值</label><input type="number" id="sysCtxWindowDefault" class="siper-input" min="1024" max="1000000" value="8192" aria-label="上下文窗口默认值"></div></div></div></div><div id="chatGlobalAgents" class="js-hidden"><div class="js-header-flex"><div class="siper-settings-section-title js-m-0">智能体管理</div><button class="siper-btn primary js-add-agent-btn" onclick="window.showAddAgentModal()">+ 新增智能体</button></div><div id="globalAgentCards" class="agent-cards-grid"></div><div id="globalAgentCardDetail" class="agent-card-detail" class="js-hidden"></div></div><div id="chatGlobalModels" class="js-hidden"><span id="chatSettingsModelCount" class="text-dim" class="js-text-xs"></span><div id="chatSettingsModelsList"></div></div>`;
  window._currentSettingsTab = 'system';
  // 内联绑定系统参数 auto-save（避免 ESM 跨模块引用 attachSettingsAutoSaveListeners）
  (function(){
    let timer = null;
    const fields = ['sysWsHeartbeatTimeout','sysSessionListLimit','sysLogBufferSize','sysTokenUsageMax','sysCtxWindowDefault','sysPort','sysLogLevel'];
    function doSave(){
      if(timer) clearTimeout(timer);
      timer = setTimeout(async()=>{
        const sys = {
          ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value)||300,
          session_list_limit: parseInt(document.getElementById('sysSessionListLimit').value)||50,
          log_buffer_size: parseInt(document.getElementById('sysLogBufferSize').value)||2000,
          token_usage_max: parseInt(document.getElementById('sysTokenUsageMax').value)||500,
          context_window_default: parseInt(document.getElementById('sysCtxWindowDefault').value)||8192,
          port: parseInt(document.getElementById('sysPort')?.value)||9724,
          log_level: document.getElementById('sysLogLevel')?.value||'INFO',
        };
        try{
          const r = await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:sys})});
          const d = await r.json();
          if(d.success){if(typeof toast!=='undefined'&&toast)toast.success('系统参数已保存',1000);}
          else{if(typeof toast!=='undefined'&&toast)toast.error('保存失败: '+(d.error||'unknown'));}
        }catch(e){if(typeof toast!=='undefined'&&toast)toast.error('保存失败: '+e.message);}
      },500);
    }
    fields.forEach(id=>{
      const el = document.getElementById(id);
      if(el){el.addEventListener('input',doSave);if(el.tagName==='SELECT')el.addEventListener('change',doSave);}
    });
  })();
  // Show system tab content by default
  const sysEl = document.getElementById('chatSystemSettings');
  if (sysEl) sysEl.classList.remove('js-hidden');
  if (typeof window.refreshGlobalSettings === 'function') window.refreshGlobalSettings();
  _populateSettingsFields();
  // Pre-render agents tab
  if (typeof window.renderGlobalAgents === 'function') {
    window.renderGlobalAgents();
  }
}


function _populateSettingsFields() {
  fetch('/api/config').then(r => r.json()).then(data => {
    const sys = data.system || {};
    const fields = { sysWsHeartbeatTimeout: sys.ws_heartbeat_timeout, sysSessionListLimit: sys.session_list_limit, sysLogBufferSize: sys.log_buffer_size, sysTokenUsageMax: sys.token_usage_max, sysCtxWindowDefault: sys.context_window_default };
    for (const [id, val] of Object.entries(fields)) { const el = document.getElementById(id); if (el && val != null) el.value = val; }
  }).catch(() => {});
}

function switchModelTab(tabName) {
  const tabs = document.querySelectorAll('.siper-settings-tab');
  const contents = document.querySelectorAll('.js-model-settings-tab-content');
  tabs.forEach(t => t.classList.remove('active'));
  contents.forEach(c => c.style.display = 'none');
  const activeTab = document.querySelector(`.siper-settings-tab[data-tab="${tabName}"]`);
  const activeContent = document.getElementById(`modelSettingsTab-${tabName}`);
  if (activeTab) activeTab.classList.add('active');
  if (activeContent) activeContent.style.display = '';
}
window.switchModelTab = switchModelTab;

function renderModelSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="siper-settings-tabs">
  <button class="siper-settings-tab active" data-tab="models" onclick="window.switchModelTab('models')">${window.t ? window.t('tabModels') : '模型管理'}</button>
  <button class="siper-settings-tab" data-tab="auxiliary" onclick="window.switchModelTab('auxiliary')">${window.t ? window.t('tabAuxiliary') : '辅助'}</button>
</div>
<div id="modelSettingsTab-models" class="js-model-settings-tab-content">
<div class="js-model-settings-grid">
  <div class="siper-form-card js-form-card">
    <div class="siper-form-title js-form-title">
      <span>可用模型</span>
      <div class="js-spacer"></div>
      <div class="js-search-wrapper">
        <input type="text" id="modelSearchInput" placeholder="搜索模型..." class="siper-input" class="js-input-xs" oninput="window.filterModelsList()">
        <span id="modelSearchClear" onclick="window.clearModelSearch()" class="js-search-clear" title="清空">✕</span>
      </div>
      <div id="capFilterDropdown" class="js-cap-filter-wrap">
        <button id="capFilterBtn" class="siper-input js-cap-filter-btn" onclick="window.toggleCapFilterDropdown()" aria-label="按功能筛选">
          <span id="capFilterLabel">全部功能</span>
        </button>
        <div id="capFilterMenu" class="js-cap-filter-menu">
          <div class="js-cap-filter-options">
            <div class="cap-filter-option" data-cap="chat" onclick="window.selectCapFilter('chat')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 💬对话
            </div>
            <div class="cap-filter-option" data-cap="vision" onclick="window.selectCapFilter('vision')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 👁视觉
            </div>
            <div class="cap-filter-option" data-cap="reasoning" onclick="window.selectCapFilter('reasoning')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🧠推理
            </div>
            <div class="cap-filter-option" data-cap="code" onclick="window.selectCapFilter('code')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 💻代码
            </div>
            <div class="cap-filter-option" data-cap="function_calling" onclick="window.selectCapFilter('function_calling')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🔧工具
            </div>
            <div class="cap-filter-option" data-cap="tts" onclick="window.selectCapFilter('tts')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🔊语音
            </div>
            <div class="cap-filter-option" data-cap="embedding" onclick="window.selectCapFilter('embedding')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 📎嵌入
            </div>
            <div class="cap-filter-option" data-cap="image_gen" onclick="window.selectCapFilter('image_gen')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🎨生图
            </div>
            <div class="cap-filter-option" data-cap="long_context" onclick="window.selectCapFilter('long_context')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 📏长上下文
            </div>
          </div>
          <div class="js-cap-filter-actions">
            <button class="siper-btn" class="js-btn-xs" onclick="window.clearCapFilter()">清除</button>
            <button class="siper-btn primary" class="js-btn-xs" onclick="window.applyCapFilter()">确定</button>
          </div>
        </div>
      </div>
      <div class="js-sort-wrapper">
        <select id="modelSortBy" class="siper-input js-sort-select" onchange="window.filterModelsList()" aria-label="排序">
          <option value="name">按名称</option>
          <option value="ttft">按响应时间</option>
          <option value="latency">按延迟</option>
          <option value="context">按上下文窗口</option>
          <option value="caps">按能力数量</option>
        </select>
        <button id="sortDirBtn" class="siper-input js-sort-dir-btn" onclick="window.toggleSortDir()" title="切换排序方向">↑</button>
      </div>
      <button class="siper-btn primary js-btn-verify-all" onclick="window.verifyAllModels()">验证全部</button>
    </div>
    <div id="settingsModelsList"></div>
  </div>
  <div class="siper-form-card js-form-card-sidebar">
    <div class="siper-form-title">🔍 发现模型</div>
    <div class="js-sort-group">
      <div style="flex:1;">
        <div class="text-dim" class="js-label-sm">Provider</div>
        <select id="providerPreset" class="siper-input" class="js-input-sm" onchange="window.applyProviderPreset()" aria-label="Provider 预设">
          <option value="">— 选择 —</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="deepseek">DeepSeek</option>
          <option value="moonshot">Moonshot</option>
          <option value="qwen">Qwen</option>
          <option value="longcat">LongCat</option>
          <option value="zhipuai">ZhipuAI</option>
          <option value="minimax">MiniMax</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
          <option value="ollama">Ollama</option>
          <option value="custom">自定义</option>
        </select>
      </div>
      <div style="flex:1.5;">
        <div class="text-dim" class="js-label-sm">Base URL</div>
        <input type="text" class="siper-input" id="discoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL" class="js-input-sm">
      </div>
    </div>
    <div class="js-mb-6">
      <div class="text-dim" class="js-label-sm">API Key</div>
      <input type="password" class="siper-input" id="discoverApiKey" placeholder="sk-..." aria-label="发现 API Key" class="js-input-sm">
    </div>
    <div class="js-select-group">
      <button class="siper-btn primary" onclick="window.discoverModels()">获取模型列表</button>
      <div id="discoverFilterWrap" class="js-discover-filter">
        <input type="text" class="siper-input js-input-search" id="discoverFilter" placeholder="筛选模型..." aria-label="筛选发现的模型" oninput="window.chatFilterDiscovered()">
        <button id="discoverFilterClear" onclick="window.chatClearDiscoverFilter()" class="js-model-card-action" title="清空筛选">×</button>
      </div>
    </div>
    <div id="discoverResult" class="js-scroll-flex"></div>
  </div>
</div>
</div>
<div id="modelSettingsTab-auxiliary" class="js-model-settings-tab-content" style="display:none;">
  <div class="siper-form-card">
    <div class="siper-form-title">${window.t ? window.t('auxiliaryTitle') : '🔧 辅助模型'}</div>
    <div class="text-dim" style="margin-bottom:12px;">${window.t ? window.t('auxiliaryDesc') : '辅助模型配置功能开发中，敬请期待...'}</div>
    <div id="auxiliaryModelsContainer"></div>
  </div>
</div>`;
  // Add reset button to chat header
  const header = document.getElementById('chatRightHeader');
  if (header && !header.querySelector('.siper-chat-header-btn')) {
    const btn = document.createElement('button');
    btn.className = 'siper-chat-header-btn siper-chat-header-btn-text';
    btn.textContent = '重置';
    btn.onclick = () => { if (typeof window.resetSettingsModels === 'function') window.resetSettingsModels(); };
    header.appendChild(btn);
  }

  if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
}

function renderLogsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="siper-page-toolbar js-toolbar-logs"><button class="siper-btn" onclick="window.refreshLogs()">刷新</button><button class="siper-btn danger" onclick="window.clearLogs()">清空显示</button><input type="text" id="chatLogSearchInput" placeholder="搜索..." class="siper-input" style="width:140px;" oninput="window.applyLogLogsDebounced()" aria-label="日志搜索"><select id="chatLogLogLevel" class="siper-input" class="js-w-auto" onchange="window.applyChatLogLevelFilter()" aria-label="日志级别"><option value="">全部级别</option><option value="DEBUG">DEBUG</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select><select id="logSourceFilter" class="siper-input" class="js-w-auto" onchange="window.applyLogFilters()" aria-label="日志来源"><option value="">全部来源</option></select><span id="chatLogStats" class="text-dim" class="js-text-xs"></span></div><div id="logLevelFilters" class="js-mb-6"></div><div id="chatLogsList" class="js-code-block"></div><div id="chatLogPagination"></div>`;
  if (typeof window.refreshLogs === 'function') window.refreshLogs();
}

// ===== Copy/Insert Message =====
function copyChatMsg(btn) {
  const row = btn.closest('.siper-msg-row');
  const text = row ? row.dataset.rawText : '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => { if (typeof toast !== 'undefined' && toast) toast.success('已复制'); }).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    if (typeof toast !== 'undefined' && toast) toast.success('已复制');
  });
}

function insertChatMsg(btn) {
  const row = btn.closest('.siper-msg-row');
  const text = row ? row.dataset.rawText : '';
  if (!text) return;
  const input = document.getElementById('chatInput');
  if (input) { input.value = text; input.focus(); if (typeof _adjustInputHeight === 'function') _adjustInputHeight(input); else input.style.height = 'auto'; }
}

// ===== Window Mount =====
// Core chat
window.chatSwitchPage = chatSwitchPage;
window.renderChatPage = renderChatPage;
window.chatSendMessage = Input.chatSendMessage;
window.chatHandleStreamDelta = Stream.chatHandleStreamDelta;
window.chatHandleStreamEnd = Stream.chatHandleStreamEnd;
window.chatStopGeneration = Message.chatStopGeneration;
window.chatClearMessages = Message.chatClearMessages;
window.chatAddMessage = Message.chatAddMessage;
window.chatLoadSessionMessages = Message.chatLoadSessionMessages;
window.bindChatInput = Input.bindChatInput;
window.chatAppendUserMsg = Message.chatAppendUserMsg;
window.chatAppendAgentMsg = Message.chatAppendAgentMsg;
window.chatRenderMarkdown = Message.chatRenderMarkdown;
window.chatEscapeHtml = Message.chatEscapeHtml;
window.fmtTokens = fmtTokens;
window.playNotifySound = Message.playNotifySound;
window.onChatPageEnter = onChatPageEnter;

// File & model
window.handleChatFileSelect = Input.handleChatFileSelect;
window.removeChatFile = Input.removeChatFile;
// openImageLightbox 由 toast.js 统一提供，不再用 Input.openImageLightbox
window.getChatFileCategory = Input.getChatFileCategory;
window.renderChatFilePreviews = Input.renderChatFilePreviews;
window.renderChatModelDropdown = Input.renderChatModelDropdown;
window.closeChatModelDropdown = Input.closeChatModelDropdown;
window.loadChatModels = Input.loadChatModels;
window.updateChatHeader = Input.updateChatHeader;

// DOM utils
window.addMsg = addMsg;
window.appendMeta = appendMeta;
window.debugHighlight = debugHighlight;
window.loadRecentSession = loadSessionHistory;
window.siPerNavigate = siPerNavigate;
window.isSessionUnread = isSessionUnread;
window.chatFmt = fmtTokens;
window.updateCtxInfoDisplay = updateCtxInfoDisplay;
window.updateCtxFromStreamEnd = updateCtxFromStreamEnd;

// Thinking
window.chatThinkingShow = Stream.chatThinkingShow;
window.chatThinkingHide = Stream.chatThinkingHide;
window.chatThinkingClear = Stream.chatThinkingClear;
window.chatThinkingAddToolStep = Stream.chatThinkingAddToolStep;
window.chatThinkingAddTextRow = Stream.chatThinkingAddTextRow;

// Sidebar / sessions
// loadChatAgents / chatLoadAllSessions removed — WS agents push replaces them
window.loadChatAgents = function() { /* deprecated: WS agents push handles this */ };
window.chatLoadAllSessions = function() { /* deprecated: agents include sessions */ };
window.renderMiddleList = Sidebar.renderMiddleList;
window.chatToggleAgent = Sidebar.chatToggleAgent;
window.selectChatSession = Sidebar.selectChatSession;
window.startNewChat = Sidebar.startNewChat;
window.chatHandleSearch = Sidebar.handleChatSearch;
window.chatShowSessionMenu = Sidebar.chatShowSessionMenu;
window.renderChatPage = renderChatPage;
window.chatHideSessionMenu = Sidebar.chatHideSessionMenu;
window.renameChatSession = Sidebar.renameChatSession;
window.deleteChatSessionConfirm = Sidebar.deleteChatSessionConfirm;
window.copyChatSessionId = Sidebar.copyChatSessionId;
window.markSessionUnread = Sidebar.markSessionUnread;
window.clearSessionUnread = Sidebar.clearSessionUnread;
window.selectChatAgent = Sidebar.selectChatAgent;

// Sub-page renderers (for HTML onclick)
window.renderTasksPage = () => {}; // deprecated, ESM handles it
window.renderSkillsPage = () => {};
window.renderTokenPage = () => {};
window.renderSettingsPage = () => {};
window.renderLogsPage = () => {};
window.renderAgentPage = Sidebar.renderAgentPage;
window.renderMemoryPage = () => {
  const container = document.getElementById('chatContentArea');
  if (!container) return;
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
    <div class="siper-page-toolbar">
      <button class="siper-btn primary" onclick="window.saveMemoryMd()">保存记忆</button>
      <button class="siper-btn" onclick="window.refreshMemoryPage()">刷新</button>
    </div>
    <div id="memoryPageContent"></div>
  `;
  if (typeof Memory.populateMemoryAgentSelector === 'function') {
    Memory.populateMemoryAgentSelector().then(() => {
      if (typeof Memory.refreshMemoryPage === 'function') Memory.refreshMemoryPage();
    });
  }
};
window.renderThemePage = () => {
  const container = document.getElementById('chatContentArea');
  if (!container) return;
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
    <div class="siper-form-card">
      <div class="siper-form-title">主题色</div>
      <div id="chatThemeColors" class="js-theme-colors"></div>
    </div>
    <div class="siper-form-card">
      <div class="siper-form-title">主题模板</div>
      <div id="chatThemeTemplates"></div>
    </div>
  `;
  if (typeof Theme.showThemeSettings === 'function') Theme.showThemeSettings();
};

// Sub-page data loaders (legacy names)
window.loadChatTasks = () => {};
window.showChatTaskForm = () => {};
window.hideChatTaskForm = () => {};
window.saveChatTask = () => {};
window.toggleChatTask = () => {};
window.deleteChatTask = () => {};
window.loadChatSkills = () => {};
window.loadChatMemory = () => { if (typeof Memory.refreshMemoryPage === 'function') Memory.refreshMemoryPage(); };
window.saveChatMemory = () => { if (typeof Memory.saveMemoryMd === 'function') Memory.saveMemoryMd(); };
window.loadChatMemoryConfig = () => { if (typeof Memory.refreshMemoryConfig === 'function') Memory.refreshMemoryConfig(); };
window.saveChatMemoryConfig = () => { if (typeof Memory.saveMemoryConfig === 'function') Memory.saveMemoryConfig(); };
window.loadTokenStatsChat = () => {};
window.loadChatThemeTemplates = () => {};
window.applyChatTheme = () => {};
window.loadChatThemeSettings = () => {};
window.setChatThemeColor = () => {};
window.chatRemoveModel = () => {}; // mounted by app.js from Settings
window.chatSaveGlobalModels = () => {}; // mounted by app.js from Settings
window.chatApplyProviderPreset = () => {}; // mounted by app.js from Settings
window.chatDiscoverModels = () => {}; // mounted by app.js from Settings
window.chatAddDiscoveredModel = () => {}; // mounted by app.js from Settings
window.loadChatLogs = () => {};
window.chatRenderLogs = () => {};
window.chatFilterLogs = () => {};
window.clearChatLogs = () => {};

// Language
window.toggleChatLangDropdown = Lang.toggleChatLangDropdown;
window.selectChatLang = Lang.selectChatLang;

// Toast
window.showChatToast = Toast.showChatToast;
window.chatConfirm = Toast.chatConfirm;

// ECharts (legacy)
window.renderChatECharts = () => {};
window.initChatCharts = () => {};

// Copy/Insert
window.copyChatMsg = copyChatMsg;
window.insertChatMsg = insertChatMsg;

// Stop handler
window.chatHandleStopped = Stream.chatHandleStopped;

// Monitor / Tasks page
window.switchMonitorTab = switchMonitorTab;
window.refreshMonitorTab = function() {
  const active = document.querySelector('#monitorTabs .siper-settings-tab.active');
  if (active) switchMonitorTab(active.dataset.tab);
};
window.renderMonitorPerformance = renderMonitorPerformance;
window.renderMonitorDirectory = renderMonitorDirectory;
window.renderTasksPageChat = renderTasksPageChat;
window.renderMonitorPageChat = renderMonitorPageChat;

