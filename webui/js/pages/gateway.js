// pages/gateway.js — 网关管理
// 从 pages/page-gateway.js 迁移

import { t, currentLang } from '../utils/i18n.js';
import { showConfirm } from '../components/toast.js';
import { addLog } from '../utils/dom.js';

export async function refreshGateway() {
  try {
    const r = await fetch('/api/gateway');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const list = document.getElementById('chatGatewayList');
    if (!d.services || d.services.length === 0) {
      list.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center">' + t('gateway.noData') + '</div>';
      return;
    }

    const typeIcons = { 'http': '🌐', 'ws': '🔌', 'internal': '⚙️', 'api': '🤖' };
    const statusColors = { 'running': 'var(--green)', 'stopped': 'var(--red)', 'error': 'var(--yellow)' };

    let html = '';
    for (const svc of d.services) {
      const icon = typeIcons[svc.type] || '📦';
      const color = statusColors[svc.status] || 'var(--text-dim)';
      const isRunning = svc.status === 'running';
      const safeName = svc.name.replace(/'/g, "\\'");

      html += `<div class="card card-hover card-left-accent" style="display:flex;align-items:center;gap:16px;padding:18px 20px">`;
      html += `<div style="font-size:28px;flex-shrink:0">${icon}</div>`;
      html += `<div style="flex:1;min-width:0">`;
      html += `<div style="font-size:15px;font-weight:600">${svc.name}</div>`;
      if (svc.endpoint) {
        html += `<div style="font-size:12px;color:var(--text-dim);margin-top:4px;font-family:monospace;word-break:break-all">${svc.endpoint}</div>`;
      }
      html += `<div style="margin-top:6px;display:flex;align-items:center;gap:6px">`;
      html += `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>`;
      html += `<span style="font-size:12px;color:${color};text-transform:uppercase;font-weight:600">${svc.status}</span>`;
      html += `<span style="font-size:11px;color:var(--text-dim);margin-left:8px;text-transform:uppercase">${svc.type}</span>`;
      html += `</div></div>`;
      html += `<div style="display:flex;gap:6px;flex-shrink:0">`;
      if (isRunning) {
        html += `<button class="btn-sm" data-action="gateway-control" data-action-type="restart" data-service="${safeName}">重启</button>`;
        html += `<button class="btn-sm danger" data-action="gateway-control" data-action-type="stop" data-service="${safeName}">停止</button>`;
      } else {
        html += `<button class="btn-sm primary" data-action="gateway-control" data-action-type="restart" data-service="${safeName}">启动</button>`;
      }
      html += `</div></div>`;
    }
    list.innerHTML = html;
  } catch (e) {
    document.getElementById('chatGatewayList').innerHTML = '<div style="color:var(--red);padding:20px">' + t('gateway.loadFailed') + ': ' + e.message + '</div>';
  }
}

export async function controlGateway(action, service) {
  if (action === 'restart_all') {
    showConfirm({
      title: t('gateway.restartAll') || '重启全部',
      msg: t('gateway.confirmRestartAll') || '确定重启全部服务？',
      impact: '⚠ 所有运行中的服务将短暂中断，连接会断开',
      danger: true,
      okText: '确认重启',
      onConfirm: () => doGatewayAction(action, service),
    });
  } else if (action === 'stop') {
    showConfirm({
      title: '停止服务',
      msg: (t('gateway.confirmStop') || '确定停止 {0}？').replace('{0}', service || ''),
      impact: '⚠ 服务停止后将无法使用，需要手动重启',
      danger: true,
      okText: '确认停止',
      onConfirm: () => doGatewayAction(action, service),
    });
  } else {
    doGatewayAction(action, service);
  }
}

async function doGatewayAction(action, service) {
  try {
    const body = { action };
    if (service) body.service = service;

    const r = await fetch('/api/gateway', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();

    if (d.success) {
      addLog('info', t('log.gatewayControl') + ': ' + d.message, currentLang);
      if (action === 'restart_all' || action === 'restart') {
        setTimeout(refreshGateway, 3000);
      } else {
        setTimeout(refreshGateway, 1000);
      }
    } else {
      addLog('error', '网关操作失败: ' + (d.error || '未知错误'), currentLang);
    }
  } catch (e) {
    addLog('error', '网关操作失败: ' + e.message, currentLang);
  }
}

// DOMContentLoaded 由 app.js 统一触发
