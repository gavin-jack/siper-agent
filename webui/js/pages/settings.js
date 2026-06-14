// pages/settings.js — 全局设置（系统参数 + Agent管理）
// 起源版：删除所有 fetch 调用，数据由后端快照 page_cache 提供
// 过渡期：保留 HTTP 请求作为兜底

import { t } from '../utils/i18n.js';
import { escapeHtml } from '../utils/escape.js';
import { showConfirm, showInput } from '../components/toast.js';
import { toast } from '../components/toast.js';

// ===== Global Settings =====
export let settingsCache = null;

// ===== System Parameters =====

export function resetSystemParams() {
  document.getElementById('sysWsHeartbeatTimeout').value = 300;
  document.getElementById('sysSessionListLimit').value = 50;
  document.getElementById('sysLogBufferSize').value = 2000;
  document.getElementById('sysTokenUsageMax').value = 500;
  document.getElementById('sysCtxWindowDefault').value = 8192;
  document.getElementById('sysPort').value = 9724;
  document.getElementById('sysLogLevel').value = 'INFO';
  autoSaveSystemParams();
  if (toast) toast.info('已重置为默认值', 1500);
}

let _sysSaveTimer = null;
export function autoSaveSystemParams() {
  if (_sysSaveTimer) clearTimeout(_sysSaveTimer);
  _sysSaveTimer = setTimeout(async () => {
    const system = {
      ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value) || 300,
      session_list_limit: parseInt(document.getElementById('sysSessionListLimit').value) || 50,
      log_buffer_size: parseInt(document.getElementById('sysLogBufferSize').value) || 2000,
      token_usage_max: parseInt(document.getElementById('sysTokenUsageMax').value) || 500,
      context_window_default: parseInt(document.getElementById('sysCtxWindowDefault').value) || 8192,
      port: parseInt(document.getElementById('sysPort').value) || 9724,
      log_level: document.getElementById('sysLogLevel').value || 'INFO',
    };
    // 起源：通过 WS 通知后端
    if (typeof window.siPerSend === 'function') {
      window.siPerSend({ type: 'save_config', system });
    }
    // 过渡期：HTTP 请求
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system }),
      });
      const d = await r.json();
      if (d.success) {
        toast.success('系统参数已保存', 1000);
      } else {
        toast.error('保存失败: ' + (d.error || 'unknown'));
      }
    } catch(e) {
      toast.error('保存失败: ' + e.message);
    }
  }, 500);
}

// ===== Refresh / Load Settings =====

export function refreshGlobalSettings() {
  // 起源：从快照 page_cache 获取
  if (typeof window.__getPageCache === 'function') {
    const cache = window.__getPageCache('settings');
    if (cache && cache.config) {
      _applySettingsData(cache.config);
      return;
    }
  }
  // 过渡期：HTTP 请求
  fetch('/api/config').then(r => r.json()).then(data => {
    settingsCache = data;
    _applySettingsData(data);
  }).catch(e => {
    console.error('refreshGlobalSettings error:', e);
    if (toast) toast.error(t('settings.refreshFailed'));
  });
}

function _applySettingsData(data) {
  settingsCache = data;
  if (document.getElementById('cfgMaxTools')) {
    document.getElementById('cfgMaxTools').value = data.max_tools || 30;
    document.getElementById('cfgMaxToolRounds').value = data.max_tool_rounds || 100;
    document.getElementById('cfgSessionTimeout').value = data.session_timeout || 3600;
    document.getElementById('cfgAgentName').value = data.agent_name || 'Siper Agent';
    document.getElementById('cfgIcon').value = data.icon || '🎭';
    document.getElementById('cfgAvatar').value = data.avatar || '';
  }
  const sys = data.system || {};
  if (document.getElementById('sysWsHeartbeatTimeout')) {
    document.getElementById('sysWsHeartbeatTimeout').value = sys.ws_heartbeat_timeout || 300;
    document.getElementById('sysSessionListLimit').value = sys.session_list_limit || 50;
    document.getElementById('sysLogBufferSize').value = sys.log_buffer_size || 2000;
    document.getElementById('sysTokenUsageMax').value = sys.token_usage_max || 500;
    document.getElementById('sysCtxWindowDefault').value = sys.context_window_default || 8192;
    if (document.getElementById('sysPort')) document.getElementById('sysPort').value = sys.port || 9724;
    if (document.getElementById('sysLogLevel')) document.getElementById('sysLogLevel').value = sys.log_level || 'INFO';
  }
}

// ===== Meta Config =====

