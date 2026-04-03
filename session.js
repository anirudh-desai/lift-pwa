/* =============================================
   LIFT — Active Workout Session
   ============================================= */

let _restTimerInterval = null;
let _restTimerSeconds = 90;
let _sessionState = null; // { workoutId, exerciseBlocks: [{exerciseId, sets: [{...}], flagNext}] }

async function renderHomeView() {
  setPageTitle('LIFT');
  showBack(false);

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

  // Next workout from active program
  const next = await getNextWorkoutInProgram();
  if (next && next.workout) {
    const card = document.createElement('div');
    card.className = 'next-workout-card';
    const exCount = (next.workout.exercises || []).length;
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
    const exCount = (w.exercises || []).length;
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
  // If user picks a workout that's not the scheduled one, re-anchor the program
  if (!isScheduled) {
    await anchorProgramToWorkout(workoutId);
  }

  const workout = await getWorkout(workoutId);
  if (!workout) return;

  const unit = await getSetting('unit', 'kg');
  _restTimerSeconds = await getSetting('restTimer', 90);

  // Load previous logs for each exercise
  const exerciseBlocks = [];
  for (const we of (workout.exercises || [])) {
    const ex = await getExercise(we.exerciseId);
    if (!ex) continue;
    const lastLog = await getLastExerciseLog(we.exerciseId);
    const sets = [];
    for (let i = 0; i < (we.targetSets || 3); i++) {
      sets.push({ reps: '', weight: '', time: '', completed: false });
    }
    exerciseBlocks.push({
      exerciseId: we.exerciseId,
      exercise: ex,
      targetSets: we.targetSets || 3,
      sets,
      flagNext: lastLog ? lastLog.flagNext : false,
      lastLog
    });
  }

  _sessionState = { workoutId, workoutName: workout.name, exerciseBlocks, unit };
  renderSessionView();
}

function renderSessionView() {
  if (!_sessionState) return;
  setPageTitle(_sessionState.workoutName.toUpperCase());
  showBack(true, confirmAbortSession);

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  // Header bar
  const headerBar = document.createElement('div');
  headerBar.style.cssText = 'padding: 12px 16px 0; display: flex; justify-content: flex-end;';
  headerBar.innerHTML = `
    <button class="btn btn-success" onclick="confirmCompleteWorkout()">Mark Complete ✓</button>
  `;
  content.appendChild(headerBar);

  _sessionState.exerciseBlocks.forEach((block, blockIdx) => {
    const exBlock = document.createElement('div');
    exBlock.className = 'session-exercise-block animate-in';
    exBlock.id = `ex-block-${blockIdx}`;

    // Exercise header
    const exHeader = document.createElement('div');
    exHeader.className = 'session-exercise-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'session-exercise-name';

    // Yellow flag if previous log flagged increment
    if (block.flagNext) {
      const flag = document.createElement('span');
      flag.className = 'flag-icon';
      flag.title = 'Increase weight/reps this session';
      flag.textContent = '🟡';
      nameEl.appendChild(flag);
    }
    nameEl.appendChild(document.createTextNode(block.exercise.name));
    exHeader.appendChild(nameEl);

    // Last session summary
    if (block.lastLog) {
      const lastSummary = document.createElement('div');
      lastSummary.style.cssText = 'font-size:11px;color:var(--text-3)';
      const lastSets = block.lastLog.sets || [];
      lastSummary.textContent = `Last: ${summariseLastLog(lastSets, block.exercise.measurements)}`;
      exHeader.appendChild(lastSummary);
    }

    exBlock.appendChild(exHeader);

    // Set rows
    block.sets.forEach((set, setIdx) => {
      const row = buildSetRow(block, blockIdx, setIdx);
      exBlock.appendChild(row);
    });

    // Increment flag checkbox
    const flagRow = document.createElement('div');
    flagRow.className = 'session-exercise-checkbox';
    flagRow.innerHTML = `
      <input type="checkbox" id="flag-${blockIdx}" ${block.flagNext ? 'checked' : ''} onchange="updateFlagNext(${blockIdx}, this.checked)">
      <label for="flag-${blockIdx}" style="cursor:pointer">Flag for increment next session 🟡</label>
    `;
    exBlock.appendChild(flagRow);

    content.appendChild(exBlock);
  });

  // Bottom complete button
  const bottomComplete = document.createElement('div');
  bottomComplete.style.cssText = 'padding: 16px;';
  bottomComplete.innerHTML = `
    <button class="btn btn-success btn-full btn-lg" onclick="confirmCompleteWorkout()">Mark Workout Complete ✓</button>
  `;
  content.appendChild(bottomComplete);
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
    if (m === 'weight') labelText = _sessionState.unit === 'lbs' ? 'lbs' : 'kg';
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

  // Complete button
  const completeBtn = document.createElement('button');
  completeBtn.className = `complete-btn ${set.completed ? 'done' : ''}`;
  completeBtn.textContent = set.completed ? '✓' : '○';
  completeBtn.addEventListener('click', () => toggleSetComplete(blockIdx, setIdx));
  row.appendChild(completeBtn);

  return row;
}

function toggleSetComplete(blockIdx, setIdx) {
  const block = _sessionState.exerciseBlocks[blockIdx];
  const set = block.sets[setIdx];
  set.completed = !set.completed;

  // Re-render just this row
  const row = document.getElementById(`set-row-${blockIdx}-${setIdx}`);
  if (row) {
    const newRow = buildSetRow(block, blockIdx, setIdx);
    row.replaceWith(newRow);
  }

  if (set.completed) {
    startRestTimer();
  }
}

function updateFlagNext(blockIdx, value) {
  _sessionState.exerciseBlocks[blockIdx].flagNext = value;
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
  // Check for incomplete sets
  let hasIncomplete = false;
  for (const block of _sessionState.exerciseBlocks) {
    for (const set of block.sets) {
      if (!set.completed) { hasIncomplete = true; break; }
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

  const now = Date.now();
  const sessionId = await saveSession({
    workoutId: _sessionState.workoutId,
    workoutName: _sessionState.workoutName,
    completedAt: now
  });

  // Save exercise logs and prune history
  for (const block of _sessionState.exerciseBlocks) {
    await saveExerciseLog({
      exerciseId: block.exerciseId,
      sessionId,
      sets: block.sets,
      flagNext: block.flagNext
    });
    await pruneExerciseLogs(block.exerciseId);
  }

  // Advance program
  await advanceProgramAfterWorkout(_sessionState.workoutId);

  _sessionState = null;

  // Show completion screen
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

function confirmAbortSession() {
  showModal('Abort Workout', async () => {
    return `<p style="color:var(--text-2);font-size:15px;line-height:1.5">Abandon this session? Progress will not be saved.</p>`;
  }, async () => {
    stopRestTimer();
    _sessionState = null;
    renderHomeView();
    showBack(false);
    return true;
  }, 'Abandon', 'btn-danger');
}
