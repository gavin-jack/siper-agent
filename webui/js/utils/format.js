// utils/format.js — 统一格式化工具
// 消除 token.js / monitor.js / skills.js / directory.js 中的重复格式化函数

/**
 * 格式化数字（带 K/M 后缀）
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function fmtNum(n) {
  if (n == null) return '--';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

/**
 * 格式化文件大小（KB → MB）
 * @param {number} kb
 * @returns {string}
 */
export function fmtSize(kb) {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return kb.toFixed(1) + ' KB';
}

/**
 * 格式化时间戳为本地时间字符串
 * @param {number|string} ts — 时间戳或 ISO 字符串
 * @returns {string} 如 "14:30" 或 "06-22 14:30"
 */
export function fmtTime(ts) {
  if (!ts) return '--';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return '--';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  if (isToday) return h + ':' + m;
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return mo + '-' + day + ' ' + h + ':' + m;
}

/**
 * 格式化速度（返回 CSS class + 标签文本）
 * @param {number} ms — 毫秒
 * @returns {{ cls: string, label: string }}
 */
export function fmtSpeed(ms) {
  if (!ms || ms <= 0) return { cls: '', label: '' };
  if (ms < 500) {
    const label = ms < 100 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
    return { cls: 'speed-fast', label };
  }
  if (ms < 1500) {
    return { cls: 'speed-medium', label: (ms / 1000).toFixed(1) + 's' };
  }
  return { cls: 'speed-slow', label: (ms / 1000).toFixed(1) + 's' };
}
