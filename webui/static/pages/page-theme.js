// ===== Theme Settings =====
const THEME_DEFAULTS = {
  '--bg': '#c8ebe5', '--bg-sidebar': '#b8ddd6', '--bg-card': '#ddf0ec',
  '--bg-hover': '#a8d5cc', '--border': '#8bbfb5', '--text': '#0a1f1a',
  '--text-dim': '#3a6b5e', '--accent': '#2d9e8a', '--accent2': '#6b5ca8',
  '--green': '#2d9e6a', '--red': '#c0392b', '--yellow': '#b7950b',
  '--orange': '#ca6f1e', '--cyan': '#1abc9c',
  '--sidebar-width': '220px', '--border-radius': '8px',
  '--font-size-base': '18px', '--msg-max-width': '75%', '--chat-padding': '24px',
  '--line-height-base': '1.6', '--font-family-base': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
  '--agent-msg-bg': '#ddf0ec', '--agent-msg-border': '#8bbfb5', '--agent-msg-text': '#0a1f1a',
  '--user-msg-bg': '#2d9e8a', '--user-msg-text': '#ffffff',
};

const THEME_PRESETS = {
  light: {
    name: 'theme.presetLight',
    label: '青绿',
    accent: '#2d9e8a',
    colors: {
      '--bg': '#c8ebe5', '--bg-sidebar': '#b8ddd6', '--bg-card': '#ddf0ec',
      '--bg-hover': '#a8d5cc', '--border': '#8bbfb5', '--text': '#0a1f1a',
      '--text-dim': '#3a6b5e', '--accent': '#2d9e8a', '--accent2': '#6b5ca8',
      '--green': '#2d9e6a', '--red': '#c0392b', '--yellow': '#b7950b',
      '--orange': '#ca6f1e', '--cyan': '#1abc9c',
      '--agent-msg-bg': '#ddf0ec', '--agent-msg-border': '#8bbfb5', '--agent-msg-text': '#0a1f1a',
      '--user-msg-bg': '#2d9e8a', '--user-msg-text': '#ffffff',
    }
  },
  dark: {
    name: 'theme.presetDark',
    label: '深蓝',
    accent: '#58a6ff',
    colors: {
      '--bg': '#0d1117', '--bg-sidebar': '#161b22', '--bg-card': '#1c2333',
      '--bg-hover': '#242d3d', '--border': '#30363d', '--text': '#e6edf3',
      '--text-dim': '#8b949e', '--accent': '#58a6ff', '--accent2': '#a371f7',
      '--green': '#3fb950', '--red': '#f85149', '--yellow': '#d29922',
      '--orange': '#f0883e', '--cyan': '#39d2c0',
      '--agent-msg-bg': '#1c2333', '--agent-msg-border': '#30363d', '--agent-msg-text': '#e6edf3',
      '--user-msg-bg': '#1a3a5c', '--user-msg-text': '#cce0ff',
    }
  },
  forest: {
    name: 'theme.presetForest',
    label: '森林',
    accent: '#40916c',
    colors: {
      '--bg': '#1b4332', '--bg-sidebar': '#0b2618', '--bg-card': '#2d6a4f',
      '--bg-hover': '#40916c', '--border': '#52b788', '--text': '#d8f3dc',
      '--text-dim': '#95d5b2', '--accent': '#40916c', '--accent2': '#74c69d',
      '--green': '#52b788', '--red': '#e63946', '--yellow': '#ffd166',
      '--orange': '#f4a261', '--cyan': '#48cae4',
      '--agent-msg-bg': '#2d6a4f', '--agent-msg-border': '#52b788', '--agent-msg-text': '#d8f3dc',
      '--user-msg-bg': '#40916c', '--user-msg-text': '#ffffff',
    }
  },
  rose: {
    name: 'theme.presetRose',
    label: '玫瑰',
    accent: '#e85d75',
    colors: {
      '--bg': '#fff0f3', '--bg-sidebar': '#ffe3e8', '--bg-card': '#fff0f3',
      '--bg-hover': '#ffc2d1', '--border': '#ffb3c6', '--text': '#3a0ca3',
      '--text-dim': '#7209b7', '--accent': '#e85d75', '--accent2': '#f72585',
      '--green': '#4cc9f0', '--red': '#f72585', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#4cc9f0',
      '--agent-msg-bg': '#ffe3e8', '--agent-msg-border': '#ffb3c6', '--agent-msg-text': '#3a0ca3',
      '--user-msg-bg': '#e85d75', '--user-msg-text': '#ffffff',
    }
  },
  midnight: {
    name: 'theme.presetMidnight',
    label: '午夜',
    accent: '#7b2ff7',
    colors: {
      '--bg': '#0a0a1a', '--bg-sidebar': '#12122a', '--bg-card': '#1a1a3e',
      '--bg-hover': '#2a2a5e', '--border': '#3a3a7e', '--text': '#e0e0ff',
      '--text-dim': '#9090cc', '--accent': '#7b2ff7', '--accent2': '#c77dff',
      '--green': '#06d6a0', '--red': '#ef476f', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#06d6a0',
      '--agent-msg-bg': '#1a1a3e', '--agent-msg-border': '#3a3a7e', '--agent-msg-text': '#e0e0ff',
      '--user-msg-bg': '#2a1a5e', '--user-msg-text': '#e0e0ff',
    }
  },
  sakura: {
    name: 'theme.presetSakura',
    label: '樱花',
    accent: '#ff69b4',
    colors: {
      '--bg': '#fff5f8', '--bg-sidebar': '#ffe8f0', '--bg-card': '#fff0f5',
      '--bg-hover': '#ffd6e8', '--border': '#ffb3d9', '--text': '#4a1942',
      '--text-dim': '#8b4b76', '--accent': '#ff69b4', '--accent2': '#c9184a',
      '--green': '#52b788', '--red': '#c9184a', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#48cae4',
      '--agent-msg-bg': '#ffe8f0', '--agent-msg-border': '#ffb3d9', '--agent-msg-text': '#4a1942',
      '--user-msg-bg': '#ff69b4', '--user-msg-text': '#ffffff',
    }
  },
  slate: {
    name: 'theme.presetSlate',
    label: '石墨',
    accent: '#475569',
    colors: {
      '--bg': '#1e293b', '--bg-sidebar': '#0f172a', '--bg-card': '#334155',
      '--bg-hover': '#475569', '--border': '#64748b', '--text': '#e2e8f0',
      '--text-dim': '#94a3b8', '--accent': '#475569', '--accent2': '#64748b',
      '--green': '#10b981', '--red': '#ef4444', '--yellow': '#f59e0b',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#334155', '--agent-msg-border': '#64748b', '--agent-msg-text': '#e2e8f0',
      '--user-msg-bg': '#475569', '--user-msg-text': '#ffffff',
    }
  },
  black: {
    name: 'theme.presetBlack',
    label: '纯黑',
    accent: '#3b82f6',
    colors: {
      '--bg': '#000000', '--bg-sidebar': '#0a0a0a', '--bg-card': '#141414',
      '--bg-hover': '#1f1f1f', '--border': '#2a2a2a', '--text': '#e5e5e5',
      '--text-dim': '#737373', '--accent': '#3b82f6', '--accent2': '#60a5fa',
      '--green': '#22c55e', '--red': '#ef4444', '--yellow': '#eab308',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#141414', '--agent-msg-border': '#2a2a2a', '--agent-msg-text': '#e5e5e5',
      '--user-msg-bg': '#1e3a5f', '--user-msg-text': '#dbeafe',
    }
  },
};

