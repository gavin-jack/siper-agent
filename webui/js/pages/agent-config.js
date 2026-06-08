// pages/agent-config.js — Agent 配置管理
// 从 pages/page-agent-config.js 迁移

import { t } from '../utils/i18n.js';
import { escapeHtml } from '../utils/escape.js';
import { showConfirm } from '../components/toast.js';
import { toast } from '../components/toast.js';
import { _chatAgentData, _chatSelectedAgent, _agentConfigName, _chatAgentFiles, _chatCurAgentFile, setChatAgentFiles, setChatCurAgentFile } from '../chat/state.js';

// ===== Agent Config Page =====
// ===== Model =====
// ===== Agent Settings & Models =====
let globalModelsList = [];     // cached global models list
let modelsLoaded = false;      // whether models have been loaded for current session
let agentAvatarUrl = '';
let _pendingAgentModels = null;

export async function loadAgentSettings() {
  // When agent-config page opens, load settings for the currently selected agent
  if (currentConfigAgent && agentConfigData && agentConfigData.agents) {
    const agent = agentConfigData.agents.find(a => a.name === currentConfigAgent);
    if (agent) {
      document.getElementById('agentConfigTitle').innerHTML = '<strong>' + escapeHtml(agent.name) + ' - 设置</strong>';
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
      if (_lblLimits) _lblLimits.textContent = (agent.display_name || agent.name) + ' - 设置';
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
  // Load models from agent config data
  if (currentConfigAgent && agentConfigData && agentConfigData.agents) {
    const agent = agentConfigData.agents.find(a => a.name === currentConfigAgent);
    if (agent) {
      renderAgentModelsForAgent(agent);
    }
  }
}

export async function loadGlobalModelsForAgent() {
  try {
    const r = await fetch('/api/models/global');
    const d = await r.json();
    globalModelsList = d.models || [];
    modelsLoaded = true;
  } catch(e) {
    console.error('loadGlobalModelsForAgent error:', e);
  }
}

// Render model section: show all global models, check those in agent's available_models
export function renderAgentModelSection(globalModels, agentAvailNames) {
  const capIcons = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };
  const capOrder = { chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4, embedding: 5, image_gen: 6, long_context: 7, function_calling: 99 };
  const availSet = new Set(agentAvailNames || []);
  const modelOptions = globalModels.map(m => {
    const alias = m.alias ? ` (${m.alias})` : '';
    return `<option value="${m.name}">${escapeHtml(m.name)}${escapeHtml(alias)}</option>`;
  }).join('');
  const checkboxes = globalModels.map(m => {
    const alias = m.alias ? ` (${m.alias})` : '';
    const caps = (m.capabilities || []).slice().sort((a, b) => (capOrder[a] ?? 50) - (capOrder[b] ?? 50)).map(c => capIcons[c] || c).join('');
    const checked = availSet.has(m.name) ? 'checked' : '';
    return `<label class="model-checkbox-row">
      <input type="checkbox" value="${m.name}" class="agent-avail-mcb" onchange="autoSaveAgentModels()" data-name="${m.name}" ${checked}>
      <span class="model-name">${escapeHtml(m.name)}</span>
      ${alias ? `<span class="model-alias">${escapeHtml(alias)}</span>` : ''}
      <span class="model-caps">${caps || '💬'}</span>
    </label>`;
  }).join('');

  const defaultContainer = document.getElementById('agentDefaultModelSection');
  if (defaultContainer) {
    defaultContainer.innerHTML = `
    <div class="field-group">
      <label class="field-label" for="agentDefaultChatModel">默认对话模型</label>
      <select id="agentDefaultChatModel" onchange="autoSaveAgentModels()" class="field-select">
        <option value="">— 使用全局默认 —</option>${modelOptions}
      </select>
    </div>
    <div class="field-group">
      <label class="field-label" for="agentDefaultVisionModel">默认视觉模型</label>
      <select id="agentDefaultVisionModel" onchange="autoSaveAgentModels()" class="field-select">
        <option value="">— 使用全局默认 —</option>${modelOptions}
      </select>
    </div>
    <div class="auto-save-hint">✦ 自动保存</div>`;
  }

  const listContainer = document.getElementById('agentModelListSection');
  if (listContainer) {
    listContainer.innerHTML = `
    <div class="field-hint" style="margin-bottom:8px">可用模型（勾选后该 agent 可在对话中使用）</div>
    <div class="model-list">${checkboxes}</div>`;
  }

  // Apply default model selects
  const chatSel = document.getElementById('agentDefaultChatModel');
  const visionSel = document.getElementById('agentDefaultVisionModel');
  if (_pendingAgentModels) {
    // If agent has no own default, try to fetch global default model
    if (!_pendingAgentModels.defChat && globalModelsList.length > 0) {
      // Use first global model as default (global default)
      const globalDefault = globalModelsList.find(m => m.is_default) || globalModelsList[0];
      if (chatSel) chatSel.value = globalDefault.name;
    } else {
      if (chatSel) chatSel.value = _pendingAgentModels.defChat || '';
    }
    if (visionSel) visionSel.value = _pendingAgentModels.defVision || '';
    _pendingAgentModels = null;
  }
}

// Render models for a specific agent: load global models first, then render with agent's selection
export function renderAgentModelsForAgent(agentData) {
  const agentAvailNames = (agentData && agentData.available_models || []).map(m => typeof m === 'string' ? m : m.name);
  // Store agent avail names for later use
  _pendingAgentModels = {
    avail: agentAvailNames,
    defChat: agentData ? (agentData.default_chat_model || '') : '',
    defVision: agentData ? (agentData.default_vision_model || '') : '',
  };
  // If global models already loaded, render directly
  if (modelsLoaded && globalModelsList.length > 0) {
    renderAgentModelSection(globalModelsList, agentAvailNames);
  }
  // Always reload global models to ensure latest list
  loadGlobalModelsForAgent().then(() => {
    renderAgentModelSection(globalModelsList, agentAvailNames);
  });
}

export async function saveAgentSettings() {
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

export function autoSaveAgentModels() {
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
        // Refresh chat agents cache and model dropdown
        if (typeof loadChatAgents === 'function') {
          loadChatAgents().then(() => {
            if (typeof loadChatModels === 'function') loadChatModels();
          });
        } else if (typeof loadChatModels === 'function') {
          loadChatModels();
        }
      }
      else toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown'));
    } catch(e) { toast.error(t('settings.saveFailed') + ': ' + e.message); }
  }, 300);
}

