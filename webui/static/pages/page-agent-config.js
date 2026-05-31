// ===== Agent Config Page =====
// ===== Model =====
// ===== Agent Settings & Models =====
let globalModelsList = [];     // cached global models list
let modelsLoaded = false;      // whether models have been loaded for current session
let _pendingAgentModels = null; // saved agent model refs waiting for renderAgentModelSection

function applyAgentModelRefs() {
  if (!_pendingAgentModels) return;
  const { avail, defChat, defVision } = _pendingAgentModels;
  document.querySelectorAll('.agent-avail-mcb').forEach(cb => {
    cb.checked = avail.includes(cb.value);
  });
  const chatSel = document.getElementById('agentDefaultChatModel');
  const visionSel = document.getElementById('agentDefaultVisionModel');
  if (chatSel) chatSel.value = defChat;
  if (visionSel) visionSel.value = defVision;
}

async function loadAgentSettings() {
  // When agent-config page opens, load settings for the currently selected agent
  if (currentConfigAgent && agentConfigData && agentConfigData.agents) {
    const agent = agentConfigData.agents.find(a => a.name === currentConfigAgent);
    if (agent) {
      document.getElementById('currentAgentLabel').textContent = '— ' + (agent.display_name || agent.name);
      document.getElementById('cfgAgentName').value = agent.display_name || agent.name || 'Siper Agent';
      document.getElementById('cfgAgentIcon').value = agent.icon || '🎭';
      document.getElementById('cfgAgentAvatar').value = agent.avatar || '';
      agentAvatarUrl = '/api/avatar';
      const av = document.getElementById('cfgAvatarPreview');
      if (agent.avatar) { av.src = '/api/avatar'; av.style.display = 'inline'; }
      else { av.src = '/api/avatar'; av.style.display = 'inline'; }
      const app = agent.appearance || {};
      const fontSize = parseInt(app.msg_font_size) || 18;
      document.getElementById('cfgAgentMsgFontSize').value = fontSize;
      document.getElementById('cfgAgentMsgFontSizeVal').textContent = fontSize + 'px';
      document.getElementById('cfgAgentMsgBg').value = app.msg_bg || '#1c2333';
      document.getElementById('cfgAgentMsgText').value = app.msg_text || '#e6edf3';
      document.getElementById('cfgAgentMsgBorder').value = app.msg_border || '#30363d';
      // Load per-agent session_timeout, max_tools, max_tool_rounds
      const agentMaxTools = agent.max_tools;
      const agentSessionTimeout = agent.session_timeout;
      const agentMaxToolRounds = agent.max_tool_rounds;
      if (agentMaxTools !== undefined && agentMaxTools !== null) {
        document.getElementById('agentCfgMaxTools').value = agentMaxTools;
      } else {
        try {
          const gr = await fetch('/api/config');
          const gd = await gr.json();
          document.getElementById('agentCfgMaxTools').value = gd.max_tools || 10;
        } catch(e) { document.getElementById('agentCfgMaxTools').value = 10; }
      }
      if (agentSessionTimeout !== undefined && agentSessionTimeout !== null) {
        document.getElementById('agentCfgSessionTimeout').value = agentSessionTimeout;
      } else {
        try {
          const gr = await fetch('/api/config');
          const gd = await gr.json();
          document.getElementById('agentCfgSessionTimeout').value = gd.session_timeout || 3600;
        } catch(e) { document.getElementById('agentCfgSessionTimeout').value = 3600; }
      }
      if (agentMaxToolRounds !== undefined && agentMaxToolRounds !== null) {
        document.getElementById('agentCfgMaxToolRounds').value = agentMaxToolRounds;
      } else {
        try {
          const gr = await fetch('/api/config');
          const gd = await gr.json();
          document.getElementById('agentCfgMaxToolRounds').value = gd.max_tool_rounds || 100;
        } catch(e) { document.getElementById('agentCfgMaxToolRounds').value = 100; }
      }
      // Load per-agent limits: llm_timeout, llm_max_tokens, llm_max_retries, max_history_messages, memory_max_tokens, skill_pre_filter_top_k
      document.getElementById('agentCfgLlmTimeout').value = agent.llm_timeout !== undefined ? agent.llm_timeout : 120;
      document.getElementById('agentCfgLlmMaxTokens').value = agent.llm_max_tokens !== undefined ? agent.llm_max_tokens : 8192;
      document.getElementById('agentCfgLlmMaxRetries').value = agent.llm_max_retries !== undefined ? agent.llm_max_retries : 2;
      document.getElementById('agentCfgMaxHistoryMessages').value = agent.max_history_messages !== undefined ? agent.max_history_messages : 50;
      document.getElementById('agentCfgMemoryMaxTokens').value = (agent.memory_integration && agent.memory_integration.max_tokens !== undefined) ? agent.memory_integration.max_tokens : 20000;
      document.getElementById('agentCfgSkillPreFilterTopK').value = agent.skill_pre_filter_top_k !== undefined ? agent.skill_pre_filter_top_k : 5;
      // Sync agent label for limits tab
      const _lblLimits = document.getElementById('currentAgentLabelLimits');
      if (_lblLimits) _lblLimits.textContent = '— ' + (agent.display_name || agent.name);
    }
  }
  // If no agent selected yet, fall back to global config for defaults
  if (!currentConfigAgent) {
    try {
      const r = await fetch('/api/config');
      const d = await r.json();
      document.getElementById('agentCfgMaxTools').value = d.max_tools || 10;
      document.getElementById('agentCfgSessionTimeout').value = d.session_timeout || 3600;
    } catch(e) {}
  }
  // Load global runtime settings (port, log_level)
  try {
    const cr = await fetch('/api/config');
    const cd = await cr.json();
    if (document.getElementById('cfgPort')) document.getElementById('cfgPort').value = cd.port || 9724;
    if (document.getElementById('cfgLogLevel')) document.getElementById('cfgLogLevel').value = cd.log_level || 'INFO';
  } catch(e) {}
  // Load global models list for agent model selection
  loadGlobalModelsForAgent();
}

