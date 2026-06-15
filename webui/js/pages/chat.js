// pages/chat.js — 聊天页面入口 + 路由
// 从 1017 行精简为入口 + 路由表 + window 挂载
// 各页面渲染函数已迁移到 pages/chat-pages/

// Utils
import { escapeHtml } from '../utils/escape.js';
import { showDictModal } from '../components/toast.js';

// Chat modules
import { siPerNavigate } from '../chat/nav.js';
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
import { renderToolsPage } from './chat-pages/tools.js';
// directory.js 内联 — 避免浏览器 ESM 加载器对独立文件缓存失败
// 注意：escapeHtml 已在 chat.js 顶部 import，直接使用
function renderDirectoryPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="page-header">
  <h3>📁 项目目录</h3>
  <button class="siper-btn" id="dirRefreshBtn" onclick="window._dirRefresh()">刷新</button>
</div>
<div class="page-body">
  <div id="dirTree" class="siper-dir-tree">加载中...</div>
</div>`;
  _loadDirectory();
}
function _fmtSize(kb) {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return kb.toFixed(1) + ' KB';
}
function _loadDirectory() {
  const treeEl = document.getElementById('dirTree');
  if (!treeEl) return;
  treeEl.innerHTML = '<div style="padding:20px;color:var(--color-text-dim)">加载中...</div>';
  fetch('/api/project-structure').then(r => r.json()).then(data => {
    if (!data || (!data.dirs && !data.files)) {
      treeEl.innerHTML = '<div style="padding:20px;color:var(--color-error-text)">加载失败</div>';
      return;
    }
    let html = '';
    if (data.dirs && data.dirs.length > 0) {
      html += '<div class="siper-dir-section"><div class="siper-dir-section-title">📂 目录</div>';
      data.dirs.forEach(d => {
        html += `<div class="siper-dir-item">
          <span class="siper-dir-icon">📂</span>
          <span class="siper-dir-name">${escapeHtml(d.name)}/</span>
          <span class="siper-dir-meta">${d.count} 个文件</span>
          <span class="siper-dir-size">${_fmtSize(d.size_kb)}</span>
        </div>`;
      });
      html += '</div>';
    }
    if (data.files && data.files.length > 0) {
      html += '<div class="siper-dir-section"><div class="siper-dir-section-title">📄 根目录文件</div>';
      data.files.forEach(f => {
        const icon = f.name.endsWith('.py') ? '🐍' : f.name.endsWith('.md') ? '📝' : f.name.endsWith('.json') ? '📋' : f.name.endsWith('.sh') ? '⚡' : '📄';
        html += `<div class="siper-dir-item">
          <span class="siper-dir-icon">${icon}</span>
          <span class="siper-dir-name">${escapeHtml(f.name)}</span>
          <span class="siper-dir-meta"></span>
          <span class="siper-dir-size">${_fmtSize(f.size_kb)}</span>
        </div>`;
      });
      html += '</div>';
    }
    treeEl.innerHTML = html;
  }).catch(() => {
    treeEl.innerHTML = '<div style="padding:20px;color:var(--color-error-text)">加载失败，请刷新重试</div>';
  });
}
window._dirRefresh = function() { _loadDirectory(); };

// ===== Page Config =====
const CHAT_PAGES = {
  chat:    { title: '对话', icon: '💬' },
  tasks:    { title: '任务', icon: '📋' },
  'model-settings': { title: '模型管理', icon: '🤖' },
  tools:    { title: '工具', icon: '🔧' },
  skills:    { title: '技能管理', icon: '🧩' },
  plugins:  { title: '插件管理', icon: '🔌' },
  monitor:  { title: '统计', icon: '📊' },
  directory: { title: '目录', icon: '📁' },
  'global-settings': { title: '全局设置', icon: '⚙️' },
};

// ===== Init =====
Input.bindChatInput();
if (chatSidebarExpanded) {
  const sidebar = document.getElementById('chatSidebar');
  if (sidebar) sidebar.classList.add('expanded');
}

// 独立页面列表 — 使用 siper-page 容器而非 siper-chat
const STANDALONE_PAGES = new Set(['tools', 'directory', 'monitor']);

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

  // 动态切换右栏容器 class：独立页面用 siper-page，对话家族用 siper-chat
  const right = document.getElementById('chatRight');
  if (right) {
    const isStandalone = STANDALONE_PAGES.has(page);
    right.classList[isStandalone ? 'remove' : 'add']('siper-chat');
    right.classList[isStandalone ? 'add' : 'remove']('siper-page');
  }

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
    case 'directory': renderDirectoryPageChat(content); break;
    case 'tools':     renderToolsPage(content); break;
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

// Stop handler — core.js dispatch 直接调 handleStopped()
// window.chatHandleStopped 已删除

// Monitor / Tasks page
window.switchMonitorTab = switchMonitorTab;
window.refreshMonitorTab = function() {
  const active = document.querySelector('#monitorTabs .siper-settings-tab.active');
  if (active) switchMonitorTab(active.dataset.tab);
};
