// chat/input.js — 输入框、文件上传、模型选择
import { getWs, setWs } from '../core.js?v=1782146353242';
import {
  _chatSessionId, _chatCurrentAgent, _chatCurrentPage,
  _chatCurrentModel, _chatModelContextWindow,
  setCurrentModel, setModelContextWindow, setChatCurrentModel, setChatModelContextWindow, setIsSending,
  updateStreamingBadge,
  getIsSending,
  ensureSessionReady,
  setIsThinking,
  fmtTokens,
  markSessionReady,
  setChatSessionId,
} from '../chat/state.js?v=1782146353242';

// 从 page_cache 读取 agents 列表（替代已删除的 chatAgents 变量）
function _getAgents() {
  if (typeof window.__getPageCache === 'function') {
    const agents = window.__getPageCache('agents');
    if (agents) return agents;
  }
  return [];
}
import { resetSendState } from '../chat/session.js?v=1782146353242';

// 全局待发送文件列表，存放 base64 数据、mime、名称及分类
window.chatPendingFiles = [];
const chatPendingFiles = window.chatPendingFiles;
import { chatAppendUserMsg, chatRenderMarkdown, chatEscapeHtml, updateCtxInfoDisplay } from './message.js?v=1782146353242';

// ------------------------------------------------
// Ensure a chat input element exists (creates one if missing)
// ------------------------------------------------
function _ensureChatInput() {
  // renderInputArea 已创建标准输入框，不需要兜底
  if (document.getElementById('chatInputArea')) return;
  if (document.getElementById('chatInput')) return; // already present

  // Create a textarea that matches existing UI styling
  const textarea = document.createElement('textarea');
  textarea.id = 'chatInput';
  textarea.className = 'siper-chat-input'; // use existing CSS class if defined
  textarea.placeholder = '输入消息并回车发送…';
  textarea.rows = 3;
  textarea.style.resize = 'none';
  textarea.style.overflow = 'hidden';

  // Locate the chat content area to insert the input wrapper
  const contentArea = document.getElementById('chatContentArea');
  if (!contentArea) {
    console.warn('_ensureChatInput: cannot find chatContentArea');
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.id = 'chatInputWrapper';
  wrapper.style.padding = '8px';
  wrapper.appendChild(textarea);
  contentArea.appendChild(wrapper);

  // Bind the same events that the original input handling expects
  textarea.addEventListener('input', function () { _adjustInputHeight(this); });
  textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSendMessage(); } });
  // Paste, drag‑and‑drop handlers are attached later in the file via the generic input block if the element existed at load time.
  // To ensure they work for this dynamically created element, we re‑attach them now.
  textarea.addEventListener('paste', function (e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = function (ev) { chatPendingFiles.push({ data: ev.target.result, mime: item.type, name: 'pasted-image', category: 'image' }); renderChatFilePreviews(); };
        reader.readAsDataURL(file);
        break;
      }
    }
  });
  // Simple drag‑over / drop support
  textarea.addEventListener('dragover', function (e) { e.preventDefault(); this.style.borderColor = 'var(--color-success)'; });
  textarea.addEventListener('dragleave', function (e) { this.style.borderColor = ''; });
  textarea.addEventListener('drop', function (e) {
    e.preventDefault();
    this.style.borderColor = '';
    const files = e.dataTransfer.files;
    for (const file of files) {
      const category = getChatFileCategory(file.name);
      const reader = new FileReader();
      reader.onload = function (ev) { chatPendingFiles.push({ data: ev.target.result, mime: file.type, name: file.name, category }); renderChatFilePreviews(); };
      reader.readAsDataURL(file);
    }
  });
  // expose helper for external calls
  if (typeof window !== 'undefined') window._adjustInputHeight = _adjustInputHeight;
}

import { chatThinkingShow, chatThinkingClear, chatThinkingAddTextRow, chatThinkingHide } from '../chat/thinking.js?v=1782146353242';
import { toast } from '../components/toast.js?v=1782146353242';

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
    } catch(e) { console.error('[input] upload failed:', e); }
  }
  return results;
}

