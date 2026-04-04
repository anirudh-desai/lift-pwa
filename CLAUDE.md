# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

There is no build step. Serve the files with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser. The app requires a browser environment — it cannot run in Node.js.

There are no tests and no linter configured.

## Architecture

The app is a vanilla JS PWA. All code runs in the browser; there is no backend.

**Script load order matters** — `index.html` loads scripts in this order:
1. `idb.js` (CDN) — IndexedDB promise wrapper
2. `db.js` — database layer (must be first; all other files call its functions)
3. `app.js` — router, `navigateTo()`, `showModal()`, `showToast()`, `escapeHTML()`, `escapeAttr()`
4. Feature files: `exercises.js`, `workouts.js`, `programs.js`, `session.js`, `history.js`, `settings.js`

All functions are globals on `window` — there are no ES modules or imports.

**Navigation** — `navigateTo(view)` in `app.js` switches between the 6 views (`home`, `exercises`, `workouts`, `programs`, `history`, `settings`) by calling the corresponding `render*View()` function. Each view renders into `#main-content` via `innerHTML`.

**Modals** — `showModal(title, contentFn, onConfirm, confirmLabel, confirmClass)` is the shared modal system. `contentFn` is an async function returning HTML string. `onConfirm` returning `false` keeps the modal open.

**Database** (`db.js`) — Single IndexedDB database `lift-db` v1 with stores: `exercises`, `workouts`, `programs`, `sessions`, `exerciseLogs`, `settings`, `programState`. All DB functions are async and exposed as globals. `exerciseLogs` are pruned to 10 entries per exercise via `pruneExerciseLogs()`.

**Active session state** — `session.js` holds a `_sessionState` object in memory tracking the in-progress workout. Session is saved to IndexedDB only on completion.

**Settings** — stored as key-value pairs in the `settings` store. Current keys: `restTimer` (seconds, default 90), `timerEnabled` (bool, default true). The weight unit (`kg`/`lbs`) is stored per-exercise as `exercise.unit`, not as a global setting.

**Service worker** (`sw.js`, cache name `lift-v2`) — network-first strategy for all app files. When updating the SW cache, increment `CACHE_NAME` and add any new files to the `ASSETS` array.

## Data Model Shapes

Key object shapes used across the codebase (not stored in schema — inferred from code):

- **Exercise**: `{ id, name, muscleGroup, measurements: ['reps'|'weight'|'time'], unit?: 'kg'|'lbs' }`
- **Workout**: `{ id, name, exercises: [{ exerciseId, targetSets }] }`
- **Program**: `{ id, name, workouts: [workoutId] }` — `programState` tracks `{ programId, nextWorkoutIndex }`
- **Session**: `{ id, workoutId, workoutName, completedAt: timestamp }`
- **ExerciseLog**: `{ id, exerciseId, sessionId, sets: [{ reps, weight, time, completed }], flagNext }` — `flagNext` is a boolean the user can set to remind themselves to increase weight/reps next session (shown as 🟠 flag)

## XSS Prevention

All user-generated content rendered into `innerHTML` must be escaped. Use:
- `escapeHTML(str)` for text content
- `escapeAttr(str)` for HTML attribute values (especially in `onclick` handlers with string args)
