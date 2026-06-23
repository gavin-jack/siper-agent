// chat-pages/directory.js — 项目目录独立页面
// 优先从 page_cache 读取，后端推送时自动刷新

import { escapeHtml } from '../../utils/escape.js?v=1782233785732';

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('directory', function(data) {
    if (data.tree) _renderTree(data.tree);
  });
}

export function renderDirectoryPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="page-header">
  <h3>📁 项目目录</h3>
  <button class="siper-btn" id="dirRefreshBtn" onclick="window._dirRefresh()">刷新</button>
</div>
<div class="page-body">
  <div id="dirTree" class="siper-dir-tree">加载中...</div>
</div>`;
  _loadDirectory();
}

function _fmtSize(kb) {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return kb.toFixed(1) + ' KB';
}

function _loadDirectory() {
  const treeEl = document.getElementById('dirTree');
  if (!treeEl) return;
  treeEl.innerHTML = '<div class="siper-loading siper-loading--sm">加载中...</div>';
  // 优先从 page_cache 读取
  const cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('directory') : null;
  if (cached && cached.tree) {
    _renderTree(cached.tree);
    return;
  }
  fetch('/api/project-structure').then(r => r.json()).then(data => {
    if (!data || (!data.dirs && !data.files)) {
      treeEl.innerHTML = '<div style="padding:20px;color:var(--color-error-text)">加载失败</div>';
      return;
    }
    _renderTree(data);
  }).catch(() => {
    treeEl.innerHTML = '<div style="padding:20px;color:var(--color-error-text)">加载失败，请刷新重试</div>';
  });
}

function _renderTree(data) {
  const treeEl = document.getElementById('dirTree');
  if (!treeEl) return;
  let html = '';
    // Directories
    if (data.dirs && data.dirs.length > 0) {
      html += '<div class="siper-dir-section"><div class="siper-dir-section-title">📂 目录</div>';
      data.dirs.forEach(d => {
        html += `<div class="siper-dir-item">
          <span class="siper-dir-icon">📂</span>
          <span class="siper-dir-name">${escapeHtml(d.name)}/</span>
          <span class="siper-dir-meta">${d.count} 个文件</span>
          <span class="siper-dir-size">${_fmtSize(d.size_kb)}</span>
        </div>`;
      });
      html += '</div>';
    }
    // Root files
    if (data.files && data.files.length > 0) {
      html += '<div class="siper-dir-section"><div class="siper-dir-section-title">📄 根目录文件</div>';
      data.files.forEach(f => {
        const icon = f.name.endsWith('.py') ? '🐍' : f.name.endsWith('.md') ? '📝' : f.name.endsWith('.json') ? '📋' : f.name.endsWith('.sh') ? '⚡' : '📄';
        html += `<div class="siper-dir-item">
          <span class="siper-dir-icon">${icon}</span>
          <span class="siper-dir-name">${escapeHtml(f.name)}</span>
          <span class="siper-dir-meta"></span>
          <span class="siper-dir-size">${_fmtSize(f.size_kb)}</span>
        </div>`;
      });
      html += '</div>';
    }
    treeEl.innerHTML = html;
}

window._dirRefresh = function() {
  _loadDirectory();
};
