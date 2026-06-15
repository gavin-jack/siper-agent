// chat-pages/chat.js — 聊天页面渲染
// 从 pages/chat.js 拆分
// 包含消息列表、输入框、思考面板、模型选择

import * as Message from '../../chat/message.js';
import * as Input from '../../chat/input.js';
import * as Sidebar from '../../chat/sidebar.js';
import { chatSessionId, chatCurrentAgent, chatAgents } from '../../chat/state.js';

export function renderChatPage(container, skipSidebar) {
  container.className = 'siper-content siper-chat-mode';
  const hasSession = !!chatSessionId;
  const hasAgent = !!chatCurrentAgent;
  const showInput = hasSession && hasAgent;
  if (!showInput) {
    const headerName = document.getElementById('chatRightHeaderName');
    if (headerName) headerName.textContent = '选择一个 Agent 开始对话';
  } else if (typeof Input.updateChatHeader === 'function') {
    Input.updateChatHeader();
  }
  container.innerHTML = `
    <div class="siper-thinking-panel" id="chatThinkingPanel">
      <div class="siper-thinking-header"><span class="siper-thinking-icon">💭</span><span>正在思考</span></div>
      <div class="siper-thinking-body" id="chatThinkingBody"></div>
    </div>
    <div class="siper-messages" id="chatMessages" aria-live="polite" aria-atomic="false">
      <div class="siper-empty-state" id="chatEmptyState"><div class="siper-empty-state-icon">💬</div><div>通过agent发送消息</div></div>
    </div>
    ${showInput ? `\n    <div class="siper-input-area">
      <div class="siper-input-toolbar">
        <input type="file" id="chatFileInput" multiple class="hidden" onchange="handleChatFileSelect(event)" aria-label="上传文件">
        <button class="siper-attach-btn" onclick="document.getElementById('chatFileInput').click()" title="上传文件">📎</button>
        <div class="siper-model-dropdown" id="chatModelDropdown">
          <button class="siper-model-btn" id="chatModelBtn" onclick="toggleChatModelDropdown()">
            <span class="siper-model-btn-name" id="chatModelBtnName">默认模型</span>
            <span class="siper-model-btn-arrow">▾</span>
          </button>
          <div class="siper-model-menu" id="chatModelMenu"></div>
        </div>
        <div class="siper-ctx-info" id="chatCtxInfo" title="当前会话上下文使用量">
          <span class="siper-ctx-label">上下文</span>
          <span class="siper-ctx-value" id="chatCtxValue">--/--</span>
          <span class="siper-ctx-pct" id="chatCtxPct">--%</span>
        </div>
      </div>
      <div id="chatFilePreviewContainer" class="siper-file-preview-container hidden"></div>
      <div class="siper-input-row">
        <textarea id="chatInput" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="1" aria-label="聊天输入"></textarea>
        <button class="siper-send-btn" id="chatSendBtn" onclick="chatSendMessage()">发送</button>
        <button class="siper-stop-btn hidden" id="chatStopBtn" onclick="chatStopGeneration()" title="停止生成">⏹</button>
      </div>
    </div>` : ''}
  `;
  if (!showInput) {
    const addBtn = document.createElement('button');
    addBtn.className = 'siper-btn js-btn-add-agent';
    addBtn.textContent = '+ 新增智能体';
    addBtn.tabIndex = 0;
    addBtn.onclick = function() { if (typeof window.showAddAgentModal === 'function') window.showAddAgentModal(); };
    container.classList.add('js-pos-relative');
    container.appendChild(addBtn);
  }
  if (showInput) {
    setTimeout(() => Input.bindChatInput(), 0);
  }
  if (!skipSidebar) {
    if (chatAgents.length === 0) {
      // WS 推送 agents 后 renderAgentList 会自动渲染，此处无需操作
    }
    else Sidebar.renderMiddleList();
  }
  Input.loadChatModels();
}
