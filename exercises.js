/* =============================================
   LIFT — Exercise Library
   ============================================= */

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Legs', 'Glutes', 'Core', 'Full Body', 'Cardio'
];

const MEASUREMENT_TYPES = [
  { key: 'reps', label: 'Reps' },
  { key: 'weight', label: 'Weight' },
  { key: 'time', label: 'Time' }
];

async function renderExercisesView() {
  setPageTitle('EXERCISES');
  showBack(false);

  const exercises = await getAllExercises();
  exercises.sort((a, b) => a.name.localeCompare(b.name));

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <span class="section-title">${exercises.length} Exercise${exercises.length !== 1 ? 's' : ''}</span>
    <button class="btn btn-primary btn-sm" onclick="openExerciseModal()">+ Add</button>
  `;
  content.appendChild(header);

  if (exercises.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">💪</div>
      <div class="empty-state-title">No exercises yet</div>
      <div class="empty-state-text">Add exercises to build your library</div>
    `;
    content.appendChild(empty);
    return;
  }

  // Group by muscle
  const grouped = {};
  exercises.forEach(ex => {
    const g = ex.muscleGroup || 'Other';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(ex);
  });

  Object.entries(grouped).sort().forEach(([group, exList]) => {
    const section = document.createElement('div');
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-header';
    sectionHeader.innerHTML = `<span class="section-title">${group}</span>`;
    section.appendChild(sectionHeader);

    const listWrapper = document.createElement('div');
    listWrapper.style.cssText = 'margin: 0 16px; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;';

    exList.forEach(ex => {
      const measurements = (ex.measurements || []).map(m =>
        m === 'weight' ? `weight (${ex.unit || 'kg'})` : m
      ).join(', ');
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-main">
          <div class="list-item-name">${ex.name}</div>
          <div class="list-item-meta">
            <span style="font-size:11px;color:var(--text-3)">${measurements}</span>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="icon-btn" onclick="openExerciseModal(${ex.id})">✏️</button>
          <button class="icon-btn" onclick="confirmDeleteExercise(${ex.id}, '${escapeAttr(ex.name)}')">🗑️</button>
        </div>
      `;
      listWrapper.appendChild(item);
    });

    section.appendChild(listWrapper);
    content.appendChild(section);
  });
}

function openExerciseModal(id = null) {
  const isEdit = id !== null;
  const title = isEdit ? 'Edit Exercise' : 'New Exercise';

  showModal(title, async () => {
    let ex = null;
    if (isEdit) ex = await getExercise(id);

    const hasWeight = ex && ex.measurements && ex.measurements.includes('weight');
    const exUnit = (ex && ex.unit) ? ex.unit : 'kg';

    const measurementChecks = MEASUREMENT_TYPES.map(m => {
      const checked = ex && ex.measurements && ex.measurements.includes(m.key) ? 'checked' : '';
      return `
        <label class="checkbox-pill ${checked ? 'checked' : ''}" id="pill-${m.key}">
          <input type="checkbox" name="measurements" value="${m.key}" ${checked} onchange="togglePill(this)">
          ${m.label}
        </label>
      `;
    }).join('');

    const muscleOptions = MUSCLE_GROUPS.map(g =>
      `<option value="${g}" ${ex && ex.muscleGroup === g ? 'selected' : ''}>${g}</option>`
    ).join('');

    return `
      <div class="input-group">
        <label class="input-label">Exercise Name</label>
        <input id="ex-name" class="input" type="text" placeholder="e.g. Overhead Press" value="${ex ? escapeHTML(ex.name) : ''}">
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
      <div class="input-group" id="unit-row" ${!hasWeight ? 'style="display:none"' : ''}>
        <label class="input-label">Weight Unit</label>
        <input type="hidden" id="ex-unit-hidden" value="${exUnit}">
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-sm ${exUnit === 'kg' ? 'btn-primary' : 'btn-ghost'}" onclick="selectExUnit('kg', this)">kg</button>
          <button type="button" class="btn btn-sm ${exUnit === 'lbs' ? 'btn-primary' : 'btn-ghost'}" onclick="selectExUnit('lbs', this)">lbs</button>
        </div>
      </div>
      <div class="input-group">
        <label class="input-label">Notes</label>
        <textarea id="ex-notes" class="input" rows="3" placeholder="e.g. Keep back straight, neutral spine" style="resize:vertical">${ex && ex.notes ? escapeHTML(ex.notes) : ''}</textarea>
      </div>
    `;
  }, async () => {
    const name = document.getElementById('ex-name').value.trim();
    const muscleGroup = document.getElementById('ex-muscle').value;
    const checked = [...document.querySelectorAll('input[name="measurements"]:checked')].map(c => c.value);
    const unit = document.getElementById('ex-unit-hidden').value || 'kg';

    if (!name) { showToast('Exercise name required'); return false; }
    if (checked.length === 0) { showToast('Select at least one measurement'); return false; }

    const notes = document.getElementById('ex-notes').value.trim();
    const exercise = { name, muscleGroup, measurements: checked, unit, notes: notes || '' };
    if (isEdit) exercise.id = id;
    await saveExercise(exercise);
    showToast(isEdit ? 'Exercise updated' : 'Exercise added');
    renderExercisesView();
    return true;
  });
}

function togglePill(input) {
  const pill = document.getElementById('pill-' + input.value);
  if (pill) pill.classList.toggle('checked', input.checked);
  if (input.value === 'weight') {
    const unitRow = document.getElementById('unit-row');
    if (unitRow) unitRow.style.display = input.checked ? '' : 'none';
  }
}

function selectExUnit(unit, btn) {
  document.getElementById('ex-unit-hidden').value = unit;
  btn.parentElement.querySelectorAll('.btn').forEach(b => {
    b.className = `btn btn-sm btn-ghost`;
  });
  btn.className = `btn btn-sm btn-primary`;
}

async function confirmDeleteExercise(id, name) {
  showModal('Delete Exercise', async () => {
    return `<p style="color:var(--text-2);font-size:15px;line-height:1.5">Delete <strong style="color:var(--text)">${escapeHTML(name)}</strong>? This cannot be undone.</p>`;
  }, async () => {
    await deleteExercise(id);
    showToast('Exercise deleted');
    renderExercisesView();
    return true;
  }, 'Delete', 'btn-danger');
}