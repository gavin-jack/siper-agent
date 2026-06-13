// chat/input.js — 输入框、文件上传、模型选择
import {
  chatSessionId, chatCurrentAgent, chatCurrentPage, chatPendingFiles,
  chatCurrentModel, chatModelContextWindow, chatAgents,
  setCurrentModel, setModelContextWindow, setChatCurrentModel, setChatModelContextWindow, setIsSending, setChatPendingFiles,
  updateStreamingBadge,
  getWs,
  getIsSending,
  ensureSessionReady,
  setIsThinking,
  updateSessionPreview
} from './state.js';
import { chatAppendUserMsg, chatRenderMarkdown, chatEscapeHtml, updateCtxInfoDisplay } from './message.js';
import { fmtTokens } from './state.js';
import { chatThinkingShow, chatThinkingClear, chatThinkingAddTextRow } from './stream.js';
import { toast } from '../components/toast.js';

// ===== File Upload & Preview =====

// 仅在用户处于底部时自动滚动消息区到底部
function _scrollMessagesIfAtBottom() {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  const dist = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
  if (dist < 80) msgs.scrollTop = msgs.scrollHeight;
}

// 调整输入框高度：默认3行，最大10行
function _adjustInputHeight(input) {
  input.style.height = 'auto';
  const lineHeight = 24;
  const maxLines = 10;
  const maxPx = lineHeight * maxLines;
  const minPx = lineHeight * 3;
  input.style.height = Math.max(minPx, Math.min(input.scrollHeight, maxPx)) + 'px';
  _scrollMessagesIfAtBottom();
}

export function handleChatFileSelect(event) {
  const files = event.target.files;
  if (!files || !files.length) return;
  const fileInput = event.target;
  fileInput.disabled = true;
  for (const file of files) {
    const category = getChatFileCategory(file.name);
    const reader = new FileReader();
    reader.onload = function(e) {
      chatPendingFiles.push({ data: e.target.result, mime: file.type, name: file.name, category });
      renderChatFilePreviews();
    };
    reader.readAsDataURL(file);
  }
  event.target.value = '';
  fileInput.disabled = false;
}

