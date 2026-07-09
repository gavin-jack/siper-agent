// pages/agent-config.js — Agent 配置管理
// 优化：提取 _loadConfigWithCache / _buildAgentConfigBody 消除重复

import { t } from '../utils/i18n.js?v=1783583146303';
import { escapeHtml } from '../utils/escape.js?v=1783583146303';
import { showConfirm, showForm } from '../components/toast.js?v=1783583146303';
import { toast } from '../components/toast.js?v=1783583146303';
import { _chatAgentData, _chatSelectedAgent, _agentConfigName, _chatAgentFiles, _chatCurAgentFile, setChatAgentFiles, setChatCurAgentFile } from '../chat/state.js?v=1783583146303';
import { loadGlobalModelsForAgent, renderAgentModelSection, renderAgentModelsForAgent, globalModelsList, modelsLoaded, setPendingAgentModels } from '../components/agent-models.js?v=1783583146303';
export { loadGlobalModelsForAgent };

// ===== 页面模板 =====
export function _tplAgentConfigPage() {
  return `<div class="page-header">
    <h2 data-i18n="agentConfig.title">智能体配置</h2>
    <div class="actions">
      <button class="btn-sm primary" onclick="navigateToPage('chat')" data-i18n="agentConfig.backToChat">← 返回对话</button>
    </div>
  </div>
  <div id="agentConfigContent">
    <div id="agentSelector" class="agent-selector"></div>
    <div id="agentConfigTitle" class="agent-config-title"></div>
    <div class="agent-tabs">
      <button class="agent-tab active" data-tab="about" id="agentTabAbout" onclick="switchConfigAgentPageTab('about')">关于</button>
      <button class="agent-tab" data-tab="files" id="agentTabFiles" onclick="switchConfigAgentPageTab('files')">属性文件</button>
      <button class="agent-tab" data-tab="memory" id="agentTabMemory" onclick="switchConfigAgentPageTab('memory')">记忆</button>
      <button class="agent-tab" data-tab="limits" onclick="switchConfigAgentPageTab('limits')">限制</button>
    </div>
    <div class="agent-tab-content active" id="agentTabContentAbout"></div>
    <div class="agent-tab-content" id="agentTabContentFiles"></div>
    <div class="agent-tab-content" id="agentTabContentMemory"></div>
    <div class="agent-tab-content" id="tab-limits"></div>
    <div class="agent-config-footer">
      <button class="btn-sm" id="cfgAgentDeleteBtn" onclick="if(typeof confirmDeleteAgent==='function'&&currentConfigAgent)confirmDeleteAgent(currentConfigAgent)" data-i18n="agentConfig.deleteAgent">删除智能体</button>
      <button class="btn-sm primary" onclick="saveAllChatAgentConfig()" data-i18n="agentConfig.saveAll">保存全部</button>
    </div>
  </div>
  <div id="iconPickerPopup" class="icon-picker-popup hidden"></div>`;
}
// ===== 共享辅助函数 =====

/** 从 page_cache 或 HTTP 获取全局配置（消除 4 次重复的 cache→fetch 回退） */
async function _loadConfigWithCache() {
  if (typeof window.__getPageCache === 'function') {
    const cache = window.__getPageCache('agent-config');
    if (cache?.config) return cache.config;
  }
  const r = await fetch('/api/config');
  return await r.json();
}

