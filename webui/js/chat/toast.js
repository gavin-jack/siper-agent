// chat/toast.js — Toast/Confirm 封装
import { showDictModal } from '../components/toast.js';

export function showChatToast(message, type, duration) {
  if (window.toast) {
    const fn = type === 'error' ? window.toast.error.bind(window.toast) : type === 'warning' ? window.toast.warning.bind(window.toast) : type === 'success' ? window.toast.success.bind(window.toast) : window.toast.info.bind(window.toast);
    if (duration) fn(message, duration);
    else fn(message);
  }
}

export function chatConfirm(opts) {
  if (typeof window.showConfirm === 'function') {
    window.showConfirm(opts);
  }
}

// Re-export showDictModal for convenience
export { showDictModal };
