// pages/chat.js — 聊天页面入口 + 路由
// 从 1017 行精简为入口 + 路由表 + window 挂载
// 各页面渲染函数已迁移到 pages/chat-pages/

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

// Sub-page renderers
import { renderChatPage } from './chat-pages/chat.js';
import { renderTasksPageChat } from './chat-pages/tasks.js';
import { renderSkillsPageChat } from './chat-pages/skills.js';
import { renderPluginsPageChat } from './chat-pages/plugins.js';
import { renderTokenPageChat } from './chat-pages/token.js';
import { renderSettingsPageChat } from './chat-pages/settings.js';
import { renderModelSettingsPageChat } from './chat-pages/model-settings.js';
import { renderLogsPageChat } from './chat-pages/logs.js';
import { renderMonitorPageChat, switchMonitorTab } from './chat-pages/monitor.js';

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

// ===== Page Lifecycle =====
export function onChatPageEnter() { chatSwitchPage('chat', true); }

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
window.getChatFileCategory = Input.getChatFileCategory;
window.renderChatFilePreviews = Input.renderChatFilePreviews;
window.renderChatModelDropdown = Input.renderChatModelDropdown;
window.closeChatModelDropdown = Input.closeChatModelDropdown;
window.loadChatModels = Input.loadChatModels;
window.updateChatHeader = Input.updateChatHeader;

// DOM utils (referenced by other JS files)
window.addMsg = addMsg;
window.appendMeta = appendMeta;
window.debugHighlight = debugHighlight;
window.siPerNavigate = siPerNavigate;
window.updateCtxInfoDisplay = updateCtxInfoDisplay;
window.updateCtxFromStreamEnd = updateCtxFromStreamEnd;

// Thinking
window.chatThinkingShow = Stream.chatThinkingShow;
window.chatThinkingHide = Stream.chatThinkingHide;
window.chatThinkingClear = Stream.chatThinkingClear;
window.chatThinkingAddToolStep = Stream.chatThinkingAddToolStep;
window.chatThinkingAddTextRow = Stream.chatThinkingAddTextRow;

// Sidebar / sessions
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

// Language
window.toggleChatLangDropdown = Lang.toggleChatLangDropdown;
window.selectChatLang = Lang.selectChatLang;

// Toast
window.showChatToast = Toast.showChatToast;
window.chatConfirm = Toast.chatConfirm;

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
