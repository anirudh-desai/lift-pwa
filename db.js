/* =============================================
   LIFT — Database Layer (IndexedDB via idb)
   ============================================= */

const DB_NAME = 'lift-db';
const DB_VERSION = 1;

let _db = null;

async function getDB() {
  if (_db) return _db;
  _db = await idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Exercises
      if (!db.objectStoreNames.contains('exercises')) {
        const ex = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
        ex.createIndex('name', 'name', { unique: false });
      }
      // Workouts
      if (!db.objectStoreNames.contains('workouts')) {
        db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
      }
      // Programs
      if (!db.objectStoreNames.contains('programs')) {
        db.createObjectStore('programs', { keyPath: 'id', autoIncrement: true });
      }
      // Sessions (completed workouts)
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('completedAt', 'completedAt', { unique: false });
        s.createIndex('workoutId', 'workoutId', { unique: false });
      }
      // Exercise logs (per-set history, keyed by exerciseId)
      if (!db.objectStoreNames.contains('exerciseLogs')) {
        const el = db.createObjectStore('exerciseLogs', { keyPath: 'id', autoIncrement: true });
        el.createIndex('exerciseId', 'exerciseId', { unique: false });
        el.createIndex('sessionId', 'sessionId', { unique: false });
      }
      // Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // Program state (which workout is next)
      if (!db.objectStoreNames.contains('programState')) {
        db.createObjectStore('programState', { keyPath: 'programId' });
      }
    }
  });
  return _db;
}

/* ---- Settings ---- */
async function getSetting(key, defaultValue = null) {
  const db = await getDB();
  const row = await db.get('settings', key);
  return row ? row.value : defaultValue;
}

async function setSetting(key, value) {
  const db = await getDB();
  await db.put('settings', { key, value });
}

/* ---- Exercises ---- */
async function getAllExercises() {
  const db = await getDB();
  return db.getAll('exercises');
}

async function getExercise(id) {
  const db = await getDB();
  return db.get('exercises', id);
}

async function saveExercise(exercise) {
  const db = await getDB();
  if (exercise.id) {
    await db.put('exercises', exercise);
    return exercise.id;
  } else {
    return db.add('exercises', exercise);
  }
}

async function deleteExercise(id) {
  const db = await getDB();
  await db.delete('exercises', id);
}

/* ---- Workouts ---- */
async function getAllWorkouts() {
  const db = await getDB();
  return db.getAll('workouts');
}

async function getWorkout(id) {
  const db = await getDB();
  return db.get('workouts', id);
}

async function saveWorkout(workout) {
  const db = await getDB();
  if (workout.id) {
    await db.put('workouts', workout);
    return workout.id;
  } else {
    return db.add('workouts', workout);
  }
}

async function deleteWorkout(id) {
  const db = await getDB();
  await db.delete('workouts', id);
}

/* ---- Programs ---- */
async function getAllPrograms() {
  const db = await getDB();
  return db.getAll('programs');
}

async function getProgram(id) {
  const db = await getDB();
  return db.get('programs', id);
}

async function saveProgram(program) {
  const db = await getDB();
  if (program.id) {
    await db.put('programs', program);
    return program.id;
  } else {
    return db.add('programs', program);
  }
}

async function deleteProgram(id) {
  const db = await getDB();
  await db.delete('programs', id);
}

/* ---- Program State ---- */
async function getProgramState(programId) {
  const db = await getDB();
  return db.get('programState', programId);
}

async function setProgramState(programId, nextWorkoutIndex) {
  const db = await getDB();
  await db.put('programState', { programId, nextWorkoutIndex });
}

/* ---- Sessions ---- */
async function getAllSessions() {
  const db = await getDB();
  const sessions = await db.getAll('sessions');
  return sessions.sort((a, b) => b.completedAt - a.completedAt);
}

async function getSession(id) {
  const db = await getDB();
  return db.get('sessions', id);
}

