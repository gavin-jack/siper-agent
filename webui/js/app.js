// app.js — ESM 入口
// 三模板 SPA: chat(默认) | standalone(懒加载) | sidebar(常驻)
import { connectWS, setConnected, getWs } from './core.js?v=1783954506464';
// expose getWs globally for debugging
window.getWs = getWs;
// -------------------------------------------------
// 初始化：立即建立 WebSocket 连接
// -------------------------------------------------
connectWS();
import { registerAllHandlers } from './renderer.js?v=1783954506464';

// Utils
import { escapeHtml } from './utils/escape.js?v=1783954506464';
import { LANG, t, applyLang, selectLang } from './utils/i18n.js?v=1783954506464';
import { updateThemePaletteTrigger, toggleChatSidebar, toggleThemePalette } from './utils/dom.js?v=1783954506464';
import { apiGet, apiPost } from './utils/api.js?v=1783954506464';
import { toggleChatLangDropdown, selectChatLang } from './chat/lang.js?v=1783954506464';

// Components
import { toast, showConfirm, cancelConfirm, execConfirm, showDictModal, confirmDeleteModel, showInput, cancelInput, execInput, openImageLightbox } from './components/toast.js?v=1783954506464';
import { testModel, verifyGlobalModel, verifyChatModel, initModelTestDelegation } from './components/model-test.js?v=1783954506464';
import * as AgentModels from './components/agent-models.js?v=1783954506464';

// Chat core (must load before DOMContentLoaded)
import * as Chat from './pages/chat-pages/chat.js?v=1783954506464';

// Chat input
import { toggleChatModelDropdown } from './chat/input.js?v=1783954506464';

// Sidebar / UI
import { startNewChat, expandAllAgents } from './chat/sidebar.js?v=1783954506464';
import { newSession } from './chat/session.js?v=1783954506464';

// Template-clone pages (保留全量 import，后续逐步迁移)
import * as Sessions from './pages/sessions.js?v=1783954506464';
import * as Memory from './pages/memory.js?v=1783954506464';
import * as AgentConfig from './pages/agent-config.js?v=1783954506464';
import * as Theme from './pages/theme.js?v=1783954506464';

// ===== Window Global Mounts =====
// Utils
window.escapeHtml = escapeHtml;
window.t = t;
window.applyLang = applyLang;
window.selectLang = selectLang;
window.updateThemePaletteTrigger = updateThemePaletteTrigger;
window.toggleChatSidebar = toggleChatSidebar;
window.toggleThemePalette = toggleThemePalette;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.toggleChatLangDropdown = toggleChatLangDropdown;
window.selectChatLang = selectChatLang;

// Components (mounted by toast.js at import time; app.js does NOT need to redundantly re-mount)
window.testModel = testModel;
window.verifyGlobalModel = verifyGlobalModel;
window.verifyChatModel = verifyChatModel;
window.initModelTestDelegation = initModelTestDelegation;
window.AgentModels = AgentModels;

// Chat / Sidebar
window.toggleChatModelDropdown = toggleChatModelDropdown;
window.startNewChat = startNewChat;
window.newSession = newSession;

// ===== 全局事件监听（sidebar 初始化前注册，始终有效） =====
// hash 丢失恢复守卫：所有独立页面 hash 被清空时自动恢复
window.addEventListener('hashchange', () => {
  const h = location.hash;
  // Swagger UI deep linking 格式: #/tag/operationId（如 #/agents/api_agents_get）
  // 当 hash 被清空（#/ 或 # 或 ''）时恢复为当前独立页面
  if (h === '#/' || h === '#' || h === '') {
    const current = window.__getPageCache?.('current_page');
    if (current && current !== 'chat') {
      history.replaceState(null, '', '#/' + current);
    }
  }
});
// 全局复制按钮 toast：劫持所有 .copy-to-clipboard 按钮
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('.copy-to-clipboard');
  if (btn) {
    requestAnimationFrame(() => {
      if (window.toast) window.toast.success(t('apiDocs.copied'), 1500);
    });
  }
}, true);

// Template-clone page functions
window.showAddAgentModal = AgentConfig.showAddAgentModal;
// Theme
window.renderTemplateList = Theme.renderTemplateList;
window.saveThemeTemplate = Theme.saveThemeTemplate;
window.exportTheme = Theme.exportTheme;
window.importTheme = Theme.importTheme;
window.resetTheme = Theme.resetTheme;

window.refreshSessions = () => {};
window.refreshMemoryPage = () => {};

// page_cache 基础设施
import { initPageCache } from './page-cache.js?v=1783954506464';
initPageCache();

// Template-clone pages 已全量加载，直接映射
const PAGE_TEMPLATE = {
  'sessions': Sessions,
  'memory': Memory,
  'agent-config': AgentConfig,
  'theme': Theme,
};