async function loadGlobalModelsForAgent() {
  try {
    const r = await fetch('/api/models/global');
    const d = await r.json();
    globalModelsList = d.models || [];
    renderAgentModelSection(globalModelsList);
  } catch(e) {
    console.error('loadGlobalModelsForAgent error:', e);
  }
}

function renderAgentModelSection(models) {
  // Render into models tab: left = default model selects, right = available models checkboxes
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
  const capOrder = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };
  const modelOptions = models.map(m => {
    const alias = m.alias ? ` (${m.alias})` : '';
    return `<option value="${m.name}">${escapeHtml(m.name)}${escapeHtml(alias)}</option>`;
  }).join('');
  const checkboxes = models.map(m => {
    const alias = m.alias ? ` (${m.alias})` : '';
    const caps = (m.capabilities || []).slice().sort((a, b) => (capOrder[a] ?? 50) - (capOrder[b] ?? 50)).map(c => capIcons[c] || c).join('');
    return `<label style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer;font-size:12px">
      <input type="checkbox" value="${m.name}" class="agent-avail-mcb" onchange="autoSaveAgentModels()" data-name="${m.name}">
      <span style="font-weight:500">${escapeHtml(m.name)}</span>
      ${alias ? `<span style="color:var(--text-dim)">${escapeHtml(alias)}</span>` : ''}
      <span style="color:var(--text-dim);margin-left:auto;font-size:11px">${caps || '💬'}</span>
    </label>`;
  }).join('');

  // Left column: Default model selection
  const defaultContainer = document.getElementById('agentDefaultModelSection');
  if (defaultContainer) {
    defaultContainer.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">默认对话模型</div>
      <select id="agentDefaultChatModel" onchange="autoSaveAgentModels()" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:12px">
        <option value="">— 使用全局默认 —</option>${modelOptions}
      </select>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">默认视觉模型</div>
      <select id="agentDefaultVisionModel" onchange="autoSaveAgentModels()" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:12px">
        <option value="">— 使用全局默认 —</option>${modelOptions}
      </select>
    </div>
    <div class="flex-end-mt" style="font-size:11px;color:var(--text-dim)">✦ 自动保存</div>`;
  }

  // Right column: Available models list
  const listContainer = document.getElementById('agentModelListSection');
  if (listContainer) {
    listContainer.innerHTML = `
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">可用模型（勾选后该 agent 可在对话中使用）</div>
    <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--bg-input)">${checkboxes}</div>`;
  }
  // Apply any pending agent model refs now that DOM is ready
  applyAgentModelRefs();
}

