// components/toast.js — 通知系统（toast/confirm/dictModal）
// 从 js/toast.js 迁移

// ===== Toast Notification System =====
export const toast = {
  _container: null,
  _recent: new Map(),
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
    const now = Date.now();
    const key = type + ':' + message;
    if (this._recent.has(key) && now - this._recent.get(key) < 1000) return null;
    this._recent.set(key, now);
    if (this._recent.size > 50) {
      for (const [k, v] of this._recent) { if (now - v > 5000) this._recent.delete(k); }
    }
    const container = this._getContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ';
    el.innerHTML = '<span class="toast-icon">' + icon + '</span><span class="toast-msg">' + message + '</span>';
    container.appendChild(el);
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

// ===== Confirm Dialog System =====
let _confirmCallback = null;

export function showConfirm(opts) {
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
  if (scope) { scopeEl.style.display = 'block'; scopeEl.textContent = scope; }
  else { scopeEl.style.display = 'none'; }

  const impactEl = document.getElementById('confirmImpact');
  if (impactEl) {
    if (impact) { impactEl.style.display = 'block'; impactEl.textContent = impact; }
    else { impactEl.style.display = 'none'; }
  }

  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.textContent = okText;
  okBtn.className = danger ? 'danger' : 'primary';

  const cancelBtn = document.getElementById('confirmCancelBtn');
  if (cancelBtn) cancelBtn.textContent = cancelText;

  _confirmCallback = onConfirm;
  document.getElementById('confirmOverlay').classList.add('open');
}

export function cancelConfirm(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('confirmOverlay').classList.remove('open');
  _confirmCallback = null;
}

export function execConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
}

// ===== Input Modal =====
let _inputCallback = null;

export function showInput(opts) {
  const title = opts.title || '输入';
  const placeholder = opts.placeholder || '';
  const onConfirm = opts.onConfirm || null;

  document.getElementById('inputTitle').textContent = title;
  const field = document.getElementById('inputField');
  field.value = '';
  field.placeholder = placeholder;
  field.focus();

  _inputCallback = onConfirm;
  document.getElementById('inputOverlay').classList.add('open');
}

export function cancelInput() {
  document.getElementById('inputOverlay').classList.remove('open');
  _inputCallback = null;
}

export function execInput() {
  const val = document.getElementById('inputField').value;
  document.getElementById('inputOverlay').classList.remove('open');
  if (_inputCallback) { _inputCallback(val); _inputCallback = null; }
}