export function getChatFileCategory(name) {
  const ext = (name.match(/\.(\w+)$/) || ['', ''])[1].toLowerCase();
  const cats = {
    image: ['jpg','jpeg','png','gif','webp','bmp','svg','ico','tiff','tif','heic','heif','raw','cr2','nef','arw'],
    document: ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','json','xml','toml','ini','cfg','conf','log','yml','yaml','bib','tex','rst','odt','ods','odp','rtf','wps','wpd','numbers','key','pages'],
    code: ['py','js','ts','html','css','java','c','h','go','php','sh','bash','zsh','bat','ps1','sql','rb','rs','swift','kt','scala','r','m','mm','vue','jsx','tsx','coffee','lua','pl','pm','tcl','el','lisp','clj','hs','erl','ex','exs','fs','fsx','ml','mli','zig','nim','v','sv','svh','vhd','vhdl','asm','s','pas','dpr','dfm'],
    archive: ['zip','rar','7z','tar','gz','bz2','xz','zst','lz','lzma','cab','iso','img','dmg','pkg','deb','rpm','msi','apk','ipa','jar','war','ear'],
    audio: ['mp3','wav','aac','wma','m4a','flac','ogg','opus','wma','aiff','au','mid','midi','amr','ac3','dts','eac3','mka'],
    video: ['mp4','avi','mkv','mov','wmv','flv','mpg','mpeg','3gp','webm','m4v','ts','mts','m2ts','vob','ogv','divx','f4v','rm','rmvb','asf'],
  };
  for (const [cat, exts] of Object.entries(cats)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

// Extension → emoji mapping (matched from specific to generic)
const _extIconMap = {
  // Images
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️', svg: '🖼️', ico: '🖼️',
  tiff: '🖼️', tif: '🖼️', heic: '🖼️', heif: '🖼️', raw: '📷', cr2: '📷', nef: '📷', arw: '📷',
  // Documents
  pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
  txt: '📝', md: '📝', csv: '📊', json: '📋', xml: '📋', toml: '⚙️', ini: '⚙️',
  cfg: '⚙️', conf: '⚙️', log: '📃', yml: '⚙️', yaml: '⚙️', bib: '📚', tex: '📜',
  rst: '📝', odt: '📄', ods: '📊', odp: '📙', rtf: '📄', wps: '📄',
  // Code
  py: '🐍', js: '📜', ts: '📜', html: '🌐', css: '🎨', java: '☕', c: '⚡',
  h: '⚡', go: '🔵', php: '🐘', sh: '💻', bash: '💻', zsh: '💻',
  bat: '💻', ps1: '💻', sql: '🗃️', rb: '💎', rs: '🦀', swift: '🕊️',
  kt: '🟣', vue: '💚', jsx: '⚛️', tsx: '⚛️', lua: '🌙', zig: '⚡',
  nim: '👑', v: '🔷', sv: '🔬', asm: '⚙️', pas: '🏛️',
  // Archives
  zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦', bz2: '📦',
  xz: '📦', zst: '📦', lz: '📦', lzma: '📦', cab: '📦', iso: '💿',
  img: '💿', dmg: '💿', pkg: '📦', deb: '📦', rpm: '📦', msi: '📦',
  apk: '📱', ipa: '📱', jar: '☕',
  // Audio
  mp3: '🎵', wav: '🎵', aac: '🎵', wma: '🎵', m4a: '🎵', flac: '💎',
  ogg: '🎵', opus: '🎵', aiff: '🎵', mid: '🎹', midi: '🎹',
  // Video
  mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', wmv: '🎬', flv: '🎬',
  mpg: '🎬', mpeg: '🎬', '3gp': '🎬', webm: '🎬', m4v: '🎬',
  ts: '🎬', vob: '🎬', divx: '🎬',
  // Executables & installers
  exe: '⚡', msi: '⚡', app: '📱', deb: '📦', rpm: '📦',
  // Fonts
  ttf: '🔤', otf: '🔤', woff: '🔤', woff2: '🔤', eot: '🔤',
  // Database
  db: '🗃️', sqlite: '🗃️', mdb: '🗃️', accdb: '🗃️',
  // Disk / ISO
  iso: '💿', img: '💿', dmg: '💿', vmdk: '💾', vdi: '💾', vhd: '💾',
  // Design
  psd: '🎨', ai: '🎨', sketch: '🎨', fig: '🎨', xd: '🎨', blend: '🎨',
  // Email
  eml: '📧', msg: '📧', pst: '📧', ost: '📧',
  // Misc
  torrent: '🔗', url: '🔗', lnk: '🔗', desktop: '🖥️',
};
const _catFallback = { image: '🖼️', document: '📄', code: '💻', archive: '📦', audio: '🎵', video: '🎬', other: '📎' };
const _otherExtBadge = { exe: '⚡', msi: '⚡', torrent: '🔗', url: '🔗', lnk: '🔗', ttf: '🔤', otf: '🔤', db: '🗃️', sqlite: '🗃️' };
function _getFileIcon(name, category) {
  const ext = (name.match(/\.(\w+)$/) || ['', ''])[1].toLowerCase();
  return _extIconMap[ext] || _otherExtBadge[ext] || _catFallback[category] || _catFallback.other;
}

// Build a badge label for non-image files (emoji + uppercase ext)
function _getFileBadge(name, category) {
  const ext = (name.match(/\.(\w+)$/) || ['', ''])[1].toUpperCase();
  const icon = _getFileIcon(name, category);
  return icon + ' ' + ext;
}

export function renderChatFilePreviews() {
  const container = document.getElementById('chatFilePreviewContainer');
  if (!container) return;
  if (!chatPendingFiles.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = chatPendingFiles.map((f, i) => {
    const isImage = f.category === 'image';
    const badge = isImage ? '' : chatEscapeHtml(_getFileBadge(f.name, f.category));
    const fileName = isImage ? f.name : (f.name.length > 20 ? f.name.slice(0, 20) + '…' : f.name);
    return `
      <div class="siper-file-preview-item${isImage ? ' has-thumb' : ' has-badge'}">
        ${isImage ? `<img src="${f.data}" class="siper-file-preview-thumb" alt="${chatEscapeHtml(f.name)}" onclick="openImageLightbox('${f.data}','${chatEscapeHtml(f.name)}')">` : `<span class="siper-file-icon siper-file-icon-badge">${badge}</span>`}
        <span class="siper-file-name${isImage ? ' thumb-label' : ''}">${chatEscapeHtml(fileName)}</span>
        <button class="siper-remove-file" onclick="removeChatFile(${i})">✕</button>
      </div>
    `;
  }).join('');
  _scrollMessagesIfAtBottom();
}

export function removeChatFile(index) {
  chatPendingFiles.splice(index, 1);
  renderChatFilePreviews();
}

// openImageLightbox 已统一使用 toast.js 版本（window.openImageLightbox）
export async function chatUploadFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const resp = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: file.data, name: file.name, mime: file.mime }),
      });
      const data = await resp.json();
      if (data.success) results.push({ path: data.path, name: data.name, category: data.category || file.category });
    } catch(e) {}
  }
  return results;
}

