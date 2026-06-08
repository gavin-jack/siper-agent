// components/agent-models.js — Agent 模型管理
// 从 pages/page-agent-config.js 提取

import { escapeHtml } from '../utils/escape.js';
import { t } from '../utils/i18n.js';
import { toast } from '../components/toast.js';
import { CAP_ICONS, CAP_ORDER } from '../utils/capabilities.js';

// 模块级状态
let globalModelsList = [];
let modelsLoaded = false;
let _pendingAgentModels = null;

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

export function renderAgentModelSection(globalModels, agentAvailNames) {
  const availSet = new Set(agentAvailNames || []);
  const modelOptions = globalModels.map(m => {
    const alias = m.alias ? ` (${m.alias})` : '';
    return `<option value="${m.name}">${escapeHtml(m.name)}${escapeHtml(alias)}</option>`;
  }).join('');
  const checkboxes = globalModels.map(m => {
    const alias = m.alias ? ` (${m.alias})` : '';
    const caps = (m.capabilities || []).slice().sort((a, b) => (CAP_ORDER[a] ?? 50) - (CAP_ORDER[b] ?? 50)).map(c => CAP_ICONS[c] || c).join('');
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

  const chatSel = document.getElementById('agentDefaultChatModel');
  const visionSel = document.getElementById('agentDefaultVisionModel');
  if (_pendingAgentModels) {
    if (chatSel) chatSel.value = _pendingAgentModels.defChat || '';
    if (visionSel) visionSel.value = _pendingAgentModels.defVision || '';
    _pendingAgentModels = null;
  }
}

export function renderAgentModelsForAgent(agentData, loadChatAgents, loadChatModels) {
  const agentAvailNames = (agentData && agentData.available_models || []).map(m => typeof m === 'string' ? m : m.name);
  _pendingAgentModels = {
    avail: agentAvailNames,
    defChat: agentData ? (agentData.default_chat_model || '') : '',
    defVision: agentData ? (agentData.default_vision_model || '') : '',
  };
  if (modelsLoaded && globalModelsList.length > 0) {
    renderAgentModelSection(globalModelsList, agentAvailNames);
  }
  loadGlobalModelsForAgent().then(() => {
    renderAgentModelSection(globalModelsList, agentAvailNames);
  });
}

export { globalModelsList, modelsLoaded, _pendingAgentModels };
