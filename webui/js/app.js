// app.js — ESM 入口
// 三模板 SPA: chat(默认) | standalone(懒加载) | sidebar(常驻)
import { connectWS, setConnected, getWs } from './core.js';
import { registerAllHandlers } from './renderer.js';

// Utils
import { escapeHtml } from './utils/escape.js';
import { LANG, t, applyLang, selectLang } from './utils/i18n.js';
import { updateThemePaletteTrigger, toggleChatSidebar, toggleThemePalette } from './utils/dom.js';
import { apiGet, apiPost } from './utils/api.js';
import { toggleChatLangDropdown, selectChatLang } from './chat/lang.js';

// Components
import { toast, showConfirm, cancelConfirm, execConfirm, showDictModal, confirmDeleteModel, showInput, cancelInput, execInput, openImageLightbox } from './components/toast.js';
import { testModel, verifyGlobalModel, verifyChatModel, initModelTestDelegation } from './components/model-test.js';
import * as AgentModels from './components/agent-models.js';

// Chat core (must load before DOMContentLoaded)
import * as Chat from './pages/chat-pages/chat.js';

// Chat input
import { toggleChatModelDropdown } from './chat/input.js';

// Sidebar / UI
import { startNewChat } from './chat/sidebar.js';
import { newSession } from './chat/session.js';

// Template-clone pages (保留全量 import，后续逐步迁移)
import * as Sessions from './pages/sessions.js';
import * as Memory from './pages/memory.js';
import * as AgentConfig from './pages/agent-config.js';
import * as Theme from './pages/theme.js';

// Chat-pages (全量 import 避免 ESM 缓存导致动态 import 失败)
import * as Tasks from './pages/chat-pages/tasks.js';
import * as Skills from './pages/chat-pages/skills.js';
import * as Plugins from './pages/chat-pages/plugins.js';
import * as Token from './pages/chat-pages/token.js';
import * as Settings from './pages/chat-pages/settings.js';
import * as ModelSettings from './pages/chat-pages/model-settings.js';
import * as Logs from './pages/chat-pages/logs.js';
import * as Monitor from './pages/chat-pages/monitor.js';
import * as Tools from './pages/chat-pages/tools.js';
import * as Directory from './pages/chat-pages/directory.js';
import * as ApiDocs from './pages/chat-pages/api-docs.js';

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

// Components
window.toast = toast;
window.showConfirm = showConfirm;
window.cancelConfirm = cancelConfirm;
window.execConfirm = execConfirm;
window.showDictModal = showDictModal;
window.confirmDeleteModel = confirmDeleteModel;
window.showInput = showInput;
window.cancelInput = cancelInput;
window.execInput = execInput;
window.openImageLightbox = openImageLightbox;
window.testModel = testModel;
window.verifyGlobalModel = verifyGlobalModel;
window.verifyChatModel = verifyChatModel;
window.initModelTestDelegation = initModelTestDelegation;
window.AgentModels = AgentModels;

// Chat / Sidebar
window.toggleChatModelDropdown = toggleChatModelDropdown;
window.startNewChat = startNewChat;
window.newSession = newSession;

// Template-clone page functions
window.showAddAgentModal = AgentConfig.showAddAgentModal;
window.switchConfigAgentPageTab = AgentConfig.switchConfigAgentPageTab;
window.switchChatAgentTab = AgentConfig.switchChatAgentTab;
window.toggleIconPicker = AgentConfig.toggleIconPicker;
window.saveAgentFile = AgentConfig.saveChatAgentFile;
window.resetAgentLimits = AgentConfig.resetAgentLimits;
window.saveAllChatAgentConfig = AgentConfig.saveAllChatAgentConfig;
window.renderTemplateList = Theme.renderTemplateList;
window.saveThemeTemplate = Theme.saveThemeTemplate;
window.exportTheme = Theme.exportTheme;
window.importTheme = Theme.importTheme;
window.resetTheme = Theme.resetTheme;

window.refreshSessions = () => {};
window.refreshMemoryPage = () => {};

