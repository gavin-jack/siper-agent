// app.js — ESM 入口
// 三模板 SPA: chat(默认) | standalone(懒加载) | sidebar(常驻)
import { connectWS, setConnected, getWs } from './core.js?v=1783612457431';
// expose getWs globally for debugging
window.getWs = getWs;
// -------------------------------------------------
// 初始化：立即建立 WebSocket 连接
// -------------------------------------------------
connectWS();
import { registerAllHandlers } from './renderer.js?v=1783612457431';

// Utils
import { escapeHtml } from './utils/escape.js?v=1783612457431';
import { LANG, t, applyLang, selectLang } from './utils/i18n.js?v=1783612457431';
import { updateThemePaletteTrigger, toggleChatSidebar, toggleThemePalette } from './utils/dom.js?v=1783612457431';
import { apiGet, apiPost } from './utils/api.js?v=1783612457431';
import { toggleChatLangDropdown, selectChatLang } from './chat/lang.js?v=1783612457431';

// Components
import { toast, showConfirm, cancelConfirm, execConfirm, showDictModal, confirmDeleteModel, showInput, cancelInput, execInput, openImageLightbox } from './components/toast.js?v=1783612457431';
import { testModel, verifyGlobalModel, verifyChatModel, initModelTestDelegation } from './components/model-test.js?v=1783612457431';
import * as AgentModels from './components/agent-models.js?v=1783612457431';

// Chat core (must load before DOMContentLoaded)
import * as Chat from './pages/chat-pages/chat.js?v=1783612457431';

// Chat input
import { toggleChatModelDropdown } from './chat/input.js?v=1783612457431';

// Sidebar / UI
import { startNewChat, expandAllAgents } from './chat/sidebar.js?v=1783612457431';
import { newSession } from './chat/session.js?v=1783612457431';

// Template-clone pages (保留全量 import，后续逐步迁移)
import * as Sessions from './pages/sessions.js?v=1783612457431';
import * as Memory from './pages/memory.js?v=1783612457431';
import * as AgentConfig from './pages/agent-config.js?v=1783612457431';
import * as Theme from './pages/theme.js?v=1783612457431';

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
import { initPageCache } from './page-cache.js?v=1783612457431';
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
const _PAGE_CACHE_VER = 1783612457431;
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

