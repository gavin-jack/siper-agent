// pages/chat.js — 聊天页面薄入口
// 从 page-chat.js (3150行) 拆分，此文件仅做 ESM 导入 + window 挂载

// Utils
import { escapeHtml } from '../utils/escape.js';
import { showDictModal } from '../components/toast.js';

// Chat modules
import { chatCurrentPage, chatSidebarExpanded, chatAgents, chatSessionId, chatCurrentAgent, setCurrentPage } from '../chat/state.js';
import * as Stream from '../chat/stream.js';
import * as Message from '../chat/message.js';
import * as Input from '../chat/input.js';
import * as Sidebar from '../chat/sidebar.js';
import * as Lang from '../chat/lang.js';
import * as Toast from '../chat/toast.js';

// Sub-page ESM modules (for renderMemoryPage / renderThemePage)
import * as Memory from './memory.js';
import * as Theme from './theme.js';

// DOM utils
import { addMsg, appendMeta, debugHighlight, loadRecentSession, navigateToPage } from '../utils/dom.js';
import { isSessionUnread } from '../chat/sidebar.js';
import { updateCtxInfoDisplay } from '../chat/message.js';
import { fmtTokens } from '../chat/state.js';
import { updateCtxFromStreamEnd } from '../chat/stream.js';
import { closeChatModelDropdown, updateChatHeader } from '../chat/input.js';

// ===== Page Config =====
const CHAT_PAGES = {
  chat:    { title: '对话', icon: '💬' },
  skills:    { title: '技能管理', icon: '🧩' },
  token:     { title: 'Token 用量', icon: '📊' },
  'global-settings': { title: '全局设置', icon: '⚙️' },
  'model-settings': { title: '模型管理', icon: '🤖' },
  logs:      { title: '系统日志', icon: '📜' },
};

// ===== Init =====
// bindChatInput 必须在 ESM 顶层调用（不能放 DOMContentLoaded），
// 因为 ESM <script type="module"> 默认 defer，晚于 DOMContentLoaded 执行，
// 导致监听器永远错过事件。
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

  // Clean up page-specific header buttons
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
    case 'skills':    renderSkillsPageChat(content); break;
    case 'token':     renderTokenPageChat(content); break;
    case 'global-settings': renderSettingsPageChat(content); break;
    case 'model-settings': renderModelSettingsPageChat(content); break;
    case 'logs':      renderLogsPageChat(content); break;
  }
}

// ===== Chat Page =====
export function renderChatPage(container, skipSidebar) {
  container.className = 'siper-content siper-chat-mode';
  const hasSession = !!chatSessionId;
  const hasAgent = !!chatCurrentAgent;
  const showInput = hasSession && hasAgent;
  if (!showInput) {
    const headerName = document.getElementById('chatRightHeaderName');
    if (headerName) headerName.textContent = '选择一个 Agent 开始对话';
  } else if (typeof Input.updateChatHeader === 'function') {
    Input.updateChatHeader();
  }
  container.innerHTML = `
    <div class="siper-thinking-panel" id="chatThinkingPanel">
      <div class="siper-thinking-header"><span class="siper-thinking-icon">💭</span><span>正在思考</span></div>
      <div class="siper-thinking-body" id="chatThinkingBody"></div>
    </div>
    <div class="siper-messages" id="chatMessages" aria-live="polite" aria-atomic="false">
      <div class="siper-empty-state" id="chatEmptyState"><div class="siper-empty-state-icon">💬</div><div>通过agent发送消息</div></div>
    </div>
    ${showInput ? `\n    <div class="siper-input-area">
      <div class="siper-input-toolbar">
        <input type="file" id="chatFileInput" multiple class="hidden" onchange="handleChatFileSelect(event)" aria-label="上传文件">
        <button class="siper-attach-btn" onclick="document.getElementById('chatFileInput').click()" title="上传文件">📎</button>
        <div class="siper-model-dropdown" id="chatModelDropdown">
          <button class="siper-model-btn" id="chatModelBtn" onclick="toggleChatModelDropdown()">
            <span class="siper-model-btn-name" id="chatModelBtnName">默认模型</span>
            <span class="siper-model-btn-arrow">▾</span>
          </button>
          <div class="siper-model-menu" id="chatModelMenu"></div>
        </div>
        <div class="siper-ctx-info" id="chatCtxInfo" title="当前会话上下文使用量">
          <span class="siper-ctx-label">上下文</span>
          <span class="siper-ctx-value" id="chatCtxValue">--/--</span>
          <span class="siper-ctx-pct" id="chatCtxPct">--%</span>
        </div>
      </div>
      <div id="chatFilePreviewContainer" class="siper-file-preview-container hidden"></div>
      <div class="siper-input-row">
        <textarea id="chatInput" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="1" aria-label="聊天输入"></textarea>
        <button class="siper-send-btn" id="chatSendBtn" onclick="chatSendMessage()">发送</button>
        <button class="siper-stop-btn hidden" id="chatStopBtn" onclick="chatStopGeneration()" title="停止生成">⏹</button>
      </div>
    </div>` : ''}
  `;
  if (!showInput) {
    // Add "+" button in top-right corner for creating new agent
    const addBtn = document.createElement('button');
    addBtn.className = 'siper-btn';
    addBtn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10;padding:4px 12px;font-size:13px;';
    addBtn.textContent = '+ 新增智能体';
    addBtn.tabIndex = 0;
    addBtn.onclick = function() { if (typeof window.showAddAgentModal === 'function') window.showAddAgentModal(); };
    container.style.position = 'relative';
    container.appendChild(addBtn);
  }
  if (showInput) {
    setTimeout(() => Input.bindChatInput(), 0);
    Message.chatLoadSessionMessages(chatSessionId);
  }
  if (!skipSidebar) {
    if (chatAgents.length === 0) Sidebar.loadChatAgents();
    else Sidebar.renderMiddleList();
  }
  Input.loadChatModels();
}

