'use strict';

/* ============================================================
   HocCungTrang — Admin Panel
   Allows editing Listening / Reading / Writing / Speaking
   content for any package + test combination.

   Data is persisted in localStorage under 'hct_admin_data'
   and deep-merged into TEST_PACKAGES at startup via
   loadAdminOverrides() called from shared.js.
   No default password — first visit requires setting one.
   ============================================================ */

const ADMIN_DATA_KEY            = 'hct_admin_data';
const PRACTICE_DATA_KEY         = 'hct_practice_data';
const CUSTOM_PRACTICE_PKGS_KEY  = 'hct_custom_practice_pkgs';
const HIDDEN_TESTS_KEY          = 'hct_hidden_tests';
const HIDDEN_PRACTICE_PKGS_KEY  = 'hct_hidden_practice_pkgs';
const CUSTOM_TEST_PKGS_KEY      = 'hct_custom_test_pkgs';
const CUSTOM_TESTS_KEY          = 'hct_custom_tests';

/* ── localStorage + Supabase sync helper ─────────────────── */
/* Writes to localStorage immediately (instant reads) and pushes
   to Supabase in the background so data persists across devices. */
function _lsSave(lsKey, value) {
  localStorage.setItem(lsKey, JSON.stringify(value));
  const dbKeyMap = {
    [ADMIN_DATA_KEY]:           'admin_content',
    [PRACTICE_DATA_KEY]:        'practice_content',
    [CUSTOM_TEST_PKGS_KEY]:     'custom_test_pkgs',
    [CUSTOM_TESTS_KEY]:         'custom_tests',
    [HIDDEN_TESTS_KEY]:         'hidden_tests',
    [CUSTOM_PRACTICE_PKGS_KEY]: 'custom_practice_pkgs',
    [HIDDEN_PRACTICE_PKGS_KEY]: 'hidden_practice_pkgs',
  };
  const dbKey = dbKeyMap[lsKey];
  if (dbKey) db.setData(dbKey, value).catch(e => console.warn('[DB] Sync failed:', e));
}

/* ── Startup: merge saved admin data into TEST_PACKAGES ───── */
function loadAdminOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_DATA_KEY) || '{}');
    for (const [pkgId, pkgData] of Object.entries(saved)) {
      if (!TEST_PACKAGES[pkgId]) continue;
      if (pkgData._name) TEST_PACKAGES[pkgId].name = pkgData._name;
      for (const [testId, secs] of Object.entries(pkgData)) {
        if (testId === '_name') continue;
        const t = TEST_PACKAGES[pkgId].tests[testId];
        if (!t) continue;
        if (secs._name) t.name = secs._name;
        for (const [secKey, data] of Object.entries(secs)) {
          if (secKey === '_name') continue;
          t[secKey] = data;
        }
      }
    }
  } catch (e) { console.warn('[Admin] Override load failed:', e); }
  _applyHiddenTests();
}

/* Remove admin-deleted test packages / individual tests ───── */
function _applyHiddenTests() {
  try {
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_TESTS_KEY) || '{"pkgs":[],"tests":{}}');
    for (const pkgId of (hidden.pkgs || [])) {
      delete TEST_PACKAGES[pkgId];
    }
    for (const [pkgId, testIds] of Object.entries(hidden.tests || {})) {
      const pkg = TEST_PACKAGES[pkgId];
      if (!pkg) continue;
      for (const testId of testIds) delete pkg.tests[testId];
    }
  } catch(e) { console.warn('[Admin] Hidden tests load failed:', e); }
}

/* Load admin-created custom test packages and tests ─────────── */
function loadCustomTestPackages() {
  try {
    const customs     = JSON.parse(localStorage.getItem(CUSTOM_TEST_PKGS_KEY) || '[]');
    const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
    for (const meta of customs) {
      if (TEST_PACKAGES[meta.id]) continue;
      TEST_PACKAGES[meta.id] = { id: meta.id, name: meta.name, tests: {} };
    }
    for (const [pkgId, testList] of Object.entries(customTests)) {
      if (!TEST_PACKAGES[pkgId]) continue;
      for (const t of testList) {
        if (!TEST_PACKAGES[pkgId].tests[t.id]) {
          TEST_PACKAGES[pkgId].tests[t.id] = { id: t.id, name: t.name, listening: null, reading: null, writing: null, speaking: null };
        }
      }
    }
  } catch(e) { console.warn('[Admin] Custom test package load failed:', e); }
}

/* Remove admin-hidden practice packages from PRACTICE_PACKAGES  */
function _applyHiddenPracticePackages() {
  try {
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_PRACTICE_PKGS_KEY) || '[]');
    for (const id of hidden) {
      const idx = PRACTICE_PACKAGES.findIndex(p => p.id === id);
      if (idx !== -1) PRACTICE_PACKAGES.splice(idx, 1);
    }
  } catch(e) { console.warn('[Admin] Hidden practice pkgs load failed:', e); }
}

/* ── Storage helpers ──────────────────────────────────────── */
function _getAdminStore() {
  try { return JSON.parse(localStorage.getItem(ADMIN_DATA_KEY) || '{}'); }
  catch { return {}; }
}
function _persistSection(pkgId, testId, secKey, data) {
  const store = _getAdminStore();
  if (!store[pkgId]) store[pkgId] = {};
  if (!store[pkgId][testId]) store[pkgId][testId] = {};
  store[pkgId][testId][secKey] = data;
  _lsSave(ADMIN_DATA_KEY, store);
  _adminResetBaseline();  // re-snapshot so next navigation shows no unsaved changes
  // Live-update the in-memory package
  const t = TEST_PACKAGES[pkgId] && TEST_PACKAGES[pkgId].tests[testId];
  if (t) t[secKey] = data;
}

/* ── Auth (Supabase) ──────────────────────────────────────── */
let _adminAuth  = false;
let _adminEmail = '';
function isAdminLoggedIn() { return _adminAuth; }

async function adminLogin() {
  const email = ((document.getElementById('adminEmailInput') || {}).value || '').trim();
  const pwd   = (document.getElementById('adminPwdInput')   || {}).value || '';
  const err   = document.getElementById('adminLoginErr');
  if (!email || !pwd) { err.textContent = 'Email and password are required.'; return; }
  const btn = document.getElementById('adminLoginBtn');
  if (btn) btn.disabled = true;
  const error = await db.login(email, pwd);
  if (btn) btn.disabled = false;
  if (error) {
    err.textContent = 'Incorrect email or password.';
    return;
  }
  // Verify the account actually has the admin role
  const session = await db.getSession();
  const profile = await db.getProfile(session?.user?.id);
  if (profile?.role !== 'admin') {
    await db.logout();
    err.textContent = 'Access denied. This account does not have admin privileges.';
    return;
  }
  _adminAuth  = true;
  _adminEmail = session.user.email;
  renderAdmin();
}
async function adminLogout() {
  await db.logout();
  _adminAuth = false;
  renderAdmin();
}

/* ── Panel state ──────────────────────────────────────────── */
let _aPkg              = 'cam18';
let _aTest             = 'test1';
let _aSec              = 'listening';
let _adminMode         = 'test';      // 'test' | 'practice' | 'students'
let _aStudentId        = null;        // currently viewed student
let _aPracticeSec      = 'vocab';
let _aPracticePackage  = 'intermediate';
let _aMiniQuizTestIdx  = null;   // null = test list view; number = question editor for that test
let _mqAllTests        = [];     // working copy of quiz tests while editing
let _aShowCreatePkg        = false;
let _aShowCreateSec        = false;
let _aShowCreateTestPkg    = false;
let _aShowCreateTest       = false;
let _aListeningPart    = 0;
let _adminSnapshot         = null;   // baseline form state after each render / save
let _adminDirty            = false;  // true when form differs from baseline
let _adminRendering        = false;  // suppress dirty detection during render cycles
let _dirtyListenerAttached = false;  // ensure single listener on adminContent
let _autoSaveTimer         = null;   // debounce timer for auto-save

/* ── Main entry point ─────────────────────────────────────── */
async function renderAdmin() {
  _adminRendering = true;  // suppress dirty detection for the whole render cycle
  const container = document.getElementById('adminContent');
  if (!container) { _adminRendering = false; return; }
  // Show a brief loading state while we check the session + role
  if (!_adminAuth) {
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted)">&#8987; Loading…</div>';
    const session = await db.getSession();
    if (session?.user) {
      const profile = await db.getProfile(session.user.id);
      _adminAuth  = profile?.role === 'admin';
      _adminEmail = session.user.email || '';
    }
  }
  // Show/hide + sync the persistent global bar
  const globalBar = document.getElementById('adminGlobalBar');
  if (globalBar) {
    globalBar.style.display = _adminAuth ? '' : 'none';
    if (_adminAuth) {
      ['test','practice','students'].forEach(m => {
        const btn = document.getElementById('adminTab' + m.charAt(0).toUpperCase() + m.slice(1));
        if (btn) btn.classList.toggle('active', _adminMode === m);
      });
    }
  }

  container.innerHTML = _adminAuth ? await _buildMain() : _buildLogin();
  // Re-enable dirty detection and capture the clean baseline in a single
  // macrotask so any stray events from the DOM insertion are already past.
  setTimeout(() => { _adminRendering = false; _takeAdminSnapshot(); }, 0);
  const pwdIn = document.getElementById('adminPwdInput');
  if (pwdIn) pwdIn.addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
  const emailIn = document.getElementById('adminEmailInput');
  if (emailIn) emailIn.addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
  _ensureDirtyListener();
  _updateFloatSave();
}

/* ── Dirty-state helpers (snapshot-based) ─────────────────── */
// Serialize every user-editable field in adminContent into a comparable
// string, excluding navigation controls and ephemeral create-forms so that
// switching package / test / section never influences the comparison.
function _serializeAdminForm() {
  const root = document.getElementById('adminContent');
  if (!root) return '';
  return JSON.stringify(
    Array.from(root.querySelectorAll('input,select,textarea'))
      .filter(el => !el.closest('.admin-create-inline-form,.admin-create-pkg-card'))
      .filter(el => !el.classList.contains('test-picker-select'))
      .map(el => `${el.id || el.name}:${el.type === 'checkbox' ? el.checked : el.value}`)
  );
}
// Capture the current form as the clean baseline and clear dirty flag.
function _takeAdminSnapshot() {
  _adminSnapshot = _serializeAdminForm();
  _adminDirty    = false;
}
// Compare the current form to the baseline; set dirty only if they differ.
function _adminSetDirty() {
  if (_adminRendering)      return;  // suppress during render cycle
  if (_adminSnapshot === null) return;  // baseline not yet established
  _adminDirty = _serializeAdminForm() !== _adminSnapshot;
  // Trigger auto-save debounce if dirty
  if (_adminDirty) _adminAutoSaveTrigger();
}
function _adminClearDirty() { _adminDirty = false; }
// After a save that does NOT re-render, reset baseline to the current (saved)
// form state so subsequent navigation correctly shows no unsaved changes.
function _adminResetBaseline() {
  _adminSnapshot = _serializeAdminForm();
  _adminDirty    = false;
}
// Auto-save debounce: wait 2.5 seconds of inactivity, then save the current section
function _adminAutoSaveTrigger() {
  if (_adminRendering) return;  // don't auto-save during render cycles
  if (_adminMode !== 'test') return;  // only auto-save for test editor, not practice
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    // Determine which save function to call based on current section
    // These functions handle data collection + persistence directly
    if (_aSec === 'reading')   { const data = _collectReadingData();   if (data) _persistSection(_aPkg, _aTest, 'reading', data); }
    else if (_aSec === 'listening') { const data = _collectListeningData(); if (data) _persistSection(_aPkg, _aTest, 'listening', data); }
    else if (_aSec === 'writing') {
      const data = {
        task1: {
          prompt:           _val('wr-t1-prompt'),
          instructions:     _val('wr-t1-instructions'),
          chartDescription: _val('wr-t1-chart'),
          imageUrl:         _val('wr-t1-image-url'),
          imageType:        _val('wr-t1-image-type'),
          imageCaption:     _val('wr-t1-image-caption'),
          minWords:         parseInt(_val('wr-t1-minwords')) || 150,
          rubric:           _val('wr-t1-rubric').split('\n').map(s=>s.trim()).filter(Boolean),
          sampleAnswer:     _val('wr-t1-sample'),
        },
        task2: {
          prompt:       _val('wr-t2-prompt'),
          instructions: _val('wr-t2-instructions'),
          minWords:     parseInt(_val('wr-t2-minwords')) || 250,
          rubric:       _val('wr-t2-rubric').split('\n').map(s=>s.trim()).filter(Boolean),
          sampleAnswer: _val('wr-t2-sample'),
        },
      };
      if (data) _persistSection(_aPkg, _aTest, 'writing', data);
    }
    else if (_aSec === 'speaking') { const data = _collectSpeakingData(); if (data) _persistSection(_aPkg, _aTest, 'speaking', data); }
  }, 2500);
}
function _adminFlushAutoSave() {
  if (!_autoSaveTimer) return;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = null;
  // Immediately save without waiting for the debounce timer
  if (_adminMode !== 'test') return;
  if (_aSec === 'reading')   { const data = _collectReadingData();   if (data) _persistSection(_aPkg, _aTest, 'reading', data); }
  else if (_aSec === 'listening') { const data = _collectListeningData(); if (data) _persistSection(_aPkg, _aTest, 'listening', data); }
  else if (_aSec === 'writing') {
    const data = {
      task1: {
        prompt: _val('wr-t1-prompt'), instructions: _val('wr-t1-instructions'),
        chartDescription: _val('wr-t1-chart'), imageUrl: _val('wr-t1-image-url'),
        imageType: _val('wr-t1-image-type'), imageCaption: _val('wr-t1-image-caption'),
        minWords: parseInt(_val('wr-t1-minwords')) || 150,
        rubric: _val('wr-t1-rubric').split('\n').map(s=>s.trim()).filter(Boolean),
        sampleAnswer: _val('wr-t1-sample'),
      },
      task2: {
        prompt: _val('wr-t2-prompt'), instructions: _val('wr-t2-instructions'),
        minWords: parseInt(_val('wr-t2-minwords')) || 250,
        rubric: _val('wr-t2-rubric').split('\n').map(s=>s.trim()).filter(Boolean),
        sampleAnswer: _val('wr-t2-sample'),
      },
    };
    if (data) _persistSection(_aPkg, _aTest, 'writing', data);
  }
  else if (_aSec === 'speaking') { const data = _collectSpeakingData(); if (data) _persistSection(_aPkg, _aTest, 'speaking', data); }
}
function _adminGuard(action) {
  _adminFlushAutoSave();  // Save any pending changes before navigating away
  if (_adminDirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  _adminClearDirty();
  action();
}
function _ensureDirtyListener() {
  if (_dirtyListenerAttached) return;
  const el = document.getElementById('adminContent');
  if (!el) return;
  el.addEventListener('input', e => {
    if (e.target.closest('.admin-create-inline-form,.admin-create-pkg-card')) return;
    _adminSetDirty();
  });
  el.addEventListener('change', e => {
    if (e.target.closest('.admin-create-inline-form,.admin-create-pkg-card')) return;
    if (e.target.classList.contains('test-picker-select')) return; // navigation dropdowns
    _adminSetDirty();
  });
  _dirtyListenerAttached = true;
}

/* ── Floating save button ─────────────────────────────────── */
function _updateFloatSave() {
  const wrap = document.getElementById('adminFloatSave');
  const btn  = document.getElementById('adminFloatSaveBtn');
  if (!wrap || !btn) return;
  if (!_adminAuth || _adminMode === 'students') { wrap.style.display = 'none'; return; }
  let fn = '', label = '';
  if (_adminMode === 'test') {
    const map = {
      listening: ['adminSaveListening()', '&#128190; Save Listening'],
      reading:   ['adminSaveReading()',   '&#128190; Save Reading'],
      writing:   ['adminSaveWriting()',   '&#128190; Save Writing'],
      speaking:  ['adminSaveSpeaking()',  '&#128190; Save Speaking'],
    };
    const entry = map[_aSec];
    if (entry) { fn = entry[0]; label = entry[1]; }
  } else if (_adminMode === 'practice') {
    const inQuestionEditor = _aPracticeSec === 'mini-quiz' && _aMiniQuizTestIdx !== null;
    const map = {
      'vocab':          ['adminSaveVocab()',             '&#128190; Save Vocabulary'],
      'grammar':        ['adminSaveGrammar()',            '&#128190; Save Grammar'],
      'mini-quiz':      inQuestionEditor
                          ? ['adminSaveMiniQuizQuestions()', '&#128190; Save Questions']
                          : ['adminSaveMiniQuiz()',          '&#128190; Save Tests'],
      'reading-skills': ['adminSaveReadingSkills()',     '&#128190; Save Reading Skills'],
      'writing-tips':   ['adminSaveWritingTips()',       '&#128190; Save Writing Tips'],
    };
    const entry = map[_aPracticeSec];
    if (entry) { fn = entry[0]; label = entry[1]; }
    else       { fn = `adminSaveCustomSection('${_aPracticeSec}')`; label = '&#128190; Save Section'; }
  }
  if (fn) {
    wrap.style.display = '';
    btn.setAttribute('onclick', fn);
    btn.innerHTML = label;
  } else {
    wrap.style.display = 'none';
  }
}

/* ── Navigation helpers ───────────────────────────────────── */
function _syncPracticePackage() {
  // Sync admin's package selection to whatever the practice tab is showing.
  // Falls back to first valid package if the current selection is invalid.
  const practiceId = (typeof _activePracticePackage !== 'undefined') ? _activePracticePackage : 'intermediate';
  if (PRACTICE_PACKAGES.find(p => p.id === practiceId)) {
    _aPracticePackage = practiceId;
  } else if (!PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage)) {
    _aPracticePackage = (PRACTICE_PACKAGES[0] || {}).id || 'intermediate';
  }
  _aMiniQuizTestIdx = null;
}
function adminSetMode(mode)       { _adminGuard(() => { _adminMode = mode; _aStudentId = null; if (mode === 'practice') _syncPracticePackage(); renderAdmin(); }); }
function adminSetPkg(val)         { _adminGuard(() => { _aPkg = val; _aTest = Object.keys(TEST_PACKAGES[val].tests)[0]; _aListeningPart = 0; renderAdmin(); }); }
function adminSetTest(val)        { _adminGuard(() => { _aTest = val; _aListeningPart = 0; renderAdmin(); }); }
function adminSetSec(s)           { _adminGuard(() => { _aSec = s; if (s === 'listening') _aListeningPart = 0; renderAdmin(); }); }
function adminSetPracticePkg(id)  { _adminGuard(() => { _aPracticePackage = id; _aMiniQuizTestIdx = null; renderAdmin(); }); }
function adminSetPracticeSec(val) { _adminGuard(() => { _aPracticeSec = val; _aMiniQuizTestIdx = null; renderAdmin(); }); }

/* ── Save package / test display names ───────────────────── */
function adminSaveNames() {
  const pkgName  = _val('admin-pkg-name').trim();
  const testName = _val('admin-test-name').trim();
  if (!pkgName && !testName) { showToast('No changes.'); return; }
  const store = _getAdminStore();
  if (!store[_aPkg]) store[_aPkg] = {};
  if (pkgName) store[_aPkg]._name = pkgName;
  if (testName) {
    if (!store[_aPkg][_aTest]) store[_aPkg][_aTest] = {};
    store[_aPkg][_aTest]._name = testName;
  }
  _lsSave(ADMIN_DATA_KEY, store);
  if (pkgName)  TEST_PACKAGES[_aPkg].name = pkgName;
  if (testName) TEST_PACKAGES[_aPkg].tests[_aTest].name = testName;
  showToast('Names saved.');
  _adminClearDirty();
  renderAdmin();
}

/* ── Delete test package / individual test ────────────────── */
function adminDeleteTestPkg() {
  const pkg = TEST_PACKAGES[_aPkg];
  if (!pkg) return;
  if (!confirm(`Delete entire package "${pkg.name}"?\nAll tests inside will also be removed. This cannot be undone.`)) return;

  const customs = JSON.parse(localStorage.getItem(CUSTOM_TEST_PKGS_KEY) || '[]');
  const isCustom = customs.some(c => c.id === _aPkg);

  if (isCustom) {
    _lsSave(CUSTOM_TEST_PKGS_KEY, customs.filter(c => c.id !== _aPkg));
    const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
    delete customTests[_aPkg];
    _lsSave(CUSTOM_TESTS_KEY, customTests);
    const store = _getAdminStore();
    delete store[_aPkg];
    _lsSave(ADMIN_DATA_KEY, store);
  } else {
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_TESTS_KEY) || '{"pkgs":[],"tests":{}}');
    if (!hidden.pkgs.includes(_aPkg)) hidden.pkgs.push(_aPkg);
    _lsSave(HIDDEN_TESTS_KEY, hidden);
  }

  const name = pkg.name;
  delete TEST_PACKAGES[_aPkg];

  const remaining = Object.keys(TEST_PACKAGES);
  if (remaining.length) {
    _aPkg  = remaining[0];
    _aTest = Object.keys(TEST_PACKAGES[_aPkg].tests)[0];
  }
  renderAdmin();
  showToast(`Package "${name}" removed.`);
}

