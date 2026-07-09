// chat-pages/chat.js — 聊天页面渲染 + 初始化器
// 从 pages/chat.js 拆分，包含 initSidebar + initChatPage
// 包含消息列表、输入框、思考面板、模型选择

import * as Message from '../../chat/message.js?v=1783625456886';
import * as Input from '../../chat/input.js?v=1783625456886';
import * as Sidebar from '../../chat/sidebar.js?v=1783625456886';
import { _chatSessionId, _chatCurrentAgent, _chatSidebarExpanded, setChatCurrentAgent } from '../../chat/state.js?v=1783625456886';
import { escapeHtml } from '../../utils/escape.js?v=1783625456886';
import { toast } from '../../components/toast.js?v=1783625456886';

// 从 page_cache 读取 agents（不再从 state.js import chatAgents）
function _getAgents() {
  if (typeof window.__getPageCache === 'function') {
    const agents = window.__getPageCache('agents');
    if (agents && Array.isArray(agents)) return agents;
  }
  return [];
}


function _tplSidebar() {
  return `
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
}

// ===== 侧边栏初始化（常驻，只执行一次） =====
let _sidebarInitialized = false;
export function initSidebar() {
  if (_sidebarInitialized) return;
  _sidebarInitialized = true;
  document.getElementById('chatSidebar').innerHTML = _tplSidebar();
  document.querySelectorAll('.siper-nav-item').forEach(el => {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      const page = this.getAttribute('data-page');
      if (page && typeof window.navigateToPage === 'function') window.navigateToPage(page);
    });
  });
}
window.initSidebar = initSidebar;


function _tplChatPage() {
  return `
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
}

