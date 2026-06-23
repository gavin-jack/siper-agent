// chat-pages/skills.js — 技能页面渲染
// 优先从 page_cache 读取，后端推送时自动刷新
import { t } from '../../utils/i18n.js?v=1782227011228';

let _skills = [];

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('skills', function(data) {
    if (data.skills && typeof renderSkills === 'function') {
      renderSkills(data.skills);
    }
  });
}

function renderSkills(skills) {
  _skills = skills || [];
  const list = document.getElementById('chatSkillsList') || document.getElementById('skillsList');
  if (!list) return;
  if (!_skills.length) {
    list.innerHTML = '<div class="siper-empty">' + t('skills.empty') + '</div>';
    return;
  }
  const mdSkills = _skills.filter(s => s.source === 'md');
  const pySkills = _skills.filter(s => s.source === 'py');
  const otherSkills = _skills.filter(s => s.source !== 'md' && s.source !== 'py');
  let html = '';
  if (mdSkills.length) html += mdSkills.map(s => _renderSkillCard(s)).join('');
  if (pySkills.length) html += pySkills.map(s => _renderSkillCard(s)).join('');
  if (otherSkills.length) html += otherSkills.map(s => _renderSkillCard(s)).join('');
  list.innerHTML = html;
}

function _renderSkillCard(s) {
  const caps = (s.capabilities || []).map(c => '<span class="cap-badge">' + c + '</span>').join('');
  const stats = s.stats;
  const statsHtml = stats ? `
    <div class="skill-stats">
      <span>触发: ${stats.triggered || 0}</span>
      <span>调用: ${stats.selected || 0}</span>
      <span>成功: ${stats.success || 0}</span>
      <span>成功率: ${((stats.success_rate || 0) * 100).toFixed(0)}%</span>
      <span>有效性: ${((stats.effectiveness || 0) * 100).toFixed(0)}%</span>
    </div>` : '';
  const sourceLabel = s.source === 'md' ? '📄' : s.source === 'py' ? '🐍' : '🔧';
  const enabledClass = s.enabled ? '' : 'skill-disabled';
  const activeClass = s.enabled ? 'skill-active' : '';
  return `
    <div class="card skill-card card-left-accent ${enabledClass} ${activeClass}">
      <div class="card-header">
        <span class="skill-source">${sourceLabel}</span>
        <span class="skill-name">${s.name}</span>
        <span class="skill-version">${s.version || ''}</span>
        <span class="skill-status ${s.enabled ? 'on' : 'off'}">${s.enabled ? '已启用' : '已禁用'}</span>
      </div>
      <div class="skill-desc">${s.description || ''}</div>
      <div class="skill-caps">${caps}</div>
      ${statsHtml}
    </div>`;
}

export function renderSkillsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div id="chatSkillsList"></div>';
  refreshSkills();
}

async function refreshSkills() {
  // 优先从 page_cache 读取
  const cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('skills') : null;
  if (cached && cached.skills) {
    renderSkills(cached.skills);
    return;
  }
  try {
    const r = await fetch('/api/skills');
    const d = await r.json();
    if (d.skills && typeof renderSkills === 'function') {
      renderSkills(d.skills);
    }
  } catch (e) {
    console.error('[skills] refresh failed:', e);
  }
}

window.refreshSkills = refreshSkills;