// ===== page_cache 基础设施 =====
// page_cache 数据存储（由 renderer.js 的 page_cache handler 填充）
window.__pageCacheData = {};
// 页面回调注册表：pageName → function(data) 新数据到达时自动调用
window.__pageCacheCallbacks = {};
// 获取指定页面的缓存数据
window.__getPageCache = function(page) {
    return window.__pageCacheData && window.__pageCacheData[page];
};
// 注册页面缓存更新回调（页面模块调用，新数据到达时自动刷新）
window.__onPageCacheRegister = function(page, callback) {
    if (window.__pageCacheCallbacks) {
        window.__pageCacheCallbacks[page] = callback;
    }
};
// 页面缓存更新入口（renderer.js 调用，分发到各页面回调）
window.__onPageCacheUpdate = function(page, data) {
    if (window.__pageCacheData) {
        window.__pageCacheData[page] = data;
    }
    // 如果页面注册了回调，自动触发刷新
    if (window.__pageCacheCallbacks && window.__pageCacheCallbacks[page]) {
        try { window.__pageCacheCallbacks[page](data); }
        catch(e) { console.error('[app] page_cache callback failed for ' + page + ':', e); }
    }
};

// ===== 懒加载映射：页面名 → () => import(模块) =====
function tplSessions() {
  return `<div class="page-header">
    <h2 data-i18n="sessions.title">会话管理</h2>
    <div class="actions">
      <button class="btn-sm primary" onclick="newSession()" data-i18n="sessions.new">+ 新会话</button>
      <button class="btn-sm" onclick="refreshSessions()" data-i18n="sessions.refresh">刷新</button>
    </div>
  </div>
  <div class="page-body page-body-flex">
    <div class="session-list" id="sessionsList"></div>
    <div class="session-preview" id="sessionPreview">
      <div class="empty-state" data-i18n="sessions.selectPrompt">← 点击会话查看消息</div>
    </div>
  </div>`;
}

function tplMemory() {
  return `<div class="page-header">
    <h2 data-i18n="memory.title">记忆管理</h2>
    <div class="actions flex-align-8">
      <select id="memoryAgentSelector" onchange="onMemoryAgentChange(this.value)" class="select-input select-wide" aria-label="记忆智能体">
        <option value="" data-i18n="memory.selectAgent">选择智能体...</option>
      </select>
      <button class="btn-sm" onclick="refreshMemoryPage()" data-i18n="memory.refresh">刷新</button>
      <button class="btn-sm primary" onclick="saveMemoryMd()" data-i18n="memory.save">保存记忆</button>
      <button class="btn-sm primary" onclick="saveMemoryConfig()" data-i18n="memory.saveConfig">保存配置</button>
    </div>
  </div>
  <div class="memory-grid">
    <div class="memory-file-section">
      <div class="section-header">
        <span class="model-badge badge-accent2">memory.md</span>
        <span data-i18n="memory.mdFile">记忆文件</span>
        <span id="memoryAgentLabel" class="text-muted-small"></span>
      </div>
      <textarea class="agent-file-editor code-editor-flex" id="memoryMdEditor" placeholder="加载中..." aria-label="记忆内容编辑器"></textarea>
    </div>
    <div class="memory-config-section">
      <div class="section-header">
        <span class="model-badge badge-green" data-i18n="memory.integration">记忆整合</span>
        <span data-i18n="memory.integrationTitle">记忆整合进提示词的方式</span>
      </div>
      <div class="config-grid">
        <div class="setting-label" data-i18n="memory.mode">整合模式</div>
        <select id="memMode" class="select-input">
          <option value="append" data-i18n="memory.modeAppend">追加到系统提示词后</option>
          <option value="prepend" data-i18n="memory.modePrepend">插入到系统提示词前</option>
          <option value="system" data-i18n="memory.modeSystem">替换系统提示词</option>
          <option value="none" data-i18n="memory.modeNone">不整合（仅手动引用）</option>
        </select>
        <div class="setting-label" data-i18n="memory.maxTokens">最大 Token 数</div>
        <input type="number" id="memMaxTokens" class="select-input" value="2000" min="100" max="10000" aria-label="最大 Token 数">
        <div class="setting-label" data-i18n="memory.template">提示词模板</div>
        <textarea id="memTemplate" rows="3" class="code-input" placeholder="提示词模板">{memory}</textarea>
        <div class="section-label" data-i18n="memory.preview">预览效果</div>
        <div id="memPreview" class="preview-box"></div>
      </div>
      <button class="btn-sm" onclick="showConfirm({title:'重置记忆配置',msg:'确定要重置记忆配置为默认值吗？',okText:'重置',onConfirm:resetMemoryConfig})" data-i18n="memory.resetConfig">重置</button>
    </div>
  </div>`;
}

