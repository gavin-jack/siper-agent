// chat-pages/skills.js — 技能页面渲染
// 从 pages/chat.js 拆分

export function renderSkillsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = '<div id="chatSkillsList"></div>';
  if (typeof window.refreshSkills === 'function') window.refreshSkills();
}
