// chat-pages/chat.js — 聊天页面渲染 + 初始化器
// 从 pages/chat.js 拆分，包含 initSidebar + initChatPage
// 包含消息列表、输入框、思考面板、模型选择

import * as Message from '../../chat/message.js';
import * as Input from '../../chat/input.js';
import * as Sidebar from '../../chat/sidebar.js';
import { _chatSessionId, _chatCurrentAgent, _chatSidebarExpanded } from '../../chat/state.js';

// 从 page_cache 读取 agents（不再从 state.js import chatAgents）
function _getAgents() {
  if (typeof window.__getPageCache === 'function') {
    const agents = window.__getPageCache('agents');
    if (agents && Array.isArray(agents)) return agents;
  }
  return [];
}

// ===== 侧边栏初始化（常驻，只执行一次） =====
let _sidebarInitialized = false;
export function initSidebar() {
  if (_sidebarInitialized) return;
  _sidebarInitialized = true;
  document.getElementById('sidebarContainer').innerHTML = `
    <div class="siper-sidebar" id="chatSidebar">
      <div class="siper-sidebar-header" onclick="toggleChatSidebar()" title="展开/折叠">
        <img src="/static/default_avatar.webp" class="siper-sidebar-avatar" alt="avatar" width="36" height="36" onerror="this.src='/static/default_avatar_256.png'">
        <span class="siper-sidebar-brand">SiPer</span>
      </div>
      <nav class="siper-sidebar-nav" role="navigation" aria-label="主导航">
        <div class="siper-nav-section">
          <div class="siper-nav-title" data-i18n="nav.agent">智能体</div>
          <a class="siper-nav-item active" data-page="chat" href="#/chat"><span>💬</span><span class="siper-nav-item-label" data-i18n="nav.chat">对话</span></a>
          <a class="siper-nav-item" data-page="tasks" href="#/tasks"><span>📋</span><span class="siper-nav-item-label" data-i18n="nav.tasks">任务</span></a>
        </div>
        <div class="siper-nav-section">
          <div class="siper-nav-title" data-i18n="nav.support">支持</div>
          <a class="siper-nav-item" data-page="model-settings" href="#/model-settings"><span>🤖</span><span class="siper-nav-item-label" data-i18n="nav.modelSettings">模型</span></a>
          <a class="siper-nav-item" data-page="tools" href="#/tools"><span>🔧</span><span class="siper-nav-item-label" data-i18n="nav.tools">工具</span></a>
          <a class="siper-nav-item" data-page="skills" href="#/skills"><span>🧩</span><span class="siper-nav-item-label" data-i18n="nav.skills">技能</span></a>
          <a class="siper-nav-item" data-page="plugins" href="#/plugins"><span>🔌</span><span class="siper-nav-item-label" data-i18n="nav.plugins">插件</span></a>
        </div>
        <div class="siper-nav-section">
          <div class="siper-nav-title" data-i18n="nav.monitor">监控</div>
          <a class="siper-nav-item" data-page="monitor" href="#/monitor"><span>📊</span><span class="siper-nav-item-label" data-i18n="nav.monitorPage">统计</span></a>
          <a class="siper-nav-item" data-page="directory" href="#/directory"><span>📁</span><span class="siper-nav-item-label" data-i18n="nav.directory">目录</span></a>
          <a class="siper-nav-item" data-page="api-docs" href="#/api-docs"><span>📖</span><span class="siper-nav-item-label">API 文档</span></a>
          <a class="siper-nav-item" data-page="global-settings" href="#/global-settings"><span>⚙️</span><span class="siper-nav-item-label" data-i18n="nav.globalSettings">全局</span></a>
        </div>
      </nav>
      <div class="siper-sidebar-footer"></div>
    </div>`;
  document.querySelectorAll('.siper-nav-item').forEach(el => {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      const page = this.getAttribute('data-page');
      if (page && typeof window.navigateToPage === 'function') window.navigateToPage(page);
    });
  });
}
window.initSidebar = initSidebar;