/** 构建 agent 配置 POST body（saveAgentSettings 和 triggerAgentAutoSave 共用） */
function _buildAgentConfigBody() {
  return {
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
}

/** 从 agent 对象填充表单字段 */
function _applyAgentToForm(agent) {
  document.getElementById('cfgAgentName').value = agent.display_name || agent.name || 'Siper Agent';
  const cfgAgentIconSpan = document.getElementById('cfgAgentIcon');
  if (cfgAgentIconSpan) cfgAgentIconSpan.textContent = agent.icon || '🎭';
  document.getElementById('cfgAgentAvatar').value = agent.avatar || '';
  const av = document.getElementById('cfgAvatarPreview');
  av.src = '/api/avatar?agent=' + encodeURIComponent(currentConfigAgent || agent.name);
  av.style.display = 'inline';

  // 有 per-agent 值用 per-agent，否则 fallback 全局配置
  const fields = [
    ['agentCfgMaxTools', 'max_tools', 10],
    ['agentCfgSessionTimeout', 'session_timeout', 3600],
    ['agentCfgMaxToolRounds', 'max_tool_rounds', 100],
  ];
  const needGlobalFallback = fields.some(([_, k]) => agent[k] === undefined || agent[k] === null);

  if (needGlobalFallback) {
    _loadConfigWithCache().then(gd => {
      for (const [id, key, def] of fields) {
        document.getElementById(id).value = (agent[key] !== undefined && agent[key] !== null) ? agent[key] : (gd[key] || def);
      }
    }).catch(() => {
      for (const [id, , def] of fields) {
        document.getElementById(id).value = def;
      }
    });
  } else {
    for (const [id, key] of fields) {
      document.getElementById(id).value = agent[key];
    }
  }

  // Limits 字段
  document.getElementById('agentCfgLlmTimeout').value = agent.llm_timeout !== undefined ? agent.llm_timeout : 120;
  document.getElementById('agentCfgLlmMaxTokens').value = agent.llm_max_tokens !== undefined ? agent.llm_max_tokens : 8192;
  document.getElementById('agentCfgLlmMaxRetries').value = agent.llm_max_retries !== undefined ? agent.llm_max_retries : 2;
  document.getElementById('agentCfgMaxHistoryMessages').value = agent.max_history_messages !== undefined ? agent.max_history_messages : 50;
  document.getElementById('agentCfgMemoryMaxTokens').value = (agent.memory_integration?.max_tokens !== undefined) ? agent.memory_integration.max_tokens : 20000;
  document.getElementById('agentCfgSkillPreFilterTopK').value = agent.skill_pre_filter_top_k !== undefined ? agent.skill_pre_filter_top_k : 5;

  if (agent.default_vision_model !== undefined) {
    const visionSel = document.getElementById('agentDefaultVisionModel');
    if (visionSel) visionSel.value = agent.default_vision_model || '— 使用全局默认 —';
  }
  const _lblLimits = document.getElementById('currentAgentLabelLimits');
  if (_lblLimits) _lblLimits.textContent = (agent.display_name || agent.name) + ' - 设置';
}

// ===== Agent Settings =====

export async function loadAgentSettings() {
  // 确保 agentConfigData 已加载（注意：[] 是 truthy，必须检查 length）
  if (!agentConfigData?.agents?.length) {
    try {
      await refreshConfigAgentPanel();
    } catch(e) {}
  }
  if (currentConfigAgent && agentConfigData?.agents) {
    const agent = agentConfigData.agents.find(a => a.name === currentConfigAgent);
    if (agent) {
      _applyAgentToForm(agent);
    }
  }
  if (!currentConfigAgent) {
    try {
      const d = await _loadConfigWithCache();
      document.getElementById('agentCfgMaxTools').value = d.max_tools || 10;
      document.getElementById('agentCfgSessionTimeout').value = d.session_timeout || 3600;
    } catch(e) {}
  }
  attachAgentAutoSaveListeners();
}

export async function saveAgentSettings() {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }
  const body = _buildAgentConfigBody();
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

// ===== Agent Config =====
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
    const activeAgent = agents.find(a => a.is_active);
    if (activeAgent) {
      selectConfigAgent(activeAgent.name);
    }
  } catch(e) {
    console.error('refreshConfigAgentPanel error:', e);
    toast.error(t ? t('agent.refreshFailed') : '配置刷新失败');
  }
}

