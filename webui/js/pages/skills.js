/**
 * skills.js — 技能管理页面（起源版：纯渲染）
 */
import { t } from '../utils/i18n.js';
import { toast } from '../components/toast.js';
import { CAP_LABELS } from '../utils/capabilities.js';

let _skills = [];

/**
 * 渲染技能列表
 * @param {Array} skills — 技能列表
 */
export function renderSkills(skills) {
  _skills = skills || [];
  const list = document.getElementById('chatSkillsList') || document.getElementById('skillsList');
  if (!list) return;
  if (!_skills.length) {
    list.innerHTML = '<div class="js-empty-state-lg">' + t('skills.empty') + '</div>';
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
    <div class="skill-card card-left-accent ${enabledClass} ${activeClass}">
      <div class="skill-card-header">
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

export function previewSkillFilter() {
  const input = document.getElementById('skillPreviewInput');
  const output = document.getElementById('skillPreviewOutput');
  if (!input || !output) return;
  const msg = input.value.trim();
  if (!msg) { output.textContent = ''; return; }
  // 通过 WS 通知后端
  if (typeof window.siPerSend === 'function') {
    window.siPerSend({ type: 'preview_skill', input: msg });
  }
  // 过渡期：HTTP 请求
  fetch('/api/skills/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: msg }) })
    .then(r => r.json()).then(d => {
      const names = (d.matched || []).map(s => s.name).join(', ');
      output.textContent = names ? '匹配: ' + names : '无匹配技能';
    }).catch(() => { output.textContent = '预览失败'; });
}

window.renderSkills = renderSkills;
window.previewSkillFilter = previewSkillFilter;
