// utils/escape.js — HTML 转义
const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>\"']/g, c => _ESC_MAP[c]);
}
