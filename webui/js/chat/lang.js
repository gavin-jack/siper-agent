// chat/lang.js — 语言切换
import { selectChatLangAndSave } from '../utils/dom.js?v=1783614260116';

export function toggleChatLangDropdown() {
  const menu = document.getElementById('chatLangMenu');
  const btn = document.getElementById('chatLangBtn');
  if (!menu || !btn) return;
  if (menu.classList.contains('show')) {
    menu.classList.remove('show');
    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.zIndex = '';
    return;
  }
  // 临时显示获取尺寸
  menu.style.visibility = 'hidden';
  menu.style.display = 'block';
  const rect = btn.getBoundingClientRect();
  const menuH = menu.offsetHeight;
  menu.style.display = '';
  menu.style.visibility = '';
  menu.classList.add('show');
  menu.style.position = 'fixed';
  menu.style.top = Math.max(4, rect.top + rect.height / 2 - menuH / 2) + 'px';
  menu.style.left = (rect.right + 8) + 'px';
  menu.style.zIndex = '9999';
}

export function selectChatLang(lang) {
  if (typeof selectLang === 'function') selectLang(lang);
  const btn = document.getElementById('chatLangBtn');
  const flags = { zh: '🇨🇳', tw: '🇹🇼', en: '🇬🇧' };
  if (btn) btn.textContent = flags[lang] || '🇨🇳';
  document.querySelectorAll('.siper-lang-item').forEach(item => {
    item.classList[item.dataset.lang === lang ? 'add' : 'remove']('active');
  });
  const menu = document.getElementById('chatLangMenu');
  if (menu) {
    menu.classList.remove('show');
    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.zIndex = '';
    menu.style.display = '';
    menu.style.visibility = '';
  }
}