// Legacy functions removed — model selection now handled by checkboxes + default selects in saveAgentSettings

// ===== Agent Config =====
// Expose to window so selectChatAgent() can update from page-chat.js
export let agentConfigData = { agents: [], active: 'default' };
export let currentConfigAgent = '';
let cachedConfigSoulContent = '';
let cachedConfigAgentContent = '';
let cachedConfigMemoryContent = '';

export async function refreshConfigAgentPanel() {
  try {
    const r = await fetch('/api/agents');
    agentConfigData = await r.json();
    const agents = agentConfigData.agents || [];
    const active = agentConfigData.active || 'default';

    // Update dropdown
    const sel = document.getElementById('agentSelector');
    if (sel) {
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
    }

    currentConfigAgent = active;

    // Load active agent
    const activeAgent = agents.find(a => a.is_active);
    if (activeAgent) {
      selectConfigAgent(activeAgent.name);
    }
  } catch(e) {
    console.error('refreshConfigAgentPanel error:', e);
  }
}

// ===== Agent Config =====
export async function selectConfigAgent(name) {
  const agents = (agentConfigData.agents || []);
  const agent = agents.find(a => a.name === name);
  if (!agent) return;

  // Load agent files (soul + config + memory)
  let loadError = null;
  try {
    const [soulRes, configRes, memoryRes] = await Promise.all([
      fetch('/api/agents/' + name + '/soul'),
      fetch('/api/agents/' + name + '/config'),
      fetch('/api/agents/' + name + '/memory'),
    ]);
    if (!soulRes.ok || !configRes.ok) {
      loadError = 'API 返回错误 (' + soulRes.status + '/' + configRes.status + ')';
    }
    const soulData = await soulRes.json();
    const configData = await configRes.json();
    const memoryData = await memoryRes.json();
    cachedConfigSoulContent = soulData.soul || '';
    cachedConfigAgentContent = configData.config || '';
    cachedConfigMemoryContent = memoryData.memory || '';
    const soulTa = document.getElementById('agentSoulContent');
    const mdTa = document.getElementById('agentMdContent');
    const memTa = document.getElementById('agentMemoryContent');
    if (soulTa) soulTa.value = cachedConfigSoulContent;
    if (mdTa) mdTa.value = cachedConfigAgentContent;
    if (memTa) memTa.value = cachedConfigMemoryContent;
  } catch(e) {
    loadError = e.message;
    const soulTa = document.getElementById('agentSoulContent');
    const mdTa = document.getElementById('agentMdContent');
    const memTa = document.getElementById('agentMemoryContent');
    if (soulTa) soulTa.value = '';
    if (mdTa) mdTa.value = '';
    if (memTa) memTa.value = '';
    // Show error in textareas
    if (soulTa) soulTa.placeholder = '加载失败: ' + loadError;
    if (mdTa) mdTa.placeholder = '加载失败: ' + loadError;
    if (memTa) memTa.placeholder = '加载失败: ' + loadError;
  }

  // Load agent meta into settings form
  const agentConfigTitle = document.getElementById('agentConfigTitle');
  if (agentConfigTitle) agentConfigTitle.innerHTML = '<strong>' + escapeHtml(agent.name) + ' - 设置</strong>';
  const cfgAgentName = document.getElementById('cfgAgentName');
  if (cfgAgentName) cfgAgentName.value = agent.display_name || agent.name || 'Siper Agent';
  const cfgAgentIconBtn = document.getElementById('cfgAgentIconBtn');
  if (cfgAgentIconBtn) cfgAgentIconBtn.textContent = agent.icon || '🎭';
  const cfgAgentAvatar = document.getElementById('cfgAgentAvatar');
  if (cfgAgentAvatar) cfgAgentAvatar.value = agent.avatar || '';
  agentAvatarUrl = '/api/avatar?agent=' + currentConfigAgent;
  const av = document.getElementById('cfgAvatarPreview');
  if (av) {
    av.src = agentAvatarUrl;
    av.style.display = 'inline';
  }
  // Init avatar auto-upload listener (only once)
  initAvatarAutoUpload();
  const app = agent.appearance || {};
  const fontSize = parseInt(app.msg_font_size) || 18;
  const cfgAgentMsgFontSize = document.getElementById('cfgAgentMsgFontSize');
  if (cfgAgentMsgFontSize) cfgAgentMsgFontSize.value = fontSize;
  const cfgAgentMsgFontSizeVal = document.getElementById('cfgAgentMsgFontSizeVal');
  if (cfgAgentMsgFontSizeVal) cfgAgentMsgFontSizeVal.textContent = fontSize + 'px';
  const cfgAgentMsgBg = document.getElementById('cfgAgentMsgBg');
  if (cfgAgentMsgBg) cfgAgentMsgBg.value = app.msg_bg || '#1c2333';
  const cfgAgentMsgText = document.getElementById('cfgAgentMsgText');
  if (cfgAgentMsgText) cfgAgentMsgText.value = app.msg_text || '#e6edf3';
  const cfgAgentMsgBorder = document.getElementById('cfgAgentMsgBorder');
  if (cfgAgentMsgBorder) cfgAgentMsgBorder.value = app.msg_border || '#30363d';
  
  // Save agent model refs for renderAgentModelSection to apply after rendering
  _pendingAgentModels = {
    avail: (agent.available_models || []).map(m => typeof m === 'string' ? m : m.name),
    defChat: agent.default_chat_model || '',
    defVision: agent.default_vision_model || '',
  };

  // Render model section from agent config data (full model objects)
  renderAgentModelsForAgent(agent);
}

