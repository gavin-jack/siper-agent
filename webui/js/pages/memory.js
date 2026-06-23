/**
 * memory.js — 记忆管理页面（起源版：纯渲染）
 * 
 * 删除所有 fetch 调用，数据由后端快照通过 WS 推送。
 */
import { t } from '../utils/i18n.js?v=1782157049636';
import { toast } from '../components/toast.js?v=1782157049636';

let _currentMemoryAgent = '';
let _memoryContent = '';
let _memoryConfig = { mode: 'append', max_tokens: 2000, template: '' };
let _agentsList = [];

// ===== 渲染函数 =====

/**
 * 渲染智能体选择器
 * @param {Array} agents — AgentInfo 列表
 * @param {string} activeAgent — 当前活跃的智能体名
 */
export function renderMemoryAgentSelector(agents, activeAgent) {
  _agentsList = agents || [];
  const sel = document.getElementById('memoryAgentSelector');
  if (!sel) return;
  sel.innerHTML = '<option value="">' + t('memory.selectAgent') + '</option>';
  for (const a of _agentsList) {
    const label = (a.display_name || a.name) + (a.has_memory ? '' : ' (' + t('memory.noFile') + ')');
    sel.innerHTML += '<option value="' + a.name + '">' + label + '</option>';
  }
  if (activeAgent) {
    sel.value = activeAgent;
    _currentMemoryAgent = activeAgent;
    _renderMemoryContent(activeAgent);
  }
}

/**
 * 渲染记忆内容
 * @param {string} agentName
 * @param {string} content — Markdown 内容
 */
export function renderMemoryContent(agentName, content) {
  _currentMemoryAgent = agentName;
  _memoryContent = content || '';
  const ta = document.getElementById('memoryMdEditor');
  if (ta) ta.value = _memoryContent;
  const label = document.getElementById('memoryAgentLabel');
  if (label) label.textContent = agentName ? '[' + agentName + ']' : '';
}

/**
 * 渲染记忆配置
 * @param {object} config — { mode, max_tokens, template }
 */
export function renderMemoryConfig(config) {
  _memoryConfig = config || _memoryConfig;
  const modeEl = document.getElementById('memMode');
  const tokensEl = document.getElementById('memMaxTokens');
  const tplEl = document.getElementById('memTemplate');
  if (modeEl) modeEl.value = _memoryConfig.mode || 'append';
  if (tokensEl) tokensEl.value = _memoryConfig.max_tokens || 2000;
  if (tplEl) tplEl.value = _memoryConfig.template || '';
  _updateMemoryPreview();
}

// ===== 用户操作 =====

export function onMemoryAgentChange(name) {
  _currentMemoryAgent = name;
  if (!name) {
    renderMemoryContent('', '');
    return;
  }
  // 从快照获取记忆内容（由 page_cache 提供）
  if (typeof window.__onMemoryAgentChange === 'function') {
    window.__onMemoryAgentChange(name);
  }
}

export function saveMemoryMd() {
  if (!_currentMemoryAgent) { toast.warning(t('memory.selectAgent')); return; }
  const content = document.getElementById('memoryMdEditor').value;
  // 通过 WS 通知后端保存
  if (typeof window.siPerSend === 'function') {
    window.siPerSend({
      type: 'save_memory',
      agent: _currentMemoryAgent,
      content: content,
    });
  }
  // 过渡期：同时通过 HTTP 保存
  fetch('/api/agents/' + _currentMemoryAgent + '/memory', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({content})
  }).then(r => r.json()).then(d => {
    if (d.success) toast.success(t('memory.saved'));
    else toast.error(t('memory.saveFailed') + ' ' + (d.error || ''));
  }).catch(e => toast.error(t('memory.saveFailed') + ' ' + e.message));
}

export function saveMemoryConfig() {
  const body = {
    mode: document.getElementById('memMode').value,
    max_tokens: parseInt(document.getElementById('memMaxTokens').value) || 2000,
    template: document.getElementById('memTemplate').value,
  };
  // 通过 WS 通知后端
  if (typeof window.siPerSend === 'function') {
    window.siPerSend({ type: 'save_memory_config', config: body });
  }
  // 过渡期：HTTP 保存
  fetch('/api/memory/config', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  }).then(r => r.json()).then(d => {
    if (d.success) toast.success(t('memory.configSaved'));
    else toast.error(t('memory.saveFailed') + ' ' + (d.error || ''));
  }).catch(e => toast.error(t('memory.saveFailed') + ' ' + e.message));
}

export function updateMemoryPreview() {
  _updateMemoryPreview();
}

export function resetMemoryConfig() {
  document.getElementById('memMode').value = 'append';
  document.getElementById('memMaxTokens').value = 2000;
  document.getElementById('memTemplate').value = '';
  _updateMemoryPreview();
}

// ===== 内部函数 =====

function _renderMemoryContent(agentName) {
  // 从 page_cache 中获取记忆内容
  if (typeof window.__getPageCache === 'function') {
    const cache = window.__getPageCache('memory');
    if (cache && cache.md_content) {
      renderMemoryContent(agentName, cache.md_content);
      if (cache.config) renderMemoryConfig(cache.config);
    }
  }
}

function _updateMemoryPreview() {
  const mode = document.getElementById('memMode')?.value || _memoryConfig.mode;
  const maxTokens = document.getElementById('memMaxTokens')?.value || _memoryConfig.max_tokens;
  const tpl = document.getElementById('memTemplate')?.value || _memoryConfig.template;
  const preview = document.getElementById('memPreview');
  if (!preview) return;
  if (mode === 'none') { preview.textContent = t('memory.previewNone'); return; }
  const parts = [];
  if (mode === 'prepend') { parts.push('[记忆内容]'); parts.push('---'); parts.push('[系统提示词]'); }
  else if (mode === 'system') { parts.push('[记忆内容替换系统提示词]'); }
  else { parts.push('[系统提示词]'); parts.push('---'); parts.push('[记忆内容]'); }
  parts.push('---'); parts.push('[用户消息]'); parts.push(''); parts.push('(最多 ' + maxTokens + ' tokens)');
  if (tpl) { parts.push(''); parts.push('模板: ' + tpl.substring(0, 80) + (tpl.length > 80 ? '...' : '')); }
  preview.textContent = parts.join('\n');
}

// ===== 向后兼容 =====
window.renderMemoryAgentSelector = renderMemoryAgentSelector;
window.renderMemoryContent = renderMemoryContent;
window.renderMemoryConfig = renderMemoryConfig;
window.onMemoryAgentChange = onMemoryAgentChange;
window.saveMemoryMd = saveMemoryMd;
window.saveMemoryConfig = saveMemoryConfig;
window.updateMemoryPreview = updateMemoryPreview;
window.resetMemoryConfig = resetMemoryConfig;