// ===== Chat 页面初始化 =====
let _chatInitialized = false;
export function initChatPage() {
  if (_chatInitialized) return;
  _chatInitialized = true;
  initSidebar();
  const pageChat = document.getElementById('page-chat');
  pageChat.innerHTML = _tplChatPage();
  // 渲染初始页面（标题"选择一个 Agent 开始对话" + 空状态）
  const content = document.getElementById('chatContentArea');
  if (typeof window.renderChatPage === 'function') {
    window.renderChatPage(content);
  }
  // renderChatPage 内部已加载 agents，无需重复
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
// 自包含：直接填充表单，不依赖 AgentConfig 模块
window.selectChatAgent = async function(agentName) {
  var chatRight = document.getElementById('chatRight');
  var chatContent = document.getElementById('chatContentArea');
  if (!chatContent) return;
  if (chatRight) chatRight.style.display = '';
  var headerName = document.getElementById('chatRightHeaderName');
  if (headerName) headerName.textContent = agentName + ' - 设置';

  // 并行获取所有数据（确保 DOM 插入后立即可填充）
  var agentData = null, modelsData = null, soulData = null, configData = null, memoryData = null;
  try {
    var results = await Promise.allSettled([
      fetch('/api/agents'),
      fetch('/api/models/global'),
      fetch('/api/agents/' + encodeURIComponent(agentName) + '/soul'),
      fetch('/api/agents/' + encodeURIComponent(agentName) + '/config'),
      fetch('/api/agents/' + encodeURIComponent(agentName) + '/memory'),
    ]);
    if (results[0].status === 'fulfilled') agentData = (await results[0].value.json()).agents?.find(a => a.name === agentName);
    if (results[1].status === 'fulfilled') modelsData = await results[1].value.json();
    if (results[2].status === 'fulfilled') soulData = await results[2].value.json();
    if (results[3].status === 'fulfilled') configData = await results[3].value.json();
    if (results[4].status === 'fulfilled') memoryData = await results[4].value.json();
  } catch(e) { console.error('[chat] fetch failed:', e); }

  chatContent.innerHTML =

    '<div class="agent-tabs">' +
      '<button class="agent-tab active" data-tab="about" id="agentTabAbout" onclick="window.switchConfigAgentPageTab(\'about\')">关于</button>' +
      '<button class="agent-tab" data-tab="files" id="agentTabFiles" onclick="window.switchConfigAgentPageTab(\'files\')">属性文件</button>' +
      '<button class="agent-tab" data-tab="memory" id="agentTabMemory" onclick="window.switchConfigAgentPageTab(\'memory\')">记忆</button>' +
      '<button class="agent-tab" data-tab="limits" onclick="window.switchConfigAgentPageTab(\'limits\')">限制</button>' +
    '</div>' +
    // ── Tab: 关于
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

  // 自填充表单
  if (agentData) {
    var _d = agentData;
    var _nameEl = document.getElementById('cfgAgentName');
    var _iconSpan = document.getElementById('cfgAgentIcon');
    var _avatarEl = document.getElementById('cfgAgentAvatar');
    var _av = document.getElementById('cfgAvatarPreview');
    var _setVal = function(id, v) {
      var e = document.getElementById(id);
      if (e) e.value = v;
    };
    if (_nameEl) _nameEl.value = _d.display_name || _d.name || 'default';
    if (_iconSpan) _iconSpan.textContent = _d.icon || '🎭';
    if (_avatarEl) _avatarEl.value = _d.avatar || '';
    if (_av) { _av.src = '/api/avatar?agent=' + encodeURIComponent(_d.name); _av.style.display = 'inline'; }
    _setVal('agentCfgMaxTools', _d.max_tools !== undefined ? _d.max_tools : 10);
    _setVal('agentCfgSessionTimeout', _d.session_timeout !== undefined ? _d.session_timeout : 3600);
    _setVal('agentCfgMaxToolRounds', _d.max_tool_rounds !== undefined ? _d.max_tool_rounds : 100);
    _setVal('agentCfgLlmTimeout', _d.llm_timeout !== undefined ? _d.llm_timeout : 120);
    _setVal('agentCfgLlmMaxTokens', _d.llm_max_tokens !== undefined ? _d.llm_max_tokens : 8192);
    _setVal('agentCfgLlmMaxRetries', _d.llm_max_retries !== undefined ? _d.llm_max_retries : 2);
    _setVal('agentCfgMaxHistoryMessages', _d.max_history_messages !== undefined ? _d.max_history_messages : 50);
    _setVal('agentCfgMemoryMaxTokens', (_d.memory_integration && _d.memory_integration.max_tokens !== undefined) ? _d.memory_integration.max_tokens : 20000);
    _setVal('agentCfgSkillPreFilterTopK', _d.skill_pre_filter_top_k !== undefined ? _d.skill_pre_filter_top_k : 5);

    // 模型下拉框 + 可用模型
    var _availModels = (_d.available_models || []).map(function(m) { return typeof m === 'string' ? m : m.name; });
    var _globalModels = (modelsData && modelsData.models) ? modelsData.models : [];
    var _modelOptions = '<option value="">— 使用全局默认 —</option>';
    var _modelCheckboxes = '';
    for (var mi = 0; mi < _globalModels.length; mi++) {
      var _m = _globalModels[mi];
      var _alias = _m.alias ? ' (' + _m.alias + ')' : '';
      var _sel = _availModels.indexOf(_m.name) >= 0 ? 'selected ' : '';
      _modelOptions += '<option ' + _sel + 'value="' + _m.name + '">' + _m.name + _alias + '</option>';
      var _checked = _availModels.indexOf(_m.name) >= 0 ? 'checked ' : '';
      _modelCheckboxes += '<label class="model-checkbox-row">' +
        '<input type="checkbox" value="' + _m.name + '" class="agent-avail-mcb" data-name="' + _m.name + '" onchange="window.autoSaveAgentModels&&window.autoSaveAgentModels()" ' + _checked + '>' +
        '<span class="model-name">' + _m.name + '</span>' +
        (_alias ? '<span class="model-alias">' + _alias + '</span>' : '') +
        '</label>';
    }
    var _chatSel = document.getElementById('agentDefaultChatModel');
    var _visionSel = document.getElementById('agentDefaultVisionModel');
    var _modelList = document.getElementById('agentModelListSection');
    if (_chatSel) _chatSel.innerHTML = _modelOptions;
    if (_visionSel) _visionSel.innerHTML = _modelOptions;
    if (_modelList) _modelList.innerHTML = '<div class="model-list">' + _modelCheckboxes + '</div>';

    // Set default model selection
    if (_d.default_chat_model) { if (_chatSel) _chatSel.value = _d.default_chat_model; }
    else if (_globalModels.length > 0) {
      var _gd = _globalModels.find(function(m) { return m.is_default; }) || _globalModels[0];
      if (_chatSel) _chatSel.value = _gd.name;
    }
    if (_d.default_vision_model) { if (_visionSel) _visionSel.value = _d.default_vision_model; }

    // Agent.md & Soul.md
    var _mdTa = document.getElementById('agentMdContent');
    var _soulTa = document.getElementById('agentSoulContentFiles');
    var _memTa = document.getElementById('agentMemoryContent');
    if (_mdTa) _mdTa.value = (configData && configData.config) ? configData.config : '';
    if (_soulTa) _soulTa.value = (soulData && soulData.soul) ? soulData.soul : '';
    if (_memTa) _memTa.value = (memoryData && memoryData.memory) ? memoryData.memory : '';

    var _ttl = document.getElementById('agentConfigTitle');
    if (_ttl) _ttl.value = _d.display_name || _d.name || 'default';
  }
};

// ========== Auto-save utilities (module scope) ==========
var _agentSaveTimer = null;
var _agentFileSaveTimer = null;

/** Debounced auto-save for text/number fields (2s quiet) */
window.triggerAgentAutoSave = function() {
  if (_agentSaveTimer) clearTimeout(_agentSaveTimer);
  _agentSaveTimer = setTimeout(function() { _saveAgentConfig(true); }, 500);
};

/** Debounced auto-save for file content (800ms quiet) */
window.triggerAgentFileAutoSave = function() {
  if (_agentFileSaveTimer) clearTimeout(_agentFileSaveTimer);
  _agentFileSaveTimer = setTimeout(function() { _saveAgentFiles(true); }, 800);
};

/** Immediate save for model checkboxes/selects */
window.autoSaveAgentModels = function() { _saveAgentModels(true); }; // keep for inline onchange compat

/** Collect current form state and POST to /api/agents/{name}/meta */
async function _saveAgentConfig(showToast) {
  var name = _chatCurrentAgent && _chatCurrentAgent.name;
  if (!name) return;
  var _gv = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var body = {
    display_name: _gv('cfgAgentName'),
    max_tools: parseInt(_gv('agentCfgMaxTools'), 10) || 10,
    max_tool_rounds: parseInt(_gv('agentCfgMaxToolRounds'), 10) || 100,
    session_timeout: parseInt(_gv('agentCfgSessionTimeout'), 10) || 3600,
    llm_timeout: parseInt(_gv('agentCfgLlmTimeout'), 10) || 120,
    llm_max_tokens: parseInt(_gv('agentCfgLlmMaxTokens'), 10) || 8192,
    llm_max_retries: parseInt(_gv('agentCfgLlmMaxRetries'), 10) || 2,
    max_history_messages: parseInt(_gv('agentCfgMaxHistoryMessages'), 10) || 50,
    memory_integration: { max_tokens: parseInt(_gv('agentCfgMemoryMaxTokens'), 10) || 20000 },
    skill_pre_filter_top_k: parseInt(_gv('agentCfgSkillPreFilterTopK'), 10) || 5,
  };
  try {
    var resp = await fetch('/api/agents/' + encodeURIComponent(name) + '/meta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var result = await resp.json();
    if (showToast !== false) {
      if (result && result.success) toast && toast.success && toast.success('配置已保存');
      else toast && toast.error && toast.error('保存失败');
    }
  } catch(e) {
    if (showToast !== false) toast && toast.error && toast.error('保存失败');
  }
}

/** Save Agent.md + Soul.md content */
async function _saveAgentFiles(showToast) {
  var name = _chatCurrentAgent && _chatCurrentAgent.name;
  if (!name) return;
  var _gv = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var agentMd = _gv('agentMdContent');
  var soulMd = _gv('agentSoulContentFiles');
  var ok = true;
  try {
    if (agentMd.trim()) {
      var r1 = await fetch('/api/agents/' + encodeURIComponent(name) + '/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: agentMd })
      });
      var d1 = await r1.json();
      if (!d1 || !d1.success) ok = false;
    }
    if (soulMd.trim()) {
      var r2 = await fetch('/api/agents/' + encodeURIComponent(name) + '/soul', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: soulMd })
      });
      var d2 = await r2.json();
      if (!d2 || !d2.success) ok = false;
    }
    if (showToast !== false) {
      if (ok) toast && toast.success && toast.success('文件已保存');
      else toast && toast.error && toast.error('部分文件保存失败');
    }
  } catch(e) {
    if (showToast !== false) toast && toast.error && toast.error('保存失败');
  }
}

