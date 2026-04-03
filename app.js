/* =============================================
   LIFT — App Router & Utilities
   ============================================= */

let _currentView = 'home';
let _backCallback = null;

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Init DB defaults
  await initDefaults();

  // Cache unit
  window._cachedUnit = await getSetting('unit', 'kg');

  // Splash screen: show for 3 seconds then fade
  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      navigateTo('home');
    }, 600);
  }, 3000);

  // Bottom nav
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      navigateTo(view);
    });
  });

  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    if (_backCallback) {
      _backCallback();
    }
  });

  // Modal overlay click to dismiss
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) {
      closeModal();
    }
  });
});

/* ---- Navigation ---- */
function navigateTo(view) {
  _currentView = view;
  _backCallback = null;

  // Update nav tabs
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === view);
  });

  // Route
  switch (view) {
    case 'home':      renderHomeView(); break;
    case 'exercises': renderExercisesView(); break;
    case 'workouts':  renderWorkoutsView(); break;
    case 'programs':  renderProgramsView(); break;
    case 'history':   renderHistoryView(); break;
    case 'settings':  renderSettingsView(); break;
  }
}

function setPageTitle(title) {
  document.getElementById('page-title').textContent = title;
}

function showBack(show, callback = null) {
  const btn = document.getElementById('back-btn');
  if (show) {
    btn.classList.remove('hidden');
    _backCallback = callback;
  } else {
    btn.classList.add('hidden');
    _backCallback = null;
  }
}

/* ---- Modal ---- */
async function showModal(title, contentFn, onConfirm, confirmLabel = 'Save', confirmClass = 'btn-primary') {
  const overlay = document.getElementById('modal-overlay');
  const modalContent = document.getElementById('modal-content');

  const html = await contentFn();
  modalContent.innerHTML = `
    <div class="modal-title">${escapeHTML(title)}</div>
    ${html}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn ${confirmClass}" id="modal-confirm-btn">${escapeHTML(confirmLabel)}</button>
    </div>
  `;

  document.getElementById('modal-confirm-btn').addEventListener('click', async () => {
    const result = await onConfirm();
    if (result !== false) closeModal();
  });

  overlay.classList.remove('hidden');

  // Focus first input
  setTimeout(() => {
    const first = modalContent.querySelector('input, select');
    if (first) first.focus();
  }, 50);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}

/* ---- Toast ---- */
let _toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  if (_toastTimeout) clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

/* ---- Utility ---- */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
