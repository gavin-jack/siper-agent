// app.js — ESM 入口
// Phase 1-5: utils + components + chat + pages + CSS
// CSS is loaded via <link> tags injected by siper_web.py, not via ESM import
// 2026-05-19: token page color fix — force ESM cache invalidation

// Utils
import { escapeHtml } from './utils/escape.js';
import { LANG, t, applyLang, selectLang } from './utils/i18n.js';
import { navigateToPage, connectWS, setConnected, addLog, updateThemePaletteTrigger, toggleChatSidebar, toggleThemePalette, closeImageLightbox, toggleChatModelDropdown, chatDoUpgrade, startSidebarUpgradeTimer, selectChatLang, toggleChatLangDropdown } from './utils/dom.js';
import { apiGet, apiPost } from './utils/api.js';

// Components
import { toast, showConfirm, cancelConfirm, execConfirm, showDictModal, confirmDeleteModel, showInput, cancelInput, execInput } from './components/toast.js';
import { testModel, verifyGlobalModel, verifyChatModel, initModelTestDelegation } from './components/model-test.js';
import * as AgentModels from './components/agent-models.js';

// Pages (Phase 2)
import * as Gateway from './pages/gateway.js';
import * as Skills from './pages/skills.js';
import * as Memory from './pages/memory.js';
import * as Logs from './pages/logs.js';
import * as Token from './pages/token.js';

// Pages (Phase 3)
import * as Sessions from './pages/sessions.js';
import * as Theme from './pages/theme.js';
import * as AgentConfig from './pages/agent-config.js';
import * as Settings from './pages/settings.js';
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
window.refreshGateway = Gateway.refreshGateway;
window.controlGateway = Gateway.controlGateway;
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
window.refreshSessions = Sessions.refreshSessions;
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
window.showConfigAvatarStatus = AgentConfig.showConfigAvatarStatus;
window.triggerAgentAutoSave = AgentConfig.triggerAgentAutoSave;
window.attachAgentAutoSaveListeners = AgentConfig.attachAgentAutoSaveListeners;
window.resetAgentLimits = AgentConfig.resetAgentLimits;
window.toggleIconPicker = AgentConfig.toggleIconPicker;
window.selectAgentIcon = AgentConfig.selectAgentIcon;
window.initAvatarAutoUpload = AgentConfig.initAvatarAutoUpload;
window.switchChatAgentTab = AgentConfig.switchChatAgentTab;
window.switchChatAgentFile = AgentConfig.switchChatAgentFile;
window.saveChatAgentFile = AgentConfig.saveChatAgentFile;
window.loadChatAgentFilesForAgent = AgentConfig.loadChatAgentFilesForAgent;
window.saveAllChatAgentConfig = AgentConfig.saveAllChatAgentConfig;
window.loadSettingsModels = Settings.loadSettingsModels;
window.renderSettingsModelsList = Settings.renderSettingsModelsList;
window.removeSettingsModel = Settings.removeSettingsModel;
window.autoSaveModels = Settings.autoSaveModels;
window.refreshGlobalSettings = Settings.refreshGlobalSettings;
window.autoSaveRuntimeSettings = Settings.autoSaveRuntimeSettings;
window.resetSettingsModels = Settings.resetSettingsModels;
window.saveMetaConfig = Settings.saveMetaConfig;
window.loadMetaConfig = Settings.loadMetaConfig;
window.copyModelName = Settings.copyModelName;
window.saveSystemParams = Settings.saveSystemParams;
window.resetSystemParams = Settings.resetSystemParams;
window.switchSettingsTab = Settings.switchSettingsTab;
// Chat-mode model management (rendered in chat subpage's #chatGlobalModels tab)
window.renderChatGlobalModels = Settings.renderChatGlobalModels;
window.chatRemoveModel = Settings.chatRemoveModel;
window.chatSaveGlobalModels = Settings.chatSaveGlobalModels;
window.chatDiscoverModels = Settings.chatDiscoverModels;
window.chatAddDiscoveredModel = Settings.chatAddDiscoveredModel;
window.chatLoadGlobalModels = Settings.chatLoadGlobalModels;
window.applyProviderPreset = Settings.applyProviderPreset;
window.discoverModels = Settings.discoverModels;

// Sidebar / UI
import { startNewChat } from './chat/sidebar.js';
window.toggleChatSidebar = toggleChatSidebar;
window.toggleThemePalette = toggleThemePalette;
window.closeImageLightbox = closeImageLightbox;
window.toggleChatModelDropdown = toggleChatModelDropdown;
window.chatDoUpgrade = chatDoUpgrade;
window.startSidebarUpgradeTimer = startSidebarUpgradeTimer;
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
    navigateToPage(pageToShow, true);
  } else {
    const chatPage = document.getElementById('page-chat');
    if (chatPage) chatPage.classList.add('active');
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

// ESM modules are deferred by default — DOM is ready when this executes
initRouter();