// ===== Model Capability Icons =====
import { CAP_ICONS } from '../utils/capabilities.js?v=1782146353242';

function _renderCapBadges(capabilities) {
  if (!capabilities || !capabilities.length) return '';
  return '<span class="model-cap-badges">' + capabilities.map(c => '<span class="model-cap-icon" title="' + c + '">' + (CAP_ICONS[c] || c) + '</span>').join('') + '</span>';
}

// ===== Model Selection =====

export async function loadChatModels() {
  try {
    let models = [];
    let noModels = false;
    if (_chatCurrentAgent && _chatCurrentAgent.name) {
      let agents = _getAgents();
      let agent = agents.find(a => a.name === _chatCurrentAgent.name);
      // page_cache 可能缺少 available_models（被 sync_agents 覆盖），从 API 补全
      if (agent && !agent.available_models) {
        try {
          const r = await fetch('/api/agents');
          const d = await r.json();
          const fresh = d.agents?.find(a => a.name === _chatCurrentAgent.name);
          if (fresh?.available_models) {
            agent = fresh;
            // 同步更新 page_cache
            if (typeof window.__setPageCache === 'function') {
              const idx = agents.findIndex(a => a.name === agent.name);
              if (idx >= 0) agents[idx] = agent;
              window.__setPageCache('agents', agents);
            }
          }
        } catch(_) {}
      }
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
        btn.onclick = () => { if (typeof window.chatSwitchPage === 'function') window.chatSwitchPage('model-settings'); };
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
  item.className = 'siper-model-item siper-model-item-disabled js-cursor-pointer';
  if (showNoModels) {
    // agent 未配置可用模型 → 跳转到全局模型管理
    item.textContent = '未设置可选模型，点击前往模型管理';
      item.addEventListener('click', () => {
        closeChatModelDropdown();
        if (typeof chatSwitchPage === 'function') chatSwitchPage('model-settings');
      });
    } else {
      // DB 为空，无模型可添加
      item.textContent = '暂无可选模型，点击前往模型管理';
      item.addEventListener('click', () => {
        closeChatModelDropdown();
        if (typeof chatSwitchPage === 'function') chatSwitchPage('model-settings');
      });
    }
    menu.appendChild(item);
    return;
  }
  if (btnName) {
    const cur = models.find(m => m.name === _chatCurrentModel);
    btnName.textContent = cur ? (cur.alias || cur.name) : '默认模型';
  }
  for (const m of models) {
    const item = document.createElement('div');
    item.className = 'siper-model-item';
    if (m.name === _chatCurrentModel) item.classList.add('active');
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
  if (!headerName || _chatCurrentPage !== 'chat' || !_chatSessionId || !_chatCurrentAgent) return;
  // 从 session list 查找当前会话标题
  const agents = _getAgents();
  const agent = agents.find(a => a.name === _chatCurrentAgent.name);
  let sessionTitle = _chatSessionId.substring(0, 8);
  if (agent && agent.sessions) {
    const sess = agent.sessions.find(s => s.session_id === _chatSessionId);
    if (sess && sess.title) sessionTitle = sess.title;
  }
  const agentDisplay = _chatCurrentAgent.display_name || _chatCurrentAgent.name;
  // 从 models 中查找当前模型的能力图标
  let capBadges = '';
  if (agent && agent.available_models) {
    const m = agent.available_models.find(m => m.name === _chatCurrentModel);
    if (m && m.capabilities) capBadges = _renderCapBadges(m.capabilities);
  }
  // 用户输入部分转义，capBadges 是可信 HTML
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  headerName.innerHTML = '<span class="chat-header-text">' + esc(sessionTitle) + ' @ <strong>' + esc(agentDisplay) + '</strong>' + (capBadges ? ' : ' + capBadges : '') + '</span>';
}

// Session readiness — uses core.js ensureSessionReady() via import

export async function chatSendMessage() {
  const input = document.getElementById('chatInput');
  if (!input) { console.warn('chatSendMessage: chatInput element not found'); return; }
  const text = (input.value || input.textContent || input.innerText || '').trim();
  if (!text && !chatPendingFiles.length) return;
  
  // 防御性检查：_isSending 残留（WS 断连/流中断导致 finalizeStream 未调用），必须重置才能继续
  if (getIsSending()) {
    console.warn('[chatSendMessage] _isSending=true (stale), resetting state');
    resetSendState();
  }

  // 立即清空输入框 + 渲染用户气泡（不等 session/WS，给用户即时反馈）
  input.value = '';
  renderChatFilePreviews();
  _adjustInputHeight(input);
  chatAppendUserMsg(text || '[文件]');

  // Show thinking panel immediately — does not depend on WS
  chatThinkingShow();
  chatThinkingClear();
  chatThinkingAddTextRow('正在思考...');
  setIsSending(true);
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  const stopBtn = document.getElementById('chatStopBtn');
  if (stopBtn) { stopBtn.classList.remove('hidden'); stopBtn.classList.add('btn-pop'); setTimeout(() => stopBtn.classList.remove('btn-pop'), 300); }

  // Wait for session to be ready before sending
  await ensureSessionReady();
  if (!_chatSessionId) { resetSendState(); return; }

  // Start streaming wave badge on session immediately (before LLM responds)
  updateStreamingBadge(_chatSessionId, true);
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
    chatUploadFiles(filesToUpload).catch(e => { console.error('[input] background upload failed:', e); });
    // 立即通过 WS 发送（不等上传完成）
    const payload = { type: 'message', content, session_id: _chatSessionId };
    if (!_wsSend(payload)) { resetSendState(); return; }
    // also send images if any
    if (images.length) {
      if (!_wsSend({ type: 'message', content, session_id: _chatSessionId, images })) { resetSendState(); return; }
    }
  } else {
    // plain text message
    if (!_wsSend({ type: 'message', content: text, session_id: _chatSessionId })) { resetSendState(); return; }
  }

  // clear pending files after sending
  chatPendingFiles = [];
  renderChatFilePreviews();

  // Reset UI state – UI will be updated by incoming stream messages
  resetSendState();
}

// Safe WS send: always re-fetch ws reference, check state, wrap in try/catch
function _wsSend(payload) {
  try {
    const ws = getWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[input] _wsSend: WS not open, readyState=' + (ws ? ws.readyState : 'null'));
      return false;
    }
    const data = JSON.stringify(payload);
    ws.send(data);
    console.log('[input] _wsSend: sent ' + data.length + ' bytes, session_id=' + payload.session_id);
    return true;
  } catch (e) {
    console.warn('[input] _wsSend failed:', e.message);
    return false;
  }
}

// expose for debugging / manual testing
if (typeof window !== 'undefined') {
  window.chatSendMessage = chatSendMessage;
  window._ensureChatInput = _ensureChatInput;
}

// ---- input event handling ----
export function bindChatInput() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  // 防止重复绑定：如果已有标记则跳过
  if (input.dataset.jsBound === '1') return;
  input.dataset.jsBound = '1';
  input.addEventListener('input', function () {
    _adjustInputHeight(this);
    const baseUsed = (window.chatCtxTokens && window.chatCtxTokens.used) ? window.chatCtxTokens.used : 0;
    const total = _chatModelContextWindow || 0;
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
  input.addEventListener('dragover', function(e) { e.preventDefault(); this.style.borderColor = 'var(--color-success)'; });
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
// 页面加载时自动绑定
bindChatInput();

// Close model dropdown on outside click
document.addEventListener('click', function(e) {
  const dd = document.getElementById('chatModelDropdown');
  if (dd && !dd.contains(e.target)) closeChatModelDropdown();
});