async function saveAgentSettings() {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }
  const body = {
    name: document.getElementById('cfgAgentName').value,
    icon: document.getElementById('cfgAgentIcon').value,
    avatar: document.getElementById('cfgAgentAvatar').value,
    appearance: {
      msg_font_size: document.getElementById('cfgAgentMsgFontSize').value + 'px',
      msg_bg: document.getElementById('cfgAgentMsgBg').value,
      msg_text: document.getElementById('cfgAgentMsgText').value,
      msg_border: document.getElementById('cfgAgentMsgBorder').value,
    },
    max_tools: parseInt(document.getElementById('agentCfgMaxTools').value),
    max_tool_rounds: parseInt(document.getElementById('agentCfgMaxToolRounds').value),
    session_timeout: parseInt(document.getElementById('agentCfgSessionTimeout').value),
    llm_timeout: parseInt(document.getElementById('agentCfgLlmTimeout').value),
    llm_max_tokens: parseInt(document.getElementById('agentCfgLlmMaxTokens').value),
    llm_max_retries: parseInt(document.getElementById('agentCfgLlmMaxRetries').value),
    max_history_messages: parseInt(document.getElementById('agentCfgMaxHistoryMessages').value),
    skill_pre_filter_top_k: parseInt(document.getElementById('agentCfgSkillPreFilterTopK').value),
    memory_integration: {
      max_tokens: parseInt(document.getElementById('agentCfgMemoryMaxTokens').value),
    },
    port: parseInt(document.getElementById('cfgPort').value) || 9724,
    log_level: document.getElementById('cfgLogLevel').value || 'INFO',
  };
  // Save per-agent meta + global runtime (port/log_level)
  const r = await fetch('/api/agents/' + currentConfigAgent + '/meta', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.success) {
    // Also save global runtime settings
    await fetch('/api/config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        port: body.port,
        log_level: body.log_level,
      }),
    });
    toast.success(t('agent.saved'));
    refreshConfigAgentPanel();
  } else {
    toast.error(t('tasks.saveFailed') + ' ' + (d.error || t('tasks.unknownError')));
  }
}

let _agentModelAutoSaveTimer = null;

function autoSaveAgentModels() {
  if (_agentModelAutoSaveTimer) clearTimeout(_agentModelAutoSaveTimer);
  _agentModelAutoSaveTimer = setTimeout(async () => {
    if (!currentConfigAgent) return;
    const availModels = [];
    document.querySelectorAll('.agent-avail-mcb:checked').forEach(cb => availModels.push(cb.value));
    const body = {
      name: document.getElementById('cfgAgentName').value,
      available_models: availModels,
      default_chat_model: document.getElementById('agentDefaultChatModel') ? document.getElementById('agentDefaultChatModel').value : '',
      default_vision_model: document.getElementById('agentDefaultVisionModel') ? document.getElementById('agentDefaultVisionModel').value : '',
    };
    try {
      const r = await fetch('/api/agents/' + currentConfigAgent + '/meta', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) {
        toast.success(t('agent.modelSaved'), 1500);
        if (typeof loadAvailableModels === 'function') loadAvailableModels();
      }
      else toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
    } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
  }, 300);
}

