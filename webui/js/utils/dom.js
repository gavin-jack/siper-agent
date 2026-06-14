// utils/dom.js — 纯 UI 工具函数（已迁移到 core.js/renderer.js 的函数不再保留）

import { escapeHtml } from './escape.js';

import { t, currentLang } from './i18n.js';
import { getWs, setWs } from '../core.js';
import { ensureSessionReady, setIsSending, setChatSessionId, chatSessionId, chatCurrentAgent, chatAgents, chatExpandedAgents, chatModelContextWindow, markSessionReady, setIsThinking, updateStreamingBadge } from '../chat/state.js';
import { resetSendState, updateSessionPreview } from '../chat/session.js';
import { chatHandleStreamDelta, chatHandleStreamEnd } from '../chat/stream.js';
import { chatThinkingClear, chatThinkingHide } from '../chat/thinking.js';

// ===== Clarify Response =====
// Send user's clarification answer back to the server during tool-call ambiguity
export function _sendClarifyResponse(sessionId, answer) {
  // Get ws from core.js
  const ws = (typeof getWs === 'function') ? getWs() : null;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type: 'clarify_response', session_id: sessionId, answer: answer}));
  }
  setIsSending(false);
  const _sb = document.getElementById('chatSendBtn');
  if (_sb) _sb.disabled = false;
}

// ===== Logging =====
export function addLog(level, message, lang) {
  const list = document.getElementById('logsList');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'log-entry ' + (level || 'info');
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.innerHTML = `<span class="time">${time}</span>${escapeHtml(message || '')}`;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

// ===== Sidebar =====
export function toggleChatSidebar() {
  const sidebar = document.getElementById('chatSidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('expanded');
  const expanded = sidebar.classList.contains('expanded');
  try { localStorage.setItem('siper_sidebar_expanded', expanded ? '1' : '0'); } catch(e) {}
  const labels = sidebar.querySelectorAll('.siper-nav-item-label');
  labels.forEach(l => { l.style.display = expanded ? '' : 'none'; });
  const brand = sidebar.querySelector('.siper-sidebar-brand');
  if (brand) brand.style.display = expanded ? '' : 'none';
}

// ===== Avatar =====
export function getAvatarHtml(cls) {
  if (cls === 'agent') {
    return `<img class="msg-avatar-img" src="${typeof agentAvatarUrl !== 'undefined' ? agentAvatarUrl : '/static/default_avatar.webp'}" alt="Agent" onerror="this.src='/static/default_avatar_256.png'">`;
  } else if (cls === 'user') {
    return `<div class="msg-avatar">👤</div>`;
  }
  return '';
}

// ===== Notification Sound =====
let _audioCtx = null;  // Web Audio context — lazily initialized by playReplySound()

export function playReplySound() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    // Two-tone chime: C5 -> E5
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });
  } catch(e) {}
}

// ===== Language =====
export function selectChatLangAndSave(lang) {
  if (lang) {
    localStorage.setItem('siper_lang', lang);
    location.reload();
  } else {
    const menu = document.getElementById('chatLangMenu');
    if (menu) menu.classList.toggle('show');
  }
}

