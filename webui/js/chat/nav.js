/**
 * chat/nav.js — 页面导航
 * 从 core.js 拆出。处理 siPerNavigate 页面切换逻辑。
 */
import { setCurrentPage } from './state.js';

const _CHAT_RENDERED_PAGES = new Set(['chat', 'tasks', 'skills', 'plugins', 'token', 'global-settings', 'model-settings', 'logs', 'monitor', 'tools', 'directory']);
let _currentPage = 'chat';

export function siPerNavigate(page, skipHash) {
    if (!page) return;

    // Chat-family pages (rendered inside #page-chat three-column layout)
    if (_CHAT_RENDERED_PAGES.has(page)) {
        const chatPage = document.getElementById('page-chat');
        const dynamicPage = document.getElementById('page-dynamic');
        if (chatPage) chatPage.style.display = 'flex';
        if (dynamicPage) dynamicPage.style.display = 'none';
        _currentPage = page;
        if (typeof window.chatSwitchPage === 'function') {
            window.chatSwitchPage(page, true);
        }
        return;
    }

    // Standalone pages (rendered into #page-dynamic)
    const chatPage = document.getElementById('page-chat');
    const dynamicPage = document.getElementById('page-dynamic');
    if (chatPage) chatPage.style.display = 'none';
    if (dynamicPage) {
        dynamicPage.style.display = 'flex';
        dynamicPage.innerHTML = '';
    }
    _currentPage = page;
    if (!skipHash) location.hash = '#/' + page;

    // Clone template DOM into #page-dynamic
    const tplMap = {
        'sessions': 'tpl-sessions',
        'memory': 'tpl-memory',
        'agent-config': 'tpl-agent-config',
        'theme-settings': 'tpl-theme-settings',
        'model-settings': 'tpl-model-settings',
    };
    const tplId = tplMap[page];
    if (tplId) {
        const tpl = document.getElementById(tplId);
        if (tpl && dynamicPage) {
            const clone = tpl.cloneNode(true);
            clone.style.display = '';
            clone.removeAttribute('id');
            dynamicPage.appendChild(clone);
        }
    }

    // Page-specific init
    if (page === 'sessions' && typeof window.refreshSessions === 'function') {
        window.refreshSessions();
    }
    if (page === 'memory') {
        if (typeof window.populateMemoryAgentSelector === 'function') {
            window.populateMemoryAgentSelector();
        }
        if (typeof window.refreshMemoryPage === 'function') {
            window.refreshMemoryPage();
        }
    }
    if (page === 'agent-config') {
        if (typeof window.refreshConfigAgentPanel === 'function') window.refreshConfigAgentPanel();
        if (typeof window.loadAgentSettings === 'function') window.loadAgentSettings();
        if (typeof window.renderMiddleList === 'function') window.renderMiddleList();
    }
    if (page === 'theme-settings' && typeof window.showThemeSettings === 'function') {
        window.showThemeSettings();
    }
    if (page === 'models' && typeof window.refreshModelsPage === 'function') {
        window.refreshModelsPage();
    }
    if (page === 'file-browser' && typeof window.refreshFileList === 'function') {
        window.refreshFileList();
    }
}