function adminDeleteTest() {
  const pkg  = TEST_PACKAGES[_aPkg];
  const test = pkg && pkg.tests[_aTest];
  if (!test) return;
  if (!confirm(`Delete test "${test.name}" from "${pkg.name}"?\nThis cannot be undone.`)) return;

  const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
  const pkgCustoms  = customTests[_aPkg] || [];
  const isCustom    = pkgCustoms.some(t => t.id === _aTest);

  if (isCustom) {
    customTests[_aPkg] = pkgCustoms.filter(t => t.id !== _aTest);
    _lsSave(CUSTOM_TESTS_KEY, customTests);
    const store = _getAdminStore();
    if (store[_aPkg]) { delete store[_aPkg][_aTest]; _lsSave(ADMIN_DATA_KEY, store); }
  } else {
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_TESTS_KEY) || '{"pkgs":[],"tests":{}}');
    if (!hidden.tests[_aPkg]) hidden.tests[_aPkg] = [];
    if (!hidden.tests[_aPkg].includes(_aTest)) hidden.tests[_aPkg].push(_aTest);
    _lsSave(HIDDEN_TESTS_KEY, hidden);
  }

  const name = test.name;
  delete pkg.tests[_aTest];

  const remaining = Object.keys(pkg.tests);
  if (remaining.length) _aTest = remaining[0];
  renderAdmin();
  showToast(`Test "${name}" removed.`);
}

/* ── Create new test package ─────────────────────────────── */
function adminConfirmCreateTestPkg() {
  const name = (_val('newTestPkgName') || '').trim();
  if (!name) { showToast('Package name is required.'); return; }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const id   = 'tpkg_' + slug + '_' + Date.now();

  // First test created automatically
  const firstTestId = 'test1';
  TEST_PACKAGES[id] = {
    id, name,
    tests: {
      [firstTestId]: { id: firstTestId, name: 'Test 1', listening: null, reading: null, writing: null, speaking: null }
    }
  };

  const customs = JSON.parse(localStorage.getItem(CUSTOM_TEST_PKGS_KEY) || '[]');
  customs.push({ id, name });
  _lsSave(CUSTOM_TEST_PKGS_KEY, customs);

  const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
  customTests[id] = [{ id: firstTestId, name: 'Test 1' }];
  _lsSave(CUSTOM_TESTS_KEY, customTests);

  _aPkg = id; _aTest = firstTestId;
  _aShowCreateTestPkg = false;
  renderAdmin();
  showToast(`Package "${name}" created.`);
}

/* ── Create new test within current package ──────────────── */
function adminConfirmCreateTest() {
  const name = (_val('newTestName') || '').trim();
  if (!name) { showToast('Test name is required.'); return; }

  const id = 'test_' + Date.now();
  TEST_PACKAGES[_aPkg].tests[id] = { id, name, listening: null, reading: null, writing: null, speaking: null };

  const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
  if (!customTests[_aPkg]) customTests[_aPkg] = [];
  customTests[_aPkg].push({ id, name });
  _lsSave(CUSTOM_TESTS_KEY, customTests);

  _aTest = id;
  _aShowCreateTest = false;
  renderAdmin();
  showToast(`Test "${name}" created.`);
}

/* ── Login view ───────────────────────────────────────────── */
function _buildLogin() {
  return `
  <div class="admin-login-wrap">
    <div class="admin-login-box">
      <img src="../assets/Logo.png" alt="Learn With Trang" class="admin-login-logo">
      <h2>Admin Panel</h2>
      <p>Sign in with your admin account to manage content</p>
      <input type="email"    id="adminEmailInput" class="admin-input admin-login-field" placeholder="Email address">
      <input type="password" id="adminPwdInput"   class="admin-input admin-login-field" placeholder="Password">
      <p class="admin-err" id="adminLoginErr"></p>
      <button class="btn btn-primary admin-login-submit" id="adminLoginBtn" onclick="adminLogin()">Sign In</button>
      <button class="admin-forgot-link" onclick="adminForgotPassword()">Forgot password?</button>
    </div>
  </div>`;
}

async function adminForgotPassword() {
  const email = (_val('adminEmailInput') || '').trim();
  const errEl = document.getElementById('adminLoginErr');
  if (!email) {
    errEl.textContent = 'Enter your email address first.';
    document.getElementById('adminEmailInput').focus();
    return;
  }
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true;
  errEl.textContent = '';
  const err = await db.resetPassword(email);
  btn.disabled = false;
  if (err) {
    errEl.textContent = err.message || 'Could not send reset email.';
  } else {
    errEl.style.color = 'var(--primary)';
    errEl.textContent = '✓ Reset link sent — check your inbox.';
  }
}

/* ── Main view ────────────────────────────────────────────── */
async function _buildMain() {
  if (_adminMode === 'practice') {
    return _buildPracticeEditor();
  }

  if (_adminMode === 'students') {
    return await _buildStudentsDashboard();
  }

  // Test editor mode
  const pkg  = TEST_PACKAGES[_aPkg];
  const test = pkg && pkg.tests[_aTest];

  const pkgOpts  = Object.values(TEST_PACKAGES)
    .map(p => `<option value="${p.id}"${p.id === _aPkg ? ' selected' : ''}>${p.name}</option>`)
    .join('');
  const testOpts = pkg ? Object.values(pkg.tests)
    .map(t => `<option value="${t.id}"${t.id === _aTest ? ' selected' : ''}>${t.name}</option>`)
    .join('') : '';
  const secTabs  = ['listening','reading','writing','speaking'].map(s =>
    `<button class="admin-sec-tab${_aSec === s ? ' active' : ''}"
      onclick="adminSetSec('${s}')">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`
  ).join('');

  const createTestPkgForm = _aShowCreateTestPkg ? `
    <div class="admin-create-inline-form">
      <input class="admin-input" id="newTestPkgName" placeholder="Package name (e.g. Cambridge IELTS 19)" style="flex:1">
      <button class="btn btn-sm btn-primary" onclick="adminConfirmCreateTestPkg()">&#10003; Create</button>
      <button class="btn btn-sm btn-outline" onclick="_aShowCreateTestPkg=false;renderAdmin()">Cancel</button>
    </div>` : '';

  const createTestForm = _aShowCreateTest ? `
    <div class="admin-create-inline-form">
      <input class="admin-input" id="newTestName" placeholder="Test name (e.g. Test 5)" style="flex:1">
      <button class="btn btn-sm btn-primary" onclick="adminConfirmCreateTest()">&#10003; Create</button>
      <button class="btn btn-sm btn-outline" onclick="_aShowCreateTest=false;renderAdmin()">Cancel</button>
    </div>` : '';

  return `
  <div class="admin-topbar">
    <div class="admin-selectors">
      <div class="admin-selector-group">
        <select class="test-picker-select" onchange="adminSetPkg(this.value)">${pkgOpts}</select>
        <button class="admin-sel-delete" title="Delete this package" onclick="adminDeleteTestPkg()">&#128465;</button>
        <button class="btn btn-sm btn-outline admin-new-btn" onclick="_aShowCreateTestPkg=!_aShowCreateTestPkg;_aShowCreateTest=false;renderAdmin()">+ Package</button>
      </div>
      <div class="admin-selector-group">
        <select class="test-picker-select" onchange="adminSetTest(this.value)">${testOpts}</select>
        <button class="admin-sel-delete" title="Delete this test" onclick="adminDeleteTest()">&#128465;</button>
        <button class="btn btn-sm btn-outline admin-new-btn" onclick="_aShowCreateTest=!_aShowCreateTest;_aShowCreateTestPkg=false;renderAdmin()">+ Test</button>
      </div>
    </div>
  </div>
  ${createTestPkgForm}${createTestForm}

  <div class="admin-names-row">
    <div class="admin-field-row" style="flex:1">
      <label class="admin-label">Package Display Name</label>
      <input class="admin-input" id="admin-pkg-name" value="${_esc(pkg ? pkg.name : '')}" placeholder="e.g. Cambridge IELTS 18">
    </div>
    <div class="admin-field-row" style="flex:1">
      <label class="admin-label">Test Display Name</label>
      <input class="admin-input" id="admin-test-name" value="${_esc(test ? test.name : '')}" placeholder="e.g. Test 1">
    </div>
    <button class="btn btn-sm btn-outline" style="align-self:flex-end;flex-shrink:0"
      onclick="adminSaveNames()">&#128190; Save Names</button>
  </div>

  <div class="admin-sec-tabs">${secTabs}</div>

  <div class="admin-editor" id="adminEditor">
    ${_buildEditor(test)}
  </div>`;
}

/* ── Editor dispatcher ────────────────────────────────────── */
function _buildEditor(test) {
  if (_aSec === 'listening') return _buildListeningEditor(test && test.listening);
  if (_aSec === 'reading')   return _buildReadingEditor(test && test.reading);
  if (_aSec === 'writing')   return _buildWritingEditor(test && test.writing);
  if (_aSec === 'speaking')  return _buildSpeakingEditor(test && test.speaking);
  return '';
}

/* ==============================================================
   LISTENING EDITOR — JSON IMPORT SCHEMA
   ============================================================== */
const LISTENING_JSON_SCHEMA = `{
  "sections": [
    {
      "section_id": 1,
      "title": "Part 1: Accommodation Enquiry",
      "audio_url": "audio/section1.mp3",
      "transcript": "...",
      "ranges": [
        { "range": "1-5",  "start": 15, "label": "Questions 1–5",  "instruction": "Complete the form.",   "group_indexes": [0] },
        { "range": "6-10", "start": 65, "label": "Questions 6–10", "instruction": "Label the map below.", "group_indexes": [1] }
      ],
      "groups": [

        // ── form_completion ─────────────────────────────────
        { "type": "form_completion",
          "questions": [
            { "id": 1, "label": "First name",  "answer": ["Emma"],       "start": 18 },
            { "id": 2, "label": "Postcode",     "answer": ["DW30 7YZ"],  "start": 24 }
          ]
        },

        // ── note_completion ─────────────────────────────────
        { "type": "note_completion",
          "questions": [
            { "id": 3, "label": "Venue type",  "answer": ["sports centre"], "start": 40 },
            { "id": 4, "label": "Open from",   "answer": ["7am"],           "start": 46 }
          ]
        },

        // ── table_completion ────────────────────────────────
        { "type": "table_completion",
          "columns": ["Activity", "Day", "Cost"],
          "questions": [
            { "id": 5, "row": "Swimming", "col": "Day",  "answer": ["Monday"],   "start": 55 },
            { "id": 6, "row": "Swimming", "col": "Cost", "answer": ["£4.50"],    "start": 58 },
            { "id": 7, "row": "Yoga",     "col": "Day",  "answer": ["Thursday"], "start": 63 }
          ]
        },

        // ── sentence_completion ─────────────────────────────
        { "type": "sentence_completion",
          "questions": [
            { "id": 8,  "label": "The café opens at ________.", "answer": ["8 in the morning"], "start": 72 },
            { "id": 9,  "label": "Car parking costs ________ per hour.", "answer": ["£2"],      "start": 78 }
          ]
        },

        // ── multiple_choice (single answer) ─────────────────
        { "type": "multiple_choice",
          "questions": [
            { "id": 11, "text": "What is the main purpose?", "options": ["A. Transport", "B. Health", "C. Education"], "answer": ["B"], "start": 105 }
          ]
        },

        // ── multiple_choice (two answers) ───────────────────
        { "type": "multiple_choice", "multi": true, "count": 2,
          "questions": [
            { "id": 14, "text": "Which TWO activities are available?",
              "options": ["A. Swimming", "B. Running", "C. Cycling", "D. Hiking", "E. Dancing"],
              "answer": ["A", "C"], "start": 140 }
          ]
        },

        // ── matching ────────────────────────────────────────
        { "type": "matching",
          "options": ["A. Monday", "B. Tuesday", "C. Wednesday", "D. Thursday", "E. Friday"],
          "questions": [
            { "id": 16, "text": "Pilates",  "answer": ["C"], "start": 158 },
            { "id": 17, "text": "Spinning", "answer": ["A"], "start": 163 }
          ]
        },

        // ── map_labeling ────────────────────────────────────
        // x, y are percentages (0–100) from top-left of the image
        { "type": "map_labeling",
          "image": "images/sports-centre-map.png",
          "labels": [
            { "id": 21, "label": "A", "answer": ["café"],         "start": 202, "x": 22.5, "y": 38.0 },
            { "id": 22, "label": "B", "answer": ["changing room"],"start": 208, "x": 55.0, "y": 62.5 },
            { "id": 23, "label": "C", "answer": ["car park"],     "start": 215, "x": 78.0, "y": 45.0 }
          ]
        },

        // ── diagram_labeling ────────────────────────────────
        { "type": "diagram_labeling",
          "image": "images/water-filter.png",
          "labels": [
            { "id": 26, "label": "1", "answer": ["inlet valve"], "start": 240, "x": 15.0, "y": 25.0 },
            { "id": 27, "label": "2", "answer": ["filter mesh"], "start": 246, "x": 50.0, "y": 50.0 }
          ]
        },

        // ── flow_chart ──────────────────────────────────────
        { "type": "flow_chart",
          "questions": [
            { "id": 31, "node": 1, "prefix": "Water collected from",  "answer": ["river"],     "suffix": "",                    "start": 290 },
            { "id": 32, "node": 2, "prefix": "Passed through a",      "answer": ["filter"],    "suffix": "to remove solids",    "start": 295 },
            { "id": 33, "node": 3, "prefix": "Treated with",          "answer": ["chemicals"], "suffix": "to kill bacteria",    "start": 302 },
            { "id": 34, "node": 4, "prefix": "Stored in a",           "answer": ["reservoir"], "suffix": "before distribution", "start": 309 }
          ]
        },

        // ── short_answer ────────────────────────────────────
        { "type": "short_answer",
          "instruction": "Write NO MORE THAN TWO WORDS AND/OR A NUMBER.",
          "questions": [
            { "id": 36, "text": "What material is the roof made from?",    "answer": ["bamboo"],  "start": 340 },
            { "id": 37, "text": "How many floors does the building have?", "answer": ["three","3"],"start": 346 }
          ]
        }

      ]
    }
  ]
}`;

const READING_JSON_SCHEMA = `{
  "passages": [
    {
      "passage_id": 1,
      "title": "Passage title",
      "text": "<p>Passage HTML...</p>",
      "groups": [
        {
          "type": "true_false_not_given",
          "instructions": "Do the following statements agree with the information in the Reading Passage? Write TRUE, FALSE or NOT GIVEN.",
          "questions": [
            { "id": 1, "text": "Statement text here.", "answer": "TRUE", "paragraphRef": "A" }
          ]
        },
        {
          "type": "multiple_choice",
          "instructions": "Choose the correct letter A, B, C or D.",
          "questions": [
            { "id": 7, "text": "Question stem...", "answer": "B",
              "options": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"] }
          ]
        },
        {
          "type": "multiple_select",
          "instructions": "Choose TWO letters A–E.",
          "count": 2,
          "questions": [
            { "id": 10, "text": "Which TWO features are mentioned?", "answer": ["B", "D"],
              "options": ["A. option", "B. option", "C. option", "D. option", "E. option"] }
          ]
        },
        {
          "type": "yes_no_not_given",
          "instructions": "Do the following statements agree with the claims of the writer? Write YES, NO or NOT GIVEN.",
          "questions": [
            { "id": 14, "text": "The writer believes X is beneficial.", "answer": "YES", "paragraphRef": "C" }
          ]
        },
        {
          "type": "matching_headings",
          "instructions": "Match each paragraph with the correct heading. NB You may use any heading more than once.",
          "questions": [
            { "id": 20, "text": "Paragraph A", "answer": "vi",
              "options": ["i. heading one", "ii. heading two", "iii. heading three", "iv. heading four", "v. heading five", "vi. heading six"] }
          ]
        },
        {
          "type": "matching_information",
          "instructions": "Which paragraph contains the following information?",
          "questions": [
            { "id": 26, "text": "A reference to historical evidence", "answer": "C",
              "options": ["A","B","C","D","E","F"] }
          ]
        },
        {
          "type": "sentence_completion",
          "instructions": "Complete the sentences below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER from the passage.",
          "questions": [
            { "id": 31, "text": "The main cause of X is ________.", "answer": "climate change" }
          ]
        },
        {
          "type": "summary_completion",
          "instructions": "Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
          "questions": [
            { "id": 35, "text": "Researchers found that ________ played a key role.", "answer": "microbes" }
          ]
        },
        {
          "type": "table_completion",
          "instructions": "Complete the table below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER.",
          "groupId": "tbl_p1_g1",
          "columns": ["Category", "Finding"],
          "questions": [
            { "id": 38, "row": "Method A", "col": "Finding", "answer": "cost effective" },
            { "id": 39, "row": "Method B", "col": "Finding", "answer": "time consuming" }
          ]
        },
        {
          "type": "diagram_labeling",
          "instructions": "Label the diagram below. Write NO MORE THAN TWO WORDS from the passage.",
          "groupId": "diag_p1_g1",
          "image": "images/diagram.png",
          "labels": [
            { "id": 40, "x": 22, "y": 35, "answer": "filter membrane" },
            { "id": 41, "x": 60, "y": 55, "answer": "storage tank" }
          ]
        }
      ]
    }
  ]
}
/* Supported types:
   true_false_not_given | yes_no_not_given | multiple_choice | multiple_select
   matching_headings | matching_information | matching_features
   sentence_completion | summary_completion | table_completion | diagram_labeling */`;

const WRITING_JSON_SCHEMA = `{
  "tasks": [
    {
      "taskNum": 1,
      "prompt": "The bar chart below shows the percentage of households in owned and rented accommodation in England and Wales between 1918 and 2011.",
      "instructions": "Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.",
      "imageUrl": "images/bar_chart.png",
      "imageType": "bar_chart",
      "imageCaption": "Figure 1: Households in England and Wales 1918–2011",
      "minWords": 150,
      "sampleAnswer": "The bar chart illustrates changes in housing tenure in England and Wales over approximately a century...",
      "rubric": [
        "I described the overall trend clearly",
        "I used appropriate data language (rose, fell, peaked at)",
        "I made at least two direct comparisons",
        "I met the minimum word count"
      ]
    },
    {
      "taskNum": 2,
      "prompt": "Some people think that universities should provide graduates with the knowledge and skills needed by employers. To what extent do you agree or disagree?",
      "instructions": "Write about the following topic. Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.",
      "minWords": 250,
      "sampleAnswer": "It is widely debated whether universities should primarily serve the needs of the job market or fulfil broader academic goals...",
      "rubric": [
        "I clearly stated my position in the introduction",
        "I developed at least two main arguments with examples",
        "I acknowledged the opposing view",
        "I wrote a clear conclusion that restates my position"
      ]
    }
  ]
}
/* imageType options: bar_chart | line_chart | pie_chart | table | diagram | map | process */`;

const SPEAKING_JSON_SCHEMA = `{
  "parts": [
    {
      "partNum": 1,
      "title": "Part 1: Introduction & Interview (4–5 minutes)",
      "questions": [
        { "text": "Can you tell me your full name?", "sampleAnswer": "My name is [name]. You can call me [nickname]." },
        { "text": "Where are you from?", "sampleAnswer": "I'm originally from [city], which is in the [region] part of [country]." },
        { "text": "Do you work or are you a student?", "sampleAnswer": "I'm currently a student studying [subject] at [university]." }
      ]
    },
    {
      "partNum": 2,
      "title": "Part 2: Individual Long Turn (3–4 minutes)",
      "prepTime": 60,
      "speakingTime": 120,
      "cueCard": {
        "topic": "Describe a place you have visited that you particularly liked.",
        "bullets": ["Where the place is", "When you visited it", "What you did there", "And explain why you liked it so much"],
        "note": "You should say:"
      },
      "followUp": "Do you often visit places like this?",
      "sampleAnswer": "I'd like to talk about [place], which I visited about [time] ago. It's located in [country/region]..."
    },
    {
      "partNum": 3,
      "title": "Part 3: Two-Way Discussion (4–5 minutes)",
      "questions": [
        { "text": "Why do you think people enjoy visiting new places?", "sampleAnswer": "I think there are several reasons. Firstly, travelling allows people to escape their daily routines..." },
        { "text": "How has tourism changed in your country in recent years?", "sampleAnswer": "Tourism in my country has changed significantly. More people now choose domestic travel because..." }
      ]
    }
  ]
}`;

