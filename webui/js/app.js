// app.js — ESM 入口
// Phase 1-5: utils + components + chat + pages + CSS
// CSS is loaded via <link> tags injected by siper_web.py, not via ESM import
// 2026-05-19: token page color fix — force ESM cache invalidation

// Utils
import { escapeHtml } from './utils/escape.js';
import { LANG, t, applyLang, selectLang } from './utils/i18n.js';
import { navigateToPage, connectWS, setConnected, addLog, updateThemePaletteTrigger, toggleChatSidebar, toggleThemePalette } from './utils/dom.js';
import { apiGet, apiPost } from './utils/api.js';
import { toggleChatLangDropdown, selectChatLang } from './chat/lang.js';

// Components
import { toast, showConfirm, cancelConfirm, execConfirm, showDictModal, confirmDeleteModel, showInput, cancelInput, execInput, openImageLightbox } from './components/toast.js';
import { testModel, verifyGlobalModel, verifyChatModel, initModelTestDelegation } from './components/model-test.js';
import * as AgentModels from './components/agent-models.js';

// Pages (Phase 2)
import * as Skills from './pages/skills.js';
import * as Memory from './pages/memory.js';
import * as Logs from './pages/logs.js';
import * as Token from './pages/token.js';

// Pages (Phase 3)
import * as Sessions from './pages/sessions.js';
import * as Theme from './pages/theme.js';
import * as AgentConfig from './pages/agent-config.js';
import * as Settings from './pages/settings.js';
import * as ModelSettings from './pages/model-settings.js';
// tasks.js removed — task/cron feature deleted

// Pages (Phase 4)
import * as Chat from './pages/chat.js';
window.chatSwitchPage = Chat.chatSwitchPage;

// 挂载到 window（过渡期，后续逐步消除）
window.escapeHtml = escapeHtml;
window.LANG = LANG;
window.t = t;
window.applyLang = applyLang;
window.selectLang = selectLang;
window.selectChatLang = selectChatLang;
window.toggleChatLangDropdown = toggleChatLangDropdown;
window.navigateToPage = navigateToPage;
window.connectWS = connectWS;
window.setConnected = setConnected;
window.addLog = addLog;
window.apiGet = apiGet;
window.apiPost = apiPost;

window.toast = toast;
window.showConfirm = showConfirm;
window.cancelConfirm = cancelConfirm;
window.execConfirm = execConfirm;
window.showDictModal = showDictModal;
window.confirmDeleteModel = confirmDeleteModel;
window.showInput = showInput;
window.cancelInput = cancelInput;
window.execInput = execInput;
window.testModel = testModel;
window.verifyGlobalModel = verifyGlobalModel;
window.verifyChatModel = verifyChatModel;

// Phase 2 pages
window.refreshSkills = Skills.refreshSkills;
window.renderSkillCard = Skills.renderSkillCard;
window.previewSkillFilter = Skills.previewSkillFilter;
window.populateMemoryAgentSelector = Memory.populateMemoryAgentSelector;
window.onMemoryAgentChange = Memory.onMemoryAgentChange;
window.refreshMemoryPage = Memory.refreshMemoryPage;
window.saveMemoryMd = Memory.saveMemoryMd;
window.refreshMemoryConfig = Memory.refreshMemoryConfig;
window.saveMemoryConfig = Memory.saveMemoryConfig;
window.updateMemoryPreview = Memory.updateMemoryPreview;
window.resetMemoryConfig = Memory.resetMemoryConfig;
window.refreshLogs = Logs.refreshLogs;
window.renderLogLevelFilters = Logs.renderLogLevelFilters;
window.toggleLogLevel = Logs.toggleLogLevel;
window.renderLogSourceOptions = Logs.renderLogSourceOptions;
window.applyLogFilters = Logs.applyLogFilters;
window.applyLogLogsDebounced = Logs.applyLogLogsDebounced;
window.applyChatLogLevelFilter = Logs.applyChatLogLevelFilter;
window.renderLogPagination = Logs.renderLogPagination;
window.gotoLogPage = Logs.gotoLogPage;
window.toggleAutoRefresh = Logs.toggleAutoRefresh;
window.clearLogs = Logs.clearLogs;
window.refreshTokenStats = Token.refreshTokenStats;
window._resizeCharts = Token._resizeCharts;