export function saveMetaConfig() {
  const cfg = {
    showTokens: document.getElementById('cfgMetaTokens')?.checked,
    showCached: document.getElementById('cfgMetaCached')?.checked,
    showTools: document.getElementById('cfgMetaTools')?.checked,
    showSkills: document.getElementById('cfgMetaSkills')?.checked,
    showTime: document.getElementById('cfgMetaTime')?.checked,
    showToolSteps: document.getElementById('cfgMetaToolSteps')?.checked,
    showDebug: document.getElementById('cfgMetaDebug')?.checked,
    brTokens: document.getElementById('cfgMetaTokensBr')?.checked,
    brCached: document.getElementById('cfgMetaCachedBr')?.checked,
    brTools: document.getElementById('cfgMetaToolsBr')?.checked,
    brSkills: document.getElementById('cfgMetaSkillsBr')?.checked,
    brTime: document.getElementById('cfgMetaTimeBr')?.checked,
  };
  localStorage.setItem('siper_meta_config', JSON.stringify(cfg));
}

export function loadMetaConfig() {
  try {
    const raw = localStorage.getItem('siper_meta_config');
    const cfg = raw ? JSON.parse(raw) : null;
    if (cfg) {
      const ids = [
        ['cfgMetaTokens', 'showTokens'], ['cfgMetaCached', 'showCached'],
        ['cfgMetaTools', 'showTools'], ['cfgMetaSkills', 'showSkills'],
        ['cfgMetaTime', 'showTime'], ['cfgMetaToolSteps', 'showToolSteps'],
        ['cfgMetaDebug', 'showDebug'], ['cfgMetaTokensBr', 'brTokens'],
        ['cfgMetaCachedBr', 'brCached'], ['cfgMetaToolsBr', 'brTools'],
        ['cfgMetaSkillsBr', 'brSkills'], ['cfgMetaTimeBr', 'brTime'],
      ];
      ids.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!cfg[key];
      });
    }
  } catch(e) {}
}

// ===== Auto-Save for Global Settings =====

export function attachSettingsAutoSaveListeners() {
  const sysFields = ['sysWsHeartbeatTimeout', 'sysSessionListLimit', 'sysLogBufferSize', 'sysTokenUsageMax', 'sysCtxWindowDefault', 'sysPort', 'sysLogLevel'];
  let bound = 0;
  sysFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', autoSaveSystemParams);
      if (el.tagName === 'SELECT') el.addEventListener('change', autoSaveSystemParams);
      bound++;
    }
  });
  const metaFields = ['cfgMetaTokens', 'cfgMetaTokensBr', 'cfgMetaCached', 'cfgMetaCachedBr', 'cfgMetaTools', 'cfgMetaToolsBr', 'cfgMetaSkills', 'cfgMetaSkillsBr', 'cfgMetaTime', 'cfgMetaTimeBr', 'cfgMetaToolSteps', 'cfgMetaDebug'];
  metaFields.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', saveMetaConfig); });
}

// ===== Chat Mode Helpers =====

export function switchSettingsTab(tab) {
  window._currentSettingsTab = tab;
  const tabs = document.querySelectorAll('.siper-settings-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const sys = document.getElementById('chatSystemSettings');
  const agents = document.getElementById('chatGlobalAgents');
  if (sys) sys.classList.toggle('js-hidden', tab !== 'system');
  if (tab === 'system' && typeof refreshGlobalSettings === 'function') {
    refreshGlobalSettings();
  }
  if (agents) agents.classList.toggle('js-hidden', tab !== 'agents');
  if (tab === 'agents' && typeof renderGlobalAgents === 'function') {
    renderGlobalAgents();
  }
}

// ===== Agent Management =====

let _agentListCache = [];

export function renderGlobalAgents() {
  const grid = document.getElementById('globalAgentCards');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-dim);font-size:13px">加载中…</div>';
  
  // 起源：从快照 page_cache 获取
  if (typeof window.__getPageCache === 'function') {
    const cache = window.__getPageCache('settings');
    if (cache && cache.agents) {
      _renderAgentCards(cache.agents);
      return;
    }
  }
  // 过渡期：HTTP 请求
  fetch('/api/agents').then(r => r.json()).then(data => {
    _renderAgentCards(data.agents || data || []);
  }).catch(() => {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--danger);font-size:13px">加载失败</div>';
  });
}