async function saveAgentModelSettings() {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }
  // Collect available models from checkboxes
  const availModels = [];
  document.querySelectorAll('.agent-avail-mcb:checked').forEach(cb => availModels.push(cb.value));
  const body = {
    name: document.getElementById('cfgAgentName').value,
    available_models: availModels,
    default_chat_model: document.getElementById('agentDefaultChatModel') ? document.getElementById('agentDefaultChatModel').value : '',
    default_vision_model: document.getElementById('agentDefaultVisionModel') ? document.getElementById('agentDefaultVisionModel').value : '',
  };
  const r = await fetch('/api/agents/' + currentConfigAgent + '/meta', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.success) {
    toast.success(t('agent.saved'));
    refreshConfigAgentPanel();
  } else {
    toast.error(t('tasks.saveFailed') + ' ' + (d.error || t('tasks.unknownError')));
  }
}

// Legacy functions removed — model selection now handled by checkboxes + default selects in saveAgentSettings

// ===== Agent Config =====
let agentConfigData = { agents: [], active: 'default' };
let configAgentTab = 'soul'; // 'soul' | 'config'
let currentConfigAgent = '';
let cachedConfigSoulContent = '';
let cachedConfigAgentContent = '';
let cachedConfigMemoryContent = '';

async function refreshConfigAgentPanel() {
  try {
    const r = await fetch('/api/agents');
    agentConfigData = await r.json();
    const agents = agentConfigData.agents || [];
    const active = agentConfigData.active || 'default';

    // Update dropdown
    const sel = document.getElementById('agentSelector');
    const curSel = sel.value || active;
    sel.innerHTML = '<option value="">' + t('agent.selectConfigAgent') + '</option>';
    for (const a of agents) {
      const label = (a.display_name || a.name) + (a.is_active ? ' ●' : '');
      const opt = document.createElement('option');
      opt.value = a.name;
      opt.textContent = label;
      if (a.name === curSel) opt.selected = true;
      sel.appendChild(opt);
    }

    // Update soul badge
    document.getElementById('soulBadge').textContent = active;
    currentConfigAgent = active;

    // Stats
    document.getElementById('agentConfigStats').innerHTML = `
      <div class="stat-card"><div class="value">${agents.length}</div><div class="label">` + t('agent.available') + `</div></div>
      <div class="stat-card"><div class="value">${active}</div><div class="label">` + t('sessions.active') + `</div></div>
      <div class="stat-card"><div class="value">${agents.filter(a=>a.has_soul).length}</div><div class="label">soul.md</div></div>
      <div class="stat-card"><div class="value">${agents.filter(a=>a.has_config).length}</div><div class="label">agent.md</div></div>
    `;

    // Load active agent
    const activeAgent = agents.find(a => a.is_active);
    if (activeAgent) {
      selectConfigAgent(activeAgent.name);
    }
  } catch(e) {
    console.error('refreshConfigAgentPanel error:', e);
  }
}

function onConfigAgentSelectorChange(name) {
  if (!name) return;
  const agents = (agentConfigData && agentConfigData.agents) || [];
  const agent = agents.find(a => a.name === name);
  if (agent) {
    currentConfigAgent = name;
    selectConfigAgent(name);
  }
}