export function switchConfigAgentPageTab(tab) {
  document.getElementById('agentTabAbout').className = 'agent-tab' + (tab === 'about' ? ' active' : '');
  document.getElementById('agentTabFiles').className = 'agent-tab' + (tab === 'files' ? ' active' : '');
  document.getElementById('agentTabMemory').className = 'agent-tab' + (tab === 'memory' ? ' active' : '');
  document.getElementById('agentTabContentAbout').classList[tab !== 'about' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentFiles').classList[tab !== 'files' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentMemory').classList[tab !== 'memory' ? 'add' : 'remove']('hidden');
  // Auto-load memory when switching to memory tab
  if (tab === 'memory' && currentConfigAgent) {
    loadAgentMemoryContent(currentConfigAgent);
  }
}

export function refreshAgentFile(fileType) {
  let ta;
  if (fileType === 'soul') ta = document.getElementById('agentSoulContent');
  else if (fileType === 'memory') ta = document.getElementById('agentMemoryContent');
  else ta = document.getElementById('agentMdContent');
  if (!ta) return;
  if (fileType === 'soul') ta.value = cachedConfigSoulContent;
  else if (fileType === 'memory') ta.value = cachedConfigMemoryContent;
  else ta.value = cachedConfigAgentContent;
}

export async function loadAgentMemoryContent(name) {
  try {
    const r = await fetch('/api/agents/' + name + '/memory');
    const d = await r.json();
    cachedConfigMemoryContent = d.memory || '';
    const memTa = document.getElementById('agentMemoryContent');
    if (memTa) memTa.value = cachedConfigMemoryContent;
    // Also update memory path display
    const pathEl = document.getElementById('agentCfgMemoryPath');
    if (pathEl) pathEl.value = 'agents/' + name + '/memory.md';
  } catch(e) {
    console.error('loadAgentMemoryContent error:', e);
  }
}

