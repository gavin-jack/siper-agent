// ===== Toast Notification System =====
const toast = {
  _container: null,
  _recent: new Map(), // anti-dup: message -> timestamp
  _getContainer() {
    if (!this._container) {
      this._container = document.getElementById('toastContainer');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'toastContainer';
        this._container.className = 'toast-container';
        document.body.appendChild(this._container);
      }
    }
    return this._container;
  },
  _show(message, type, duration) {
    // Anti-dedup: same message within 1s is ignored
    const now = Date.now();
    const key = type + ':' + message;
    if (this._recent.has(key) && now - this._recent.get(key) < 1000) return null;
    this._recent.set(key, now);
    // Cleanup old entries
    if (this._recent.size > 50) {
      for (const [k, v] of this._recent) { if (now - v > 5000) this._recent.delete(k); }
    }
    const container = this._getContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ';
    el.innerHTML = '<span class="toast-icon">' + icon + '</span><span class="toast-msg">' + escapeHtml(message) + '</span>';
    container.appendChild(el);
    // Animate in
    requestAnimationFrame(() => { el.classList.add('toast-in'); });
    if (duration !== 0) {
      setTimeout(() => {
        el.classList.remove('toast-in');
        el.classList.add('toast-out');
        setTimeout(() => { el.remove(); }, 300);
      }, duration || 2500);
    }
    return el;
  },
  info(msg, duration) { return this._show(msg, 'info', duration); },
  success(msg, duration) { return this._show(msg, 'success', duration); },
  error(msg, duration) { return this._show(msg, 'error', duration || 4000); },
  warning(msg, duration) { return this._show(msg, 'warning', duration || 3000); },
};
window.toast = toast;

// ===== Confirm Dialog System =====
let _confirmCallback = null;

function showConfirm(opts) {
  const title = opts.title || '确认操作';
  const msg = opts.msg || '确定要执行此操作吗？';
  const scope = opts.scope || '';
  const impact = opts.impact || '';
  const onConfirm = opts.onConfirm || null;
  const danger = opts.danger || false;
  const okText = opts.okText || '确认';
  const cancelText = opts.cancelText || '取消';

  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;

  const scopeEl = document.getElementById('confirmScope');
  if (scope) {
    scopeEl.style.display = 'block';
    scopeEl.innerHTML = scope;
  } else {
    scopeEl.style.display = 'none';
  }

  const impactEl = document.getElementById('confirmImpact');
  if (impactEl) {
    if (impact) {
      impactEl.style.display = 'block';
      impactEl.innerHTML = impact;
    } else {
      impactEl.style.display = 'none';
    }
  }

  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.textContent = okText;
  okBtn.className = danger ? 'danger' : 'primary';

  const cancelBtn = document.getElementById('confirmCancelBtn');
  if (cancelBtn) cancelBtn.textContent = cancelText;

  _confirmCallback = onConfirm;
  document.getElementById('confirmOverlay').classList.add('open');
}

function cancelConfirm(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('confirmOverlay').classList.remove('open');
  _confirmCallback = null;
}

function execConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (_confirmCallback) {
    _confirmCallback();
    _confirmCallback = null;
  }
}