// Phase 3 pages
window.refreshSessions = Sessions.refreshSessions;
window.formatTime = Sessions.formatTime;
window.switchSession = Sessions.switchSession;
window.loadSessionHistory = Sessions.loadSessionHistory;
window.previewSession = Sessions.previewSession;
window.newSession = Sessions.newSession;
window.saveThemeToStorage = Theme.saveThemeToStorage;
window.showThemeSettings = Theme.showThemeSettings;
window.renderSizeSettings = Theme.renderSizeSettings;
window.renderTemplateList = Theme.renderTemplateList;
window.saveThemeTemplate = Theme.saveThemeTemplate;
window.loadThemeTemplate = Theme.loadThemeTemplate;
window.deleteThemeTemplate = Theme.deleteThemeTemplate;
window.exportSingleTemplate = Theme.exportSingleTemplate;
window.applyThemePreset = Theme.applyThemePreset;
window.applyThemeValue = Theme.applyThemeValue;
window.resetTheme = Theme.resetTheme;
window.exportTheme = Theme.exportTheme;
window.importTheme = Theme.importTheme;
window.loadAgentSettings = AgentConfig.loadAgentSettings;
window.loadGlobalModelsForAgent = AgentConfig.loadGlobalModelsForAgent;
window.renderAgentModelSection = AgentConfig.renderAgentModelSection;
window.renderAgentModelsForAgent = AgentConfig.renderAgentModelsForAgent;
window.saveAgentSettings = AgentConfig.saveAgentSettings;
window.autoSaveAgentModels = AgentConfig.autoSaveAgentModels;
window.refreshConfigAgentPanel = AgentConfig.refreshConfigAgentPanel;
window.selectConfigAgent = AgentConfig.selectConfigAgent;
window.switchConfigAgentPageTab = AgentConfig.switchConfigAgentPageTab;
window.refreshAgentFile = AgentConfig.refreshAgentFile;
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
window.refreshGlobalSettings = Settings.refreshGlobalSettings;
window.autoSaveRuntimeSettings = Settings.autoSaveRuntimeSettings;
window.saveMetaConfig = Settings.saveMetaConfig;
window.loadMetaConfig = Settings.loadMetaConfig;
window.resetSystemParams = Settings.resetSystemParams;
window.switchSettingsTab = Settings.switchSettingsTab;
window.renderGlobalAgents = Settings.renderGlobalAgents;
window.onGlobalAgentSelect = Settings.onGlobalAgentSelect;
window.confirmDeleteGlobalAgent = Settings.confirmDeleteGlobalAgent;
// Model settings (independent page)
window.loadSettingsModels = ModelSettings.loadSettingsModels;
window.renderSettingsModelsList = ModelSettings.renderSettingsModelsList;
window.removeSettingsModel = ModelSettings.removeSettingsModel;
window.autoSaveModels = ModelSettings.autoSaveModels;
window.resetSettingsModels = ModelSettings.resetSettingsModels;
window.copyModelName = ModelSettings.copyModelName;
window.discoverModels = ModelSettings.discoverModels;
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
window.toggleChatSidebar = toggleChatSidebar;
window.toggleThemePalette = toggleThemePalette;
window.toggleChatModelDropdown = toggleChatModelDropdown;
window.startNewChat = startNewChat;

// Hash-based SPA routing — runs after ESM module is fully loaded
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
    if (typeof window.navigateToPage === 'function') {
      window.navigateToPage(pageToShow, true);
    }
  } else {
    // Show chat page (three-column layout is always in DOM)
    const chatPage = document.getElementById('page-chat');
    if (chatPage) chatPage.style.display = 'flex';
    if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('chat');
    else console.error('[ESM] chatSwitchPage is not a function!');
  }
  // Init Mermaid
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', fontFamily: 'inherit' });
  }
  // Init model test delegation (verify button click handler)
  if (typeof initModelTestDelegation === 'function') {
    initModelTestDelegation(
      typeof verifyChatModel === 'function' ? verifyChatModel : null,
      typeof verifyGlobalModel === 'function' ? verifyGlobalModel : null
    );
  }
  // Auto-connect WebSocket
  if (typeof connectWS === 'function') connectWS();
}

// ===== Error Diagnostics — capture all JS errors for debugging =====
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

// ===== Keyboard Accessibility: Enter/Space triggers onclick buttons =====
// P0 fix: all [onclick] buttons must be keyboard-accessible (WCAG 2.1)
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var btn = e.target.closest('button[onclick], [role="button"][onclick]');
  if (!btn) return;
  if (e.key === ' ') e.preventDefault();
  btn.click();
});

// ESM modules are deferred by default — DOM is ready when this executes
try {
  initRouter();
} catch(e) {
  console.error('[app.js] initRouter failed:', e.message);
  // Show visible error when page init fails
  document.body.innerHTML = '<div style="padding:40px;text-align:center;font-size:18px;color:#e53e3e;">⚠️ 页面初始化失败: ' + e.message + '<br><br><button onclick="location.reload()" style="padding:8px 20px;font-size:16px;cursor:pointer;">重试</button></div>';
}
