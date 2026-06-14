// chat-pages/model-settings.js — 模型设置页面渲染
// 从 pages/chat.js 拆分
// 包含模型管理和辅助两个 tab

export function switchModelTab(tabName) {
  const tabs = document.querySelectorAll('.siper-settings-tab');
  const contents = document.querySelectorAll('.js-model-settings-tab-content');
  tabs.forEach(t => t.classList.remove('active'));
  contents.forEach(c => c.style.display = 'none');
  const activeTab = document.querySelector(`.siper-settings-tab[data-tab="${tabName}"]`);
  const activeContent = document.getElementById(`modelSettingsTab-${tabName}`);
  if (activeTab) activeTab.classList.add('active');
  if (activeContent) activeContent.style.display = '';
}

export function renderModelSettingsPageChat(container) {
  container.className = 'siper-content siper-full-content';
  container.innerHTML = `
<div class="siper-settings-tabs">
  <button class="siper-settings-tab active" data-tab="models" onclick="window.switchModelTab('models')">${window.t ? window.t('tabModels') : '模型管理'}</button>
  <button class="siper-settings-tab" data-tab="auxiliary" onclick="window.switchModelTab('auxiliary')">${window.t ? window.t('tabAuxiliary') : '辅助'}</button>
</div>
<div id="modelSettingsTab-models" class="js-model-settings-tab-content">
<div class="js-model-settings-grid">
  <div class="siper-form-card js-form-card">
    <div class="siper-form-title js-form-title">
      <span>可用模型</span>
      <div class="js-spacer"></div>
      <div class="js-search-wrapper">
        <input type="text" id="modelSearchInput" placeholder="搜索模型..." class="siper-input" class="js-input-xs" oninput="window.filterModelsList()">
        <span id="modelSearchClear" onclick="window.clearModelSearch()" class="js-search-clear" title="清空">✕</span>
      </div>
      <div id="capFilterDropdown" class="js-cap-filter-wrap">
        <button id="capFilterBtn" class="siper-input js-cap-filter-btn" onclick="window.toggleCapFilterDropdown()" aria-label="按功能筛选">
          <span id="capFilterLabel">全部功能</span>
        </button>
        <div id="capFilterMenu" class="js-cap-filter-menu">
          <div class="js-cap-filter-options">
            <div class="cap-filter-option" data-cap="chat" onclick="window.selectCapFilter('chat')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 💬对话
            </div>
            <div class="cap-filter-option" data-cap="vision" onclick="window.selectCapFilter('vision')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 👁视觉
            </div>
            <div class="cap-filter-option" data-cap="reasoning" onclick="window.selectCapFilter('reasoning')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🧠推理
            </div>
            <div class="cap-filter-option" data-cap="code" onclick="window.selectCapFilter('code')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 💻代码
            </div>
            <div class="cap-filter-option" data-cap="function_calling" onclick="window.selectCapFilter('function_calling')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🔧工具
            </div>
            <div class="cap-filter-option" data-cap="tts" onclick="window.selectCapFilter('tts')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🔊语音
            </div>
            <div class="cap-filter-option" data-cap="embedding" onclick="window.selectCapFilter('embedding')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 📎嵌入
            </div>
            <div class="cap-filter-option" data-cap="image_gen" onclick="window.selectCapFilter('image_gen')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 🎨生图
            </div>
            <div class="cap-filter-option" data-cap="long_context" onclick="window.selectCapFilter('long_context')" class="js-cap-filter-option">
              <input type="checkbox" class="js-checkbox"> 📏长上下文
            </div>
          </div>
          <div class="js-cap-filter-actions">
            <button class="siper-btn" class="js-btn-xs" onclick="window.clearCapFilter()">清除</button>
            <button class="siper-btn primary" class="js-btn-xs" onclick="window.applyCapFilter()">确定</button>
          </div>
        </div>
      </div>
      <div class="js-sort-wrapper">
        <select id="modelSortBy" class="siper-input js-sort-select" onchange="window.filterModelsList()" aria-label="排序">
          <option value="name">按名称</option>
          <option value="ttft">按响应时间</option>
          <option value="latency">按延迟</option>
          <option value="context">按上下文窗口</option>
          <option value="caps">按能力数量</option>
        </select>
        <button id="sortDirBtn" class="siper-input js-sort-dir-btn" onclick="window.toggleSortDir()" title="切换排序方向">↑</button>
      </div>
      <button class="siper-btn primary js-btn-verify-all" onclick="window.verifyAllModels()">验证全部</button>
    </div>
    <div id="settingsModelsList"></div>
  </div>
  <div class="siper-form-card js-form-card-sidebar">
    <div class="siper-form-title">🔍 发现模型</div>
    <div class="js-sort-group">
      <div style="flex:1;">
        <div class="text-dim" class="js-label-sm">Provider</div>
        <select id="providerPreset" class="siper-input" class="js-input-sm" onchange="window.applyProviderPreset()" aria-label="Provider 预设">
          <option value="">— 选择 —</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="deepseek">DeepSeek</option>
          <option value="moonshot">Moonshot</option>
          <option value="qwen">Qwen</option>
          <option value="longcat">LongCat</option>
          <option value="zhipuai">ZhipuAI</option>
          <option value="minimax">MiniMax</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
          <option value="ollama">Ollama</option>
          <option value="custom">自定义</option>
        </select>
      </div>
      <div style="flex:1.5;">
        <div class="text-dim" class="js-label-sm">Base URL</div>
        <input type="text" class="siper-input" id="discoverBaseUrl" placeholder="https://api.openai.com/v1" aria-label="发现 Base URL" class="js-input-sm">
      </div>
    </div>
    <div class="js-mb-6">
      <div class="text-dim" class="js-label-sm">API Key</div>
      <input type="password" class="siper-input" id="discoverApiKey" placeholder="sk-..." aria-label="发现 API Key" class="js-input-sm">
    </div>
    <div class="js-select-group">
      <button class="siper-btn primary" onclick="window.discoverModels()">获取模型列表</button>
      <div id="discoverFilterWrap" class="js-discover-filter">
        <input type="text" class="siper-input js-input-search" id="discoverFilter" placeholder="筛选模型..." aria-label="筛选发现的模型" oninput="window.chatFilterDiscovered()">
        <button id="discoverFilterClear" onclick="window.chatClearDiscoverFilter()" class="js-model-card-action" title="清空筛选">×</button>
      </div>
    </div>
    <div id="discoverResult" class="js-scroll-flex"></div>
  </div>
</div>
</div>
<div id="modelSettingsTab-auxiliary" class="js-model-settings-tab-content" style="display:none;">
  <div class="siper-form-card">
    <div class="siper-form-title">${window.t ? window.t('auxiliaryTitle') : '🔧 辅助模型'}</div>
    <div class="text-dim" style="margin-bottom:12px;">${window.t ? window.t('auxiliaryDesc') : '辅助模型配置功能开发中，敬请期待...'}</div>
    <div id="auxiliaryModelsContainer"></div>
  </div>
</div>`;
  // Add reset button to chat header
  const header = document.getElementById('chatRightHeader');
  if (header && !header.querySelector('.siper-chat-header-btn')) {
    const btn = document.createElement('button');
    btn.className = 'siper-chat-header-btn siper-chat-header-btn-text';
    btn.textContent = '重置';
    btn.onclick = () => { if (typeof window.resetSettingsModels === 'function') window.resetSettingsModels(); };
    header.appendChild(btn);
  }

  if (typeof window.loadSettingsModels === 'function') window.loadSettingsModels();
}