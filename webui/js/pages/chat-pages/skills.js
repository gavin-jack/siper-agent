// chat-pages/skills.js — 技能页面渲染
// 从 pages/chat.js 拆分

import { renderSkills } from '../skills.js';

export function renderSkillsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div id="chatSkillsList"></div>';
  refreshSkills();
}

async function refreshSkills() {
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