// ===== Dict Modal (full response data viewer) =====
function showDictModal(data) {
  const existing = document.getElementById('dictModalOverlay');
  if (existing) existing.remove();

  let rawJson = '';
  try { rawJson = JSON.stringify(data, null, 2); } catch(e) { rawJson = String(data); }

  function cv(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const C = {
    text:    cv('--text')    || '#e6edf3',
    textDim: cv('--text-dim') || '#8b949e',
    accent:  cv('--accent')  || '#58a6ff',
    accent2: cv('--accent2') || '#a371f7',
    green:   cv('--green')   || '#3fb950',
    red:     cv('--red')     || '#f85149',
    yellow:  cv('--yellow')  || '#d29922',
    orange:  cv('--orange')  || '#f0883e',
    cyan:    cv('--cyan')    || '#39d2c0',
    bgCard:  cv('--bg-card') || '#1c2333',
    border:  cv('--border')  || '#30363d',
    bg:      cv('--bg')      || '#0d1117',
    bgHover: cv('--bg-hover') || '#242d3d',
  };

  const overlay = document.createElement('div');
  overlay.id = 'dictModalOverlay';
  overlay.className = 'dict-modal-overlay modal-overlay-base open';

  const box = document.createElement('div');
  box.className = 'dict-modal-dialog modal-dialog-base';
  box.style.width = '700px';
  box.style.maxWidth = '92vw';
  box.style.maxHeight = '86vh';
  box.style.display = 'flex';
  box.style.flexDirection = 'column';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid ' + C.border + ';flex-shrink:0;';
  const title = document.createElement('span');
  title.style.cssText = 'font-weight:600;font-size:14px;color:' + C.text + ';';
  title.textContent = '📦 完整响应数据';
  hdr.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:' + C.textDim + ';padding:2px 8px;border-radius:4px;';
  closeBtn.onmouseenter = () => { closeBtn.style.background = C.bgHover; };
  closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; };
  closeBtn.addEventListener('click', () => overlay.remove());
  hdr.appendChild(closeBtn);
  box.appendChild(hdr);

  // Toolbar: search + copy
  const toolbar = document.createElement('div');
  toolbar.className = 'dict-modal-toolbar';
  toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 20px;border-bottom:1px solid ' + C.border + ';flex-shrink:0;'

  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'flex:1;display:flex;align-items:center;gap:6px;background:' + C.bg + ';border:1px solid ' + C.border + ';border-radius:6px;padding:4px 12px;';
  const searchIcon = document.createElement('span');
  searchIcon.textContent = '\ud83d\udd0d';
  searchIcon.style.cssText = 'font-size:12px;opacity:0.5;flex-shrink:0;';
  searchWrap.appendChild(searchIcon);
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = '搜索 key 或 value...';
  searchInput.style.cssText = 'flex:1;background:none;border:none;outline:none;font-size:12px;color:' + C.text + ';min-width:0;';
  searchWrap.appendChild(searchInput);
  const clearBtn = document.createElement('button');
  clearBtn.innerHTML = '\u2715';
  clearBtn.title = '清除搜索';
  clearBtn.style.cssText = 'flex-shrink:0;background:none;border:none;font-size:12px;cursor:pointer;color:' + C.textDim + ';padding:2px 4px;border-radius:4px;display:none;line-height:1;';
  clearBtn.onmouseenter = () => { clearBtn.style.background = C.bgHover; clearBtn.style.color = C.text; };
  clearBtn.onmouseleave = () => { clearBtn.style.background = 'none'; clearBtn.style.color = C.textDim; };
  clearBtn.addEventListener('click', () => { searchInput.value = ''; searchInput.focus(); });
  searchWrap.appendChild(clearBtn);
  toolbar.appendChild(searchWrap);

  const copyAllBtn = document.createElement('button');
  copyAllBtn.className = 'msg-action-btn';
  copyAllBtn.innerHTML = '\ud83d\udccb 复制全部';
  copyAllBtn.style.cssText = 'flex-shrink:0;font-size:11px;padding:4px 12px;background:' + C.bg + ';border:1px solid ' + C.border + ';border-radius:4px;color:' + C.text + ';cursor:pointer;';
  copyAllBtn.onmouseenter = () => { copyAllBtn.style.background = C.bgHover; };
  copyAllBtn.onmouseleave = () => { copyAllBtn.style.background = C.bg; };
  copyAllBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(rawJson).then(() => {
      copyAllBtn.innerHTML = '✓ 已复制';
      setTimeout(() => copyAllBtn.innerHTML = '\ud83d\udccb 复制全部', 1500);
    });
  });
  toolbar.appendChild(copyAllBtn);

  // Mode toggle: structured / code
  const modeBtn = document.createElement('button');
  modeBtn.className = 'msg-action-btn';
  modeBtn.innerHTML = '📋 代码';
  modeBtn.style.cssText = 'flex-shrink:0;font-size:11px;padding:4px 12px;background:' + C.bg + ';border:1px solid ' + C.border + ';border-radius:4px;color:' + C.text + ';cursor:pointer;';
  modeBtn.onmouseenter = () => { modeBtn.style.background = C.bgHover; };
  modeBtn.onmouseleave = () => { modeBtn.style.background = C.bg; };
  toolbar.appendChild(modeBtn);
  box.appendChild(toolbar);

  // Content area - wrapper is the scroll container (not content itself)
  // This is required for position:sticky to work inside flex children
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;';
  const scrollWrap = document.createElement('div');
  scrollWrap.style.cssText = 'overflow-y:auto;flex:1;min-height:0;padding:0 20px 12px;position:relative;';
  content.appendChild(scrollWrap);

  // ===== Code mode: syntax-highlighted JSON =====
  function renderValue(val, indent) {
    const pad = '  '.repeat(indent);
    const nextPad = '  '.repeat(indent + 1);
    if (val === null) return '<span style="color:' + C.textDim + ';font-style:italic;">null</span>';
    if (val === undefined) return '<span style="color:' + C.textDim + ';font-style:italic;">undefined</span>';
    const t = typeof val;
    if (t === 'string') {
      const escaped = escapeHtml(val);
      if (/^https?:\/\//.test(val)) {
        return '<span style="color:' + C.green + ';text-decoration:underline;cursor:pointer;" onclick="window.open(&apos;' + val + '&apos;,&apos;_blank&apos;)">' + escaped + '</span>';
      }
      if (/^[\/\\w\-\/\\]+\.\w+$/.test(val)) return '<span style="color:' + C.cyan + ';">"' + escaped + '"</span>';
      return '<span style="color:' + C.accent + ';">"' + escaped + '"</span>';
    }
    if (t === 'number') return '<span style="color:' + C.text + ';font-weight:500;">' + val + '</span>';
    if (t === 'boolean') return '<span style="color:' + C.red + ';font-weight:600;">' + val + '</span>';
    if (t === 'object') {
      if (Array.isArray(val)) {
        if (val.length === 0) return '<span style="color:' + C.textDim + ';">[]</span>';
        const items = val.map((v, i) => nextPad + '<span style="color:' + C.textDim + ';font-size:10px;font-weight:500;">#' + i + '</span> ' + renderValue(v, indent + 1));
        return '<span style="color:' + C.textDim + ';">[</span>\n' + items.join(',\n') + '\n' + pad + '<span style="color:' + C.textDim + ';">]</span>';
      }
      const keys = Object.keys(val);
      if (keys.length === 0) return '<span style="color:' + C.textDim + ';">{}</span>';
      const items = keys.map(k => {
        const keyHtml = '<span style="color:' + C.accent2 + ';">"' + escapeHtml(k) + '"</span>';
        const valHtml = renderValue(val[k], indent + 1);
        return nextPad + keyHtml + '<span style="color:' + C.textDim + ';">: </span>' + valHtml;
      });
      return '<span style="color:' + C.textDim + ';">{</span>\n' + items.join(',\n') + '\n' + pad + '<span style="color:' + C.textDim + ';">}</span>';
    }
    return escapeHtml(String(val));
  }

  function renderCodeView(obj, expanded) {
    const pre = document.createElement('pre');
    pre.style.cssText = 'font-size:12.5px;font-family:\'SF Mono\',\'Fira Code\',\'Cascadia Code\',Consolas,monospace;line-height:1.75;margin:0;white-space:pre-wrap;word-break:break-all;';
    if (expanded) {
      pre.innerHTML = renderValue(obj, 0);
    } else {
      pre.textContent = JSON.stringify(obj);
    }
    return pre;
  }

  // ===== Mode toggle state =====
  let currentMode = 'structured';
  let codeExpanded = true;

  // Helper: create a collapsible section
  function makeSection(label, icon, defaultOpen) {
    const sec = document.createElement('div');
    sec.setAttribute('data-dict-sec', '');
    sec.style.marginBottom = '8px';
    const head = document.createElement('div');
    head.className = 'dict-sec-head';
    head.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;border-bottom:1px solid ' + C.border + ';'
    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = 'font-size:10px;color:' + C.textDim + ';transition:transform 0.2s;flex-shrink:0;';
    head.appendChild(arrow);
    const iconEl = document.createElement('span');
    iconEl.textContent = icon;
    head.appendChild(iconEl);
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-weight:600;font-size:13px;color:' + C.text + ';';
    labelEl.textContent = label;
    head.appendChild(labelEl);
    sec.appendChild(head);
    const body = document.createElement('div');
    body.style.cssText = 'padding:0 0 8px 20px;';
    sec.appendChild(body);

    let isOpen = defaultOpen !== false;
    const toggle = () => {
      // Check actual display state (may have been auto-collapsed by scroll)
      const currentlyOpen = body.style.display !== 'none';
      isOpen = !currentlyOpen;
      body.style.display = isOpen ? '' : 'none';
      arrow.style.transform = isOpen ? 'rotate(90deg)' : '';
    };
    head.addEventListener('click', toggle);
    if (!isOpen) { body.style.display = 'none'; arrow.style.transform = ''; }
    else { arrow.style.transform = 'rotate(90deg)'; }

    return { sec, body };
  }

  // ===== Format duration =====
  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
    return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
  }

  // ===== Structured view =====
  const structuredWrap = document.createElement('div');

  // Response info section
  {
    const { sec, body } = makeSection('响应信息', '📋', true);
    const infoRows = [];
    if (data.model) infoRows.push({ label: 'Model', value: data.model });
    if (data.processing_time_ms) infoRows.push({ label: '耗时', value: formatDuration(data.processing_time_ms) });
    if (data.finish_reason) infoRows.push({ label: '结束原因', value: data.finish_reason });
    if (data.success !== undefined) infoRows.push({ label: '状态', value: data.success ? '✓ 成功' : '✗ 失败' });
    if (data.skills_used && data.skills_used.length) infoRows.push({ label: 'Skills Used', value: data.skills_used.join(', ') });
    if (data.skills_recommended && data.skills_recommended.length) infoRows.push({ label: 'Skills Recommended', value: data.skills_recommended.join(', ') });
    if (data.skills_active && data.skills_active.length) infoRows.push({ label: 'Skills Active', value: data.skills_active.join(', ') });
    if (data.attachments && data.attachments.length) infoRows.push({ label: '附件', value: data.attachments.length + ' 个' });
    if (infoRows.length === 0) {
      body.innerHTML = '<div style="color:' + C.textDim + ';font-size:12px;">无元数据</div>';
    } else {
      body.innerHTML = infoRows.map(r =>
        '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid ' + C.border + ';">'
        + '<span style="color:' + C.textDim + ';font-size:12px;min-width:80px;">' + escapeHtml(r.label) + '</span>'
        + '<span style="color:' + C.text + ';font-size:12px;flex:1;word-break:break-all;">' + escapeHtml(r.value) + '</span>'
        + '</div>'
      ).join('');
    }
    structuredWrap.appendChild(sec);
  }

  // Tool call steps
  if (data.tool_call_steps && data.tool_call_steps.length) {
    const { sec, body } = makeSection('工具调用 (' + data.tool_call_steps.length + ')', '🔧', false);
    for (const step of data.tool_call_steps) {
      const stepEl = document.createElement('div');
      stepEl.style.cssText = 'margin-bottom:8px;border:1px solid ' + C.border + ';border-radius:6px;overflow:hidden;';
      // Step header (clickable, default collapsed)
      const stepHead = document.createElement('div');
      stepHead.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;background:' + C.bg + ';cursor:pointer;';
      const arrow = document.createElement('span');
      arrow.textContent = '▶';
      arrow.style.cssText = 'font-size:10px;color:' + C.textDim + ';transition:transform 0.2s;flex-shrink:0;';
      stepHead.appendChild(arrow);
      const statusIcon = step.success ? '<span style="color:' + C.green + ';">✓</span>' : '<span style="color:' + C.red + ';">✗</span>';
      stepHead.innerHTML += statusIcon + '<span style="font-weight:600;font-size:12px;color:' + C.text + ';">' + escapeHtml(step.tool_name || '') + '</span>';
      if (step.duration_ms) {
        stepHead.innerHTML += '<span style="margin-left:auto;font-size:10px;color:' + C.textDim + ';">' + formatDuration(step.duration_ms) + '</span>';
      }
      stepEl.appendChild(stepHead);
      // Step body (collapsible)
      const stepBody = document.createElement('div');
      stepBody.style.display = 'none';
      if (step.parameters) {
        const paramsEl = document.createElement('div');
        paramsEl.style.cssText = 'padding:6px 10px;font-size:11px;color:' + C.textDim + ';border-top:1px solid ' + C.border + ';';
        paramsEl.textContent = typeof step.parameters === 'string' ? step.parameters : JSON.stringify(step.parameters);
        stepBody.appendChild(paramsEl);
      }
      if (step.result) {
        const resultEl = document.createElement('div');
        resultEl.style.cssText = 'padding:6px 10px;font-size:11px;color:' + C.text + ';border-top:1px solid ' + C.border + ';max-height:100px;overflow:auto;white-space:pre-wrap;word-break:break-all;';
        resultEl.textContent = typeof step.result === 'string' ? step.result : JSON.stringify(step.result);
        stepBody.appendChild(resultEl);
      }
      stepEl.appendChild(stepBody);
      // Toggle
      let stepOpen = false;
      stepHead.addEventListener('click', () => {
        stepOpen = !stepOpen;
        stepBody.style.display = stepOpen ? '' : 'none';
        arrow.style.transform = stepOpen ? 'rotate(90deg)' : '';
      });
      body.appendChild(stepEl);
    }
    structuredWrap.appendChild(sec);
  }


  scrollWrap.appendChild(structuredWrap);

  // ===== Code view (hidden by default) =====
  const codeWrap = document.createElement('div');
  codeWrap.style.display = 'none';
  codeWrap.appendChild(renderCodeView(data, true));
  scrollWrap.appendChild(codeWrap);

  // Mode toggle
  modeBtn.addEventListener('click', () => {
    if (currentMode === 'structured') {
      currentMode = 'code';
      structuredWrap.style.display = 'none';
      codeWrap.style.display = '';
      modeBtn.innerHTML = '📊 结构化';
    } else {
      currentMode = 'structured';
      structuredWrap.style.display = '';
      codeWrap.style.display = 'none';
      modeBtn.innerHTML = '📋 代码';
    }
  });

  // Search
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    clearBtn.style.display = q ? '' : 'none';
    if (!q) {
      scrollWrap.querySelectorAll('.dict-hl').forEach(el => {
        const parent = el.parentNode;
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      });
      scrollWrap.querySelectorAll('[data-dict-sec]').forEach(el => { el.style.display = ''; });
      return;
    }
    if (currentMode === 'structured') {
      scrollWrap.querySelectorAll('[data-dict-sec]').forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? '' : 'none';
      });
    }
  });

  box.appendChild(content);

  // Auto-collapse section body when its header scrolls out of view
  const secHeaders = scrollWrap.querySelectorAll('.dict-sec-head');
  const onScroll = () => {
    const sRect = scrollWrap.getBoundingClientRect();
    secHeaders.forEach(head => {
      const sec = head.parentElement;
      const body = sec.querySelector('div:last-child');
      const hRect = head.getBoundingClientRect();
      // Header bottom above scrollWrap top = fully scrolled past, collapse
      if (hRect.bottom <= sRect.top + 2) {
        if (body && body.style.display !== 'none') {
          body.style.display = 'none';
          const arrow = head.querySelector('span:first-child');
          if (arrow) arrow.style.transform = '';
        }
      }
    });
  };
  scrollWrap.addEventListener('scroll', onScroll);

  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ===== Delete Model Confirmation =====
function confirmDeleteModel(modelName, onConfirm) {
  showConfirm({
    title: '删除模型',
    msg: '确定要删除模型 "' + escapeHtml(modelName) + '" 吗？',
    impact: '⚠ 该模型的配置信息（名称、Provider、API Key、能力标签等）将被永久移除。如果该模型正在被使用，可能影响相关功能。',
    danger: true,
    okText: '确认删除',
    onConfirm: onConfirm,
  });
}
