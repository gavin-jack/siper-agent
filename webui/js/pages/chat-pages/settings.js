// chat-pages/settings.js — 全局设置页面渲染
// 从 pages/chat.js 拆分
// 包含系统参数和 Agent 管理两个 tab

export function switchSettingsTab(tab) {
  const tabs = document.querySelectorAll('#settingsTabs .siper-settings-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const sysEl = document.getElementById('chatSystemSettings');
  const agentEl = document.getElementById('chatGlobalAgents');
  if (sysEl) sysEl.classList.toggle('js-hidden', tab !== 'system');
  if (agentEl) agentEl.classList.toggle('js-hidden', tab !== 'agents');
  window._currentSettingsTab = tab;
}

export function resetSystemParams() {
  const defaults = { sysWsHeartbeatTimeout: 300, sysSessionListLimit: 50, sysLogBufferSize: 2000, sysTokenUsageMax: 500, sysCtxWindowDefault: 8192 };
  for (const [id, val] of Object.entries(defaults)) { const el = document.getElementById(id); if (el) el.value = val; }
  if (typeof toast !== 'undefined' && toast) toast.success('已恢复默认值', 1000);
}

export function refreshGlobalSettings() {
  _populateSettingsFields();
  if (window.renderGlobalAgents) window.renderGlobalAgents();
}

export function renderSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `<div class="siper-page-toolbar js-toolbar-flex-wrap"><div class="siper-settings-tabs" id="settingsTabs"><button class="siper-settings-tab active" data-tab="system" onclick="window.switchSettingsTab('system')">系统参数</button><button class="siper-settings-tab" data-tab="agents" onclick="window.switchSettingsTab('agents')">Agent管理</button></div><div class="js-flex-shrink-0"><button class="siper-btn" onclick="window.resetSystemParams()">重置</button><button class="siper-btn" onclick="window.refreshGlobalSettings()">刷新</button></div></div><div id="chatGlobalSettings"><div id="chatSystemSettings" class="js-hidden"><div class="siper-settings-section"><div class="siper-settings-section-title">运行时</div><div class="siper-settings-row"><label>WS 心跳超时 (秒)</label><input type="number" id="sysWsHeartbeatTimeout" class="siper-input" min="60" max="3600" value="300" aria-label="WS 心跳超时"></div><div class="siper-settings-row"><label>会话列表加载数</label><input type="number" id="sysSessionListLimit" class="siper-input" min="10" max="500" value="50" aria-label="会话列表加载数"></div><div class="siper-settings-row"><label>日志缓冲区大小</label><input type="number" id="sysLogBufferSize" class="siper-input" min="100" max="10000" value="2000" aria-label="日志缓冲区大小"></div><div class="siper-settings-row"><label>Token 记录上限</label><input type="number" id="sysTokenUsageMax" class="siper-input" min="100" max="5000" value="500" aria-label="Token 记录上限"></div><div class="siper-settings-row"><label>上下文窗口默认值</label><input type="number" id="sysCtxWindowDefault" class="siper-input" min="1024" max="1000000" value="8192" aria-label="上下文窗口默认值"></div></div></div></div><div id="chatGlobalAgents" class="js-hidden"><div class="js-header-flex"><div class="siper-settings-section-title js-m-0">智能体管理</div><button class="siper-btn primary js-add-agent-btn" onclick="window.showAddAgentModal()">+ 新增智能体</button></div><div id="globalAgentCards" class="agent-cards-grid"></div><div id="globalAgentCardDetail" class="agent-card-detail" class="js-hidden"></div></div><div id="chatGlobalModels" class="js-hidden"><span id="chatSettingsModelCount" class="text-dim" class="js-text-xs"></span><div id="chatSettingsModelsList"></div></div>`;
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
  if (sysEl) sysEl.classList.remove('js-hidden');
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
  }).catch(e => { console.error('[settings] _populateSettingsFields failed:', e); });
}