export async function selectConfigAgent(name) {
  if (!agentConfigData?.agents?.length) {
    try {
      if (typeof window.__getPageCache === 'function') {
        const cache = window.__getPageCache('agent-config');
        if (cache?.agents) agentConfigData = { agents: cache.agents };
      }
      if (!agentConfigData?.agents?.length) { const r = await fetch('/api/agents'); agentConfigData = await r.json(); }
    } catch(e) {}
  }
  const agents = agentConfigData?.agents || [];
  const agent = agents.find(a => a.name === name);
  if (!agent) return;
  currentConfigAgent = name;

  // Load agent files
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
    const ids = ['agentSoulContentFiles', 'agentMdContent', 'agentMemoryContent'];
    for (const id of ids) {
      const ta = document.getElementById(id);
      if (ta) { ta.value = ''; ta.placeholder = '加载失败: ' + loadError; }
    }
  }

  // Apply agent meta to form
  const agentConfigTitle = document.getElementById('agentConfigTitle');
  if (agentConfigTitle) agentConfigTitle.innerHTML = '<strong>' + escapeHtml(agent.name) + ' - 设置</strong>';
  _applyAgentToForm(agent);

  // Add delete button
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

  setPendingAgentModels({
    avail: (agent.available_models || []).map(m => typeof m === 'string' ? m : m.name),
    defChat: agent.default_chat_model || '',
    defVision: agent.default_vision_model || '',
  });

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
    const pathEl = document.getElementById('agentCfgMemoryPath');
    if (pathEl) pathEl.value = 'agents/' + name + '/memory.md';
  } catch(e) {
    console.error('loadAgentMemoryContent error:', e);
    if (!memTa) memTa = document.getElementById('agentMemoryContent');
    if (memTa) memTa.value = '⚠️ 加载失败: ' + e.message;
  }
}

export async function saveAgentFile(fileType) {
  if (!currentConfigAgent) { toast.warning(t('agent.selectFirst')); return; }
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
  const file = fileInput?.files?.[0];
  if (!file) { toast.warning('请先选择图片'); return; }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('agent', currentConfigAgent);
  try {
    if (typeof window.siPerSend === 'function') {
      window.siPerSend({ type: 'upload_avatar', agent: currentConfigAgent });
    }
    const r = await fetch('/api/avatar/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) {
      document.getElementById('cfgAgentAvatar').value = d.path;
      const img = document.getElementById('cfgAvatarPreview');
      img.src = '/api/avatar?agent=' + currentConfigAgent + '&t=' + Date.now();
      img.style.display = 'inline';
      toast.success('头像已保存');
      fileInput.value = '';
      document.querySelectorAll('.siper-agent-avatar').forEach(el => {
        if ((el.getAttribute('src') || '').includes('agent=' + currentConfigAgent)) {
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

// ===== Auto-Save =====
let _agentAutoSaveTimer = null;
let _agentFileAutoSaveTimer = null;

export function triggerAgentAutoSave() {
  if (!currentConfigAgent) return;
  if (_agentAutoSaveTimer) clearTimeout(_agentAutoSaveTimer);
  _agentAutoSaveTimer = setTimeout(async () => {
    const body = _buildAgentConfigBody();
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
      if (el.type === 'number') el.addEventListener('input', triggerAgentAutoSave);
    }
  });
  const iconBtn = document.getElementById('cfgAgentIconBtn');
  if (iconBtn) iconBtn.addEventListener('click', triggerAgentAutoSave);
}

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

// ===== Legacy Agent Config Functions =====

export function switchChatAgentTab(tab, btn) {
  document.querySelectorAll('.agent-tab').forEach(function(el) { el.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.agent-tab-content').forEach(function(el) { el.classList.remove('active'); });
  var content = document.getElementById('agentTabContent' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (content) content.classList.add('active');
}

export function switchChatAgentFile(type, btn) {
  setChatCurAgentFile(type);
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
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'delete_agent', name });
      }
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