// page-cache.js — 页面缓存基础设施
// 提供 page_cache 读写和自动回调注册

export function initPageCache() {
  // 数据存储
  window.__pageCacheData = {};
  // 回调注册表：pageName → function(data)
  window.__pageCacheCallbacks = {};
  
  // 获取指定页面的缓存数据
  window.__getPageCache = function(page) {
    return window.__pageCacheData && window.__pageCacheData[page];
  };
  
  // 设置指定页面的缓存数据
  window.__setPageCache = function(page, data) {
    if (!window.__pageCacheData) window.__pageCacheData = {};
    window.__pageCacheData[page] = data;
  };
  
  // 注册页面缓存更新回调（页面模块调用，新数据到达时自动刷新）
  window.__onPageCacheRegister = function(page, callback) {
    if (window.__pageCacheCallbacks) {
      window.__pageCacheCallbacks[page] = callback;
    }
  };
  
  // 页面缓存更新入口（renderer.js 调用，分发到各页面回调）
  window.__onPageCacheUpdate = function(page, data) {
    if (window.__pageCacheData) {
      window.__pageCacheData[page] = data;
    }
    if (window.__pageCacheCallbacks && window.__pageCacheCallbacks[page]) {
      try { window.__pageCacheCallbacks[page](data); }
      catch(e) { console.error('[pageCache] callback failed for ' + page + ':', e); }
    }
  };
}