// ===== Page Lifecycle =====
export function onChatPageEnter() { chatSwitchPage('chat', true); }

// ===== Sub-page renderers (delegated to ESM pages) =====
// These are kept here for backward compat with HTML onclick handlers
// The actual logic is in the ESM page modules

function renderSkillsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="siper-page-toolbar"><button class="siper-btn" onclick="window.refreshSkills()">刷新</button></div><div id="chatSkillsList"></div>`;
  if (typeof window.refreshSkills === 'function') window.refreshSkills();
}

function renderTokenPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="token-stats" id="chatTokenStats"></div><div class="siper-token-charts-row"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📊 分模型 Token 分布</div><div id="chatChartModel" style="width:100%;height:240px;"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⏰ 24小时 Token 分布</div><div id="chatChartHourly" style="width:100%;height:240px;"></div></div></div><div class="siper-token-chart-card card-hover" style="margin-top:12px;"><div class="siper-token-chart-title">📈 每日 Token 趋势</div><div id="chatChartDate" style="width:100%;height:240px;"></div></div><div class="siper-token-charts-row" style="margin-top:12px;"><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">⚡ 模型效率对比</div><div id="chatChartEfficiency" style="width:100%;height:240px;"></div></div><div class="siper-token-chart-card card-hover"><div class="siper-token-chart-title">📅 活跃时段热力图</div><div id="chatChartHeatmap" style="width:100%;height:240px;"></div></div></div>`;
  if (typeof window.refreshTokenStats === 'function') window.refreshTokenStats();
}

function renderSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="siper-page-toolbar" style="justify-content:space-between;flex-wrap:wrap;gap:8px;"><div class="siper-settings-tabs" id="settingsTabs"><button class="siper-settings-tab active" data-tab="system" onclick="window.switchSettingsTab('system')">系统参数</button><button class="siper-settings-tab" data-tab="agents" onclick="window.switchSettingsTab('agents')">Agent管理</button></div><div style="display:flex;gap:6px;flex-shrink:0;"><button class="siper-btn" onclick="window.resetSystemParams()">重置</button><button class="siper-btn" onclick="window.refreshGlobalSettings()">刷新</button></div></div><div id="chatGlobalSettings"><div id="chatSystemSettings" style="display:none;"><div class="siper-settings-section"><div class="siper-settings-section-title">运行时</div><div class="siper-settings-row"><label>WS 心跳超时 (秒)</label><input type="number" id="sysWsHeartbeatTimeout" class="siper-input" min="60" max="3600" value="300" aria-label="WS 心跳超时"></div><div class="siper-settings-row"><label>会话列表加载数</label><input type="number" id="sysSessionListLimit" class="siper-input" min="10" max="500" value="50" aria-label="会话列表加载数"></div><div class="siper-settings-row"><label>日志缓冲区大小</label><input type="number" id="sysLogBufferSize" class="siper-input" min="100" max="10000" value="2000" aria-label="日志缓冲区大小"></div><div class="siper-settings-row"><label>Token 记录上限</label><input type="number" id="sysTokenUsageMax" class="siper-input" min="100" max="5000" value="500" aria-label="Token 记录上限"></div><div class="siper-settings-row"><label>上下文窗口默认值</label><input type="number" id="sysCtxWindowDefault" class="siper-input" min="1024" max="1000000" value="8192" aria-label="上下文窗口默认值"></div></div></div></div><div id="chatGlobalAgents" style="display:none;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div class="siper-settings-section-title" style="margin:0">智能体管理</div><button class="siper-btn primary" onclick="window.showAddAgentModal()" style="padding:6px 16px;font-size:13px">+ 新增智能体</button></div><div id="globalAgentCards" class="agent-cards-grid"></div><div id="globalAgentCardDetail" class="agent-card-detail" style="display:none"></div></div><div id="chatGlobalModels" style="display:none;"><span id="chatSettingsModelCount" class="text-dim" style="font-size:12px;"></span><div id="chatSettingsModelsList"></div></div>`;
  window._currentSettingsTab = 'system';
  // 内联绑定系统参数 auto-save（避免 ESM 跨模块引用 attachSettingsAutoSaveListeners）
  (function(){
    let timer = null;
    const fields = ['sysWsHeartbeatTimeout','sysSessionListLimit','sysLogBufferSize','sysTokenUsageMax','sysCtxWindowDefault','sysPort','sysLogLevel'];
    function doSave(){
      if(timer) clearTimeout(timer);
      timer = setTimeout(async()=>{
        const sys = {
          ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value)||300,
          session_list_limit: parseInt(document.getElementById('sysSessionListLimit').value)||50,
          log_buffer_size: parseInt(document.getElementById('sysLogBufferSize').value)||2000,
          token_usage_max: parseInt(document.getElementById('sysTokenUsageMax').value)||500,
          context_window_default: parseInt(document.getElementById('sysCtxWindowDefault').value)||8192,
          port: parseInt(document.getElementById('sysPort')?.value)||9724,
          log_level: document.getElementById('sysLogLevel')?.value||'INFO',
        };
        try{
          const r = await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:sys})});
          const d = await r.json();
          if(d.success){if(typeof toast!=='undefined'&&toast)toast.success('系统参数已保存',1000);}
          else{if(typeof toast!=='undefined'&&toast)toast.error('保存失败: '+(d.error||'unknown'));}
        }catch(e){if(typeof toast!=='undefined'&&toast)toast.error('保存失败: '+e.message);}
      },500);
    }
    fields.forEach(id=>{
      const el = document.getElementById(id);
      if(el){el.addEventListener('input',doSave);if(el.tagName==='SELECT')el.addEventListener('change',doSave);}
    });
  })();
  // Show system tab content by default
  const sysEl = document.getElementById('chatSystemSettings');
  if (sysEl) sysEl.style.display = '';
  if (typeof window.refreshGlobalSettings === 'function') window.refreshGlobalSettings();
  _populateSettingsFields();
  // Pre-render agents tab
  if (typeof window.renderGlobalAgents === 'function') {
    window.renderGlobalAgents();
  }
}


function _populateSettingsFields() {
  fetch('/api/config').then(r => r.json()).then(data => {
    const sys = data.system || {};
    const fields = { sysWsHeartbeatTimeout: sys.ws_heartbeat_timeout, sysSessionListLimit: sys.session_list_limit, sysLogBufferSize: sys.log_buffer_size, sysTokenUsageMax: sys.token_usage_max, sysCtxWindowDefault: sys.context_window_default };
    for (const [id, val] of Object.entries(fields)) { const el = document.getElementById(id); if (el && val != null) el.value = val; }
  }).catch(() => {});
}

function renderModelSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div style="display:flex;gap:12px;align-items:flex-start;">
  <div class="siper-form-card" style="flex:1;min-width:0;display:flex;flex-direction:column;">
    <div class="siper-form-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span>可用模型</span>
      <div style="flex:1;min-width:0;"></div>
      <div style="position:relative;display:flex;align-items:center;width:160px;flex-shrink:0;">
        <input type="text" id="modelSearchInput" placeholder="搜索模型..." class="siper-input" style="width:100%;height:28px;padding:0 24px 0 8px;box-sizing:border-box;font-size:12px;" oninput="window.filterModelsList()">
        <span id="modelSearchClear" onclick="window.clearModelSearch()" style="display:none;position:absolute;right:6px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:14px;color:var(--color-text-dim);line-height:1;" title="清空">✕</span>
      </div>
      <div id="capFilterDropdown" style="position:relative;display:inline-block;">
        <button id="capFilterBtn" class="siper-input" style="height:28px;padding:0 8px;font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;" onclick="window.toggleCapFilterDropdown()" aria-label="按功能筛选">
          <span id="capFilterLabel">全部功能</span>
        </button>
        <div id="capFilterMenu" style="display:none;position:absolute;top:100%;right:0;margin-top:2px;background:var(--bg-card);border:1px solid var(--color-border);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:200;min-width:200px;padding:0;">
          <div style="padding:6px 10px;display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--color-border);">
            <div class="cap-filter-option" data-cap="chat" onclick="window.selectCapFilter('chat')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 💬对话
            </div>
            <div class="cap-filter-option" data-cap="vision" onclick="window.selectCapFilter('vision')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 👁视觉
            </div>
            <div class="cap-filter-option" data-cap="reasoning" onclick="window.selectCapFilter('reasoning')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 🧠推理
            </div>
            <div class="cap-filter-option" data-cap="code" onclick="window.selectCapFilter('code')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 💻代码
            </div>
            <div class="cap-filter-option" data-cap="function_calling" onclick="window.selectCapFilter('function_calling')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 🔧工具
            </div>
            <div class="cap-filter-option" data-cap="tts" onclick="window.selectCapFilter('tts')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 🔊语音
            </div>
            <div class="cap-filter-option" data-cap="embedding" onclick="window.selectCapFilter('embedding')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 📎嵌入
            </div>
            <div class="cap-filter-option" data-cap="image_gen" onclick="window.selectCapFilter('image_gen')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 🎨生图
            </div>
            <div class="cap-filter-option" data-cap="long_context" onclick="window.selectCapFilter('long_context')" style="padding:3px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid var(--color-border);border-radius:4px;user-select:none;">
              <input type="checkbox" style="margin:0;cursor:pointer;pointer-events:none;"> 📏长上下文
            </div>
          </div>
          <div style="display:flex;gap:6px;padding:6px 10px;">
            <button class="siper-btn" style="flex:1;height:24px;padding:0 8px;font-size:11px;border-radius:4px;" onclick="window.clearCapFilter()">清除</button>
            <button class="siper-btn primary" style="flex:1;height:24px;padding:0 8px;font-size:11px;border-radius:4px;" onclick="window.applyCapFilter()">确定</button>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:2px;">
        <select id="modelSortBy" class="siper-input" style="width:auto;height:28px;padding:0 8px;box-sizing:border-box;font-size:12px;border-radius:4px 0 0 4px;border-right:none;" onchange="window.filterModelsList()" aria-label="排序">
          <option value="name">按名称</option>
          <option value="ttft">按响应时间</option>
          <option value="latency">按延迟</option>
          <option value="context">按上下文窗口</option>
          <option value="caps">按能力数量</option>
        </select>
        <button id="sortDirBtn" class="siper-input" style="height:28px;padding:0 6px;font-size:12px;border-radius:0 4px 4px 0;cursor:pointer;" onclick="window.toggleSortDir()" title="切换排序方向">↑</button>
      </div>
      <button class="siper-btn primary" style="height:28px;padding:0 12px;font-size:12px;" onclick="window.verifyAllModels()">验证全部</button>
    </div>
    <div id="settingsModelsList"></div>
  </div>
  <div class="siper-form-card" style="width:380px;flex-shrink:0;display:flex;flex-direction:column;">
    <div class="siper-form-title">🔍 自动发现模型</div>
    <div style="display:flex;gap:6px;align-items:end;margin-bottom:6px;">
      <div style="flex:1;">
        <div class="text-dim" style="font-size:11px;margin-bottom:2px;height:16px;line-height:16px;">Provider</div>
        <select id="providerPreset" class="siper-input" style="width:100%;height:32px;padding:0 8px;box-sizing:border-box;" onchange="window.applyProviderPreset()" aria-label="Provider 预设">
          <option value="">— 选择 —</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="deepseek">DeepSeek</option>
          <option value="moonshot">Moonshot</option>
          <option value="qwen">Qwen</option>
          <option value="longcat">LongCat</option>
          <option value="zhipuai">ZhipuAI</option>
          <option value="minimax">MiniMax</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
          <option value="ollama">Ollama</option>
          <option value="custom">自定义</option>
        </select>
      </div>
      <div style="flex:1.5;">
        <div class="text-dim" style="font-size:11px;margin-bottom:2px;height:16px;line-height:16px;">Base URL</div>
        <input type="text" class="siper-input" id="discoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL" style="width:100%;height:32px;padding:0 8px;box-sizing:border-box;">
      </div>
    </div>
    <div style="margin-bottom:6px;">
      <div class="text-dim" style="font-size:11px;margin-bottom:2px;height:16px;line-height:16px;">API Key</div>
      <input type="password" class="siper-input" id="discoverApiKey" placeholder="sk-..." aria-label="发现 API Key" style="width:100%;height:32px;padding:0 8px;box-sizing:border-box;">
    </div>
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
      <button class="siper-btn primary" onclick="window.discoverModels()">获取模型列表</button>
      <div id="discoverFilterWrap" style="flex:1;display:none;position:relative;">
        <input type="text" class="siper-input" id="discoverFilter" placeholder="筛选模型..." aria-label="筛选发现的模型" style="width:100%;height:32px;padding:0 28px 0 8px;box-sizing:border-box;" oninput="window.chatFilterDiscovered()">
        <button id="discoverFilterClear" onclick="window.chatClearDiscoverFilter()" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--color-text-dim);cursor:pointer;font-size:16px;line-height:1;padding:2px 4px;display:none;" title="清空筛选">×</button>
      </div>
    </div>
    <div id="discoverResult" style="overflow-y:auto;flex:1;min-height:0;"></div>
  </div>
