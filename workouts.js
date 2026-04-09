/* =============================================
   LIFT — Workout Builder
   ============================================= */

// Convert old {exercises:[]} format to new {items:[]} format
function normalizeWorkoutItems(workout) {
  if (workout.items) return workout;
  const exercises = workout.exercises || [];
  return {
    ...workout,
    items: exercises.map(e => ({ type: 'exercise', exerciseId: e.exerciseId, targetSets: e.targetSets || 3 }))
  };
}

function countItemsExercises(items) {
  let count = 0;
  for (const item of items) {
    if (item.type === 'exercise') count++;
    else if (item.type === 'superset') count += item.exercises.length;
  }
  return count;
}

async function renderWorkoutsView() {
  setPageTitle('WORKOUTS');
  showBack(false);

  const workouts = await getAllWorkouts();
  const content = document.getElementById('main-content');
  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">${workouts.length} Workout${workouts.length !== 1 ? 's' : ''}</span>
    <button class="btn btn-primary btn-sm" onclick="openWorkoutEditor()">+ New</button>
  `;
  content.appendChild(header);

  if (workouts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">No workouts yet</div>
      <div class="empty-state-text">Build workouts from your exercise library</div>
    `;
    content.appendChild(empty);
    return;
  }

  const listWrapper = document.createElement('div');
  listWrapper.style.cssText = 'margin: 0 16px; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;';

  workouts.forEach(w => {
    const normalized = normalizeWorkoutItems(w);
    const exCount = countItemsExercises(normalized.items || []);
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-name">${escapeHTML(w.name)}</div>
        <div class="list-item-meta">${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" onclick="openWorkoutEditor(${w.id})">✏️</button>
        <button class="icon-btn" onclick="confirmDeleteWorkout(${w.id}, '${escapeAttr(w.name)}')">🗑️</button>
      </div>
    `;
    listWrapper.appendChild(row);
  });

  content.appendChild(listWrapper);
}

async function openWorkoutEditor(id = null) {
  const isEdit = id !== null;
  setPageTitle(isEdit ? 'EDIT WORKOUT' : 'NEW WORKOUT');
  showBack(true, () => renderWorkoutsView());

  const content = document.getElementById('main-content');
  content.innerHTML = '<div style="padding:16px"><div style="color:var(--text-3);font-size:14px">Loading...</div></div>';

  let workout = null;
  if (isEdit) {
    const raw = await getWorkout(id);
    workout = normalizeWorkoutItems(raw);
  } else {
    workout = { name: '', items: [] };
  }

  const exercises = await getAllExercises();
  exercises.sort((a, b) => a.name.localeCompare(b.name));

  renderWorkoutEditorUI(workout, exercises, isEdit);
}

function renderWorkoutEditorUI(workout, allExercises, isEdit) {
  const content = document.getElementById('main-content');
  content.innerHTML = '';

  // Name input
  const nameSection = document.createElement('div');
  nameSection.style.cssText = 'padding: 16px;';
  nameSection.innerHTML = `
    <div class="input-group">
      <label class="input-label">Workout Name</label>
      <input id="workout-name" class="input" type="text" placeholder="e.g. Day A — Push" value="${escapeHTML(workout.name)}">
    </div>
  `;
  content.appendChild(nameSection);

  // Section header with two action buttons
  const exSection = document.createElement('div');
  const exHeader = document.createElement('div');
  exHeader.className = 'section-header';
  exHeader.innerHTML = `
    <span class="section-title">Exercises</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary btn-sm" onclick="addSupersetToWorkout()">+ Superset</button>
      <button class="btn btn-primary btn-sm" onclick="openAddExerciseToWorkout()">+ Exercise</button>
    </div>
  `;
  exSection.appendChild(exHeader);

  const itemsList = document.createElement('div');
  itemsList.id = 'workout-items-list';
  exSection.appendChild(itemsList);
  content.appendChild(exSection);

  // Save button
  const saveSection = document.createElement('div');
  saveSection.style.cssText = 'padding: 24px 16px 16px;';
  saveSection.innerHTML = `
    <button class="btn btn-primary btn-full btn-lg" onclick="saveWorkoutFromEditor(${isEdit ? workout.id : 'null'})">
      ${isEdit ? 'Save Changes' : 'Create Workout'}
    </button>
  `;
  content.appendChild(saveSection);

  window._workoutEditorState = {
    items: (workout.items || []).map(item => {
      if (item.type === 'superset') return { ...item, exercises: [...item.exercises] };
      return { ...item };
    }),
    allExercises
  };

  refreshWorkoutItemsList();
}

function refreshWorkoutItemsList() {
  const container = document.getElementById('workout-items-list');
  if (!container || !window._workoutEditorState) return;
  const { items, allExercises } = window._workoutEditorState;
  container.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px 16px;color:var(--text-3);font-size:14px;text-align:center;margin:0 16px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius)';
    empty.textContent = 'No exercises added yet';
    container.appendChild(empty);
    return;
  }

  // Render items with a gap drop zone before each item and one at the end
  items.forEach((item, idx) => {
    container.appendChild(buildDropGap(idx));
    if (item.type === 'exercise') {
      container.appendChild(buildStandaloneExerciseRow(item, idx, items, allExercises));
    } else if (item.type === 'superset') {
      container.appendChild(buildSupersetBox(item, idx, items, allExercises));
    }
  });
  container.appendChild(buildDropGap(items.length));
}

// Gap drop zones sit between items and handle both standalone reordering
// and superset-exercise extraction to a specific position.
function buildDropGap(insertIdx) {
  const gap = document.createElement('div');
  gap.className = 'item-drop-gap';

  gap.addEventListener('dragover', e => {
    if (!window._dragItem) return;
    // Skip if standalone dragged to same/adjacent position (no-op)
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    gap.classList.add('drop-gap-active');
  });
  gap.addEventListener('dragleave', () => gap.classList.remove('drop-gap-active'));
  gap.addEventListener('drop', e => {
    e.preventDefault();
    gap.classList.remove('drop-gap-active');
    if (!window._dragItem) return;
    const drag = window._dragItem;
    const state = window._workoutEditorState;

    if (drag.source === 'standalone') {
      const fromIdx = drag.itemIdx;
      const draggedItem = state.items[fromIdx];
      if (!draggedItem) return;
      state.items.splice(fromIdx, 1);
      // Adjust target index since we removed an item before it
      const targetIdx = insertIdx > fromIdx ? insertIdx - 1 : insertIdx;
      state.items.splice(targetIdx, 0, draggedItem);

    } else if (drag.source === 'superset') {
      const srcSuperset = state.items[drag.itemIdx];
      if (!srcSuperset) return;
      const ex = srcSuperset.exercises[drag.exIdx];
      if (!ex) return;
      srcSuperset.exercises.splice(drag.exIdx, 1);
      // Insert as standalone at the gap position
      // No index adjustment needed: superset item stays in the array
      state.items.splice(insertIdx, 0, { type: 'exercise', exerciseId: ex.exerciseId, targetSets: srcSuperset.targetSets || 3 });
    }

    refreshWorkoutItemsList();
  });

  return gap;
}

function buildStandaloneExerciseRow(item, idx, items, allExercises) {
  const ex = allExercises.find(e => e.id === item.exerciseId);
  if (!ex) return document.createElement('div');

  const row = document.createElement('div');
  row.className = 'editor-exercise-row';
  row.draggable = true;
  row.innerHTML = `
    <span class="editor-row-drag-handle" title="Drag into a superset">⠿</span>
    <div class="editor-row-main">
      <div class="editor-row-name">${escapeHTML(ex.name)}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <label style="font-size:12px;color:var(--text-2)">Sets:</label>
        <input
          class="set-input"
          type="number"
          min="1" max="20"
          value="${item.targetSets || 3}"
          style="width:52px;font-size:13px;padding:4px 6px"
          onchange="updateStandaloneExerciseSets(${idx}, this.value)"
        >
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
      ${idx > 0 ? `<button class="icon-btn" onclick="moveItem(${idx}, -1)">↑</button>` : '<span style="width:32px"></span>'}
      ${idx < items.length - 1 ? `<button class="icon-btn" onclick="moveItem(${idx}, 1)">↓</button>` : '<span style="width:32px"></span>'}
      <button class="icon-btn" onclick="removeItemFromWorkout(${idx})">✕</button>
    </div>
  `;

  row.addEventListener('dragstart', e => {
    window._dragItem = { source: 'standalone', itemIdx: idx };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => row.classList.add('dragging'), 0);
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    window._dragItem = null;
  });

  return row;
}

function buildSupersetBox(item, idx, items, allExercises) {
  const box = document.createElement('div');
  box.className = 'superset-box';

  // Header
  const header = document.createElement('div');
  header.className = 'superset-box-header';
  header.innerHTML = `
    <span class="superset-box-label">Superset</span>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <label style="font-size:12px;color:var(--text-2)">Sets:</label>
      <input
        class="set-input"
        type="number"
        min="1" max="20"
        value="${item.targetSets || 3}"
        style="width:52px;font-size:13px;padding:4px 6px"
        onchange="updateSupersetSets(${idx}, this.value)"
      >
      ${idx > 0 ? `<button class="icon-btn" onclick="moveItem(${idx}, -1)">↑</button>` : '<span style="width:32px"></span>'}
      ${idx < items.length - 1 ? `<button class="icon-btn" onclick="moveItem(${idx}, 1)">↓</button>` : '<span style="width:32px"></span>'}
      <button class="icon-btn" style="color:var(--accent)" onclick="deleteSupersetBox(${idx})">✕</button>
    </div>
  `;
  box.appendChild(header);

  // Exercises within superset
  const exList = document.createElement('div');
  exList.className = 'superset-box-exercises';

  if (item.exercises.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'superset-box-empty';
    empty.textContent = 'Drop an exercise here or use + Add Exercise';
    exList.appendChild(empty);
  } else {
    item.exercises.forEach((exItem, exIdx) => {
      const ex = allExercises.find(e => e.id === exItem.exerciseId);
      if (!ex) return;

      const exRow = document.createElement('div');
      exRow.className = 'superset-inner-row';
      exRow.draggable = true;
      exRow.innerHTML = `
        <span class="editor-row-drag-handle" style="font-size:14px" title="Drag to another superset">⠿</span>
        <div style="flex:1;min-width:0;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escapeHTML(ex.name)}
        </div>
        <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          ${exIdx > 0 ? `<button class="icon-btn" onclick="moveExerciseInSuperset(${idx}, ${exIdx}, -1)">↑</button>` : '<span style="width:32px"></span>'}
          ${exIdx < item.exercises.length - 1 ? `<button class="icon-btn" onclick="moveExerciseInSuperset(${idx}, ${exIdx}, 1)">↓</button>` : '<span style="width:32px"></span>'}
          <button class="icon-btn" onclick="removeExerciseFromSuperset(${idx}, ${exIdx})">✕</button>
        </div>
      `;

      exRow.addEventListener('dragstart', e => {
        window._dragItem = { source: 'superset', itemIdx: idx, exIdx };
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => exRow.classList.add('dragging'), 0);
      });
      exRow.addEventListener('dragend', () => {
        exRow.classList.remove('dragging');
        window._dragItem = null;
      });

      exList.appendChild(exRow);
    });
  }

  box.appendChild(exList);

  // Footer with + Add Exercise button
  const footer = document.createElement('div');
  footer.className = 'superset-box-footer';
  footer.innerHTML = `<button class="btn btn-ghost btn-sm btn-full" onclick="openAddExerciseToSuperset(${idx})">+ Add Exercise</button>`;
  box.appendChild(footer);

  // Drop events: exercises can be dragged into this superset
  box.addEventListener('dragover', e => {
    if (!window._dragItem) return;
    if (window._dragItem.source === 'superset' && window._dragItem.itemIdx === idx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    box.classList.add('drag-over-superset');
  });
  box.addEventListener('dragleave', e => {
    if (!box.contains(e.relatedTarget)) box.classList.remove('drag-over-superset');
  });
  box.addEventListener('drop', e => {
    e.preventDefault();
    box.classList.remove('drag-over-superset');
    if (!window._dragItem) return;
    const drag = window._dragItem;
    const state = window._workoutEditorState;

    let exerciseId = null;
    if (drag.source === 'standalone') {
      const draggedItem = state.items[drag.itemIdx];
      if (!draggedItem || draggedItem.type !== 'exercise') return;
      exerciseId = draggedItem.exerciseId;
    } else if (drag.source === 'superset') {
      if (drag.itemIdx === idx) return;
      const srcSuperset = state.items[drag.itemIdx];
      if (!srcSuperset) return;
      exerciseId = srcSuperset.exercises[drag.exIdx]?.exerciseId;
    }
    if (!exerciseId) return;

    const targetSuperset = state.items[idx];
    if (targetSuperset.exercises.some(e => e.exerciseId === exerciseId)) {
      showToast('Exercise already in this superset');
      return;
    }

    if (drag.source === 'standalone') {
      state.items.splice(drag.itemIdx, 1);
    } else {
      state.items[drag.itemIdx].exercises.splice(drag.exIdx, 1);
    }
    targetSuperset.exercises.push({ exerciseId });
    refreshWorkoutItemsList();
  });

  return box;
}

function addSupersetToWorkout() {
  if (!window._workoutEditorState) return;
  window._workoutEditorState.items.push({ type: 'superset', targetSets: 3, exercises: [] });
  refreshWorkoutItemsList();
}

function getAllUsedExerciseIds(items) {
  const ids = new Set();
  for (const item of items) {
    if (item.type === 'exercise') ids.add(item.exerciseId);
    else if (item.type === 'superset') item.exercises.forEach(e => ids.add(e.exerciseId));
  }
  return ids;
}

function buildExerciseSelectModalContent(selectId, options) {
  return `
    <div class="input-group">
      <label class="input-label">Select Exercise</label>
      <select id="${selectId}" class="select">
        <option value="">Choose...</option>
        ${options}
      </select>
    </div>
    <div style="text-align:center;margin-top:4px">
      <button type="button" class="btn btn-ghost btn-sm" style="font-size:12px" id="create-new-ex-btn">+ Create New Exercise</button>
    </div>
  `;
}

function openAddExerciseToWorkout() {
  const state = window._workoutEditorState;
  if (!state) return;

  const usedIds = getAllUsedExerciseIds(state.items);
  const options = state.allExercises
    .filter(ex => !usedIds.has(ex.id))
    .map(ex => `<option value="${ex.id}">${escapeHTML(ex.name)} (${(ex.measurements || []).join(', ')})</option>`)
    .join('');

  showModal('Add Exercise', async () => {
    const html = buildExerciseSelectModalContent('add-ex-select', options);
    setTimeout(() => {
      const btn = document.getElementById('create-new-ex-btn');
      if (btn) btn.addEventListener('click', () => { closeModal(); openCreateExerciseFromEditor(null); });
    }, 0);
    return html;
  }, async () => {
    const val = document.getElementById('add-ex-select').value;
    if (!val) { showToast('Select an exercise'); return false; }
    window._workoutEditorState.items.push({ type: 'exercise', exerciseId: parseInt(val), targetSets: 3 });
    refreshWorkoutItemsList();
    return true;
  }, 'Add');
}

function openAddExerciseToSuperset(supersetIdx) {
  const state = window._workoutEditorState;
  if (!state) return;

  const usedIds = getAllUsedExerciseIds(state.items);
  const options = state.allExercises
    .filter(ex => !usedIds.has(ex.id))
    .map(ex => `<option value="${ex.id}">${escapeHTML(ex.name)} (${(ex.measurements || []).join(', ')})</option>`)
    .join('');

  showModal('Add to Superset', async () => {
    const html = buildExerciseSelectModalContent('add-superset-ex-select', options);
    setTimeout(() => {
      const btn = document.getElementById('create-new-ex-btn');
      if (btn) btn.addEventListener('click', () => { closeModal(); openCreateExerciseFromEditor(supersetIdx); });
    }, 0);
    return html;
  }, async () => {
    const val = document.getElementById('add-superset-ex-select').value;
    if (!val) { showToast('Select an exercise'); return false; }
    const ss = window._workoutEditorState.items[supersetIdx];
    if (!ss) return false;
    ss.exercises.push({ exerciseId: parseInt(val) });
    refreshWorkoutItemsList();
    return true;
  }, 'Add');
}

// Create a new exercise from within the workout editor.
// supersetIdx: if set, adds the new exercise to that superset; otherwise adds standalone.
function openCreateExerciseFromEditor(supersetIdx) {
  const measurementChecks = MEASUREMENT_TYPES.map(m => `
    <label class="checkbox-pill" id="pill-${m.key}">
      <input type="checkbox" name="measurements" value="${m.key}" onchange="togglePill(this)">
      ${m.label}
    </label>
  `).join('');

  const muscleOptions = MUSCLE_GROUPS.map(g => `<option value="${g}">${g}</option>`).join('');

  showModal('New Exercise', async () => `
    <div class="input-group">
      <label class="input-label">Exercise Name</label>
      <input id="ex-name" class="input" type="text" placeholder="e.g. Overhead Press">
    </div>
    <div class="input-group">
      <label class="input-label">Muscle Group</label>
      <select id="ex-muscle" class="select">
        <option value="">Select...</option>
        ${muscleOptions}
      </select>
    </div>
    <div class="input-group">
      <label class="input-label">Measurements</label>
      <div class="checkbox-group">${measurementChecks}</div>
    </div>
    <div class="input-group" id="unit-row" style="display:none">
      <label class="input-label">Weight Unit</label>
      <input type="hidden" id="ex-unit-hidden" value="kg">
      <div style="display:flex;gap:8px">
        <button type="button" class="btn btn-sm btn-primary" onclick="selectExUnit('kg', this)">kg</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="selectExUnit('lbs', this)">lbs</button>
      </div>
    </div>
    <div class="input-group">
      <label class="input-label">Notes</label>
      <textarea id="ex-notes" class="input" rows="3" placeholder="e.g. Keep back straight, neutral spine" style="resize:vertical"></textarea>
    </div>
  `, async () => {
    const name = document.getElementById('ex-name').value.trim();
    const muscleGroup = document.getElementById('ex-muscle').value;
    const checked = [...document.querySelectorAll('input[name="measurements"]:checked')].map(c => c.value);
    const unit = document.getElementById('ex-unit-hidden').value || 'kg';
    const notes = document.getElementById('ex-notes').value.trim();

    if (!name) { showToast('Exercise name required'); return false; }
    if (checked.length === 0) { showToast('Select at least one measurement'); return false; }

    const exercise = { name, muscleGroup, measurements: checked, unit, notes: notes || '' };
    const newId = await saveExercise(exercise);
    exercise.id = newId;

    // Add to editor state so it's available immediately
    const state = window._workoutEditorState;
    if (state) {
      state.allExercises.push(exercise);
      state.allExercises.sort((a, b) => a.name.localeCompare(b.name));

      if (supersetIdx !== null && supersetIdx !== undefined) {
        const ss = state.items[supersetIdx];
        if (ss) ss.exercises.push({ exerciseId: newId });
      } else {
        state.items.push({ type: 'exercise', exerciseId: newId, targetSets: 3 });
      }
      refreshWorkoutItemsList();
    }

    showToast('Exercise created');
    return true;
  }, 'Create');
}

function updateStandaloneExerciseSets(idx, value) {
  if (!window._workoutEditorState) return;
  window._workoutEditorState.items[idx].targetSets = parseInt(value) || 1;
}

function updateSupersetSets(idx, value) {
  if (!window._workoutEditorState) return;
  window._workoutEditorState.items[idx].targetSets = parseInt(value) || 1;
}

function removeItemFromWorkout(idx) {
  if (!window._workoutEditorState) return;
  window._workoutEditorState.items.splice(idx, 1);
  refreshWorkoutItemsList();
}

function removeExerciseFromSuperset(supersetIdx, exIdx) {
  const state = window._workoutEditorState;
  if (!state) return;
  const superset = state.items[supersetIdx];
  if (!superset) return;
  const [removed] = superset.exercises.splice(exIdx, 1);
  state.items.push({ type: 'exercise', exerciseId: removed.exerciseId, targetSets: superset.targetSets || 3 });
  refreshWorkoutItemsList();
}

function deleteSupersetBox(supersetIdx) {
  const state = window._workoutEditorState;
  if (!state) return;
  const superset = state.items[supersetIdx];
  if (!superset) return;

  if (superset.exercises.length === 0) {
    state.items.splice(supersetIdx, 1);
    refreshWorkoutItemsList();
    return;
  }

  showModal('Delete Superset', async () => `
    <p style="color:var(--text-2);font-size:15px;line-height:1.5;margin-bottom:16px">
      What should happen to the exercises in this superset?
    </p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
        <input type="radio" name="superset-delete-mode" value="keep" checked style="margin-top:2px">
        <span>
          <div style="font-size:14px;font-weight:500">Keep exercises as standalone</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">Exercises remain in the workout</div>
        </span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
        <input type="radio" name="superset-delete-mode" value="delete" style="margin-top:2px">
        <span>
          <div style="font-size:14px;font-weight:500">Remove exercises too</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">All exercises in this superset will be removed</div>
        </span>
      </label>
    </div>
  `, async () => {
    const mode = document.querySelector('input[name="superset-delete-mode"]:checked')?.value || 'keep';
    const ss = window._workoutEditorState.items[supersetIdx];
    if (!ss) return true;
    if (mode === 'keep') {
      const standalones = ss.exercises.map(e => ({ type: 'exercise', exerciseId: e.exerciseId, targetSets: ss.targetSets || 3 }));
      window._workoutEditorState.items.splice(supersetIdx, 1, ...standalones);
    } else {
      window._workoutEditorState.items.splice(supersetIdx, 1);
    }
    refreshWorkoutItemsList();
    return true;
  }, 'Confirm', 'btn-danger');
}

function moveItem(idx, direction) {
  const state = window._workoutEditorState;
  if (!state) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.items.length) return;
  [state.items[idx], state.items[newIdx]] = [state.items[newIdx], state.items[idx]];
  refreshWorkoutItemsList();
}

function moveExerciseInSuperset(supersetIdx, exIdx, direction) {
  const state = window._workoutEditorState;
  if (!state) return;
  const superset = state.items[supersetIdx];
  if (!superset) return;
  const newIdx = exIdx + direction;
  if (newIdx < 0 || newIdx >= superset.exercises.length) return;
  [superset.exercises[exIdx], superset.exercises[newIdx]] = [superset.exercises[newIdx], superset.exercises[exIdx]];
  refreshWorkoutItemsList();
}

async function saveWorkoutFromEditor(existingId) {
  const name = document.getElementById('workout-name').value.trim();
  if (!name) { showToast('Workout name required'); return; }

  const state = window._workoutEditorState;
  if (!state || state.items.length === 0) { showToast('Add at least one exercise'); return; }

  for (const item of state.items) {
    if (item.type === 'superset' && item.exercises.length < 2) {
      showToast('Each superset needs at least 2 exercises');
      return;
    }
  }

  const workout = { name, items: state.items };
  if (existingId) workout.id = existingId;

  await saveWorkout(workout);
  showToast(existingId ? 'Workout saved' : 'Workout created');
  window._workoutEditorState = null;
  renderWorkoutsView();
  showBack(false);
}

async function confirmDeleteWorkout(id, name) {
  showModal('Delete Workout', async () => {
    return `<p style="color:var(--text-2);font-size:15px;line-height:1.5">Delete <strong style="color:var(--text)">${escapeHTML(name)}</strong>? This cannot be undone.</p>`;
  }, async () => {
    await deleteWorkout(id);
    showToast('Workout deleted');
    renderWorkoutsView();
    return true;
  }, 'Delete', 'btn-danger');
}