/* ── Helpers ──────────────────────────────────────────────── */
function _lsNormalizeType(t) {
  return t === 'multiple_choice' ? 'mcq'
       : t === 'short_answer'    ? 'short'
       : t;
}

function _lsGroupsToFlat(section, si) {
  const flat = [];
  (section.groups || []).forEach((group, gi) => {
    const groupId  = `grp_s${si}_g${gi}_${Date.now()}`;
    const type     = _lsNormalizeType(group.type);
    const isGfx    = type === 'map_labeling' || type === 'diagram_labeling';
    const isGroup  = isGfx || ['flow_chart','table_completion','form_completion','note_completion'].includes(type);
    const items    = isGfx ? (group.labels || group.questions || []) : (group.questions || []);

    items.forEach((item, ii) => {
      const ans = Array.isArray(item.answer) ? item.answer[0] : (item.answer || '');
      const q = {
        id:      `t_s${si}_g${gi}_${ii}_${Date.now()}`,
        qNum:    item.id || (flat.length + 1),
        type,
        text:    item.label || item.text || '',
        answer:  type === 'multi' ? (Array.isArray(item.answer) ? item.answer.join(', ') : ans) : ans,
        start:   item.start || 0,
        options: group.options || item.options || [],
        count:   group.count  || item.count  || 1,
      };
      if (isGroup) q.groupId = groupId;
      if (isGfx)  { q.groupImage = group.image || ''; q.xPct = item.x || 0; q.yPct = item.y || 0; q.labelText = item.label || ''; }
      if (type === 'flow_chart')       { q.nodeNum = item.node || (ii + 1); q.prefix = item.prefix || ''; q.suffix = item.suffix || ''; }
      if (type === 'table_completion') { q.rowContext = item.row || ''; q.colContext = item.col || ''; q.groupColumns = group.columns || []; }
      flat.push(q);
    });
  });
  return flat;
}

function adminImportListeningJSON(si, replaceAll) {
  const raw = (document.getElementById(`ls-import-json-${si}`)?.value || '').trim();
  if (!raw) { showToast('Paste JSON first.'); return; }

  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }

  let section = parsed.groups ? parsed
    : parsed.sections ? (parsed.sections.find(s => s.section_id === si + 1) || parsed.sections[0])
    : null;
  if (!section) { showToast('JSON must have "sections" or "groups".'); return; }

  const flatQs = _lsGroupsToFlat(section, si);
  if (!flatQs.length) { showToast('No questions found in JSON.'); return; }

  const data = _collectListeningData();
  if (replaceAll) {
    data.sections[si].questions = flatQs;
  } else {
    data.sections[si].questions.push(...flatQs);
  }
  data.sections[si].groups = section.groups || [];
  data.sections[si].ranges = section.ranges || [];

  if (section.title && !data.sections[si].title) data.sections[si].title = section.title;
  if (section.audio_url && !data.sections[si].audioUrl) data.sections[si].audioUrl = section.audio_url;
  if (section.transcript && !data.sections[si].transcript) data.sections[si].transcript = section.transcript;

  _applyListeningEditorState(data);
  showToast(`Imported ${flatQs.length} question(s)${replaceAll ? ' (replaced all)' : ''}.`);
}

/* ==============================================================
   LISTENING EDITOR
   ============================================================== */
function _buildListeningEditor(data) {
  const sections = (data && data.sections) ? data.sections : [
    { id:'s1', title:'Part 1', audioUrl:'', transcript:'', questions:[] },
    { id:'s2', title:'Part 2', audioUrl:'', transcript:'', questions:[] },
    { id:'s3', title:'Part 3', audioUrl:'', transcript:'', questions:[] },
    { id:'s4', title:'Part 4', audioUrl:'', transcript:'', questions:[] },
  ];

  const partTabs = sections.map((sec, si) => `
    <button class="admin-part-tab${si === _aListeningPart ? ' active' : ''}"
      id="ls-tab-${si}" onclick="adminSwitchListeningPart(${si})">
      Part ${si + 1}${sec.questions.length ? ` <span class="admin-part-count">${sec.questions.length}Q</span>` : ''}
    </button>`).join('');

  const partsHTML = sections.map((sec, si) => `
    <div class="admin-card" id="ls-part-${si}"${si !== _aListeningPart ? ' style="display:none"' : ''}>
      <div class="admin-card-header">
        <span class="admin-card-title">Part ${si + 1}</span>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Section Title</label>
        <input class="admin-input" id="ls-title-${si}" value="${_esc(sec.title)}"
          placeholder="e.g. Part 1: Transport Survey">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Audio File Path / URL</label>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <input class="admin-input" id="ls-audio-${si}" value="${_esc(sec.audioUrl)}"
            placeholder="e.g. Resources/Cam18/Cam18_Audio/IELTS18_test2_audio1.mp3">
          <button class="btn btn-sm btn-outline" style="flex-shrink:0;"
            onclick="var a=document.getElementById('ls-preview-audio-${si}');a.src=document.getElementById('ls-audio-${si}').value;a.style.display='block';a.load();">&#9654; Preview</button>
        </div>
        <audio id="ls-preview-audio-${si}" controls style="display:none;width:100%;margin-top:0.4rem;" preload="none"></audio>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Transcript (HTML allowed)</label>
        <textarea class="admin-textarea admin-transcript" id="ls-transcript-${si}"
          rows="6" placeholder="Paste audioscript here...">${_esc(sec.transcript)}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Questions (${sec.questions.length})</label>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
          <button class="btn btn-sm btn-outline"
            onclick="var p=document.getElementById('ls-import-${si}');p.style.display=p.style.display==='none'?'block':'none'">
            &#8679; Import JSON</button>
        </div>
        <div id="ls-import-${si}" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:0.75rem;">
          <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.4rem;">Paste JSON from ChatGPT (full test or single section):</p>
          <textarea class="admin-textarea" id="ls-import-json-${si}" rows="7" style="font-family:monospace;font-size:0.75rem;" placeholder='{"groups":[{"type":"form_completion","questions":[...]}]}'></textarea>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="adminImportListeningJSON(${si},false)">&#8679; Append Questions</button>
            <button class="btn btn-outline" onclick="adminImportListeningJSON(${si},true)">&#8679; Replace All</button>
          </div>
          <details style="margin-top:0.6rem;">
            <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">Supported types &amp; JSON schema ▸</summary>
            <div style="position:relative;margin-top:0.4rem;">
              <button class="btn btn-sm btn-outline" style="position:absolute;top:0.4rem;right:0.4rem;z-index:1;font-size:0.72rem;padding:0.2rem 0.55rem;"
                onclick="navigator.clipboard.writeText(LISTENING_JSON_SCHEMA).then(()=>{this.textContent='&#10003; Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
              <pre style="font-size:0.68rem;line-height:1.5;overflow-x:auto;background:var(--sidebar-bg,#f8f9fa);padding:0.75rem 3.5rem 0.75rem 0.75rem;border-radius:6px;white-space:pre-wrap;margin:0;">${_esc(LISTENING_JSON_SCHEMA)}</pre>
            </div>
          </details>
        </div>
        <div id="ls-qs-${si}">
          ${sec.questions.map((q, qi) => _buildListeningQuestionRow(si, qi, q)).join('')}
        </div>
        <button class="btn btn-sm btn-outline admin-add-btn"
          onclick="adminAddListeningQ(${si})">+ Add Question</button>
      </div>
    </div>`
  ).join('');

  return `
    <div class="admin-section-header">
      <h3>Listening Editor</h3>
      <button class="btn btn-primary" onclick="adminSaveListening()">&#128190; Save Listening</button>
    </div>
    <div class="admin-part-tabs">${partTabs}</div>
    ${partsHTML}`;
}

function adminSwitchListeningPart(idx) {
  _aListeningPart = idx;
  for (let i = 0; i < 4; i++) {
    const tab  = document.getElementById(`ls-tab-${i}`);
    const card = document.getElementById(`ls-part-${i}`);
    if (tab)  tab.classList.toggle('active', i === idx);
    if (card) card.style.display = i === idx ? '' : 'none';
  }
}

function adminSetLsTimestamp(si, qi) {
  const audio = document.getElementById(`ls-preview-audio-${si}`);
  const input = document.getElementById(`ls-qstart-${si}-${qi}`);
  if (!audio || !input) return;
  if (!audio.src || audio.src === window.location.href) {
    showToast('Enter an audio URL and click \u25b6 Preview first.'); return;
  }
  if (audio.currentTime === 0 && audio.paused && (!audio.played || audio.played.length === 0)) {
    showToast('Play the audio to the right position first, then click Capture.'); return;
  }
  const t = Math.round(audio.currentTime);
  input.value = t;
  showToast(`Q${qi + 1} start \u2192 ${t}s`);
}

const _LS_ALL_TYPES = [
  ['short',              'Short Answer (fill blank)'],
  ['mcq',                'MCQ – Single Choice'],
  ['tfng',               'True / False / Not Given'],
  ['multi',              'MCQ – Multiple Choice'],
  ['matching',           'Matching (paragraph)'],
  ['form_completion',    'Form Completion'],
  ['note_completion',    'Note Completion'],
  ['sentence_completion','Sentence Completion'],
  ['table_completion',   'Table Completion'],
  ['map_labeling',       'Map Labeling'],
  ['diagram_labeling',   'Diagram Labeling'],
  ['flow_chart',         'Flow Chart'],
];
const _LS_GFX_TYPES   = ['map_labeling','diagram_labeling'];
const _LS_GROUP_TYPES = ['map_labeling','diagram_labeling','flow_chart','table_completion','form_completion','note_completion'];