</div>`;
  // Add reset button to chat header
  const header = document.getElementById('chatRightHeader');
  if (header && !header.querySelector('.siper-chat-header-btn')) {
    const btn = document.createElement('button');
    btn.className = 'siper-chat-header-btn siper-chat-header-btn-text';
    btn.textContent = '重置';
    btn.onclick = () => { if (typeof window.resetSettingsModels === 'function') window.resetSettingsModels(); };
    header.appendChild(btn);
  }

  if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
}

function renderLogsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="siper-page-toolbar" style="flex-wrap:wrap;gap:6px;"><button class="siper-btn" onclick="window.refreshLogs()">刷新</button><button class="siper-btn danger" onclick="window.clearLogs()">清空显示</button><input type="text" id="chatLogSearchInput" placeholder="搜索..." class="siper-input" style="width:140px;" oninput="window.applyLogLogsDebounced()" aria-label="日志搜索"><select id="chatLogLogLevel" class="siper-input" style="width:auto;" onchange="window.applyChatLogLevelFilter()" aria-label="日志级别"><option value="">全部级别</option><option value="DEBUG">DEBUG</option><option value="INFO">INFO</option><option value="WARN">WARN</option><option value="ERROR">ERROR</option></select><select id="logSourceFilter" class="siper-input" style="width:auto;" onchange="window.applyLogFilters()" aria-label="日志来源"><option value="">全部来源</option></select><span id="chatLogStats" class="text-dim" style="font-size:12px;"></span></div><div id="logLevelFilters" style="margin-bottom:6px;"></div><div id="chatLogsList" style="font-family:monospace;font-size:12px;line-height:1.8;"></div><div id="chatLogPagination"></div>`;
  if (typeof window.refreshLogs === 'function') window.refreshLogs();
}

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
// openImageLightbox 由 toast.js 统一提供，不再用 Input.openImageLightbox
window.getChatFileCategory = Input.getChatFileCategory;
window.renderChatFilePreviews = Input.renderChatFilePreviews;
window.renderChatModelDropdown = Input.renderChatModelDropdown;
window.closeChatModelDropdown = Input.closeChatModelDropdown;
window.loadChatModels = Input.loadChatModels;
window.updateChatHeader = Input.updateChatHeader;

// DOM utils
window.addMsg = addMsg;
window.appendMeta = appendMeta;
window.debugHighlight = debugHighlight;
window.loadRecentSession = loadRecentSession;
window.isSessionUnread = isSessionUnread;
window.chatFmt = fmtTokens;
window.updateCtxInfoDisplay = updateCtxInfoDisplay;
window.updateCtxFromStreamEnd = updateCtxFromStreamEnd;

