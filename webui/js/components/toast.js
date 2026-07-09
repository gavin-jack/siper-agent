// components/toast.js — 统一通知系统（toast / confirm / input / dictModal / imageLightbox）
// 所有弹窗在 #siperNotifRoot 顶层渲染，统一样式 token，toast 带倒计时进度条
import { escapeHtml } from '../utils/escape.js?v=1783625456886';

// ===== 统一通知容器 =====
const NOTIF_ROOT_ID = 'siperNotifRoot';

export function _getNotifRoot() {
  let root = document.getElementById(NOTIF_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = NOTIF_ROOT_ID;
    root.style.position = 'fixed';
    root.style.top = '60px';
    root.style.left = '50%';
    root.style.transform = 'translateX(-50%)';
    root.style.zIndex = '99999';
    root.style.pointerEvents = 'none';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.alignItems = 'center';
    root.style.gap = '8px';
    document.body.appendChild(root);
  }
  return root;
}

// ===== 通用 Overlay（confirm/input/dictModal 共用）=====
// 弹出框独立于 toast 容器，fixed 全屏覆盖，内容上下左右居中
function _createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'siper-notif-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '99999';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('siper-notif-overlay-in'));
  return overlay;
}

function _removeOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.remove('siper-notif-overlay-in');
  overlay.classList.add('siper-notif-overlay-out');
  setTimeout(() => overlay.remove(), 200);
}

// ===== Toast 通知 =====
export const toast = {
  _recent: new Map(),

  _show(message, type, duration) {
    const now = Date.now();
    const key = type + ':' + message;
    if (this._recent.has(key) && now - this._recent.get(key) < 800) return null;
    this._recent.set(key, now);
    if (this._recent.size > 50) {
      for (const [k, v] of this._recent) { if (now - v > 5000) this._recent.delete(k); }
    }

    const root = _getNotifRoot();
    const el = document.createElement('div');
    el.className = 'siper-notif siper-notif-toast siper-notif-' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
    const defaults = { success: 1500, error: 3000, warning: 2000, info: 2000 };
    const progressMs = duration || defaults[type] || 2000;

    el.innerHTML = `
      <span class="siper-notif-icon">${icons[type] || 'ℹ'}</span>
      <span class="siper-notif-msg">${escapeHtml(message)}</span>
      <span class="siper-notif-close" aria-label="关闭">✕</span>
      <span class="siper-notif-progress"><span class="siper-notif-progress-bar"></span></span>
    `;

    root.appendChild(el);

    requestAnimationFrame(() => {
      el.classList.add('siper-notif-in');
      const bar = el.querySelector('.siper-notif-progress-bar');
      if (bar) {
        const parentW = bar.parentElement.offsetWidth || el.offsetWidth;
        bar.style.transition = 'none';
        bar.style.width = parentW + 'px';
        void bar.offsetWidth;
        bar.style.transition = 'width linear ' + progressMs + 'ms';
        bar.style.width = '0px';
      }
    });

    el.querySelector('.siper-notif-close').addEventListener('click', () => this._dismiss(el));

    if (duration !== 0) {
      const timer = setTimeout(() => this._dismiss(el), progressMs);
      el._timer = timer;
    }

    return el;
  },

  _dismiss(el) {
    if (el._dismissed) return;
    el._dismissed = true;
    if (el._timer) clearTimeout(el._timer);
    el.classList.remove('siper-notif-in');
    el.classList.add('siper-notif-out');
    setTimeout(() => el.remove(), 300);
  },

  info(msg, duration) { return this._show(msg, 'info', duration); },
  success(msg, duration) { return this._show(msg, 'success', duration); },
  error(msg, duration) { return this._show(msg, 'error', duration); },
  warning(msg, duration) { return this._show(msg, 'warning', duration); },
  clearAll() {
    document.querySelectorAll('.siper-notif-toast').forEach(el => this._dismiss(el));
  },
};

// ===== Confirm 对话框 =====
// 防重复调用：移除已存在的 confirm overlay
function _removeExistingConfirm() {
  const existing = document.querySelector('.siper-notif-confirm');
  if (existing) {
    const ov = existing.closest('.siper-notif-overlay');
    if (ov) _removeOverlay(ov);
  }
}