function _buildListeningQuestionRow(si, qi, q) {
  const type    = q.type || 'short';
  const qNum    = q.qNum != null ? q.qNum : '';
  const text    = q.text || '';
  const answer  = Array.isArray(q.answer) ? q.answer.join(', ') : (q.answer || '');
  const count   = q.count || 2;
  const options = q.options || [];

  const typeOpts = _LS_ALL_TYPES.map(([t, label]) =>
    `<option value="${t}"${t === type ? ' selected' : ''}>${label}</option>`).join('');

  const textLabel = _LS_GFX_TYPES.includes(type) ? 'Label Letter (e.g. A, B, C)'
                  : type === 'flow_chart'         ? 'Description (optional)'
                  : type === 'table_completion'   ? 'Description (optional)'
                  : 'Question Text / Blank Label';

  const answerHint = type === 'tfng'      ? ' (TRUE / FALSE / NG)'
                   : type === 'multi'     ? ' (e.g. B, E)'
                   : type === 'mcq'       ? ' (e.g. B)'
                   : type === 'matching'  ? ' (e.g. D)'
                   : _LS_GFX_TYPES.includes(type) ? ' (e.g. café)' : '';

  const optionsSection = (type === 'mcq' || type === 'multi' || type === 'matching') ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Options (one per line)</label>
      <textarea class="admin-textarea" id="ls-opts-${si}-${qi}" rows="4"
        placeholder="Option A&#10;Option B&#10;...">${_esc(options.join('\n'))}</textarea>
    </div>` : '';

  const countSection = type === 'multi' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Number of correct answers</label>
      <input class="admin-input" style="max-width:80px;" id="ls-count-${si}-${qi}" type="number"
        min="1" max="5" value="${count}">
    </div>` : '';

  const graphicSection = _LS_GFX_TYPES.includes(type) ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Image URL</label>
      <input class="admin-input" id="ls-img-${si}-${qi}" value="${_esc(q.groupImage||'')}" placeholder="images/map.png">
    </div>
    <div class="admin-vocab-grid" style="margin-top:0.5rem;">
      <div class="admin-field-row">
        <label class="admin-label">Position X % <small>(left edge)</small></label>
        <input class="admin-input" type="number" step="0.1" min="0" max="100" id="ls-xpct-${si}-${qi}" value="${q.xPct||0}">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Position Y % <small>(top edge)</small></label>
        <input class="admin-input" type="number" step="0.1" min="0" max="100" id="ls-ypct-${si}-${qi}" value="${q.yPct||0}">
      </div>
    </div>` : '';

  const tableSection = type === 'table_completion' ? `
    <div class="admin-vocab-grid" style="margin-top:0.5rem;">
      <div class="admin-field-row">
        <label class="admin-label">Row label</label>
        <input class="admin-input" id="ls-row-${si}-${qi}" value="${_esc(q.rowContext||'')}" placeholder="e.g. Swimming">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Column</label>
        <input class="admin-input" id="ls-col-${si}-${qi}" value="${_esc(q.colContext||'')}" placeholder="e.g. Day">
      </div>
    </div>` : '';

  const flowSection = type === 'flow_chart' ? `
    <div style="display:grid;grid-template-columns:80px 1fr 1fr;gap:0.5rem;margin-top:0.5rem;align-items:end;">
      <div class="admin-field-row">
        <label class="admin-label">Node #</label>
        <input class="admin-input" type="number" min="1" id="ls-node-${si}-${qi}" value="${q.nodeNum||1}">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Text <em>before</em> blank</label>
        <input class="admin-input" id="ls-prefix-${si}-${qi}" value="${_esc(q.prefix||'')}" placeholder="e.g. Water is">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Text <em>after</em> blank</label>
        <input class="admin-input" id="ls-suffix-${si}-${qi}" value="${_esc(q.suffix||'')}" placeholder="e.g. then filtered.">
      </div>
    </div>` : '';

  const groupIdSection = `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Group ID <small style="color:var(--text-muted);">(questions with same ID render together)</small></label>
      <input class="admin-input" id="ls-grpid-${si}-${qi}" value="${_esc(q.groupId||'')}" placeholder="e.g. map_part1_a">
    </div>`;

  return `
    <div class="admin-q-row" id="ls-q-${si}-${qi}">
      <div class="admin-q-header">
        <span class="admin-q-num">Q${qi + 1}</span>
        <select class="admin-select" id="ls-type-${si}-${qi}"
          onchange="adminRefreshListeningQ(${si},${qi})">${typeOpts}</select>
        <input class="admin-input admin-qnum-input" id="ls-qnum-${si}-${qi}"
          value="${_esc(String(qNum))}" placeholder="Q# (e.g. 3)">
        <button class="btn btn-sm btn-danger admin-remove-btn"
          onclick="adminRemoveListeningQ(${si},${qi})">&#10005;</button>
      </div>
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">${textLabel}</label>
        <input class="admin-input" id="ls-text-${si}-${qi}"
          value="${_esc(text)}" placeholder="${_LS_GFX_TYPES.includes(type) ? 'A' : 'Question text'}">
      </div>
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Answer${answerHint}</label>
        <input class="admin-input" id="ls-ans-${si}-${qi}"
          value="${_esc(answer)}" placeholder="Correct answer">
      </div>
      ${optionsSection}${countSection}${graphicSection}${tableSection}${flowSection}${groupIdSection}
      <div class="admin-field-row ls-timestamp-row" style="margin-top:0.5rem;">
        <label class="admin-label">Question Start <small style="color:var(--text-muted);">(seconds into audio)</small></label>
        <div style="display:flex;gap:0.4rem;align-items:center;">
          <input class="admin-input" type="number" min="0" step="1" style="max-width:100px;"
            id="ls-qstart-${si}-${qi}" value="${q.questionStart != null ? Math.round(q.questionStart) : ''}">
          <button class="btn btn-sm btn-outline" style="flex-shrink:0;font-size:0.75rem;"
            onclick="adminSetLsTimestamp(${si},${qi})" title="Capture current audio position">&#9201; Capture</button>
        </div>
      </div>
    </div>`;
}

function adminAddListeningQ(si) {
  const data = _collectListeningData();
  data.sections[si].questions.push({
    id: `ls${si}_q${Date.now()}`, qNum: '', type: 'short', text: '', answer: ''
  });
  _applyListeningEditorState(data);
}
function adminRemoveListeningQ(si, qi) {
  if (!confirm('Remove this question?')) return;
  const data = _collectListeningData();
  data.sections[si].questions.splice(qi, 1);
  _applyListeningEditorState(data);
}
function adminRefreshListeningQ(si, qi) {
  const data = _collectListeningData();
  _applyListeningEditorState(data);
}
function _applyListeningEditorState(data) {
  const editor = document.getElementById('adminEditor');
  if (!editor) return;
  editor.innerHTML = _buildListeningEditor(data);
}
function _collectListeningData() {
  const numParts = 4;
  const sections = [];
  for (let si = 0; si < numParts; si++) {
    const title      = _val(`ls-title-${si}`);
    const audioUrl   = _val(`ls-audio-${si}`);
    const transcript = _val(`ls-transcript-${si}`);
    const questions  = [];
    let qi = 0;
    while (document.getElementById(`ls-q-${si}-${qi}`)) {
      const type       = _val(`ls-type-${si}-${qi}`);
      const qNum       = _val(`ls-qnum-${si}-${qi}`);
      const text       = _val(`ls-text-${si}-${qi}`);
      const rawAns     = _val(`ls-ans-${si}-${qi}`);
      const count      = parseInt(_val(`ls-count-${si}-${qi}`)) || 2;
      const rawOpts    = _val(`ls-opts-${si}-${qi}`);
      const options    = rawOpts ? rawOpts.split('\n').map(s => s.trim()).filter(Boolean) : [];
      const answer     = type === 'multi'
        ? rawAns.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        : rawAns.trim();
      const parsedNum  = qNum && !isNaN(qNum) ? parseInt(qNum) : (qNum || '');
      const groupId    = _val(`ls-grpid-${si}-${qi}`);
      const groupImage = _val(`ls-img-${si}-${qi}`);
      const xPct       = parseFloat(_val(`ls-xpct-${si}-${qi}`)) || 0;
      const yPct       = parseFloat(_val(`ls-ypct-${si}-${qi}`)) || 0;
      const rowContext  = _val(`ls-row-${si}-${qi}`);
      const colContext  = _val(`ls-col-${si}-${qi}`);
      const nodeNum    = parseInt(_val(`ls-node-${si}-${qi}`)) || 0;
      const prefix     = _val(`ls-prefix-${si}-${qi}`);
      const suffix     = _val(`ls-suffix-${si}-${qi}`);
      const qsRaw = _val(`ls-qstart-${si}-${qi}`);
      const questionStart = qsRaw !== '' ? parseInt(qsRaw, 10) : NaN;
      questions.push({
        id: `t_s${si}_q${qi}`,
        qNum: parsedNum,
        type,
        text,
        answer,
        ...(options.length ? { options } : {}),
        ...(type === 'multi' ? { count } : {}),
        ...(groupId    ? { groupId }    : {}),
        ...(groupImage ? { groupImage } : {}),
        ...(xPct       ? { xPct }       : {}),
        ...(yPct       ? { yPct }       : {}),
        ...(rowContext  ? { rowContext } : {}),
        ...(colContext  ? { colContext } : {}),
        ...(nodeNum     ? { nodeNum }    : {}),
        ...(prefix      ? { prefix }     : {}),
        ...(suffix      ? { suffix }     : {}),
        ...(questionStart >= 0 && !isNaN(questionStart) ? { questionStart } : {}),
      });
      qi++;
    }
    sections.push({ id: `s${si+1}`, title, audioUrl, transcript, questions });
  }
  return { sections };
}
function adminSaveListening() {
  const data = _collectListeningData();
  _persistSection(_aPkg, _aTest, 'listening', data);
  showToast('Listening saved.');
}

/* ==============================================================
   READING EDITOR
   ============================================================== */
function _buildReadingEditor(data) {
  const passages = (data && data.passages) ? data.passages : [
    { id:'p1', title:'', text:'', questions:[] },
    { id:'p2', title:'', text:'', questions:[] },
    { id:'p3', title:'', text:'', questions:[] },
  ];

  const passagesHTML = passages.map((p, pi) => `
    <div class="admin-card" id="rd-passage-${pi}">
      <div class="admin-card-header">
        <span class="admin-card-title">Passage ${pi + 1}</span>
        ${passages.length > 1 ? `<button class="btn btn-sm btn-danger" onclick="adminRemoveReadingPassage(${pi})" style="margin-left:auto;">&#10005; Remove Passage</button>` : ''}
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Passage Title</label>
        <input class="admin-input" id="rd-ptitle-${pi}" value="${_esc(p.title)}"
          placeholder="e.g. The Rise of Urban Farming">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Passage Text (HTML &lt;p&gt; tags supported)</label>
        <textarea class="admin-textarea admin-passage-text" id="rd-ptext-${pi}"
          rows="10" placeholder="&lt;p&gt;Paragraph one...&lt;/p&gt;">${_esc(p.text)}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Questions (${p.questions.length})</label>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
          <button class="btn btn-sm btn-outline"
            onclick="var el=document.getElementById('rd-import-${pi}');el.style.display=el.style.display==='none'?'block':'none'">
            &#8679; Import JSON</button>
        </div>
        <div id="rd-import-${pi}" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:0.75rem;">
          <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.4rem;">Paste JSON (full reading or single passage):</p>
          <textarea class="admin-textarea" id="rd-import-json-${pi}" rows="7" style="font-family:monospace;font-size:0.75rem;" placeholder='{"groups":[{"type":"true_false_not_given","questions":[...]}]}'></textarea>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="adminImportReadingJSON(${pi},false)">&#8679; Append Questions</button>
            <button class="btn btn-outline" onclick="adminImportReadingJSON(${pi},true)">&#8679; Replace All</button>
          </div>
          <details style="margin-top:0.6rem;">
            <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">Supported types &amp; JSON schema &#9658;</summary>
            <div style="position:relative;margin-top:0.4rem;">
              <button class="btn btn-sm btn-outline" style="position:absolute;top:0.4rem;right:0.4rem;z-index:1;font-size:0.72rem;padding:0.2rem 0.55rem;"
                onclick="navigator.clipboard.writeText(READING_JSON_SCHEMA).then(()=>{this.textContent='&#10003; Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
              <pre style="font-size:0.68rem;line-height:1.5;overflow-x:auto;background:var(--sidebar-bg,#f8f9fa);padding:0.75rem 3.5rem 0.75rem 0.75rem;border-radius:6px;white-space:pre-wrap;margin:0;">${_esc(READING_JSON_SCHEMA)}</pre>
            </div>
          </details>
        </div>
        <div id="rd-qs-${pi}">
          ${p.questions.map((q, qi) => _buildReadingQuestionRow(pi, qi, q)).join('')}
        </div>
        <button class="btn btn-sm btn-outline admin-add-btn"
          onclick="adminAddReadingQ(${pi})">+ Add Question</button>
      </div>
    </div>`
  ).join('');

  return `
    <div class="admin-section-header">
      <h3>Reading Editor</h3>
      <button class="btn btn-primary" onclick="adminSaveReading()">&#128190; Save Reading</button>
    </div>
    ${passagesHTML}
    <button class="btn btn-sm btn-outline" style="margin-top:0.5rem;" onclick="adminAddReadingPassage()">+ Add Passage</button>`;
}

const _RD_ALL_TYPES = [
  ['tfng',                      'True / False / Not Given'],
  ['ynng',                      'Yes / No / Not Given'],
  ['mcq',                       'Multiple Choice (single)'],
  ['multi',                     'Multiple Choice (multi)'],
  ['matching_headings',         'Matching — Headings'],
  ['matching_information',      'Matching — Information (NB)'],
  ['matching_features',         'Matching — Features'],
  ['matching_sentence_endings', 'Matching — Sentence Endings'],
  ['matching',                  'Matching (generic)'],
  ['short',                     'Short Answer'],
  ['sentence_completion',       'Sentence Completion'],
  ['summary_completion',        'Summary / Note Completion'],
  ['completion',                'Inline Completion (blanks in text)'],
  ['table_completion',          'Table Completion'],
  ['diagram_labeling',          'Diagram Labeling'],
];

function _buildReadingQuestionRow(pi, qi, q) {
  const type    = q.type || 'tfng';
  const qNum    = q.qNum != null ? q.qNum : '';
  const text    = q.text || '';
  const answer  = Array.isArray(q.answer) ? q.answer.join(', ') : (q.answer || '');
  const count   = q.count || 2;
  const options = q.options || [];

  const typeOpts = _RD_ALL_TYPES.map(([t, label]) =>
    `<option value="${t}"${t === type ? ' selected' : ''}>${label}</option>`).join('');

  const answerHint = type === 'tfng'  ? ' (TRUE / FALSE / NOT GIVEN)'
                   : type === 'ynng'  ? ' (YES / NO / NOT GIVEN)'
                   : type === 'multi' ? ' (e.g. B, D)'
                   : type === 'mcq'   ? ' (e.g. B)' : '';

  const isMatchingType = type === 'matching' || type === 'matching_headings' ||
    type === 'matching_information' || type === 'matching_features' ||
    type === 'matching_sentence_endings';

  const optionsSection = (type === 'mcq' || type === 'multi' || isMatchingType) ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Options (one per line${isMatchingType ? ' — full heading/paragraph text or just letter' : ''})</label>
      <textarea class="admin-textarea" id="rd-opts-${pi}-${qi}" rows="4"
        placeholder="A. First option&#10;B. Second option&#10;...">${_esc(options.join('\n'))}</textarea>
    </div>` : '';

  const completionSection = type === 'completion' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Content tokens (JSON array) <small style="color:var(--text-muted)">— <code>{"type":"text","value":"…"}</code> or <code>{"type":"blank","id":"7"}</code></small></label>
      <textarea class="admin-textarea" id="rd-content-${pi}-${qi}" rows="5"
        style="font-family:monospace;font-size:0.78rem;"
        placeholder='[{"type":"text","value":"Urban farms have grown in "},{"type":"blank","id":"6"},{"type":"text","value":" cities."}]'>${_esc(q.content ? JSON.stringify(q.content) : '')}</textarea>
    </div>` : '';

  const answerRuleSection = (type === 'short' || type === 'sentence_completion' ||
    type === 'summary_completion' || type === 'completion') ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Answer Rule <small style="color:var(--text-muted);">(e.g. NO MORE THAN TWO WORDS)</small></label>
      <input class="admin-input" id="rd-ansrule-${pi}-${qi}" value="${_esc(q.answerRule||'')}"
        placeholder="NO MORE THAN TWO WORDS AND/OR A NUMBER">
    </div>` : '';

  const countSection = type === 'multi' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Number of correct answers</label>
      <input class="admin-input" style="max-width:80px;" id="rd-count-${pi}-${qi}"
        type="number" min="1" max="5" value="${count}">
    </div>` : '';

  const graphicSection = type === 'diagram_labeling' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Image URL</label>
      <input class="admin-input" id="rd-img-${pi}-${qi}" value="${_esc(q.groupImage||'')}" placeholder="images/diagram.png">
    </div>
    <div class="admin-vocab-grid" style="margin-top:0.5rem;">
      <div class="admin-field-row">
        <label class="admin-label">X % position</label>
        <input class="admin-input" type="number" step="0.1" min="0" max="100" id="rd-xpct-${pi}-${qi}" value="${q.xPct||0}">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Y % position</label>
        <input class="admin-input" type="number" step="0.1" min="0" max="100" id="rd-ypct-${pi}-${qi}" value="${q.yPct||0}">
      </div>
    </div>` : '';

  const tableSection = type === 'table_completion' ? `
    <div class="admin-vocab-grid" style="margin-top:0.5rem;">
      <div class="admin-field-row">
        <label class="admin-label">Row label</label>
        <input class="admin-input" id="rd-row-${pi}-${qi}" value="${_esc(q.rowContext||'')}" placeholder="e.g. Method A">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Column</label>
        <input class="admin-input" id="rd-col-${pi}-${qi}" value="${_esc(q.colContext||'')}" placeholder="e.g. Finding">
      </div>
    </div>` : '';

  const groupIdSection = (type === 'table_completion' || type === 'diagram_labeling') ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Group ID <small style="color:var(--text-muted);">(questions sharing same ID render together)</small></label>
      <input class="admin-input" id="rd-grpid-${pi}-${qi}" value="${_esc(q.groupId||'')}" placeholder="e.g. diag_p1_g1">
    </div>` : '';

  const instructionsSection = `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Instructions <small style="color:var(--text-muted);">(shown before this question; leave blank to inherit from group)</small></label>
      <input class="admin-input" id="rd-instr-${pi}-${qi}" value="${_esc(q.instructions||'')}"
        placeholder="e.g. Choose the correct letter A, B, C or D.">
    </div>`;

  const paraRefSection = `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Paragraph Ref <small style="color:var(--text-muted);">(e.g. A, B, C — for answer highlight)</small></label>
      <input class="admin-input" style="max-width:80px;" id="rd-para-${pi}-${qi}" value="${_esc(q.paragraphRef||'')}" placeholder="A">
    </div>`;

  return `
    <div class="admin-q-row" id="rd-q-${pi}-${qi}">
      <div class="admin-q-header">
        <span class="admin-q-num">Q${qi + 1}</span>
        <select class="admin-select" id="rd-type-${pi}-${qi}"
          onchange="adminRefreshReadingQ(${pi},${qi})">${typeOpts}</select>
        <input class="admin-input admin-qnum-input" id="rd-qnum-${pi}-${qi}"
          value="${_esc(String(qNum))}" placeholder="Q#">
        <button class="btn btn-sm btn-danger admin-remove-btn"
          onclick="adminRemoveReadingQ(${pi},${qi})">&#10005;</button>
      </div>
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Question Text / Blank Label</label>
        <input class="admin-input" id="rd-text-${pi}-${qi}"
          value="${_esc(text)}" placeholder="Question stem or label letter">
      </div>
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Answer${answerHint}</label>
        <input class="admin-input" id="rd-ans-${pi}-${qi}"
          value="${_esc(answer)}" placeholder="Correct answer">
      </div>
      ${optionsSection}${countSection}${completionSection}${answerRuleSection}${graphicSection}${tableSection}${groupIdSection}${instructionsSection}${paraRefSection}
    </div>`;
}

function _rdGroupsToFlat(passage, pi) {
  const flat = [];
  (passage.groups || []).forEach((group, gi) => {
    const rawType = (group.type || '').toLowerCase().replace(/[- ]/g, '_');
    const typeMap = {
      multiple_choice: 'mcq', multiple_select: 'multi',
      true_false_not_given: 'tfng', yes_no_not_given: 'ynng',
      matching_headings: 'matching_headings',
      matching_information: 'matching_information',
      matching_features: 'matching_features',
      matching_sentence_endings: 'matching_sentence_endings',
      sentence_completion: 'sentence_completion',
      summary_completion: 'summary_completion',
      table_completion: 'table_completion', diagram_labeling: 'diagram_labeling',
    };
    const type = typeMap[rawType] || rawType;
    const isGfx   = type === 'diagram_labeling';
    const isGroup = type === 'table_completion' || type === 'diagram_labeling';
    const groupId = group.groupId || (isGroup ? `grp_p${pi}_g${gi}_${Date.now()}` : '');
    const items   = isGfx ? (group.labels || group.questions || []) : (group.questions || []);

    items.forEach((item, ii) => {
      const ans = Array.isArray(item.answer) ? item.answer : (item.answer || '');
      const q = {
        id:           item.id || (flat.length + 1),
        qNum:         item.id || (flat.length + 1),
        type,
        text:         item.text || item.label || '',
        answer:       Array.isArray(ans) ? ans.join(', ') : ans,
        instructions: ii === 0 ? (group.instructions || '') : '',
        paragraphRef: item.paragraphRef || '',
        ...(group.options || item.options ? { options: group.options || item.options || [] } : {}),
        ...(type === 'multi' ? { count: group.count || item.count || 2 } : {}),
        ...(isGroup ? { groupId } : {}),
        ...(isGfx   ? { groupImage: group.image || '', xPct: item.x || 0, yPct: item.y || 0 } : {}),
        ...(type === 'table_completion' ? { rowContext: item.row || '', colContext: item.col || '' } : {}),
      };
      flat.push(q);
    });
  });
  return flat;
}

function adminImportReadingJSON(pi, replaceAll) {
  const raw = (document.getElementById(`rd-import-json-${pi}`)?.value || '').trim();
  if (!raw) { showToast('Paste JSON first.'); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }

  let passage = parsed.groups ? parsed
    : parsed.passages ? (parsed.passages.find(p => p.passage_id === pi + 1) || parsed.passages[0])
    : null;
  if (!passage) { showToast('JSON must have "passages" or "groups".'); return; }

  const flatQs = _rdGroupsToFlat(passage, pi);
  if (!flatQs.length) { showToast('No questions found in JSON.'); return; }

  const data = _collectReadingData();
  if (replaceAll) {
    data.passages[pi].questions = flatQs;
  } else {
    data.passages[pi].questions.push(...flatQs);
  }
  if (passage.title && !data.passages[pi].title) data.passages[pi].title = passage.title;
  if (passage.text  && !data.passages[pi].text)  data.passages[pi].text  = passage.text;

  _applyReadingEditorState(data);
  showToast(`Imported ${flatQs.length} question(s)${replaceAll ? ' (replaced all)' : ''}.`);
}

function adminAddReadingPassage() {
  const d = _collectReadingData();
  const n = d.passages.length + 1;
  d.passages.push({ id:`p${n}`, title:'', text:'', questions:[] });
  _applyReadingEditorState(d);
}
function adminRemoveReadingPassage(pi) {
  if (!confirm('Remove this passage and all its questions?')) return;
  const d = _collectReadingData();
  d.passages.splice(pi, 1);
  _applyReadingEditorState(d);
}
function adminAddReadingQ(pi)         { const d = _collectReadingData(); d.passages[pi].questions.push({ id:`rd_p${pi}_q${Date.now()}`, type:'tfng', text:'', answer:'' }); _applyReadingEditorState(d); }
function adminRemoveReadingQ(pi, qi)  { if (!confirm('Remove this question?')) return; const d = _collectReadingData(); d.passages[pi].questions.splice(qi,1); _applyReadingEditorState(d); }
function adminRefreshReadingQ(pi, qi) { _applyReadingEditorState(_collectReadingData()); }
function _applyReadingEditorState(data) { const e = document.getElementById('adminEditor'); if(e) e.innerHTML = _buildReadingEditor(data); }

function _collectReadingData() {
  const passages = [];
  let pi = 0;
  while (document.getElementById(`rd-passage-${pi}`)) {
    const title = _val(`rd-ptitle-${pi}`);
    const text  = _val(`rd-ptext-${pi}`);
    const questions = [];
    let qi = 0;
    while (document.getElementById(`rd-q-${pi}-${qi}`)) {
      const type        = _val(`rd-type-${pi}-${qi}`);
      const qText       = _val(`rd-text-${pi}-${qi}`);
      const rawAns      = _val(`rd-ans-${pi}-${qi}`);
      const rawOpts     = _val(`rd-opts-${pi}-${qi}`);
      const options     = rawOpts ? rawOpts.split('\n').map(s => s.trim()).filter(Boolean) : [];
      const count       = parseInt(_val(`rd-count-${pi}-${qi}`)) || 2;
      const qNum        = _val(`rd-qnum-${pi}-${qi}`);
      const parsedNum   = qNum && !isNaN(qNum) ? parseInt(qNum) : (qNum || (pi * 100 + qi + 1));
      const groupId     = _val(`rd-grpid-${pi}-${qi}`);
      const groupImage  = _val(`rd-img-${pi}-${qi}`);
      const xPct        = parseFloat(_val(`rd-xpct-${pi}-${qi}`)) || 0;
      const yPct        = parseFloat(_val(`rd-ypct-${pi}-${qi}`)) || 0;
      const rowContext   = _val(`rd-row-${pi}-${qi}`);
      const colContext   = _val(`rd-col-${pi}-${qi}`);
      const instructions = _val(`rd-instr-${pi}-${qi}`);
      const paragraphRef = _val(`rd-para-${pi}-${qi}`);
      const answerRule   = _val(`rd-ansrule-${pi}-${qi}`);
      const rawContent   = _val(`rd-content-${pi}-${qi}`);
      let content = null;
      if (type === 'completion' && rawContent) {
        try { content = JSON.parse(rawContent); } catch(e) { /* leave null */ }
      }
      const answer = type === 'multi'
        ? rawAns.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        : rawAns.trim();
      questions.push({
        id: parsedNum,
        qNum: parsedNum,
        type, text: qText, answer,
        ...(options.length      ? { options }      : {}),
        ...(type === 'multi'    ? { count }         : {}),
        ...(content             ? { content }       : {}),
        ...(answerRule          ? { answerRule }    : {}),
        ...(groupId             ? { groupId }       : {}),
        ...(groupImage          ? { groupImage }    : {}),
        ...(xPct                ? { xPct }          : {}),
        ...(yPct                ? { yPct }          : {}),
        ...(rowContext           ? { rowContext }    : {}),
        ...(colContext           ? { colContext }    : {}),
        ...(instructions        ? { instructions }  : {}),
        ...(paragraphRef        ? { paragraphRef }  : {}),
      });
      qi++;
    }
    passages.push({ id:`p${pi+1}`, title, text, questions });
    pi++;
  }
  return { passages };
}
function adminSaveReading() {
  const data = _collectReadingData();
  _persistSection(_aPkg, _aTest, 'reading', data);
  showToast('Reading saved.');
}

/* ==============================================================
   WRITING EDITOR
   ============================================================== */
function _buildWritingEditor(data) {
  const t1 = (data && data.task1) || { prompt:'', instructions:'', chartDescription:'', imageUrl:'', imageType:'bar_chart', imageCaption:'', minWords:150, rubric:[], sampleAnswer:'' };
  const t2 = (data && data.task2) || { prompt:'', instructions:'', minWords:250, rubric:[], sampleAnswer:'' };

  const wrImportPanel = `
    <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
      <button class="btn btn-sm btn-outline"
        onclick="var el=document.getElementById('wr-import-panel');el.style.display=el.style.display==='none'?'block':'none'">
        &#8679; Import JSON</button>
    </div>
    <div id="wr-import-panel" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:0.75rem;">
      <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.4rem;">Paste Writing JSON from ChatGPT:</p>
      <textarea class="admin-textarea" id="wr-import-json" rows="7" style="font-family:monospace;font-size:0.75rem;" placeholder='{"tasks":[{"taskNum":1,"prompt":"..."}]}'></textarea>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
        <button class="btn btn-primary" onclick="adminImportWritingJSON()">&#8679; Import</button>
      </div>
      <details style="margin-top:0.6rem;">
        <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">JSON schema &#9658;</summary>
        <div style="position:relative;margin-top:0.4rem;">
          <button class="btn btn-sm btn-outline" style="position:absolute;top:0.4rem;right:0.4rem;z-index:1;font-size:0.72rem;padding:0.2rem 0.55rem;"
            onclick="navigator.clipboard.writeText(WRITING_JSON_SCHEMA).then(()=>{this.textContent='&#10003; Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
          <pre style="font-size:0.68rem;line-height:1.5;overflow-x:auto;background:var(--sidebar-bg,#f8f9fa);padding:0.75rem 3.5rem 0.75rem 0.75rem;border-radius:6px;white-space:pre-wrap;margin:0;">${_esc(WRITING_JSON_SCHEMA)}</pre>
        </div>
      </details>
    </div>`;

  const IMAGE_TYPES = ['bar_chart','line_chart','pie_chart','table','diagram','map','process'];
  const imgTypeOpts = IMAGE_TYPES.map(t => `<option value="${t}"${t === (t1.imageType||'bar_chart') ? ' selected' : ''}>${t.replace(/_/g,' ')}</option>`).join('');

  return `
    <div class="admin-section-header">
      <h3>Writing Editor</h3>
      <button class="btn btn-primary" onclick="adminSaveWriting()">&#128190; Save Writing</button>
    </div>
    ${wrImportPanel}

    <div class="admin-card">
      <div class="admin-card-header"><span class="admin-card-title">Task 1</span></div>
      <div class="admin-field-row">
        <label class="admin-label">Task 1 Prompt</label>
        <textarea class="admin-textarea" id="wr-t1-prompt" rows="4"
          placeholder="The bar chart below shows...">${_esc(t1.prompt)}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Instructions (shown to student)</label>
        <textarea class="admin-textarea" id="wr-t1-instructions" rows="2"
          placeholder="Summarise the information by selecting and reporting the main features...">${_esc(t1.instructions||'')}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Image URL <small style="color:var(--text-muted);">(chart / diagram)</small></label>
        <input class="admin-input" id="wr-t1-image-url" value="${_esc(t1.imageUrl||'')}"
          placeholder="e.g. images/bar_chart.png">
      </div>
      <div class="admin-vocab-grid" style="margin-top:0.5rem;">
        <div class="admin-field-row">
          <label class="admin-label">Image Type</label>
          <select class="admin-select" id="wr-t1-image-type">${imgTypeOpts}</select>
        </div>
        <div class="admin-field-row">
          <label class="admin-label">Image Caption</label>
          <input class="admin-input" id="wr-t1-image-caption" value="${_esc(t1.imageCaption||'')}"
            placeholder="Figure 1: ...">
        </div>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Chart / Image Description <small style="color:var(--text-muted);">(text fallback when no image)</small></label>
        <textarea class="admin-textarea" id="wr-t1-chart" rows="3"
          placeholder="The bar chart shows...">${_esc(t1.chartDescription || '')}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Minimum Words</label>
        <input class="admin-input" style="max-width:100px;" id="wr-t1-minwords"
          type="number" value="${t1.minWords || 150}">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Self-Assessment Rubric (one item per line)</label>
        <textarea class="admin-textarea" id="wr-t1-rubric" rows="4"
          placeholder="I described the overall trend&#10;I used appropriate data language...">${_esc((t1.rubric||[]).join('\n'))}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Sample Answer <small style="color:var(--text-muted);">(shown after submission)</small></label>
        <textarea class="admin-textarea" id="wr-t1-sample" rows="5"
          placeholder="The bar chart illustrates...">${_esc(t1.sampleAnswer||'')}</textarea>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header"><span class="admin-card-title">Task 2</span></div>
      <div class="admin-field-row">
        <label class="admin-label">Task 2 Prompt</label>
        <textarea class="admin-textarea" id="wr-t2-prompt" rows="4"
          placeholder="Some people believe that...">${_esc(t2.prompt)}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Instructions (shown to student)</label>
        <textarea class="admin-textarea" id="wr-t2-instructions" rows="2"
          placeholder="Write about the following topic. Give reasons for your answer...">${_esc(t2.instructions||'')}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Minimum Words</label>
        <input class="admin-input" style="max-width:100px;" id="wr-t2-minwords"
          type="number" value="${t2.minWords || 250}">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Self-Assessment Rubric (one item per line)</label>
        <textarea class="admin-textarea" id="wr-t2-rubric" rows="4"
          placeholder="I clearly discussed BOTH views&#10;I gave a clear personal opinion...">${_esc((t2.rubric||[]).join('\n'))}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Sample Answer <small style="color:var(--text-muted);">(shown after submission)</small></label>
        <textarea class="admin-textarea" id="wr-t2-sample" rows="6"
          placeholder="It is widely debated whether...">${_esc(t2.sampleAnswer||'')}</textarea>
      </div>
    </div>`;
}
function adminSaveWriting() {
  const data = {
    task1: {
      prompt:           _val('wr-t1-prompt'),
      instructions:     _val('wr-t1-instructions'),
      chartDescription: _val('wr-t1-chart'),
      imageUrl:         _val('wr-t1-image-url'),
      imageType:        _val('wr-t1-image-type'),
      imageCaption:     _val('wr-t1-image-caption'),
      minWords:         parseInt(_val('wr-t1-minwords')) || 150,
      rubric:           _val('wr-t1-rubric').split('\n').map(s=>s.trim()).filter(Boolean),
      sampleAnswer:     _val('wr-t1-sample'),
    },
    task2: {
      prompt:       _val('wr-t2-prompt'),
      instructions: _val('wr-t2-instructions'),
      minWords:     parseInt(_val('wr-t2-minwords')) || 250,
      rubric:       _val('wr-t2-rubric').split('\n').map(s=>s.trim()).filter(Boolean),
      sampleAnswer: _val('wr-t2-sample'),
    },
  };
  _persistSection(_aPkg, _aTest, 'writing', data);
  showToast('Writing saved.');
}

function adminImportWritingJSON() {
  const raw = (document.getElementById('wr-import-json')?.value || '').trim();
  if (!raw) { showToast('Paste JSON first.'); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }

  const tasks = parsed.tasks || (parsed.task1 ? [parsed.task1, parsed.task2].filter(Boolean) : []);
  if (!tasks.length) { showToast('JSON must have "tasks" array.'); return; }

  const applyTask = (t, prefix) => {
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set(`${prefix}-prompt`,       t.prompt || '');
    set(`${prefix}-instructions`, t.instructions || '');
    set(`${prefix}-minwords`,     t.minWords || t.minWords);
    set(`${prefix}-rubric`,       (t.rubric || []).join('\n'));
    set(`${prefix}-sample`,       t.sampleAnswer || '');
    if (prefix === 'wr-t1') {
      set('wr-t1-image-url',     t.imageUrl || '');
      set('wr-t1-image-caption', t.imageCaption || '');
      set('wr-t1-chart',         t.chartDescription || '');
      const sel = document.getElementById('wr-t1-image-type');
      if (sel && t.imageType) sel.value = t.imageType;
    }
  };

  tasks.forEach(t => {
    if (t.taskNum === 1) applyTask(t, 'wr-t1');
    if (t.taskNum === 2) applyTask(t, 'wr-t2');
  });
  showToast(`Writing imported (${tasks.length} task${tasks.length > 1 ? 's' : ''}).`);
}

/* ==============================================================
   SPEAKING EDITOR
   ============================================================== */
function _buildSpeakingEditor(data) {
  // Normalize: support both old (questions as string[]) and new (questions as object[]) formats
  const normalizeQs = (qs) => (qs || []).map(q =>
    typeof q === 'string' ? { text: q, sampleAnswer: '' } : { text: q.text||'', sampleAnswer: q.sampleAnswer||'' }
  );

  const p1 = (data && data.part1) || {};
  const p2 = (data && data.part2) || {};
  const p3 = (data && data.part3) || {};
  const p1Qs = normalizeQs(p1.questions);
  const p3Qs = normalizeQs(p3.questions);

  const renderQRow = (partNum, qi, q) => `
    <div class="admin-q-row" id="sp-p${partNum}-q-${qi}">
      <div class="admin-q-header">
        <span class="admin-q-num">Q${qi + 1}</span>
        <button class="btn btn-sm btn-danger admin-remove-btn"
          onclick="adminRemoveSpeakingQ(${partNum},${qi})">&#10005;</button>
      </div>
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Question</label>
        <input class="admin-input" id="sp-p${partNum}-q-text-${qi}"
          value="${_esc(q.text)}" placeholder="Question text...">
      </div>
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Sample Answer <small style="color:var(--text-muted);">(optional)</small></label>
        <textarea class="admin-textarea" id="sp-p${partNum}-q-sample-${qi}" rows="2"
          placeholder="Band 7+ sample answer...">${_esc(q.sampleAnswer)}</textarea>
      </div>
    </div>`;

  const spImportPanel = `
    <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
      <button class="btn btn-sm btn-outline"
        onclick="var el=document.getElementById('sp-import-panel');el.style.display=el.style.display==='none'?'block':'none'">
        &#8679; Import JSON</button>
    </div>
    <div id="sp-import-panel" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:0.75rem;">
      <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.4rem;">Paste Speaking JSON from ChatGPT:</p>
      <textarea class="admin-textarea" id="sp-import-json" rows="7" style="font-family:monospace;font-size:0.75rem;" placeholder='{"parts":[{"partNum":1,"questions":[...]}]}'></textarea>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
        <button class="btn btn-primary" onclick="adminImportSpeakingJSON()">&#8679; Import</button>
      </div>
      <details style="margin-top:0.6rem;">
        <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">JSON schema &#9658;</summary>
        <div style="position:relative;margin-top:0.4rem;">
          <button class="btn btn-sm btn-outline" style="position:absolute;top:0.4rem;right:0.4rem;z-index:1;font-size:0.72rem;padding:0.2rem 0.55rem;"
            onclick="navigator.clipboard.writeText(SPEAKING_JSON_SCHEMA).then(()=>{this.textContent='&#10003; Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
          <pre style="font-size:0.68rem;line-height:1.5;overflow-x:auto;background:var(--sidebar-bg,#f8f9fa);padding:0.75rem 3.5rem 0.75rem 0.75rem;border-radius:6px;white-space:pre-wrap;margin:0;">${_esc(SPEAKING_JSON_SCHEMA)}</pre>
        </div>
      </details>
    </div>`;

  return `
    <div class="admin-section-header">
      <h3>Speaking Editor</h3>
      <button class="btn btn-primary" onclick="adminSaveSpeaking()">&#128190; Save Speaking</button>
    </div>
    ${spImportPanel}

    <div class="admin-card">
      <div class="admin-card-header"><span class="admin-card-title">Part 1 — Interview Questions</span></div>
      <div class="admin-field-row">
        <label class="admin-label">Part Title</label>
        <input class="admin-input" id="sp-p1-title" value="${_esc(p1.title||'Part 1: Introduction &amp; Interview (4\u20135 minutes)')}">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Questions</label>
        <div id="sp-p1-qs">
          ${p1Qs.map((q, qi) => renderQRow(1, qi, q)).join('')}
        </div>
        <button class="btn btn-sm btn-outline admin-add-btn" onclick="adminAddSpeakingQ(1)">+ Add Question</button>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header"><span class="admin-card-title">Part 2 — Cue Card (Long Turn)</span></div>
      <div class="admin-field-row">
        <label class="admin-label">Part Title</label>
        <input class="admin-input" id="sp-p2-title" value="${_esc(p2.title||'Part 2: Individual Long Turn (3\u20134 minutes)')}">
      </div>
      <div class="admin-vocab-grid" style="margin-top:0.5rem;">
        <div class="admin-field-row">
          <label class="admin-label">Prep Time (seconds)</label>
          <input class="admin-input" type="number" id="sp-p2-prep" value="${p2.prepTime||60}">
        </div>
        <div class="admin-field-row">
          <label class="admin-label">Speaking Time (seconds)</label>
          <input class="admin-input" type="number" id="sp-p2-speak" value="${p2.speakingTime||120}">
        </div>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Cue Card Topic</label>
        <input class="admin-input" id="sp-p2-topic"
          value="${_esc((p2.cueCard||{}).topic||'')}" placeholder="Describe a place you have visited...">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Bullets — "You should say:" (one per line)</label>
        <textarea class="admin-textarea" id="sp-p2-bullets" rows="4"
          placeholder="Where the place is&#10;When you visited it...">${_esc(((p2.cueCard||{}).bullets||[]).join('\n'))}</textarea>
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Cue Card Note</label>
        <input class="admin-input" id="sp-p2-note"
          value="${_esc((p2.cueCard||{}).note||'')}" placeholder="You should say:">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Follow-up Question</label>
        <input class="admin-input" id="sp-p2-followup"
          value="${_esc(p2.followUp||'')}" placeholder="e.g. Do you often visit places like this?">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Sample Answer <small style="color:var(--text-muted);">(optional)</small></label>
        <textarea class="admin-textarea" id="sp-p2-sample" rows="4"
          placeholder="I'd like to talk about...">${_esc(p2.sampleAnswer||'')}</textarea>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-card-header"><span class="admin-card-title">Part 3 — Discussion Questions</span></div>
      <div class="admin-field-row">
        <label class="admin-label">Part Title</label>
        <input class="admin-input" id="sp-p3-title" value="${_esc(p3.title||'Part 3: Two-Way Discussion (4\u20135 minutes)')}">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Questions</label>
        <div id="sp-p3-qs">
          ${p3Qs.map((q, qi) => renderQRow(3, qi, q)).join('')}
        </div>
        <button class="btn btn-sm btn-outline admin-add-btn" onclick="adminAddSpeakingQ(3)">+ Add Question</button>
      </div>
    </div>`;
}
function adminSaveSpeaking() {
  const collectSpQs = (partNum) => {
    const qs = []; let qi = 0;
    while (document.getElementById(`sp-p${partNum}-q-${qi}`)) {
      qs.push({
        text:         _val(`sp-p${partNum}-q-text-${qi}`),
        sampleAnswer: _val(`sp-p${partNum}-q-sample-${qi}`),
      });
      qi++;
    }
    return qs;
  };
  const data = {
    part1: {
      title:     _val('sp-p1-title'),
      questions: collectSpQs(1),
    },
    part2: {
      title:       _val('sp-p2-title'),
      prepTime:    parseInt(_val('sp-p2-prep'))  || 60,
      speakingTime:parseInt(_val('sp-p2-speak')) || 120,
      cueCard: {
        topic:   _val('sp-p2-topic'),
        bullets: _val('sp-p2-bullets').split('\n').map(s=>s.trim()).filter(Boolean),
        note:    _val('sp-p2-note'),
      },
      followUp:     _val('sp-p2-followup'),
      sampleAnswer: _val('sp-p2-sample'),
    },
    part3: {
      title:     _val('sp-p3-title'),
      questions: collectSpQs(3),
    },
  };
  _persistSection(_aPkg, _aTest, 'speaking', data);
  showToast('Speaking saved.');
}

function adminAddSpeakingQ(partNum) {
  const data = _collectSpeakingData();
  const part = partNum === 1 ? data.part1 : data.part3;
  part.questions.push({ text: '', sampleAnswer: '' });
  _applySpeakingEditorState(data);
}
function adminRemoveSpeakingQ(partNum, qi) {
  if (!confirm('Remove this question?')) return;
  const data = _collectSpeakingData();
  const part = partNum === 1 ? data.part1 : data.part3;
  part.questions.splice(qi, 1);
  _applySpeakingEditorState(data);
}
function _collectSpeakingData() {
  const collectSpQs = (partNum) => {
    const qs = []; let qi = 0;
    while (document.getElementById(`sp-p${partNum}-q-${qi}`)) {
      qs.push({ text: _val(`sp-p${partNum}-q-text-${qi}`), sampleAnswer: _val(`sp-p${partNum}-q-sample-${qi}`) });
      qi++;
    }
    return qs;
  };
  return {
    part1: { title: _val('sp-p1-title'), questions: collectSpQs(1) },
    part2: {
      title: _val('sp-p2-title'),
      prepTime: parseInt(_val('sp-p2-prep')) || 60,
      speakingTime: parseInt(_val('sp-p2-speak')) || 120,
      cueCard: { topic: _val('sp-p2-topic'), bullets: _val('sp-p2-bullets').split('\n').map(s=>s.trim()).filter(Boolean), note: _val('sp-p2-note') },
      followUp: _val('sp-p2-followup'),
      sampleAnswer: _val('sp-p2-sample'),
    },
    part3: { title: _val('sp-p3-title'), questions: collectSpQs(3) },
  };
}
function _applySpeakingEditorState(data) {
  const e = document.getElementById('adminEditor'); if (e) e.innerHTML = _buildSpeakingEditor(data);
}
function adminImportSpeakingJSON() {
  const raw = (document.getElementById('sp-import-json')?.value || '').trim();
  if (!raw) { showToast('Paste JSON first.'); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }

  const parts = parsed.parts || [];
  if (!parts.length) { showToast('JSON must have "parts" array.'); return; }

  const data = _collectSpeakingData();
  parts.forEach(p => {
    const normalizeQs = qs => (qs||[]).map(q => typeof q === 'string' ? {text:q, sampleAnswer:''} : {text:q.text||'', sampleAnswer:q.sampleAnswer||''});
    if (p.partNum === 1) {
      if (p.title) data.part1.title = p.title;
      data.part1.questions = normalizeQs(p.questions);
    } else if (p.partNum === 2) {
      if (p.title) data.part2.title = p.title;
      if (p.cueCard) data.part2.cueCard = p.cueCard;
      if (p.followUp) data.part2.followUp = p.followUp;
      if (p.sampleAnswer) data.part2.sampleAnswer = p.sampleAnswer;
      if (p.prepTime) data.part2.prepTime = p.prepTime;
      if (p.speakingTime) data.part2.speakingTime = p.speakingTime;
    } else if (p.partNum === 3) {
      if (p.title) data.part3.title = p.title;
      data.part3.questions = normalizeQs(p.questions);
    }
  });
  _applySpeakingEditorState(data);
  showToast(`Speaking imported (${parts.length} part${parts.length > 1 ? 's' : ''}).`);
}

/* ── Utility ──────────────────────────────────────────────── */
function _val(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
function _esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ==============================================================
   PRACTICE CONTENT — storage & override loader
   ============================================================== */
function loadPracticeOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRACTICE_DATA_KEY) || '{}');
    const sh = saved._shared || {};

    // Helper: splice first truthy source into arr
    const _m = (arr, ...sources) => {
      for (const d of sources) { if (d) { arr.splice(0, arr.length, ...d); return; } }
    };

    for (const pkg of PRACTICE_PACKAGES) {
      const pd = saved[pkg.id] || {};
      // Backward compat: old flat-key format was used for intermediate
      const flat = pkg.id === 'intermediate' ? saved : {};
      _m(pkg.vocab,         pd.vocab,         flat.vocab);
      _m(pkg.grammar,       pd.grammar,       flat.grammar);
      _m(pkg.miniQuiz,      pd.miniQuiz,      flat.miniQuiz);
      _m(pkg.readingSkills, pd.readingSkills, sh.readingSkills, flat.readingSkills);
      _m(pkg.writingTips,   pd.writingTips,   sh.writingTips,   flat.writingTips);
      if (pd.customSections)  pkg.customSections  = pd.customSections;
      if (pd.disabledSections) pkg.disabledSections = pd.disabledSections;
    }
  } catch(e) { console.warn('[Admin] Practice override load failed:', e); }
}
/* ── Load custom (admin-created) practice packages ─────────── */
function loadCustomPracticePackages() {
  try {
    const customs = JSON.parse(localStorage.getItem(CUSTOM_PRACTICE_PKGS_KEY) || '[]');
    const saved   = JSON.parse(localStorage.getItem(PRACTICE_DATA_KEY) || '{}');
    for (const meta of customs) {
      // Skip if somehow duplicated
      if (PRACTICE_PACKAGES.find(p => p.id === meta.id)) continue;
      const pd = saved[meta.id] || {};
      PRACTICE_PACKAGES.push({
        id:              meta.id,
        name:            meta.name,
        level:           meta.level || 'Custom',
        vocab:           pd.vocab            ? [...pd.vocab]            : [],
        grammar:         pd.grammar          ? [...pd.grammar]          : [],
        miniQuiz:        pd.miniQuiz         ? [...pd.miniQuiz]         : [],
        readingSkills:   pd.readingSkills    ? [...pd.readingSkills]    : [],
        writingTips:     pd.writingTips      ? [...pd.writingTips]      : [],
        customSections:  pd.customSections   ? [...pd.customSections]   : [],
        disabledSections: pd.disabledSections ? [...pd.disabledSections] : [],
      });
    }
  } catch(e) { console.warn('[Admin] Custom practice packages load failed:', e); }
}

function _persistPracticeSection(pkgId, key, data) {
  try {
    const store = JSON.parse(localStorage.getItem(PRACTICE_DATA_KEY) || '{}');
    if (!store[pkgId]) store[pkgId] = {};
    store[pkgId][key] = data;
    _lsSave(PRACTICE_DATA_KEY, store);
    _adminResetBaseline();  // re-snapshot so next navigation shows no unsaved changes
  } catch(e) { console.warn('[Admin] Practice persist failed:', e); }
}

/* ── Practice helper: get in-memory arrays for a package ─── */
function _getPracticeArrays(pkgId) {
  const pkg = PRACTICE_PACKAGES.find(p => p.id === pkgId);
  return pkg
    ? { vocab: pkg.vocab, grammar: pkg.grammar, miniQuiz: pkg.miniQuiz,
        readingSkills: pkg.readingSkills || [], writingTips: pkg.writingTips || [] }
    : { vocab: [], grammar: [], miniQuiz: [], readingSkills: [], writingTips: [] };
}

/* ── Practice editor shell ────────────────────────────────── */
const _BUILTIN_PKG_IDS = ['foundation', 'intermediate', 'advanced'];

const _BUILTIN_SEC_IDS = ['vocab','grammar','mini-quiz','reading-skills','writing-tips'];

/* ── Students dashboard ───────────────────────────────────── */
async function _buildStudentsDashboard() {
  if (_aStudentId) return await _buildStudentDetail(_aStudentId);

  let students;
  try { students = await db.getAllStudents(); }
  catch (e) { students = []; }

  if (!students || students.length === 0) {
    return `<div class="empty-state" style="margin-top:1rem;">No registered students yet.</div>`;
  }

  const rows = students.map(s => `
    <tr class="admin-student-row" onclick="adminViewStudent('${_esc(s.id)}')">
      <td>${_esc(s.name || '—')}</td>
      <td>${_esc(s.email || '—')}</td>
      <td>${s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
      <td><button class="btn btn-sm btn-outline" onclick="event.stopPropagation();adminViewStudent('${_esc(s.id)}')">View</button></td>
    </tr>`).join('');

  return `
  <div class="admin-students-wrap">
    <h3 style="margin:1rem 0 0.75rem;font-size:1.1rem;">Registered Students (${students.length})</h3>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

async function _buildStudentDetail(userId) {
  let history = [], practice = [], profile = null;
  const [histRes, practRes, profRes] = await Promise.allSettled([
    db.getStudentHistory(userId),
    db.getStudentPracticeResults(userId),
    db.getProfile(userId),
  ]);
  if (histRes.status  === 'fulfilled') history = histRes.value  || [];
  if (practRes.status === 'fulfilled') practice = practRes.value || [];
  if (profRes.status  === 'fulfilled') profile  = profRes.value;

  const name  = profile?.name  || 'Unknown';
  const email = profile?.email || '';

  function _waRows(wrongAnswers, rowId, colspan) {
    if (!wrongAnswers || !wrongAnswers.length) return '';
    const items = wrongAnswers.map(w => {
      const answerCell = w.skipped
        ? `<span style="color:var(--text-muted);font-style:italic;">— no answer</span>&nbsp;→&nbsp;<span style="color:var(--success)">✓ ${_esc(String(w.correct||''))}</span>`
        : `<span style="color:var(--danger)">✗ ${_esc(String(w.given||'—'))}</span>&nbsp;→&nbsp;<span style="color:var(--success)">✓ ${_esc(String(w.correct||''))}</span>`;
      return `
      <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:0.4rem 0.8rem;align-items:start;padding:0.35rem 0;border-bottom:1px solid var(--border);font-size:0.82rem;">
        <span style="font-weight:700;color:${w.skipped ? 'var(--text-muted)' : 'var(--danger)'};white-space:nowrap">${w.skipped ? '⊘' : '✗'}</span>
        <span style="color:var(--text)">${_esc(w.text||w.question||'')}</span>
        <span>${answerCell}</span>
      </div>`;
    }).join('');
    const wrongCount   = wrongAnswers.filter(w => !w.skipped).length;
    const skippedCount = wrongAnswers.filter(w =>  w.skipped).length;
    const heading = [wrongCount && `${wrongCount} wrong`, skippedCount && `${skippedCount} skipped`].filter(Boolean).join(' · ');
    return `<tr id="${rowId}" style="display:none;">
      <td colspan="${colspan}" style="padding:0.6rem 1rem 0.8rem;background:var(--primary-l);">
        <div style="font-size:0.8rem;font-weight:700;color:var(--primary);margin-bottom:0.4rem;">${heading}</div>
        ${items}
      </td>
    </tr>`;
  }

  function _waBtn(wa, rowId) {
    if (!wa.length) return '—';
    const wrong   = wa.filter(w => !w.skipped).length;
    const skipped = wa.filter(w =>  w.skipped).length;
    const label   = [wrong && `${wrong} wrong`, skipped && `${skipped} skipped`].filter(Boolean).join(' · ');
    return `<button class="btn btn-sm btn-outline" onclick="adminToggleWrong('${rowId}')">&#128269; ${label}</button>`;
  }

  const mockRows = (history || []).map((r, idx) => {
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
    const band = r.band != null ? r.band : '—';
    const score = (r.correct != null && r.total != null) ? `${r.correct}/${r.total}` : '—';
    const mins = r.time_taken != null ? Math.round(r.time_taken / 60) + ' min' : '—';
    const wa = r.wrong_answers || [];
    const waId = `waM_${idx}`;
    return `<tr>
      <td>${_esc(r.section || '—')}</td>
      <td><strong>Band ${band}</strong></td>
      <td>${score}</td>
      <td>${mins}</td>
      <td>${date}</td>
      <td>${_waBtn(wa, waId)}</td>
    </tr>${_waRows(wa, waId, 6)}`;
  }).join('');

  const practiceRows = (practice || []).map((r, idx) => {
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
    const pct  = r.total ? Math.round(r.score / r.total * 100) : 0;
    const wa   = r.wrong_answers || [];
    const waId = `waP_${idx}`;
    return `<tr>
      <td>${_esc(r.package_name || r.package_id || '—')}</td>
      <td>${r.score ?? 0}/${r.total ?? 0} <span style="color:var(--text-muted);font-size:0.85em">(${pct}%)</span></td>
      <td>${date}</td>
      <td>${_waBtn(wa, waId)}</td>
    </tr>${_waRows(wa, waId, 4)}`;
  }).join('');

  const fetchedAt = new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return `
  <div class="admin-students-wrap">
    <div style="display:flex;align-items:center;gap:0.5rem;margin:1rem 0 0.5rem;">
      <button class="btn btn-sm btn-outline" onclick="adminBackToStudents()">&#8592; All Students</button>
      <button class="btn btn-sm btn-outline" onclick="adminViewStudent('${_esc(userId)}')">&#8635; Refresh</button>
      <span style="font-size:0.78rem;color:var(--text-muted);margin-left:0.25rem;">Updated ${fetchedAt}</span>
    </div>
    <div class="admin-student-header">
      <div>
        <h3 style="font-size:1.1rem;margin:0">${_esc(name)}</h3>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0.2rem 0 0">${_esc(email)}</p>
      </div>
    </div>

    <h4 style="margin:1.25rem 0 0.5rem;font-size:0.95rem;">Mock Test History (${(history||[]).length})</h4>
    ${mockRows ? `<div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>Section</th><th>Band</th><th>Score</th><th>Time</th><th>Date</th><th></th></tr></thead>
      <tbody>${mockRows}</tbody>
    </table></div>` : '<p style="color:var(--text-muted);font-size:0.9rem">No mock tests yet.</p>'}

    <h4 style="margin:1.25rem 0 0.5rem;font-size:0.95rem;">Practice Results (${(practice||[]).length})</h4>
    ${practiceRows ? `<div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>Package</th><th>Score</th><th>Date</th><th></th></tr></thead>
      <tbody>${practiceRows}</tbody>
    </table></div>` : '<p style="color:var(--text-muted);font-size:0.9rem">No practice quizzes yet.</p>'}
  </div>`;
}

function adminViewStudent(id) { _aStudentId = id; renderAdmin(); }
function adminBackToStudents() { _aStudentId = null; renderAdmin(); }
function adminToggleWrong(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

function _buildPracticeEditor() {
  // If the selected package no longer exists, fall back to the first valid one.
  if (!PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage)) {
    _aPracticePackage = (PRACTICE_PACKAGES[0] || {}).id || 'intermediate';
    _aMiniQuizTestIdx = null;
  }
  const pkg = PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage);
  const customSecs = (pkg && pkg.customSections) || [];

  // Package picker — dropdown + delete + new package button
  const pkgOptions = PRACTICE_PACKAGES.map(p =>
    `<option value="${_esc(p.id)}"${_aPracticePackage === p.id ? ' selected' : ''}>${_esc(p.name)}${p.level ? ' (' + _esc(p.level) + ')' : ''}</option>`
  ).join('');

  const createPkgBtn = `<button class="btn btn-sm btn-outline admin-pkg-new-btn"
    onclick="_aShowCreatePkg=!_aShowCreatePkg;_aShowCreateSec=false;renderAdmin()">
    ${_aShowCreatePkg ? '&#10005; Cancel' : '+ New Package'}</button>`;

  const createPkgForm = _aShowCreatePkg ? `
    <div class="admin-card admin-create-pkg-card">
      <div class="admin-card-header"><span class="admin-card-title">Create New Practice Package</span></div>
      <div class="admin-create-pkg-fields">
        <div class="admin-field-row">
          <label class="admin-label">Package Name</label>
          <input class="admin-input" id="newPkgName" placeholder="e.g. Upper Intermediate">
        </div>
        <div class="admin-field-row">
          <label class="admin-label">Level / Band</label>
          <input class="admin-input" id="newPkgLevel" placeholder="e.g. Band 6–7">
        </div>
      </div>
      <div class="admin-create-pkg-actions">
        <button class="btn btn-primary" onclick="adminConfirmCreatePracticePackage()">&#10003; Create Package</button>
      </div>
    </div>` : '';

  // Sub-section picker — built-ins (minus disabled) + custom sections for this package
  const disabled = (pkg && pkg.disabledSections) || [];
  const allBuiltinSecDefs = [
    ['vocab',          'Vocabulary'],
    ['grammar',        'Grammar'],
    ['mini-quiz',      'Mini Quiz'],
    ['reading-skills', 'Reading Skills'],
    ['writing-tips',   'Writing Tips'],
  ];
  const builtinSecDefs = allBuiltinSecDefs.filter(([id]) => !disabled.includes(id));

  // If the active section was just disabled, fall back to the first available
  const allSecIds = [...builtinSecDefs.map(([id]) => id), ...customSecs.map(s => s.id)];
  if (!allSecIds.includes(_aPracticeSec)) {
    _aPracticeSec = allSecIds[0] || 'vocab';
  }

  const secOptions = [
    ...builtinSecDefs.map(([id, label]) =>
      `<option value="${id}"${_aPracticeSec === id ? ' selected' : ''}>${label}</option>`
    ),
    ...customSecs.map(sec =>
      `<option value="${_esc(sec.id)}"${_aPracticeSec === sec.id ? ' selected' : ''}>${_esc(sec.name)}</option>`
    ),
  ].join('');

  // Show remove button for every section (built-in sections are hidden per-package; custom are deleted)
  const deleteSecBtn = allSecIds.length > 0
    ? `<button class="admin-sel-delete" title="Remove this section from package" onclick="adminRemoveSection('${_esc(_aPracticeSec)}')">&#128465;</button>`
    : '';

  const createSecBtn = `<button class="btn btn-sm btn-outline admin-pkg-new-btn"
    onclick="_aShowCreateSec=!_aShowCreateSec;_aShowCreatePkg=false;renderAdmin()">
    ${_aShowCreateSec ? '&#10005; Cancel' : '+ New Section'}</button>`;

  const _disabledSecs = (PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage)?.disabledSections) || [];
  const _builtinSecOptions = [
    { id: 'vocab',          label: 'Vocabulary'    },
    { id: 'grammar',        label: 'Grammar'       },
    { id: 'mini-quiz',      label: 'Mini Quiz'     },
    { id: 'reading-skills', label: 'Reading Skills'},
    { id: 'writing-tips',   label: 'Writing Tips'  },
  ].map(s =>
    `<option value="${s.id}">${s.label}${_disabledSecs.includes(s.id) ? ' (hidden)' : ''}</option>`
  ).join('');
  const createSecForm = _aShowCreateSec ? `
    <div class="admin-card admin-create-pkg-card" style="margin-bottom:1rem;">
      <div class="admin-card-header"><span class="admin-card-title">Add Section</span></div>
      <div class="admin-create-pkg-fields">
        <div class="admin-field-row">
          <label class="admin-label">Section Type</label>
          <select class="admin-input" id="newSecType" onchange="(function(){var t=document.getElementById('newSecType').value;document.getElementById('newSecNameRow').style.display=t==='custom'?'':'none';})()">
            ${_builtinSecOptions}
            <option value="custom">Custom Card Section</option>
          </select>
        </div>
        <div class="admin-field-row" id="newSecNameRow" style="display:none;">
          <label class="admin-label">Section Name</label>
          <input class="admin-input" id="newSecName" placeholder="e.g. Pronunciation Tips">
        </div>
      </div>
      <div class="admin-create-pkg-actions">
        <button class="btn btn-primary" onclick="adminConfirmCreateSection()">&#10003; Add Section</button>
      </div>
    </div>` : '';

  const arrays = _getPracticeArrays(_aPracticePackage);
  let subContent = '';
  if (_aPracticeSec === 'vocab')               subContent = _buildVocabEditor(arrays.vocab);
  else if (_aPracticeSec === 'grammar')        subContent = _buildGrammarEditor(arrays.grammar);
  else if (_aPracticeSec === 'mini-quiz')      subContent = _buildMiniQuizEditor(arrays.miniQuiz);
  else if (_aPracticeSec === 'reading-skills') subContent = _buildReadingSkillsEditor(arrays.readingSkills);
  else if (_aPracticeSec === 'writing-tips')   subContent = _buildWritingTipsEditor(arrays.writingTips);
  else {
    const sec = customSecs.find(s => s.id === _aPracticeSec);
    if (sec) subContent = _buildCustomSectionEditor(sec.cards || [], _aPracticeSec, sec.name);
    else { _aPracticeSec = 'vocab'; subContent = _buildVocabEditor(arrays.vocab); }
  }

  return `
    <div class="admin-section-header" style="margin-bottom:0.75rem;">
      <h3>Practice Content Editor</h3>
    </div>
    <div class="admin-selector-group">
      <select class="test-picker-select" onchange="adminSetPracticePkg(this.value)">${pkgOptions}</select>
      <button class="admin-sel-delete" title="Delete this package" onclick="adminDeletePracticePackage('${_esc(_aPracticePackage)}')">🗑</button>
      ${createPkgBtn}
    </div>
    ${createPkgForm}
    <div class="admin-selector-group" style="margin-bottom:${_aShowCreateSec ? '0.25rem' : '1rem'};">
      <select class="test-picker-select" onchange="adminSetPracticeSec(this.value)">${secOptions}</select>
      ${deleteSecBtn}
      ${createSecBtn}
    </div>
    ${createSecForm}
    <div id="adminPracticeSubcontent">${subContent}</div>`;
}

