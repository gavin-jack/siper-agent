// app.js — ESM 入口
// 起源：有状态 UI（先加载，确保 WS 连接最早建立）
import { connectWS, setConnected } from './core.js';
import { registerAllHandlers } from './renderer.js';

// Utils
import { escapeHtml } from './utils/escape.js';
import { LANG, t, applyLang, selectLang } from './utils/i18n.js';
import { updateThemePaletteTrigger, toggleChatSidebar, toggleThemePalette } from './utils/dom.js';
import { siPerNavigate } from './chat/nav.js';
import { apiGet, apiPost } from './utils/api.js';
import { toggleChatLangDropdown, selectChatLang } from './chat/lang.js';

// Components
import { toast, showConfirm, cancelConfirm, execConfirm, showDictModal, confirmDeleteModel, showInput, cancelInput, execInput, openImageLightbox } from './components/toast.js';
import { testModel, verifyGlobalModel, verifyChatModel, initModelTestDelegation } from './components/model-test.js';
import * as AgentModels from './components/agent-models.js';

// Pages
import * as Skills from './pages/skills.js';
import * as Memory from './pages/memory.js';
import * as Logs from './pages/logs.js';
import * as Token from './pages/token.js';
import * as Sessions from './pages/sessions.js';
import * as Theme from './pages/theme.js';
import * as AgentConfig from './pages/agent-config.js';
import * as Settings from './pages/settings.js';
import * as ModelSettings from './pages/model-settings.js';

// Chat (must load before DOMContentLoaded)
import * as Chat from './pages/chat.js';
// chatSwitchPage 由 pages/chat.js L126 挂载

// ===== Window Global Mounts =====
// Utils
window.escapeHtml = escapeHtml;
window.t = t;
window.applyLang = applyLang;
window.selectLang = selectLang;
window.siPerNavigate = siPerNavigate;
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

// Pages
window.Skills = Skills;
window.Memory = Memory;
window.Logs = Logs;
window.Token = Token;
window.Sessions = Sessions;
window.Theme = Theme;
window.AgentConfig = AgentConfig;
window.Settings = Settings;
window.ModelSettings = ModelSettings;

// Page-specific functions (onclick handlers in index.html)
import { switchConfigAgentPageTab, switchChatAgentTab, toggleIconPicker, saveAgentFile, resetAgentLimits, saveAllChatAgentConfig } from './pages/agent-config.js';
import { renderTemplateList, saveThemeTemplate, exportTheme, importTheme, resetTheme } from './pages/theme.js';
import { addModelFromForm } from './pages/model-settings.js';
import { switchModelTab } from './pages/chat-pages/model-settings.js';
import { loadGlobalModelsForAgent } from './components/agent-models.js';
import { newSession } from './chat/session.js';
// switchMonitorTab 由 pages/chat.js 挂载到 window（避免浏览器 ESM cache 问题）

window.switchConfigAgentPageTab = switchConfigAgentPageTab;
window.switchChatAgentTab = switchChatAgentTab;
window.toggleIconPicker = toggleIconPicker;
window.saveAgentFile = saveAgentFile;
window.resetAgentLimits = resetAgentLimits;
window.saveAllChatAgentConfig = saveAllChatAgentConfig;
window.switchModelTab = switchModelTab;
window.renderTemplateList = renderTemplateList;
window.saveThemeTemplate = saveThemeTemplate;
window.exportTheme = exportTheme;
window.importTheme = importTheme;
window.resetTheme = resetTheme;
window.addModelFromForm = addModelFromForm;
window.loadGlobalModelsForAgent = loadGlobalModelsForAgent;
window.newSession = newSession;
window.navigateToPage = siPerNavigate;  // alias

// refreshSessions / refreshMemoryPage — 起源架构下由 WS 推送驱动，保留空函数兜底
window.refreshSessions = () => {};
window.refreshMemoryPage = () => {};

// Model settings
window.loadSettingsModels = ModelSettings.loadSettingsModels;
window.discoverModels = ModelSettings.discoverModels;
window.addCustomModel = ModelSettings.addCustomModel;
window.addModelGroup = ModelSettings.addModelGroup;
window.saveSettingsModels = ModelSettings.saveSettingsModels;
window.deleteSettingsModel = ModelSettings.deleteSettingsModel;
window.saveAllModels = ModelSettings.saveAllModels;
window.applyProviderPreset = ModelSettings.applyProviderPreset;
window.addDiscoveredModel = ModelSettings.addDiscoveredModel;
window.addAllDiscoveredModels = ModelSettings.addAllDiscoveredModels;
window.filterModelsList = ModelSettings.filterModelsList;
window.verifyAllModels = ModelSettings.verifyAllModels;
window.refreshModelsPage = ModelSettings.refreshModelsPage;

// Chat input
import { toggleChatModelDropdown } from './chat/input.js';

// Sidebar / UI
import { startNewChat } from './chat/sidebar.js';
window.toggleChatModelDropdown = toggleChatModelDropdown;
window.startNewChat = startNewChat;

// ===== 注册所有 renderer handlers（起源核心） =====
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
  const rawHash = location.hash.replace('#/', '').replace('#', '');
  const pageToShow = rawHash && rawHash !== 'chat' ? rawHash : null;
  if (pageToShow) {
    if (typeof window.siPerNavigate === 'function') {
      window.siPerNavigate(pageToShow, true);
    }
  } else {
    const chatPage = document.getElementById('page-chat');
    if (chatPage) chatPage.style.display = 'flex';
    if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('chat');
    else console.error('[ESM] chatSwitchPage is not a function!');
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