async function selectConfigAgent(name) {
  currentConfigAgent = name;
  const agents = (agentConfigData.agents || []);
  const agent = agents.find(a => a.name === name);
  if (!agent) return;

  // Load agent files (soul + config, no memory)
  let loadError = null;
  try {
    const [soulRes, configRes] = await Promise.all([
      fetch('/api/agents/' + name + '/soul'),
      fetch('/api/agents/' + name + '/config'),
    ]);
    if (!soulRes.ok || !configRes.ok) {
      loadError = 'API 返回错误 (' + soulRes.status + '/' + configRes.status + ')';
    }
    const soulData = await soulRes.json();
    const configData = await configRes.json();
    cachedConfigSoulContent = soulData.soul || '';
    cachedConfigAgentContent = configData.config || '';
    const soulTa = document.getElementById('agentSoulContent');
    const mdTa = document.getElementById('agentMdContent');
    if (soulTa) soulTa.value = cachedConfigSoulContent;
    if (mdTa) mdTa.value = cachedConfigAgentContent;
  } catch(e) {
    loadError = e.message;
    const soulTa = document.getElementById('agentSoulContent');
    const mdTa = document.getElementById('agentMdContent');
    if (soulTa) soulTa.value = '';
    if (mdTa) mdTa.value = '';
    // Show error in textareas
    if (soulTa) soulTa.placeholder = '加载失败: ' + loadError;
    if (mdTa) mdTa.placeholder = '加载失败: ' + loadError;
  }

  // Load agent meta into settings form
  document.getElementById('currentAgentLabel').textContent = '— ' + (agent.display_name || agent.name);
  document.getElementById('cfgAgentName').value = agent.display_name || agent.name || 'Siper Agent';
  document.getElementById('cfgAgentIcon').value = agent.icon || '🎭';
  document.getElementById('cfgAgentAvatar').value = agent.avatar || '';
  agentAvatarUrl = '/api/avatar';
  const av = document.getElementById('cfgAvatarPreview');
  if (agent.avatar) { av.src = '/api/avatar'; av.style.display = 'inline'; }
  else { av.src = '/api/avatar'; av.style.display = 'inline'; }
  const app = agent.appearance || {};
  const fontSize = parseInt(app.msg_font_size) || 18;
  document.getElementById('cfgAgentMsgFontSize').value = fontSize;
  document.getElementById('cfgAgentMsgFontSizeVal').textContent = fontSize + 'px';
  document.getElementById('cfgAgentMsgBg').value = app.msg_bg || '#1c2333';
  document.getElementById('cfgAgentMsgText').value = app.msg_text || '#e6edf3';
  document.getElementById('cfgAgentMsgBorder').value = app.msg_border || '#30363d';
  
  // Save agent model refs for renderAgentModelSection to apply after rendering
  _pendingAgentModels = {
    avail: agent.available_models || [],
    defChat: agent.default_chat_model || '',
    defVision: agent.default_vision_model || '',
  };

  // Load agent's model references (will work if models already loaded)
  applyAgentModelRefs();
}

function switchConfigAgentPageTab(tab) {
  document.getElementById('agentTabAbout').className = 'agent-tab' + (tab === 'about' ? ' active' : '');
  document.getElementById('agentTabFiles').className = 'agent-tab' + (tab === 'files' ? ' active' : '');
  document.getElementById('agentTabModels').className = 'agent-tab' + (tab === 'models' ? ' active' : '');
  document.getElementById('agentTabLimits').className = 'agent-tab' + (tab === 'limits' ? ' active' : '');
  document.getElementById('agentTabContentAbout').classList[tab !== 'about' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentFiles').classList[tab !== 'files' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentModels').classList[tab !== 'models' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentLimits').classList[tab !== 'limits' ? 'add' : 'remove']('hidden');
  // Auto-load models when switching to models tab
  if (tab === 'models' && !modelsLoaded) {
    modelsLoaded = true;
    loadGlobalModelsForAgent();
  }
}

function switchConfigAgentTab(tab) {
  if (tab === 'memory') return;
  switchConfigAgentPageTab('files');
}

function refreshAgentFile(fileType) {
  if (!fileType) return;
  const ta = fileType === 'soul' ? document.getElementById('agentSoulContent') : document.getElementById('agentMdContent');
  if (!ta) return;
  ta.value = fileType === 'soul' ? cachedConfigSoulContent : cachedConfigAgentContent;
}

async function saveAgentFile(fileType) {
  if (!currentConfigAgent) {
    toast.warning(t('agent.selectFirst'));
    return;
  }
  if (!fileType) return;
  const ta = fileType === 'soul' ? document.getElementById('agentSoulContent') : document.getElementById('agentMdContent');
  if (!ta) return;
  const fileContent = ta.value;
  try {
    const r = await fetch('/api/agents/' + currentConfigAgent + '/' + fileType, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ content: fileContent })
    });
    const d = await r.json();
    if (d.success) {
      if (fileType === 'soul') cachedConfigSoulContent = fileContent;
      else if (fileType === 'config') cachedConfigAgentContent = fileContent;
      toast.success(t('agent.fileSaved'));
    } else {
      toast.error(t('tasks.saveFailed') + ' ' + (d.error || t('tasks.unknownError')));
    }
  } catch(e) {
    toast.error(t('tasks.saveFailed') + ' ' + e.message);
  }
}

