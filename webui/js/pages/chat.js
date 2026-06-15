// pages/chat.js — chat 页面初始化器
// 只负责构建 #page-chat 的 DOM 结构并渲染聊天页面

// Utils
import { escapeHtml } from '../utils/escape.js';
import { showDictModal } from '../components/toast.js';

// Chat modules
import { updateCtxFromStreamEnd } from '../chat/session.js';
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

// Chat page renderer
import { renderChatPage } from './chat-pages/chat.js';

// ===== Init =====
Input.bindChatInput();
if (chatSidebarExpanded) {
  const sidebar = document.getElementById('chatSidebar');
  if (sidebar) sidebar.classList.add('expanded');
}

// ===== initChatPage =====
let _chatInitialized = false;

export function initChatPage() {
  if (_chatInitialized) return;
  _chatInitialized = true;

  const pageChat = document.getElementById('page-chat');
  pageChat.innerHTML = `
    <!-- 侧边栏 -->
    <div class="siper-sidebar" id="chatSidebar">
      <div class="siper-sidebar-header" onclick="toggleChatSidebar()" title="展开/折叠">
        <img src="/static/default_avatar.webp" class="siper-sidebar-avatar" alt="avatar" width="36" height="36" onerror="this.src='/static/default_avatar_256.png'">
        <span class="siper-sidebar-brand">SiPer</span>
      </div>
      <nav class="siper-sidebar-nav" role="navigation" aria-label="主导航">
        <div class="siper-nav-section">
          <div class="siper-nav-title" data-i18n="nav.agent">智能体</div>
          <div class="siper-nav-item active" data-page="chat" onclick="navigateToPage('chat')"><span>💬</span><span class="siper-nav-item-label" data-i18n="nav.chat">对话</span></div>
          <div class="siper-nav-item" data-page="tasks" onclick="navigateToPage('tasks')"><span>📋</span><span class="siper-nav-item-label" data-i18n="nav.task">任务</span></div>
        </div>
        <div class="siper-nav-section">
          <div class="siper-nav-title" data-i18n="nav.support">支持</div>
          <div class="siper-nav-item" data-page="model-settings" onclick="navigateToPage('model-settings')"><span>🤖</span><span class="siper-nav-item-label" data-i18n="nav.modelSettings">模型</span></div>
          <div class="siper-nav-item" data-page="tools" onclick="navigateToPage('tools')"><span>🔧</span><span class="siper-nav-item-label" data-i18n="nav.tools">工具</span></div>
          <div class="siper-nav-item" data-page="skills" onclick="navigateToPage('skills')"><span>🧩</span><span class="siper-nav-item-label" data-i18n="nav.skills">技能</span></div>
          <div class="siper-nav-item" data-page="plugins" onclick="navigateToPage('plugins')"><span>🔌</span><span class="siper-nav-item-label" data-i18n="nav.plugins">插件</span></div>
        </div>
        <div class="siper-nav-section">
          <div class="siper-nav-title" data-i18n="nav.monitor">监控</div>
          <div class="siper-nav-item" data-page="monitor" onclick="navigateToPage('monitor')"><span>📊</span><span class="siper-nav-item-label" data-i18n="nav.monitorPage">统计</span></div>
          <div class="siper-nav-item" data-page="directory" onclick="navigateToPage('directory')"><span>📁</span><span class="siper-nav-item-label" data-i18n="nav.directory">目录</span></div>
          <div class="siper-nav-item" data-page="global-settings" onclick="navigateToPage('global-settings')"><span>⚙️</span><span class="siper-nav-item-label" data-i18n="nav.globalSettings">全局</span></div>
        </div>
      </nav>
      <div class="siper-sidebar-footer"></div>
    </div>
    <!-- 中栏 -->
    <div class="siper-middle" id="chatMiddle">
      <div class="siper-middle-header">
        <div class="siper-search-box">
          <span>🔍</span>
          <input type="text" class="siper-search-input" id="chatSearchInput" placeholder="搜索智能体..." oninput="chatHandleSearch(this.value)" aria-label="搜索智能体">
        </div>
      </div>
      <div class="siper-middle-list" id="chatMiddleList"></div>
    </div>
    <!-- 右栏 -->
    <div class="siper-chat" id="chatRight">
      <div class="siper-chat-header" id="chatRightHeader">
        <span class="siper-chat-header-name" id="chatRightHeaderName">SiPer</span>
      </div>
      <div class="siper-content" id="chatContentArea"></div>
    </div>`;

  // 渲染聊天页面内容
  const content = document.getElementById('chatContentArea');
  if (typeof window.renderChatPage === 'function') {
    window.renderChatPage(content);
  }
}
window.initChatPage = initChatPage;

// ===== Page Lifecycle =====
export function onChatPageEnter() { initChatPage(); }

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
window.renderChatPage = renderChatPage;
window.chatSendMessage = Input.chatSendMessage;
window.chatStopGeneration = Message.chatStopGeneration;
window.chatClearMessages = Message.chatClearMessages;
window.chatAddMessage = Message.chatAddMessage;
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