// Thinking
window.chatThinkingShow = Stream.chatThinkingShow;
window.chatThinkingHide = Stream.chatThinkingHide;
window.chatThinkingClear = Stream.chatThinkingClear;
window.chatThinkingAddToolStep = Stream.chatThinkingAddToolStep;
window.chatThinkingAddTextRow = Stream.chatThinkingAddTextRow;

// Sidebar / sessions
window.loadChatAgents = Sidebar.loadChatAgents;
window.chatLoadAllSessions = Sidebar.chatLoadAllSessions;
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

// Sub-page renderers (for HTML onclick)
window.renderTasksPage = () => {}; // deprecated, ESM handles it
window.renderSkillsPage = () => {};
window.renderTokenPage = () => {};
window.renderSettingsPage = () => {};
window.renderLogsPage = () => {};
window.renderAgentPage = Sidebar.renderAgentPage;
window.renderMemoryPage = () => {
  const container = document.getElementById('chatContentArea');
  if (!container) return;
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
    <div class="siper-page-toolbar">
      <button class="siper-btn primary" onclick="window.saveMemoryMd()">保存记忆</button>
      <button class="siper-btn" onclick="window.refreshMemoryPage()">刷新</button>
    </div>
    <div id="memoryPageContent"></div>
  `;
  if (typeof Memory.populateMemoryAgentSelector === 'function') {
    Memory.populateMemoryAgentSelector().then(() => {
      if (typeof Memory.refreshMemoryPage === 'function') Memory.refreshMemoryPage();
    });
  }
};
window.renderThemePage = () => {
  const container = document.getElementById('chatContentArea');
  if (!container) return;
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
    <div class="siper-form-card">
      <div class="siper-form-title">主题色</div>
      <div id="chatThemeColors" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>
    <div class="siper-form-card">
      <div class="siper-form-title">主题模板</div>
      <div id="chatThemeTemplates"></div>
    </div>
  `;
  if (typeof Theme.showThemeSettings === 'function') Theme.showThemeSettings();
};

// Sub-page data loaders (legacy names)
window.loadChatTasks = () => {};
window.showChatTaskForm = () => {};
window.hideChatTaskForm = () => {};
window.saveChatTask = () => {};
window.toggleChatTask = () => {};
window.deleteChatTask = () => {};
window.loadChatSkills = () => {};
window.loadChatMemory = () => { if (typeof Memory.refreshMemoryPage === 'function') Memory.refreshMemoryPage(); };
window.saveChatMemory = () => { if (typeof Memory.saveMemoryMd === 'function') Memory.saveMemoryMd(); };
window.loadChatMemoryConfig = () => { if (typeof Memory.refreshMemoryConfig === 'function') Memory.refreshMemoryConfig(); };
window.saveChatMemoryConfig = () => { if (typeof Memory.saveMemoryConfig === 'function') Memory.saveMemoryConfig(); };
window.loadTokenStatsChat = () => {};
window.loadChatThemeTemplates = () => {};
window.applyChatTheme = () => {};
window.loadChatThemeSettings = () => {};
window.setChatThemeColor = () => {};
window.chatRemoveModel = () => {}; // mounted by app.js from Settings
window.chatSaveGlobalModels = () => {}; // mounted by app.js from Settings
window.chatApplyProviderPreset = () => {}; // mounted by app.js from Settings
window.chatDiscoverModels = () => {}; // mounted by app.js from Settings
window.chatAddDiscoveredModel = () => {}; // mounted by app.js from Settings
window.loadChatLogs = () => {};
window.chatRenderLogs = () => {};
window.chatFilterLogs = () => {};
window.clearChatLogs = () => {};

// Language
window.toggleChatLangDropdown = Lang.toggleChatLangDropdown;
window.selectChatLang = Lang.selectChatLang;

// Toast
window.showChatToast = Toast.showChatToast;
window.chatConfirm = Toast.chatConfirm;

// ECharts (legacy)
window.renderChatECharts = () => {};
window.initChatCharts = () => {};

// Copy/Insert
window.copyChatMsg = copyChatMsg;
window.insertChatMsg = insertChatMsg;

// Stop handler
window.chatHandleStopped = Stream.chatHandleStopped;