export async function saveAgentFile(fileType) {
  if (!currentConfigAgent) {
    toast.warning(t('agent.selectFirst'));
    return;
  }
  if (!fileType) return;
  let ta;
  if (fileType === 'soul') ta = document.getElementById('agentSoulContent');
  else if (fileType === 'memory') ta = document.getElementById('agentMemoryContent');
  else ta = document.getElementById('agentMdContent');
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
      else if (fileType === 'memory') cachedConfigMemoryContent = fileContent;
      toast.success(t('agent.fileSaved'));
    } else {
      toast.error(t('tasks.saveFailed') + ' ' + (d.error || t('tasks.unknownError')));
    }
  } catch(e) {
    toast.error(t('tasks.saveFailed') + ' ' + e.message);
  }
}

// ===== Avatar Upload =====
let selectedConfigAvatarFile = null;

var _avatarFileInput = document.getElementById('avatarFileInput');
if (_avatarFileInput) _avatarFileInput.addEventListener('change', function(e) {
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

export async function uploadAgentAvatar() {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }

  const urlInput = document.getElementById('cfgAgentAvatar').value.trim();

  // If a file was selected, compress then upload it
  if (selectedConfigAvatarFile) {
    try {
      const compressed = await _compressImage(selectedConfigAvatarFile, 256, 0.8);
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
            agentAvatarUrl = '/api/avatar?agent=' + currentConfigAgent;
            const img = document.getElementById('cfgAvatarPreview');
            img.src = agentAvatarUrl;
            img.style.display = 'inline';
            showConfigAvatarStatus('头像已保存', 'success');
            selectedConfigAvatarFile = null;
            document.getElementById('avatarFileInput').value = '';
            refreshConfigAgentPanel();
          } else {
            showConfigAvatarStatus('上传失败: ' + (d.error || '未知错误'), 'error');
          }
        } catch(e) {
          showConfigAvatarStatus('上传失败: ' + e.message, 'error');
        }
      };
      reader.readAsDataURL(compressed);
    } catch(e) {
      showConfigAvatarStatus('图片处理失败: ' + e.message, 'error');
    }
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