// ===== Theme Sidebar =====
export function applySidebarTheme(presetKey) {
  const presets = {
    light: {
      '--bg': '#c8ebe5', '--bg-sidebar': '#b8ddd6', '--bg-card': '#ddf0ec',
      '--bg-hover': '#a8d5cc', '--border': '#8bbfb5', '--text': '#0a1f1a',
      '--text-dim': '#3a6b5e', '--accent': '#2d9e8a', '--accent2': '#6b5ca8',
      '--green': '#2d9e6a', '--red': '#c0392b', '--yellow': '#b7950b',
      '--orange': '#ca6f1e', '--cyan': '#1abc9c',
      '--agent-msg-bg': '#ddf0ec', '--agent-msg-border': '#8bbfb5', '--agent-msg-text': '#0a1f1a',
      '--user-msg-bg': '#2d9e8a', '--user-msg-text': '#ffffff',
    },
    dark: {
      '--bg': '#0d1117', '--bg-sidebar': '#161b22', '--bg-card': '#1c2333',
      '--bg-hover': '#242d3d', '--border': '#30363d', '--text': '#e6edf3',
      '--text-dim': '#8b949e', '--accent': '#58a6ff', '--accent2': '#a371f7',
      '--green': '#3fb950', '--red': '#f85149', '--yellow': '#d29922',
      '--orange': '#f0883e', '--cyan': '#39d2c0',
      '--agent-msg-bg': '#1c2333', '--agent-msg-border': '#30363d', '--agent-msg-text': '#e6edf3',
      '--user-msg-bg': '#1a3a5c', '--user-msg-text': '#cce0ff',
    },
    sunset: {
      '--bg': '#fefae0', '--bg-sidebar': '#faedcd', '--bg-card': '#fefae0',
      '--bg-hover': '#e9c46a', '--border': '#dda15e', '--text': '#3a2d1e',
      '--text-dim': '#8b6f47', '--accent': '#e63946', '--accent2': '#f4a261',
      '--green': '#2a9d8f', '--red': '#e63946', '--yellow': '#e9c46a',
      '--orange': '#f4a261', '--cyan': '#48cae4',
      '--agent-msg-bg': '#faedcd', '--agent-msg-border': '#dda15e', '--agent-msg-text': '#3a2d1e',
      '--user-msg-bg': '#e63946', '--user-msg-text': '#ffffff',
    },
    forest: {
      '--bg': '#1b4332', '--bg-sidebar': '#0b2618', '--bg-card': '#2d6a4f',
      '--bg-hover': '#40916c', '--border': '#52b788', '--text': '#d8f3dc',
      '--text-dim': '#95d5b2', '--accent': '#40916c', '--accent2': '#74c69d',
      '--green': '#52b788', '--red': '#e63946', '--yellow': '#ffd166',
      '--orange': '#f4a261', '--cyan': '#48cae4',
      '--agent-msg-bg': '#2d6a4f', '--agent-msg-border': '#52b788', '--agent-msg-text': '#d8f3dc',
      '--user-msg-bg': '#40916c', '--user-msg-text': '#ffffff',
    },
    rose: {
      '--bg': '#fff0f3', '--bg-sidebar': '#ffe3e8', '--bg-card': '#fff0f3',
      '--bg-hover': '#ffc2d1', '--border': '#ffb3c6', '--text': '#3a0ca3',
      '--text-dim': '#7209b7', '--accent': '#e85d75', '--accent2': '#f72585',
      '--green': '#4cc9f0', '--red': '#f72585', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#4cc9f0',
      '--agent-msg-bg': '#ffe3e8', '--agent-msg-border': '#ffb3c6', '--agent-msg-text': '#3a0ca3',
      '--user-msg-bg': '#e85d75', '--user-msg-text': '#ffffff',
    },
    midnight: {
      '--bg': '#0a0a1a', '--bg-sidebar': '#12122a', '--bg-card': '#1a1a3e',
      '--bg-hover': '#2a2a5e', '--border': '#3a3a7e', '--text': '#e0e0ff',
      '--text-dim': '#9090cc', '--accent': '#7b2ff7', '--accent2': '#c77dff',
      '--green': '#06d6a0', '--red': '#ef476f', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#06d6a0',
      '--agent-msg-bg': '#1a1a3e', '--agent-msg-border': '#3a3a7e', '--agent-msg-text': '#e0e0ff',
      '--user-msg-bg': '#2a1a5e', '--user-msg-text': '#e0e0ff',
    },
    sakura: {
      '--bg': '#fff5f8', '--bg-sidebar': '#ffe8f0', '--bg-card': '#fff0f5',
      '--bg-hover': '#ffd6e8', '--border': '#ffb3d9', '--text': '#4a1942',
      '--text-dim': '#8b4b76', '--accent': '#ff69b4', '--accent2': '#c9184a',
      '--green': '#52b788', '--red': '#c9184a', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#48cae4',
      '--agent-msg-bg': '#ffe8f0', '--agent-msg-border': '#ffb3d9', '--agent-msg-text': '#4a1942',
      '--user-msg-bg': '#ff69b4', '--user-msg-text': '#ffffff',
    },
    slate: {
      '--bg': '#1e293b', '--bg-sidebar': '#0f172a', '--bg-card': '#334155',
      '--bg-hover': '#475569', '--border': '#64748b', '--text': '#e2e8f0',
      '--text-dim': '#94a3b8', '--accent': '#475569', '--accent2': '#64748b',
      '--green': '#10b981', '--red': '#ef4444', '--yellow': '#f59e0b',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#334155', '--agent-msg-border': '#64748b', '--agent-msg-text': '#e2e8f0',
      '--user-msg-bg': '#475569', '--user-msg-text': '#ffffff',
    },
    black: {
      '--bg': '#000000', '--bg-sidebar': '#0a0a0a', '--bg-card': '#141414',
      '--bg-hover': '#1f1f1f', '--border': '#2a2a2a', '--text': '#e5e5e5',
      '--text-dim': '#737373', '--accent': '#3b82f6', '--accent2': '#60a5fa',
      '--green': '#22c55e', '--red': '#ef4444', '--yellow': '#eab308',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#141414', '--agent-msg-border': '#2a2a2a', '--agent-msg-text': '#e5e5e5',
      '--user-msg-bg': '#1e3a5f', '--user-msg-text': '#dbeafe',
    },
  };
  const preset = presets[presetKey];
  if (!preset) return;
  Object.keys(preset).forEach(k => document.documentElement.style.setProperty(k, preset[k]));
  const saved = {};
  Object.keys(preset).forEach(k => saved[k] = preset[k]);
  saved._preset = presetKey;
  localStorage.setItem('siper_theme', JSON.stringify(saved));
  updateThemePaletteTrigger(presetKey);
  document.documentElement.dispatchEvent(new CustomEvent('siper-theme-changed'));
}