function switchConfigAgent() {
  const sel = document.getElementById('agentSelector');
  const name = sel.value;
  if (!name) {
    toast.warning(t('agent.selectFirst'));
    return;
  }
  doSwitchConfigAgent(name);
}

async function doSwitchConfigAgent(name) {
  try {
    const r = await fetch('/api/agents', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ action: 'switch', agent: name })
    });
    const d = await r.json();
    if (d.success) {
      toast.success(t('agent.switchSuccess') + name);
      addLog('info', 'Agent 已切换为: ' + name, currentLang);
    } else {
      toast.error(t('agent.switchFailed') + ' ' + (d.error || t('tasks.unknownError')));
    }
    refreshConfigAgentPanel();
  } catch(e) {
    toast.error(t('agent.switchFailed') + ' ' + e.message);
  }
}

// ===== Avatar Upload =====
let selectedConfigAvatarFile = null;

document.getElementById('avatarFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showConfigAvatarStatus('图片过大（最大 2MB）', 'error');
    return;
  }
  selectedConfigAvatarFile = file;
  // Preview
  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = document.getElementById('cfgAvatarPreview');
    img.src = ev.target.result;
    img.style.display = 'inline';
  };
  reader.readAsDataURL(file);
  showConfigAvatarStatus('已选择: ' + file.name + ' (' + Math.round(file.size/1024) + 'KB)', 'info');
});

async function uploadAgentAvatar() {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }

  const urlInput = document.getElementById('cfgAgentAvatar').value.trim();

  // If a file was selected, upload it
  if (selectedConfigAvatarFile) {
    const reader = new FileReader();
    reader.onload = async function(ev) {
      const base64 = ev.target.result;
      try {
        showConfigAvatarStatus('上传中...', 'info');
        const r = await fetch('/api/avatar/upload', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ image: base64, agent: currentConfigAgent })
        });
        const d = await r.json();
        if (d.success) {
          document.getElementById('cfgAgentAvatar').value = d.path;
          agentAvatarUrl = '/api/avatar';
          const img = document.getElementById('cfgAvatarPreview');
          img.src = d.path;
          img.style.display = 'inline';
          showConfigAvatarStatus('头像已保存', 'success');
          selectedConfigAvatarFile = null;
          document.getElementById('avatarFileInput').value = '';
          // Refresh agent list to show new avatar
          refreshConfigAgentPanel();
        } else {
          showConfigAvatarStatus('上传失败: ' + (d.error || '未知错误'), 'error');
        }
      } catch(e) {
        showConfigAvatarStatus('上传失败: ' + e.message, 'error');
      }
    };
    reader.readAsDataURL(selectedConfigAvatarFile);
    return;
  }

  // If URL was entered, save it directly via meta API
  if (urlInput) {
    try {
      showConfigAvatarStatus('保存中...', 'info');
      const r = await fetch('/api/agents/' + currentConfigAgent + '/meta', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ avatar: urlInput })
      });
      const d = await r.json();
      if (d.success) {
        agentAvatarUrl = (urlInput && urlInput.startsWith('http')) ? urlInput : '/api/avatar';
        const img = document.getElementById('cfgAvatarPreview');
        img.src = urlInput;
        img.style.display = 'inline';
        showConfigAvatarStatus('头像地址已保存', 'success');
        refreshConfigAgentPanel();
      } else {
        showConfigAvatarStatus('保存失败: ' + (d.error || '未知错误'), 'error');
      }
    } catch(e) {
      showConfigAvatarStatus('保存失败: ' + e.message, 'error');
    }
    return;
  }

  showConfigAvatarStatus('请选择图片或输入 URL', 'error');
}

