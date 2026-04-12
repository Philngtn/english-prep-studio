'use strict';

// Tab the student was trying to reach before being prompted to log in
let _authPendingTab = null;

/* ============================================================
   ===== BAND SCORE CONVERSION =====
   ============================================================ */
function rawToBand(raw, total) {
  const pct = raw / total;
  if (pct >= 0.975) return 9.0;
  if (pct >= 0.925) return 8.5;
  if (pct >= 0.875) return 8.0;
  if (pct >= 0.825) return 7.5;
  if (pct >= 0.75)  return 7.0;
  if (pct >= 0.675) return 6.5;
  if (pct >= 0.575) return 6.0;
  if (pct >= 0.475) return 5.5;
  if (pct >= 0.375) return 5.0;
  if (pct >= 0.275) return 4.5;
  if (pct >= 0.175) return 4.0;
  return 3.5;
}

/* ============================================================
   ===== APP STATE =====
   ============================================================ */
let appState = {
  currentTab: 'dashboard',
  timerCountdown: true,    // true = count down (auto-submit at 0); false = count up (no auto-submit)
  activePackage: 'cam18',  // active test package ID
  activeTest:    'test1',  // active test within the package
  test: {
    active: false,
    section: null,       // 'reading' | 'listening' | 'writing' | 'speaking'
    answers: {},         // { questionId: answer }
    flags: new Set(),
    currentQ: 0,
    timerSeconds: 0,
    timerInterval: null,
    startTime: null,
    flatQuestions: [],
    passages: [],
    sections: [],
  },
  miniQuiz: {
    current: 0,
    answers: {},
    submitted: false,
  },
  liveQuiz: {
    mode: null,            // 'host' | 'player' | null
    roomCode: null,
    channel: null,         // Supabase Realtime channel ref
    roomData: null,
    collectedAnswers: {},  // host-only: { qIdx: [{playerId, answer, timeMs}] }
    participants: {},      // host-only: { playerId: {playerName, score, team} }
    timerInterval: null,
    secondsLeft: 0,
    playerId: null,        // player-only (from sessionStorage 'lq_pid')
    playerName: null,
    teamName: null,
    hasAnswered: false,
  }
};

/* ============================================================
   ===== LOCAL STORAGE =====
   ============================================================ */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('ielts_history') || '[]'); }
  catch { return []; }
}
function saveHistory(record) {
  // Write to localStorage immediately so the UI updates without waiting
  const h = loadHistory();
  h.unshift(record);
  if (h.length > 50) h.splice(50);
  localStorage.setItem('ielts_history', JSON.stringify(h));
  // Push to Supabase in the background (non-blocking)
  db.saveHistory(record).catch(e => console.warn('[DB] History push failed:', e));
}

/* ============================================================
   ===== NAVIGATION =====
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // Capture ?join= and switch to the join screen IMMEDIATELY — before any
  // async auth/sync ops that could navigate away or strip the URL param.
  const _lqJoinCode = new URLSearchParams(window.location.search).get('join');
  if (_lqJoinCode && typeof showPlayerJoinScreen === 'function') {
    _doSwitchTab('live-quiz');
    showPlayerJoinScreen(_lqJoinCode.toUpperCase());
  }

  // Tab navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  // Hamburger
  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('navTabs').classList.toggle('open');
  });
  // Practice sub-tabs
  document.querySelectorAll('.practice-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPracticeTab(btn.dataset.ptab));
  });
  // Grammar accordions (delegated)
  document.getElementById('grammarContent').addEventListener('click', e => {
    const header = e.target.closest('.grammar-header');
    if (header) {
      header.classList.toggle('open');
      header.nextElementSibling.classList.toggle('open');
    }
  });

  // Pull latest data from Supabase into localStorage before loading content
  await db.syncAll();
  // Check for existing student session and update nav
  if (typeof initStudentAuth === 'function') await initStudentAuth();

  // Load admin-created custom test packages (must run before loadAdminOverrides)
  loadCustomTestPackages();
  // Merge any admin-saved overrides into TEST_PACKAGES
  loadAdminOverrides();
  // Merge any admin-saved practice content overrides
  loadPracticeOverrides();
  // Load any admin-created custom practice packages
  loadCustomPracticePackages();
  // Filter out admin-deleted built-in practice packages
  _applyHiddenPracticePackages();

  // Initialise test picker
  _populateTestPicker();

  // Clean up old finished quiz rooms (non-blocking)
  db.cleanupOldRooms();

  // Initialise all content
  renderDashboard();
  renderPracticePackagePicker();
  renderVocab();
  renderGrammar();
  renderReadingSkills();
  renderWritingTips();
  renderMiniQuiz();
  renderReview();

});

function switchTab(tab) {
  // Guard: require login for Practice and Review tabs
  if ((tab === 'practice' || tab === 'review') &&
      typeof isStudentLoggedIn === 'function' && !isStudentLoggedIn()) {
    _authPendingTab = tab;
    if (typeof openAuthModal === 'function') openAuthModal();
    return;
  }
  // Guard: warn before abandoning an active test
  if (appState.test.active && tab !== 'mock-test') {
    document.getElementById('navTabs').classList.remove('open');
    showModal(
      'Test in Progress',
      'If you leave now, your progress will NOT be saved and the test will be terminated. Do you still want to exit?',
      () => { backToSelector(); _doSwitchTab(tab); }
    );
    return;
  }
  _doSwitchTab(tab);
}

function _doSwitchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById('navTabs').classList.remove('open');
  appState.currentTab = tab;
  if (tab === 'review')     renderReview();
  if (tab === 'dashboard')  renderDashboard();
  if (tab === 'admin')      renderAdmin();
  if (tab === 'live-quiz' && typeof renderLiveQuizTab === 'function') renderLiveQuizTab();
  if (tab === 'practice') {
    renderPracticePackagePicker();
    renderVocab();
    renderGrammar();
    renderReadingSkills();
    renderWritingTips();
    renderMiniQuiz();
  }
}

function switchPracticeTab(ptab) {
  document.querySelectorAll('.practice-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.practice-tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('ptab-' + ptab).classList.add('active');
  document.querySelector(`[data-ptab="${ptab}"]`).classList.add('active');
}

/* ============================================================
   ===== TIMER UTILITY =====
   ============================================================ */
function formatTime(s) {
  if (s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* ============================================================
   ===== MODAL =====
   ============================================================ */
function showModal(title, body, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent  = body;
  document.getElementById('modalConfirmBtn').onclick = () => { closeModal(); onConfirm(); };
  document.getElementById('modalOverlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ============================================================
   ===== TOAST =====
   ============================================================ */
let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ============================================================
   ===== UTILITIES =====
   ============================================================ */
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