async function saveSession(session) {
  const db = await getDB();
  if (session.id) {
    await db.put('sessions', session);
    return session.id;
  } else {
    return db.add('sessions', session);
  }
}

/* ---- Exercise Logs ---- */

// Save all sets for an exercise within a session
async function saveExerciseLog(log) {
  // log = { exerciseId, sessionId, sets: [{reps, weight, time, completed}], flagNext }
  const db = await getDB();
  if (log.id) {
    await db.put('exerciseLogs', log);
    return log.id;
  } else {
    return db.add('exerciseLogs', log);
  }
}

// Get the last N sessions' logs for an exercise
async function getExerciseHistory(exerciseId, limit = 10) {
  const db = await getDB();
  const index = db.transaction('exerciseLogs').store.index('exerciseId');
  const all = await index.getAll(exerciseId);

  // Sort by sessionId descending (higher id = more recent)
  all.sort((a, b) => b.sessionId - a.sessionId);
  return all.slice(0, limit);
}

// Get the most recent log entry for an exercise (for "last session" display)
async function getLastExerciseLog(exerciseId) {
  const history = await getExerciseHistory(exerciseId, 1);
  return history[0] || null;
}

// Get all logs for a session
async function getSessionLogs(sessionId) {
  const db = await getDB();
  const index = db.transaction('exerciseLogs').store.index('sessionId');
  return index.getAll(sessionId);
}

// Prune exercise logs to keep only last 10 per exercise
async function pruneExerciseLogs(exerciseId) {
  const db = await getDB();
  const index = db.transaction('exerciseLogs', 'readwrite').store.index('exerciseId');
  const all = await index.getAll(exerciseId);
  if (all.length <= 10) return;
  all.sort((a, b) => a.sessionId - b.sessionId);
  const toDelete = all.slice(0, all.length - 10);
  const tx = db.transaction('exerciseLogs', 'readwrite');
  for (const log of toDelete) {
    await tx.store.delete(log.id);
  }
  await tx.done;
}

/* ---- Init with default settings ---- */
async function initDefaults() {
  const unit = await getSetting('unit');
  if (!unit) await setSetting('unit', 'kg');

  const timer = await getSetting('restTimer');
  if (!timer) await setSetting('restTimer', 90);

  const activeProgram = await getSetting('activeProgram');
  // activeProgram can be null by default
}

async function seedExercises() {
  const existing = await getAllExercises();
  if (existing.length > 0) return;

  const exercises = [
    { name: 'Barbell Squat', muscleGroup: 'Legs', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Barbell Bench Press', muscleGroup: 'Chest', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Chest-Supported Row', muscleGroup: 'Back', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Romanian Deadlift', muscleGroup: 'Legs', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Shoulder Press', muscleGroup: 'Shoulders', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Hip Thrust', muscleGroup: 'Legs', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Conventional Deadlift', muscleGroup: 'Legs', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Incline Dumbbell Press', muscleGroup: 'Chest', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Pull Up', muscleGroup: 'Back', measurements: ['reps'] },
    { name: 'Assisted Pull Up', muscleGroup: 'Back', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Bulgarian Split Squat', muscleGroup: 'Legs', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Face Pull', muscleGroup: 'Shoulders', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Band External Rotation', muscleGroup: 'Shoulders', measurements: ['reps'] },
    { name: 'Pallof Press', muscleGroup: 'Core', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: 'Dead Bug', muscleGroup: 'Core', measurements: ['reps'] },
    { name: 'Landmine Rotation', muscleGroup: 'Core', measurements: ['reps', 'weight'], unit: 'kg' },
    { name: "Farmer's Carry (25m)", muscleGroup: 'Core', measurements: ['weight'], unit: 'kg' },
    { name: 'Copenhagen Plank', muscleGroup: 'Core', measurements: ['time'] },
    { name: 'Stairmaster', muscleGroup: 'Cardio', measurements: ['time'] },
  ];

  for (const ex of exercises) {
    await saveExercise(ex);
  }
}