function showConfigAvatarStatus(msg, type) {
  const el = document.getElementById('avatarUploadStatus');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.color = type === 'error' ? 'var(--red)' : (type === 'success' ? 'var(--green)' : 'var(--text-dim)');
  if (type === 'success') {
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
}

// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshConfigAgentPanel);

// ===== Auto-Save for Agent Config =====
let _agentAutoSaveTimer = null;

function triggerAgentAutoSave() {
  if (!currentConfigAgent) return;
  if (_agentAutoSaveTimer) clearTimeout(_agentAutoSaveTimer);
  _agentAutoSaveTimer = setTimeout(async () => {
    const body = {
      name: document.getElementById('cfgAgentName').value,
      icon: document.getElementById('cfgAgentIcon').value,
      avatar: document.getElementById('cfgAgentAvatar').value,
      appearance: {
        msg_font_size: document.getElementById('cfgAgentMsgFontSize').value + 'px',
        msg_bg: document.getElementById('cfgAgentMsgBg').value,
        msg_text: document.getElementById('cfgAgentMsgText').value,
        msg_border: document.getElementById('cfgAgentMsgBorder').value,
      },
      max_tools: parseInt(document.getElementById('agentCfgMaxTools').value),
      max_tool_rounds: parseInt(document.getElementById('agentCfgMaxToolRounds').value),
      session_timeout: parseInt(document.getElementById('agentCfgSessionTimeout').value),
      llm_timeout: parseInt(document.getElementById('agentCfgLlmTimeout').value),
      llm_max_tokens: parseInt(document.getElementById('agentCfgLlmMaxTokens').value),
      llm_max_retries: parseInt(document.getElementById('agentCfgLlmMaxRetries').value),
      max_history_messages: parseInt(document.getElementById('agentCfgMaxHistoryMessages').value),
      skill_pre_filter_top_k: parseInt(document.getElementById('agentCfgSkillPreFilterTopK').value),
      memory_integration: {
        max_tokens: parseInt(document.getElementById('agentCfgMemoryMaxTokens').value),
      },
      port: parseInt(document.getElementById('cfgPort').value) || 9724,
      log_level: document.getElementById('cfgLogLevel').value || 'INFO',
    };
    try {
      const r = await fetch('/api/agents/' + currentConfigAgent + '/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.success) {
        console.warn('Agent auto-save failed:', d.error || 'unknown error');
      }
    } catch(e) {
      console.warn('Agent auto-save error:', e.message);
    }
  }, 1000);
}

function attachAgentAutoSaveListeners() {
  const fields = [
    'cfgAgentName', 'cfgAgentIcon', 'cfgAgentAvatar',
    'cfgAgentMsgFontSize', 'cfgAgentMsgBg', 'cfgAgentMsgText', 'cfgAgentMsgBorder',
    'agentCfgMaxTools', 'agentCfgSessionTimeout', 'agentCfgMaxToolRounds',
    'agentCfgLlmTimeout', 'agentCfgLlmMaxTokens', 'agentCfgLlmMaxRetries',
    'agentCfgMaxHistoryMessages', 'agentCfgMemoryMaxTokens', 'agentCfgSkillPreFilterTopK',
    'cfgPort', 'cfgLogLevel',
  ];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', triggerAgentAutoSave);
      // Also listen on input for number fields (spinner buttons don't trigger change in all browsers)
      if (el.type === 'number') el.addEventListener('input', triggerAgentAutoSave);
    }
  });
}

// Attach listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  attachAgentAutoSaveListeners();
});

// ===== Reset Limits to Defaults =====
function resetAgentLimits() {
  document.getElementById('agentCfgLlmTimeout').value = 120;
  document.getElementById('agentCfgLlmMaxTokens').value = 8192;
  document.getElementById('agentCfgLlmMaxRetries').value = 2;
  document.getElementById('agentCfgMaxToolRounds').value = 100;
  document.getElementById('agentCfgMaxTools').value = 300;
  document.getElementById('agentCfgSessionTimeout').value = 3600;
  document.getElementById('agentCfgMaxHistoryMessages').value = 50;
  document.getElementById('agentCfgMemoryMaxTokens').value = 20000;
  document.getElementById('agentCfgSkillPreFilterTopK').value = 5;
  triggerAgentAutoSave();
  toast.success(t('agent.limitsReset'), 1500);
}