function _applyPracticeSubcontent(html) {
  const el = document.getElementById('adminPracticeSubcontent');
  if (el) el.innerHTML = html;
}

/* ── Create / delete custom practice packages ─────────────── */
function adminConfirmCreatePracticePackage() {
  const name  = (_val('newPkgName') || '').trim();
  const level = (_val('newPkgLevel') || '').trim();
  if (!name) { showToast('Package name is required.'); return; }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const id   = 'custom_' + slug + '_' + Date.now();

  // Persist metadata
  const customs = JSON.parse(localStorage.getItem(CUSTOM_PRACTICE_PKGS_KEY) || '[]');
  customs.push({ id, name, level: level || 'Custom' });
  _lsSave(CUSTOM_PRACTICE_PKGS_KEY, customs);

  // Add to in-memory array
  PRACTICE_PACKAGES.push({ id, name, level: level || 'Custom', vocab: [], grammar: [], miniQuiz: [], readingSkills: [], writingTips: [], customSections: [] });

  _aPracticePackage = id;
  _aPracticeSec     = 'vocab';
  _aMiniQuizTestIdx = null;
  _aShowCreatePkg   = false;
  renderAdmin();
  showToast(`Package "${name}" created.`);
}

function adminDeletePracticePackage(id) {
  const pkg = PRACTICE_PACKAGES.find(p => p.id === id);
  if (!pkg) return;
  if (!confirm(`Delete package "${pkg.name}"?\nIts content will be removed. This cannot be undone.`)) return;

  const isBuiltIn = _BUILTIN_PKG_IDS.includes(id);

  // Remove from in-memory array
  const idx = PRACTICE_PACKAGES.findIndex(p => p.id === id);
  if (idx !== -1) PRACTICE_PACKAGES.splice(idx, 1);

  if (isBuiltIn) {
    // Mark built-in as hidden so it stays gone after reload
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_PRACTICE_PKGS_KEY) || '[]');
    if (!hidden.includes(id)) hidden.push(id);
    _lsSave(HIDDEN_PRACTICE_PKGS_KEY, hidden);
  } else {
    // Custom: remove metadata
    const customs = JSON.parse(localStorage.getItem(CUSTOM_PRACTICE_PKGS_KEY) || '[]');
    _lsSave(CUSTOM_PRACTICE_PKGS_KEY, customs.filter(p => p.id !== id));
    // Remove content data
    const store = JSON.parse(localStorage.getItem(PRACTICE_DATA_KEY) || '{}');
    delete store[id];
    _lsSave(PRACTICE_DATA_KEY, store);
  }

  // Switch to first remaining package
  if (_aPracticePackage === id) {
    _aPracticePackage = PRACTICE_PACKAGES[0]?.id || '';
  }
  renderAdmin();
  if (typeof renderPracticePackagePicker === 'function') renderPracticePackagePicker();
  showToast(`Package "${pkg.name}" removed.`);
}

