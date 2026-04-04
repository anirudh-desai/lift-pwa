/* =============================================
   LIFT — History & Progress
   ============================================= */

async function renderHistoryView() {
  setPageTitle('HISTORY');
  showBack(false);

  const sessions = await getAllSessions();
  const content = document.getElementById('main-content');
  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-title">${sessions.length} Session${sessions.length !== 1 ? 's' : ''}</span>`;
  content.appendChild(header);

  if (sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">📈</div>
      <div class="empty-state-title">No sessions yet</div>
      <div class="empty-state-text">Completed workouts will appear here</div>
    `;
    content.appendChild(empty);
    return;
  }

  for (const session of sessions) {
    const logs = await getSessionLogs(session.id);
    const card = await buildHistorySessionCard(session, logs);
    content.appendChild(card);
  }
}

async function buildHistorySessionCard(session, logs) {
  const card = document.createElement('div');
  card.className = 'history-session-card animate-in';

  const date = new Date(session.completedAt);
  const dateStr = date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  const header = document.createElement('div');
  header.className = 'history-session-header';
  header.innerHTML = `
    <div>
      <div class="history-session-date">${dateStr} · ${timeStr}</div>
      <div class="history-session-workout">${escapeHTML(session.workoutName || 'Workout')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:13px;color:var(--text-3)">${logs.length} exercise${logs.length !== 1 ? 's' : ''}</div>
      <button class="icon-btn" onclick="confirmDeleteSession(${session.id})">🗑️</button>
    </div>
  `;
  card.appendChild(header);

  for (const log of logs) {
    const ex = await getExercise(log.exerciseId);
    if (!ex) continue;

    const exRow = document.createElement('div');
    exRow.className = 'history-exercise-row';

    const nameRow = document.createElement('div');
    nameRow.className = 'history-exercise-name';
    if (log.flagNext) {
      const flag = document.createElement('span');
      flag.textContent = '🟡';
      flag.title = 'Flagged for increment';
      nameRow.appendChild(flag);
    }
    nameRow.appendChild(document.createTextNode(ex.name));
    exRow.appendChild(nameRow);

    const completedSets = (log.sets || []).filter(s => s.completed !== false);
    const measurements = ex.measurements || [];

    completedSets.forEach((set, idx) => {
      const setRow = document.createElement('div');
      setRow.className = 'history-set-row';

      const parts = [`Set ${idx + 1}:`];
      if (measurements.includes('weight') && set.weight) parts.push(`${set.weight} ${ex.unit || 'kg'}`);
      if (measurements.includes('reps') && set.reps) parts.push(`${set.reps} reps`);
      if (measurements.includes('time') && set.time) parts.push(`${set.time}s`);

      setRow.innerHTML = `<span>${parts.join(' ')}</span>`;
      exRow.appendChild(setRow);
    });

    if (completedSets.length === 0) {
      const noData = document.createElement('div');
      noData.style.cssText = 'font-size:12px;color:var(--text-3)';
      noData.textContent = 'No sets completed';
      exRow.appendChild(noData);
    }

    card.appendChild(exRow);
  }

  return card;
}


async function confirmDeleteSession(id) {
  showModal('Delete Session', async () => {
    return `<p style="color:var(--text-2);font-size:15px;line-height:1.5">Delete this session? This cannot be undone.</p>`;
  }, async () => {
    const db = await getDB();
    await db.delete('sessions', id);
    const tx = db.transaction('exerciseLogs', 'readwrite');
    const index = tx.store.index('sessionId');
    const logs = await index.getAll(id);
    for (const log of logs) {
      await tx.store.delete(log.id);
    }
    await tx.done;
    showToast('Session deleted');
    renderHistoryView();
    return true;
  }, 'Delete', 'btn-danger');
}
