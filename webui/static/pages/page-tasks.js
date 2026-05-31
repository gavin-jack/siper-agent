// ===== Tasks (Scheduled) =====
let editingTaskId = null;

function showTaskForm(task) {
  editingTaskId = task ? task.id : null;
  document.getElementById('taskFormTitle').textContent = task ? t('tasks.editTask') : t('tasks.newTask');
  document.getElementById('taskName').value = task ? task.name : '';
  document.getElementById('taskCron').value = task ? task.cron : '0 * * * *';
  document.getElementById('taskPrompt').value = task ? task.prompt : '';
  document.getElementById('taskEnabled').checked = task ? task.enabled : true;
  document.getElementById('taskForm').style.display = 'block';
  updateCronHint();
}

function hideTaskForm() {
  document.getElementById('taskForm').style.display = 'none';
  editingTaskId = null;
}

function updateCronHint() {
  const cron = document.getElementById('taskCron').value.trim();
  const hint = document.getElementById('cronHint');
  if (!cron) { hint.textContent = ''; return; }
  const parts = cron.split(/\s+/);
  if (parts.length < 5) { hint.textContent = t('tasks.cronFields'); return; }
  const [min, hour, dom, month, dow] = parts;
  let desc = [];
  if (min === '*') desc.push(t('tasks.everyMin'));
  else if (min.startsWith('*/')) desc.push(t('tasks.everyNMin', min.slice(2)));
  else desc.push(`${min}分`);
  if (hour !== '*') desc.push(`${hour}时`);
  if (dom !== '*') desc.push(`${dom}日`);
  if (month !== '*') desc.push(`${month}月`);
  if (dow !== '*') {
    const days = ['周日','周一','周二','周三','周四','周五','周六'];
    desc.push(days[parseInt(dow)] || `周${dow}`);
  }
  hint.textContent = desc.join(' ');
}

document.getElementById('taskCron').addEventListener('input', updateCronHint);

async function saveTask() {
  const name = document.getElementById('taskName').value.trim();
  const cron = document.getElementById('taskCron').value.trim();
  const prompt = document.getElementById('taskPrompt').value.trim();
  const enabled = document.getElementById('taskEnabled').checked;
  if (!name) { toast.warning(t('tasks.enterName')); return; }
  if (!cron) { toast.warning(t('tasks.enterCron')); return; }
  if (!prompt) { toast.warning(t('tasks.enterPrompt')); return; }
  try {
    let r;
    if (editingTaskId) {
      r = await fetch('/api/tasks/' + editingTaskId, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, cron, prompt, enabled}),
      });
    } else {
      r = await fetch('/api/tasks', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, cron, prompt, enabled}),
      });
    }
    const d = await r.json();
    if (d.success) {
      hideTaskForm();
      refreshTasks();
    } else {
      toast.error(t('tasks.saveFailed') + ' ' + (d.error || t('tasks.unknownError')));
    }
  } catch(e) {
    toast.error(t('tasks.saveFailed') + ' ' + e.message);
  }
}

async function toggleTask(id, enabled) {
  try {
    const r = await fetch('/api/tasks/' + id, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({enabled}),
    });
    const d = await r.json();
    if (d.success) refreshTasks();
  } catch(e) {}
}

async function deleteTask(id) {
  showConfirm({
    title: '删除任务',
    msg: '确定删除此定时任务？',
    impact: '⚠ 任务将被永久删除，已计划的执行将被取消',
    danger: true,
    okText: '确认删除',
    onConfirm: async () => {
      try {
        const r = await fetch('/api/tasks/' + id, { method: 'DELETE' });
        const d = await r.json();
        if (d.success) {
          refreshTasks();
          toast.success(t('tasks.refreshed'), 1500);
        } else {
          toast.error(t('tasks.saveFailed') + ': ' + (d.error || ''));
        }
      } catch(e) { toast.error(t('tasks.saveFailed') + ': ' + e.message); }
    }
  });
}

async function triggerTask(id) {
  try {
    const r = await fetch('/api/tasks/' + id + '/trigger', {method: 'POST'});
    const d = await r.json();
    if (d.success) {
      toast.success(t('tasks.triggered'));
      refreshTasks();
    }
  } catch(e) {}
}