/* ── Create / delete custom sections per practice package ──── */
function adminConfirmCreateSection() {
  const typeEl = document.getElementById('newSecType');
  const secType = typeEl ? typeEl.value : 'custom';

  const pkg = PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage);
  if (!pkg) return;

  if (secType !== 'custom') {
    const labels = { vocab: 'Vocabulary', grammar: 'Grammar', 'mini-quiz': 'Mini Quiz', 'reading-skills': 'Reading Skills', 'writing-tips': 'Writing Tips' };
    if (!pkg.disabledSections) pkg.disabledSections = [];
    const wasHidden = pkg.disabledSections.includes(secType);
    if (wasHidden) {
      // Re-enable a built-in section that was previously hidden
      pkg.disabledSections = pkg.disabledSections.filter(id => id !== secType);
      _persistPracticeSection(_aPracticePackage, 'disabledSections', pkg.disabledSections);
      if (typeof renderPracticePackagePicker === 'function') renderPracticePackagePicker();
      showToast(`"${labels[secType] || secType}" restored to this package.`);
    } else {
      showToast(`"${labels[secType] || secType}" is already active in this package.`);
    }
    _aPracticeSec   = secType;
    _aShowCreateSec = false;
    renderAdmin();
    return;
  }

  // Custom card section
  const name = (_val('newSecName') || '').trim();
  if (!name) { showToast('Section name is required.'); return; }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const id   = 'csec_' + slug + '_' + Date.now();

  if (!pkg.customSections) pkg.customSections = [];
  pkg.customSections.push({ id, name, cards: [] });
  _persistPracticeSection(_aPracticePackage, 'customSections', pkg.customSections);

  _aPracticeSec     = id;
  _aShowCreateSec   = false;
  renderAdmin();
  if (typeof renderPracticePackagePicker === 'function') renderPracticePackagePicker();
  showToast(`Section "${name}" created.`);
}

function adminDeleteSection(secId) {
  const pkg = PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage);
  if (!pkg || !pkg.customSections) return;
  const sec = pkg.customSections.find(s => s.id === secId);
  if (!sec) return;
  if (!confirm(`Delete section "${sec.name}"? This cannot be undone.`)) return;

  pkg.customSections = pkg.customSections.filter(s => s.id !== secId);
  _persistPracticeSection(_aPracticePackage, 'customSections', pkg.customSections);

  _aPracticeSec = 'vocab';
  renderAdmin();
  if (typeof renderPracticePackagePicker === 'function') renderPracticePackagePicker();
  showToast(`Section "${sec.name}" removed.`);
}

/* Remove a section from a package:
   - Built-in sections are hidden per-package (stored in disabledSections).
   - Custom sections are permanently deleted. */
function adminRemoveSection(secId) {
  const pkg = PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage);
  if (!pkg) return;

  if (!_BUILTIN_SEC_IDS.includes(secId)) {
    // Custom section — use existing hard-delete
    adminDeleteSection(secId);
    return;
  }

  const label = { vocab: 'Vocabulary', grammar: 'Grammar', 'mini-quiz': 'Mini Quiz', 'reading-skills': 'Reading Skills', 'writing-tips': 'Writing Tips' }[secId] || secId;
  if (!confirm(`Hide "${label}" from "${pkg.name}"?\nStudents will no longer see this section for this package.`)) return;

  if (!pkg.disabledSections) pkg.disabledSections = [];
  if (!pkg.disabledSections.includes(secId)) pkg.disabledSections.push(secId);
  _persistPracticeSection(_aPracticePackage, 'disabledSections', pkg.disabledSections);

  // Switch to first remaining section
  const remaining = _BUILTIN_SEC_IDS.filter(id => !pkg.disabledSections.includes(id));
  _aPracticeSec = remaining[0] || (pkg.customSections?.[0]?.id) || 'vocab';
  renderAdmin();
  if (typeof renderPracticePackagePicker === 'function') renderPracticePackagePicker();
  showToast(`"${label}" hidden from this package.`);
}

/* ==============================================================
   CUSTOM SECTION EDITOR (generic card editor)
   ============================================================== */
function _buildCustomSectionEditor(cards, secId, secName) {
  const rows = cards.map((card, i) => {
    const isNew = !card.title;
    return `
    <details class="admin-collapse-item" id="pcs-card-${i}"${isNew ? ' open' : ''}>
      <summary class="admin-collapse-header">
        <span class="admin-collapse-title">${card.title ? _esc(card.title) : '<em style="opacity:.45">New Card</em>'}</span>
        ${card.bullets && card.bullets.length ? `<span class="admin-collapse-meta">${card.bullets.length} pts</span>` : ''}
        <button class="admin-item-delete" onclick="adminRemoveCustomSectionCard('${_esc(secId)}',${i});event.stopPropagation();">&#10005;</button>
      </summary>
      <div class="admin-collapse-body">
        <div class="admin-field-row">
          <label class="admin-label">Title</label>
          <input class="admin-input" id="pcs-title-${i}" value="${_esc(card.title)}" placeholder="Card title">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Bullet Points (one per line; HTML supported)</label>
          <textarea class="admin-textarea" id="pcs-bullets-${i}" rows="5"
            placeholder="First point&#10;Second point...">${_esc((card.bullets||[]).join('\n'))}</textarea>
        </div>
      </div>
    </details>`;
  }).join('');

  return `
    <div class="admin-section-header">
      <h3>${_esc(secName)} (${cards.length} cards)</h3>
      <button class="btn btn-primary" onclick="adminSaveCustomSection('${_esc(secId)}')">&#128190; Save ${_esc(secName)}</button>
    </div>
    ${rows}
    <button class="btn btn-outline admin-add-btn" onclick="adminAddCustomSectionCard('${_esc(secId)}')">+ Add Card</button>`;
}
function _collectCustomSectionData() {
  const data = []; let i = 0;
  while (document.getElementById(`pcs-card-${i}`)) {
    data.push({ title: _val(`pcs-title-${i}`), bullets: _val(`pcs-bullets-${i}`).split('\n').map(s=>s.trim()).filter(Boolean) });
    i++;
  }
  return data;
}
function _getCustomSec(secId) {
  const pkg = PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage);
  return pkg && pkg.customSections && pkg.customSections.find(s => s.id === secId);
}
function adminAddCustomSectionCard(secId) {
  const d = _collectCustomSectionData(); d.push({ title:'', bullets:[] });
  const sec = _getCustomSec(secId); if (sec) sec.cards = d;
  _applyPracticeSubcontent(_buildCustomSectionEditor(d, secId, sec ? sec.name : 'Section'));
}
function adminRemoveCustomSectionCard(secId, i) {
  if (!confirm('Remove this card?')) return;
  const d = _collectCustomSectionData(); d.splice(i,1);
  const sec = _getCustomSec(secId); if (sec) sec.cards = d;
  _applyPracticeSubcontent(_buildCustomSectionEditor(d, secId, sec ? sec.name : 'Section'));
}
function adminSaveCustomSection(secId) {
  const d = _collectCustomSectionData();
  const pkg = PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage);
  const sec = _getCustomSec(secId); if (!sec) return;
  sec.cards = d;
  _persistPracticeSection(_aPracticePackage, 'customSections', pkg.customSections);
  showToast(`${sec.name} saved.`);
}