// ===== Dict Modal (full response data viewer) =====
export function showDictModal(data) {
  const existing = document.getElementById('dictModalOverlay');
  if (existing) existing.remove();

  let rawJson = '';
  try { rawJson = JSON.stringify(data, null, 2); } catch(e) { rawJson = String(data); }

  function cv(name) {
    const pageEl = document.querySelector('#page-chat.active') || document.documentElement;
    return getComputedStyle(pageEl).getPropertyValue(name).trim();
  }
  const C = {
    text:    cv('--color-text')    || '#1a1a1a',
    textDim: cv('--color-text-dim') || '#888888',
    accent:  cv('--color-primary')  || '#1aad6f',
    accent2: cv('--color-primary') || '#1aad6f',
    green:   cv('--color-primary')   || '#1aad6f',
    red:     cv('--color-danger')     || '#f44',
    yellow:  cv('--color-warning')  || '#fa0',
    orange:  cv('--color-warning')  || '#fa0',
    cyan:    cv('--color-primary')    || '#1aad6f',
    bgCard:  cv('--color-surface') || '#ffffff',
    border:  cv('--color-border')  || 'rgba(26,26,26,0.12)',
    bg:      cv('--color-bg')      || '#f0f0f0',
    bgHover: cv('--color-hover') || 'rgba(26,26,26,0.06)',
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
  box.style.background = C.bg;
  box.style.borderRadius = '12px';
  box.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid ' + C.border + ';flex-shrink:0;background:' + C.bgCard + ';border-radius:12px 12px 0 0;';
  const title = document.createElement('span');
  title.style.cssText = 'font-weight:600;font-size:14px;color:' + C.text + ';';
  title.textContent = '📦 完整响应数据';
  hdr.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText = 'background:' + C.bgCard + ';border:none;font-size:18px;cursor:pointer;color:' + C.textDim + ';padding:2px 8px;border-radius:4px;';
  closeBtn.onmouseenter = () => { closeBtn.style.background = C.bgHover; };
  closeBtn.onmouseleave = () => { closeBtn.style.background = C.bgCard; };
  closeBtn.addEventListener('click', () => overlay.remove());
  hdr.appendChild(closeBtn);
  box.appendChild(hdr);

  // Toolbar: search + copy
  const toolbar = document.createElement('div');
  toolbar.className = 'dict-modal-toolbar';
  toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 20px;border-bottom:1px solid ' + C.border + ';flex-shrink:0;background:' + C.bgCard + ';';

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
  copyAllBtn.style.cssText = 'flex-shrink:0;font-size:11px;padding:4px 12px;background:' + C.bgCard + ';border:1px solid ' + C.border + ';border-radius:4px;color:' + C.text + ';cursor:pointer;';
  copyAllBtn.onmouseenter = () => { copyAllBtn.style.background = C.bgHover; };
  copyAllBtn.onmouseleave = () => { copyAllBtn.style.background = C.bgCard; };
  copyAllBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(rawJson).then(() => {
      copyAllBtn.innerHTML = '✓ 已复制';
      setTimeout(() => copyAllBtn.innerHTML = '\ud83d\udccb 复制全部', 1500);
    });
  });
  toolbar.appendChild(copyAllBtn);

  const modeBtn = document.createElement('button');
  modeBtn.className = 'msg-action-btn';
  modeBtn.innerHTML = '📋 代码';
  modeBtn.style.cssText = 'flex-shrink:0;font-size:11px;padding:4px 12px;background:' + C.bgCard + ';border:1px solid ' + C.border + ';border-radius:4px;color:' + C.text + ';cursor:pointer;';
  modeBtn.onmouseenter = () => { modeBtn.style.background = C.bgHover; };
  modeBtn.onmouseleave = () => { modeBtn.style.background = C.bgCard; };
  toolbar.appendChild(modeBtn);
  box.appendChild(toolbar);

  // Content area
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;';
  const scrollWrap = document.createElement('div');
  scrollWrap.style.cssText = 'overflow-y:auto;flex:1;min-height:0;padding:0 20px 12px;position:relative;';
  content.appendChild(scrollWrap);

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Syntax highlight
  function renderValue(val, indent) {
    const pad = '  '.repeat(indent);
    const nextPad = '  '.repeat(indent + 1);
    if (val === null) return '<span style="color:' + C.textDim + ';font-style:italic;">null</span>';
    if (val === undefined) return '<span style="color:' + C.textDim + ';font-style:italic;">undefined</span>';
    const t = typeof val;
    if (t === 'string') {
      const s = esc(val);
      if (/^https?:\/\//.test(val)) {
        return '<span style="color:' + C.green + ';text-decoration:underline;cursor:pointer;" onclick="window.open(&apos;' + s + '&apos;,&apos;_blank&apos;)">' + s + '</span>';
      }
      if (/^[\/\w\-]+\.\w+$/.test(val)) return '<span style="color:' + C.cyan + ';">"' + s + '"</span>';
      return '<span style="color:' + C.accent + ';">"' + s + '"</span>';
    }
    if (t === 'number') return '<span style="color:' + C.text + ';font-weight:500;">' + esc(val) + '</span>';
    if (t === 'boolean') return '<span style="color:' + C.red + ';font-weight:600;">' + esc(val) + '</span>';
    if (t === 'object') {
      if (Array.isArray(val)) {
        if (val.length === 0) return '<span style="color:' + C.textDim + ';">[]</span>';
        const items = val.map((v, i) => nextPad + '<span style="color:' + C.textDim + ';font-size:10px;font-weight:500;">#' + i + '</span> ' + renderValue(v, indent + 1));
        return '<span style="color:' + C.textDim + ';">[</span>\n' + items.join(',\n') + '\n' + pad + '<span style="color:' + C.textDim + ';">]</span>';
      }
      const keys = Object.keys(val);
      if (keys.length === 0) return '<span style="color:' + C.textDim + ';">{}</span>';
      const items = keys.map(k => {
        const keyHtml = '<span style="color:' + C.accent2 + ';">"' + esc(k) + '"</span>';
        const valHtml = renderValue(val[k], indent + 1);
        return nextPad + keyHtml + '<span style="color:' + C.textDim + ';">: </span>' + valHtml;
      });
      return '<span style="color:' + C.textDim + ';">{</span>\n' + items.join(',\n') + '\n' + pad + '<span style="color:' + C.textDim + ';">}</span>';
    }
    return esc(val);
  }

  function renderCodeView(obj) {
    const pre = document.createElement('pre');
    pre.style.cssText = 'font-size:12.5px;font-family:\'SF Mono\',\'Fira Code\',\'Cascadia Code\',Consolas,monospace;line-height:1.75;margin:0;white-space:pre-wrap;word-break:break-all;';
    pre.innerHTML = renderValue(obj, 0);
    return pre;
  }

  // Structured view
  const structuredWrap = document.createElement('div');
  {
    const sec = document.createElement('div');
    sec.setAttribute('data-dict-sec', '');
    sec.style.marginBottom = '8px';
    const head = document.createElement('div');
    head.className = 'dict-sec-head';
    head.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;border-bottom:1px solid ' + C.border + ';';
    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = 'font-size:10px;color:' + C.textDim + ';transition:transform 0.2s;flex-shrink:0;';
    head.appendChild(arrow);
    const iconEl = document.createElement('span');
    iconEl.textContent = '📋';
    head.appendChild(iconEl);
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-weight:600;font-size:13px;color:' + C.text + ';';
    labelEl.textContent = '响应信息';
    head.appendChild(labelEl);
    sec.appendChild(head);
    const body = document.createElement('div');
    body.style.cssText = 'padding:0 0 8px 20px;';
    const infoRows = [];
    if (data.model) infoRows.push({ label: '模型', value: data.model });
    if (data.processing_time_ms) infoRows.push({ label: '耗时', value: data.processing_time_ms + 'ms' });
    if (data.finish_reason) infoRows.push({ label: '结束原因', value: data.finish_reason });
    if (data.success !== undefined) infoRows.push({ label: '状态', value: data.success ? '✓ 成功' : '✗ 失败' });
    if (data.skills_used && data.skills_used.length) infoRows.push({ label: 'Skills Used', value: data.skills_used.join(', ') });
    if (data.attachments && data.attachments.length) infoRows.push({ label: '附件', value: data.attachments.length + ' 个' });
    if (infoRows.length === 0) {
      body.innerHTML = '<div style="color:' + C.textDim + ';font-size:12px;">无元数据</div>';
    } else {
      body.innerHTML = infoRows.map(r =>
        '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid ' + C.border + ';">'
        + '<span style="color:' + C.textDim + ';font-size:12px;min-width:80px;">' + esc(r.label) + '</span>'
        + '<span style="color:' + C.text + ';font-size:12px;flex:1;word-break:break-all;">' + esc(r.value) + '</span>'
        + '</div>'
      ).join('');
    }
    sec.appendChild(body);
    structuredWrap.appendChild(sec);
  }

  // Tool call steps
  if (data.tool_call_steps && data.tool_call_steps.length) {
    const sec = document.createElement('div');
    sec.setAttribute('data-dict-sec', '');
    sec.style.marginBottom = '8px';
    const head = document.createElement('div');
    head.className = 'dict-sec-head';
    head.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;border-bottom:1px solid ' + C.border + ';';
    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = 'font-size:10px;color:' + C.textDim + ';transition:transform 0.2s;flex-shrink:0;';
    head.appendChild(arrow);
    const iconEl = document.createElement('span');
    iconEl.textContent = '🔧';
    head.appendChild(iconEl);
    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-weight:600;font-size:13px;color:' + C.text + ';';
    labelEl.textContent = '工具调用 (' + data.tool_call_steps.length + ')';
    head.appendChild(labelEl);
    sec.appendChild(head);
    const body = document.createElement('div');
    body.style.cssText = 'padding:0 0 8px 20px;';
    for (const step of data.tool_call_steps) {
      const stepEl = document.createElement('div');
      stepEl.style.cssText = 'margin-bottom:8px;border:1px solid ' + C.border + ';border-radius:6px;overflow:hidden;';
      const stepHead = document.createElement('div');
      stepHead.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;background:' + C.bgCard + ';border-bottom:1px solid ' + C.border + ';cursor:pointer;';
      const sArrow = document.createElement('span');
      sArrow.textContent = '▶';
      sArrow.style.cssText = 'font-size:10px;color:' + C.textDim + ';transition:transform 0.2s;flex-shrink:0;';
      stepHead.appendChild(sArrow);
      const statusIcon = step.success ? '<span style="color:' + C.green + ';">✓</span>' : '<span style="color:' + C.red + ';">✗</span>';
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'font-weight:600;font-size:12px;color:' + C.text + ';';
      nameSpan.textContent = step.tool_name || '';
      stepHead.appendChild(nameSpan);
      if (step.duration_ms) {
        const durSpan = document.createElement('span');
        durSpan.style.cssText = 'margin-left:auto;font-size:10px;color:' + C.textDim + ';';
        durSpan.textContent = step.duration_ms + 'ms';
        stepHead.appendChild(durSpan);
      }
      stepEl.appendChild(stepHead);
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
      let stepOpen = false;
      stepHead.addEventListener('click', () => {
        stepOpen = !stepOpen;
        stepBody.style.display = stepOpen ? '' : 'none';
        sArrow.style.transform = stepOpen ? 'rotate(90deg)' : '';
      });
      body.appendChild(stepEl);
    }
    sec.appendChild(body);
    structuredWrap.appendChild(sec);
  }

  scrollWrap.appendChild(structuredWrap);

  // Code view (hidden by default)
  const codeWrap = document.createElement('div');
  codeWrap.style.display = 'none';
  codeWrap.appendChild(renderCodeView(data));
  scrollWrap.appendChild(codeWrap);

  // Mode toggle
  let currentMode = 'structured';
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
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
  });

  box.appendChild(content);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ===== Delete Model Confirmation =====
export function confirmDeleteModel(modelName, onConfirm) {
  showConfirm({
    title: '删除模型',
    msg: '确定要删除模型 "' + modelName + '" 吗？',
    impact: '⚠ 该模型的配置信息（名称、Provider、API Key、能力标签等）将被永久移除。如果该模型正在被使用，可能影响相关功能。',
    danger: true,
    okText: '确认删除',
    onConfirm: onConfirm,
  });
}

// Expose to global scope