export function showConfigAvatarStatus(msg, type) {
  const el = document.getElementById('avatarUploadStatus');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.color = type === 'error' ? 'var(--red)' : (type === 'success' ? 'var(--green)' : 'var(--text-dim)');
  if (type === 'success') {
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
}

// ===== Icon Picker =====
const _ICON_PRESETS = [
  '🎭','🤖','🧠','💬','⚡','🔧','📋','🧩','🌟','🎯',
  '🔥','💡','🎨','📝','🔮','🛡️','🎪','🏆','🎵','🎮',
  '📊','🔬','🌍','💻','📱','🖥️','⌨️','🖱️','📷','🎬',
  '🐱','🐶','🦊','🐻','🐼','🐨','🦁','🐯','🐸','🐵',
  '❤️','💙','💚','💛','💜','🧡','🤍','🖤','🤎','💗',
  '✅','❌','⚠️','🔔','📌','🔗','📎','🗂️','📁','📂',
];

let _iconPickerVisible = false;

export function toggleIconPicker(e) {
  e.stopPropagation();
  if (_iconPickerVisible) { hideIconPicker(); return; }
  const btn = document.getElementById('cfgAgentIconBtn');
  if (!btn) return;
  const picker = document.createElement('div');
  picker.id = 'iconPickerPopup';
  picker.className = 'icon-picker-popup';
  picker.innerHTML = '<div class="icon-picker-grid">' + _ICON_PRESETS.map(icon =>
    '<button class="icon-picker-item" onclick="selectAgentIcon(\'' + icon + '\')">' + icon + '</button>'
  ).join('') + '</div>';
  document.body.appendChild(picker);
  const rect = btn.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.left = rect.left + 'px';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.zIndex = '10000';
  _iconPickerVisible = true;
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', _iconPickerOutsideHandler);
  }, 10);
}

function _iconPickerOutsideHandler(e) {
  const picker = document.getElementById('iconPickerPopup');
  if (picker && !picker.contains(e.target)) { hideIconPicker(); }
}

function hideIconPicker() {
  const picker = document.getElementById('iconPickerPopup');
  if (picker) picker.remove();
  _iconPickerVisible = false;
  document.removeEventListener('click', _iconPickerOutsideHandler);
}

export function selectAgentIcon(icon) {
  document.getElementById('cfgAgentIconBtn').textContent = icon;
  const hidden = document.getElementById('cfgAgentIcon');
  if (hidden) hidden.value = icon;
  hideIconPicker();
  triggerAgentAutoSave();
}

// ===== Avatar Auto-Upload on File Select =====
export function initAvatarAutoUpload() {
  const input = document.getElementById('avatarFileInput');
  if (!input) return;
  input.addEventListener('change', async function() {
    const file = this.files[0];
    if (!file) return;
    if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }
    // Compress image before upload
    try {
      const compressed = await _compressImage(file, 256, 0.8);
      const reader = new FileReader();
      reader.onload = async function(ev) {
        const base64 = ev.target.result;
        try {
          const r = await fetch('/api/avatar/upload', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ image: base64, agent: currentConfigAgent })
          });
          const d = await r.json();
          if (d.success) {
            const img = document.getElementById('cfgAvatarPreview');
            img.src = '/api/avatar?agent=' + currentConfigAgent + '&t=' + Date.now();
            img.style.display = 'inline';
            refreshConfigAgentPanel();
          } else {
            toast.error('上传失败: ' + (d.error || '未知错误'));
          }
        } catch(e) { toast.error('上传失败: ' + e.message); }
      };
      reader.readAsDataURL(compressed);
    } catch(e) { toast.error('图片处理失败: ' + e.message); }
    this.value = '';
  });
}

function _compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function() {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w <= maxDim && h <= maxDim) { resolve(file); return; }
      if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / h); h = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (blob) resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        else reject(new Error('压缩失败'));
      }, 'image/jpeg', quality);
    };
    img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

// ===== Auto-Save for Agent Config =====
let _agentAutoSaveTimer = null;

export function triggerAgentAutoSave() {
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
        console.error('Agent auto-save failed:', d.error || 'unknown error');
      }
    } catch(e) {
      console.error('Agent auto-save error:', e.message);
    }
  }, 1000);
}

export function attachAgentAutoSaveListeners() {
  const fields = [
    'cfgAgentName', 'cfgAgentIcon',
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
  // Icon button click → auto-save after picker selects
  const iconBtn = document.getElementById('cfgAgentIconBtn');
  if (iconBtn) iconBtn.addEventListener('click', triggerAgentAutoSave);
}

// Attach listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  attachAgentAutoSaveListeners();
});