function _renderAgentCards(agents) {
  _agentListCache = agents;
  const grid = document.getElementById('globalAgentCards');
  if (!grid) return;
  if (agents.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim);font-size:13px">暂无智能体<br><span style="font-size:12px">点击右上角「+ 新增智能体」创建</span></div>';
    return;
  }
  grid.innerHTML = '';
  agents.forEach(a => {
    const card = document.createElement('div');
    card.className = 'agent-card' + (a.is_active ? ' agent-card-active' : '');
    card.dataset.name = a.name;
    const avatarHtml = a.avatar
      ? '<img src="/' + escapeHtml(a.avatar) + '" class="agent-card-avatar" alt="">'
      : '<div class="agent-card-avatar agent-card-avatar-placeholder">' + escapeHtml(a.icon || '🎭') + '</div>';
    const badges = [];
    if (a.is_active) badges.push('<span class="agent-card-badge badge-current">当前</span>');
    if (a.has_soul) badges.push('<span class="agent-card-badge badge-ok">Soul</span>');
    if (a.has_config) badges.push('<span class="agent-card-badge badge-ok">Config</span>');
    const modelCount = (a.available_models || []).length;
    card.innerHTML =
      '<div class="agent-card-header">' +
        avatarHtml +
        '<div class="agent-card-info">' +
          '<div class="agent-card-name">' + escapeHtml(a.display_name || a.name) + '</div>' +
          '<div class="agent-card-dir"><code>agents/' + escapeHtml(a.name) + '/</code></div>' +
        '</div>' +
        '<div class="agent-card-actions">' +
          '<button class="agent-card-btn" onclick="window._agentCardSelect(\'' + escapeHtml(a.name) + '\')" title="详情">ℹ</button>' +
          '<button class="agent-card-btn danger" onclick="window._agentCardDelete(\'' + escapeHtml(a.name) + '\')" title="删除">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="agent-card-badges">' + badges.join('') + '</div>' +
      '<div class="agent-card-meta">' +
        '<span>🎭 ' + escapeHtml(a.icon || '🎭') + '</span>' +
        '<span>📦 ' + modelCount + ' 个模型</span>' +
      '</div>';
    grid.appendChild(card);
  });
}

export function onGlobalAgentSelect(name) {
  const cards = document.querySelectorAll('#globalAgentCards .agent-card');
  cards.forEach(c => c.classList.toggle('agent-card-selected', c.dataset.name === name));
  const detail = document.getElementById('globalAgentCardDetail');
  if (!name || !detail) { if (detail) detail.style.display = 'none'; return; }
  const agent = _agentListCache.find(a => a.name === name);
  if (!agent) { detail.style.display = 'none'; return; }
  detail.style.display = '';
  detail.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
    (agent.avatar
      ? '<img src="/' + escapeHtml(agent.avatar) + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover">'
      : '<div style="width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px">' + escapeHtml(agent.icon || '🎭') + '</div>') +
    '<div><b>' + escapeHtml(agent.display_name || agent.name) + '</b> <span style="font-size:12px;color:var(--text-dim)">' + escapeHtml(agent.name) + '</span></div>' +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="siper-btn" onclick="window._agentRename(\'' + escapeHtml(name) + '\')">✏ 重命名</button>' +
      '<button class="siper-btn" onclick="window._agentEditFile(\'' + escapeHtml(name) + '\',\'soul\')">📝 Soul.md</button>' +
      '<button class="siper-btn" onclick="window._agentEditFile(\'' + escapeHtml(name) + '\',\'config\')">📝 Agent.md</button>' +
    '</div>' +
    '<div id="agentFileEditor" style="display:none">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span id="agentFileEditorTitle" class="js-text-bold-sm"></span>' +
        '<div style="display:flex;gap:4px">' +
          '<button class="siper-btn primary" onclick="window._agentSaveFile()" class="js-btn-sm">保存</button>' +
          '<button class="siper-btn" onclick="window._agentCloseEditor()" class="js-btn-sm">取消</button>' +
        '</div>' +
      '</div>' +
      '<textarea id="agentFileEditorArea" class="siper-input" class="js-textarea-code" aria-label="文件编辑器"></textarea>' +
    '</div>';
}

export function confirmDeleteGlobalAgent() {
  const selected = document.querySelector('#globalAgentCards .agent-card-selected');
  const name = selected ? selected.dataset.name : null;
  if (!name) return;
  if (typeof showConfirm !== 'function') return;
  showConfirm({
    title: '删除智能体',
    msg: '将删除整个目录 <code>agents/' + escapeHtml(name) + '/</code>，包括所有配置、会话和记忆文件。<br><br>此操作不可恢复！',
    danger: true,
    okText: '确认删除',
    onConfirm: () => {
      const _btn = document.querySelector('.siper-confirm-ok');
      if (_btn) { _btn.disabled = true; _btn.textContent = '删除中...'; }
      // 起源：通过 WS 通知后端
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'delete_agent', name });
      }
      // 过渡期：HTTP 请求
      fetch('/api/agents/' + name, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
          if (_btn) { _btn.disabled = false; _btn.textContent = '确认删除'; }
          if (data.success) {
            if (typeof toast !== 'undefined') toast.success('已删除: ' + name);
            const detail = document.getElementById('globalAgentCardDetail');
            if (detail) detail.style.display = 'none';
            renderGlobalAgents();
            if (typeof window.loadChatAgents === 'function') window.loadChatAgents();
          } else {
            if (typeof toast !== 'undefined') toast.error(data.error || '删除失败');
          }
        })
        .catch(() => { if (_btn) { _btn.disabled = false; _btn.textContent = '确认删除'; } if (typeof toast !== 'undefined') toast.error('网络错误'); });
    }
  });
}

