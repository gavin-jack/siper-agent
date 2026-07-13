// chat/toast.js — Toast/Confirm 封装
import { toast, showConfirm } from '../components/toast.js?v=1783954506464';

export function showChatToast(message, type, duration) {
  const fn = type === 'error' ? toast.error.bind(toast) : type === 'warning' ? toast.warning.bind(toast) : type === 'success' ? toast.success.bind(toast) : toast.info.bind(toast);
  if (duration) fn(message, duration);
  else fn(message);
}

export function chatConfirm(opts) {
  if (typeof showConfirm === 'function') {
    showConfirm(opts);
  }
}

// Re-export showDictModal for convenience
export { showDictModal } from '../components/toast.js?v=1783954506464';