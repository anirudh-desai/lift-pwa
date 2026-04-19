/* =============================================
   LIFT — Settings
   ============================================= */

async function renderSettingsView() {
  setPageTitle('SETTINGS');
  showBack(false);

  const timerEnabled = await getSetting('timerEnabled', true);
  const restTimer = await getSetting('restTimer', 90);
  const notesCollapsed = await getSetting('notesCollapsed', false);

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  // Timer
  const unitSection = document.createElement('div');
  unitSection.innerHTML = `
    <div class="section-header">
      <span class="section-title">Preferences</span>
    </div>
    <div class="settings-group" style="margin: 0 16px 24px;">
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Rest Timer</div>
          <div class="settings-row-sub">Countdown between sets</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="timer-enabled" ${timerEnabled ? 'checked' : ''} onchange="setTimerEnabled(this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Collapse Notes</div>
          <div class="settings-row-sub">Hide notes until tapped during a workout</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${notesCollapsed ? 'checked' : ''} onchange="setNotesCollapsed(this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-row" id="timer-duration-row" style="${!timerEnabled ? 'display:none' : ''}">
        <div>
          <div class="settings-row-label">Rest Duration</div>
          <div class="settings-row-sub">Seconds between sets</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button class="icon-btn" style="font-size:20px;color:var(--text)" onclick="adjustTimer(-15)">−</button>
          <div id="timer-display" style="font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;min-width:52px;text-align:center">${formatTimerDisplay(restTimer)}</div>
          <button class="icon-btn" style="font-size:20px;color:var(--text)" onclick="adjustTimer(15)">+</button>
        </div>
      </div>
    </div>
  `;
  content.appendChild(unitSection);

  // Data
  const dataSection = document.createElement('div');
  dataSection.innerHTML = `
    <div class="section-header">
      <span class="section-title">Data</span>
    </div>
    <div class="settings-group" style="margin: 0 16px 24px;">
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Export Data</div>
          <div class="settings-row-sub">Download all sessions as JSON</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="exportData()">Export</button>
      </div>
    </div>
  `;
  content.appendChild(dataSection);

  // About
  const aboutSection = document.createElement('div');
  aboutSection.innerHTML = `
    <div class="section-header">
      <span class="section-title">About</span>
    </div>
    <div class="settings-group" style="margin: 0 16px 24px;">
      <div class="settings-row">
        <div class="settings-row-label">LIFT</div>
        <div style="font-size:13px;color:var(--text-3)">v1.0</div>
      </div>
      <div class="settings-row">
        <div style="font-size:13px;color:var(--text-3);line-height:1.5;font-style:italic">
          "Exercise is a celebration of what your body can do, not a punishment for what you ate."
        </div>
      </div>
    </div>
  `;
  content.appendChild(aboutSection);
}


let _timerAdjustTimeout = null;
async function adjustTimer(delta) {
  let current = await getSetting('restTimer', 90);
  current = Math.max(15, Math.min(600, current + delta));
  await setSetting('restTimer', current);
  const display = document.getElementById('timer-display');
  if (display) display.textContent = formatTimerDisplay(current);
  clearTimeout(_timerAdjustTimeout);
  _timerAdjustTimeout = setTimeout(() => showToast(`Rest timer: ${formatTimerDisplay(current)}`), 400);
}

function formatTimerDisplay(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

async function exportData() {
  const sessions = await getAllSessions();
  const data = { exportedAt: new Date().toISOString(), sessions: [] };

  for (const session of sessions) {
    const logs = await getSessionLogs(session.id);
    const enrichedLogs = await Promise.all(logs.map(async (log) => {
      const ex = await getExercise(log.exerciseId);
      return { ...log, exerciseName: ex ? ex.name : null };
    }));
    data.sessions.push({ ...session, exerciseLogs: enrichedLogs });
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lift-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export downloaded');
}

async function setNotesCollapsed(value) {
  await setSetting('notesCollapsed', value);
}

async function setTimerEnabled(value) {
  await setSetting('timerEnabled', value);
  const durationRow = document.getElementById('timer-duration-row');
  if (durationRow) durationRow.style.display = value ? '' : 'none';
}