// ===== Rename Modal =====
window.showRenameModal = function(opts) {
  var title = opts.title || '重命名';
  var currentName = opts.currentName || '';
  var onConfirm = opts.onConfirm || function(){};
  showInput({
    title: title,
    placeholder: currentName,
    onConfirm: function(val) {
      if (!val.trim()) return;
      onConfirm(val.trim());
    }
  });
};

// Card mode helpers
window._agentCardSelect = function(name) {
  if (typeof window.onGlobalAgentSelect === 'function') window.onGlobalAgentSelect(name);
};
window._agentCardDelete = function(name) {
  if (typeof window.confirmDeleteGlobalAgent === 'function') window.confirmDeleteGlobalAgent();
};

// Rename agent
window._agentRename = function(name) {
  if (typeof window.showRenameModal !== 'function') return;
  window.showRenameModal({
    title: '重命名智能体',
    currentName: name,
    onConfirm: (newName) => {
      // 起源：通过 WS 通知后端
      if (typeof window.siPerSend === 'function') {
        window.siPerSend({ type: 'rename_agent', name, new_name: newName });
      }
      // 过渡期：HTTP 请求
      fetch('/api/agents/' + name + '/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName }),
      }).then(r => r.json()).then(data => {
        if (data.success) {
          if (typeof toast !== 'undefined') toast.success('已重命名: ' + name + ' → ' + newName);
          const detail = document.getElementById('globalAgentCardDetail');
          if (detail) detail.style.display = 'none';
          renderGlobalAgents();
          if (typeof window.loadChatAgents === 'function') window.loadChatAgents();
        } else {
          if (typeof toast !== 'undefined') toast.error(data.error || '重命名失败');
        }
      }).catch(() => { if (typeof toast !== 'undefined') toast.error('网络错误'); });
    }
  });
};

// Edit agent file
let _agentEditName = '', _agentEditType = '';
window._agentEditFile = function(name, type) {
  _agentEditName = name;
  _agentEditType = type;
  const editor = document.getElementById('agentFileEditor');
  const title = document.getElementById('agentFileEditorTitle');
  const area = document.getElementById('agentFileEditorArea');
  if (!editor || !title || !area) return;
  editor.style.display = '';
  title.textContent = (type === 'soul' ? 'Soul.md' : 'Agent.md') + ' — ' + name;
  area.disabled = true;
  area.value = '加载中…';
  // 过渡期：HTTP 请求
  fetch('/api/agents/' + name + '/' + (type === 'soul' ? 'soul' : 'config'))
    .then(r => r.json())
    .then(data => {
      area.value = data.config || data.content || data.soul || '';
      area.disabled = false;
    })
    .catch(() => { area.value = '加载失败'; });
};

window._agentSaveFile = function() {
  const area = document.getElementById('agentFileEditorArea');
  if (!area || !_agentEditName || !_agentEditType) return;
  const content = area.value;
  // 起源：通过 WS 通知后端
  if (typeof window.siPerSend === 'function') {
    window.siPerSend({ type: 'save_agent_file', name: _agentEditName, type: _agentEditType, content });
  }
  // 过渡期：HTTP 请求
  fetch('/api/agents/' + _agentEditName + '/' + (_agentEditType === 'soul' ? 'soul' : 'config'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content }),
  }).then(r => r.json()).then(data => {
    if (data.success) {
      if (typeof toast !== 'undefined') toast.success('已保存');
      window._agentCloseEditor();
    } else {
      if (typeof toast !== 'undefined') toast.error(data.error || '保存失败');
    }
  }).catch(() => { if (typeof toast !== 'undefined') toast.error('网络错误'); });
};

window._agentCloseEditor = function() {
  const editor = document.getElementById('agentFileEditor');
  if (editor) editor.style.display = 'none';
};

// 向后兼容
window.switchSettingsTab = switchSettingsTab;
window.renderGlobalAgents = renderGlobalAgents;
window.onGlobalAgentSelect = onGlobalAgentSelect;
window.confirmDeleteGlobalAgent = confirmDeleteGlobalAgent;
window.refreshGlobalSettings = refreshGlobalSettings;
window.autoSaveSystemParams = autoSaveSystemParams;
window.resetSystemParams = resetSystemParams;
window.saveMetaConfig = saveMetaConfig;
window.loadMetaConfig = loadMetaConfig;
window.attachSettingsAutoSaveListeners = attachSettingsAutoSaveListeners;
