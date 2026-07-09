// utils/api.js — fetch 封装（超时、错误处理）

export async function apiGet(path, timeout = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(path, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`请求超时 (${timeout / 1000}s)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiPost(path, data, timeout = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`请求超时 (${timeout / 1000}s)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function apiFetch(path, options = {}) {
  const { timeout = 30000, ...fetchOptions } = options;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  return fetch(path, { ...fetchOptions, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** 优先从 page_cache 读取，无缓存则 HTTP GET（消除各页面重复的 cache→fetch 回退模式） */
export async function apiGetCached(url, pageName) {
  if (typeof window.__getPageCache === 'function') {
    const cache = window.__getPageCache(pageName);
    // 只有当缓存确实包含有效数据时才使用（拒绝空对象/空数组）
    if (cache) {
      if (Array.isArray(cache?.models) && cache.models.length > 0) return cache;
      if (typeof cache === 'object' && !Array.isArray(cache) && Object.keys(cache).length > 0 && !('models' in cache)) return cache;
    }
  }
  return await apiGet(url);
}