// ===== Reset Limits to Defaults =====
export function resetAgentLimits() {
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

// ===== Legacy Agent Config Functions (migrated from pre-ESM page-chat.js) =====

export function switchChatAgentTab(tab, btn) {
  // Update tab bar active state
  document.querySelectorAll('.agent-tab').forEach(function(el) { el.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  // Show/hide tab content
  document.querySelectorAll('.agent-tab-content').forEach(function(el) { el.classList.remove('active'); });
  var content = document.getElementById('agentTabContent' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (content) content.classList.add('active');
}

export function switchChatAgentFile(type, btn) {
  setChatCurAgentFile(type);
  // Load content into the corresponding editor
  var editor = document.getElementById('agent' + type.charAt(0).toUpperCase() + type.slice(1) + 'Content');
  if (!editor) return;
  if (_chatAgentFiles[type] !== undefined) {
    editor.value = _chatAgentFiles[type] || '';
  } else if (_agentConfigName) {
    fetch('/api/agents/' + _agentConfigName + '/' + type)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var content = data[type] || data.content || '';
        _chatAgentFiles[type] = content;
        setChatAgentFiles({ ..._chatAgentFiles });
        editor.value = content;
      })
      .catch(function() { editor.value = ''; });
  }
}

export function saveChatAgentFile(type) {
  if (!type) type = _chatCurAgentFile;
  var editor = document.getElementById('agent' + type.charAt(0).toUpperCase() + type.slice(1) + 'Content');
  if (!editor || !_agentConfigName) return;
  var content = editor.value;
  fetch('/api/agents/' + _agentConfigName + '/' + type, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ content: content })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.success) {
      _chatAgentFiles[type] = content;
      setChatAgentFiles({ ..._chatAgentFiles });
      toast.success('文件已保存');
    } else {
      toast.error('保存失败: ' + (data.error || '未知错误'));
    }
  })
  .catch(function(e) { toast.error('保存失败: ' + e.message); });
}

export function loadChatAgentFilesForAgent(name) {
  if (!name) return;
  Promise.all([
    fetch('/api/agents/' + name + '/soul').then(function(r) { return r.json(); }),
    fetch('/api/agents/' + name + '/config').then(function(r) { return r.json(); }),
  ]).then(function(results) {
    _chatAgentFiles.soul = results[0].soul || '';
    _chatAgentFiles.config = results[1].config || '';
    setChatAgentFiles({ ..._chatAgentFiles });
    var soulEditor = document.getElementById('agentSoulContent');
    var configEditor = document.getElementById('agentMdContent');
    if (soulEditor) soulEditor.value = _chatAgentFiles.soul;
    if (configEditor) configEditor.value = _chatAgentFiles.config;
  }).catch(function() {});
}

export function saveAllChatAgentConfig() {
  if (!_chatSelectedAgent || !_chatAgentData) return;
  var agent = (_chatAgentData.agents || []).find(function(a) { return a.name === _chatSelectedAgent; });
  if (!agent) return;
  var body = {
    name: document.getElementById('cfgAgentName').value,
    icon: document.getElementById('cfgAgentIcon').value,
    appearance: {
      msg_font_size: document.getElementById('cfgAgentMsgFontSize').value + 'px',
      msg_bg: (agent.appearance && agent.appearance.msg_bg) || '#1c2333',
      msg_text: (agent.appearance && agent.appearance.msg_text) || '#e6edf3',
      msg_border: (agent.appearance && agent.appearance.msg_border) || '#30363d',
    },
    max_tools: parseInt(document.getElementById('agentCfgMaxTools').value) || 300,
    session_timeout: parseInt(document.getElementById('agentCfgSessionTimeout').value) || 3600,
    llm_timeout: parseInt(document.getElementById('agentCfgLlmTimeout').value) || 120,
    llm_max_tokens: parseInt(document.getElementById('agentCfgLlmMaxTokens').value) || 8192,
  };
  fetch('/api/agents/' + _chatSelectedAgent + '/meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).then(function(d) {
    if (d.success) toast.success('配置已保存');
    else toast.error('保存失败');
  }).catch(function() { toast.error('网络错误'); });
}