function tplAgentConfig() {
  return `<div class="page-header">
    <h2 data-i18n="agentConfig.title">智能体配置</h2>
    <div class="actions">
      <button class="btn-sm primary" onclick="navigateToPage('chat')" data-i18n="agentConfig.backToChat">← 返回对话</button>
    </div>
  </div>
  <div id="agentConfigContent">
    <div id="agentSelector" class="agent-selector"></div>
    <div id="agentConfigTitle" class="agent-config-title"></div>
    <div class="agent-tabs">
      <button class="agent-tab active" data-tab="about" id="agentTabAbout" onclick="switchConfigAgentPageTab('about')">关于</button>
      <button class="agent-tab" data-tab="files" id="agentTabFiles" onclick="switchConfigAgentPageTab('files')">属性文件</button>
      <button class="agent-tab" data-tab="memory" id="agentTabMemory" onclick="switchConfigAgentPageTab('memory')">记忆</button>
      <button class="agent-tab" data-tab="limits" onclick="switchConfigAgentPageTab('limits')">限制</button>
      <button class="agent-tab" data-tab="models" onclick="switchConfigAgentPageTab('models')">模型</button>
      <button class="agent-tab" data-tab="avatar" onclick="switchConfigAgentPageTab('avatar')">头像</button>
    </div>
    <div class="agent-tab-content active" id="agentTabContentAbout"></div>
    <div class="agent-tab-content" id="agentTabContentFiles"></div>
    <div class="agent-tab-content" id="agentTabContentMemory"></div>
    <div class="agent-tab-content" id="tab-limits"></div>
    <div class="agent-tab-content" id="tab-models"></div>
    <div class="agent-tab-content" id="tab-avatar"></div>
    <div class="agent-config-footer">
      <button class="btn-sm" id="cfgAgentDeleteBtn" onclick="if(typeof confirmDeleteAgent==='function'&&currentConfigAgent)confirmDeleteAgent(currentConfigAgent)" data-i18n="agentConfig.deleteAgent">删除智能体</button>
      <button class="btn-sm primary" onclick="saveAllChatAgentConfig()" data-i18n="agentConfig.saveAll">保存全部</button>
    </div>
  </div>
  <div id="iconPickerPopup" class="icon-picker-popup hidden"></div>`;
}

function tplTheme() {
  return `<div class="page-header">
    <h2 data-i18n="theme.title">外观设置</h2>
    <div class="actions">
      <button class="btn-sm theme-reset-btn" onclick="resetTheme()" data-i18n="theme.reset">重置默认</button>
      <button class="btn-sm" onclick="exportTheme()" data-i18n="theme.export">导出</button>
      <button class="btn-sm" onclick="importTheme()" data-i18n="theme.import">导入</button>
    </div>
  </div>
  <div class="theme-settings-content">
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.preset">预设主题</div>
      <div id="themePresetBar" class="theme-preset-bar"></div>
    </div>
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.customColors">自定义颜色</div>
      <div id="themeCustomColors" class="color-grid"></div>
    </div>
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.sizeSettings">尺寸设置</div>
      <div id="themeSizeSettings" class="size-settings"></div>
    </div>
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.templates">主题模板</div>
      <div class="template-controls">
        <input type="text" id="templateName" class="select-input" placeholder="模板名称" aria-label="主题模板名称">
        <button class="btn-sm primary" onclick="saveThemeTemplate()" data-i18n="theme.saveTemplate">保存模板</button>
        <button class="btn-sm" onclick="renderTemplateList()" data-i18n="theme.refreshTemplates">刷新</button>
      </div>
      <div id="themeTemplateList" class="template-list"></div>
    </div>
  </div>`;
}

// ===== 懒加载映射：页面名 → 模块对象（全量 import，无需动态 import） =====
const PAGE_LAZY = {
  'tasks':     Tasks,
  'skills':    Skills,
  'plugins':  Plugins,
  'token':     Token,
  'settings': Settings,
  'global-settings': Settings,
  'model-settings': ModelSettings,
  'logs':      Logs,
  'monitor':  Monitor,
  'tools':     Tools,
  'directory': Directory,
  'api-docs':   ApiDocs,
};

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