/** Save model selections: chat model, vision model, available models */
async function _saveAgentModels(showToast) {
  var name = _chatCurrentAgent && _chatCurrentAgent.name;
  if (!name) return;
  var chatSel = document.getElementById('agentDefaultChatModel');
  var visionSel = document.getElementById('agentDefaultVisionModel');
  var mcbList = document.querySelectorAll('#agentModelListSection .agent-avail-mcb:checked');
  var availableModels = Array.prototype.map.call(mcbList, function(cb) { return cb.value; });
  var body = {
    default_chat_model: chatSel ? chatSel.value : '',
    default_vision_model: visionSel ? visionSel.value : '',
    available_models: availableModels,
  };
  try {
    var resp = await fetch('/api/agents/' + encodeURIComponent(name) + '/meta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var result = await resp.json();
    if (showToast !== false) {
      if (result && result.success) toast && toast.success && toast.success('模型设置已保存');
      else toast && toast.error && toast.error('模型保存失败');
    }
    // 保存成功后，从 /api/agents 拉取最新完整数据，更新 page_cache 并广播事件
    if (result && result.success) {
      try {
        var _freshResp = await fetch('/api/agents');
        var _freshData = await _freshResp.json();
        var _freshAgent = _freshData.agents && _freshData.agents.find(function(a) { return a.name === name; });
        if (_freshAgent && typeof window.__getPageCache === 'function' && typeof window.__setPageCache === 'function') {
          var _pcAgents = window.__getPageCache('agents') || [];
          var _pcIdx = _pcAgents.findIndex(function(a) { return a.name === name; });
          if (_pcIdx >= 0) {
            _pcAgents[_pcIdx].available_models = _freshAgent.available_models;
            window.__setPageCache('agents', _pcAgents);
          } else {
            _pcAgents.push({name: name, available_models: _freshAgent.available_models});
            window.__setPageCache('agents', _pcAgents);
          }
          document.dispatchEvent(new CustomEvent('siper-models-changed', {bubbles: true, detail: {agent: name, models: _freshAgent.available_models || []}}));
        }
      } catch(_) {}
    }
  } catch(e) {
    if (showToast !== false) toast && toast.error && toast.error('模型保存失败');
  }
}

// chatSwitchPage
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
  // 如果尚未设置 agent，从 page_cache 或 agents 列表中选择默认 agent
  if (!hasAgent && hasSession) {
    var cachedAgents = (typeof window.__getPageCache === 'function') ? (window.__getPageCache('agents') || []) : [];
    if (cachedAgents.length > 0 && typeof setChatCurrentAgent === 'function') {
      var defaultAgent = cachedAgents.find(function(a) { return a.name === 'default'; }) || cachedAgents[0];
      setChatCurrentAgent(defaultAgent);
      hasAgent = true;
    }
  }
  var showInput = hasSession && hasAgent;

  var headerName = document.getElementById('chatRightHeaderName');
  if (!showInput) {
    if (headerName) headerName.textContent = '选择一个 Agent 开始对话';
  } else if (headerName && _chatCurrentAgent) {
    // 直接设置标题（不依赖 Input.updateChatHeader，避免模块间时序问题）
    var agentDisplay = _chatCurrentAgent.display_name || _chatCurrentAgent.name;
    headerName.textContent = agentDisplay + ' — ' + (_chatSessionId ? _chatSessionId.substring(0, 8) : '');
  }

  // 首次渲染：创建消息容器 + 输入框；后续切换会话只更新输入框区域
  var existingMessages = document.getElementById('chatMessages');
  if (!existingMessages) {
    if (showInput) {
      container.innerHTML =
        '<div class="siper-messages" id="chatMessages" aria-live="polite" aria-atomic="false">' +
          '<div class="siper-empty-state" id="chatEmptyState"><div class="siper-empty-state-icon">💬</div><div>通过agent发送消息</div></div>' +
        '</div>' +
        '<div class="siper-input-area" id="chatInputArea"></div>';
    }
    // showInput=false 时不创建消息容器，防止 WS 推送的历史消息污染初始页面
  } else {
    // 保留消息容器，只更新输入框区域
    var existingInput = document.getElementById('chatInputArea');
    if (showInput) {
      if (existingInput) {
        existingInput.innerHTML = '';
      } else {
        var newInput = document.createElement('div');
        newInput.className = 'siper-input-area';
        newInput.id = 'chatInputArea';
        container.appendChild(newInput);
      }
    } else {
      if (existingInput) existingInput.remove();
    }
    // 移除旧的 "+ 新增智能体" 按钮（如果存在）
    var oldAddBtn = container.querySelector('.js-btn-add-agent');
    if (oldAddBtn) oldAddBtn.remove();
  }

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
      // page_cache 尚未就绪（首次加载/WS重连），主动加载 agents
      loadAndRenderAgents();
    } else {
      Sidebar.renderMiddleList();
    }
  }
  if (showInput) Input.loadChatModels();
}


function _tplInputArea() {
  return '' +
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
      '<textarea id="chatInput" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="3" aria-label="聊天输入"></textarea>' +
      '<button class="siper-send-btn" id="chatSendBtn" onclick="chatSendMessage()">发送</button>' +
      '<button class="siper-stop-btn hidden" id="chatStopBtn" onclick="chatStopGeneration()" title="停止生成">⏹</button>' +
    '</div>';
}

/** 输入框：填充到 container 内的 siper-input-area 容器中 */
function renderInputArea() {
  var area = document.getElementById('chatInputArea');
  if (!area) return;
  // 移除 _ensureChatInput 创建的旧版 wrapper（如果存在）
  var oldWrapper = document.getElementById('chatInputWrapper');
  if (oldWrapper) oldWrapper.remove();
  area.innerHTML = _tplInputArea();
}
window.renderChatPage = renderChatPage;