async function showTaskHistory(id, name) {
  document.getElementById('taskHistoryTitle').textContent = name + ' - ' + t('tasks.history');
  document.getElementById('taskHistoryList').innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px">' + t('memory.loading') + '</div>';
  document.getElementById('taskHistoryModal').style.display = 'flex';
  try {
    const r = await fetch('/api/tasks/' + id + '/history');
    const d = await r.json();
    const history = d.history || [];
    if (!history.length) {
      document.getElementById('taskHistoryList').innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px">' + t('tasks.noResponse') + '</div>';
      return;
    }
    document.getElementById('taskHistoryList').innerHTML = history.slice().reverse().map(h => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:11px;color:var(--text-dim)">${h.time || ''}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${h.success ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'};color:${h.success ? "var(--green)" : "var(--red)"}">${h.success ? '✓ 成功' : '✗ 失败'}</span>
        </div>
        <div style="font-size:12px;color:var(--text);white-space:pre-wrap;word-break:break-word">${escapeHtml(h.response || t('tasks.noResponse'))}</div>
      </div>
    `).join('');
  } catch(e) {
    document.getElementById('taskHistoryList').innerHTML = '<div style="color:var(--red);padding:12px">' + t('tasks.loadFailed') + '</div>';
  }
}

function closeTaskHistory() {
  document.getElementById('taskHistoryModal').style.display = 'none';
}

async function refreshTasks() {
  try {
    const r = await fetch('/api/tasks');
    const data = await r.json();
    const tasks = data.tasks || [];
    const list = document.getElementById('tasksList');

    // Stats
    const enabled = tasks.filter(t => t.enabled).length;
    const totalRuns = tasks.reduce((s, t) => s + (t.run_count || 0), 0);
    document.getElementById('taskStats').innerHTML = `
      <div class="stat-card"><div class="value">${tasks.length}</div><div class="label">${t('tasks.total')}</div></div>
      <div class="stat-card"><div class="value" style="color:var(--green)">${enabled}</div><div class="label">${t('tasks.enabled')}</div></div>
      <div class="stat-card"><div class="value">${totalRuns}</div><div class="label">${t('tasks.totalRuns')}</div></div>
    `;

    if (!tasks.length) {
      list.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:40px;font-size:13px">' + t('tasks.empty') + '</div>';
      return;
    }

    list.innerHTML = tasks.map(t => {
      const statusColor = t.enabled ? "var(--green)" : "var(--text-dim)";
      const statusBg = t.enabled ? 'rgba(63,185,80,0.1)' : 'rgba(139,148,158,0.1)';
      return `
      <div class="card" style="margin-bottom:8px;padding:14px;background:${statusBg};border-color:${t.enabled ? 'rgba(63,185,80,0.2)' : "var(--border)"}">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="margin-top:2px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" ${t.enabled ? 'checked' : ''} onchange="toggleTask('${t.id}', this.checked)" style="accent-color:var(--green)">
            </label>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-weight:600;font-size:14px">${escapeHtml(t.name)}</span>
              <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${statusBg};color:${statusColor}">${t.enabled ? '启用' : '禁用'}</span>
            </div>
            <div style="font-size:12px;color:var(--text-dim);display:flex;flex-wrap:wrap;gap:12px">
              <span>⏱ ${escapeHtml(t.cron)}</span>
              <span>📊 执行 ${t.run_count || 0} 次</span>
              ${t.last_run ? `<span>上次: ${t.last_run}</span>` : ''}
              ${t.next_run && t.enabled ? `<span>下次: ${t.next_run}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(t.prompt)}">
              📝 ${escapeHtml(t.prompt)}
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn-sm" onclick="triggerTask('${t.id}')" title="立即执行" style="font-size:12px;padding:4px 8px">▶</button>
            <button class="btn-sm" onclick="showTaskHistory('${t.id}', '${escapeHtml(t.name)}')" title="执行历史" style="font-size:12px;padding:4px 8px">📋</button>
            <button class="btn-sm" onclick="showTaskForm(${JSON.stringify(t).replace(/"/g, '&quot;')})" title="编辑" style="font-size:12px;padding:4px 8px">✏️</button>
            <button class="btn-sm danger" onclick="deleteTask('${t.id}')" title="删除" style="font-size:12px;padding:4px 8px">🗑</button>
          </div>
        </div>
      </div>
    `}).join('');
  } catch(e) {
    document.getElementById('tasksList').innerHTML = '<div style="color:var(--red);padding:12px">' + t('tasks.loadFailed') + ': ' + e.message + '</div>';
    toast.error(t('tasks.loadFailed'));
  }
  toast.info(t('tasks.refreshed'), 1500);
}

// Auto-load on page load (multi-page mode)
document.addEventListener('DOMContentLoaded', refreshTasks);
