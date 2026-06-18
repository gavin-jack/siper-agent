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
  document.getElementById('chatSidebar').innerHTML = `
      <div class="sidebar-header" onclick="toggleChatSidebar()" title="展开/折叠">
        <img src="/static/default_avatar.webp" class="sidebar-avatar" alt="avatar" width="36" height="36" onerror="this.src='/static/default_avatar_256.png'">
        <span class="sidebar-brand">SiPer</span>
      </div>
      <nav class="sidebar-nav" role="navigation" aria-label="主导航">
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
          <a class="siper-nav-item" data-page="api-docs" href="#/api-docs"><span>📖</span><span class="siper-nav-item-label">API</span></a>
        </div>
      </nav>
      <div class="sidebar-footer">
        <a class="siper-nav-item" data-page="global-settings" href="#/global-settings"><span>⚙️</span><span class="siper-nav-item-label" data-i18n="nav.globalSettings">全局</span></a>
      </div>
    `;
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
      <div class="siper-thinking-panel" id="chatThinkingPanel">
        <div class="siper-thinking-header"><span class="siper-thinking-icon">💭</span><span>正在思考</span></div>
        <div class="siper-thinking-body" id="chatThinkingBody"></div>
      </div>
      <div class="siper-content" id="chatContentArea"></div>
    </div>`;
  const content = document.getElementById('chatContentArea');
  if (typeof window.renderChatPage === 'function') {
    window.renderChatPage(content);
  }
  // 加载 agent 列表并渲染中栏
  loadAndRenderAgents();
}

/** 从后端获取 agent + sessions 数据，填充 page_cache 并渲染中栏 */
async function loadAndRenderAgents() {
  try {
    const [agentsResp, sessionsResp] = await Promise.all([
      fetch('/api/agents'),
      fetch('/api/sessions'),
    ]);
    const agentsData = await agentsResp.json();
    const sessionsData = await sessionsResp.json();
    if (agentsData && agentsData.agents) {
      // 按 agent_name 分组 sessions，附加到 agent 对象
      const sessionsByAgent = {};
      if (sessionsData && Array.isArray(sessionsData)) {
        for (const s of sessionsData) {
          const name = s.agent_name || s.agent || 'default';
          if (!sessionsByAgent[name]) sessionsByAgent[name] = [];
          sessionsByAgent[name].push(s);
        }
      } else if (sessionsData && Array.isArray(sessionsData.sessions)) {
        for (const s of sessionsData.sessions) {
          const name = s.agent_name || s.agent || 'default';
          if (!sessionsByAgent[name]) sessionsByAgent[name] = [];
          sessionsByAgent[name].push(s);
        }
      }
      for (const agent of agentsData.agents) {
        agent.sessions = sessionsByAgent[agent.name] || [];
      }
      // 填充 page_cache，sidebar.js 的 getAgentsFromCache() 会读取
      if (typeof window.__setPageCache === 'function') {
        window.__setPageCache('agents', agentsData.agents);
      }
      // 渲染中栏（_doRenderMiddle 会自动首次展开所有 agent）
      if (typeof window.renderMiddleList === 'function') {
        window.renderMiddleList();
      }
    }
  } catch(e) {
    console.error('[chat] loadAndRenderAgents failed:', e);
  }
}
window.initChatPage = initChatPage;

// selectChatAgent — 选中 agent 时在右栏显示 agent 配置（不替换中栏）
window.selectChatAgent = async function(agentName) {
  var chatRight = document.getElementById('chatRight');
  var chatContent = document.getElementById('chatContentArea');
  if (!chatContent) return;
  // 确保右栏可见
  if (chatRight) chatRight.style.display = '';
  // 更新右栏标题
  var headerName = document.getElementById('chatRightHeaderName');
  if (headerName) headerName.textContent = agentName + ' - 设置';
  // 渲染 agent 配置到右栏内容区（完整 6 Tab 表单）
  // 渲染 agent 配置到右栏内容区（4 Tab，CSS 控制样式）
  chatContent.innerHTML =
    '<div id="agentConfigContent">' +
      '<div class="agent-tabs">' +
        '<button class="agent-tab active" data-tab="about" id="agentTabAbout" onclick="window.switchConfigAgentPageTab(\'about\')">关于</button>' +
        '<button class="agent-tab" data-tab="files" id="agentTabFiles" onclick="window.switchConfigAgentPageTab(\'files\')">属性文件</button>' +
        '<button class="agent-tab" data-tab="memory" id="agentTabMemory" onclick="window.switchConfigAgentPageTab(\'memory\')">记忆</button>' +
        '<button class="agent-tab" data-tab="limits" onclick="window.switchConfigAgentPageTab(\'limits\')">限制</button>' +
      '</div>' +
      // ── Tab: 关于（头像+名称同一行 → 模型设置左右分栏）──
      '<div class="agent-tab-content active" id="agentTabContentAbout">' +
        '<div class="config-section">' +
          // 头像和名称同一行
          '<div class="about-identity-row">' +
            '<div class="about-avatar">' +
              '<input type="hidden" id="cfgAgentAvatar">' +
              '<img id="cfgAvatarPreview" src="/static/default_avatar.webp" class="avatar-preview" alt="avatar" width="64" height="64" onclick="document.getElementById(\'avatarFileInput\').click()">' +
              '<div class="avatar-controls">' +
                '<input type="file" id="avatarFileInput" accept="image/*" onchange="window.uploadAgentAvatar&&window.uploadAgentAvatar()" class="hidden">' +
                '<span class="text-muted-small">点击上传</span>' +
              '</div>' +
            '</div>' +
            '<div class="about-name">' +
              '<label class="config-label" for="cfgAgentName">智能体名称<span class="required-mark">*</span></label>' +
              '<input type="text" id="cfgAgentName" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
              '<label class="config-label" for="cfgAgentIconBtn">图标</label>' +
              '<div class="icon-display">' +
                '<span id="cfgAgentIcon" class="agent-icon-large"></span>' +
                '<button class="btn-sm" id="cfgAgentIconBtn" onclick="window.toggleIconPicker&&window.toggleIconPicker(event)">选择图标</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          // 模型设置：左默认模型，右可选模型
          '<div class="config-group-title">模型设置</div>' +
          '<div class="about-models-row">' +
            '<div class="about-models-col">' +
              '<label class="config-label" for="agentDefaultChatModel">默认对话模型</label>' +
              '<select id="agentDefaultChatModel" class="select-input" onchange="window.autoSaveAgentModels&&window.autoSaveAgentModels()"></select>' +
              '<label class="config-label" for="agentDefaultVisionModel">默认视觉模型</label>' +
              '<select id="agentDefaultVisionModel" class="select-input" onchange="window.autoSaveAgentModels&&window.autoSaveAgentModels()"></select>' +
            '</div>' +
            '<div class="about-models-col">' +
              '<label class="config-label">可用模型</label>' +
              '<div id="agentModelListSection" class="model-list"></div>' +
              '<div class="models-empty-hint" id="modelsEmptyHint">勾选全局模型后，该智能体即可在对话中使用对应模型</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // ── Tab: 属性文件（左 Agent.md，右 Soul.md）──
      '<div class="agent-tab-content" id="agentTabContentFiles">' +
        '<div class="files-layout">' +
          '<div class="files-col">' +
            '<label class="config-label" for="agentMdContent">Agent.md 行为指令</label>' +
            '<textarea id="agentMdContent" rows="12" class="code-input" oninput="window.triggerAgentFileAutoSave&&window.triggerAgentFileAutoSave()"></textarea>' +
          '</div>' +
          '<div class="files-col">' +
            '<label class="config-label" for="agentSoulContentFiles">Soul.md</label>' +
            '<textarea id="agentSoulContentFiles" rows="12" class="code-input" oninput="window.triggerAgentFileAutoSave&&window.triggerAgentFileAutoSave()"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="files-system-prompt">' +
          '<label class="config-label" for="agentMemoryContent">System Prompt 预览</label>' +
          '<textarea id="agentMemoryContent" rows="4" class="code-input" oninput="window.triggerAgentFileAutoSave&&window.triggerAgentFileAutoSave()"></textarea>'+
        '</div>' +
      '</div>' +
      // ── Tab: 记忆（记忆设置）──
      '<div class="agent-tab-content" id="agentTabContentMemory">' +
        '<div class="config-section">' +
          '<label class="config-label" for="agentCfgMemoryPath">记忆文件路径</label>' +
          '<input type="text" id="agentCfgMemoryPath" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<label class="config-label" for="agentCfgMemoryMaxTokens">记忆最大 Token 数</label>' +
          '<input type="number" id="agentCfgMemoryMaxTokens" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
        '</div>' +
      '</div>' +
      // ── Tab: 限制 ──
      '<div class="agent-tab-content" id="tab-limits">' +
        '<div class="config-section">' +
          '<div class="config-group-title">LLM 调用与会话</div>' +
          '<label class="config-label" for="agentCfgLlmTimeout">超时 (秒)</label>' +
          '<input type="number" id="agentCfgLlmTimeout" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<label class="config-label" for="agentCfgLlmMaxRetries">最大重试次数</label>' +
          '<input type="number" id="agentCfgLlmMaxRetries" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<label class="config-label" for="agentCfgLlmMaxTokens">最大 Token 数</label>' +
          '<input type="number" id="agentCfgLlmMaxTokens" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<label class="config-label" for="agentCfgMaxToolRounds">最大工具调用轮次</label>' +
          '<input type="number" id="agentCfgMaxToolRounds" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<label class="config-label" for="agentCfgMaxTools">最大工具数量</label>' +
          '<input type="number" id="agentCfgMaxTools" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<label class="config-label" for="agentCfgSessionTimeout">会话超时 (秒)</label>' +
          '<input type="number" id="agentCfgSessionTimeout" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<label class="config-label" for="agentCfgMaxHistoryMessages">最大历史消息数</label>' +
          '<input type="number" id="agentCfgMaxHistoryMessages" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<div class="config-group-title">其他</div>' +
          '<label class="config-label" for="agentCfgSkillPreFilterTopK">技能预筛选 Top K</label>' +
          '<input type="number" id="agentCfgSkillPreFilterTopK" class="select-input" oninput="window.triggerAgentAutoSave&&window.triggerAgentAutoSave()">' +
          '<button class="btn-sm" onclick="window.resetAgentLimits&&window.resetAgentLimits()" data-i18n="agentConfig.resetLimits">重置限制</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  // 加载 agent 数据 + 填充表单
  // 先确保 agentConfigData 已加载（selectConfigAgent 依赖它）
  if (typeof window.refreshConfigAgentPanel === 'function') {
    await window.refreshConfigAgentPanel();
  }
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
    // 从 agent 设置返回对话：重新渲染聊天内容
    var content = document.getElementById('chatContentArea');
    if (content && typeof window.renderChatPage === 'function') {
      window.renderChatPage(content);
    } else {
      navigateToPage('chat');
    }
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
  } else if (typeof Input.updateChatHeader === 'function') Input.updateChatHeader();

  container.innerHTML = '' +
    '<div class="siper-messages" id="chatMessages" aria-live="polite" aria-atomic="false">' +
      '<div class="siper-empty-state" id="chatEmptyState"><div class="siper-empty-state-icon">💬</div><div>通过agent发送消息</div></div>' +
    '</div>' +
    (showInput ? '<div class="siper-input-area" id="chatInputArea"></div>' : '');

  if (showInput) {
    renderInputArea();
    setTimeout(function() { if (typeof Input.bindChatInput === 'function') Input.bindChatInput(); }, 0);
  }

  if (!showInput) {
    var addBtn = document.createElement('button');
    addBtn.className = 'siper-btn js-btn-add-agent';
    addBtn.textContent = '+ 新增智能体';
    addBtn.tabIndex = 0;
    addBtn.onclick = function() { if (typeof window.showAddAgentModal === 'function') window.showAddAgentModal(); };
    container.classList.add('js-pos-relative');
    container.appendChild(addBtn);
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

/** 输入框：填充到 container 内的 siper-input-area 容器中 */
function renderInputArea() {
  var area = document.getElementById('chatInputArea');
  if (!area) return;
  area.innerHTML = '' +
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
}
window.renderChatPage = renderChatPage;