// ===== CSS 按需加载 =====
const _loadedCss = new Set();
function loadCss(href) {
  if (_loadedCss.has(href)) return;
  _loadedCss.add(href);
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
  // 更新侧边栏 active 状态
  document.querySelectorAll('.siper-nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-page') === page);
  });

  // Chat 页面 — 显示中栏+右栏，隐藏独立页面
  if (page === 'chat') {
    document.getElementById('page-chat').style.display = 'flex';
    document.getElementById('page-standalone').style.display = 'none';
    document.getElementById('sidebarContainer').style.display = '';
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
  document.getElementById('sidebarContainer').style.display = '';
  loadCss('/css/page.css');

  try {
    // Template-clone pages: 先创建模板 DOM
    if (PAGE_TEMPLATE[page]) {
      const tplMap = { 'sessions': tplSessions, 'memory': tplMemory, 'agent-config': tplAgentConfig, 'theme': tplTheme };
      container.innerHTML = tplMap[page] ? tplMap[page]() : '';
    } else {
      container.innerHTML = '<div class="empty-state">加载中...</div>';
    }

    // 获取模块（全量 import，直接取模块对象）
    let mod;
    if (PAGE_TEMPLATE[page]) {
      mod = PAGE_TEMPLATE[page];
    } else if (PAGE_LAZY[page]) {
      mod = PAGE_LAZY[page];
    } else {
      return;
    }

    // 调用渲染函数
    const fnName = PAGE_RENDER_FN[page];
    if (fnName && typeof mod[fnName] === 'function') {
      mod[fnName](container);
    }

    // 挂载页面特有的全局函数（供 HTML onclick 调用）
    if (page === 'agent-config' && typeof mod.loadAgentSettings === 'function') {
      window.loadAgentSettings = mod.loadAgentSettings;
      window.saveAgentSettings = mod.saveAgentSettings;
      window.refreshConfigAgentPanel = mod.refreshConfigAgentPanel;
      window.switchConfigAgentPageTab = mod.switchConfigAgentPageTab;
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
      window.addDiscoveredModel = mod.addDiscoveredModel;
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

// 提前挂载 agent-config 函数（selectChatAgent 在侧边栏中直接调用，不经过 navigateToPage）
window.loadAgentSettings = AgentConfig.loadAgentSettings;
window.saveAgentSettings = AgentConfig.saveAgentSettings;
window.selectConfigAgent = AgentConfig.selectConfigAgent;
window.refreshConfigAgentPanel = AgentConfig.refreshConfigAgentPanel;
window.switchConfigAgentPageTab = AgentConfig.switchConfigAgentPageTab;
window.loadAgentMemoryContent = AgentConfig.loadAgentMemoryContent;
window.saveAgentFile = AgentConfig.saveAgentFile;
window.uploadAgentAvatar = AgentConfig.uploadAgentAvatar;
window.triggerAgentAutoSave = AgentConfig.triggerAgentAutoSave;
window.attachAgentAutoSaveListeners = AgentConfig.attachAgentAutoSaveListeners;
window.resetAgentLimits = AgentConfig.resetAgentLimits;
window.toggleIconPicker = AgentConfig.toggleIconPicker;
window.selectAgentIcon = AgentConfig.selectAgentIcon;
window.switchChatAgentTab = AgentConfig.switchChatAgentTab;
window.switchChatAgentFile = AgentConfig.switchChatAgentFile;
window.saveChatAgentFile = AgentConfig.saveChatAgentFile;
window.loadChatAgentFilesForAgent = AgentConfig.loadChatAgentFilesForAgent;
window.saveAllChatAgentConfig = AgentConfig.saveAllChatAgentConfig;
window.loadGlobalModelsForAgent = AgentConfig.loadGlobalModelsForAgent;

// ===== 注册所有 renderer handlers =====
registerAllHandlers();

// ===== Hash-based SPA routing =====
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

  const rawHash = location.hash.replace('#/', '').replace('#', '');
  const hashParts = rawHash.split('?');
  const hashPage = hashParts[0] || '';
  const hashTab = hashParts[1] ? hashParts[1].replace('tab=', '') : null;
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
  // Auto-connect WebSocket
  if (typeof connectWS === 'function') connectWS();

  // Hash-based routing: listen for hash changes (browser back/forward)
  window.addEventListener('hashchange', function() {
    var hash = location.hash.replace('#/', '').replace('#', '');
    if (hash) {
      // Extract page name and tab (strip query params)
      var parts = hash.split('?');
      var page = parts[0];
      var tab = parts[1] ? parts[1].replace('tab=', '') : null;
      if (page && page !== 'chat') {
        navigateToPage(page, tab);
      } else if (page === 'chat') {
        navigateToPage('chat');
      }
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