// ===== Model Capability Icons =====
import { CAP_ICONS } from '../utils/capabilities.js';

function _renderCapBadges(capabilities) {
  if (!capabilities || !capabilities.length) return '';
  return '<span class="model-cap-badges">' + capabilities.map(c => '<span class="model-cap-icon" title="' + c + '">' + (CAP_ICONS[c] || c) + '</span>').join('') + '</span>';
}

// ===== Model Selection =====

export async function loadChatModels() {
  try {
    let models = [];
    let noModels = false;
    if (chatCurrentAgent && chatCurrentAgent.name) {
      const agent = chatAgents.find(a => a.name === chatCurrentAgent.name);
      if (agent && agent.available_models && agent.available_models.length > 0) {
        models = agent.available_models;
      } else if (agent) {
        noModels = true;
      }
    }
    if (!models.length && !noModels) {
      const r = await fetch('/api/models/global');
      const d = await r.json();
      models = d.models || [];
    }
    const globalDefault = models.length ? (models[0].name || '') : '';
    setCurrentModel(globalDefault);
    const cur = models.find(m => m.name === globalDefault);
    if (cur && cur.context_window) setModelContextWindow(cur.context_window);
    renderChatModelDropdown(models, noModels);
    updateCtxInfoDisplay();
    updateChatHeader();
    // 无模型时，点击按钮直接跳转而非展开下拉
    const btn = document.getElementById('chatModelBtn');
    if (btn) {
      if (noModels) {
        btn.onclick = () => { if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('agent-config'); };
      } else if (!models.length) {
        btn.onclick = () => { if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('model-settings'); };
      } else {
        btn.onclick = toggleChatModelDropdown;
      }
    }
  } catch(e) {
    console.error('chatLoadModels error:', e);
    toast.error(t ? t('chat.loadModelsFailed') : '模型加载失败');
  }
}

