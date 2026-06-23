// pages/agent-config.js — Agent 配置管理
// 从 pages/page-agent-config.js 迁移

import { t } from '../utils/i18n.js?v=1782227011228';
import { escapeHtml } from '../utils/escape.js?v=1782227011228';
import { showConfirm, showForm } from '../components/toast.js?v=1782227011228';
import { toast } from '../components/toast.js?v=1782227011228';
import { _chatAgentData, _chatSelectedAgent, _agentConfigName, _chatAgentFiles, _chatCurAgentFile, setChatAgentFiles, setChatCurAgentFile } from '../chat/state.js?v=1782227011228';
import { loadGlobalModelsForAgent, renderAgentModelSection, renderAgentModelsForAgent, globalModelsList, modelsLoaded, setPendingAgentModels } from '../components/agent-models.js?v=1782227011228';
export { loadGlobalModelsForAgent };

// ===== Agent Config Page =====
// ===== Model =====
// ===== Agent Settings & Models =====

export async function loadAgentSettings() {
  // When agent-config page opens, load settings for the currently selected agent
  if (currentConfigAgent && agentConfigData && agentConfigData.agents) {
    const agent = agentConfigData.agents.find(a => a.name === currentConfigAgent);
    if (agent) {
      // 标题由 selectChatAgent 的 chatRightHeaderName 更新，此处跳过
      document.getElementById('cfgAgentName').value = agent.display_name || agent.name || 'Siper Agent';
      const cfgAgentIconSpan = document.getElementById('cfgAgentIcon');
      if (cfgAgentIconSpan) cfgAgentIconSpan.textContent = agent.icon || '🎭';
      document.getElementById('cfgAgentAvatar').value = agent.avatar || '';
      const av = document.getElementById('cfgAvatarPreview');
      av.src = '/api/avatar?agent=' + encodeURIComponent(currentConfigAgent || agent.name);
      av.style.display = 'inline';
      // Load per-agent session_timeout, max_tools, max_tool_rounds
      const agentMaxTools = agent.max_tools;
      const agentSessionTimeout = agent.session_timeout;
      const agentMaxToolRounds = agent.max_tool_rounds;
      if (agentMaxTools !== undefined && agentMaxTools !== null) {
        document.getElementById('agentCfgMaxTools').value = agentMaxTools;
      } else {
        try {
          let gd;
          if (typeof window.__getPageCache === 'function') {
            const cache = window.__getPageCache('agent-config');
            if (cache?.config) gd = cache.config;
          }
          if (!gd) { const gr = await fetch('/api/config'); gd = await gr.json(); }
          document.getElementById('agentCfgMaxTools').value = gd.max_tools || 10;
        } catch(e) { document.getElementById('agentCfgMaxTools').value = 10; }
      }
      if (agentSessionTimeout !== undefined && agentSessionTimeout !== null) {
        document.getElementById('agentCfgSessionTimeout').value = agentSessionTimeout;
      } else {
        try {
          let gd;
          if (typeof window.__getPageCache === 'function') {
            const cache = window.__getPageCache('agent-config');
            if (cache?.config) gd = cache.config;
          }
          if (!gd) { const gr = await fetch('/api/config'); gd = await gr.json(); }
          document.getElementById('agentCfgSessionTimeout').value = gd.session_timeout || 3600;
        } catch(e) { document.getElementById('agentCfgSessionTimeout').value = 3600; }
      }
      if (agentMaxToolRounds !== undefined && agentMaxToolRounds !== null) {
        document.getElementById('agentCfgMaxToolRounds').value = agentMaxToolRounds;
      } else {
        try {
          let gd;
          if (typeof window.__getPageCache === 'function') {
            const cache = window.__getPageCache('agent-config');
            if (cache?.config) gd = cache.config;
          }
          if (!gd) { const gr = await fetch('/api/config'); gd = await gr.json(); }
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
      // Set default vision model
      if (agent.default_vision_model !== undefined) {
        const visionSel = document.getElementById('agentDefaultVisionModel');
        if (visionSel) visionSel.value = agent.default_vision_model || '— 使用全局默认 —';
      }
      // Sync agent label for limits tab
      const _lblLimits = document.getElementById('currentAgentLabelLimits');
      if (_lblLimits) _lblLimits.textContent = (agent.display_name || agent.name) + ' - 设置';
    }
  }
  // If no agent selected yet, fall back to global config for defaults
  if (!currentConfigAgent) {
    try {
      let d;
      if (typeof window.__getPageCache === 'function') {
        const cache = window.__getPageCache('agent-config');
        if (cache?.config) d = cache.config;
      }
      if (!d) { const r = await fetch('/api/config'); d = await r.json(); }
      document.getElementById('agentCfgMaxTools').value = d.max_tools || 10;
      document.getElementById('agentCfgSessionTimeout').value = d.session_timeout || 3600;
    } catch(e) {}
  }
  // 内联绑定 agent 配置 auto-save（避免 DOMContentLoaded 时机问题）
  attachAgentAutoSaveListeners();
}

export async function saveAgentSettings() {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }
  const body = {
    display_name: document.getElementById('cfgAgentName').value,
    icon: document.getElementById('cfgAgentIcon').textContent,
    avatar: document.getElementById('cfgAgentAvatar').value,
    max_tools: parseInt(document.getElementById('agentCfgMaxTools').value),
    max_tool_rounds: parseInt(document.getElementById('agentCfgMaxToolRounds').value),
    session_timeout: parseInt(document.getElementById('agentCfgSessionTimeout').value),
    llm_timeout: parseInt(document.getElementById('agentCfgLlmTimeout').value),
    llm_max_tokens: parseInt(document.getElementById('agentCfgLlmMaxTokens').value),
    llm_max_retries: parseInt(document.getElementById('agentCfgLlmMaxRetries').value),
    max_history_messages: parseInt(document.getElementById('agentCfgMaxHistoryMessages').value),
    skill_pre_filter_top_k: parseInt(document.getElementById('agentCfgSkillPreFilterTopK').value),
    default_vision_model: document.getElementById('agentDefaultVisionModel') ? document.getElementById('agentDefaultVisionModel').value : '',
    memory_integration: {
      max_tokens: parseInt(document.getElementById('agentCfgMemoryMaxTokens').value),
    },
  };
  // Primary: write to config.db via new API
  const r = await fetch('/api/config/agent/' + currentConfigAgent, {
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

let _agentModelAutoSaveTimer = null;

export function autoSaveAgentModels() {
  if (_agentModelAutoSaveTimer) clearTimeout(_agentModelAutoSaveTimer);
  _agentModelAutoSaveTimer = setTimeout(async () => {
    if (!currentConfigAgent) return;
    const availModels = [];
    document.querySelectorAll('.agent-avail-mcb:checked').forEach(cb => availModels.push(cb.value));
    const body = {
      model_names: availModels,
      default_name: document.getElementById('agentDefaultChatModel') ? document.getElementById('agentDefaultChatModel').value : '',
    };
    try {
      const r = await fetch('/api/config/agent/' + currentConfigAgent + '/models', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) {
        toast.success(t('agent.modelSaved'), 1500);
        if (typeof refreshConfigAgentPanel === 'function') refreshConfigAgentPanel();
        if (typeof loadChatModels === 'function') loadChatModels();
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
    toast.error(t ? t('agent.refreshFailed') : '配置刷新失败');
  }
}

// handleEmptyModels 已废弃 — 模型渲染由 renderAgentModelsForAgent() 统一处理

// ===== Agent Config =====
export async function selectConfigAgent(name) {
  // agentConfigData 可能尚未加载（sidebar 切换 agent 时 refreshConfigAgentPanel 异步未完成）
  if (!agentConfigData || !agentConfigData.agents || agentConfigData.agents.length === 0) {
    try {
      if (typeof window.__getPageCache === 'function') {
        const cache = window.__getPageCache('agent-config');
        if (cache?.agents) agentConfigData = { agents: cache.agents };
      }
      if (!agentConfigData) { const r = await fetch('/api/agents'); agentConfigData = await r.json(); }
    } catch(e) {}
  }
  const agents = (agentConfigData && agentConfigData.agents) || [];
  const agent = agents.find(a => a.name === name);
  if (!agent) return;
  currentConfigAgent = name;

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
    const soulTa = document.getElementById('agentSoulContentFiles');
    const mdTa = document.getElementById('agentMdContent');
    const memTa = document.getElementById('agentMemoryContent');
    if (soulTa) soulTa.value = cachedConfigSoulContent;
    if (mdTa) mdTa.value = cachedConfigAgentContent;
    if (memTa) memTa.value = cachedConfigMemoryContent;
  } catch(e) {
    loadError = e.message;
    const soulTa = document.getElementById('agentSoulContentFiles');
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
  const cfgAgentIconSpan = document.getElementById('cfgAgentIcon');
  if (cfgAgentIconSpan) cfgAgentIconSpan.textContent = agent.icon || '🎭';
  const cfgAgentIconBtn = document.getElementById('cfgAgentIconBtn');
  if (cfgAgentIconBtn) cfgAgentIconBtn.textContent = agent.icon || '🎭';
  const cfgAgentAvatar = document.getElementById('cfgAgentAvatar');
  if (cfgAgentAvatar) cfgAgentAvatar.value = agent.avatar || '';
  const av = document.getElementById('cfgAvatarPreview');
  if (av) {
    av.src = '/api/avatar?agent=' + currentConfigAgent;
    av.style.display = 'inline';
  }
  // Add delete button below identity-avatar-row
  const identityRow = document.querySelector('.identity-avatar-row');
  if (identityRow) {
    let delBtn = document.getElementById('cfgAgentDeleteBtn');
    if (!delBtn) {
      delBtn = document.createElement('button');
      delBtn.id = 'cfgAgentDeleteBtn';
      delBtn.className = 'siper-btn danger small js-btn-delete-agent';
      delBtn.textContent = '🗑️ 删除智能体';
      delBtn.onclick = function() { confirmDeleteAgent(agent.name); };
      identityRow.parentElement.insertBefore(delBtn, identityRow.nextSibling);
    }
  }
  // Save agent model refs for renderAgentModelSection to apply after rendering
  setPendingAgentModels({
    avail: (agent.available_models || []).map(m => typeof m === 'string' ? m : m.name),
    defChat: agent.default_chat_model || '',
    defVision: agent.default_vision_model || '',
  });

  // Load global models first, then render model section
  await loadGlobalModelsForAgent();
  renderAgentModelsForAgent(agent);
}

export function switchConfigAgentPageTab(tab) {
  document.getElementById('agentTabAbout').className = 'agent-tab' + (tab === 'about' ? ' active' : '');
  document.getElementById('agentTabFiles').className = 'agent-tab' + (tab === 'files' ? ' active' : '');
  document.getElementById('agentTabMemory').className = 'agent-tab' + (tab === 'memory' ? ' active' : '');
  const limitsTabBtn = document.querySelector('[data-tab="limits"]');
  if (limitsTabBtn) limitsTabBtn.className = 'agent-tab' + (tab === 'limits' ? ' active' : '');
  document.getElementById('agentTabContentAbout').classList[tab !== 'about' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentFiles').classList[tab !== 'files' ? 'add' : 'remove']('hidden');
  document.getElementById('agentTabContentMemory').classList[tab !== 'memory' ? 'add' : 'remove']('hidden');
  const tabLimits = document.getElementById('tab-limits');
  if (tabLimits) tabLimits.classList[tab !== 'limits' ? 'add' : 'remove']('hidden');
  // Auto-load memory when switching to memory tab
  if (tab === 'memory' && currentConfigAgent) {
    loadAgentMemoryContent(currentConfigAgent);
  }
}

export function refreshAgentFile(fileType) {
  let ta;
  if (fileType === 'soul') ta = document.getElementById('agentSoulContentFiles');
  else if (fileType === 'memory') ta = document.getElementById('agentMemoryContent');
  else ta = document.getElementById('agentMdContent');
  if (!ta) return;
  if (fileType === 'soul') ta.value = cachedConfigSoulContent;
  else if (fileType === 'memory') ta.value = cachedConfigMemoryContent;
  else ta.value = cachedConfigAgentContent;
}

export async function loadAgentMemoryContent(name) {
  let memTa;
  try {
    const r = await fetch('/api/agents/' + name + '/memory');
    const d = await r.json();
    cachedConfigMemoryContent = d.memory || '';
    memTa = document.getElementById('agentMemoryContent');
    if (memTa) memTa.value = cachedConfigMemoryContent;
    // Also update memory path display
    const pathEl = document.getElementById('agentCfgMemoryPath');
    if (pathEl) pathEl.value = 'agents/' + name + '/memory.md';
  } catch(e) {
    console.error('loadAgentMemoryContent error:', e);
    if (!memTa) memTa = document.getElementById('agentMemoryContent');
    if (memTa) memTa.value = '⚠️ 加载失败: ' + e.message;
  }
}

export async function saveAgentFile(fileType) {
  if (!currentConfigAgent) {
    toast.warning(t('agent.selectFirst'));
    return;
  }
  if (!fileType) return;
  let ta;
  if (fileType === 'soul') ta = document.getElementById('agentSoulContentFiles');
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
export async function uploadAgentAvatar() {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }
  const fileInput = document.getElementById('avatarFileInput');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) { toast.warning('请先选择图片'); return; }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('agent', currentConfigAgent);
  try {
    // 起源：通过 WS 通知后端
  if (typeof window.siPerSend === 'function') {
    window.siPerSend({ type: 'upload_avatar', agent: currentConfigAgent });
  }
  // 过渡期：HTTP 请求
  const r = await fetch('/api/avatar/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) {
      document.getElementById('cfgAgentAvatar').value = d.path;
      const img = document.getElementById('cfgAvatarPreview');
      img.src = '/api/avatar?agent=' + currentConfigAgent + '&t=' + Date.now();
      img.style.display = 'inline';
      toast.success('头像已保存');
      fileInput.value = '';
      // 同步更新 sidebar 中该 agent 的头像
      document.querySelectorAll('.siper-agent-avatar').forEach(el => {
        const src = el.getAttribute('src') || '';
        if (src.includes('agent=' + currentConfigAgent)) {
          el.src = '/api/avatar?agent=' + currentConfigAgent + '&t=' + Date.now();
        }
      });
      refreshConfigAgentPanel();
    } else {
      toast.error('上传失败: ' + (d.error || '未知错误'));
    }
  } catch(e) {
    toast.error('上传失败: ' + e.message);
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
  var span = document.getElementById('cfgAgentIcon');
  if (span) span.textContent = icon;
  var btn = document.getElementById('cfgAgentIconBtn');
  if (btn) btn.textContent = icon;
  hideIconPicker();
  triggerAgentAutoSave();
}


let _agentAutoSaveTimer = null;
let _agentFileAutoSaveTimer = null;

export function triggerAgentAutoSave() {
  if (!currentConfigAgent) return;
  if (_agentAutoSaveTimer) clearTimeout(_agentAutoSaveTimer);
  _agentAutoSaveTimer = setTimeout(async () => {
    const body = {
      display_name: document.getElementById('cfgAgentName').value,
      icon: document.getElementById('cfgAgentIcon').textContent,
      avatar: document.getElementById('cfgAgentAvatar').value,
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
    };
    try {
      const r = await fetch('/api/config/agent/' + currentConfigAgent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) {
        toast.success('配置已保存');
      } else {
        toast.error('保存失败: ' + (d.error || '未知错误'));
      }
    } catch(e) {
      toast.error('保存失败: ' + e.message);
    }
  }, 1000);
}

export function triggerAgentFileAutoSave() {
  if (!currentConfigAgent) return;
  if (_agentFileAutoSaveTimer) clearTimeout(_agentFileAutoSaveTimer);
  _agentFileAutoSaveTimer = setTimeout(async () => {
    const soulTa = document.getElementById('agentSoulContentFiles');
    const configTa = document.getElementById('agentMdContent');
    const memTa = document.getElementById('agentMemoryContent');
    const soulContent = soulTa ? soulTa.value : cachedConfigSoulContent;
    const configContent = configTa ? configTa.value : cachedConfigAgentContent;
    const memContent = memTa ? memTa.value : cachedConfigMemoryContent;
    let saved = false;
    try {
      if (soulContent !== cachedConfigSoulContent) {
        const r = await fetch('/api/agents/' + currentConfigAgent + '/soul', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: soulContent }) });
        const d = await r.json();
        if (d.success) { cachedConfigSoulContent = soulContent; saved = true; }
      }
      if (configContent !== cachedConfigAgentContent) {
        const r = await fetch('/api/agents/' + currentConfigAgent + '/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: configContent }) });
        const d = await r.json();
        if (d.success) { cachedConfigAgentContent = configContent; saved = true; }
      }
      if (memContent !== cachedConfigMemoryContent) {
        const r = await fetch('/api/agents/' + currentConfigAgent + '/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: memContent }) });
        const d = await r.json();
        if (d.success) { cachedConfigMemoryContent = memContent; saved = true; }
      }
      if (saved) toast.success('文件已自动保存', 1500);
    } catch(e) { toast.error('文件保存失败: ' + e.message); }
  }, 1500);
}

export function attachAgentAutoSaveListeners() {
  const fields = [
    'cfgAgentName', 'cfgAgentIcon',
    'agentCfgMaxTools', 'agentCfgSessionTimeout', 'agentCfgMaxToolRounds',
    'agentCfgLlmTimeout', 'agentCfgLlmMaxTokens', 'agentCfgLlmMaxRetries',
    'agentCfgMaxHistoryMessages', 'agentCfgMemoryMaxTokens', 'agentCfgSkillPreFilterTopK',
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

// attachAgentAutoSaveListeners() 已迁移到 loadAgentSettings() 末尾内联调用
// DOMContentLoaded 在 ESM deferred 模块中可能已触发过，导致监听器未绑定

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
  var saveBtn = document.querySelector('[onclick*="saveChatAgentFile"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }
  fetch('/api/agents/' + _agentConfigName + '/' + type, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ content: content })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存'; }
    if (data.success) {
      _chatAgentFiles[type] = content;
      setChatAgentFiles({ ..._chatAgentFiles });
      toast.success('文件已保存');
    } else {
      toast.error('保存失败: ' + (data.error || '未知错误'));
    }
  })
  .catch(function(e) { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存'; } toast.error('保存失败: ' + e.message); });
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
    var soulEditor = document.getElementById('agentSoulContentFiles');
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
    icon: document.getElementById('cfgAgentIcon').textContent,
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

// ===== Delete Agent =====
function confirmDeleteAgent(name) {
  showConfirm({
    title: '删除智能体',
    msg: '确定删除智能体「' + escapeHtml(name) + '」？此操作不可恢复。',
    danger: true,
    okText: '确认删除',
    onConfirm: function() {
      // 起源：通过 WS 通知后端
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'delete_agent', name });
      }
      // 过渡期：HTTP 请求
      fetch('/api/agents/' + name, { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.success) {
            toast.success('已删除');
            if (typeof refreshConfigAgentPanel === 'function') refreshConfigAgentPanel();
          } else {
            toast.error(data.error || '删除失败');
          }
        })
        .catch(function() { toast.error('网络错误'); });
    }
  });
}

// ===== Add Agent Modal =====
export function showAddAgentModal() {
  showForm({
    title: '新增智能体',
    fields: [
      { id: 'addAgentNameInput', label: '名称 *', placeholder: 'my-agent', maxlength: 32 },
      { id: 'addAgentDisplayInput', label: '显示名称', placeholder: '我的智能体', maxlength: 64 },
      { id: 'addAgentIconInput', label: '图标', placeholder: '🎭', maxlength: 4 },
    ],
    onConfirm: function(values) {
      var name = values.addAgentNameInput || '';
      var displayName = values.addAgentDisplayInput || name;
      var icon = values.addAgentIconInput || '🎭';
      if (!name) { toast.warning('请输入名称'); return; }
      if (!/^[a-zA-Z0-9_\-]+$/.test(name)) { toast.warning('名称只允许字母数字下划线'); return; }
      toast.info('正在创建...');
      fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: name, display_name: displayName, icon: icon }),
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
          toast.success('已创建: ' + name);
          if (typeof refreshConfigAgentPanel === 'function') refreshConfigAgentPanel();
        } else {
          toast.error(data.error || '创建失败');
        }
      }).catch(function() { toast.error('网络错误'); });
    }
  });
}

// ===== Window Mount =====
window.showAddAgentModal = showAddAgentModal;
window.confirmDeleteAgent = confirmDeleteAgent;
window.switchConfigAgentPageTab = switchConfigAgentPageTab;
window.triggerAgentFileAutoSave = triggerAgentFileAutoSave;
window.autoSaveAgentModels = autoSaveAgentModels;
window.loadGlobalModelsForAgent = loadGlobalModelsForAgent;
window.toggleIconPicker = toggleIconPicker;
