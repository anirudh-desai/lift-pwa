/* =============================================
   LIFT — Active Workout Session
   ============================================= */

let _restTimerInterval = null;
let _restTimerSeconds = 90;
let _sessionState = null; // { workoutId, workoutName, exerciseBlocks: [...] }

async function renderHomeView() {
  setPageTitle('LIFT');
  showBack(false);

  // Restore draft from IndexedDB if session was lost (e.g. page refresh)
  if (!_sessionState) {
    const draft = await getActiveDraft();
    if (draft) _sessionState = draft;
  }

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  const hero = document.createElement('div');
  hero.className = 'home-hero';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
  hero.innerHTML = `
    <div class="home-greeting">${greeting}</div>
    <div class="home-subtitle">What are we doing today?</div>
  `;
  content.appendChild(hero);

  // Active session resume card
  if (_sessionState) {
    let totalSets = 0, completedSets = 0;
    for (const block of _sessionState.exerciseBlocks) {
      if (block.type === 'superset') {
        totalSets += block.targetSets;
        for (let i = 0; i < block.targetSets; i++) {
          if (block.exercises.every(ex => ex.sets[i] && ex.sets[i].completed)) completedSets++;
        }
      } else {
        totalSets += block.sets.length;
        completedSets += block.sets.filter(s => s.completed).length;
      }
    }
    const resumeCard = document.createElement('div');
    resumeCard.className = 'active-session-card';
    resumeCard.innerHTML = `
      <div class="active-session-label">⚡ Workout In Progress</div>
      <div class="active-session-name">${escapeHTML(_sessionState.workoutName)}</div>
      <div class="active-session-meta">${completedSets} / ${totalSets} sets completed</div>
      <button class="btn btn-primary btn-full" onclick="resumeSession()">Resume Workout</button>
    `;
    content.appendChild(resumeCard);
    return;
  }

  // Next workout from active program
  const next = await getNextWorkoutInProgram();
  if (next && next.workout) {
    const card = document.createElement('div');
    card.className = 'next-workout-card';
    const normalized = normalizeWorkoutItems(next.workout);
    const exCount = countItemsExercises(normalized.items || []);
    card.innerHTML = `
      <div class="next-workout-label">▸ Next Up</div>
      <div class="next-workout-name">${escapeHTML(next.workout.name)}</div>
      <div class="next-workout-meta">${exCount} exercise${exCount !== 1 ? 's' : ''} · ${next.program.name}</div>
      <button class="btn btn-primary btn-full" onclick="startSession(${next.workout.id}, true)">Start Workout</button>
    `;
    content.appendChild(card);
  }

  // All workouts to select from
  const workouts = await getAllWorkouts();
  if (workouts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">⚡</div>
      <div class="empty-state-title">No workouts yet</div>
      <div class="empty-state-text">Build workouts in the Workouts tab to get started</div>
    `;
    content.appendChild(empty);
    return;
  }

  const nextWorkoutId = next && next.workout ? next.workout.id : null;

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'section-header';
  sectionHeader.innerHTML = `<span class="section-title">All Workouts</span>`;
  content.appendChild(sectionHeader);

  const grid = document.createElement('div');
  grid.className = 'workout-select-grid';

  workouts.forEach(w => {
    const isNext = w.id === nextWorkoutId;
    const normalized = normalizeWorkoutItems(w);
    const exCount = countItemsExercises(normalized.items || []);
    const item = document.createElement('div');
    item.className = `workout-select-item ${isNext ? 'next-up' : ''}`;
    item.innerHTML = `
      <div>
        <div class="workout-select-item-name">${escapeHTML(w.name)}</div>
        <div class="workout-select-item-meta">${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
      </div>
      ${isNext ? '<span class="next-badge">NEXT</span>' : '<span style="color:var(--text-3);font-size:18px">›</span>'}
    `;
    item.addEventListener('click', () => startSession(w.id, isNext));
    grid.appendChild(item);
  });

  content.appendChild(grid);
}

async function startSession(workoutId, isScheduled = false) {
  if (!isScheduled) {
    await anchorProgramToWorkout(workoutId);
  }

  const rawWorkout = await getWorkout(workoutId);
  if (!rawWorkout) return;
  const workout = normalizeWorkoutItems(rawWorkout);

  _restTimerSeconds = await getSetting('restTimer', 90);

  const exerciseBlocks = [];

  for (const item of (workout.items || [])) {
    if (item.type === 'exercise') {
      const ex = await getExercise(item.exerciseId);
      if (!ex) continue;
      const lastLog = await getLastExerciseLog(item.exerciseId);
      const sets = Array.from({ length: item.targetSets || 3 }, () => ({ reps: '', weight: '', time: '', completed: false }));
      exerciseBlocks.push({
        type: 'exercise',
        exerciseId: item.exerciseId,
        exercise: ex,
        targetSets: item.targetSets || 3,
        sets,
        flagNext: lastLog ? lastLog.flagNext : false,
        lastLog
      });
    } else if (item.type === 'superset') {
      const exercises = [];
      for (const exItem of (item.exercises || [])) {
        const ex = await getExercise(exItem.exerciseId);
        if (!ex) continue;
        const lastLog = await getLastExerciseLog(exItem.exerciseId);
        const sets = Array.from({ length: item.targetSets || 3 }, () => ({ reps: '', weight: '', time: '', completed: false }));
        exercises.push({
          exerciseId: exItem.exerciseId,
          exercise: ex,
          sets,
          flagNext: lastLog ? lastLog.flagNext : false,
          lastLog
        });
      }
      if (exercises.length > 0) {
        exerciseBlocks.push({ type: 'superset', targetSets: item.targetSets || 3, exercises });
      }
    }
  }

  _sessionState = { workoutId, workoutName: workout.name, exerciseBlocks };
  await saveActiveDraft(_sessionState);
  renderSessionView();
}

function renderSessionView() {
  if (!_sessionState) return;
  setPageTitle(_sessionState.workoutName.toUpperCase());
  showBack(true, confirmAbortSession);

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  _sessionState.exerciseBlocks.forEach((block, blockIdx) => {
    if (block.type === 'superset') {
      content.appendChild(buildSupersetBlock(block, blockIdx));
    } else {
      content.appendChild(buildStandaloneExerciseBlock(block, blockIdx));
    }
  });

  const bottomComplete = document.createElement('div');
  bottomComplete.style.cssText = 'padding: 16px;';
  bottomComplete.innerHTML = `
    <button class="btn btn-success btn-full btn-lg" onclick="confirmCompleteWorkout()">Mark Workout Complete ✓</button>
  `;
  content.appendChild(bottomComplete);
}

function buildStandaloneExerciseBlock(block, blockIdx) {
  const exBlock = document.createElement('div');
  exBlock.className = 'session-exercise-block animate-in';
  exBlock.id = `ex-block-${blockIdx}`;

  const exHeader = document.createElement('div');
  exHeader.className = 'session-exercise-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'session-exercise-name';
  if (block.flagNext) {
    const flag = document.createElement('span');
    flag.className = 'flag-icon';
    flag.title = 'Increase weight/reps this session';
    flag.textContent = '🟠';
    nameEl.appendChild(flag);
  }
  nameEl.appendChild(document.createTextNode(block.exercise.name));
  exHeader.appendChild(nameEl);

  if (block.lastLog) {
    const lastSummary = document.createElement('div');
    lastSummary.style.cssText = 'font-size:11px;color:var(--text-3)';
    lastSummary.textContent = `Last: ${summariseLastLog(block.lastLog.sets || [], block.exercise.measurements)}`;
    exHeader.appendChild(lastSummary);
  }
  exBlock.appendChild(exHeader);

  block.sets.forEach((set, setIdx) => {
    exBlock.appendChild(buildSetRow(block, blockIdx, setIdx));
  });

  const flagRow = document.createElement('div');
  flagRow.className = 'session-exercise-checkbox';
  flagRow.innerHTML = `
    <input type="checkbox" id="flag-${blockIdx}" ${block.flagNext ? 'checked' : ''} onchange="updateFlagNext(${blockIdx}, this.checked)">
    <label for="flag-${blockIdx}" style="cursor:pointer">Flag for increment next session 🟠</label>
  `;
  exBlock.appendChild(flagRow);

  return exBlock;
}

function buildSupersetBlock(block, blockIdx) {
  const container = document.createElement('div');
  container.className = 'session-superset-block animate-in';
  container.id = `ex-block-${blockIdx}`;

  const header = document.createElement('div');
  header.className = 'session-superset-header';
  header.innerHTML = `<span class="session-superset-label">Superset</span>`;
  container.appendChild(header);

  for (let roundIdx = 0; roundIdx < block.targetSets; roundIdx++) {
    container.appendChild(buildSupersetRound(block, blockIdx, roundIdx));
  }

  // Flag checkboxes, one per exercise
  const flagSection = document.createElement('div');
  flagSection.className = 'session-superset-flags';
  block.exercises.forEach((exBlock, exIdx) => {
    const flagRow = document.createElement('div');
    flagRow.className = 'session-exercise-checkbox';
    flagRow.innerHTML = `
      <input type="checkbox" id="flag-${blockIdx}-${exIdx}" ${exBlock.flagNext ? 'checked' : ''}
        onchange="updateSupersetFlagNext(${blockIdx}, ${exIdx}, this.checked)">
      <label for="flag-${blockIdx}-${exIdx}" style="cursor:pointer">
        Flag ${escapeHTML(exBlock.exercise.name)} 🟠
      </label>
    `;
    flagSection.appendChild(flagRow);
  });
  container.appendChild(flagSection);

  return container;
}

function buildSupersetRound(block, blockIdx, roundIdx) {
  const roundComplete = block.exercises.every(ex => ex.sets[roundIdx] && ex.sets[roundIdx].completed);

  const round = document.createElement('div');
  round.className = `superset-round ${roundComplete ? 'completed' : ''}`;
  round.id = `superset-round-${blockIdx}-${roundIdx}`;

  const roundHeader = document.createElement('div');
  roundHeader.className = 'superset-round-header';
  roundHeader.textContent = `Round ${roundIdx + 1}`;
  round.appendChild(roundHeader);

  block.exercises.forEach((exBlock, exIdx) => {
    const set = exBlock.sets[roundIdx];
    const lastSets = exBlock.lastLog ? (exBlock.lastLog.sets || []) : [];
    const lastSet = lastSets[roundIdx] || null;
    const measurements = exBlock.exercise.measurements || [];

    // Mini exercise header with name and last session summary
    const exHeader = document.createElement('div');
    exHeader.className = 'superset-ex-mini-header';
    if (exBlock.flagNext) {
      exHeader.appendChild(document.createTextNode('🟠 '));
    }
    exHeader.appendChild(document.createTextNode(exBlock.exercise.name));
    if (exBlock.lastLog) {
      const lastSummary = document.createElement('span');
      lastSummary.style.cssText = 'font-size:10px;color:var(--text-3);margin-left:6px';
      lastSummary.textContent = `Last: ${summariseLastLog(exBlock.lastLog.sets || [], measurements)}`;
      exHeader.appendChild(lastSummary);
    }
    round.appendChild(exHeader);

    // Input row (no individual complete button — shared at round level)
    const inputRow = document.createElement('div');
    inputRow.className = `session-set-row ${roundComplete ? 'completed' : ''}`;
    inputRow.style.cssText = 'border-bottom:none;padding-bottom:4px';

    const setNum = document.createElement('div');
    setNum.className = 'set-number';
    setNum.textContent = roundIdx + 1;
    inputRow.appendChild(setNum);

    const inputs = document.createElement('div');
    inputs.className = 'set-inputs';

    measurements.forEach(m => {
      const group = document.createElement('div');
      group.className = 'set-input-group';
      let labelText = m;
      if (m === 'weight') labelText = exBlock.exercise.unit || 'kg';
      if (m === 'time') labelText = 'sec';
      group.innerHTML = `<span class="set-input-label">${labelText}</span>`;

      const input = document.createElement('input');
      input.className = 'set-input';
      input.type = 'number';
      input.min = '0';
      input.inputMode = 'decimal';
      input.value = set ? (set[m] || '') : '';
      input.placeholder = lastSet && lastSet[m] ? lastSet[m] : '—';
      input.disabled = roundComplete;
      input.addEventListener('change', e => {
        _sessionState.exerciseBlocks[blockIdx].exercises[exIdx].sets[roundIdx][m] = e.target.value;
        saveActiveDraft(_sessionState);
      });
      group.appendChild(input);

      if (lastSet && lastSet[m]) {
        const prev = document.createElement('div');
        prev.className = 'set-prev';
        prev.textContent = `prev: ${lastSet[m]}`;
        group.appendChild(prev);
      }

      inputs.appendChild(group);
    });

    inputRow.appendChild(inputs);
    round.appendChild(inputRow);
  });

  // Shared mark complete button for this round
  const completeRow = document.createElement('div');
  completeRow.className = 'superset-round-complete-row';
  const completeBtn = document.createElement('button');
  completeBtn.className = `complete-btn ${roundComplete ? 'done' : ''}`;
  completeBtn.textContent = roundComplete ? '✓' : '○';
  completeBtn.addEventListener('click', () => toggleSupersetRound(blockIdx, roundIdx));
  completeRow.appendChild(completeBtn);
  round.appendChild(completeRow);

  return round;
}

async function toggleSupersetRound(blockIdx, roundIdx) {
  const block = _sessionState.exerciseBlocks[blockIdx];
  const wasComplete = block.exercises.every(ex => ex.sets[roundIdx] && ex.sets[roundIdx].completed);
  const newComplete = !wasComplete;

  for (const ex of block.exercises) {
    if (ex.sets[roundIdx]) ex.sets[roundIdx].completed = newComplete;
  }

  const roundEl = document.getElementById(`superset-round-${blockIdx}-${roundIdx}`);
  if (roundEl) roundEl.replaceWith(buildSupersetRound(block, blockIdx, roundIdx));

  saveActiveDraft(_sessionState);

  if (newComplete) {
    const timerEnabled = await getSetting('timerEnabled', true);
    if (timerEnabled) startRestTimer();
  }
}

function updateSupersetFlagNext(blockIdx, exIdx, value) {
  _sessionState.exerciseBlocks[blockIdx].exercises[exIdx].flagNext = value;
  saveActiveDraft(_sessionState);
}

function buildSetRow(block, blockIdx, setIdx) {
  const set = block.sets[setIdx];
  const lastSets = block.lastLog ? (block.lastLog.sets || []) : [];
  const lastSet = lastSets[setIdx] || null;
  const measurements = block.exercise.measurements || [];

  const row = document.createElement('div');
  row.className = `session-set-row ${set.completed ? 'completed' : ''}`;
  row.id = `set-row-${blockIdx}-${setIdx}`;

  const setNum = document.createElement('div');
  setNum.className = 'set-number';
  setNum.textContent = setIdx + 1;
  row.appendChild(setNum);

  const inputs = document.createElement('div');
  inputs.className = 'set-inputs';

  measurements.forEach(m => {
    const group = document.createElement('div');
    group.className = 'set-input-group';

    let labelText = m;
    if (m === 'weight') labelText = block.exercise.unit || 'kg';
    if (m === 'time') labelText = 'sec';

    group.innerHTML = `<span class="set-input-label">${labelText}</span>`;

    const input = document.createElement('input');
    input.className = 'set-input';
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'decimal';
    input.value = set[m] || '';
    input.placeholder = lastSet && lastSet[m] ? lastSet[m] : '—';
    input.disabled = set.completed;
    input.addEventListener('change', e => {
      _sessionState.exerciseBlocks[blockIdx].sets[setIdx][m] = e.target.value;
      saveActiveDraft(_sessionState);
    });
    group.appendChild(input);

    if (lastSet && lastSet[m]) {
      const prev = document.createElement('div');
      prev.className = 'set-prev';
      prev.textContent = `prev: ${lastSet[m]}`;
      group.appendChild(prev);
    }

    inputs.appendChild(group);
  });

  row.appendChild(inputs);

  const completeBtn = document.createElement('button');
  completeBtn.className = `complete-btn ${set.completed ? 'done' : ''}`;
  completeBtn.textContent = set.completed ? '✓' : '○';
  completeBtn.addEventListener('click', () => toggleSetComplete(blockIdx, setIdx));
  row.appendChild(completeBtn);

  return row;
}

async function toggleSetComplete(blockIdx, setIdx) {
  const block = _sessionState.exerciseBlocks[blockIdx];
  const set = block.sets[setIdx];
  set.completed = !set.completed;

  const row = document.getElementById(`set-row-${blockIdx}-${setIdx}`);
  if (row) row.replaceWith(buildSetRow(block, blockIdx, setIdx));

  saveActiveDraft(_sessionState);

  if (set.completed) {
    const timerEnabled = await getSetting('timerEnabled', true);
    if (timerEnabled) startRestTimer();
  }
}

function updateFlagNext(blockIdx, value) {
  _sessionState.exerciseBlocks[blockIdx].flagNext = value;
  saveActiveDraft(_sessionState);
}

function summariseLastLog(sets, measurements) {
  if (!sets || sets.length === 0) return 'no data';
  const completed = sets.filter(s => s.completed !== false);
  if (completed.length === 0) return 'no data';
  const first = completed[0];
  const parts = [];
  if (measurements.includes('weight') && first.weight) parts.push(`${first.weight}`);
  if (measurements.includes('reps') && first.reps) parts.push(`${first.reps} reps`);
  if (measurements.includes('time') && first.time) parts.push(`${first.time}s`);
  return `${parts.join(' × ')} × ${completed.length} sets`;
}

/* ---- Rest Timer ---- */
function startRestTimer() {
  const overlay = document.getElementById('rest-timer');
  const display = document.getElementById('rest-timer-display');
  overlay.classList.remove('hidden');

  let remaining = _restTimerSeconds;
  updateTimerDisplay(display, remaining);

  if (_restTimerInterval) clearInterval(_restTimerInterval);
  _restTimerInterval = setInterval(() => {
    remaining--;
    updateTimerDisplay(display, remaining);
    if (remaining <= 10) display.classList.add('warning');
    else display.classList.remove('warning');
    if (remaining <= 0) stopRestTimer();
  }, 1000);
}

function stopRestTimer() {
  if (_restTimerInterval) { clearInterval(_restTimerInterval); _restTimerInterval = null; }
  const overlay = document.getElementById('rest-timer');
  const display = document.getElementById('rest-timer-display');
  overlay.classList.add('hidden');
  display.classList.remove('warning');
}

function updateTimerDisplay(el, seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const skipBtn = document.getElementById('rest-timer-skip');
  if (skipBtn) skipBtn.addEventListener('click', stopRestTimer);
});

/* ---- Complete Workout ---- */
async function confirmCompleteWorkout() {
  let hasIncomplete = false;
  for (const block of _sessionState.exerciseBlocks) {
    if (block.type === 'superset') {
      for (let i = 0; i < block.targetSets; i++) {
        if (!block.exercises.every(ex => ex.sets[i] && ex.sets[i].completed)) {
          hasIncomplete = true;
          break;
        }
      }
    } else {
      for (const set of block.sets) {
        if (!set.completed) { hasIncomplete = true; break; }
      }
    }
    if (hasIncomplete) break;
  }

  if (hasIncomplete) {
    showModal('Incomplete Sets', async () => {
      return `<p style="color:var(--text-2);font-size:15px;line-height:1.5">Some sets haven't been marked as complete. Are you sure you want to finish this workout?</p>`;
    }, async () => {
      await finishWorkout();
      return true;
    }, 'Yes, Finish', 'btn-primary');
  } else {
    await finishWorkout();
  }
}