/* ==============================================================
   VOCABULARY EDITOR
   ============================================================== */
const VOCAB_JSON_SCHEMA = `{
  "words": [
    {
      "word": "affordable",
      "pos": "adj",
      "def": "not expensive; within a reasonable price range",
      "ex": "The course fees are affordable for most students."
    },
    {
      "word": "cooperation",
      "pos": "noun",
      "def": "the process of working together towards a shared goal",
      "ex": "Success depends on cooperation between team members."
    }
  ]
}`;

function _buildVocabEditor(data) {
  data = data || _getPracticeArrays(_aPracticePackage).vocab;
  const rows = data.map((w, i) => {
    const isNew = !w.word && !w.def;
    return `
    <details class="admin-collapse-item" id="pv-row-${i}"${isNew ? ' open' : ''}>
      <summary class="admin-collapse-header">
        <span class="admin-collapse-title">${w.word ? _esc(w.word) : '<em style="opacity:.45">New Word</em>'}</span>
        ${w.pos ? `<span class="admin-collapse-meta">${_esc(w.pos)}</span>` : ''}
        <button class="admin-item-delete" onclick="adminRemoveVocab(${i});event.stopPropagation();">&#10005;</button>
      </summary>
      <div class="admin-collapse-body">
        <div class="admin-vocab-grid">
          <div class="admin-field-row">
            <label class="admin-label">Word</label>
            <input class="admin-input" id="pv-word-${i}" value="${_esc(w.word)}" placeholder="Word">
          </div>
          <div class="admin-field-row">
            <label class="admin-label">Part of Speech</label>
            <input class="admin-input" id="pv-pos-${i}" value="${_esc(w.pos)}" placeholder="adj / noun / verb…">
          </div>
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Definition</label>
          <input class="admin-input" id="pv-def-${i}" value="${_esc(w.def)}" placeholder="Definition">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Example Sentence</label>
          <input class="admin-input" id="pv-ex-${i}" value="${_esc(w.ex)}" placeholder="Example sentence">
        </div>
      </div>
    </details>`;
  }).join('');

  const vocabImportPanel = `
    <div id="vocabImportPanel" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;">
      <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.5rem;">Paste JSON from ChatGPT:</p>
      <textarea class="admin-textarea" id="vocab-import-json" rows="8" style="font-family:monospace;font-size:0.78rem;" placeholder='{"words":[{"word":"...","pos":"...","def":"...","ex":"..."}]}'></textarea>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="adminImportVocabJSON(false)">&#8679; Append Words</button>
        <button class="btn btn-outline" onclick="adminImportVocabJSON(true)">&#8679; Replace All</button>
      </div>
      <details style="margin-top:0.75rem;">
        <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">JSON schema ▸</summary>
        <div style="position:relative;margin-top:0.5rem;">
          <button class="btn btn-sm btn-outline"
            style="position:absolute;top:0.4rem;right:0.4rem;z-index:1;font-size:0.72rem;padding:0.2rem 0.55rem;"
            onclick="navigator.clipboard.writeText(VOCAB_JSON_SCHEMA).then(()=>{this.textContent='&#10003; Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
          <pre style="font-size:0.7rem;line-height:1.5;overflow-x:auto;background:var(--sidebar-bg,#f8f9fa);padding:0.75rem 3.5rem 0.75rem 0.75rem;border-radius:6px;white-space:pre-wrap;margin:0;">${_esc(VOCAB_JSON_SCHEMA)}</pre>
        </div>
      </details>
    </div>`;

  return `
    <div class="admin-section-header">
      <h3>Vocabulary (${data.length} words)</h3>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-sm btn-outline"
          onclick="var p=document.getElementById('vocabImportPanel');p.style.display=p.style.display==='none'?'block':'none'">
          &#8679; Import JSON</button>
        <button class="btn btn-primary" onclick="adminSaveVocab()">&#128190; Save Vocabulary</button>
      </div>
    </div>
    ${vocabImportPanel}
    ${rows}
    <button class="btn btn-outline admin-add-btn" onclick="adminAddVocab()">+ Add Word</button>`;
}
function _collectVocabData() {
  const data = []; let i = 0;
  while (document.getElementById(`pv-row-${i}`)) {
    data.push({ word: _val(`pv-word-${i}`), pos: _val(`pv-pos-${i}`), def: _val(`pv-def-${i}`), ex: _val(`pv-ex-${i}`) });
    i++;
  }
  return data;
}
function adminAddVocab()         { const d = _collectVocabData(); d.push({ word:'', pos:'', def:'', ex:'' }); _applyPracticeSubcontent(_buildVocabEditor(d)); }
function adminRemoveVocab(i)     { if (!confirm('Remove this word?')) return; const d = _collectVocabData(); d.splice(i,1); _applyPracticeSubcontent(_buildVocabEditor(d)); }
function adminSaveVocab()        { const d = _collectVocabData(); _persistPracticeSection(_aPracticePackage, 'vocab', d); const arr = _getPracticeArrays(_aPracticePackage).vocab; arr.splice(0, arr.length, ...d); showToast('Vocabulary saved.'); }
function adminImportVocabJSON(replaceAll) {
  const raw = (document.getElementById('vocab-import-json')?.value || '').trim();
  if (!raw) { showToast('Paste a JSON first.'); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }
  if (!parsed.words || !Array.isArray(parsed.words)) { showToast('JSON must have a top-level "words" array.'); return; }
  const valid = parsed.words.filter(w => w.word);
  if (!valid.length) { showToast('No valid words found. Each word needs at least a "word" field.'); return; }
  const existing = replaceAll ? [] : _collectVocabData();
  valid.forEach(w => existing.push({ word: w.word||'', pos: w.pos||'', def: w.def||'', ex: w.ex||'' }));
  _applyPracticeSubcontent(_buildVocabEditor(existing));
  showToast(`Imported ${valid.length} word(s).${replaceAll ? ' Previous content cleared.' : ''}`);
}

/* ==============================================================
   GRAMMAR EDITOR
   ============================================================== */
const GRAMMAR_JSON_SCHEMA = `{
  "topics": [
    {
      "topic": "Conditional Sentences",
      "rule": "Use 'if + present simple, will + infinitive' for real/likely conditions (1st conditional).\\nUse 'if + past simple, would + infinitive' for unreal/hypothetical conditions (2nd conditional).",
      "questions": [
        {
          "q": "If it rains tomorrow, she _____ an umbrella.",
          "opts": ["bring", "brings", "will bring", "would bring"],
          "answer": 2
        },
        {
          "q": "If I were rich, I _____ travel the world.",
          "opts": ["will", "would", "can", "am going to"],
          "answer": 1
        }
      ]
    },
    {
      "topic": "Passive Voice",
      "rule": "Form: subject + be (conjugated) + past participle.\\nUse when the action is more important than who does it.",
      "questions": [
        {
          "q": "The report _____ by the manager yesterday.",
          "opts": ["wrote", "is written", "was written", "has written"],
          "answer": 2
        }
      ]
    }
  ]
}`;

function _buildGrammarEditor(data) {
  data = data || _getPracticeArrays(_aPracticePackage).grammar;
  const topicsHTML = data.map((topic, ti) => {
    const isNew = !topic.topic;
    const qCount = topic.questions.length;
    return `
    <details class="admin-collapse-item" id="pg-topic-${ti}"${isNew ? ' open' : ''}>
      <summary class="admin-collapse-header">
        <span class="admin-collapse-title">${topic.topic ? _esc(topic.topic) : '<em style="opacity:.45">New Topic</em>'}</span>
        ${qCount ? `<span class="admin-collapse-meta">${qCount}Q</span>` : ''}
        <button class="admin-item-delete" onclick="adminRemoveGrammarTopic(${ti});event.stopPropagation();">&#10005;</button>
      </summary>
      <div class="admin-collapse-body">
        <div class="admin-field-row">
          <label class="admin-label">Topic Name</label>
          <input class="admin-input" id="pg-name-${ti}" value="${_esc(topic.topic)}" placeholder="e.g. Conditional Sentences">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Rule / Explanation</label>
          <textarea class="admin-textarea" id="pg-rule-${ti}" rows="4"
            placeholder="Explain the grammar rule...">${_esc(topic.rule)}</textarea>
        </div>
        <div class="admin-field-row" style="margin-top:0.75rem;">
          <label class="admin-label">Practice Questions</label>
          <div id="pg-qs-${ti}">
            ${topic.questions.map((q, qi) => _buildGrammarQuestionRow(ti, qi, q)).join('')}
          </div>
          <button class="btn btn-sm btn-outline admin-add-btn" onclick="adminAddGrammarQ(${ti})">+ Add Question</button>
        </div>
      </div>
    </details>`;
  }).join('');

  const grammarImportPanel = `
    <div id="grammarImportPanel" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;">
      <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.5rem;">Paste JSON from ChatGPT:</p>
      <textarea class="admin-textarea" id="grammar-import-json" rows="8" style="font-family:monospace;font-size:0.78rem;" placeholder='{"topics":[{"topic":"...","rule":"...","questions":[...]}]}'></textarea>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="adminImportGrammarJSON(false)">&#8679; Append Topics</button>
        <button class="btn btn-outline" onclick="adminImportGrammarJSON(true)">&#8679; Replace All</button>
      </div>
      <details style="margin-top:0.75rem;">
        <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">JSON schema ▸</summary>
        <div style="position:relative;margin-top:0.5rem;">
          <button class="btn btn-sm btn-outline"
            style="position:absolute;top:0.4rem;right:0.4rem;z-index:1;font-size:0.72rem;padding:0.2rem 0.55rem;"
            onclick="navigator.clipboard.writeText(GRAMMAR_JSON_SCHEMA).then(()=>{this.textContent='&#10003; Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
          <pre style="font-size:0.7rem;line-height:1.5;overflow-x:auto;background:var(--sidebar-bg,#f8f9fa);padding:0.75rem 3.5rem 0.75rem 0.75rem;border-radius:6px;white-space:pre-wrap;margin:0;">${_esc(GRAMMAR_JSON_SCHEMA)}</pre>
        </div>
      </details>
    </div>`;

  return `
    <div class="admin-section-header">
      <h3>Grammar (${data.length} topics)</h3>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-sm btn-outline"
          onclick="var p=document.getElementById('grammarImportPanel');p.style.display=p.style.display==='none'?'block':'none'">
          &#8679; Import JSON</button>
        <button class="btn btn-primary" onclick="adminSaveGrammar()">&#128190; Save Grammar</button>
      </div>
    </div>
    ${grammarImportPanel}
    ${topicsHTML}
    <button class="btn btn-outline admin-add-btn" onclick="adminAddGrammarTopic()">+ Add Topic</button>`;
}
function _buildGrammarQuestionRow(ti, qi, q) {
  const isNew = !q.q;
  const preview = q.q ? (q.q.length > 55 ? _esc(q.q.substring(0,55)) + '…' : _esc(q.q)) : '';
  return `
    <details class="admin-collapse-item admin-collapse-nested" id="pg-q-${ti}-${qi}"${isNew ? ' open' : ''}>
      <summary class="admin-collapse-header">
        <span class="admin-collapse-title" style="font-weight:500;">Q${qi+1}${preview ? ': ' + preview : ' <em style="opacity:.45">New Question</em>'}</span>
        <button class="admin-item-delete" onclick="adminRemoveGrammarQ(${ti},${qi});event.stopPropagation();">&#10005;</button>
      </summary>
      <div class="admin-collapse-body">
        <div class="admin-field-row">
          <label class="admin-label">Question Text</label>
          <input class="admin-input" id="pg-q-text-${ti}-${qi}" value="${_esc(q.q)}" placeholder="Question with _____ for blanks">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Options (one per line)</label>
          <textarea class="admin-textarea" id="pg-opts-${ti}-${qi}" rows="4"
            placeholder="Option A&#10;Option B&#10;Option C&#10;Option D">${_esc((q.opts||[]).join('\n'))}</textarea>
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Correct Answer Index (0 = first option)</label>
          <input class="admin-input" style="max-width:80px;" type="number" min="0" max="9"
            id="pg-ans-${ti}-${qi}" value="${q.answer != null ? q.answer : 0}">
        </div>
      </div>
    </details>`;
}
function _collectGrammarData() {
  const data = []; let ti = 0;
  while (document.getElementById(`pg-topic-${ti}`)) {
    const questions = []; let qi = 0;
    while (document.getElementById(`pg-q-${ti}-${qi}`)) {
      const rawOpts = _val(`pg-opts-${ti}-${qi}`);
      questions.push({
        q:      _val(`pg-q-text-${ti}-${qi}`),
        opts:   rawOpts ? rawOpts.split('\n').map(s=>s.trim()).filter(Boolean) : [],
        answer: parseInt(_val(`pg-ans-${ti}-${qi}`)) || 0,
      });
      qi++;
    }
    data.push({ topic: _val(`pg-name-${ti}`), rule: _val(`pg-rule-${ti}`), questions });
    ti++;
  }
  return data;
}
function adminAddGrammarTopic()       { const d = _collectGrammarData(); d.push({ topic:'', rule:'', questions:[] }); _applyPracticeSubcontent(_buildGrammarEditor(d)); }
function adminRemoveGrammarTopic(ti)  { if (!confirm('Remove this topic?')) return; const d = _collectGrammarData(); d.splice(ti,1); _applyPracticeSubcontent(_buildGrammarEditor(d)); }
function adminAddGrammarQ(ti)         { const d = _collectGrammarData(); d[ti].questions.push({ q:'', opts:[], answer:0 }); _applyPracticeSubcontent(_buildGrammarEditor(d)); }
function adminRemoveGrammarQ(ti, qi)  { if (!confirm('Remove this question?')) return; const d = _collectGrammarData(); d[ti].questions.splice(qi,1); _applyPracticeSubcontent(_buildGrammarEditor(d)); }
function adminSaveGrammar()           { const d = _collectGrammarData(); _persistPracticeSection(_aPracticePackage, 'grammar', d); const arr = _getPracticeArrays(_aPracticePackage).grammar; arr.splice(0, arr.length, ...d); showToast('Grammar saved.'); }
function adminImportGrammarJSON(replaceAll) {
  const raw = (document.getElementById('grammar-import-json')?.value || '').trim();
  if (!raw) { showToast('Paste a JSON first.'); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }
  if (!parsed.topics || !Array.isArray(parsed.topics)) { showToast('JSON must have a top-level "topics" array.'); return; }
  const valid = parsed.topics.filter(t => t.topic);
  if (!valid.length) { showToast('No valid topics found. Each topic needs at least a "topic" field.'); return; }
  const existing = replaceAll ? [] : _collectGrammarData();
  valid.forEach(t => existing.push({
    topic:     t.topic || '',
    rule:      t.rule  || '',
    questions: (t.questions || []).map(q => ({
      q:      q.q      || '',
      opts:   Array.isArray(q.opts) ? q.opts : [],
      answer: typeof q.answer === 'number' ? q.answer : 0,
    })),
  }));
  _applyPracticeSubcontent(_buildGrammarEditor(existing));
  showToast(`Imported ${valid.length} topic(s).${replaceAll ? ' Previous content cleared.' : ''}`);
}

/* ==============================================================
   READING SKILLS EDITOR
   ============================================================== */
function _buildReadingSkillsEditor(data) {
  data = data || _getPracticeArrays(_aPracticePackage).readingSkills;
  const cards = data.map((card, i) => {
    const isNew = !card.title;
    return `
    <details class="admin-collapse-item" id="prs-card-${i}"${isNew ? ' open' : ''}>
      <summary class="admin-collapse-header">
        <span class="admin-collapse-title">${card.title ? _esc(card.title) : '<em style="opacity:.45">New Card</em>'}</span>
        ${card.bullets && card.bullets.length ? `<span class="admin-collapse-meta">${card.bullets.length} pts</span>` : ''}
        <button class="admin-item-delete" onclick="adminRemoveReadingSkillCard(${i});event.stopPropagation();">&#10005;</button>
      </summary>
      <div class="admin-collapse-body">
        <div class="admin-field-row">
          <label class="admin-label">Title</label>
          <input class="admin-input" id="prs-title-${i}" value="${_esc(card.title)}" placeholder="e.g. True / False / Not Given">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Bullet Points (one per line; &lt;strong&gt;, &lt;em&gt; supported)</label>
          <textarea class="admin-textarea" id="prs-bullets-${i}" rows="5"
            placeholder="First bullet&#10;Second bullet...">${_esc((card.bullets||[]).join('\n'))}</textarea>
        </div>
      </div>
    </details>`;
  }).join('');

  return `
    <div class="admin-section-header">
      <h3>Reading Skills (${data.length} cards)</h3>
      <button class="btn btn-primary" onclick="adminSaveReadingSkills()">&#128190; Save Reading Skills</button>
    </div>
    ${cards}
    <button class="btn btn-outline admin-add-btn" onclick="adminAddReadingSkillCard()">+ Add Tip Card</button>`;
}
function _collectReadingSkillsData() {
  const data = []; let i = 0;
  while (document.getElementById(`prs-card-${i}`)) {
    data.push({ title: _val(`prs-title-${i}`), bullets: _val(`prs-bullets-${i}`).split('\n').map(s=>s.trim()).filter(Boolean) });
    i++;
  }
  return data;
}
function adminAddReadingSkillCard()       { const d = _collectReadingSkillsData(); d.push({ title:'', bullets:[] }); _applyPracticeSubcontent(_buildReadingSkillsEditor(d)); }
function adminRemoveReadingSkillCard(i)   { if (!confirm('Remove this card?')) return; const d = _collectReadingSkillsData(); d.splice(i,1); _applyPracticeSubcontent(_buildReadingSkillsEditor(d)); }
function adminSaveReadingSkills()         { const d = _collectReadingSkillsData(); _persistPracticeSection(_aPracticePackage, 'readingSkills', d); const arr = _getPracticeArrays(_aPracticePackage).readingSkills; arr.splice(0, arr.length, ...d); showToast('Reading Skills saved.'); }

/* ==============================================================
   WRITING TIPS EDITOR
   ============================================================== */
