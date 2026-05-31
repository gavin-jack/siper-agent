// ===== Chat =====

// Avatar URL cache (defined in core.js as agentAvatarUrl)

// ===== Model Selection =====
let currentModel = ''; // empty = default model
let availableModels = []; // list of {name, alias, provider, capabilities, ...}
let allGlobalModels = []; // full list from /api/models/global
let agentAvailableModels = []; // list of model names from agent config
let isSending = false; // true while waiting for agent response

async function loadAvailableModels() {
  try {
    // Load global models list
    const r = await fetch('/api/models/global');
    const d = await r.json();
    allGlobalModels = d.models || [];
    const globalDefault = d.default_model || '';
    // Load agent config to get available_models filter + agent default model
    let agentAvail = [];
    let agentDefaultChat = '';
    try {
      const ar = await fetch('/api/config');
      const ad = await ar.json();
      agentAvail = ad.available_models || [];
      agentDefaultChat = ad.default_chat_model || '';
    } catch(e) {}
    agentAvailableModels = agentAvail;
    // Priority: agent default_chat_model > global default_model
    currentModel = agentDefaultChat || globalDefault;
    // Filter: if agent has available_models set, only show those; otherwise show all
    if (agentAvail.length > 0) {
      availableModels = allGlobalModels.filter(m => agentAvail.includes(m.name));
    } else {
      availableModels = allGlobalModels;
    }
    // Populate chat model dropdown
    renderModelDropdown();
  } catch (e) {
    console.error('loadAvailableModels error:', e);
  }
}

const capBadgeLabels = { vision: '👁', reasoning: '🧠', code: '💻', chat: '💬', tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧' };

function renderModelDropdown() {
  const menu = document.getElementById('chatModelMenu');
  const btnName = document.getElementById('chatModelBtnName');
  if (!menu) return;
  menu.innerHTML = '';
  if (availableModels.length === 0) {
    if (btnName) btnName.textContent = '默认模型';
    return;
  }
  // Update button text to current model name
  if (btnName) {
    const cur = availableModels.find(m => m.name === currentModel);
    btnName.textContent = cur ? (cur.alias || cur.name) : '默认模型';
  }
  for (const m of availableModels) {
    const item = document.createElement('div');
    item.className = 'chat-model-item' + (m.name === currentModel ? ' selected' : '');
    // Model name
    const nameEl = document.createElement('span');
    nameEl.className = 'chat-model-item-name';
    nameEl.textContent = m.alias || m.name;
    nameEl.title = m.name;
    item.appendChild(nameEl);
    // Capability badges
    const capsEl = document.createElement('span');
    capsEl.className = 'chat-model-item-caps';
    for (const c of (m.capabilities || [])) {
      if (capBadgeLabels[c]) {
        const badge = document.createElement('span');
        badge.className = 'chat-model-cap-badge ' + c;
        badge.textContent = capBadgeLabels[c];
        badge.title = c;
        capsEl.appendChild(badge);
      }
    }
    item.appendChild(capsEl);
    // Provider
    if (m.provider) {
      const provEl = document.createElement('span');
      provEl.className = 'chat-model-item-provider';
      provEl.textContent = m.provider;
      item.appendChild(provEl);
    }
    item.addEventListener('click', () => {
      currentModel = m.name;
      closeModelDropdown();
      renderModelDropdown();
      toast.success('模型切换为：' + (m.alias || m.name));
    });
    menu.appendChild(item);
  }
}

function toggleModelDropdown() {
  const dd = document.getElementById('chatModelDropdown');
  if (!dd) return;
  dd.classList.toggle('open');
}

function closeModelDropdown() {
  const dd = document.getElementById('chatModelDropdown');
  if (dd) dd.classList.remove('open');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const dd = document.getElementById('chatModelDropdown');
  if (dd && !dd.contains(e.target)) closeModelDropdown();
});

function updateCurrentModel(modelName) {
  currentModel = modelName || '';
  renderModelDropdown();
}

function getAvatarHtml(cls) {
  if (cls === 'agent') {
    return `<img class="msg-avatar-img" src="${agentAvatarUrl}" alt="Agent" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div class="msg-avatar msg-avatar-fallback msg-avatar-hidden">🤖</div>`;
  } else if (cls === 'user') {
    return `<div class="msg-avatar">👤</div>`;
  }
  return '';
}

