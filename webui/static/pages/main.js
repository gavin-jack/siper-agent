// ===== Init =====
loadTheme();
// Initialize theme palette trigger
try {
  const saved = localStorage.getItem('siper_theme');
  if (saved) {
    const theme = JSON.parse(saved);
    if (theme._preset) updateThemePaletteTrigger(theme._preset);
  }
} catch(e) {}
loadAvailableModels();
connectWS();
// Restore language dropdown state
const savedLang = localStorage.getItem('siper_lang') || 'zh';
const langFlags = { zh: '🇨🇳', tw: '🇹🇼', en: '🇬🇧' };
const langTrigger = document.getElementById('langDropdownTrigger');
if (langTrigger) langTrigger.textContent = langFlags[savedLang] || '🇨🇳';
document.querySelectorAll('.lang-dropdown-item').forEach(item => {
  item.classList.toggle('active', item.dataset.lang === savedLang);
});
setInterval(() => { if (currentPage === 'sessions') refreshSessions(); }, 5000);
setInterval(() => { if (currentPage === 'gateway') refreshGateway(); }, 5000);
// Track current memory agent
let currentMemoryAgent = '';

// Fetch version from backend
fetch('/api/version').then(r => r.json()).then(d => {
  const el = document.getElementById('sidebarVersion');
  if (el && d.version) el.textContent = d.version;
}).catch(() => {});

// Check model configuration on page load
// Uses /api/models/global instead of llm_configured because llm_client may be
// initialized from env vars while models.json is still empty.
fetch('/api/models/global').then(r => r.json()).then(d => {
  const models = d.models || [];
  if (models.length === 0) {
    showLlmConfigPrompt();
  }
}).catch(() => {});

// ===== LLM Configuration Prompt =====
function showLlmConfigPrompt() {
  if (typeof showConfirm === 'function') {
    showConfirm({
      title: '模型未配置',
      msg: 'SiPer 尚未配置任何模型。请添加模型配置后才能开始对话。',
      scope: '💡 提示：在"全局设置"页面中，输入 Base URL 和 API Key 后点击"获取模型列表"可自动发现可用模型',
      okText: '立即配置',
      cancelText: '稍后配置',
      onConfirm: function() {
        if (typeof navigateToPage === 'function') {
          navigateToPage('global-settings');
        }
      }
    });
  }
}
