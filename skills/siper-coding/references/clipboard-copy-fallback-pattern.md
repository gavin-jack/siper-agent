# Clipboard Copy Fallback Pattern (v0.9.87x)

## Problem

`navigator.clipboard.writeText()` fails on HTTP (non-HTTPS, non-localhost):
- Error: `Write permission denied`
- `document.execCommand('copy')` also returns `false` in some browsers

## Three-Level Fallback Strategy

```javascript
function copyText(evt, text) {
  const btn = evt.currentTarget || evt.target.closest('button');
  
  const showOk = () => {
    if (!btn) return;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="var(--green)"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>';
    setTimeout(() => {
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="5" width="9" height="9" rx="1.5" opacity="0.6"/><rect x="2" y="2" width="9" height="9" rx="1.5"/></svg>';
    }, 1200);
  };

  const fallbackModal = () => {
    const existing = document.getElementById('copyNameModal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'copyNameModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:90%;min-width:300px"><div style="font-weight:600;margin-bottom:12px">复制</div><input type="text" value="' + text.replace(/"/g, '&quot;') + '" readonly style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;box-sizing:border-box" onclick="this.select()"><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button id="copyNameModalClose" class="btn-sm primary">关闭</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#copyNameModalClose').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    setTimeout(() => { const inp = overlay.querySelector('input'); if (inp) { inp.focus(); inp.select(); } }, 50);
  };

  // Strategy 1: Clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(() => { showOk(); }).catch(() => {
      // Strategy 2: execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        if (document.execCommand('copy')) { document.body.removeChild(ta); showOk(); return; }
        document.body.removeChild(ta);
      } catch(e) {}
      // Strategy 3: modal
      fallbackModal();
      showOk();
    });
  } else {
    fallbackModal();
    showOk();
  }
}
```

## Key Points

- **Always use SVG icons for buttons**, not emoji — emoji may render as text/boxes in some fonts
- **Use `evt.currentTarget`** to get the button element reliably (not `this` in inline onclick)
- **Modal fallback** creates a centered overlay with a pre-selected text input — user can Ctrl+C
- **showOk() always called** even if copy fails — provides visual feedback regardless
- Works on SiPer's HTTP (non-HTTPS) deployment