export function renderChatModelDropdown(models, showNoModels) {
  const menu = document.getElementById('chatModelMenu');
  const btnName = document.getElementById('chatModelBtnName');
  if (!menu) return;
  menu.innerHTML = '';
  if (showNoModels || !models.length) {
  if (btnName) btnName.textContent = '未设置可选模型';
  const item = document.createElement('div');
  item.className = 'siper-model-item siper-model-item-disabled';
  if (showNoModels) {
    // agent 未配置可用模型
    item.textContent = '未设置可选模型，点击前往配置';
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        closeChatModelDropdown();
        if (typeof chatSwitchPage === 'function') chatSwitchPage('agent-config');
      });
    } else {
      // DB 为空，无模型可添加
      item.textContent = '暂无可选模型，点击前往模型管理';
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        closeChatModelDropdown();
        if (typeof chatSwitchPage === 'function') chatSwitchPage('model-settings');
      });
    }
    menu.appendChild(item);
    return;
  }
  if (btnName) {
    const cur = models.find(m => m.name === chatCurrentModel);
    btnName.textContent = cur ? (cur.alias || cur.name) : '默认模型';
  }
  for (const m of models) {
    const item = document.createElement('div');
    item.className = 'siper-model-item';
    if (m.name === chatCurrentModel) item.classList.add('active');
    item.innerHTML = `<span class="siper-model-item-name">${chatEscapeHtml(m.alias || m.name)}</span><span class="siper-model-item-provider">${chatEscapeHtml(m.provider_name || m.provider || '')}</span>${_renderCapBadges(m.capabilities)}`;
    item.addEventListener('click', () => {
      setChatCurrentModel(m.name);
      setChatModelContextWindow(m.context_window || 8192);
      renderChatModelDropdown(models, false);
      closeChatModelDropdown();
      toast.success('模型切换为：' + (m.alias || m.name));
      updateCtxInfoDisplay();
      updateChatHeader();
    });
    menu.appendChild(item);
  }
}

export function toggleChatModelDropdown() {
  const dd = document.getElementById('chatModelDropdown');
  if (!dd) return;
  dd.classList.toggle('open');
}

export function closeChatModelDropdown() {
  const dd = document.getElementById('chatModelDropdown');
  if (dd) dd.classList.remove('open');
}

/**
 * 更新聊天标题栏：会话名称 @ Agent : 模型名 + 能力图标
 * 模型切换或会话重命名后调用
 */
export function updateChatHeader() {
  const headerName = document.getElementById('chatRightHeaderName');
  if (!headerName || chatCurrentPage !== 'chat' || !chatSessionId || !chatCurrentAgent) return;
  // 从 session list 查找当前会话标题
  const agent = chatAgents.find(a => a.name === chatCurrentAgent.name);
  let sessionTitle = chatSessionId.substring(0, 8);
  if (agent && agent.sessions) {
    const sess = agent.sessions.find(s => s.session_id === chatSessionId);
    if (sess && sess.title) sessionTitle = sess.title;
  }
  const agentDisplay = chatCurrentAgent.display_name || chatCurrentAgent.name;
  // 从 models 中查找当前模型的能力图标
  let capBadges = '';
  if (agent && agent.available_models) {
    const m = agent.available_models.find(m => m.name === chatCurrentModel);
    if (m && m.capabilities) capBadges = _renderCapBadges(m.capabilities);
  }
  // 用户输入部分转义，capBadges 是可信 HTML
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  headerName.innerHTML = '<span class="chat-header-text">' + esc(sessionTitle) + ' @ <strong>' + esc(agentDisplay) + '</strong>' + (capBadges ? ' : ' + capBadges : '') + '</span>';
}

// Session readiness — uses state.js ensureSessionReady() via import