// Strip LLM call-trace block appended by SOUL.md (duplicated by appendMeta)
function stripTrace(text) {
  if (!text) return text;
  // Remove trailing separator line (---) and everything after it
  const sepIdx = text.lastIndexOf('\n---\n');
  if (sepIdx !== -1) {
    const after = text.slice(sepIdx + 5);
    // Only strip if the content after separator looks like a trace block
    // Use Unicode escapes to avoid surrogate pair matching issues:
    // ⬆️=U+2B06, ⬇️=U+2B07, 🔧=U+1F527, 🧩=U+1F9E9, ⏱️=U+23F1
    if (/(?:\u2B06|\u2B07|\u{1F527}|\u{1F9E9}|\u{23F1})/.test(after)) {
      return text.slice(0, sepIdx).trimEnd();
    }
  }
  return text;
}

// ===== Prompt Modal =====
function showPromptModal(userText, btn) {
  // Remove existing modal if any
  const existing = document.getElementById('promptModal');
  if (existing) existing.remove();

  // Find the user message row and read prompt_context
  const row = btn ? btn.closest('.msg-row') : null;
  const promptContext = row ? row.getAttribute('data-prompt-context') : '';

  let fullHtml = '';
  if (promptContext) {
    try {
      const msgs = JSON.parse(promptContext);
      let sections = '';
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          const role = m.role || '';
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2);
          const roleLabel = role === 'system' ? '🔧 System' : role === 'user' ? '👤 User' : role === 'assistant' ? '🤖 Assistant' : role;
          sections += `<div class=\"prompt-modal-section\">\n            <div class=\"prompt-modal-role\">${escapeHtml(roleLabel)}</div>\n            <pre class=\"prompt-modal-pre\">${escapeHtml(content)}</pre>\n          </div>`;
        }
      } else {
        sections = `<pre class=\"prompt-modal-pre\">${escapeHtml(String(promptContext))}</pre>`;
      }
      fullHtml = `<div class=\"prompt-modal-sections\">${sections}</div>`;
    } catch(e) {
      fullHtml = `<pre class=\"prompt-modal-pre\">${escapeHtml(promptContext)}</pre>`;
    }
  } else {
    // No context yet (e.g. before first AI reply), show user text only
    fullHtml = `<div class=\"prompt-modal-section\">\n      <div class=\"prompt-modal-role\">👤 User</div>\n      <pre class=\"prompt-modal-pre\">${escapeHtml(userText)}</pre>\n    </div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'promptModal';
  overlay.className = 'prompt-modal-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal" onclick="event.stopPropagation()">
      <div class="prompt-modal-header">
        <span class="prompt-modal-title">📝 发送给 LLM 的完整提示词</span>
        <button class="prompt-modal-close" onclick="document.getElementById('promptModal').remove()">✕</button>
      </div>
      <div class="prompt-modal-body">
        ${fullHtml}
      </div>
      <div class="prompt-modal-footer">
        <button class="prompt-modal-copy" id="promptModalCopyBtn">📋 复制</button>
        <button class="prompt-modal-close-btn" onclick="document.getElementById('promptModal').remove()">关闭</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);

  // Copy button: copy all visible text
  const copyBtn = document.getElementById('promptModalCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const body = overlay.querySelector('.prompt-modal-body');
      const text = body ? body.innerText : '';
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✓';
        toast.success(t('chat.copied'), 1500);
        setTimeout(() => copyBtn.textContent = '📋 复制', 1500);
      }).catch(() => {
        toast.error(t('chat.copyFailed'));
      });
    });
  }
}

function addMsg(text, cls, meta) {
  try {
  if (cls === 'agent') text = stripTrace(text);
  const row = document.createElement('div');
  const isAgent = cls === 'agent';
  row.className = 'msg-row ' + (isAgent ? 'agent' : (cls === 'user' ? 'user' : ''));

  function buildActions(below) {
    const actions = document.createElement('div');
    actions.className = below ? 'msg-actions-below' : 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.title = '复制内容';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = '✓';
        toast.success(t('chat.copied'), 1500);
        setTimeout(() => copyBtn.innerHTML = '📋', 1500);
      }).catch(() => {
        toast.error(t('chat.copyFailed'));
      });
    });
    actions.appendChild(copyBtn);
    const insertBtn = document.createElement('button');
    insertBtn.className = 'msg-action-btn';
    insertBtn.innerHTML = '↩';
    insertBtn.title = '填入输入框';
    insertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.getElementById('chatInput');
      if (input) {
        input.value = text;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 262) + 'px';
        input.focus();
      }
    });
    actions.appendChild(insertBtn);
    if (cls === 'user' && text) {
      const promptBtn = document.createElement('button');
      promptBtn.className = 'msg-action-btn';
      promptBtn.innerHTML = '📝';
      promptBtn.title = '查看提示词';
      promptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPromptModal(text, e.currentTarget);
      });
      actions.appendChild(promptBtn);
    }
    // Dict button — show full response dict (agent messages with meta)
    if (isAgent && meta && (meta._raw || meta.tool_call_steps || meta.usage)) {
      const dictData = meta._raw || meta;
      const dictBtn = document.createElement('button');
      dictBtn.className = 'msg-action-btn';
      dictBtn.innerHTML = '{}';
      dictBtn.title = '查看完整响应数据';
      dictBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDictModal(dictData);
      });
      actions.appendChild(dictBtn);
    }
    return actions;
  }

  // Build attachment HTML from meta.attachments
  function buildAttachmentsHtml(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return '';
    let html = '<div class="msg-attachments">';
    for (const att of attachments) {
      if (att.category === 'image' || att.type === 'image') {
        const src = att.url || att.data || '';
        const alt = escapeHtml(att.name || att.filename || 'image');
        html += `<img src="${src}" class="chat-image" alt="${alt}" onclick="window.open(this.src)">`;
      } else {
        const icon = FILE_ICONS[att.category] || FILE_ICONS.other;
        const name = escapeHtml(att.name || att.filename || att.url || 'file');
        html += `<div class="chat-file-ref">${icon} ${name}</div>`;
      }
    }
    html += '</div>';
    return html;
  }

  if (isAgent) {
    row.classList.add('msg-row-horizontal');
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'msg-avatar-wrap';
    avatarWrap.innerHTML = getAvatarHtml('agent');
    const bubble = document.createElement('div');
    bubble.className = 'msg agent-bubble';
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.appendChild(renderMarkdown(text));
    bubble.appendChild(body);
    // Render attachments below body text
    if (meta && meta.attachments) {
      const attHtml = buildAttachmentsHtml(meta.attachments);
      if (attHtml) {
        const attWrap = document.createElement('div');
        attWrap.innerHTML = attHtml;
        bubble.appendChild(attWrap);
      }
    }
    if (meta) appendMeta(bubble, meta);
    // Render TTS audio bar directly in bubble (non-streaming path)
    if (isAgent && meta && meta.tool_call_steps) {
      for (const step of meta.tool_call_steps) {
        if (step.tool_name === 'text_to_speech' && step.success) {
          let audioUrl = '';
          try {
            const m = step.result.match(/['"]audio_path['"]\s*:\s*['"]([^'"]+)['"]/);
            if (m) audioUrl = m[1];
          } catch(e) {}
          if (audioUrl.startsWith('/home/gavin/.siper/uploads/')) {
            audioUrl = audioUrl.replace('/home/gavin/.siper/uploads/', '/uploads/');
          }
          if (audioUrl) {
            const audioEl = document.createElement('div');
            audioEl.className = 'tts-audio-bar';
            audioEl.innerHTML = `
              <button class="tts-play-btn" onclick="toggleTtsAudio(this, '${audioUrl.replace(/'/g, "\\'")}')">
                <span class="tts-play-icon">▶</span>
              </button>
              <div class="tts-waveform">
                <div class="tts-wave-bar"></div>
                <div class="tts-wave-bar"></div>
                <div class="tts-wave-bar"></div>
                <div class="tts-wave-bar"></div>
                <div class="tts-wave-bar"></div>
                <div class="tts-wave-bar"></div>
                <div class="tts-wave-bar"></div>
                <div class="tts-wave-bar"></div>
              </div>
              <span class="tts-label">🔊 语音消息</span>
              <audio class="tts-audio" src="${audioUrl}" preload="none"></audio>
            `;
            bubble.appendChild(audioEl);
          }
        }
      }
    }
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    row.appendChild(timeEl);
    row.appendChild(avatarWrap);
    row.appendChild(bubble);
    const actions = buildActions(true);
    row.appendChild(actions);
  } else if (cls === 'user') {
    row.classList.add('msg-row-horizontal', 'msg-row-user-horizontal');
    const bubble = document.createElement('div');
    bubble.className = 'msg user';
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = text;
    bubble.appendChild(body);
    // Render attachments below body text
    if (meta && meta.attachments) {
      const attHtml = buildAttachmentsHtml(meta.attachments);
      if (attHtml) {
        const attWrap = document.createElement('div');
        attWrap.innerHTML = attHtml;
        bubble.appendChild(attWrap);
      }
    }
    if (meta) appendMeta(bubble, meta);
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    row.appendChild(timeEl);
    row.appendChild(bubble);
    const actions = buildActions(true);
    row.appendChild(actions);
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + cls;
    bubble.textContent = text;
    if (meta) appendMeta(bubble, meta);
    row.appendChild(bubble);
  }

  const msgs = document.getElementById('chatMessages');
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
  // Post-render enhancements (code highlight, mermaid, katex)
  if (isAgent) {
    const bodyEl = row.querySelector('.msg-body');
    if (bodyEl) { try { postRenderEnhance(bodyEl); } catch(e) {} }
  }
    return row;
  } catch(e) {
    console.error('addMsg error:', e);
    return null;
  }
}

function appendMeta(container, meta) {
  const bubble = container.closest('.msg');
  if (bubble && bubble.classList.contains('error')) return;
  const cfg = getMetaConfig();
  const m = document.createElement('div');
  m.className = 'msg-meta';
  const items = [];
  if (cfg.showTokens && meta.usage) {
    const u = meta.usage;
    const inTok = u.prompt_tokens || 0;
    const outTok = u.completion_tokens || 0;
    const cachedTok = u.cached_tokens || u.prompt_tokens_details?.cached_tokens || 0;
    const unit = n => n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
    let tokenStr = `⬆️ ${unit(inTok)} · ⬇️ ${unit(outTok)}`;
    if (cfg.showCached && cachedTok > 0) tokenStr += ` · 💾 ${unit(cachedTok)}`;
    const hasTime = cfg.showTime && meta.processing_time_ms;
    items.push({ key: 'tokens', text: tokenStr, newline: false });
    // Insert time right after tokens, on the same line
    if (hasTime) {
      const ms = meta.processing_time_ms;
      const timeStr = ms >= 60000 ? `${(ms/60000).toFixed(1)}m` : ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
      items.push({ key: 'time', text: `⏱️ ${timeStr}`, newline: true });
    }
  } else if (cfg.showTime && meta.processing_time_ms) {
    // No tokens shown, time stands alone
    const ms = meta.processing_time_ms;
    const timeStr = ms >= 60000 ? `${(ms/60000).toFixed(1)}m` : ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
    items.push({ key: 'time', text: `⏱️ ${timeStr}`, newline: !!cfg.brTime });
  }
  if (cfg.showTools) {
    const steps = meta.tool_call_steps || [];
    // Build tool name frequency map
    const nameCount = {};
    for (const s of steps) {
      const n = s.tool_name || 'unknown';
      nameCount[n] = (nameCount[n] || 0) + 1;
    }
    const parts = Object.entries(nameCount).map(([name, cnt]) => `${name} (${cnt})`);
    const toolsText = parts.length > 0
      ? `🔧 工具 ：${parts.join(' │ ')}`
      : `🔧 工具 ：none`;
    items.push({ key: 'tools', text: toolsText, newline: !!cfg.brTools, clickable: parts.length > 0 });
  }
  if (cfg.showSkills) {
    // Show skills actually used by LLM (via skill_view), not just recommended
    const usedSkills = (meta.skills_used && meta.skills_used.length > 0);
    const skillsList = usedSkills
      ? meta.skills_used.join('，')
      : (meta.skills_recommended && meta.skills_recommended.length > 0)
        ? meta.skills_recommended.join('，')
        : 'none';
    const skillsLabel = usedSkills ? '🧩 skills：' : '🧩 skills（推荐）：';
    items.push({ key: 'skills', text: `${skillsLabel}${skillsList}`, newline: !!cfg.brSkills });
  }
  if (items.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'msg-meta-sep';
    m.appendChild(sep);
    const text = document.createElement('span');
    text.className = 'msg-meta-text';
    for (let i = 0; i < items.length; i++) {
      const span = document.createElement('span');
      span.textContent = items[i].text;
      if (items[i].clickable) {
        span.className = 'meta-tools-link';
        span.style.cursor = 'pointer';
      }
      text.appendChild(span);
      if (i < items.length - 1) {
        if (items[i].newline) {
          text.appendChild(document.createElement('br'));
        } else {
          const sep = document.createElement('span');
          sep.className = 'msg-meta-sep-inline';
          sep.textContent = ' │ ';
          text.appendChild(sep);
        }
      }
    }
    m.appendChild(text);
  }
  if (items.length > 0) container.appendChild(m);

  // Tool calls panel — hidden by default, toggled via meta tools link
  const steps = meta.tool_call_steps;
  if (cfg.showToolSteps && steps && steps.length > 0) {
    // Chain of Thought tree
    const cotHtml = renderCotTree(steps);
    if (cotHtml) {
      const cotWrap = document.createElement('div');
      cotWrap.innerHTML = cotHtml;
      cotWrap.style.display = 'none';
      cotWrap.className = 'cot-tree-wrap';
      container.appendChild(cotWrap);
    }
    const wrap = renderToolCalls(steps);
    wrap.style.display = 'none';
    container.appendChild(wrap);
    // Bind toggle on the tools link in meta
    const toolsLink = m.querySelector('.meta-tools-link');
    if (toolsLink) {
      toolsLink.addEventListener('click', () => {
        const isOpen = wrap.style.display !== 'none';
        if (isOpen) {
          wrap.style.display = 'none';
        } else {
          wrap.style.display = '';
          // Also toggle CoT tree wrap if present
          if (cotWrap) cotWrap.style.display = '';
        }
      });
    }
  }

  // Debug: show full response dict with syntax highlighting
  if (cfg.showDebug && meta._raw) {
    const dbg = document.createElement('div');
    dbg.className = 'msg-debug-block';
    const hdr = document.createElement('div');
    hdr.className = 'msg-debug-header';
    const title = document.createElement('span');
    title.className = 'msg-debug-title';
    title.textContent = '🔍 Response';
    hdr.appendChild(title);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-debug-copy';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制 JSON';
    let rawJson = '';
    try { rawJson = JSON.stringify(meta._raw, null, 2); } catch(e) { rawJson = String(meta._raw); }
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(rawJson).then(() => {
        copyBtn.textContent = '✓';
        toast.success(t('chat.copied'), 1500);
        setTimeout(() => copyBtn.textContent = '📋', 1500);
      }).catch(() => {
        toast.error(t('chat.copyFailed'));
      });
    });
    hdr.appendChild(copyBtn);
    dbg.appendChild(hdr);
    const pre = document.createElement('pre');
    pre.className = 'msg-debug-pre';
    pre.innerHTML = debugHighlight(rawJson);
    dbg.appendChild(pre);
    container.appendChild(dbg);
  }
}

function getMetaConfig() {
  try {
    const raw = localStorage.getItem('siper_meta_config');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    showTokens: true, showCached: true, showTools: true, showSkills: true, showTime: true, showToolSteps: true, showDebug: false,
    brTokens: false, brCached: false, brTools: false, brSkills: false, brTime: false,
  };
}


let pendingFiles = []; // Array of { data: base64, mime: string, name: string, category: string }

// File category icons
const FILE_ICONS = {
  image: '🖼️',
  document: '📄',
  code: '💻',
  archive: '📦',
  audio: '🎵',
  video: '🎬',
  other: '📎',
};

function getFileCategory(name) {
  const ext = (name.match(/\.(\w+)$/) || ['', ''])[1].toLowerCase();
  const cats = {
    image: ['jpg','jpeg','png','gif','webp','bmp'],
    document: ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','json','xml','toml','ini','cfg','conf'],
    code: ['py','js','ts','html','css','java','c','h','go','php','sh','bash','zsh','bat','ps1','sql'],
    archive: ['zip','rar','7z','tar'],
    audio: ['mp3','wav','aac','wma','m4a'],
    video: ['mp4','avi','mkv','mov','wmv','flv','mpg','mpeg','3gp'],
  };
  for (const [cat, exts] of Object.entries(cats)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || !files.length) return;
  for (const file of files) {
    const category = getFileCategory(file.name);
    const reader = new FileReader();
    reader.onload = function(e) {
      pendingFiles.push({ data: e.target.result, mime: file.type, name: file.name, category });
      renderFilePreviews();
    };
    reader.readAsDataURL(file);
  }
  event.target.value = '';
}

function renderFilePreviews() {
  const container = document.getElementById('filePreviewContainer');
  if (!pendingFiles.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = pendingFiles.map((f, i) => {
    const isImage = f.category === 'image';
    const displayName = f.name.length > 12 ? f.name.slice(0, 12) + '…' : f.name;
    return `
      <div class="file-preview-item${isImage ? ' has-thumb' : ''}">
        ${isImage ? `<img src="${f.data}" class="file-preview-thumb" alt="${escapeHtml(f.name)}" onclick="openImageLightbox('${f.data}','${escapeHtml(f.name)}')">` : `<span class="file-icon">${FILE_ICONS[f.category] || FILE_ICONS.other}</span>`}
        <span class="file-name${isImage ? ' thumb-label' : ''}">${escapeHtml(isImage ? f.name : displayName)}</span>
        <button class="remove-file" onclick="removeFile(${i})">✕</button>
      </div>
    `;
  }).join('');
}

function removeFile(index) {
  pendingFiles.splice(index, 1);
  renderFilePreviews();
}

function openImageLightbox(src, name) {
  document.getElementById('imageLightboxImg').src = src;
  document.getElementById('imageLightboxCaption').textContent = name;
  document.getElementById('imageLightbox').style.display = 'flex';
}

function closeImageLightbox() {
  document.getElementById('imageLightbox').style.display = 'none';
}

// Paste file from clipboard
document.getElementById('chatInput').addEventListener('paste', function(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = function(ev) {
        pendingFiles.push({ data: ev.target.result, mime: item.type, name: 'pasted-image', category: 'image' });
        renderFilePreviews();
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

// Drop file on chat area
const chatInput = document.getElementById('chatInput');
chatInput.addEventListener('dragover', function(e) { e.preventDefault(); this.style.borderColor = "var(--accent)"; });
chatInput.addEventListener('dragleave', function(e) { this.style.borderColor = ''; });
chatInput.addEventListener('drop', function(e) {
  e.preventDefault();
  this.style.borderColor = '';
  const files = e.dataTransfer.files;
  for (const file of files) {
    const category = getFileCategory(file.name);
    const reader = new FileReader();
    reader.onload = function(ev) {
      pendingFiles.push({ data: ev.target.result, mime: file.type, name: file.name, category });
      renderFilePreviews();
    };
    reader.readAsDataURL(file);
  }
});

// ===== Vision Capability Warning Modal =====
// Shows when user tries to send images but current model doesn't support vision.
// visionModels: array of {name, alias, provider, capabilities} that support 'vision'.
function showVisionWarningModal(visionModels) {
  const existing = document.getElementById('visionWarningOverlay');
  if (existing) existing.remove();

  const C = {
    text:    cv('--text')    || '#e6edf3',
    textDim: cv('--text-dim') || '#8b949e',
    accent:  cv('--accent')  || '#58a6ff',
    red:     cv('--red')     || '#f85149',
    yellow:  cv('--yellow')  || '#d29922',
    bgCard:  cv('--bg-card') || '#1c2333',
    border:  cv('--border')  || '#30363d',
    bg:      cv('--bg')      || '#0d1117',
    bgHover: cv('--bg-hover') || '#242d3d',
  };

  const currentModelName = currentModel || '';

  const overlay = document.createElement('div');
  overlay.id = 'visionWarningOverlay';
  overlay.className = 'dict-modal-overlay modal-overlay-base open';

  const box = document.createElement('div');
  box.className = 'dict-modal-dialog modal-dialog-base';
  box.style.width = '520px';
  box.style.maxWidth = '92vw';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid ' + C.border + ';flex-shrink:0;';
  hdr.innerHTML = '<span class="vision-warning-title">⚠️ ' + t('visionWarn.title') + '</span>' +
    '<button onclick="document.getElementById(\'visionWarningOverlay\').remove()" class="vision-warning-close">✕</button>';
  box.appendChild(hdr);

  // Body
  const body = document.createElement('div');
  body.style.cssText = 'padding:16px 20px;overflow-y:auto;';

  // Warning message
  const warnMsg = document.createElement('div');
  warnMsg.style.cssText = 'color:' + C.text + ';font-size:14px;line-height:1.6;margin-bottom:12px;';
  warnMsg.textContent = t('chat.visionWarnBody').replace('{model}', currentModelName);
  body.appendChild(warnMsg);

  if (visionModels.length > 0) {
    // List vision-capable models
    const listTitle = document.createElement('div');
    listTitle.style.cssText = 'color:' + C.textDim + ';font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;';
    listTitle.textContent = t('chat.visionWarnSwitch');
    body.appendChild(listTitle);

    for (const m of visionModels) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;border:1px solid ' + C.border + ';background:' + C.bgCard + ';';
      row.onmouseenter = function() { this.style.background = C.bgHover; this.style.borderColor = C.accent; };
      row.onmouseleave = function() { this.style.background = C.bgCard; this.style.borderColor = C.border; };

      const icon = document.createElement('span');
      icon.textContent = '👁';
      icon.style.fontSize = '16px';
      row.appendChild(icon);

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'flex:1;color:' + C.text + ';font-size:14px;font-weight:500;';
      nameSpan.textContent = m.name + (m.alias ? ' (' + m.alias + ')' : '') + (m.provider ? ' [' + m.provider + ']' : '');
      row.appendChild(nameSpan);

      const switchBtn = document.createElement('span');
      switchBtn.style.cssText = 'color:' + C.accent + ';font-size:12px;font-weight:600;';
      switchBtn.textContent = t('chat.visionWarnSwitchBtn');
      row.appendChild(switchBtn);

      row.onclick = function() {
        // Switch to this model
        currentModel = m.name;
        renderModelDropdown();
        toast.success('模型切换为：' + (m.alias || m.name));
        // Close modal and resend
        overlay.remove();
        // Pre-populate pendingFiles so user can just click send again
        // (files are still in pendingFiles since we returned early)
        sendMessage();
      };

      body.appendChild(row);
    }
  } else {
    // No vision models configured
    const noModelMsg = document.createElement('div');
    noModelMsg.style.cssText = 'color:' + C.yellow + ';font-size:13px;line-height:1.6;padding:10px 12px;border-radius:8px;border:1px solid ' + C.border + ';background:' + C.bgCard + ';';
    noModelMsg.textContent = t('chat.visionWarnNoModels');
    body.appendChild(noModelMsg);

    const hintMsg = document.createElement('div');
    hintMsg.style.cssText = 'color:' + C.textDim + ';font-size:12px;margin-top:8px;line-height:1.5;';
    hintMsg.textContent = t('chat.visionWarnHint');
    body.appendChild(hintMsg);
  }

  box.appendChild(body);

  // Footer with close button
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:12px 20px;border-top:1px solid ' + C.border + ';display:flex;justify-content:flex-end;flex-shrink:0;';
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'padding:6px 16px;border-radius:6px;border:1px solid ' + C.border + ';background:' + C.bgCard + ';color:' + C.text + ';font-size:13px;cursor:pointer;';
  closeBtn.textContent = t('chat.visionWarnClose');
  closeBtn.onclick = function() { overlay.remove(); };
  footer.appendChild(closeBtn);
  box.appendChild(footer);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if ((!text && !pendingFiles.length) || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (isSending) return; // prevent duplicate send

  isSending = true;
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('stopBtn').classList.remove('hidden');

  // Upload files first, then send message with file references
  const filesToUpload = [...pendingFiles];
  const hasFiles = filesToUpload.length > 0;
  const hasImages = filesToUpload.some(f => f.category === 'image');

  // Check: if sending images, verify current model supports vision
  if (hasImages) {
    const currentModelName = currentModel || '';
    const currentModelEntry = availableModels.find(m => m.name === currentModelName);
    const hasVision = currentModelEntry && (currentModelEntry.capabilities || []).includes('vision');
    if (!hasVision) {
      // Find vision-capable models
      const visionModels = availableModels.filter(m => (m.capabilities || []).includes('vision'));
      // Reset sending state — we haven't actually sent yet
      isSending = false;
      document.getElementById('sendBtn').disabled = false;
      document.getElementById('stopBtn').classList.add('hidden');
      showVisionWarningModal(visionModels);
      return;
    }
  }

  // Display user message with file previews in chat
  if (hasFiles) {
    let html = text ? escapeHtml(text) : '';
    for (const f of filesToUpload) {
      if (f.category === 'image') {
        html += `<img src="${f.data}" class="chat-image" onclick="window.open(this.src)">`;
      } else {
        const icon = FILE_ICONS[f.category] || FILE_ICONS.other;
        html += `<div class="chat-file-ref">${icon} ${escapeHtml(f.name)}</div>`;
      }
    }
    addMsgHtml(html, 'user');
  } else {
    addMsg(text, 'user');
  }

  addLog('info', t('log.userMsg') + ': ' + (text || '[file]').substring(0, 80), currentLang);

  // Upload files then send message
  if (hasFiles) {
    uploadFiles(filesToUpload).then(uploadedFiles => {
      let content = text;
      const images = [];
      for (const uf of uploadedFiles) {
        if (uf.category === 'image') {
          // Find the original file data to send as base64 via WS images field
          const origFile = filesToUpload.find(f => f.name === uf.name);
          if (origFile && origFile.data) {
            images.push({ data: origFile.data, name: uf.name, mime: origFile.mime || 'image/png' });
          }
        } else {
          content += `\n[File: ${uf.path}]`;
        }
      }
      const msgPayload = { type: 'message', content, session_id: currentSession };
      if (images.length > 0) msgPayload.images = images;
      if (currentModel) msgPayload.model = currentModel;
      ws.send(JSON.stringify(msgPayload));
    });
  } else {
    const msgPayload = { type: 'message', content: text, session_id: currentSession };
    if (currentModel) msgPayload.model = currentModel;
    ws.send(JSON.stringify(msgPayload));
  }

  // Clear
  pendingFiles = [];
  renderFilePreviews();
  input.value = '';
  input.style.height = 'auto';
  // Show typing indicator (static element, sticky at bottom)
  const typingEl = document.getElementById('typing');
  if (typingEl) {
    typingEl.className = 'typing active';
    const avatarEl = typingEl.querySelector('.typing-avatar');
    if (avatarEl && agentAvatarUrl) {
      avatarEl.innerHTML = `<img src="${agentAvatarUrl}" alt="Agent" onerror="this.style.display='none';this.parentElement.textContent='🤖';">`;
    }
  }
  // Clear previous tool progress history
  const typingTools = document.getElementById('typingTools');
  if (typingTools) typingTools.innerHTML = '';
}

function stopGeneration() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop' }));
  }
  // Reset UI immediately — don't wait for server response
  isSending = false;
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (sendBtn) sendBtn.disabled = false;
  if (stopBtn) stopBtn.classList.add('hidden');
  const typingEl = document.getElementById('typing');
  if (typingEl) typingEl.className = 'typing';
}

async function uploadFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const resp = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: file.data, name: file.name, mime: file.mime }),
      });
      const data = await resp.json();
      if (data.success) {
        results.push({ path: data.path, name: data.name, category: data.category || file.category });
      } else {
        addLog('warn', `文件上传失败: ${file.name} - ${data.error}`, currentLang);
      }
    } catch (e) {
      addLog('warn', `文件上传异常: ${file.name} - ${e.message}`, currentLang);
    }
  }
  return results;
}

// HTML message support (for user messages with images) — simplified, raw display
function addMsgHtml(html, cls) {
  const row = document.createElement('div');
  row.className = 'msg-row ' + (cls === 'agent' ? 'agent' : (cls === 'user' ? 'user' : ''));

  if (cls === 'user') {
    row.classList.add('msg-row-horizontal', 'msg-row-user-horizontal');
    const bubble = document.createElement('div');
    bubble.className = 'msg user';
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.innerHTML = html;
    bubble.appendChild(body);
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    row.appendChild(timeEl);
    row.appendChild(bubble);
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (cls === 'agent' ? 'agent-bubble' : cls);
    bubble.innerHTML = html;
    row.appendChild(bubble);
  }

  const container = document.getElementById('chatMessages');
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
  return row;
}

document.getElementById('chatInput').addEventListener('input', function() {
  this.style.height = 'auto';
this.style.height = Math.min(this.scrollHeight, 262) + 'px';
});
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Load models on page load
document.addEventListener('DOMContentLoaded', loadAvailableModels);

// ===== Tool Calls Render (moved from app.js) =====
function renderToolCalls(steps) {
  const wrap = document.createElement('div');
  wrap.className = 'tool-calls-wrap';

  const toggle = document.createElement('div');
  toggle.className = 'tool-calls-toggle';
  toggle.innerHTML = `<span class="arrow">▶</span><span class="tool-calls-count">${steps.length}</span> ${t('tools.viewCalls')}`;

  const panel = document.createElement('div');
  panel.className = 'tool-calls-panel';

  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open');
    const arrow = toggle.querySelector('.arrow');
    arrow.classList.toggle('open');
  });

  for (const step of steps) {
    // Skip TTS — rendered directly in bubble as audio bar
    if (step.tool_name === 'text_to_speech') continue;
    const stepEl = document.createElement('div');
    stepEl.className = 'tool-step';

    const icon = step.success ? '✓' : '✗';
    const statusClass = step.success ? 'ok' : 'err';
    const statusText = step.success ? 'OK' : 'ERR';
    const timeStr = step.elapsed_ms ? `${step.elapsed_ms}ms` : '';

    let paramsStr = '';
    if (step.parameters && Object.keys(step.parameters).length > 0) {
      paramsStr = JSON.stringify(step.parameters, null, 2);
    } else {
      paramsStr = t('tools.noParams');
    }

    let resultStr = step.result || t('tools.noResult');
    if (resultStr.length > 500) resultStr = resultStr.slice(0, 500) + t('tools.truncated');

    stepEl.innerHTML = `
      <div class="tool-step-header">
        <span class="tool-step-icon">${icon}</span>
        <span class="tool-step-name">${escapeHtml(step.tool_name)}</span>
        <span class="tool-step-status ${statusClass}">${statusText}</span>
        <span class="tool-step-time">${timeStr}</span>
        <span class="tool-step-arrow">▶</span>
      </div>
      <div class="tool-step-body">
        <div class="tool-step-section">
          <div class="tool-step-label">${t('tools.params')}</div>
          <div class="tool-step-code">${escapeHtml(paramsStr)}</div>
        </div>
        <div class="tool-step-section">
          <div class="tool-step-label">${t('tools.result')}</div>
          <div class="tool-step-result ${step.success ? 'success' : 'error'}">${escapeHtml(resultStr)}</div>
        </div>
      </div>
    `;

    const header = stepEl.querySelector('.tool-step-header');
    const body = stepEl.querySelector('.tool-step-body');
    const stepArrow = header.querySelector('.tool-step-arrow');
    header.addEventListener('click', () => {
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open');
      stepArrow.classList.toggle('open');
    });

    panel.appendChild(stepEl);
  }

  wrap.appendChild(toggle);
  wrap.appendChild(panel);
  return wrap;
}

// ===== JSON Syntax Highlighting =====
function debugHighlight(json) {
  const E = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return json.replace(/"([^"]+)":/g, (m, k) => '<span class="dbg-key">"' + E(k) + '"</span>:')
    .replace(/:\s*"([^"]*)"/g, (m, v) => ': <span class="dbg-str">"' + E(v) + '"</span>')
    .replace(/:\s*(\b\d+\.?\d*\b)/g, (m, v) => ': <span class="dbg-num">' + v + '</span>')
    .replace(/:\s*(\b(?:true|false|null)\b)/g, (m, v) => ': <span class="dbg-bool">' + v + '</span>');
}
window._pageChatLoaded = true;
