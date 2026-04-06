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
3. Feature files: `exercises.js`, `workouts.js`, `programs.js`, `session.js`, `history.js`, `settings.js`
4. `app.js` — router, `navigateTo()`, `showModal()`, `showToast()`, `escapeHTML()`, `escapeAttr()` (loaded last so feature files can define globals it calls)

All functions are globals on `window` — there are no ES modules or imports.

**Navigation** — `navigateTo(view)` in `app.js` switches between the 6 views (`home`, `exercises`, `workouts`, `programs`, `history`, `settings`) by calling the corresponding `render*View()` function. Each view renders into `#main-content` via `innerHTML`.

**Modals** — `showModal(title, contentFn, onConfirm, confirmLabel, confirmClass)` is the shared modal system. `contentFn` is an async function returning HTML string. `onConfirm` returning `false` keeps the modal open.

**Database** (`db.js`) — Single IndexedDB database `lift-db` v1 with stores: `exercises`, `workouts`, `programs`, `sessions`, `exerciseLogs`, `settings`, `programState`. All DB functions are async and exposed as globals. `exerciseLogs` are pruned to 10 entries per exercise via `pruneExerciseLogs()`.

**Active session state** — `session.js` holds a `_sessionState` object in memory:
```
{ workoutId, workoutName, exerciseBlocks: [{ exerciseId, exercise, targetSets, sets, flagNext, lastLog }] }
```
Session is saved to IndexedDB only on completion. In-progress state is persisted continuously to the `activeDraft` settings key so sessions survive page refreshes. The home view checks for an `activeDraft` on render and shows a "Workout In Progress" card. Draft is cleared only on completion or abandonment (`clearActiveDraft()`). Key functions: `saveActiveDraft()`, `getActiveDraft()`, `resumeSession()`, `confirmAbortSession()`, `finishWorkout()`.

**Settings** — stored as key-value pairs in the `settings` store. Current keys:
- `restTimer` — rest duration in seconds (default 90)
- `timerEnabled` — bool, whether rest timer auto-starts after set completion (default true)
- `activeProgram` — ID of the currently active program, or null
- `activeDraft` — serialized in-progress session state for resume-after-refresh (see Active session state)

The weight unit (`kg`/`lbs`) is stored per-exercise as `exercise.unit`, not as a global setting.

**Rest timer** — automatically starts when a set is marked complete (if `timerEnabled` is true). Duration is taken from the `restTimer` setting. Shows a CSS `warning` class when ≤10 seconds remain. Can be skipped at any time.

**Service worker** (`sw.js`, cache name `lift-v2`) — network-first strategy for all app files. When updating the SW cache, increment `CACHE_NAME` and add any new files to the `ASSETS` array.

## Data Model Shapes

Key object shapes used across the codebase (not stored in schema — inferred from code):

- **Exercise**: `{ id, name, muscleGroup, measurements: ['reps'|'weight'|'time'], unit?: 'kg'|'lbs' }`
- **Workout**: `{ id, name, exercises: [{ exerciseId, targetSets }] }`
- **Program**: `{ id, name, workoutIds: [workoutId] }` — `programState` tracks `{ programId, nextWorkoutIndex }`. Workouts cycle using modulo wrap-around. When a user manually selects an out-of-sequence workout, the program is re-anchored so the next scheduled workout follows the selected one. Key functions: `getNextWorkoutInProgram()`, `advanceProgramAfterWorkout(workoutId)`, `anchorProgramToWorkout(workoutId)`.
- **Session**: `{ id, workoutId, workoutName, completedAt: timestamp }`
- **ExerciseLog**: `{ id, exerciseId, sessionId, sets: [{ reps, weight, time, completed }], flagNext }` — `flagNext` is a boolean the user can set to remind themselves to increase weight/reps next session. If the previous session's log had `flagNext` set, the 🟠 flag is shown at the start of that exercise in the next session.

## Data Export

`exportData()` in `settings.js` bundles all sessions with their exercise logs into a JSON file and triggers a download. Filename format: `lift-export-YYYY-MM-DD.json`.

## XSS Prevention

All user-generated content rendered into `innerHTML` must be escaped. Use:
- `escapeHTML(str)` for text content
- `escapeAttr(str)` for HTML attribute values (especially in `onclick` handlers with string args)
