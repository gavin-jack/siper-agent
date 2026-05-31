// ===== Skills Management =====

async function refreshSkills() {
  try {
    const r = await fetch('/api/skills');
    const data = await r.json();
    const list = document.getElementById('skillsList');
    const skills = data.skills || [];
    if (!skills.length) {
      list.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:40px">' + t('skills.empty') + '</div>';
      return;
    }

    // Group by source
    const mdSkills = skills.filter(s => s.source === 'md');
    const pySkills = skills.filter(s => s.source === 'py');
    const otherSkills = skills.filter(s => s.source !== 'md' && s.source !== 'py');

    let html = '';

    // New format skills (SKILL.md)
    if (mdSkills.length) {
      html += `<div class="skill-section-header">📄 SKILL.md 技能</div>`;
      html += mdSkills.map(s => renderSkillCard(s)).join('');
    }

    // Python format skills (legacy)
    if (pySkills.length) {
      html += `<div class="skill-section-header">🐍 Python 技能 (旧格式)</div>`;
      html += pySkills.map(s => renderSkillCard(s)).join('');
    }

    // Other skills
    if (otherSkills.length) {
      html += `<div class="skill-section-header">🔧 其他技能</div>`;
      html += otherSkills.map(s => renderSkillCard(s)).join('');
    }

    // Summary stats
    const total = skills.length;
    const active = skills.filter(s => s.active).length;
    html = `<div class="skill-summary">共 ${total} 个技能，${active} 个已激活</div>` + html;

    list.innerHTML = html;
    toast.info(t('skills.refreshed'), 1500);
  } catch (e) {
    document.getElementById('skillsList').innerHTML = '<div style="color:var(--red);padding:12px">' + t('skills.loadFailed') + ': ' + e.message + '</div>';
    toast.error(t('skills.loadFailed'));
  }
}

function renderSkillCard(s) {
  const caps = (s.capabilities || []).map(c => `<span class="cap-badge">${c}</span>`).join('');
  const stats = s.stats;
  const statsHtml = stats ? `
    <div class="skill-stats">
      <span>触发: ${stats.triggered || 0}</span>
      <span>选中: ${stats.selected || 0}</span>
      <span>成功率: ${((stats.success_rate || 0) * 100).toFixed(0)}%</span>
    </div>
  ` : '';
  const sourceLabel = s.source === 'md' ? '📄' : s.source === 'py' ? '🐍' : '🔧';
  const enabledClass = s.enabled ? '' : 'skill-disabled';
  const activeClass = s.active ? 'skill-active' : '';

  return `
    <div class="skill-card ${enabledClass} ${activeClass}">
      <div class="skill-card-header">
        <span class="skill-source">${sourceLabel}</span>
        <span class="skill-name">${s.name}</span>
        <span class="skill-version">${s.version || ''}</span>
        <span class="skill-status ${s.active ? 'on' : 'off'}">${s.active ? t('sessions.active') : 'Inactive'}</span>
      </div>
      <div class="skill-desc">${s.description || ''}</div>
      <div class="skill-caps">${caps}</div>
      ${statsHtml}
    </div>
  `;
}

// ===== Pre-filter Debugger =====
async function previewSkillFilter() {
  const input = document.getElementById('skillPreviewInput');
  const output = document.getElementById('skillPreviewOutput');
  const text = input.value.trim();
  if (!text) {
    output.innerHTML = '<div style="color:var(--text-dim)">输入文本后点击预览</div>';
    return;
  }
  try {
    const r = await fetch('/api/skills/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, top_k: 10 }),
    });
    const data = await r.json();
    if (data.error) {
      output.innerHTML = `<div style="color:var(--red)">${data.error}</div>`;
      return;
    }
    if (!data.matched || !data.matched.length) {
      output.innerHTML = '<div style="color:var(--text-dim)">没有匹配到相关技能</div>';
      return;
    }
    output.innerHTML = `<div class="skill-preview-count">匹配到 ${data.total} 个技能：</div>` +
      data.matched.map(m => `
        <div class="skill-preview-item">
          <strong>${m.name}</strong>: ${m.description}
          <span class="cap-badge">${(m.capabilities || []).join(', ')}</span>
        </div>
      `).join('');
  } catch (e) {
    output.innerHTML = `<div style="color:var(--red)">请求失败: ${e.message}</div>`;
  }
}

// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshSkills);
