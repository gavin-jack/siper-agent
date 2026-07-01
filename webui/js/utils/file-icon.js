// utils/file-icon.js — 统一文件图标映射
// 从 chat/input.js 提取，供 input.js 和 directory.js 共享

const FILE_ICONS = {
  // Images
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️', svg: '🖼️', ico: '🖼️',
  tiff: '🖼️', tif: '🖼️', heic: '🖼️', heif: '🖼️', raw: '📷', cr2: '📷', nef: '📷',
  // Documents
  pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
  txt: '📃', md: '📝', rtf: '📄', csv: '📊',
  // Code
  py: '🐍', js: '📜', ts: '📜', jsx: '⚛️', tsx: '⚛️', html: '🌐', css: '🎨',
  json: '📋', yaml: '⚙️', yml: '⚙️', toml: '⚙️', ini: '⚙️', cfg: '⚙️',
  sh: '⚡', bash: '⚡', zsh: '⚡', bat: '⚡', ps1: '⚡',
  // Archives
  zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦', bz2: '📦',
  // Media
  mp3: '🎵', wav: '🎵', flac: '🎵', mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬',
  // Data
  db: '🗃️', sqlite: '🗃️', sql: '🗃️',
};

const OTHER_EXT_BADGES = {
  exe: '⚡', msi: '⚡', torrent: '🔗', url: '🔗', lnk: '🔗',
  ttf: '🔤', otf: '🔤',
};

const CAT_FALLBACK = {
  image: '🖼️', document: '📄', code: '💻', archive: '📦',
  audio: '🎵', video: '🎬', other: '📎',
};

/**
 * Get icon for a file by extension and category
 * @param {string?} ext - File extension (without dot), lowercase
 * @param {string?} category - File category: image|document|archive|code|media|other
 * @returns {string} Icon emoji (defaults to '📄')
 */
export function getFileIcon(ext, category) {
  if (!ext) return CAT_FALLBACK[category] || CAT_FALLBACK.other;
  ext = ext.toLowerCase();
  return FILE_ICONS[ext] || OTHER_EXT_BADGES[ext] || CAT_FALLBACK[category] || CAT_FALLBACK.other;
}

// Also export maps for reference
export { FILE_ICONS, OTHER_EXT_BADGES, CAT_FALLBACK };
