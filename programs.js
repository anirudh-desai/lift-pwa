/* =============================================
   LIFT — Program Builder
   ============================================= */

async function renderProgramsView() {
  setPageTitle('PROGRAMS');
  showBack(false);

  const programs = await getAllPrograms();
  const content = document.getElementById('main-content');
  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">${programs.length} Program${programs.length !== 1 ? 's' : ''}</span>
    <button class="btn btn-primary btn-sm" onclick="openProgramEditor()">+ New</button>
  `;
  content.appendChild(header);

  if (programs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">📅</div>
      <div class="empty-state-title">No programs yet</div>
      <div class="empty-state-text">Sequence workouts into a cycling program</div>
    `;
    content.appendChild(empty);
    return;
  }

  const activeId = await getSetting('activeProgram');

  const listWrapper = document.createElement('div');
  listWrapper.style.cssText = 'margin: 0 16px; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;';

  programs.forEach(p => {
    const wCount = (p.workoutIds || []).length;
    const isActive = activeId === p.id;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-name" style="display:flex;align-items:center;gap:8px">
          ${escapeHTML(p.name)}
          ${isActive ? '<span class="tag" style="background:var(--green-dim);color:var(--green);font-size:10px">ACTIVE</span>' : ''}
        </div>
        <div class="list-item-meta">${wCount} workout${wCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-item-actions">
        ${!isActive ? `<button class="btn btn-sm btn-ghost" onclick="setActiveProgram(${p.id})">Set Active</button>` : ''}
        <button class="icon-btn" onclick="openProgramEditor(${p.id})">✏️</button>
        <button class="icon-btn" onclick="confirmDeleteProgram(${p.id}, '${escapeAttr(p.name)}')">🗑️</button>
      </div>
    `;
    listWrapper.appendChild(item);
  });

  content.appendChild(listWrapper);
}

async function setActiveProgram(id) {
  await setSetting('activeProgram', id);
  showToast('Active program updated');
  renderProgramsView();
}

async function openProgramEditor(id = null) {
  const isEdit = id !== null;
  setPageTitle(isEdit ? 'EDIT PROGRAM' : 'NEW PROGRAM');
  showBack(true, () => renderProgramsView());

  const content = document.getElementById('main-content');
  content.innerHTML = '<div style="padding:16px"><div style="color:var(--text-3);font-size:14px">Loading...</div></div>';

  let program = null;
  if (isEdit) {
    program = await getProgram(id);
  } else {
    program = { name: '', workoutIds: [] };
  }

  const workouts = await getAllWorkouts();
  renderProgramEditorUI(program, workouts, isEdit);
}

function renderProgramEditorUI(program, allWorkouts, isEdit) {
  const content = document.getElementById('main-content');
  content.innerHTML = '';

  const nameSection = document.createElement('div');
  nameSection.style.cssText = 'padding: 16px;';
  nameSection.innerHTML = `
    <div class="input-group">
      <label class="input-label">Program Name</label>
      <input id="program-name" class="input" type="text" placeholder="e.g. 5-Day A/B Split" value="${escapeHTML(program.name)}">
    </div>
  `;
  content.appendChild(nameSection);

  const workoutSection = document.createElement('div');
  const workoutHeader = document.createElement('div');
  workoutHeader.className = 'section-header';
  workoutHeader.innerHTML = `
    <span class="section-title">Workout Sequence</span>
    <button class="btn btn-secondary btn-sm" onclick="openAddWorkoutToProgram()">+ Add</button>
  `;
  workoutSection.appendChild(workoutHeader);

  const helpText = document.createElement('div');
  helpText.style.cssText = 'padding: 0 16px 10px; font-size: 12px; color: var(--text-3);';
  helpText.textContent = 'Workouts will cycle in order. Drag to reorder.';
  workoutSection.appendChild(helpText);

  const wList = document.createElement('div');
  wList.id = 'program-workout-list';
  wList.style.cssText = 'margin: 0 16px; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;';

  workoutSection.appendChild(wList);
  content.appendChild(workoutSection);

  const saveSection = document.createElement('div');
  saveSection.style.cssText = 'padding: 24px 16px 16px;';
  saveSection.innerHTML = `
    <button class="btn btn-primary btn-full btn-lg" onclick="saveProgramFromEditor(${isEdit ? program.id : 'null'})">
      ${isEdit ? 'Save Changes' : 'Create Program'}
    </button>
  `;
  content.appendChild(saveSection);

  window._programEditorState = {
    workoutIds: program.workoutIds ? [...program.workoutIds] : [],
    allWorkouts
  };

  renderProgramWorkoutRows();
}

function renderProgramWorkoutRows() {
  const container = document.getElementById('program-workout-list');
  if (!container) return;

  const state = window._programEditorState;
  if (!state || state.workoutIds.length === 0) {
    container.innerHTML = `<div style="padding:20px 16px;color:var(--text-3);font-size:14px;text-align:center">No workouts in sequence yet</div>`;
    return;
  }

  container.innerHTML = '';
  state.workoutIds.forEach((wId, idx) => {
    const w = state.allWorkouts.find(x => x.id === wId);
    if (!w) return;
    const row = document.createElement('div');
    row.className = 'program-workout-row';
    row.dataset.idx = idx;
    row.innerHTML = `
      <span class="program-workout-order">${idx + 1}</span>
      <div style="flex:1">
        <div style="font-size:15px;font-weight:500">${escapeHTML(w.name)}</div>
        <div style="font-size:12px;color:var(--text-2)">${(w.exercises || []).length} exercises</div>
      </div>
      <div style="display:flex;gap:4px">
        ${idx > 0 ? `<button class="icon-btn" onclick="moveProgramWorkout(${idx}, -1)">↑</button>` : '<span style="width:32px"></span>'}
        ${idx < state.workoutIds.length - 1 ? `<button class="icon-btn" onclick="moveProgramWorkout(${idx}, 1)">↓</button>` : '<span style="width:32px"></span>'}
        <button class="icon-btn" onclick="removeProgramWorkout(${idx})">✕</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function moveProgramWorkout(idx, direction) {
  const state = window._programEditorState;
  if (!state) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.workoutIds.length) return;
  const tmp = state.workoutIds[idx];
  state.workoutIds[idx] = state.workoutIds[newIdx];
  state.workoutIds[newIdx] = tmp;
  renderProgramWorkoutRows();
}

function removeProgramWorkout(idx) {
  const state = window._programEditorState;
  if (!state) return;
  state.workoutIds.splice(idx, 1);
  renderProgramWorkoutRows();
}

function openAddWorkoutToProgram() {
  const state = window._programEditorState;
  if (!state) return;

  if (state.allWorkouts.length === 0) {
    showToast('Create workouts first');
    return;
  }

  // Allow duplicates (user may want same workout in sequence multiple times)
  const options = state.allWorkouts.map(w =>
    `<option value="${w.id}">${escapeHTML(w.name)}</option>`
  ).join('');

  showModal('Add Workout', async () => {
    return `
      <div class="input-group">
        <label class="input-label">Select Workout</label>
        <select id="add-w-select" class="select">
          <option value="">Choose...</option>
          ${options}
        </select>
      </div>
    `;
  }, async () => {
    const val = document.getElementById('add-w-select').value;
    if (!val) { showToast('Select a workout'); return false; }
    window._programEditorState.workoutIds.push(parseInt(val));
    renderProgramWorkoutRows();
    return true;
  }, 'Add');
}

async function saveProgramFromEditor(existingId) {
  const name = document.getElementById('program-name').value.trim();
  if (!name) { showToast('Program name required'); return; }

  const state = window._programEditorState;
  if (!state || state.workoutIds.length === 0) {
    showToast('Add at least one workout');
    return;
  }

  const program = { name, workoutIds: state.workoutIds };
  if (existingId) program.id = existingId;

  const savedId = await saveProgram(program);

  // If this is the only program, auto-set as active
  const allPrograms = await getAllPrograms();
  if (allPrograms.length === 1) {
    await setSetting('activeProgram', savedId);
  }

  showToast(existingId ? 'Program saved' : 'Program created');
  window._programEditorState = null;
  renderProgramsView();
  showBack(false);
}

async function confirmDeleteProgram(id, name) {
  showModal('Delete Program', async () => {
    return `<p style="color:var(--text-2);font-size:15px;line-height:1.5">Delete <strong style="color:var(--text)">${escapeHTML(name)}</strong>? This cannot be undone.</p>`;
  }, async () => {
    await deleteProgram(id);
    const activeId = await getSetting('activeProgram');
    if (activeId === id) await setSetting('activeProgram', null);
    showToast('Program deleted');
    renderProgramsView();
    return true;
  }, 'Delete', 'btn-danger');
}

/* ---- Programme sequence logic (used by home/session) ---- */

async function getNextWorkoutInProgram() {
  const activeProgramId = await getSetting('activeProgram');
  if (!activeProgramId) return null;

  const program = await getProgram(activeProgramId);
  if (!program || !program.workoutIds || program.workoutIds.length === 0) return null;

  const state = await getProgramState(activeProgramId);
  const nextIndex = state ? state.nextWorkoutIndex : 0;
  const safeIndex = nextIndex % program.workoutIds.length;
  const workoutId = program.workoutIds[safeIndex];
  const workout = await getWorkout(workoutId);

  return { workout, index: safeIndex, program };
}

async function advanceProgramAfterWorkout(workoutId) {
  const activeProgramId = await getSetting('activeProgram');
  if (!activeProgramId) return;

  const program = await getProgram(activeProgramId);
  if (!program || !program.workoutIds) return;

  // Find where the completed workout is in the sequence
  const currentIdx = program.workoutIds.indexOf(workoutId);
  if (currentIdx === -1) return;

  const nextIdx = (currentIdx + 1) % program.workoutIds.length;
  await setProgramState(activeProgramId, nextIdx);
}

async function anchorProgramToWorkout(workoutId) {
  // Called when user manually selects a workout that's out of sequence
  const activeProgramId = await getSetting('activeProgram');
  if (!activeProgramId) return;

  const program = await getProgram(activeProgramId);
  if (!program || !program.workoutIds) return;

  const idx = program.workoutIds.indexOf(workoutId);
  if (idx === -1) return;

  // Next after this selection will be idx+1
  const nextIdx = (idx + 1) % program.workoutIds.length;
  await setProgramState(activeProgramId, nextIdx);
}