const THEME_SIZES = [
  { key: '--sidebar-width', label: 'theme.sidebarWidth', type: 'px', min: 160, max: 400, def: 220 },
  { key: '--border-radius', label: 'theme.borderRadius', type: 'px', min: 0, max: 24, def: 8 },
  { key: '--font-size-base', label: 'theme.fontSize', type: 'px', min: 12, max: 28, def: 18 },
  { key: '--line-height-base', label: 'theme.lineHeight', type: '', min: 1.2, max: 2.2, def: 1.6, step: 0.1 },
  { key: '--msg-max-width', label: 'theme.msgMaxWidth', type: '%', min: 50, max: 100, def: 75 },
  { key: '--chat-padding', label: 'theme.chatPadding', type: 'px', min: 8, max: 48, def: 24 },
];

function applyThemeValue(key, value) {
  document.documentElement.style.setProperty(key, value);
}

function loadTheme() {
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) {
      const theme = JSON.parse(saved);
      Object.keys(theme).forEach(k => { if (k.startsWith('--')) applyThemeValue(k, theme[k]); });
      // Sync theme palette trigger
      if (theme._preset) updateThemePaletteTrigger(theme._preset);
      return true;
    }
  } catch (e) { console.error('loadTheme error:', e); }
  return false;
}

function saveThemeToStorage() {
  const theme = {};
  Object.keys(THEME_DEFAULTS).forEach(k => {
    theme[k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  });
  // Preserve _preset if exists
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed._preset) theme._preset = parsed._preset;
    }
  } catch(e) {}
  localStorage.setItem('siper_theme', JSON.stringify(theme));
}