// ===== Chat 页面初始化 =====
let _chatInitialized = false;
export function initChatPage() {
  if (_chatInitialized) return;
  _chatInitialized = true;
  initSidebar();
  const pageChat = document.getElementById('page-chat');
  pageChat.innerHTML = `
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
  const content = document.getElementById('chatContentArea');
  if (typeof window.renderChatPage === 'function') {
    window.renderChatPage(content);
  }
}
window.initChatPage = initChatPage;

// selectChatAgent — 选中 agent 时在右栏显示 agent 配置
window.selectChatAgent = function(agentName) {
  var rightCol = document.getElementById('page-chat');
  if (!rightCol) return;
  // 渲染完整的 agent 配置模板（与 app.js tplAgentConfig 一致）
  rightCol.innerHTML = '<div class="siper-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden">' +
    '<div class="page-header" style="flex-shrink:0"><h3>' + (agentName || '智能体设置') + '</h3>' +
    '<div class="actions"><button class="btn-sm primary" onclick="window.chatSwitchPage(\'chat\')">← 返回对话</button></div></div>' +
    '<div id="agentConfigContent" style="flex:1;overflow-y:auto;padding:16px 24px">' +
      '<div id="agentConfigTitle" class="agent-config-title"></div>' +
      '<div class="agent-tabs">' +
        '<button class="agent-tab active" data-tab="about" id="agentTabAbout" onclick="window.switchConfigAgentPageTab(\'about\')">关于</button>' +
        '<button class="agent-tab" data-tab="files" id="agentTabFiles" onclick="window.switchConfigAgentPageTab(\'files\')">属性文件</button>' +
        '<button class="agent-tab" data-tab="memory" id="agentTabMemory" onclick="window.switchConfigAgentPageTab(\'memory\')">记忆</button>' +
        '<button class="agent-tab" data-tab="limits" onclick="window.switchConfigAgentPageTab(\'limits\')">限制</button>' +
        '<button class="agent-tab" data-tab="models" onclick="window.switchConfigAgentPageTab(\'models\')">模型</button>' +
        '<button class="agent-tab" data-tab="avatar" onclick="window.switchConfigAgentPageTab(\'avatar\')">头像</button>' +
      '</div>' +
      '<div class="agent-tab-content active" id="agentTabContentAbout"></div>' +
      '<div class="agent-tab-content" id="agentTabContentFiles"></div>' +
      '<div class="agent-tab-content" id="agentTabContentMemory"></div>' +
      '<div class="agent-tab-content" id="tab-limits"></div>' +
      '<div class="agent-tab-content" id="tab-models"></div>' +
      '<div class="agent-tab-content" id="tab-avatar"></div>' +
    '</div>' +
    '<div class="agent-config-footer" style="flex-shrink:0;padding:8px 24px;border-top:1px solid var(--color-border)">' +
      '<button class="btn-sm danger" onclick="if(typeof window.confirmDeleteAgent===\'function\'&&window.currentConfigAgent)window.confirmDeleteAgent(window.currentConfigAgent)">删除智能体</button>' +
      '<button class="btn-sm primary" onclick="window.saveAllChatAgentConfig()">保存全部</button>' +
    '</div></div>';
  document.getElementById('sidebarContainer').style.display = '';
  // 加载 agent 数据 + 填充表单
  if (typeof window.selectConfigAgent === 'function') {
    window.selectConfigAgent(agentName);
  }
  if (typeof window.loadAgentSettings === 'function') {
    window.loadAgentSettings(agentName);
  }
};

// chatSwitchPage — 右栏页面展示控制
window.chatSwitchPage = function(page) {
  if (page === 'chat') {
    navigateToPage('chat');
    return;
  }
  if (page === 'agent-config' || page === 'model-settings') {
    if (typeof window.navigateToPage === 'function') window.navigateToPage(page);
  }
};

// ===== 渲染聊天页面内容 =====
// 输入框独立于消息内容区，固定在 chatRight 底部
var _inputAreaCreated = false;

export function renderChatPage(container, skipSidebar) {
  container.className = 'siper-content siper-chat-mode';
  var hasSession = !!_chatSessionId;
  var hasAgent = !!_chatCurrentAgent;
  var showInput = hasSession && hasAgent;

  if (!showInput) {
    var headerName = document.getElementById('chatRightHeaderName');
    if (headerName) headerName.textContent = '选择一个 Agent 开始对话';
    // 隐藏输入框
    var _inputArea = document.getElementById('chatInputArea');
    if (_inputArea) _inputArea.style.display = 'none';
  } else {
    if (typeof Input.updateChatHeader === 'function') Input.updateChatHeader();
    renderInputArea(showInput);
  }

  container.innerHTML = '' +
    '<div class="siper-thinking-panel" id="chatThinkingPanel">' +
      '<div class="siper-thinking-header"><span class="siper-thinking-icon">💭</span><span>正在思考</span></div>' +
      '<div class="siper-thinking-body" id="chatThinkingBody"></div>' +
    '</div>' +
    '<div class="siper-messages" id="chatMessages" aria-live="polite" aria-atomic="false">' +
      '<div class="siper-empty-state" id="chatEmptyState"><div class="siper-empty-state-icon">💬</div><div>通过agent发送消息</div></div>' +
    '</div>';

  if (!showInput) {
    var addBtn = document.createElement('button');
    addBtn.className = 'siper-btn js-btn-add-agent';
    addBtn.textContent = '+ 新增智能体';
    addBtn.tabIndex = 0;
    addBtn.onclick = function() { if (typeof window.showAddAgentModal === 'function') window.showAddAgentModal(); };
    container.classList.add('js-pos-relative');
    container.appendChild(addBtn);
  }
  if (showInput) {
    setTimeout(function() { if (typeof Input.bindChatInput === 'function') Input.bindChatInput(); }, 0);
  }
  if (!skipSidebar) {
    if (_getAgents().length === 0) {
      // WS 推送 agents 后 renderAgentList 会自动渲染
    } else {
      Sidebar.renderMiddleList();
    }
  }
  Input.loadChatModels();
}

/** 输入框区域：独立于 siper-content 外，作为 chatRight 的直接子元素固定在底部 */
function renderInputArea(show) {
  var area = document.getElementById('chatInputArea');
  if (area) {
    area.style.display = show ? '' : 'none';
    return;
  }
  if (!show) return;
  var chatRight = document.getElementById('chatRight');
  if (!chatRight) return;
  var div = document.createElement('div');
  div.id = 'chatInputArea';
  div.className = 'siper-input-area';
  div.innerHTML = '' +
    '<div class="siper-input-toolbar">' +
      '<input type="file" id="chatFileInput" multiple class="hidden" onchange="handleChatFileSelect(event)" aria-label="上传文件">' +
      '<button class="siper-attach-btn" onclick="document.getElementById(\'chatFileInput\').click()" title="上传文件">📎</button>' +
      '<div class="siper-model-dropdown" id="chatModelDropdown">' +
        '<button class="siper-model-btn" id="chatModelBtn" onclick="toggleChatModelDropdown()">' +
          '<span class="siper-model-btn-name" id="chatModelBtnName">默认模型</span>' +
          '<span class="siper-model-btn-arrow">▾</span>' +
        '</button>' +
        '<div class="siper-model-menu" id="chatModelMenu"></div>' +
      '</div>' +
      '<div class="siper-ctx-info" id="chatCtxInfo" title="当前会话上下文使用量">' +
        '<span class="siper-ctx-label">上下文</span>' +
        '<span class="siper-ctx-value" id="chatCtxValue">--/--</span>' +
        '<span class="siper-ctx-pct" id="chatCtxPct">--%</span>' +
      '</div>' +
    '</div>' +
    '<div id="chatFilePreviewContainer" class="siper-file-preview-container hidden"></div>' +
    '<div class="siper-input-row">' +
      '<textarea id="chatInput" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="1" aria-label="聊天输入"></textarea>' +
      '<button class="siper-send-btn" id="chatSendBtn" onclick="chatSendMessage()">发送</button>' +
      '<button class="siper-stop-btn hidden" id="chatStopBtn" onclick="chatStopGeneration()" title="停止生成">⏹</button>' +
    '</div>';
  chatRight.appendChild(div);
}
window.renderChatPage = renderChatPage;
