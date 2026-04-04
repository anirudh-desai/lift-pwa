/* =============================================
   LIFT — Settings
   ============================================= */

async function renderSettingsView() {
  setPageTitle('SETTINGS');
  showBack(false);

  const unit = await getSetting('unit', 'kg');
  const timerEnabled = await getSetting('timerEnabled', true);
  const restTimer = await getSetting('restTimer', 90);

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  // Units
  const unitSection = document.createElement('div');
  unitSection.innerHTML = `
    <div class="section-header">
      <span class="section-title">Preferences</span>
    </div>
    <div class="settings-group" style="margin: 0 16px 24px;">
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Weight Unit</div>
          <div class="settings-row-sub">Used across all exercises</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="unit-kg" class="btn btn-sm ${unit === 'kg' ? 'btn-primary' : 'btn-ghost'}" onclick="setUnit('kg')">kg</button>
          <button id="unit-lbs" class="btn btn-sm ${unit === 'lbs' ? 'btn-primary' : 'btn-ghost'}" onclick="setUnit('lbs')">lbs</button>
        </div>
      </div>
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

async function setUnit(unit) {
  await setSetting('unit', unit);
  window._cachedUnit = unit;
  document.getElementById('unit-kg').className = `btn btn-sm ${unit === 'kg' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('unit-lbs').className = `btn btn-sm ${unit === 'lbs' ? 'btn-primary' : 'btn-ghost'}`;
  showToast(`Weight unit set to ${unit}`);
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
    data.sessions.push({ ...session, exerciseLogs: logs });
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

async function setTimerEnabled(value) {
  await setSetting('timerEnabled', value);
  const durationRow = document.getElementById('timer-duration-row');
  if (durationRow) durationRow.style.display = value ? '' : 'none';
}