function showThemeSettings() {
  renderPresetButtons();
  renderSizeSettings();
  renderTemplateList();
}

function renderSizeSettings() {
  const container = document.getElementById('themeSizeSettings');
  if (!container) return;
  container.innerHTML = '';
  const current = getComputedStyle(document.documentElement);
  THEME_SIZES.forEach(s => {
    const raw = current.getPropertyValue(s.key).trim();
    const val = parseFloat(raw) || s.def;
    const step = s.step || (s.type === 'px' ? 1 : 0.1);
    const unit = s.type || '';
    const row = document.createElement('div');
    row.className = 'theme-slider-row';
    row.innerHTML = `
      <label class="size-label" data-i18n="${s.label}">${t(s.label)}</label>
      <input type="range" class="size-slider" min="${s.min}" max="${s.max}" step="${step}" value="${val}" data-key="${s.key}" data-unit="${unit}" oninput="applyThemeValue('${s.key}', this.value + '${unit}');this.nextElementSibling.textContent=this.value+'${unit}'">
      <span class="theme-value-display">${val}${unit}</span>
    `;
    container.appendChild(row);
  });
}

function renderTemplateList() {
  const container = document.getElementById('themeTemplateList');
  if (!container) return;
  let templates = [];
  try { templates = JSON.parse(localStorage.getItem('siper_theme_templates') || '[]'); } catch (e) {}
  if (templates.length === 0) {
    container.innerHTML = `<div class="theme-empty-msg" data-i18n="theme.noTemplates">${t('theme.noTemplates')}</div>`;
    return;
  }
  container.innerHTML = '';
  templates.forEach((tmpl, i) => {
    const row = document.createElement('div');
    row.className = 'theme-template-item';
    row.innerHTML = `
      <span class="template-name">${tmpl.name}</span>
      <div class="template-actions">
        <button class="btn-sm" onclick="loadThemeTemplate(${i})" data-i18n="theme.loadTemplate">${t('theme.loadTemplate')}</button>
        <button class="btn-sm" onclick="exportSingleTemplate(${i})" data-i18n="theme.exportTemplate">${t('theme.exportTemplate')}</button>
        <button class="btn-sm" onclick="deleteThemeTemplate(${i})" data-i18n="theme.deleteTemplate">${t('theme.deleteTemplate')}</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function saveThemeTemplate() {
  const nameInput = document.getElementById('templateName');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) return;
  let templates = [];
  try { templates = JSON.parse(localStorage.getItem('siper_theme_templates') || '[]'); } catch (e) {}
  const theme = {};
  Object.keys(THEME_DEFAULTS).forEach(k => {
    theme[k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  });
  templates.push({ name, theme, created: Date.now() });
  localStorage.setItem('siper_theme_templates', JSON.stringify(templates));
  if (nameInput) nameInput.value = '';
  renderTemplateList();
  toast.success(t('theme.saved'));
}

function loadThemeTemplate(index) {
  let templates = [];
  try { templates = JSON.parse(localStorage.getItem('siper_theme_templates') || '[]'); } catch (e) {}
  const tmpl = templates[index];
  if (!tmpl || !tmpl.theme) return;
  Object.keys(tmpl.theme).forEach(k => applyThemeValue(k, tmpl.theme[k]));
  saveThemeToStorage();
  showThemeSettings();
  toast.success(t('theme.loaded'));
}

function deleteThemeTemplate(index) {
  let templates = [];
  try { templates = JSON.parse(localStorage.getItem('siper_theme_templates') || '[]'); } catch (e) {}
  const tmpl = templates[index];
  if (!tmpl) return;
  showConfirm({
    title: '删除模板',
    msg: '确定删除主题模板 "' + tmpl.name + '"？',
    impact: '⚠ 模板将被永久删除',
    danger: true,
    okText: '确认删除',
    onConfirm: () => {
      templates.splice(index, 1);
      localStorage.setItem('siper_theme_templates', JSON.stringify(templates));
      renderTemplateList();
      toast.success(t('theme.deleted'), 1500);
    }
  });
}

function exportSingleTemplate(index) {
  let templates = [];
  try { templates = JSON.parse(localStorage.getItem('siper_theme_templates') || '[]'); } catch (e) {}
  const tmpl = templates[index];
  if (!tmpl) return;
  navigator.clipboard.writeText(JSON.stringify(tmpl, null, 2)).then(() => toast.success(t('theme.exportDone')));
}

function applyThemePreset(presetKey) {
  const preset = THEME_PRESETS[presetKey];
  if (!preset) return;
  Object.keys(preset.colors).forEach(k => applyThemeValue(k, preset.colors[k]));
  // Save with _preset
  const saved = {};
  Object.keys(preset.colors).forEach(k => saved[k] = preset.colors[k]);
  saved._preset = presetKey;
  localStorage.setItem('siper_theme', JSON.stringify(saved));
  showThemeSettings();
  toast.success(t('theme.presetApplied'));
}

function renderPresetButtons() {
  const container = document.getElementById('themePresetBar');
  if (!container) return;
  container.innerHTML = '';
  const label = document.createElement('span');
  label.setAttribute('data-i18n', 'theme.presets');
  label.className = 'text-dim-mr13';
  label.textContent = t('theme.presets');
  container.appendChild(label);
  // Determine current preset
  let currentPreset = '';
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) { currentPreset = JSON.parse(saved)._preset || ''; }
  } catch(e) {}
  Object.keys(THEME_PRESETS).forEach(key => {
    const preset = THEME_PRESETS[key];
    const btn = document.createElement('button');
    btn.className = 'theme-preset-btn btn-sm' + (key === currentPreset ? ' active' : '');
    btn.setAttribute('data-i18n', preset.name);
    btn.dataset.preset = key;
    btn.title = t(preset.name);
    // Color swatch preview
    const swatch = document.createElement('span');
    swatch.className = 'theme-preset-swatch';
    swatch.style.background = `linear-gradient(135deg, ${preset.colors['--bg']} 33%, ${preset.colors['--accent']} 33% 66%, ${preset.colors['--bg-sidebar']} 66%)`;
    btn.appendChild(swatch);
    const labelSpan = document.createElement('span');
    labelSpan.textContent = t(preset.name);
    btn.appendChild(labelSpan);
    btn.onclick = () => applyThemePreset(key);
    container.appendChild(btn);
  });
}

function resetTheme() {
  Object.keys(THEME_DEFAULTS).forEach(k => applyThemeValue(k, THEME_DEFAULTS[k]));
  saveThemeToStorage();
  showThemeSettings();
  toast.success(t('theme.resetDone'));
}

function exportTheme() {
  const theme = {};
  Object.keys(THEME_DEFAULTS).forEach(k => {
    theme[k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  });
  navigator.clipboard.writeText(JSON.stringify(theme, null, 2)).then(() => toast.success(t('theme.exportDone')));
}

function importTheme() {
  const input = prompt('Paste theme JSON:');
  if (!input) return;
  try {
    const theme = JSON.parse(input.trim());
    if (!theme || typeof theme !== 'object') throw new Error('Invalid');
    Object.keys(theme).forEach(k => {
      if (k.startsWith('--')) applyThemeValue(k, theme[k]);
    });
    saveThemeToStorage();
    showThemeSettings();
    toast.success(t('theme.importDone'));
  } catch (e) {
    toast.error(t('theme.importInvalid'));
  }
}
