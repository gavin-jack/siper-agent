// ===== Memory Page =====
// Populate agent selector for memory page
async function populateMemoryAgentSelector() {
  try {
    const r = await fetch('/api/agents');
    const d = await r.json();
    const agents = d.agents || [];
    const sel = document.getElementById('memoryAgentSelector');
    if (!sel) return;
    sel.innerHTML = '<option value="">' + t('memory.selectAgent') + '</option>';
    for (const a of agents) {
      const label = (a.display_name || a.name) + (a.has_memory ? '' : ' (' + t('memory.noFile') + ')');
      sel.innerHTML += '<option value="' + a.name + '">' + label + '</option>';
    }
    // Auto-select active agent
    const active = d.active || '';
    if (active) {
      sel.value = active;
      currentMemoryAgent = active;
      onMemoryAgentChange(active);
    }
  } catch(e) {}
}

// When agent selection changes
async function onMemoryAgentChange(name) {
  currentMemoryAgent = name;
  const label = document.getElementById('memoryAgentLabel');
  if (label) label.textContent = name ? '[' + name + ']' : '';
  if (!name) {
    const ta = document.getElementById('memoryMdEditor');
    if (ta) ta.value = '';
    return;
  }
  try {
    const r = await fetch('/api/agents/' + name + '/memory');
    const d = await r.json();
    const ta = document.getElementById('memoryMdEditor');
    if (ta) ta.value = d.memory || '';
  } catch(e) {
    const ta = document.getElementById('memoryMdEditor');
    if (ta) ta.value = '';
  }
}

// Refresh memory page
async function refreshMemoryPage() {
  if (!currentMemoryAgent) {
    await populateMemoryAgentSelector();
  } else {
    await onMemoryAgentChange(currentMemoryAgent);
  }
  await refreshMemoryConfig();
  toast.info(t('memory.refreshed'), 1500);
}

// Save memory.md
async function saveMemoryMd() {
  if (!currentMemoryAgent) { toast.warning(t('memory.selectAgent')); return; }
  const content = document.getElementById('memoryMdEditor').value;
  try {
    const r = await fetch('/api/agents/' + currentMemoryAgent + '/memory', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({content: content})
    });
    const d = await r.json();
    if (d.success) {
      toast.success(t('memory.saved'));
    } else {
      toast.error(t('memory.saveFailed') + ' ' + (d.error || ''));
    }
  } catch(e) {
    toast.error(t('memory.saveFailed') + ' ' + e.message);
  }
}

// Load memory config
async function refreshMemoryConfig() {
  try {
    const r = await fetch('/api/memory/config');
    const d = await r.json();
    const modeEl = document.getElementById('memMode');
    const tokensEl = document.getElementById('memMaxTokens');
    const tplEl = document.getElementById('memTemplate');
    if (modeEl) modeEl.value = d.mode || 'append';
    if (tokensEl) tokensEl.value = d.max_tokens || 2000;
    if (tplEl) tplEl.value = d.template || '';
    updateMemoryPreview();
  } catch(e) {}
}

// Save memory config
async function saveMemoryConfig() {
  const body = {
    mode: document.getElementById('memMode').value,
    max_tokens: parseInt(document.getElementById('memMaxTokens').value) || 2000,
    template: document.getElementById('memTemplate').value,
  };
  try {
    const r = await fetch('/api/memory/config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (d.success) {
      toast.success(t('memory.configSaved'));
    } else {
      toast.error(t('memory.saveFailed') + ' ' + (d.error || ''));
    }
  } catch(e) {
    toast.error(t('memory.saveFailed') + ' ' + e.message);
  }
}

// Update memory preview
function updateMemoryPreview() {
  const mode = document.getElementById('memMode').value;
  const maxTokens = document.getElementById('memMaxTokens').value;
  const tpl = document.getElementById('memTemplate').value;
  const preview = document.getElementById('memPreview');
  if (!preview) return;
  if (mode === 'none') {
    preview.textContent = t('memory.previewNone');
    return;
  }
  const parts = [];
  if (mode === 'prepend') {
    parts.push('[记忆内容]');
    parts.push('---');
    parts.push('[系统提示词]');
  } else if (mode === 'system') {
    parts.push('[记忆内容替换系统提示词]');
  } else {
    parts.push('[系统提示词]');
    parts.push('---');
    parts.push('[记忆内容]');
  }
  parts.push('---');
  parts.push('[用户消息]');
  parts.push('');
  parts.push('(最多 ' + maxTokens + ' tokens)');
  if (tpl) {
    parts.push('');
    parts.push('模板: ' + tpl.substring(0, 80) + (tpl.length > 80 ? '...' : ''));
  }
  preview.textContent = parts.join('\n');
}

// Reset memory config
function resetMemoryConfig() {
  document.getElementById('memMode').value = 'append';
  document.getElementById('memMaxTokens').value = 2000;
  document.getElementById('memTemplate').value = '';
  updateMemoryPreview();
}


// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshMemoryPage);
document.addEventListener('DOMContentLoaded', refreshMemoryConfig);