export function showConfirm(opts) {
  const title = opts.title || '确认操作';
  const msg = opts.msg || '确定要执行此操作吗？';
  const scope = opts.scope || '';
  const impact = opts.impact || '';
  const onConfirm = opts.onConfirm || null;
  const danger = opts.danger || false;
  const okText = opts.okText || '确认';
  const cancelText = opts.cancelText || '取消';

  _removeExistingConfirm();

  const overlay = _createOverlay();

  const box = document.createElement('div');
  box.className = 'siper-notif-dialog siper-notif-confirm';
  box.innerHTML = `
    <div class="siper-notif-dialog-header">
      <span class="siper-notif-dialog-title"><span class="siper-notif-warn-icon">⚠️</span>${escapeHtml(title)}</span>
      <button class="siper-notif-dialog-close" aria-label="关闭">×</button>
    </div>
    <div class="siper-notif-dialog-body">
      <div class="siper-notif-dialog-msg">${escapeHtml(msg)}</div>
      ${scope ? `<div class="siper-notif-dialog-scope">${escapeHtml(scope)}</div>` : ''}
      ${impact ? `<div class="siper-notif-dialog-impact">${escapeHtml(impact)}</div>` : ''}
    </div>
    <div class="siper-notif-dialog-footer">
      <button class="siper-notif-btn siper-notif-btn-cancel">${escapeHtml(cancelText)}</button>
      <button class="siper-notif-btn ${danger ? 'siper-notif-btn-danger' : 'siper-notif-btn-primary'}">${escapeHtml(okText)}</button>
    </div>
  `;

  overlay.appendChild(box);

  // Events — 回调绑定到 overlay 元素，避免模块级变量覆盖
  const close = () => { _removeOverlay(overlay); };
  box.querySelector('.siper-notif-dialog-close').onclick = close;
  box.querySelector('.siper-notif-btn-cancel').onclick = close;
  box.querySelector('.siper-notif-btn-primary, .siper-notif-btn-danger').onclick = () => {
    _removeOverlay(overlay);
    if (onConfirm) onConfirm.call(box);
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
}

export function cancelConfirm(e) {
  // 兼容旧调用：关闭当前 open 的 confirm
  const overlay = document.querySelector('.siper-notif-overlay');
  if (overlay) _removeOverlay(overlay);
}

export function execConfirm() {
  // 兼容旧调用：执行当前 confirm 的回调（已改为闭包绑定，此函数仅作兼容）
  const overlay = document.querySelector('.siper-notif-overlay');
  if (overlay) _removeOverlay(overlay);
}

// ===== Input 对话框 =====
let _inputCallback = null;

export function showInput(opts) {
  const title = opts.title || '输入';
  const placeholder = opts.placeholder || '';
  const onConfirm = opts.onConfirm || null;
  const multiline = opts.multiline || false;

  const overlay = _createOverlay();
  _inputCallback = onConfirm;

  const box = document.createElement('div');
  box.className = 'siper-notif-dialog siper-notif-input';
  box.innerHTML = `
    <div class="siper-notif-dialog-header">
      <span class="siper-notif-dialog-title">${escapeHtml(title)}</span>
      <button class="siper-notif-dialog-close" aria-label="关闭">×</button>
    </div>
    <div class="siper-notif-dialog-body">
      ${multiline
        ? `<textarea class="siper-notif-input-field" rows="6" placeholder="${escapeHtml(placeholder)}"></textarea>`
        : `<input type="text" class="siper-notif-input-field" placeholder="${escapeHtml(placeholder)}">`
      }
    </div>
    <div class="siper-notif-dialog-footer">
      <button class="siper-notif-btn siper-notif-btn-cancel">取消</button>
      <button class="siper-notif-btn siper-notif-btn-primary">确认</button>
    </div>
  `;

  overlay.appendChild(box);

  const field = box.querySelector('.siper-notif-input-field');
  requestAnimationFrame(() => field.focus());

  const close = () => { _removeOverlay(overlay); _inputCallback = null; };
  box.querySelector('.siper-notif-dialog-close').onclick = close;
  box.querySelector('.siper-notif-btn-cancel').onclick = close;
  box.querySelector('.siper-notif-btn-primary').onclick = () => {
    const val = field.value;
    _removeOverlay(overlay);
    if (_inputCallback) { _inputCallback(val); _inputCallback = null; }
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
}

export function cancelInput() {
  const overlay = document.querySelector('.siper-notif-overlay');
  if (overlay) _removeOverlay(overlay);
  _inputCallback = null;
}

// ===== Form 对话框（多字段）=====
// opts: { title, fields: [{label, placeholder, value, maxlength, id}], onConfirm(values) }
export function showForm(opts) {
  const title = opts.title || '表单';
  const fields = opts.fields || [];
  const onConfirm = opts.onConfirm || null;

  const overlay = _createOverlay();

  const box = document.createElement('div');
  box.className = 'siper-notif-dialog siper-notif-form';

  const fieldHtml = fields.map(f => {
    const id = f.id || ('formField_' + Math.random().toString(36).slice(2, 8));
    f._id = id;
    return `<div class="js-mb-10">`
      + `<label class="js-text-xs">${escapeHtml(f.label)}</label>`
      + `<input type="text" id="${id}" class="siper-notif-input-field" placeholder="${escapeHtml(f.placeholder || '')}" `
      + (f.value ? `value="${escapeHtml(String(f.value))}" ` : '')
      + (f.maxlength ? `maxlength="${f.maxlength}" ` : '')
      + `style="width:100%" aria-label="${escapeHtml(f.label)}">`
      + `</div>`;
  }).join('');

  box.innerHTML = `
    <div class="siper-notif-dialog-header">
      <span class="siper-notif-dialog-title">${escapeHtml(title)}</span>
      <button class="siper-notif-dialog-close" aria-label="关闭">×</button>
    </div>
    <div class="siper-notif-dialog-body">${fieldHtml}</div>
    <div class="siper-notif-dialog-footer">
      <button class="siper-notif-btn siper-notif-btn-cancel">取消</button>
      <button class="siper-notif-btn siper-notif-btn-primary">确认</button>
    </div>
  `;

  overlay.appendChild(box);

  const firstInput = box.querySelector('input');
  requestAnimationFrame(() => { if (firstInput) firstInput.focus(); });

  const close = () => _removeOverlay(overlay);
  box.querySelector('.siper-notif-dialog-close').onclick = close;
  box.querySelector('.siper-notif-btn-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });

  box.querySelector('.siper-notif-btn-primary').onclick = () => {
    const values = {};
    fields.forEach(f => { values[f.id || f._id] = document.getElementById(f._id)?.value?.trim() || ''; });
    _removeOverlay(overlay);
    if (onConfirm) onConfirm(values);
  };

  // Enter on any input submits
  box.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { box.querySelector('.siper-notif-btn-primary').click(); }
    });
  });
}