// 页面名 → 渲染函数名 映射
const PAGE_RENDER_FN = {
  'tasks':     'renderTasksPageChat',
  'skills':    'renderSkillsPageChat',
  'plugins':  'renderPluginsPageChat',
  'token':     'renderTokenPageChat',
  'settings': 'renderSettingsPageChat',
  'global-settings': 'renderSettingsPageChat',
  'model-settings': 'renderModelSettingsPageChat',
  'logs':      'renderLogsPageChat',
  'monitor':  'renderMonitorPageChat',
  'tools':     'renderToolsPage',
  'directory': 'renderDirectoryPageChat',
  'api-docs':   'renderApiDocsPageChat',
  'sessions': 'renderSessions',
  'memory':    'renderMemoryContent',
  'agent-config': 'showAddAgentModal',
  'theme':  'showThemeSettings',
};

// ===== 动态页面模块加载器 =====
// 2026-06-18: 增加 MutationObserver 防抖 + data-localized 标记避免重复翻译
const _PAGE_CACHE_VER = 1783954506464;
const _pageModCache = {};
async function _loadPageModule(page) {
  if (_pageModCache[page]) return _pageModCache[page];
  _pageModCache[page] = await import(`./pages/chat-pages/${page}.js?v=${_PAGE_CACHE_VER}`);
  return _pageModCache[page];
}

// 按需加载的页面：页面名 → Promise<module>
const PAGE_LAZY_LOADER = {
  'tasks': () => _loadPageModule('tasks'),
  'skills': () => _loadPageModule('skills'),
  'plugins': () => _loadPageModule('plugins'),
  'token': () => _loadPageModule('token'),
  'settings': () => _loadPageModule('settings'),
  'global-settings': () => _loadPageModule('settings'),
  'model-settings': () => _loadPageModule('model-settings'),
  'logs': () => _loadPageModule('logs'),
  'monitor': () => _loadPageModule('monitor'),
  'tools': () => _loadPageModule('tools'),
  'directory': () => _loadPageModule('directory'),
  'api-docs': () => _loadPageModule('api-docs'),
};

