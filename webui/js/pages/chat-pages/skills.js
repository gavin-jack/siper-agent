// chat-pages/skills.js — 技能页面渲染
import { t } from '../../utils/i18n.js?v=1783614889239';
import { apiGetCached } from '../../utils/api.js?v=1783614889239';

var _skills = [];

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('skills', function(data) {
    if (data.skills && typeof renderSkills === 'function') {
      renderSkills(data.skills);
    }
  });
}

// ── 常量映射 ──────────────────────────────────────────

var SOURCE_ICONS = { md: '📄', py: '🐍' };
var SOURCE_DEFAULT = '🔧';

// ── 模板函数 ──────────────────────────────────────────

function _tplSkillsPage() {
  return '<div class="page-header"><h3>🧩 ' + t('skills.title') + '</h3></div>' +
    '<div class="page-body"><div id="chatSkillsList"></div></div>';
}

function _renderSkillCard(s) {
  var caps = (s.capabilities || []).map(function(c) { return '<span class="cap-badge">' + c + '</span>'; }).join('');
  var stats = s.stats;
  var statsHtml = stats ? '<div class="skill-stats">' +
    '<span>' + t('skills.triggered') + ': ' + (stats.triggered || 0) + '</span>' +
    '<span>' + t('skills.selected') + ': ' + (stats.selected || 0) + '</span>' +
    '<span>' + t('skills.success') + ': ' + (stats.success || 0) + '</span>' +
    '<span>' + t('skills.successRate') + ': ' + ((stats.success_rate || 0) * 100).toFixed(0) + '%</span>' +
    '<span>' + t('skills.effectiveness') + ': ' + ((stats.effectiveness || 0) * 100).toFixed(0) + '%</span>' +
    '</div>' : '';
  var sourceLabel = SOURCE_ICONS[s.source] || SOURCE_DEFAULT;
  var enabledClass = s.enabled ? '' : 'skill-disabled';
  var activeClass = s.enabled ? 'skill-active' : '';
  return '<div class="card skill-card card-left-accent ' + enabledClass + ' ' + activeClass + '">' +
    '<div class="card-header">' +
    '<span class="skill-source">' + sourceLabel + '</span>' +
    '<span class="skill-name">' + (s.name || '') + '</span>' +
    '<span class="skill-version">' + (s.version || '') + '</span>' +
    '<span class="skill-status ' + (s.enabled ? 'on' : 'off') + '">' + (s.enabled ? t('skills.enabled') : t('skills.disabled')) + '</span>' +
    '</div>' +
    '<div class="skill-desc">' + (s.description || '') + '</div>' +
    '<div class="skill-caps">' + caps + '</div>' +
    statsHtml +
    '</div>';
}

// ── 渲染函数 ──────────────────────────────────────────

function renderSkills(skills) {
  _skills = skills || [];
  var list = document.getElementById('chatSkillsList');
  if (!list) return;
  if (!_skills.length) {
    list.innerHTML = '<div class="siper-empty">' + t('skills.empty') + '</div>';
    return;
  }
  var mdSkills = _skills.filter(function(s) { return s.source === 'md'; });
  var pySkills = _skills.filter(function(s) { return s.source === 'py'; });
  var otherSkills = _skills.filter(function(s) { return s.source !== 'md' && s.source !== 'py'; });
  var html = '';
  if (mdSkills.length) html += mdSkills.map(function(s) { return _renderSkillCard(s); }).join('');
  if (pySkills.length) html += pySkills.map(function(s) { return _renderSkillCard(s); }).join('');
  if (otherSkills.length) html += otherSkills.map(function(s) { return _renderSkillCard(s); }).join('');
  list.innerHTML = html;
}

export function renderSkillsPageChat(container) {
  container.className = 'siper-content siper-full-content page-skills';
  container.innerHTML = _tplSkillsPage();
  refreshSkills();
}

async function refreshSkills() {
  var cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('skills') : null;
  if (cached && cached.skills) { renderSkills(cached.skills); return; }
  try {
    var d = await apiGetCached('/api/skills', 'skills');
    if (d.skills && typeof renderSkills === 'function') renderSkills(d.skills);
  } catch (e) {
    console.error('[skills] refresh failed:', e);
    var list = document.getElementById('chatSkillsList');
    if (list) list.innerHTML = '<div class="siper-empty">' + t('skills.loadFailed') + '</div>';
  }
}

window.refreshSkills = refreshSkills;