export function execInput() {
  const overlay = document.querySelector('.siper-notif-overlay');
  const textarea = overlay?.querySelector('.siper-notif-input-field');
  const val = textarea?.value || '';
  _removeOverlay(overlay);
  if (_inputCallback) { _inputCallback(val); _inputCallback = null; }
}

// ===== Dict Modal =====
let _dictModalState = { previousFocus: null };

export function showDictModal(data) {
  // 关闭已存在的
  const existing = document.querySelector('.siper-notif-dict-overlay');
  if (existing) existing.remove();

  _dictModalState.previousFocus = document.activeElement;

  const C = _getThemeColors();
  let rawJson = '';
  try { rawJson = JSON.stringify(data, null, 2); } catch(e) { rawJson = String(data); }

  const overlay = document.createElement('div');
  overlay.className = 'siper-notif-overlay siper-notif-dict-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '99999';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const box = document.createElement('div');
  box.className = 'siper-notif-dict-dialog';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'siper-notif-dict-header';
  hdr.innerHTML = `
    <span class="siper-notif-dict-title">📦 完整响应数据</span>
    <button class="siper-notif-dict-close" aria-label="关闭">✕</button>
  `;
  box.appendChild(hdr);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'siper-notif-dict-toolbar';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'siper-notif-dict-search-wrap';
  searchWrap.innerHTML = `
    <span class="siper-notif-dict-search-icon">🔍</span>
    <input type="text" class="siper-notif-dict-search-input" placeholder="搜索 key 或 value..." aria-label="搜索响应数据">
    <button class="siper-notif-dict-search-clear" aria-label="清除搜索" style="display:none">✕</button>
  `;
  toolbar.appendChild(searchWrap);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'siper-notif-dict-toolbar-btn';
  copyBtn.innerHTML = '📋 复制全部';
  copyBtn.type = 'button';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(rawJson).then(() => {
      copyBtn.innerHTML = '✓ 已复制';
      setTimeout(() => { copyBtn.innerHTML = '📋 复制全部'; }, 1500);
    });
  };
  toolbar.appendChild(copyBtn);

  const modeBtn = document.createElement('button');
  modeBtn.className = 'siper-notif-dict-toolbar-btn';
  modeBtn.innerHTML = '📋 代码';
  modeBtn.type = 'button';
  toolbar.appendChild(modeBtn);
  box.appendChild(toolbar);

  // Content
  const content = document.createElement('div');
  content.className = 'siper-notif-dict-content';

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'siper-notif-dict-scroll';
  content.appendChild(scrollWrap);

  // Structured view
  const structuredWrap = document.createElement('div');
  structuredWrap.className = 'siper-notif-dict-structured';

  const infoItems = [];
  if (data.model) infoItems.push({ type: 'row', label: '模型', value: data.model });
  if (data.processing_time_ms) infoItems.push({ type: 'row', label: '耗时', value: data.processing_time_ms + 'ms' });
  if (data.finish_reason) infoItems.push({ type: 'row', label: '结束原因', value: data.finish_reason });
  if (data.success !== undefined) infoItems.push({ type: 'row', label: '状态', value: data.success ? '✓ 成功' : '✗ 失败' });
  if (data.skills_used?.length) infoItems.push({ type: 'row', label: 'Skills', value: data.skills_used.join(', ') });
  if (data.attachments?.length) infoItems.push({ type: 'row', label: '附件', value: data.attachments.length + ' 个' });
  structuredWrap.appendChild(_buildDictSection('📋', '响应信息', infoItems, C));

  if (data.usage && Object.keys(data.usage).length > 0) {
    const usageItems = [];
    if (data.usage.prompt_tokens) usageItems.push({ type: 'row', label: 'Prompt', value: String(data.usage.prompt_tokens) });
    if (data.usage.completion_tokens) usageItems.push({ type: 'row', label: 'Completion', value: String(data.usage.completion_tokens) });
    if (data.usage.total_tokens) usageItems.push({ type: 'row', label: 'Total', value: String(data.usage.total_tokens) });
    structuredWrap.appendChild(_buildDictSection('📊', 'Token 用量', usageItems, C));
  }

  if (data.tool_call_steps?.length) {
    const toolItems = data.tool_call_steps.map(step => ({
      type: 'tool_step',
      name: step.tool_name || '',
      statusIcon: step.success ? '<span style="color:' + C.primary + '">✓</span>' : '<span style="color:' + C.danger + '">✗</span>',
      duration: step.duration_ms ? step.duration_ms + 'ms' : '',
      params: step.parameters ? (typeof step.parameters === 'string' ? step.parameters : JSON.stringify(step.parameters)) : '',
      result: step.result ? (typeof step.result === 'string' ? step.result : JSON.stringify(step.result)) : '',
      open: false,
    }));
    structuredWrap.appendChild(_buildDictSection('🔧', '工具调用 (' + data.tool_call_steps.length + ')', toolItems, C));
  }

  scrollWrap.appendChild(structuredWrap);

  // Code view (hidden)
  const codeWrap = document.createElement('div');
  codeWrap.className = 'siper-notif-dict-code-wrap';
  codeWrap.style.display = 'none';
  codeWrap.appendChild(_renderCodeView(data, C));
  scrollWrap.appendChild(codeWrap);

  // Mode toggle
  let currentMode = 'structured';
  modeBtn.onclick = () => {
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
  };

  // Search
  const searchInput = searchWrap.querySelector('.siper-notif-dict-search-input');
  const clearBtn = searchWrap.querySelector('.siper-notif-dict-search-clear');
  searchInput.oninput = () => {
    const q = searchInput.value.toLowerCase().trim();
    clearBtn.style.display = q ? '' : 'none';
    if (!q) { scrollWrap.querySelectorAll('.siper-notif-dict-sec').forEach(el => el.style.display = ''); return; }
    scrollWrap.querySelectorAll('.siper-notif-dict-sec').forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  };
  clearBtn.onclick = () => { searchInput.value = ''; clearBtn.style.display = 'none'; scrollWrap.querySelectorAll('.siper-notif-dict-sec').forEach(el => el.style.display = ''); };

  box.appendChild(content);
  overlay.appendChild(box);

  // Events
  const close = () => {
    _removeOverlay(overlay);
    if (_dictModalState.previousFocus) { _dictModalState.previousFocus.focus(); _dictModalState.previousFocus = null; }
  };
  hdr.querySelector('.siper-notif-dict-close').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('siper-notif-overlay-in'));
  requestAnimationFrame(() => searchInput.focus());
}