async function finishWorkout() {
  stopRestTimer();
  await clearActiveDraft();

  const now = Date.now();
  const sessionId = await saveSession({
    workoutId: _sessionState.workoutId,
    workoutName: _sessionState.workoutName,
    completedAt: now
  });

  for (const block of _sessionState.exerciseBlocks) {
    if (block.type === 'superset') {
      for (const exBlock of block.exercises) {
        await saveExerciseLog({ exerciseId: exBlock.exerciseId, sessionId, sets: exBlock.sets, flagNext: exBlock.flagNext });
        await pruneExerciseLogs(exBlock.exerciseId);
      }
    } else {
      await saveExerciseLog({ exerciseId: block.exerciseId, sessionId, sets: block.sets, flagNext: block.flagNext });
      await pruneExerciseLogs(block.exerciseId);
    }
  }

  await advanceProgramAfterWorkout(_sessionState.workoutId);
  _sessionState = null;
  showWorkoutCompleteScreen();
}

function showWorkoutCompleteScreen() {
  const screen = document.getElementById('workout-complete-screen');
  screen.classList.remove('hidden');

  setTimeout(() => {
    screen.classList.add('fade-out');
    setTimeout(() => {
      screen.classList.add('hidden');
      screen.classList.remove('fade-out');
      navigateTo('home');
    }, 600);
  }, 3000);
}

function resumeSession() {
  if (_sessionState) renderSessionView();
}

function confirmAbortSession() {
  showModal('Abort Workout', async () => {
    return `<p style="color:var(--text-2);font-size:15px;line-height:1.5">Abandon this session? Progress will not be saved.</p>`;
  }, async () => {
    stopRestTimer();
    await clearActiveDraft();
    _sessionState = null;
    renderHomeView();
    showBack(false);
    return true;
  }, 'Abandon', 'btn-danger');
}
