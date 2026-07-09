// chat-pages/directory.js — 项目目录独立页面
import { escapeHtml } from '../../utils/escape.js?v=1783612457431';
import { fmtSize } from '../../utils/format.js?v=1783612457431';
import { apiGetCached } from '../../utils/api.js?v=1783612457431';

// 注册 page_cache 回调
if (typeof window.__onPageCacheRegister === 'function') {
  window.__onPageCacheRegister('directory', function(data) {
    if (data.tree) _renderTree(data.tree);
  });
}

// ── 常量映射 ──────────────────────────────────────────

var FILE_ICONS = {
  py: '🐍', md: '📝', json: '📋', sh: '⚡', js: '📜', css: '🎨',
  html: '🌐', txt: '📃', yml: '⚙️', yaml: '⚙️', toml: '⚙️',
};

function _getFileIcon(name) {
  var ext = name.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || '📄';
}

// ── 模板函数 ──────────────────────────────────────────

function _tplDirectoryPage() {
  return '<div class="page-header">' +
    '<h3>📁 项目目录</h3>' +
    '<button class="siper-btn" id="dirRefreshBtn" onclick="window._dirRefresh()">刷新</button>' +
    '</div>' +
    '<div class="page-body"><div id="dirTree" class="siper-dir-tree">加载中...</div></div>';
}

function _renderTree(data) {
  var treeEl = document.getElementById('dirTree');
  if (!treeEl) return;
  var html = '';
  if (data.dirs && data.dirs.length > 0) {
    html += '<div class="siper-dir-section"><div class="siper-dir-section-title">📂 目录</div>';
    data.dirs.forEach(function(d) {
      html += '<div class="siper-dir-item">' +
        '<span class="siper-dir-icon">📂</span>' +
        '<span class="siper-dir-name">' + escapeHtml(d.name) + '/</span>' +
        '<span class="siper-dir-meta">' + d.count + ' 个文件</span>' +
        '<span class="siper-dir-size">' + fmtSize(d.size_kb) + '</span>' +
        '</div>';
    });
    html += '</div>';
  }
  if (data.files && data.files.length > 0) {
    html += '<div class="siper-dir-section"><div class="siper-dir-section-title">📄 根目录文件</div>';
    data.files.forEach(function(f) {
      html += '<div class="siper-dir-item">' +
        '<span class="siper-dir-icon">' + _getFileIcon(f.name) + '</span>' +
        '<span class="siper-dir-name">' + escapeHtml(f.name) + '</span>' +
        '<span class="siper-dir-meta"></span>' +
        '<span class="siper-dir-size">' + fmtSize(f.size_kb) + '</span>' +
        '</div>';
    });
    html += '</div>';
  }
  treeEl.innerHTML = html;
}

// ── 页面渲染入口 ──────────────────────────────────────

export function renderDirectoryPageChat(container) {
  container.className = 'siper-content siper-full-content page-directory';
  container.innerHTML = _tplDirectoryPage();
  _loadDirectory();
}

function _loadDirectory() {
  var treeEl = document.getElementById('dirTree');
  if (!treeEl) return;
  treeEl.innerHTML = '<div class="siper-loading siper-loading--sm">加载中...</div>';
  var cached = typeof window.__getPageCache === 'function' ? window.__getPageCache('directory') : null;
  if (cached && cached.tree) { _renderTree(cached.tree); return; }
  apiGetCached('/api/project-structure', 'directory').then(function(data) {
    if (!data || (!data.dirs && !data.files)) {
      treeEl.innerHTML = '<div class="siper-empty">加载失败</div>';
      return;
    }
    _renderTree(data);
  }).catch(function() {
    treeEl.innerHTML = '<div class="siper-empty">加载失败，请刷新重试</div>';
  });
}

window._dirRefresh = function() { _loadDirectory(); };