// ===== CSS 按需加载 =====
// 幂等：已存在则不重复加载，避免每次切换页面都重新下载 CSS
function loadCss(href) {
  // 去掉 query string 匹配（旧 link 可能带 ?v=xxx）
  const baseHref = href.split('?')[0];
  const exists = document.querySelector('link[href^="' + baseHref + '"]');
  if (exists) return; // 已加载，跳过
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

// 页面→模板函数名映射
const PAGE_TPL_FN = {
  'sessions': '_tplSessionsPage',
  'memory': '_tplMemoryPage',
  'agent-config': '_tplAgentConfigPage',
  'theme': '_tplThemePage',
};

// 页面→需挂载的 window 函数列表
const PAGE_MOUNT_FN = {
  'agent-config': ['loadAgentSettings', 'saveAgentSettings', 'refreshConfigAgentPanel', 'switchConfigAgentPageTab', 'selectConfigAgent'],
  'sessions': ['renderSessions'],
  'memory': ['renderMemoryContent'],
  'model-settings': ['switchModelTab', 'applyProviderPreset', 'discoverModels', 'addSelectedDiscoveredModels', 'addAllDiscoveredModels', 'chatFilterDiscovered', 'chatClearDiscoverFilter', 'loadSettingsModels', 'filterModelsList', 'clearModelSearch', 'toggleCapFilterDropdown', 'selectCapFilter', 'clearCapFilter', 'applyCapFilter', 'toggleSortDir', 'verifyAllModels', 'verifySingleModel', 'removeSettingsModel', 'removeSettingsModelByName', 'resetSettingsModels', 'renderSettingsModelsList', 'clearModelFilter', 'editProviderName', 'copyModelName', 'autoSaveModels'],
  'monitor': ['switchMonitorTab'],
  'settings': ['switchSettingsTab', 'resetSystemParams', 'refreshGlobalSettings'],
  'global-settings': ['switchSettingsTab', 'resetSystemParams', 'refreshGlobalSettings'],
};

// 页面→tab切换函数名
const PAGE_TAB_FN = {
  'monitor': 'switchMonitorTab',
  'model-settings': 'switchModelTab',
  'settings': 'switchSettingsTab',
};

// 获取 WebSocket 连接并发送消息
function send(payload) {
  try {
    const ws = (typeof getWs === 'function') ? getWs() : (window.__ws || null);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  } catch(e) {}
}

async function navigateToPage(page, tab) {
  history.replaceState(null, '', '#/' + page + (tab ? '?tab=' + tab : ''));
  window.__setPageCache?.('current_page', page);
  document.querySelectorAll('.siper-nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));

  if (page === 'chat') {
    document.getElementById('page-chat').style.display = 'flex';
    document.getElementById('page-standalone').style.display = 'none';
    document.getElementById('chatSidebar').style.display = '';
    loadCss('/css/chat.css');
    window.initChatPage?.();
    return;
  }

  const container = document.getElementById('page-standalone');
  container.style.display = 'flex';
  document.getElementById('page-chat').style.display = 'none';
  document.getElementById('chatSidebar').style.display = '';
  loadCss('/css/page.css');
  if (page === 'api-docs') loadCss('/css/api-docs.css');

  try {
    // 渲染模板
    const tplFn = PAGE_TPL_FN[page];
    if (PAGE_TEMPLATE[page] && tplFn && PAGE_TEMPLATE[page][tplFn]) {
      container.innerHTML = PAGE_TEMPLATE[page][tplFn]();
    } else if (!PAGE_TEMPLATE[page]) {
      container.innerHTML = '<div class="siper-loading">加载中...</div>';
    }

    // 获取模块
    let mod;
    if (PAGE_TEMPLATE[page]) mod = PAGE_TEMPLATE[page];
    else if (PAGE_LAZY_LOADER[page]) mod = await PAGE_LAZY_LOADER[page]();
    else return;

    // 调用渲染函数
    const fnName = PAGE_RENDER_FN[page];
    if (fnName && mod[fnName]) await mod[fnName](container);

    // 挂载页面函数到 window
    const mountFns = PAGE_MOUNT_FN[page];
    if (mountFns) for (const fn of mountFns) if (mod[fn]) window[fn] = mod[fn];

    // 切换tab
    if (tab && PAGE_TAB_FN[page]) {
      setTimeout(() => window[PAGE_TAB_FN[page]]?.(tab), 60);
    }

    // 通知后端
    send({ type: 'navigate', page, tab: tab || '' });
  } catch(e) {
    console.error('[app.js] navigateToPage failed:', e);
    container.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(e.message) + '</div>';
  }
}
window.navigateToPage = navigateToPage;

// ===== 注册所有 renderer handlers =====
registerAllHandlers();

// ===== Hash-based SPA routing =====
function parseHash(hashStr) {
  const raw = hashStr.replace('#/', '').replace('#', '');
  if (!raw) return { page: '', tab: null };
  const [page, query] = raw.split('?');
  return { page, tab: query ? query.replace('tab=', '') : null };
}

function initRouter() {
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) {
      const theme = JSON.parse(saved);
      if (theme._preset) updateThemePaletteTrigger(theme._preset);
    }
  } catch(e) {}
  // 渲染常驻侧边栏
  if (typeof window.initSidebar === 'function') {
    window.initSidebar();
  }

  const { page: hashPage, tab: hashTab } = parseHash(location.hash);
  if (hashPage && hashPage !== 'chat') {
    navigateToPage(hashPage, hashTab);
  } else {
    document.getElementById('page-chat').style.display = 'flex';
    document.getElementById('page-standalone').style.display = 'none';
    loadCss('/css/chat.css');
    if (typeof window.initChatPage === 'function') {
      window.initChatPage();
    }
  }
  // Init Mermaid
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', fontFamily: 'inherit' });
  }
  // Init model test delegation
  if (typeof initModelTestDelegation === 'function') {
    initModelTestDelegation(
      typeof verifyChatModel === 'function' ? verifyChatModel : null,
      typeof verifyGlobalModel === 'function' ? verifyGlobalModel : null
    );
  }
  // Hash-based routing: listen for hash changes (browser back/forward)
  window.addEventListener('hashchange', function() {
    const { page, tab } = parseHash(location.hash);
    if (page && page !== 'chat') {
      navigateToPage(page, tab);
    } else if (page === 'chat') {
      navigateToPage('chat');
    }
  });
}

// ===== Error Diagnostics =====
window.__siper_errors = [];
const _origConsoleError = console.error;
console.error = function(...args) {
  window.__siper_errors.push({ type: 'console.error', msg: args.map(String).join(' '), time: Date.now() });
  _origConsoleError.apply(console, args);
};
window.addEventListener('error', function(e) {
  window.__siper_errors.push({ type: 'uncaught', msg: e.message, source: e.filename + ':' + e.lineno, time: Date.now() });
});
window.addEventListener('unhandledrejection', function(e) {
  window.__siper_errors.push({ type: 'unhandledrejection', msg: String(e.reason), time: Date.now() });
});

// ===== Keyboard Accessibility =====
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var btn = e.target.closest('button[onclick], [role="button"][onclick]');
  if (!btn) return;
  if (e.key === ' ') e.preventDefault();
  btn.click();
});

// ===== Boot =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _safeInitRouter);
} else {
  _safeInitRouter();
}

function _safeInitRouter() {
  try {
    initRouter();
  } catch(e) {
    console.error('[app.js] initRouter failed:', e.message);
    document.body.innerHTML = '<div class="js-error-lg">⚠️ 页面初始化失败: ' + e.message + '<br><br><button onclick="location.reload()" class="js-btn-lg">重试</button></div>';
  }
}