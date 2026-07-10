// pages/theme.js — 主题设置
// 从 pages/page-theme.js 迁移

import { t } from '../utils/i18n.js?v=1783662625341';
import { showConfirm, showInput } from '../components/toast.js?v=1783662625341';
import { toast } from '../components/toast.js?v=1783662625341';
import { updateThemePaletteTrigger } from '../utils/dom.js?v=1783662625341';
import { escapeHtml } from '../utils/escape.js?v=1783662625341';

// ===== 页面模板 =====
export function _tplThemePage() {
  return `<div class="page-header">
    <h2 data-i18n="theme.title">外观设置</h2>
    <div class="actions">
      <button class="btn-sm theme-reset-btn" onclick="resetTheme()" data-i18n="theme.reset">重置默认</button>
      <button class="btn-sm" onclick="exportTheme()" data-i18n="theme.export">导出</button>
      <button class="btn-sm" onclick="importTheme()" data-i18n="theme.import">导入</button>
    </div>
  </div>
  <div class="theme-settings-content">
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.preset">预设主题</div>
      <div id="themePresetBar" class="theme-preset-bar"></div>
    </div>
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.customColors">自定义颜色</div>
      <div id="themeCustomColors" class="color-grid"></div>
    </div>
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.sizeSettings">尺寸设置</div>
      <div id="themeSizeSettings" class="size-settings"></div>
    </div>
    <div class="theme-section">
      <div class="section-label" data-i18n="theme.templates">主题模板</div>
      <div class="template-controls">
        <input type="text" id="templateName" class="select-input" placeholder="模板名称" aria-label="主题模板名称">
        <button class="btn-sm primary" onclick="saveThemeTemplate()" data-i18n="theme.saveTemplate">保存模板</button>
        <button class="btn-sm" onclick="renderTemplateList()" data-i18n="theme.refreshTemplates">刷新</button>
      </div>
      <div id="themeTemplateList" class="template-list"></div>
    </div>
  </div>`;
}
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
  default: {
    name: 'theme.presetDefault',
    label: '默认',
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
};

const THEME_SIZES = [
  { key: '--sidebar-width', label: 'theme.sidebarWidth', type: 'px', min: 160, max: 400, def: 220 },
  { key: '--border-radius', label: 'theme.borderRadius', type: 'px', min: 0, max: 24, def: 8 },
  { key: '--font-size-base', label: 'theme.fontSize', type: 'px', min: 12, max: 28, def: 18 },
  { key: '--line-height-base', label: 'theme.lineHeight', type: '', min: 1.2, max: 2.2, def: 1.6, step: 0.1 },
  { key: '--msg-max-width', label: 'theme.msgMaxWidth', type: '%', min: 50, max: 100, def: 75 },
  { key: '--chat-padding', label: 'theme.chatPadding', type: 'px', min: 8, max: 48, def: 24 },
];

export function applyThemeValue(key, value) {
  document.documentElement.style.setProperty(key, value);
}

export function loadTheme() {
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) {
      const theme = JSON.parse(saved);
      // 迁移旧 preset key → default
      if (theme._preset && theme._preset !== 'default' && !THEME_PRESETS[theme._preset]) {
        theme._preset = 'default';
      }
      Object.keys(theme).forEach(k => { if (k.startsWith('--')) applyThemeValue(k, theme[k]); });
      if (theme._preset) updateThemePaletteTrigger(theme._preset);
      return true;
    }
  } catch (e) { console.error('loadTheme error:', e); }
  return false;
}

export function saveThemeToStorage() {
  const theme = {};
  Object.keys(THEME_DEFAULTS).forEach(k => {
    theme[k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  });
  // Preserve _preset if exists, migrate old keys
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed._preset && parsed._preset !== 'default' && !THEME_PRESETS[parsed._preset]) {
        theme._preset = 'default';
      } else if (parsed._preset) {
        theme._preset = parsed._preset;
      }
    }
  } catch(e) {}
  localStorage.setItem('siper_theme', JSON.stringify(theme));
}

export function showThemeSettings() {
  renderPresetButtons();
  renderSizeSettings();
  renderTemplateList();
}

export function renderSizeSettings() {
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

export function renderTemplateList() {
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
      <span class="template-name">${escapeHtml(tmpl.name)}</span>
      <div class="template-actions">
        <button class="btn-sm" onclick="loadThemeTemplate(${i})" data-i18n="theme.loadTemplate">${t('theme.loadTemplate')}</button>
        <button class="btn-sm" onclick="exportSingleTemplate(${i})" data-i18n="theme.exportTemplate">${t('theme.exportTemplate')}</button>
        <button class="btn-sm" onclick="deleteThemeTemplate(${i})" data-i18n="theme.deleteTemplate">${t('theme.deleteTemplate')}</button>
      </div>
    `;
    container.appendChild(row);
  });
}

export function saveThemeTemplate() {
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

export function loadThemeTemplate(index) {
  let templates = [];
  try { templates = JSON.parse(localStorage.getItem('siper_theme_templates') || '[]'); } catch (e) {}
  const tmpl = templates[index];
  if (!tmpl || !tmpl.theme) return;
  Object.keys(tmpl.theme).forEach(k => applyThemeValue(k, tmpl.theme[k]));
  saveThemeToStorage();
  showThemeSettings();
  toast.success(t('theme.loaded'));
}

export function deleteThemeTemplate(index) {
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

export function exportSingleTemplate(index) {
  let templates = [];
  try { templates = JSON.parse(localStorage.getItem('siper_theme_templates') || '[]'); } catch (e) {}
  const tmpl = templates[index];
  if (!tmpl) return;
  navigator.clipboard.writeText(JSON.stringify(tmpl, null, 2)).then(() => toast.success(t('theme.exportDone')));
}

export function applyThemePreset(presetKey) {
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

export function renderPresetButtons() {
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
    btn.tabIndex = 0;
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

export function resetTheme() {
  Object.keys(THEME_DEFAULTS).forEach(k => applyThemeValue(k, THEME_DEFAULTS[k]));
  saveThemeToStorage();
  showThemeSettings();
  toast.success(t('theme.resetDone'));
}

export function exportTheme() {
  const theme = {};
  Object.keys(THEME_DEFAULTS).forEach(k => {
    theme[k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  });
  navigator.clipboard.writeText(JSON.stringify(theme, null, 2)).then(() => toast.success(t('theme.exportDone')));
}

export function importTheme() {
  showInput({
    title: '导入主题',
    placeholder: '粘贴主题 JSON...',
    multiline: true,
    onConfirm: function(input) {
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
  });
}

// Window mounts for inline handlers
window.applyThemeValue = applyThemeValue;
window.loadThemeTemplate = loadThemeTemplate;
window.deleteThemeTemplate = deleteThemeTemplate;
window.exportSingleTemplate = exportSingleTemplate;