async function navigateToPage(page, tab) {
  // Ensure URL hash always reflects target page (including chat)
  const hash = '#/' + page + (tab ? '?tab=' + tab : '');
  if (location.hash !== hash) {
      history.replaceState(null, '', hash);
  }
  // 记录当前页面（供 hash 守卫恢复用）
  if (window.__setPageCache) window.__setPageCache('current_page', page);
  // 更新侧边栏 active 状态
  document.querySelectorAll('.siper-nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-page') === page);
  });

  // Chat 页面 — 显示中栏+右栏，隐藏独立页面
  if (page === 'chat') {
    document.getElementById('page-chat').style.display = 'flex';
    document.getElementById('page-standalone').style.display = 'none';
    document.getElementById('chatSidebar').style.display = '';
    loadCss('/css/chat.css');
    if (typeof window.initChatPage === 'function') {
      window.initChatPage();
    }
    return;
  }

  // 独立页面 — 隐藏中栏+右栏，侧边栏保持显示
  const container = document.getElementById('page-standalone');
  container.style.display = 'flex';
  document.getElementById('page-chat').style.display = 'none';
  document.getElementById('chatSidebar').style.display = '';
  loadCss('/css/page.css');
  if (page === 'api-docs') loadCss('/css/api-docs.css');
  try {
    // Template-clone pages: 先创建模板 DOM（模板函数在各模块的 _tplXxxPage() 中）
    if (PAGE_TEMPLATE[page] && typeof PAGE_TEMPLATE[page]._tplSessionsPage === 'function') {
      container.innerHTML = PAGE_TEMPLATE[page]._tplSessionsPage();
    } else if (PAGE_TEMPLATE[page] && typeof PAGE_TEMPLATE[page]._tplMemoryPage === 'function') {
      container.innerHTML = PAGE_TEMPLATE[page]._tplMemoryPage();
    } else if (PAGE_TEMPLATE[page] && typeof PAGE_TEMPLATE[page]._tplAgentConfigPage === 'function') {
      container.innerHTML = PAGE_TEMPLATE[page]._tplAgentConfigPage();
    } else if (PAGE_TEMPLATE[page] && typeof PAGE_TEMPLATE[page]._tplThemePage === 'function') {
      container.innerHTML = PAGE_TEMPLATE[page]._tplThemePage();
    } else if (!PAGE_TEMPLATE[page]) {
      container.innerHTML = '<div class="siper-loading">加载中...</div>';
    }

    // 获取模块（全量 import，直接取模块对象）
    let mod;
    if (PAGE_TEMPLATE[page]) {
      mod = PAGE_TEMPLATE[page];
    } else if (PAGE_LAZY_LOADER[page]) {
      mod = await PAGE_LAZY_LOADER[page]();
    } else {
      return;
    }

    // 调用渲染函数
    const fnName = PAGE_RENDER_FN[page];
    if (fnName && typeof mod[fnName] === 'function') {
      await mod[fnName](container);
    }

    // 挂载页面特有的全局函数（供 HTML onclick 调用）
    if (page === 'agent-config' && typeof mod.loadAgentSettings === 'function') {
      window.loadAgentSettings = mod.loadAgentSettings;
      window.saveAgentSettings = mod.saveAgentSettings;
      window.refreshConfigAgentPanel = mod.refreshConfigAgentPanel;
      window.switchConfigAgentPageTab = mod.switchConfigAgentPageTab;
      window.selectConfigAgent = mod.selectConfigAgent;
    }
    // 模板克隆页面 — 挂载需要的函数到 window
    if (page === 'sessions' && typeof mod.renderSessions === 'function') {
      window.renderSessions = mod.renderSessions;
    }
    if (page === 'memory' && typeof mod.renderMemoryContent === 'function') {
      window.renderMemoryContent = mod.renderMemoryContent;
    }
    if (page === 'model-settings' && typeof mod.switchModelTab === 'function') {
      window.switchModelTab = mod.switchModelTab;
      window.applyProviderPreset = mod.applyProviderPreset;
      window.discoverModels = mod.discoverModels;
      window.addSelectedDiscoveredModels = mod.addSelectedDiscoveredModels;
      window.addAllDiscoveredModels = mod.addAllDiscoveredModels;
      window.chatFilterDiscovered = mod.chatFilterDiscovered;
      window.chatClearDiscoverFilter = mod.chatClearDiscoverFilter;
      window.loadSettingsModels = mod.loadSettingsModels;
      window.filterModelsList = mod.filterModelsList;
      window.clearModelSearch = mod.clearModelSearch;
      window.toggleCapFilterDropdown = mod.toggleCapFilterDropdown;
      window.selectCapFilter = mod.selectCapFilter;
      window.clearCapFilter = mod.clearCapFilter;
      window.applyCapFilter = mod.applyCapFilter;
      window.toggleSortDir = mod.toggleSortDir;
      window.verifyAllModels = mod.verifyAllModels;
      window.verifySingleModel = mod.verifySingleModel;
      window.removeSettingsModel = mod.removeSettingsModel;
      window.removeSettingsModelByName = mod.removeSettingsModelByName;
      window.resetSettingsModels = mod.resetSettingsModels;
      window.renderSettingsModelsList = mod.renderSettingsModelsList;
      window.clearModelFilter = mod.clearModelFilter;
      window.editProviderName = mod.editProviderName;
      window.copyModelName = mod.copyModelName;
      window.autoSaveModels = mod.autoSaveModels;
    }
    if (page === 'monitor' && typeof mod.switchMonitorTab === 'function') {
      window.switchMonitorTab = mod.switchMonitorTab;
    }
    if ((page === 'settings' || page === 'global-settings') && typeof mod.switchSettingsTab === 'function') {
      window.switchSettingsTab = mod.switchSettingsTab;
      window.resetSystemParams = mod.resetSystemParams;
      window.refreshGlobalSettings = mod.refreshGlobalSettings;
    }

    // 切换到指定 tab（如果有）
    if (tab) {
      if (page === 'monitor' && typeof window.switchMonitorTab === 'function') {
        setTimeout(() => window.switchMonitorTab(tab), 60);
      } else if (page === 'model-settings' && typeof window.switchModelTab === 'function') {
        setTimeout(() => window.switchModelTab(tab), 60);
      } else if (page === 'settings' && typeof window.switchSettingsTab === 'function') {
        setTimeout(() => window.switchSettingsTab(tab), 60);
      }
    }

    // 通知后端页面切换（后端推送页面数据到 page_cache）
    try {
      var _ws = typeof getWs === 'function' ? getWs() : (window.__ws || null);
      if (_ws && _ws.readyState === 1) {
        _ws.send(JSON.stringify({type: 'navigate', page: page, tab: tab || ''}));
      }
    } catch(e) {}

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