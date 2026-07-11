// utils/ws-compat.js — Toast/Dialog 兼容函数
// 统一 core.js dispatch + renderer.js handler 的兼容逻辑

export function showToastCompat(data) {
    if (!data) return;
    if (typeof window.showToast === 'function') {
        window.showToast(data);
    } else if (typeof window.toast === 'function') {
        window.toast(data.message || data.type || '', data.type || 'info');
    }
}

export function showDialogCompat(data) {
    if (!data) return;
    if (typeof window.showDialog === 'function') {
        window.showDialog(data);
    } else if (typeof window.showConfirm === 'function' && data.type === 'confirm') {
        if (typeof data.title === 'object' && data.title !== null) {
            window.showConfirm(data.title);
        } else {
            window.showConfirm({ title: data.title || '确认', msg: data.message || '', onConfirm: data.onConfirm });
        }
    }
}