// ===== Image Lightbox =====
export function openImageLightbox(src, name) {
  const existing = document.querySelector('.siper-notif-img-lightbox');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'siper-notif-overlay siper-notif-img-lightbox';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '99999';

  const box = document.createElement('div');
  box.className = 'siper-notif-img-box';
  box.innerHTML = `
    <button class="siper-notif-img-close" aria-label="关闭">✕</button>
    <img src="${src}" alt="${name || ''}" class="siper-notif-img">
    ${name ? `<div class="siper-notif-img-caption">${name}</div>` : ''}
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('siper-notif-overlay-in'));

  const close = () => _removeOverlay(overlay);
  box.querySelector('.siper-notif-img-close').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
}

export function closeImageLightbox() {
  const lb = document.querySelector('.siper-notif-img-lightbox');
  if (lb) _removeOverlay(lb);
}

// ===== 删除模型确认 =====
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

// ===== 内部辅助函数 =====
function _getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    text: s.getPropertyValue('--color-text').trim(),
    textDim: s.getPropertyValue('--color-text-dim').trim(),
    primary: s.getPropertyValue('--color-primary').trim(),
    danger: s.getPropertyValue('--color-danger').trim(),
    warning: s.getPropertyValue('--color-warning').trim(),
    surface: s.getPropertyValue('--color-surface').trim(),
    bg: s.getPropertyValue('--color-bg').trim(),
    border: s.getPropertyValue('--color-border').trim(),
    hover: s.getPropertyValue('--color-hover').trim(),
  };
}

// _esc removed — use escapeHtml() from utils/escape.js (handles quotes too)

function _buildDictSection(icon, label, items, C) {
  const sec = document.createElement('div');
  sec.className = 'siper-notif-dict-sec';

  const head = document.createElement('button');
  head.className = 'siper-notif-dict-sec-head';
  head.setAttribute('aria-expanded', 'true');
  head.type = 'button';

  const arrow = document.createElement('span');
  arrow.className = 'siper-notif-dict-arrow';
  arrow.textContent = '▶';
  arrow.setAttribute('aria-hidden', 'true');
  head.appendChild(arrow);

  const iconEl = document.createElement('span');
  iconEl.textContent = icon;
  iconEl.setAttribute('aria-hidden', 'true');
  head.appendChild(iconEl);

  const labelEl = document.createElement('span');
  labelEl.className = 'siper-notif-dict-sec-label';
  labelEl.textContent = label;
  head.appendChild(labelEl);
  sec.appendChild(head);

  const body = document.createElement('div');
  body.className = 'siper-notif-dict-sec-body';

  if (!items?.length) {
    body.innerHTML = '<div class="siper-notif-dict-empty">(empty)</div>';
  } else {
    body.innerHTML = items.map(item => {
      if (item.type === 'row') {
        return `<div class="siper-notif-dict-info-row">`
          + `<span class="siper-notif-dict-info-label">${escapeHtml(item.label)}</span>`
          + `<span class="siper-notif-dict-info-value">${escapeHtml(item.value)}</span>`
          + `</div>`;
      }
      if (item.type === 'tool_step') {
        return `<div class="siper-notif-dict-tool-step">`
          + `<button class="siper-notif-dict-tool-head" type="button" aria-expanded="${item.open}">`
          + `<span class="siper-notif-dict-arrow" style="${item.open ? 'transform:rotate(90deg)' : ''}" aria-hidden="true">▶</span>`
          + item.statusIcon
          + `<span class="siper-notif-dict-tool-name">${escapeHtml(item.name)}</span>`
          + (item.duration ? `<span class="siper-notif-dict-tool-dur">${escapeHtml(item.duration)}</span>` : '')
          + `</button>`
          + `<div class="siper-notif-dict-tool-body" style="${item.open ? '' : 'display:none'}">`
          + (item.params ? `<div class="siper-notif-dict-tool-params">${escapeHtml(item.params)}</div>` : '')
          + (item.result ? `<div class="siper-notif-dict-tool-result">${escapeHtml(item.result)}</div>` : '')
          + `</div></div>`;
      }
      return '';
    }).join('');
  }
  sec.appendChild(body);

  let isOpen = true;
  head.onclick = () => {
    isOpen = !isOpen;
    body.style.display = isOpen ? '' : 'none';
    arrow.style.transform = isOpen ? 'rotate(90deg)' : '';
    head.setAttribute('aria-expanded', String(isOpen));
  };

  return sec;
}

function _renderValue(val, indent, C) {
  const pad = '  '.repeat(indent);
  const nextPad = '  '.repeat(indent + 1);
  if (val === null) return `<span style="color:${C.textDim};font-style:italic">null</span>`;
  if (val === undefined) return `<span style="color:${C.textDim};font-style:italic">undefined</span>`;
  const t = typeof val;
  if (t === 'string') {
    const s = escapeHtml(val);
    if (/^https?:\/\//.test(val)) return `<span class="siper-notif-dict-link" data-url="${s}">${s}</span>`;
    return `<span style="color:${C.primary}">"${s}"</span>`;
  }
  if (t === 'number') return `<span style="color:${C.text};font-weight:500">${escapeHtml(val)}</span>`;
  if (t === 'boolean') return `<span style="color:${C.danger};font-weight:600">${escapeHtml(val)}</span>`;
  if (t === 'object') {
    if (Array.isArray(val)) {
      if (val.length === 0) return `<span style="color:${C.textDim}">[]</span>`;
      const items = val.map((v, i) =>
        `${nextPad}<span style="color:${C.textDim};font-size:12px;font-weight:500">#${i}</span> ${_renderValue(v, indent + 1, C)}`
      );
      return `<span style="color:${C.textDim}">[</span>\n${items.join(',\n')}\n${pad}<span style="color:${C.textDim}">]</span>`;
    }
    const keys = Object.keys(val);
    if (keys.length === 0) return `<span style="color:${C.textDim}">{}</span>`;
    const items = keys.map(k => {
      const keyHtml = `<span style="color:${C.primary}">"${escapeHtml(k)}"</span>`;
      const valHtml = _renderValue(val[k], indent + 1, C);
      return `${nextPad}${keyHtml}<span style="color:${C.textDim}">: </span>${valHtml}`;
    });
    return `<span style="color:${C.textDim}">{</span>\n${items.join(',\n')}\n${pad}<span style="color:${C.textDim}">}</span>`;
  }
  return escapeHtml(val);
}

function _renderCodeView(obj, C) {
  const pre = document.createElement('pre');
  pre.className = 'siper-notif-dict-code-view';
  pre.innerHTML = _renderValue(obj, 0, C);
  return pre;
}

// Expose to global scope
if (typeof window !== 'undefined') {
  window.toast = toast;
  window.showConfirm = showConfirm;
  window.cancelConfirm = cancelConfirm;
  window.execConfirm = execConfirm;
  window.showInput = showInput;
  window.cancelInput = cancelInput;
  window.execInput = execInput;
  window.showDictModal = showDictModal;
  window.openImageLightbox = openImageLightbox;
  window.closeImageLightbox = closeImageLightbox;
  window.confirmDeleteModel = confirmDeleteModel;
  window.showForm = showForm;
}