export async function chatSendMessage() {
  const input = document.getElementById('chatInput');
  const text = (input.value || input.textContent || input.innerText || '').trim();
  if (!text && !chatPendingFiles.length) return;
  if (getIsSending()) return;
  // Show thinking panel immediately — does not depend on WS
  chatThinkingShow();
  chatThinkingClear();
  chatThinkingAddTextRow('正在思考...');
  // Wait for session to be ready before sending
  await ensureSessionReady();
  if (!chatSessionId) return; // still no session, abort
  // Wait for WS to be connected
  const ws = getWs();
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  setIsSending(true);
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  const stopBtn = document.getElementById('chatStopBtn');
  if (stopBtn) { stopBtn.classList.remove('hidden'); stopBtn.classList.add('btn-pop'); setTimeout(() => stopBtn.classList.remove('btn-pop'), 300); }
  chatAppendUserMsg(text || '[文件]');
  // 用户发消息后用前端时间更新会话预览
  if (chatSessionId && chatCurrentAgent) {
    updateSessionPreview(chatSessionId, undefined, new Date().toISOString());
  }
  // Start streaming wave badge on session immediately (before LLM responds)
  if (chatSessionId) updateStreamingBadge(chatSessionId, true);
  setIsThinking(true);
  const filesToUpload = [...chatPendingFiles];
  if (filesToUpload.length > 0) {
    // 同步构建 images 数组（从已读取的 base64 数据），不等 /api/upload 返回
    const images = [];
    let content = text;
    for (const f of filesToUpload) {
      if (f.category === 'image' && f.data) {
        images.push({ data: f.data, name: f.name, mime: f.mime || 'image/png' });
      } else if (f.category !== 'image') {
        content += '\n[File: ' + f.name + ']';
      }
    }
    // 异步上传文件到磁盘（不阻塞 WS 发送）
    chatUploadFiles(filesToUpload).catch(() => {});
    // 立即通过 WS 发送（不等上传完成）
    const payload = { type: 'message', content, session_id: chatSessionId };
    if (images.length > 0) payload.images = images;
    if (chatCurrentAgent) payload.agent = chatCurrentAgent.name;
    if (chatCurrentModel) payload.model = chatCurrentModel;
    ws.send(JSON.stringify(payload));
  } else {
    const payload = { type: 'message', content: text, session_id: chatSessionId };
    if (chatCurrentAgent) payload.agent = chatCurrentAgent.name;
    if (chatCurrentModel) payload.model = chatCurrentModel;
    ws.send(JSON.stringify(payload));
  }
  input.value = '';
  setChatPendingFiles([]);
  renderChatFilePreviews();
  _adjustInputHeight(input);
}

// ===== Input Binding =====

export function bindChatInput() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  input.addEventListener('input', function() {
    _adjustInputHeight(this);
    const baseUsed = (window.chatCtxTokens && window.chatCtxTokens.used) ? window.chatCtxTokens.used : 0;
    const total = chatModelContextWindow || 0;
    const inputTokens = this.value ? Math.max(1, Math.ceil(this.value.length / 4)) : 0;
    const estimated = baseUsed + inputTokens;
    const pct = total > 0 ? Math.min(100, Math.round((estimated / total) * 100)) : 0;
    const valEl = document.getElementById('chatCtxValue');
    const pctEl = document.getElementById('chatCtxPct');
    if (valEl) valEl.textContent = total > 0 ? fmtTokens(estimated) + '/' + fmtTokens(total) : '--/--';
    if (pctEl) {
      pctEl.textContent = total > 0 ? pct + '%' : '--%';
      pctEl.classList.remove('warn', 'danger');
      if (pct >= 90) pctEl.classList.add('danger');
      else if (pct >= 70) pctEl.classList.add('warn');
    }
  });
  // Initialize to 3-line height
  _adjustInputHeight(input);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSendMessage(); } });
  input.addEventListener('paste', function(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault(); const file = item.getAsFile(); const reader = new FileReader();
        reader.onload = function(ev) { chatPendingFiles.push({ data: ev.target.result, mime: item.type, name: 'pasted-image', category: 'image' }); renderChatFilePreviews(); };
        reader.readAsDataURL(file); break;
      }
    }
  });
  input.addEventListener('dragover', function(e) { e.preventDefault(); this.style.borderColor = '#07c160'; });
  input.addEventListener('dragleave', function(e) { this.style.borderColor = ''; });
  input.addEventListener('drop', function(e) {
    e.preventDefault(); this.style.borderColor = '';
    const files = e.dataTransfer.files;
    for (const file of files) {
      const category = getChatFileCategory(file.name);
      const reader = new FileReader();
      reader.onload = function(ev) { chatPendingFiles.push({ data: ev.target.result, mime: file.type, name: file.name, category }); renderChatFilePreviews(); };
      reader.readAsDataURL(file);
    }
  });
  window._adjustInputHeight = _adjustInputHeight;
}

// Close model dropdown on outside click
document.addEventListener('click', function(e) {
  const dd = document.getElementById('chatModelDropdown');
  if (dd && !dd.contains(e.target)) closeChatModelDropdown();
});