function _buildWritingTipsEditor(data) {
  data = data || _getPracticeArrays(_aPracticePackage).writingTips;
  const cards = data.map((card, i) => {
    const isNew = !card.title;
    return `
    <details class="admin-collapse-item" id="pwt-card-${i}"${isNew ? ' open' : ''}>
      <summary class="admin-collapse-header">
        <span class="admin-collapse-title">${card.title ? _esc(card.title) : '<em style="opacity:.45">New Card</em>'}</span>
        ${card.badge ? `<span class="admin-collapse-meta">${_esc(card.badge)}</span>` : ''}
        <button class="admin-item-delete" onclick="adminRemoveWritingTipCard(${i});event.stopPropagation();">&#10005;</button>
      </summary>
      <div class="admin-collapse-body">
        <div class="admin-field-row">
          <label class="admin-label">Title</label>
          <input class="admin-input" id="pwt-title-${i}" value="${_esc(card.title)}" placeholder="Tip card title">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Bullet Points (one per line; HTML supported)</label>
          <textarea class="admin-textarea" id="pwt-bullets-${i}" rows="4"
            placeholder="First point...">${_esc((card.bullets||[]).join('\n'))}</textarea>
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Badge Label (optional, e.g. "Band 7+ Model")</label>
          <input class="admin-input" id="pwt-badge-${i}" value="${_esc(card.badge||'')}" placeholder="Leave empty to hide">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Sample Answer (optional)</label>
          <textarea class="admin-textarea" id="pwt-sample-${i}" rows="5"
            placeholder="Model answer text...">${_esc(card.sample||'')}</textarea>
        </div>
      </div>
    </details>`;
  }).join('');

  return `
    <div class="admin-section-header">
      <h3>Writing Tips (${data.length} cards)</h3>
      <button class="btn btn-primary" onclick="adminSaveWritingTips()">&#128190; Save Writing Tips</button>
    </div>
    ${cards}
    <button class="btn btn-outline admin-add-btn" onclick="adminAddWritingTipCard()">+ Add Tip Card</button>`;
}
function _collectWritingTipsData() {
  const data = []; let i = 0;
  while (document.getElementById(`pwt-card-${i}`)) {
    const badge = _val(`pwt-badge-${i}`).trim();
    const sample = _val(`pwt-sample-${i}`).trim();
    const card = { title: _val(`pwt-title-${i}`), bullets: _val(`pwt-bullets-${i}`).split('\n').map(s=>s.trim()).filter(Boolean) };
    if (badge)  card.badge  = badge;
    if (sample) card.sample = sample;
    data.push(card);
    i++;
  }
  return data;
}
function adminAddWritingTipCard()       { const d = _collectWritingTipsData(); d.push({ title:'', bullets:[] }); _applyPracticeSubcontent(_buildWritingTipsEditor(d)); }
function adminRemoveWritingTipCard(i)   { if (!confirm('Remove this card?')) return; const d = _collectWritingTipsData(); d.splice(i,1); _applyPracticeSubcontent(_buildWritingTipsEditor(d)); }
function adminSaveWritingTips()         { const d = _collectWritingTipsData(); _persistPracticeSection(_aPracticePackage, 'writingTips', d); const arr = _getPracticeArrays(_aPracticePackage).writingTips; arr.splice(0, arr.length, ...d); showToast('Writing Tips saved.'); }

/* ==============================================================
   MINI QUIZ — JSON IMPORT SCHEMA
   Share this with ChatGPT to generate importable quiz JSON.
   ============================================================== */
const MINI_QUIZ_JSON_SCHEMA = `{
  "title": "Activity Set Title",
  "sections": [

    // ── AUTO-GRADED TYPES ────────────────────────────────────
    {
      "type": "multiple_choice",
      "title": "Multiple Choice",
      "instructions": "Choose the best answer.",
      "questions": [
        { "prompt": "Question text?", "options": ["A","B","C","D"], "answer": 0 }
      ]
    },
    {
      "type": "true_false_ng",
      "title": "True / False / Not Given",
      "instructions": "Choose T / F / NG.",
      "questions": [
        { "statement": "Statement text.", "answer": "T" }
      ]
    },
    {
      "type": "matching",
      "title": "Vocabulary Matching",
      "instructions": "Match each word with its meaning.",
      "questions": [{
        "left":  ["word1", "word2", "word3"],
        "right": ["meaning1", "meaning2", "meaning3"],
        "answers": { "word1": "meaning1", "word2": "meaning2", "word3": "meaning3" }
      }]
    },
    {
      "type": "fill_in",
      "title": "Find Words",
      "instructions": "Find words in the passage.",
      "questions": [
        { "prompt": "A word meaning X:", "answers": ["answer1", "answer2"] }
      ]
    },
    {
      "type": "sentence_completion",
      "title": "Sentence Completion",
      "instructions": "Complete using words from the passage.",
      "questions": [
        { "prompt": "The city has reduced its ________.", "answers": ["pollution"] }
      ]
    },
    {
      "type": "short_answer",
      "title": "Short Answer Questions",
      "instructions": "Write NO MORE THAN 3 WORDS.",
      "questions": [
        { "prompt": "Where do people grow food?", "answers": ["balconies", "rooftops"] }
      ]
    },
    {
      "type": "paraphrase_phrases",
      "title": "Paraphrase the Phrases",
      "instructions": "Write a synonym or paraphrase.",
      "questions": [
        { "prompt": "in recent years", "answers": ["recently", "in the past few years"] }
      ]
    },

    // ── SELF-CHECKED / OPEN-ENDED TYPES ─────────────────────
    {
      "type": "table_input",
      "title": "Word Forms",
      "instructions": "Complete the table.",
      "questions": [{
        "columns": ["Word", "Noun", "Adjective"],
        "rows": [
          { "word": "cooperate", "answers": ["cooperation", "cooperative"] }
        ]
      }]
    },
    {
      "type": "paraphrase",
      "title": "Paraphrasing Practice",
      "instructions": "Rewrite the sentences using your own words.",
      "questions": [
        { "prompt": "Original sentence.", "sampleAnswers": ["Paraphrase 1.", "Paraphrase 2."] }
      ]
    },
    {
      "type": "discussion",
      "title": "Discussion Questions",
      "instructions": "Answer the questions in full sentences.",
      "questions": [
        { "prompt": "Do you think X is useful? Why?", "sampleAnswers": ["Open-ended"] }
      ]
    },
    {
      "type": "guided_writing",
      "title": "Guided Writing",
      "instructions": "Write 5–6 sentences about the topic.",
      "questions": [
        { "prompt": "Topic title", "sampleAnswers": ["Model paragraph..."] }
      ]
    }

  ]
}`;

/* ==============================================================
   MINI QUIZ EDITOR  (multi-test)
   ============================================================== */

/* Normalise raw miniQuiz array → array of test-wrapper objects */
function _adminNormalizeToTests(miniQuiz) {
  if (!Array.isArray(miniQuiz) || miniQuiz.length === 0) return [];
  const first = miniQuiz[0];
  if (first && first.questions !== undefined && !first.type && !first.q) return miniQuiz;
  return [{ id: 'legacy_' + Date.now(), title: 'Mini Quiz', description: '', image: '', questions: miniQuiz }];
}

/* Top-level dispatcher — test list vs question editor */
function _buildMiniQuizEditor(data) {
  data = data || _getPracticeArrays(_aPracticePackage).miniQuiz;
  // If in-memory is empty, reload from localStorage as a safety net
  // (handles cases where in-memory state drifted from persisted data).
  if (!data || data.length === 0) {
    try {
      const saved = JSON.parse(localStorage.getItem(PRACTICE_DATA_KEY) || '{}');
      const pd = saved[_aPracticePackage] || {};
      if (Array.isArray(pd.miniQuiz) && pd.miniQuiz.length > 0) {
        data = pd.miniQuiz;
        const pkg = PRACTICE_PACKAGES.find(p => p.id === _aPracticePackage);
        if (pkg) pkg.miniQuiz.splice(0, pkg.miniQuiz.length, ...data);
      }
    } catch(e) {}
  }
  _mqAllTests = _adminNormalizeToTests(data);
  if (_aMiniQuizTestIdx !== null && _mqAllTests[_aMiniQuizTestIdx]) {
    return _buildMiniQuizQuestionsEditor(_mqAllTests[_aMiniQuizTestIdx].questions || []);
  }
  _aMiniQuizTestIdx = null;
  return _buildMiniQuizTestList(_mqAllTests);
}

/* ── Test list view ──────────────────────────────────────────── */
function _buildMiniQuizTestList(tests) {
  const rows = tests.map((t, i) => {
    const qCount = (t.questions || []).length;
    return `
    <div class="admin-card" id="pmqt-row-${i}" style="margin-bottom:0.75rem;">
      <div class="admin-card-header" style="align-items:flex-start;gap:0.75rem;">
        <div style="flex:1;display:flex;flex-direction:column;gap:0.4rem;">
          <div class="admin-field-row">
            <label class="admin-label">Title</label>
            <input class="admin-input" id="pmqt-title-${i}" value="${_esc(t.title || '')}" placeholder="Quiz Title">
          </div>
          <div class="admin-field-row">
            <label class="admin-label">Description</label>
            <input class="admin-input" id="pmqt-desc-${i}" value="${_esc(t.description || '')}" placeholder="Short description shown on card">
          </div>
          <div class="admin-field-row">
            <label class="admin-label">Thumbnail Image URL (optional)</label>
            <input class="admin-input" id="pmqt-img-${i}" value="${_esc(t.image || '')}" placeholder="https://…">
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;flex-shrink:0;">
          <span style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">${qCount} question${qCount !== 1 ? 's' : ''}</span>
          <button class="btn btn-sm btn-outline" onclick="adminEditMiniQuizTest(${i})">Edit Questions</button>
          <button class="admin-item-delete" onclick="adminRemoveMiniQuizTest(${i})">&#10005;</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="admin-section-header">
      <h3>Mini Quiz Tests (${tests.length})</h3>
      <button class="btn btn-primary" onclick="adminSaveMiniQuiz()">&#128190; Save Tests</button>
    </div>
    ${rows || '<p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:0.75rem;">No quiz tests yet — add one below.</p>'}
    <button class="btn btn-outline admin-add-btn" onclick="adminAddMiniQuizTest()">+ Add Quiz Test</button>`;
}

/* ── Collect test metadata from DOM ────────────────────────────── */
function _collectMiniQuizTestsFromDOM() {
  const tests = []; let i = 0;
  while (document.getElementById(`pmqt-row-${i}`)) {
    const t = _mqAllTests[i] || {};
    tests.push({
      id:          t.id || ('test_' + Date.now() + '_' + i),
      title:       _val(`pmqt-title-${i}`) || '',
      description: _val(`pmqt-desc-${i}`)  || '',
      image:       _val(`pmqt-img-${i}`)   || '',
      questions:   t.questions || [],
    });
    i++;
  }
  return tests;
}

/* ── Test list actions ──────────────────────────────────────────── */
function adminAddMiniQuizTest() {
  const tests = _collectMiniQuizTestsFromDOM();
  tests.push({ id: 'test_' + Date.now(), title: '', description: '', image: '', questions: [] });
  _mqAllTests = tests;
  _applyPracticeSubcontent(_buildMiniQuizTestList(_mqAllTests));
}
function adminRemoveMiniQuizTest(i) {
  if (!confirm('Remove this quiz test and all its questions?')) return;
  const tests = _collectMiniQuizTestsFromDOM();
  tests.splice(i, 1);
  _mqAllTests = tests;
  _applyPracticeSubcontent(_buildMiniQuizTestList(_mqAllTests));
}
function adminEditMiniQuizTest(i) {
  _mqAllTests = _collectMiniQuizTestsFromDOM();
  _aMiniQuizTestIdx = i;
  _applyPracticeSubcontent(_buildMiniQuizQuestionsEditor(_mqAllTests[i]?.questions || []));
  _updateFloatSave();
}
function adminBackToTestList() {
  if (_aMiniQuizTestIdx !== null && _mqAllTests[_aMiniQuizTestIdx]) {
    _mqAllTests[_aMiniQuizTestIdx].questions = _collectMiniQuizData();
  }
  _aMiniQuizTestIdx = null;
  _applyPracticeSubcontent(_buildMiniQuizTestList(_mqAllTests));
  // Persist so navigating back doesn't lose unsaved question edits
  _persistPracticeSection(_aPracticePackage, 'miniQuiz', _mqAllTests);
  const arr = _getPracticeArrays(_aPracticePackage).miniQuiz;
  arr.splice(0, arr.length, ..._mqAllTests);
  showToast('Questions saved.');
  _updateFloatSave();
}

/* ── Question editor (for a single test) ───────────────────────── */
function _buildMiniQuizQuestionsEditor(questions) {
  const testTitle = _mqAllTests[_aMiniQuizTestIdx]?.title || `Test ${(_aMiniQuizTestIdx || 0) + 1}`;

  const rows = questions.map((q, i) => {
    if (q.type) {
      const badge = q.type.replace(/_/g,' ');
      return `
      <details class="admin-collapse-item" id="pmq-row-${i}" data-json="${_esc(JSON.stringify(q))}">
        <summary class="admin-collapse-header">
          <span class="admin-mq-type-badge">${_esc(badge)}</span>
          <span class="admin-collapse-title">${_esc(q.title || q.type)}</span>
          ${q.questions ? `<span class="admin-collapse-meta">${q.questions.length} qs</span>` : ''}
          <button class="admin-item-delete" onclick="adminRemoveMiniQuizQ(${i});event.stopPropagation();">&#10005;</button>
        </summary>
        <div class="admin-collapse-body">
          ${q.instructions ? `<p style="margin:0 0 0.4rem;font-size:0.85rem;color:var(--text-muted);">${_esc(q.instructions)}</p>` : ''}
          <p style="font-size:0.78rem;color:var(--text-muted);font-style:italic;">Imported section — re-import JSON to modify content.</p>
        </div>
      </details>`;
    }
    const isNew   = !q.q;
    const preview = q.q ? (q.q.length > 55 ? _esc(q.q.substring(0,55)) + '…' : _esc(q.q)) : '';
    return `
    <details class="admin-collapse-item" id="pmq-row-${i}"${isNew ? ' open' : ''}>
      <summary class="admin-collapse-header">
        <span class="admin-collapse-title">MCQ ${i+1}${preview ? ': ' + preview : ' <em style="opacity:.45">New Question</em>'}</span>
        ${q.skill ? `<span class="admin-collapse-meta">${_esc(q.skill)}</span>` : ''}
        <button class="admin-item-delete" onclick="adminRemoveMiniQuizQ(${i});event.stopPropagation();">&#10005;</button>
      </summary>
      <div class="admin-collapse-body">
        <div class="admin-field-row">
          <label class="admin-label">Question Text</label>
          <input class="admin-input" id="pmq-q-${i}" value="${_esc(q.q)}" placeholder="Question">
        </div>
        <div class="admin-field-row" style="margin-top:0.5rem;">
          <label class="admin-label">Options (one per line, typically 4)</label>
          <textarea class="admin-textarea" id="pmq-opts-${i}" rows="4"
            placeholder="Option A&#10;Option B&#10;Option C&#10;Option D">${_esc((q.opts||[]).join('\n'))}</textarea>
        </div>
        <div class="admin-vocab-grid" style="margin-top:0.5rem;">
          <div class="admin-field-row">
            <label class="admin-label">Correct Answer Index (0 = first)</label>
            <input class="admin-input" type="number" min="0" max="9"
              id="pmq-ans-${i}" value="${q.answer != null ? q.answer : 0}">
          </div>
          <div class="admin-field-row">
            <label class="admin-label">Skill Tag</label>
            <input class="admin-input" id="pmq-skill-${i}" value="${_esc(q.skill||'')}"
              placeholder="Vocabulary / Grammar / Reading…">
          </div>
        </div>
      </div>
    </details>`;
  }).join('');

  const importPanel = `
    <div id="mqImportPanel" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;">
      <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.5rem;">Paste JSON from ChatGPT:</p>
      <textarea class="admin-textarea" id="pmq-import-json" rows="8" style="font-family:monospace;font-size:0.78rem;" placeholder='{"title":"...", "sections":[{"type":"true_false_ng","title":"...","questions":[...]}]}'></textarea>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="adminImportMiniQuizJSON(false)">&#8679; Append Sections</button>
        <button class="btn btn-outline" onclick="adminImportMiniQuizJSON(true)">&#8679; Replace All</button>
      </div>
      <details style="margin-top:0.75rem;">
        <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">Supported types &amp; JSON schema ▸</summary>
        <div style="position:relative;margin-top:0.5rem;">
          <button class="btn btn-sm btn-outline"
            style="position:absolute;top:0.4rem;right:0.4rem;z-index:1;font-size:0.72rem;padding:0.2rem 0.55rem;"
            onclick="navigator.clipboard.writeText(MINI_QUIZ_JSON_SCHEMA).then(()=>{this.textContent='&#10003; Copied';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
          <pre style="font-size:0.7rem;line-height:1.5;overflow-x:auto;background:var(--sidebar-bg,#f8f9fa);padding:0.75rem 3.5rem 0.75rem 0.75rem;border-radius:6px;white-space:pre-wrap;margin:0;">${_esc(MINI_QUIZ_JSON_SCHEMA)}</pre>
        </div>
      </details>
    </div>`;

  return `
    <div class="admin-section-header">
      <h3>Questions: ${_esc(testTitle)}</h3>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-sm btn-outline" onclick="adminBackToTestList()">&#8592; Back to Tests</button>
        <button class="btn btn-sm btn-outline"
          onclick="var p=document.getElementById('mqImportPanel');p.style.display=p.style.display==='none'?'block':'none'">
          &#8679; Import JSON</button>
        <button class="btn btn-primary" onclick="adminSaveMiniQuizQuestions()">&#128190; Save Questions</button>
      </div>
    </div>
    ${importPanel}
    ${rows}
    <button class="btn btn-outline admin-add-btn" onclick="adminAddMiniQuizQ()">+ Add MCQ Question</button>`;
}

/* ── Collect questions from question-editor DOM ─────────────────── */
function _collectMiniQuizData() {
  const data = []; let i = 0;
  while (document.getElementById(`pmq-row-${i}`)) {
    const row      = document.getElementById(`pmq-row-${i}`);
    const jsonAttr = row.getAttribute('data-json');
    if (jsonAttr) {
      try { data.push(JSON.parse(jsonAttr)); } catch(e) { /* skip malformed */ }
    } else {
      const rawOpts = _val(`pmq-opts-${i}`);
      data.push({
        q:      _val(`pmq-q-${i}`),
        opts:   rawOpts ? rawOpts.split('\n').map(s=>s.trim()).filter(Boolean) : [],
        answer: parseInt(_val(`pmq-ans-${i}`)) || 0,
        skill:  _val(`pmq-skill-${i}`),
      });
    }
    i++;
  }
  return data;
}

/* ── Question editor actions ────────────────────────────────────── */
function adminAddMiniQuizQ()     { const d = _collectMiniQuizData(); d.push({ q:'', opts:[], answer:0, skill:'' }); _applyPracticeSubcontent(_buildMiniQuizQuestionsEditor(d)); }
function adminRemoveMiniQuizQ(i) { if (!confirm('Remove this item?')) return; const d = _collectMiniQuizData(); d.splice(i,1); _applyPracticeSubcontent(_buildMiniQuizQuestionsEditor(d)); }

/* ── Save questions in-place (stays in question editor) ─────────── */
function adminSaveMiniQuizQuestions() {
  if (_aMiniQuizTestIdx !== null && _mqAllTests[_aMiniQuizTestIdx]) {
    _mqAllTests[_aMiniQuizTestIdx].questions = _collectMiniQuizData();
  }
  _persistPracticeSection(_aPracticePackage, 'miniQuiz', _mqAllTests);
  const arr = _getPracticeArrays(_aPracticePackage).miniQuiz;
  arr.splice(0, arr.length, ..._mqAllTests);
  if (typeof renderMiniQuiz === 'function' && _aPracticePackage === _activePracticePackage) {
    renderMiniQuiz();
  }
  showToast('Questions saved.');
}

/* ── Save test list metadata ────────────────────────────────────── */
function adminSaveMiniQuiz() {
  _mqAllTests = _collectMiniQuizTestsFromDOM();
  _persistPracticeSection(_aPracticePackage, 'miniQuiz', _mqAllTests);
  const arr = _getPracticeArrays(_aPracticePackage).miniQuiz;
  arr.splice(0, arr.length, ..._mqAllTests);
  // Sync practice page if the user is currently viewing this package
  if (typeof renderMiniQuiz === 'function' && _aPracticePackage === _activePracticePackage) {
    renderMiniQuiz();
  }
  showToast('Tests saved.');
}

/* ── JSON import (into the active test's questions) ─────────────── */
function adminImportMiniQuizJSON(replaceAll) {
  const raw = (document.getElementById('pmq-import-json')?.value || '').trim();
  if (!raw) { showToast('Paste a JSON first.'); return; }

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch(e) { showToast('Invalid JSON: ' + e.message); return; }

  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    showToast('JSON must have a top-level "sections" array.'); return;
  }

  const existing = replaceAll ? [] : _collectMiniQuizData();
  let added = 0;
  for (const sec of parsed.sections) {
    if (!sec.type || !sec.questions) continue;
    existing.push({
      type:         sec.type,
      title:        sec.title        || '',
      instructions: sec.instructions || '',
      skill:        sec.title || sec.type,
      questions:    sec.questions,
    });
    added++;
  }

  if (!added) { showToast('No valid sections found. Each section needs "type" and "questions".'); return; }
  _applyPracticeSubcontent(_buildMiniQuizQuestionsEditor(existing));
  // Auto-persist so the imported questions are immediately available (e.g. for live quiz)
  if (_aMiniQuizTestIdx !== null && _mqAllTests[_aMiniQuizTestIdx]) {
    _mqAllTests[_aMiniQuizTestIdx].questions = _collectMiniQuizData();
    _persistPracticeSection(_aPracticePackage, 'miniQuiz', _mqAllTests);
    const arr = _getPracticeArrays(_aPracticePackage).miniQuiz;
    arr.splice(0, arr.length, ..._mqAllTests);
  }
  showToast(`Imported ${added} section(s).${replaceAll ? ' Previous content cleared.' : ''}`);
}
