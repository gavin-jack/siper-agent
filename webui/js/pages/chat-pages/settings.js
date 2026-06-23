// chat-pages/settings.js — 全局设置页面（系统参数 + Agent 管理）
import { t } from '../../utils/i18n.js?v=1782239267972';

// ── 模板函数 ──────────────────────────────────────────

function _tplSettingsPage() {
  return '<div class="siper-page-toolbar js-toolbar-flex-wrap">' +
    '<div class="siper-settings-tabs" id="settingsTabs">' +
    '<button class="siper-settings-tab active" data-tab="system" onclick="window.switchSettingsTab(\'system\')">' + t('settings.systemTab') + '</button>' +
    '<button class="siper-settings-tab" data-tab="agents" onclick="window.switchSettingsTab(\'agents\')">' + t('settings.agentTab') + '</button>' +
    '</div>' +
    '<div class="js-flex-shrink-0">' +
    '<button class="siper-btn" onclick="window.resetSystemParams()">' + t('settings.reset') + '</button>' +
    '<button class="siper-btn" onclick="window.refreshGlobalSettings()">' + t('settings.refresh') + '</button>' +
    '</div></div>' +
    '<div id="chatGlobalSettings">' +
    '<div id="chatSystemSettings" class="js-hidden">' +
    '<div class="siper-settings-section">' +
    '<div class="siper-settings-section-title">' + t('settings.runtime') + '</div>' +
    _settingRow('sysWsHeartbeatTimeout', t('settings.wsHeartbeat'), 60, 3600, 300) +
    _settingRow('sysSessionListLimit', t('settings.sessionLimit'), 10, 500, 50) +
    _settingRow('sysLogBufferSize', t('settings.logBuffer'), 100, 10000, 2000) +
    _settingRow('sysTokenUsageMax', t('settings.tokenMax'), 100, 5000, 500) +
    _settingRow('sysCtxWindowDefault', t('settings.ctxWindow'), 1024, 1000000, 8192) +
    '</div></div></div>' +
    '<div id="chatGlobalAgents" class="js-hidden">' +
    '<div class="js-header-flex">' +
    '<div class="siper-settings-section-title js-m-0">' + t('settings.agentManagement') + '</div>' +
    '<button class="siper-btn primary js-add-agent-btn" onclick="window.showAddAgentModal()">+ ' + t('settings.addAgent') + '</button>' +
    '</div>' +
    '<div id="globalAgentCards" class="agent-cards-grid"></div>' +
    '<div id="globalAgentCardDetail" class="agent-card-detail"></div>' +
    '</div></div>';
}

function _settingRow(id, label, min, max, def) {
  return '<div class="siper-settings-row"><label>' + label + '</label>' +
    '<input type="number" id="' + id + '" class="siper-input" min="' + min + '" max="' + max + '" value="' + def + '" aria-label="' + label + '"></div>';
}

// ── Tab 切换 ──────────────────────────────────────────

export function switchSettingsTab(tab) {
  var tabs = document.querySelectorAll('#settingsTabs .siper-settings-tab');
  tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  var sysEl = document.getElementById('chatSystemSettings');
  var agentEl = document.getElementById('chatGlobalAgents');
  if (sysEl) sysEl.classList.toggle('js-hidden', tab !== 'system');
  if (agentEl) agentEl.classList.toggle('js-hidden', tab !== 'agents');
  window._currentSettingsTab = tab;
  if (location.hash !== '#/global-settings?tab=' + tab) {
    history.replaceState(null, '', '#/global-settings?tab=' + tab);
  }
}

// ── 页面渲染入口 ──────────────────────────────────────

export function renderSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content page-settings';
  container.innerHTML = _tplSettingsPage();
  window._currentSettingsTab = 'system';
  _attachSettingsAutoSave();
  var sysEl = document.getElementById('chatSystemSettings');
  if (sysEl) sysEl.classList.remove('js-hidden');
  if (typeof window.refreshGlobalSettings === 'function') window.refreshGlobalSettings();
  _populateSettingsFields();
  if (typeof window.renderGlobalAgents === 'function') window.renderGlobalAgents();
}

// ── 系统参数 auto-save ────────────────────────────────

function _attachSettingsAutoSave() {
  var timer = null;
  var fields = ['sysWsHeartbeatTimeout', 'sysSessionListLimit', 'sysLogBufferSize', 'sysTokenUsageMax', 'sysCtxWindowDefault', 'sysPort', 'sysLogLevel'];
  function doSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async function() {
      var sys = {
        ws_heartbeat_timeout: parseInt(document.getElementById('sysWsHeartbeatTimeout').value) || 300,
        session_list_limit: parseInt(document.getElementById('sysSessionListLimit').value) || 50,
        log_buffer_size: parseInt(document.getElementById('sysLogBufferSize').value) || 2000,
        token_usage_max: parseInt(document.getElementById('sysTokenUsageMax').value) || 500,
        context_window_default: parseInt(document.getElementById('sysCtxWindowDefault').value) || 8192,
        port: parseInt(document.getElementById('sysPort')?.value) || 9724,
        log_level: document.getElementById('sysLogLevel')?.value || 'INFO',
      };
      try {
        var r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: sys }) });
        var d = await r.json();
        if (d.success) { if (typeof toast !== 'undefined' && toast) toast.success(t('settings.saved')); }
        else { if (typeof toast !== 'undefined' && toast) toast.error(t('settings.saveFailed') + ': ' + (d.error || 'unknown')); }
      } catch (e) { if (typeof toast !== 'undefined' && toast) toast.error(t('settings.saveFailed') + ': ' + e.message); }
    }, 500);
  }
  fields.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener('input', doSave); if (el.tagName === 'SELECT') el.addEventListener('change', doSave); }
  });
}

// ── 重置 & 刷新 ──────────────────────────────────────

export function resetSystemParams() {
  var defaults = { sysWsHeartbeatTimeout: 300, sysSessionListLimit: 50, sysLogBufferSize: 2000, sysTokenUsageMax: 500, sysCtxWindowDefault: 8192 };
  for (var id in defaults) { var el = document.getElementById(id); if (el) el.value = defaults[id]; }
  if (typeof toast !== 'undefined' && toast) toast.success(t('settings.resetDone'));
}

export function refreshGlobalSettings() {
  _populateSettingsFields();
  if (window.renderGlobalAgents) window.renderGlobalAgents();
}

function _populateSettingsFields() {
  fetch('/api/config').then(function(r) { return r.json(); }).then(function(data) {
    var sys = data.system || {};
    var fields = { sysWsHeartbeatTimeout: sys.ws_heartbeat_timeout, sysSessionListLimit: sys.session_list_limit, sysLogBufferSize: sys.log_buffer_size, sysTokenUsageMax: sys.token_usage_max, sysCtxWindowDefault: sys.context_window_default };
    for (var id in fields) { var el = document.getElementById(id); if (el && fields[id] != null) el.value = fields[id]; }
  }).catch(function(e) { console.error('[settings] _populateSettingsFields failed:', e); });
}
