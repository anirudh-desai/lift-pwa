/* =============================================
   LIFT — Workout Builder
   ============================================= */

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
    const exCount = (w.exercises || []).length;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-name">${escapeHTML(w.name)}</div>
        <div class="list-item-meta">${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" onclick="openWorkoutEditor(${w.id})">✏️</button>
        <button class="icon-btn" onclick="confirmDeleteWorkout(${w.id}, '${escapeAttr(w.name)}')">🗑️</button>
      </div>
    `;
    listWrapper.appendChild(item);
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
    workout = await getWorkout(id);
  } else {
    workout = { name: '', exercises: [] };
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

  // Exercises in workout
  const exSection = document.createElement('div');
  const exHeader = document.createElement('div');
  exHeader.className = 'section-header';
  exHeader.innerHTML = `
    <span class="section-title">Exercises</span>
    <button class="btn btn-secondary btn-sm" onclick="openAddExerciseToWorkout()">+ Add Exercise</button>
  `;
  exSection.appendChild(exHeader);

  const exList = document.createElement('div');
  exList.id = 'workout-exercise-list';
  exList.style.cssText = 'margin: 0 16px; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;';

  if (!workout.exercises || workout.exercises.length === 0) {
    exList.innerHTML = `<div style="padding:20px 16px;color:var(--text-3);font-size:14px;text-align:center">No exercises added yet</div>`;
  } else {
    renderWorkoutExerciseRows(exList, workout.exercises, allExercises);
  }

  exSection.appendChild(exList);
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

  // Store working state on window for access during save
  window._workoutEditorState = {
    exercises: workout.exercises ? [...workout.exercises] : [],
    allExercises
  };
}

function renderWorkoutExerciseRows(container, workoutExercises, allExercises) {
  container.innerHTML = '';
  workoutExercises.forEach((we, idx) => {
    const ex = allExercises.find(e => e.id === we.exerciseId);
    if (!ex) return;
    const row = document.createElement('div');
    row.className = 'list-item';
    row.style.flexWrap = 'wrap';
    row.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-name">${escapeHTML(ex.name)}</div>
        <div class="list-item-meta" style="display:flex;align-items:center;gap:8px;margin-top:6px">
          <label style="font-size:12px;color:var(--text-2)">Sets:</label>
          <input 
            class="set-input" 
            type="number" 
            min="1" max="20" 
            value="${we.targetSets || 3}" 
            style="width:52px;font-size:13px;padding:4px 6px"
            onchange="updateWorkoutExerciseSets(${idx}, this.value)"
          >
        </div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" onclick="removeExerciseFromWorkout(${idx})">✕</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function updateWorkoutExerciseSets(idx, value) {
  if (!window._workoutEditorState) return;
  const val = parseInt(value) || 1;
  window._workoutEditorState.exercises[idx].targetSets = val;
}

function removeExerciseFromWorkout(idx) {
  if (!window._workoutEditorState) return;
  window._workoutEditorState.exercises.splice(idx, 1);
  const container = document.getElementById('workout-exercise-list');
  renderWorkoutExerciseRows(container, window._workoutEditorState.exercises, window._workoutEditorState.allExercises);
  if (window._workoutEditorState.exercises.length === 0) {
    container.innerHTML = `<div style="padding:20px 16px;color:var(--text-3);font-size:14px;text-align:center">No exercises added yet</div>`;
  }
}

function openAddExerciseToWorkout() {
  const allExercises = window._workoutEditorState ? window._workoutEditorState.allExercises : [];
  const current = window._workoutEditorState ? window._workoutEditorState.exercises.map(e => e.exerciseId) : [];

  if (allExercises.length === 0) {
    showToast('Add exercises to your library first');
    return;
  }

  const options = allExercises
    .filter(ex => !current.includes(ex.id))
    .map(ex => `<option value="${ex.id}">${escapeHTML(ex.name)} (${(ex.measurements || []).join(', ')})</option>`)
    .join('');

  if (!options) {
    showToast('All exercises already added');
    return;
  }

  showModal('Add Exercise', async () => {
    return `
      <div class="input-group">
        <label class="input-label">Select Exercise</label>
        <select id="add-ex-select" class="select">
          <option value="">Choose...</option>
          ${options}
        </select>
      </div>
    `;
  }, async () => {
    const val = document.getElementById('add-ex-select').value;
    if (!val) { showToast('Select an exercise'); return false; }
    const exId = parseInt(val);
    if (!window._workoutEditorState) return false;
    window._workoutEditorState.exercises.push({ exerciseId: exId, targetSets: 3 });
    const container = document.getElementById('workout-exercise-list');
    renderWorkoutExerciseRows(container, window._workoutEditorState.exercises, window._workoutEditorState.allExercises);
    return true;
  }, 'Add');
}

async function saveWorkoutFromEditor(existingId) {
  const name = document.getElementById('workout-name').value.trim();
  if (!name) { showToast('Workout name required'); return; }

  const state = window._workoutEditorState;
  if (!state || state.exercises.length === 0) {
    showToast('Add at least one exercise');
    return;
  }

  const workout = {
    name,
    exercises: state.exercises
  };
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