// ===== Theme Palette UI =====
const PALETTE_PRESETS = {
  light: { label: '清新绿', bg: '#c8ebe5', accent: '#2d9e8a', sidebar: '#b8ddd6' },
  dark: { label: '暗夜', bg: '#0d1117', accent: '#58a6ff', sidebar: '#161b22' },
  sunset: { label: '日落', bg: '#fefae0', accent: '#e63946', sidebar: '#faedcd' },
  forest: { label: '森林', bg: '#1b4332', accent: '#40916c', sidebar: '#0b2618' },
  rose: { label: '玫瑰', bg: '#fff0f3', accent: '#e85d75', sidebar: '#ffe3e8' },
  midnight: { label: '午夜', bg: '#0a0a1a', accent: '#7b2ff7', sidebar: '#12122a' },
  sakura: { label: '樱花', bg: '#fff5f8', accent: '#ff69b4', sidebar: '#ffe8f0' },
  slate: { label: '石板', bg: '#1e293b', accent: '#475569', sidebar: '#0f172a' },
  black: { label: '纯黑', bg: '#000000', accent: '#3b82f6', sidebar: '#0a0a0a' },
};

export function updateThemePaletteTrigger(presetKey) {
  const trigger = document.getElementById('themePaletteTrigger');
  const preset = PALETTE_PRESETS[presetKey];
  if (trigger && preset) {
    trigger.style.background = `linear-gradient(135deg, ${preset.bg} 33%, ${preset.accent} 33% 66%, ${preset.sidebar} 66%)`;
    trigger.title = preset.label;
  }
}

export function buildThemePaletteMenu() {
  const menu = document.getElementById('themePaletteMenu');
  if (!menu) return;
  menu.innerHTML = '';
  Object.keys(PALETTE_PRESETS).forEach(key => {
    const preset = PALETTE_PRESETS[key];
    const item = document.createElement('div');
    item.className = 'theme-palette-item';
    item.dataset.key = key;
    const swatch = document.createElement('span');
    swatch.className = 'theme-palette-swatch';
    swatch.style.background = `linear-gradient(135deg, ${preset.bg} 33%, ${preset.accent} 33% 66%, ${preset.sidebar} 66%)`;
    item.appendChild(swatch);
    const label = document.createElement('span');
    label.textContent = preset.label;
    item.appendChild(label);
    item.onclick = () => { applySidebarTheme(key); closeThemePalette(); };
    menu.appendChild(item);
  });
}

export function toggleThemePalette() {
  const menu = document.getElementById('themePaletteMenu');
  if (!menu) return;
  if (menu.classList.contains('open')) {
    closeThemePalette();
  } else {
    buildThemePaletteMenu();
    let currentKey = '';
    try { currentKey = JSON.parse(localStorage.getItem('siper_theme') || '{}')._preset || ''; } catch(e) {}
    menu.querySelectorAll('.theme-palette-item').forEach(item => {
      item.classList.toggle('active', item.dataset.key === currentKey);
    });
    menu.classList.add('open');
  }
}

export function closeThemePalette() {
  const menu = document.getElementById('themePaletteMenu');
  if (menu) menu.classList.remove('open');
}
