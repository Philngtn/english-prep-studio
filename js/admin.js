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
  // Stamp object-typed saves with a write timestamp so syncAll can compare
  // freshness and avoid overwriting newer local data with stale Supabase data.
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    value._ts = Date.now();
  }
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
  // Sync mock-test active test to what was just saved so the test is immediately playable
  if (typeof appState !== 'undefined') {
    appState.activePackage = pkgId;
    appState.activeTest    = testId;
    const picker = document.getElementById('testPicker');
    if (picker) picker.value = testId;
  }
}

/* ── Auth (Supabase) ──────────────────────────────────────── */
let _adminAuth  = false;
let _adminEmail = '';
function isAdminLoggedIn() { return _adminAuth; }

// Logout via the admin bar button — onAuthStateChange(SIGNED_OUT) handles the rest
async function adminLogout() {
  await db.logout();
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
let _aExpandedPkgs         = new Set();
let _aRenamingPkg          = null;
let _aRenamingTest         = null;
let _aDirtySection         = null;
let _aListeningPart    = 0;
let _rdActivePassage   = 0;   // which reading passage tab is visible
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

  container.innerHTML = _adminAuth ? await _buildMain() : _buildNotLoggedIn();
  // Re-enable dirty detection and capture the clean baseline in a single
  // macrotask so any stray events from the DOM insertion are already past.
  setTimeout(() => { _adminRendering = false; _takeAdminSnapshot(); }, 0);
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
  if (_adminDirty) { _aDirtySection = _aSec; _adminAutoSaveTrigger(); }
}
function _adminClearDirty() { _adminDirty = false; _aDirtySection = null; _updateDirtyTabBadge(); }
// After a save that does NOT re-render, reset baseline to the current (saved)
// form state so subsequent navigation correctly shows no unsaved changes.
function _adminResetBaseline() {
  _adminSnapshot = _serializeAdminForm();
  _adminDirty    = false;
  _aDirtySection = null;
  _updateDirtyTabBadge();
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
    const secLabel = _aSec.charAt(0).toUpperCase() + _aSec.slice(1);
    fn    = 'adminSaveCurrent()';
    label = `&#128190; Save ${secLabel}`;
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
function adminSetSec(s)           { _adminGuard(() => { _aSec = s; if (s === 'listening') _aListeningPart = 0; renderAdmin(); }); }
function adminSetPracticePkg(id)  { _adminGuard(() => { _aPracticePackage = id; _aMiniQuizTestIdx = null; renderAdmin(); }); }
function adminSetPracticeSec(val) { _adminGuard(() => { _aPracticeSec = val; _aMiniQuizTestIdx = null; renderAdmin(); }); }

/* ── Admin HTML modal (supports form inputs in body) ─────── */
function _showAdminInputModal(title, bodyHTML, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalConfirmBtn').onclick = () => { closeModal(); onConfirm(); };
  document.getElementById('modalOverlay').style.display = 'flex';
}

/* ── Refresh test picker in mock-test tab after CRUD ops ─── */
function _refreshTestPickerInMockTest() {
  if (typeof _populateTestPicker === 'function') _populateTestPicker();
}

/* ── Section tabs HTML with dirty dot badge ──────────────── */
function _buildSecTabsInnerHTML() {
  return ['listening','reading','writing','speaking'].map(s => {
    const dirty = (_aDirtySection === s);
    const label = s.charAt(0).toUpperCase() + s.slice(1);
    return `<button class="admin-sec-tab${_aSec===s?' active':''}${dirty?' dirty':''}"
      onclick="adminSetSec('${s}')">${label}${dirty ? ' <span class="admin-dirty-dot">&#9679;</span>' : ''}</button>`;
  }).join('');
}
function _updateDirtyTabBadge() {
  if (_adminMode !== 'test') return;
  const el = document.getElementById('adminSecTabs');
  if (el) el.innerHTML = _buildSecTabsInnerHTML();
}

/* ── Package sidebar builder ──────────────────────────────── */
function _buildPkgSidebarHTML() {
  const customs   = JSON.parse(localStorage.getItem(CUSTOM_TEST_PKGS_KEY) || '[]');
  const customIds = new Set(customs.map(c => c.id));

  const allPkgs = Object.values(TEST_PACKAGES)
    .sort((a, b) => (customIds.has(a.id) ? 1 : 0) - (customIds.has(b.id) ? 1 : 0));

  const pkgRows = allPkgs.map(p => {
    const isExpanded  = _aExpandedPkgs.has(p.id);
    const isActivePkg = p.id === _aPkg;
    const isRenamingPkg = _aRenamingPkg === p.id;

    const pkgNameEl = isRenamingPkg
      ? `<input id="rename-pkg-input" class="ls-rename-input admin-create-inline-form" value="${_esc(p.name)}"
           onkeydown="if(event.key==='Enter')adminConfirmRenamePkg('${p.id}');if(event.key==='Escape')adminCancelRename()">
         <button class="ls-rename-confirm-btn" onclick="adminConfirmRenamePkg('${p.id}')">&#10003;</button>
         <button class="ls-rename-cancel-btn" onclick="adminCancelRename()">&#10007;</button>`
      : `<span class="pkg-name-label" ondblclick="event.stopPropagation();adminStartRenamePkg('${p.id}')">${_esc(p.name)}</span>
         <button class="admin-sidebar-add-btn btn btn-sm btn-outline"
           onclick="event.stopPropagation();adminShowCreateTestModal('${p.id}')" title="Add test">+</button>
         <button class="admin-sidebar-delete-btn" title="Delete package"
           onclick="event.stopPropagation();adminDeleteTestPkg('${p.id}')">&#128465;</button>`;

    const testRows = isExpanded ? Object.values(p.tests).map(t => {
      const isActive = p.id === _aPkg && t.id === _aTest;
      const isRenamingTest = _aRenamingTest && _aRenamingTest.pkgId === p.id && _aRenamingTest.testId === t.id;
      const nameEl = isRenamingTest
        ? `<input id="rename-test-input" class="ls-rename-input admin-create-inline-form" value="${_esc(t.name)}"
             onkeydown="if(event.key==='Enter')adminConfirmRenameTest('${p.id}','${t.id}');if(event.key==='Escape')adminCancelRename()">
           <button class="ls-rename-confirm-btn" onclick="adminConfirmRenameTest('${p.id}','${t.id}')">&#10003;</button>
           <button class="ls-rename-cancel-btn" onclick="adminCancelRename()">&#10007;</button>`
        : `<span class="test-name-label" onclick="adminSidebarSelectTest('${p.id}','${t.id}')"
             ondblclick="adminStartRenameTest('${p.id}','${t.id}')">${_esc(t.name)}</span>
           <button class="admin-sidebar-delete-btn" title="Delete test"
             onclick="event.stopPropagation();adminDeleteTest('${p.id}','${t.id}')">&#128465;</button>`;
      return `<div class="admin-sidebar-test-row${isActive ? ' active' : ''}">${nameEl}</div>`;
    }).join('') : '';

    return `
      <div class="admin-sidebar-pkg">
        <div class="admin-sidebar-pkg-row${isActivePkg ? ' active' : ''}"
          onclick="adminSidebarToggleExpand('${p.id}')">
          <span class="admin-sidebar-expand-arrow${isExpanded ? ' open' : ''}">&#9654;</span>
          ${pkgNameEl}
        </div>
        ${isExpanded ? `<div class="admin-sidebar-test-list">${testRows}</div>` : ''}
      </div>`;
  }).join('');

  return `${pkgRows}
    <button class="btn btn-sm btn-outline admin-sidebar-new-pkg-btn" onclick="adminShowCreatePkgModal()">+ New Package</button>`;
}

function _renderPkgSidebar() {
  const el = document.getElementById('adminPkgSidebar');
  if (el) el.innerHTML = _buildPkgSidebarHTML();
  _updateDirtyTabBadge();
}

function adminSidebarToggleExpand(pkgId) {
  if (_aExpandedPkgs.has(pkgId)) _aExpandedPkgs.delete(pkgId);
  else _aExpandedPkgs.add(pkgId);
  _renderPkgSidebar();
}

function adminSidebarSelectTest(pkgId, testId) {
  _adminGuard(() => {
    _aPkg  = pkgId;
    _aTest = testId;
    _aListeningPart = 0;
    // If the sec-tabs aren't in the DOM (coming from the "no test" placeholder),
    // a full re-render is needed to inject the tabs + topbar + editor together.
    if (!document.getElementById('adminSecTabs')) {
      renderAdmin();
      return;
    }
    const test   = TEST_PACKAGES[pkgId] && TEST_PACKAGES[pkgId].tests[testId];
    const editor = document.getElementById('adminEditor');
    if (editor) {
      _adminRendering = true;
      editor.innerHTML = _buildEditor(test);
      setTimeout(() => { _adminRendering = false; _takeAdminSnapshot(); }, 0);
    }
    _renderPkgSidebar();
    _updateFloatSave();
  });
}

function adminStartRenamePkg(pkgId) {
  _aRenamingPkg = pkgId; _aRenamingTest = null;
  _renderPkgSidebar();
  setTimeout(() => { const el = document.getElementById('rename-pkg-input'); if (el) { el.focus(); el.select(); } }, 0);
}
function adminStartRenameTest(pkgId, testId) {
  _aRenamingTest = { pkgId, testId }; _aRenamingPkg = null;
  _renderPkgSidebar();
  setTimeout(() => { const el = document.getElementById('rename-test-input'); if (el) { el.focus(); el.select(); } }, 0);
}
function adminCancelRename() { _aRenamingPkg = null; _aRenamingTest = null; _renderPkgSidebar(); }

function adminConfirmRenamePkg(pkgId) {
  const name = (document.getElementById('rename-pkg-input')?.value || '').trim();
  if (!name) { showToast('Name cannot be empty.'); return; }
  TEST_PACKAGES[pkgId].name = name;
  const store = _getAdminStore();
  if (!store[pkgId]) store[pkgId] = {};
  store[pkgId]._name = name;
  _lsSave(ADMIN_DATA_KEY, store);
  // Update custom packages list if this is a custom package
  const customs = JSON.parse(localStorage.getItem(CUSTOM_TEST_PKGS_KEY) || '[]');
  const ci = customs.findIndex(c => c.id === pkgId);
  if (ci !== -1) { customs[ci].name = name; _lsSave(CUSTOM_TEST_PKGS_KEY, customs); }
  _aRenamingPkg = null;
  _refreshTestPickerInMockTest();
  _renderPkgSidebar();
  showToast('Package renamed.');
}

function adminConfirmRenameTest(pkgId, testId) {
  const name = (document.getElementById('rename-test-input')?.value || '').trim();
  if (!name) { showToast('Name cannot be empty.'); return; }
  TEST_PACKAGES[pkgId].tests[testId].name = name;
  const store = _getAdminStore();
  if (!store[pkgId]) store[pkgId] = {};
  if (!store[pkgId][testId]) store[pkgId][testId] = {};
  store[pkgId][testId]._name = name;
  _lsSave(ADMIN_DATA_KEY, store);
  // Update custom tests list — this is the root rename bug fix
  const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
  const tList = customTests[pkgId];
  if (tList) {
    const ti = tList.findIndex(t => t.id === testId);
    if (ti !== -1) { tList[ti].name = name; _lsSave(CUSTOM_TESTS_KEY, customTests); }
  }
  _aRenamingTest = null;
  _refreshTestPickerInMockTest();
  _renderPkgSidebar();
  showToast('Test renamed.');
}

/* ── Create package / test via modal ─────────────────────── */
function adminShowCreatePkgModal() {
  _showAdminInputModal('New Test Package',
    `<input id="modal-new-pkg-name" class="admin-input" placeholder="e.g. Cambridge IELTS 19" style="width:100%;margin-top:0.5rem;">`,
    adminConfirmCreateTestPkg
  );
  setTimeout(() => document.getElementById('modal-new-pkg-name')?.focus(), 50);
}

function adminShowCreateTestModal(pkgId) {
  _showAdminInputModal('New Test',
    `<input id="modal-new-test-name" class="admin-input" placeholder="e.g. Test 5" style="width:100%;margin-top:0.5rem;">`,
    () => adminConfirmCreateTest(pkgId)
  );
  setTimeout(() => document.getElementById('modal-new-test-name')?.focus(), 50);
}

/* ── Import section JSON via modal ───────────────────────── */
function adminShowImportSectionModal() {
  const schemaMap = { listening: LISTENING_JSON_SCHEMA, reading: READING_JSON_SCHEMA, writing: WRITING_JSON_SCHEMA, speaking: SPEAKING_JSON_SCHEMA };
  const schema = schemaMap[_aSec] || '';
  const canAppend = _aSec === 'listening' || _aSec === 'reading';
  const appendBtn = canAppend
    ? `<button class="btn btn-outline" style="flex-shrink:0;" onclick="closeModal();_adminDoImportSection(false)">&#8679; Append</button>`
    : '';
  _showAdminInputModal(`Import ${_aSec.charAt(0).toUpperCase() + _aSec.slice(1)} JSON`,
    `<textarea id="section-import-ta" class="admin-textarea ls-json-textarea" rows="16"
      placeholder="Paste JSON here..." style="width:100%;margin-top:0.5rem;font-family:monospace;font-size:0.78rem;"></textarea>
     <details style="margin-top:0.6rem;">
       <summary style="font-size:0.8rem;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;gap:0.5rem;">
         <span>JSON Schema &#9658;</span>
         <button class="btn btn-sm btn-outline" style="font-size:0.7rem;padding:0.1rem 0.5rem;margin-left:auto;"
           onclick="event.preventDefault();event.stopPropagation();navigator.clipboard.writeText(document.getElementById('schema-pre-display').textContent).then(()=>showToast('Schema copied!'))">&#128203; Copy</button>
       </summary>
       <pre id="schema-pre-display" style="font-size:0.65rem;overflow-x:auto;overflow-y:auto;max-height:260px;background:var(--sidebar-bg,#f8f9fa);padding:0.5rem;border-radius:4px;white-space:pre-wrap;margin-top:0.4rem;">${_esc(schema)}</pre>
     </details>
     <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">${appendBtn}</div>`,
    () => _adminDoImportSection(true)
  );
  setTimeout(() => {
    const btn = document.getElementById('modalConfirmBtn');
    if (btn) btn.textContent = 'Replace All';
    document.getElementById('section-import-ta')?.focus();
  }, 50);
}

function _adminDoImportSection(replaceAll) {
  const raw = (_val('section-import-ta') || '').trim();
  if (!raw) { showToast('Paste JSON first.'); return; }
  if (_aSec === 'listening') {
    let parsed;
    try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }
    // If the JSON has a "sections" array, import all sections at once
    if (parsed.sections && Array.isArray(parsed.sections) && parsed.sections.length >= 1) {
      adminImportListeningSection(parsed, replaceAll);
    } else {
      const ta = document.getElementById(`ls-import-json-${_aListeningPart}`);
      if (ta) ta.value = raw;
      adminImportListeningJSON(_aListeningPart, replaceAll);
    }
  } else if (_aSec === 'reading') {
    // If the JSON has a top-level "passages" array, import all passages at once
    let parsed;
    try { parsed = JSON.parse(raw); } catch(e) { showToast('Invalid JSON: ' + e.message); return; }
    if (parsed.passages && Array.isArray(parsed.passages) && parsed.passages.length >= 1) {
      adminImportReadingSection(parsed, replaceAll);
    } else {
      const ta = document.getElementById('rd-import-json-0');
      if (ta) ta.value = raw;
      adminImportReadingJSON(0, replaceAll);
    }
  } else if (_aSec === 'writing') {
    const ta = document.getElementById('wr-import-json');
    if (ta) ta.value = raw;
    adminImportWritingJSON();
  } else if (_aSec === 'speaking') {
    const ta = document.getElementById('sp-import-json');
    if (ta) ta.value = raw;
    adminImportSpeakingJSON();
  }
}

/* ── Save current section dispatcher ─────────────────────── */
function adminSaveCurrent() {
  if (_aSec === 'listening')     adminSaveListening();
  else if (_aSec === 'reading')  adminSaveReading();
  else if (_aSec === 'writing')  adminSaveWriting();
  else if (_aSec === 'speaking') adminSaveSpeaking();
}

/* ── Delete test package (modal confirmation) ─────────────── */
function adminDeleteTestPkg(pkgId) {
  pkgId = pkgId || _aPkg;
  const pkg = TEST_PACKAGES[pkgId];
  if (!pkg) return;
  showModal('Delete Package', `Delete "${pkg.name}" and all its tests? This cannot be undone.`, () => _doDeleteTestPkg(pkgId));
}
function _doDeleteTestPkg(pkgId) {
  const customs  = JSON.parse(localStorage.getItem(CUSTOM_TEST_PKGS_KEY) || '[]');
  const isCustom = customs.some(c => c.id === pkgId);
  if (isCustom) {
    _lsSave(CUSTOM_TEST_PKGS_KEY, customs.filter(c => c.id !== pkgId));
    const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
    delete customTests[pkgId];
    _lsSave(CUSTOM_TESTS_KEY, customTests);
    const store = _getAdminStore();
    delete store[pkgId];
    _lsSave(ADMIN_DATA_KEY, store);
  } else {
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_TESTS_KEY) || '{"pkgs":[],"tests":{}}');
    if (!hidden.pkgs.includes(pkgId)) hidden.pkgs.push(pkgId);
    _lsSave(HIDDEN_TESTS_KEY, hidden);
  }
  const name = TEST_PACKAGES[pkgId].name;
  delete TEST_PACKAGES[pkgId];
  _aExpandedPkgs.delete(pkgId);
  const remaining = Object.keys(TEST_PACKAGES);
  if (remaining.length) { _aPkg = remaining[0]; _aTest = Object.keys(TEST_PACKAGES[_aPkg].tests)[0]; }
  _refreshTestPickerInMockTest();
  renderAdmin();
  showToast(`Package "${name}" removed.`);
}

/* ── Delete individual test (modal confirmation) ─────────── */
function adminDeleteTest(pkgId, testId) {
  pkgId  = pkgId  || _aPkg;
  testId = testId || _aTest;
  const pkg  = TEST_PACKAGES[pkgId];
  const test = pkg && pkg.tests[testId];
  if (!test) return;
  showModal('Delete Test', `Delete "${test.name}" from "${pkg.name}"? This cannot be undone.`, () => _doDeleteTest(pkgId, testId));
}
function _doDeleteTest(pkgId, testId) {
  const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
  const pkgCustoms  = customTests[pkgId] || [];
  const isCustom    = pkgCustoms.some(t => t.id === testId);
  if (isCustom) {
    customTests[pkgId] = pkgCustoms.filter(t => t.id !== testId);
    _lsSave(CUSTOM_TESTS_KEY, customTests);
    const store = _getAdminStore();
    if (store[pkgId]) { delete store[pkgId][testId]; _lsSave(ADMIN_DATA_KEY, store); }
  } else {
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_TESTS_KEY) || '{"pkgs":[],"tests":{}}');
    if (!hidden.tests[pkgId]) hidden.tests[pkgId] = [];
    if (!hidden.tests[pkgId].includes(testId)) hidden.tests[pkgId].push(testId);
    _lsSave(HIDDEN_TESTS_KEY, hidden);
  }
  const name = TEST_PACKAGES[pkgId].tests[testId].name;
  delete TEST_PACKAGES[pkgId].tests[testId];
  const remaining = Object.keys(TEST_PACKAGES[pkgId].tests);
  if (remaining.length) _aTest = remaining[0];
  _refreshTestPickerInMockTest();
  renderAdmin();
  showToast(`Test "${name}" removed.`);
}

/* ── Create new test package ─────────────────────────────── */
function adminConfirmCreateTestPkg() {
  const name = (_val('modal-new-pkg-name') || '').trim();
  if (!name) { showToast('Package name is required.'); return; }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const id   = 'tpkg_' + slug + '_' + Date.now();
  const firstTestId = 'test1';
  TEST_PACKAGES[id] = {
    id, name,
    tests: { [firstTestId]: { id: firstTestId, name: 'Test 1', listening: null, reading: null, writing: null, speaking: null } }
  };
  const customs = JSON.parse(localStorage.getItem(CUSTOM_TEST_PKGS_KEY) || '[]');
  customs.push({ id, name });
  _lsSave(CUSTOM_TEST_PKGS_KEY, customs);
  const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
  customTests[id] = [{ id: firstTestId, name: 'Test 1' }];
  _lsSave(CUSTOM_TESTS_KEY, customTests);
  _aPkg = id; _aTest = firstTestId;
  _aExpandedPkgs.add(id);
  _refreshTestPickerInMockTest();
  renderAdmin();
  showToast(`Package "${name}" created.`);
}

/* ── Create new test within a package ────────────────────── */
function adminConfirmCreateTest(pkgId) {
  const name = (_val('modal-new-test-name') || '').trim();
  if (!name) { showToast('Test name is required.'); return; }
  const id = 'test_' + Date.now();
  TEST_PACKAGES[pkgId].tests[id] = { id, name, listening: null, reading: null, writing: null, speaking: null };
  const customTests = JSON.parse(localStorage.getItem(CUSTOM_TESTS_KEY) || '{}');
  if (!customTests[pkgId]) customTests[pkgId] = [];
  customTests[pkgId].push({ id, name });
  _lsSave(CUSTOM_TESTS_KEY, customTests);
  _aPkg = pkgId; _aTest = id;
  _aExpandedPkgs.add(pkgId);
  _refreshTestPickerInMockTest();
  renderAdmin();
  showToast(`Test "${name}" created.`);
}

/* ── Not-logged-in view ───────────────────────────────────── */
function _buildNotLoggedIn() {
  return `
  <div class="admin-login-wrap">
    <div class="admin-login-box" style="text-align:center;">
      <img src="../assets/Logo.png" alt="Learn With Trang" class="admin-login-logo">
      <h2>Admin Panel</h2>
      <p style="color:var(--text-muted);margin-bottom:1.25rem;">Sign in with your admin account to manage content.</p>
      <button class="btn btn-primary admin-login-submit" onclick="openAuthModal()">&#128274; Sign In</button>
    </div>
  </div>`;
}

/* ── Main view ────────────────────────────────────────────── */
async function _buildMain() {
  if (_adminMode === 'practice') {
    return _buildPracticeEditor();
  }

  if (_adminMode === 'students') {
    return await _buildStudentsDashboard();
  }

  // Test editor — two-panel layout
  const pkg  = TEST_PACKAGES[_aPkg];
  const test = pkg && pkg.tests[_aTest];

  // Ensure the active package is expanded in the sidebar on every render
  _aExpandedPkgs.add(_aPkg);

  const editorArea = test ? `
    <div class="admin-sec-tabs" id="adminSecTabs">
      ${_buildSecTabsInnerHTML()}
    </div>
    <div class="admin-editor-topbar">
      <button class="btn btn-sm btn-outline" onclick="adminShowImportSectionModal()">&#8679; Import JSON</button>
    </div>
    <div class="admin-editor" id="adminEditor">
      ${_buildEditor(test)}
    </div>` : `
    <div id="adminEditor" style="display:flex;align-items:center;justify-content:center;height:100%;min-height:260px;color:var(--text-muted);font-size:0.95rem;">
      Select a test from the sidebar, or create a new package to get started.
    </div>`;

  return `
  <div class="admin-test-layout">
    <div class="admin-pkg-sidebar" id="adminPkgSidebar">
      ${_buildPkgSidebarHTML()}
    </div>
    <div class="admin-editor-area">
      ${editorArea}
    </div>
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
const LISTENING_JSON_SCHEMA = `
==============================================================
  IELTS LISTENING — JSON IMPORT SCHEMA
  Paste into Admin → Listening Editor → Import JSON
==============================================================

TOP-LEVEL FORMAT
{
  "sections": [                    ← wrap everything in sections[]
    {
      "section_id": 1,             ← 1–4
      "title": "Part 1: ...",
      "audio_url": "audio/part1.mp3",
      "transcript": "...",         ← optional, shown in review
      "groups": [ ... ]            ← question groups for this part
    }
  ]
}

"Replace All" wipes the target part and loads fresh.
"Append" merges groups into the existing part.

RULES
- "id" must be a unique integer (the question number shown to students).
- "answer" is always an array: ["word"] or ["A","C"] for multi.
- "start" is the approximate audio timestamp in seconds when the answer is spoken.
- "answer_rule" is shown as a hint: "ONE WORD ONLY", "NO MORE THAN TWO WORDS AND/OR A NUMBER", etc.

--------------------------------------------------------------
QUESTION TYPES
--------------------------------------------------------------

1. form_completion   ← labelled fields, answer box sits directly next to the label
   "label" is the field name shown to the left of the input box.
   "instruction" (optional) — shown above the form (e.g. "Write ONE WORD ONLY").
   { "type": "form_completion",
     "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
     "answer_rule": "ONE WORD AND/OR A NUMBER",
     "questions": [
       { "id": 1, "label": "Name:",           "answer": ["Emma"],     "start": 18 },
       { "id": 2, "label": "Postcode:",        "answer": ["DW30 7YZ"], "start": 24 },
       { "id": 3, "label": "Departure date:",  "answer": ["Friday"],   "start": 31 }
     ]
   }

2. note_completion  ← document with headings + inline blanks (preferred)
   Use "blocks" + "questions". Each block is one visual line.
   Block types:
     "heading"     → bold large title
     "subheading"  → bold section title
     "line"        → normal text line
     "bullet_line" → line prefixed with –
   Lines WITHOUT a blank: use  "text": "plain text here"
   Lines WITH blank(s):   use  "tokens": [...]
   Token types inside tokens[]:
     { "type": "text",  "value": "words" }
     { "type": "blank", "id": N }          ← N matches questions[].id

   { "type": "note_completion",
     "answer_rule": "ONE WORD AND/OR A NUMBER",
     "blocks": [
       { "type": "subheading", "text": "Recommended Trips" },
       { "type": "line",
         "tokens": [
           { "type": "text",  "value": "A" },
           { "type": "blank", "id": 3 },
           { "type": "text",  "value": "tour of the city centre" }
         ]
       },
       { "type": "subheading", "text": "Food" },
       { "type": "line",  "text": "Clacton Market:" },
       { "type": "bullet_line",
         "tokens": [
           { "type": "text",  "value": "Good for" },
           { "type": "blank", "id": 4 },
           { "type": "text",  "value": "food" }
         ]
       },
       { "type": "bullet_line", "text": "Roots Music Festival" }
     ],
     "questions": [
       { "id": 3, "answer": ["guided"], "start": 45 },
       { "id": 4, "answer": ["fresh"],  "start": 80 }
     ]
   }

3. sentence_completion  ← each question is one sentence with a blank
   Simple (label): { "id": 5, "label": "The café opens at ________.", "answer": ["8am"], "start": 72 }
   Token-based:
   { "id": 6,
     "tokens": [
       {"type":"text","value":"Car parking costs "},
       {"type":"blank","id":6},
       {"type":"text","value":" per hour."}
     ],
     "answer": ["£2"], "start": 78
   }

4. summary_completion  ← flowing paragraph with inline numbered blanks
   TWO supported formats — use whichever is easier:

   FORMAT A — simple (recommended for ChatGPT)
   Each question has "text" = the sentence fragment containing ________ as the blank.
   All sentences are joined into one flowing paragraph on screen.
   { "type": "summary_completion",
     "instruction": "Complete the summary using NO MORE THAN ONE WORD for each answer.",
     "answer_rule": "ONE WORD ONLY",
     "questions": [
       { "id": 7, "text": "Built in ________, the building was later expanded.", "answer": ["1998"], "start": 90 },
       { "id": 8, "text": "It was expanded ________ times over the following decade.",  "answer": ["three"], "start": 95 },
       { "id": 9, "text": "The expansion was funded by a ________ grant.",             "answer": ["government"], "start": 102 }
     ]
   }

   FORMAT B — token-based (precise blank placement within one shared paragraph)
   Put ALL tokens on the first question; other questions only need id+answer+start.
   { "type": "summary_completion",
     "answer_rule": "ONE WORD ONLY",
     "questions": [
       { "id": 7,
         "tokens": [
           {"type":"text",  "value":"Built in "},
           {"type":"blank", "id":7},
           {"type":"text",  "value":", expanded "},
           {"type":"blank", "id":8},
           {"type":"text",  "value":" times, funded by a "},
           {"type":"blank", "id":9},
           {"type":"text",  "value":" grant."}
         ],
         "answer": ["1998"], "start": 90
       },
       { "id": 8, "answer": ["three"],      "start": 95  },
       { "id": 9, "answer": ["government"], "start": 102 }
     ]
   }

5. table_completion — rich format (preferred)
   Each cell is an array of segments: {"t":"text","content":"..."} or {"t":"blank","id":N,"answer":["word"],"start":S}
   Cells with no blank use a single text segment. "columns" drives the header row.
   { "type": "table_completion",
     "columns": ["Subject", "Recommended Page Design"],
     "answer_rule": "ONE WORD ONLY",
     "rows": [
       { "cells": [
           [ {"t":"blank","id":25,"answer":["Law"],"start":55}, {"t":"text","content":" Studies"} ],
           [ {"t":"text","content":"flowchart, showing courtroom processes and "}, {"t":"blank","id":26,"answer":["penalties"],"start":58} ]
       ]},
       { "cells": [
           [ {"t":"text","content":"Culture Studies"} ],
           [ {"t":"text","content":"table or spider graph, linking "}, {"t":"blank","id":27,"answer":["related"],"start":63}, {"t":"text","content":" thoughts etc."} ]
       ]}
     ]
   }

   Legacy format (still supported — one blank per cell with row/col lookup):
   { "type": "table_completion",
     "columns": ["Activity","Day","Cost"],
     "answer_rule": "NO MORE THAN TWO WORDS AND/OR A NUMBER",
     "questions": [
       { "id": 9,  "row": "Swimming", "col": "Day",  "answer": ["Monday"], "start": 55 },
       { "id": 10, "row": "Swimming", "col": "Cost", "answer": ["£4.50"],  "start": 58 }
     ]
   }

6. flow_chart
   { "type": "flow_chart",
     "answer_rule": "ONE WORD ONLY",
     "questions": [
       { "id": 11, "node": 1, "prefix": "Water collected from", "answer": ["river"],   "suffix": "",                 "start": 290 },
       { "id": 12, "node": 2, "prefix": "Passed through a",     "answer": ["filter"],  "suffix": "to remove solids", "start": 295 }
     ]
   }

7. multiple_choice  (single answer)
   { "type": "multiple_choice",
     "questions": [
       { "id": 13, "text": "What is the main purpose?",
         "options": ["A. Transport","B. Health","C. Education"],
         "answer": ["B"], "start": 105 }
     ]
   }

8. multiple_choice  (two or more answers) — add "multi": true, "count": N
   { "type": "multiple_choice", "multi": true, "count": 2,
     "questions": [
       { "id": 14, "text": "Which TWO activities are available?",
         "options": ["A. Swimming","B. Running","C. Cycling","D. Hiking","E. Dancing"],
         "answer": ["A","C"], "start": 140 }
     ]
   }

9. matching  ← options shown as reference list; each question has a dropdown
   "question"        — main question text shown above the options list
                       (e.g. "Which event in the history of football took place in each year?")
   "instruction"     — secondary instruction line below the question
                       (e.g. "Choose SIX answers from the box and write the correct letter, A–H, next to Questions")
   "options_heading" (optional) — bold title above the options list
   "options"         — shared list shown to student, format "A. description"
   "text" on each question — the label/year the student is matching (e.g. "1870")
   "answer"          — the correct letter e.g. ["E"]
   { "type": "matching",
     "question": "Which event in the history of football in the UK took place in each of the following years?",
     "instruction": "Choose SIX answers from the box and write the correct letter, A–H, next to Questions",
     "options_heading": "Events in the history of football",
     "options": [
       "A. the introduction of pay for the players",
       "B. a change to the design of the goal",
       "C. the first use of lights for matches",
       "D. the introduction of goalkeepers",
       "E. the first international match",
       "F. two changes to the rules of the game",
       "G. the introduction of a fee for spectators",
       "H. an agreement on the length of a game"
     ],
     "questions": [
       { "id": 15, "text": "1870", "answer": ["E"], "start": 120 },
       { "id": 16, "text": "1874", "answer": ["G"], "start": 135 },
       { "id": 17, "text": "1875", "answer": ["H"], "start": 148 }
     ]
   }

10. short_answer
    { "type": "short_answer",
      "answer_rule": "NO MORE THAN TWO WORDS AND/OR A NUMBER",
      "questions": [
        { "id": 18, "text": "What material is the roof made from?", "answer": ["bamboo"], "start": 340 }
      ]
    }

11. diagram_matching — image on left, questions on right
    "match_type"  — TWO variants:
      (omit / "fill") — text-based: each question auto-detects its style from "text":
                         • Short label (no "________") → renders as  21 inlet pipe [___]
                         • Sentence with "________"   → renders inline with blank embedded
                         Both styles can be mixed freely within the same group.
      "select"        — student picks a letter from a dropdown (requires options_range or options)
    "question"    — goal text shown above the question block
    "instruction" — answering rule ("Write ONE WORD ONLY." / "Write the correct letter, A–J.")
    "answer_rule" — short rule shown inline above questions
    "image"       — URL of the diagram/map/plan image (renders on LEFT; questions on RIGHT)

    Standard variant — mix short labels and inline sentences freely:
    { "type": "diagram_matching",
      "question": "Label the diagram.",
      "instruction": "Write ONE WORD ONLY for each answer.",
      "answer_rule": "ONE WORD ONLY",
      "image": "https://SUPABASE_URL/storage/v1/object/public/media/diagrams/turbine.jpg",
      "questions": [
        { "id": 21, "text": "inlet pipe",                                          "answer": ["turbine"],   "start": 200 },
        { "id": 22, "text": "Molecule splits, producing ________ for analysis",    "answer": ["fragments"], "start": 210 },
        { "id": 23, "text": "output shaft",                                        "answer": ["generator"], "start": 215 },
        { "id": 24, "text": "________ filter removes large particles",             "answer": ["Mesh"],      "start": 218 }
      ]
    }

    Select variant (dropdown letters):
    { "type": "diagram_matching",
      "match_type": "select",
      "question": "Complete the timetable.",
      "instruction": "Write the correct letter, A–J, for each answer.",
      "answer_rule": "ONE LETTER ONLY",
      "image": "https://SUPABASE_URL/storage/v1/object/public/media/diagrams/timetable.jpg",
      "options_range": "A-J",
      "questions": [
        { "id": 17, "text": "Teacher-led discussion", "answer": ["B"], "start": 120 },
        { "id": 18, "text": "Writing skills",         "answer": ["F"], "start": 135 },
        { "id": 19, "text": "On-call teacher",        "answer": ["C"], "start": 148 },
        { "id": 20, "text": "Language exchange",      "answer": ["I"], "start": 160 }
      ]
    }

==============================================================
  CHATGPT PROMPT — copy and paste this to ChatGPT
==============================================================
I am building an IELTS Listening mock test. Convert the transcript below into a JSON question set for one listening part. Output ONLY valid JSON — no explanation, no markdown fences.

RULES:
1. Wrap everything in: { "sections": [{ "section_id": 1, "title": "Part 1: ...", "audio_url": "", "groups": [...] }] }
2. Question "id" values must be consecutive integers starting from [START_ID].
3. "answer" is always an array e.g. ["word"] or ["A","C"].
4. "start" is the approximate second in the audio when the answer is spoken.
5. Choose question types that match the content naturally.

INTRO BLOCKS (optional on ANY group type) — add "intro_blocks" to a group to show non-answerable display content (headings, context lines, example rows, bullet cues) BEFORE the question inputs. Students see it but do not answer it. Block types: {"type":"heading","text":"..."} (bold title), {"type":"subheading","text":"..."} (bold section label), {"type":"line","text":"..."} (normal text line), {"type":"bullet_line","text":"..."} (–  bullet point). Always put intro_blocks on the group, not on individual questions. Example use cases: a form title above form_completion fields, an example row above table_completion, context sentences above sentence_completion.
Example: { "type": "form_completion", "intro_blocks": [{"type":"heading","text":"BOOKING FORM"}, {"type":"line","text":"Example: Name: Smith"}], "questions": [...] }

FOR note_completion — use this format (NOT label/answer rows):
  "blocks": [ array of block objects ] + "questions": [ {id, answer, start} ]
  Block types: "heading" (bold title), "subheading" (bold section), "line" (normal), "bullet_line" (– bullet)
  Lines with blanks → "tokens": [{"type":"text","value":"..."}, {"type":"blank","id":N}, ...]
  Lines with no blank → "text": "plain text here"

FOR form_completion → use "label" (not "text") for the field name shown left of the input box. Add optional "instruction" on the group for the rule shown above the form.
FOR sentence_completion with inline blanks → use "tokens" array per question.
FOR summary_completion → PREFERRED: give each question a "text" field containing the sentence with ________ as the blank placeholder (all sentences render as one flowing paragraph). ALTERNATIVE: put all tokens on the first question only; other questions just need id+answer+start.
FOR multiple_choice two answers → add "multi": true, "count": 2 on the group.
FOR matching → "question" is the main question text (e.g. "Which event... took place in each year?"); "instruction" is the secondary line (e.g. "Choose SIX answers... write the correct letter, A–H, next to Questions"); "options" is the shared A–H list (format: "A. description"); "text" on each question is the label/year being matched; add "options_heading" for the bold title above the list.
FOR diagram_matching → TWO variants. (A) DEFAULT (omit "match_type"): each question auto-detects its style — if "text" contains "________" (8 underscores) the blank is embedded inline in that sentence; otherwise "text" is treated as a short label and a blank appears beside it. BOTH styles can be mixed freely in the same group. Use this for any diagram/map/plan/process labelling. (B) "match_type":"select": student picks a letter from a dropdown; also provide "options_range" (e.g. "A-J"). Always set "question" to the goal sentence, "instruction" to the answering rule, "answer_rule" to the short constraint. "image" is a full URL; renders LEFT with questions RIGHT. Do NOT use map_labeling, diagram_labeling, or plan_labeling.
FOR table_completion → PREFERRED: use the rich "rows" format where each cell is an array of segments: {"t":"text","content":"..."} for plain text or {"t":"blank","id":N,"answer":["word"],"start":S} for a numbered blank. Multiple blanks per cell are supported. "columns" is the header row. LEGACY: "questions" with "row"/"col" per blank is still supported but cannot express multiple blanks in one cell or text around the blank.

TRANSCRIPT:
[PASTE TRANSCRIPT HERE]
==============================================================`;

const READING_JSON_SCHEMA = `
==============================================================
  IELTS READING — JSON IMPORT SCHEMA
  Paste into Admin → Reading Editor → Import JSON
==============================================================

FULL-SECTION FORMAT (all passages at once — recommended):
{
  "passages": [
    { "passage_id": 1, "title": "...", "text": "...", "groups": [...] },
    { "passage_id": 2, "title": "...", "text": "...", "groups": [...] },
    { "passage_id": 3, "title": "...", "text": "...", "groups": [...] }
  ]
}
"Replace All" replaces every passage; "Append" merges into existing passages.

SINGLE-PASSAGE FORMAT (one passage):
{ "title": "...", "text": "...", "groups": [...] }
  — or —
{ "passages": [{ "passage_id": 1, ... }] }

--------------------------------------------------------------
RULES:
- "groups" is an array of question groups for one passage.
- Each group has a "type" and "questions" (or "labels" for diagram).
- "id" values must be unique integers across the whole passage.
- "answer" is the exact correct answer string (or array for multiple_select).
- "answerRule" is shown as a hint to students (e.g. "NO MORE THAN TWO WORDS").
- "paragraphRef" is optional — the letter of the passage paragraph (A, B, C…)
  where the answer can be found, used for highlighting.
- "intro_blocks" — optional on any group. Introduces the topic/context of the
  questions so students know what they are reading about. Place it on the GROUP
  object (not on individual questions). Use one or more of:
    {"type":"heading","text":"..."}     — bold title for the question set
    {"type":"subheading","text":"..."}  — sub-section title
    {"type":"line","text":"..."}        — plain context sentence
  Include when it helps students orient to what the questions are about.

--------------------------------------------------------------
SUPPORTED TYPES
--------------------------------------------------------------

1. true_false_not_given
   answer: "TRUE" | "FALSE" | "NOT GIVEN"
   intro_blocks (optional): heading naming what the statements are about (e.g. "Claims about Sleep Research")

2. yes_no_not_given
   answer: "YES" | "NO" | "NOT GIVEN"
   intro_blocks (optional): heading naming the writer's views being assessed

3. multiple_choice  (choose ONE)
   answer: single letter  e.g. "B"
   options: array of full option strings
   intro_blocks (optional): heading for the question set (e.g. "Sleep Cycle Comprehension")

4. multiple_select  (choose N)
   answer: array of letters  e.g. ["B","D"]
   count: number of correct answers
   options: array of full option strings
   intro_blocks (optional): heading for the question set

ALL MATCHING TYPES — rendered as:
   ① intro_blocks context  ② instruction  ③ options list (A. text …) as a reference panel
   ④ each question as a row: [Q#] [question text] [dropdown to select letter]
   IMPORTANT: always put matching questions in a group with a shared "groupId"
   so the options panel is shown ONCE at the top, not repeated per question.
   "options_heading" (optional) — bold title shown above the options list
   intro_blocks (optional): heading + line giving context (e.g. what paragraphs cover)

5. matching_headings
   Each question = one paragraph to assign a heading.
   answer: the heading letter  e.g. "iii"
   options: shared array of heading strings (same for all questions in group)
   { "type": "matching_headings", "groupId": "mh_g1",
     "intro_blocks": [{"type":"heading","text":"Paragraph Headings"}],
     "instructions": "Choose the correct heading for paragraphs A–E from the list below.",
     "options_heading": "List of Headings",
     "options": ["i. The evolutionary origins of sleep", "ii. How technology disrupts sleep", "iii. The stages of a sleep cycle"],
     "questions": [
       { "id": 8, "text": "Paragraph A", "answer": "iii" },
       { "id": 9, "text": "Paragraph B", "answer": "i"  }
     ]
   }

6. matching_information  (paragraph matching)
   Each question = a statement to locate in a paragraph.
   answer: paragraph letter  e.g. "D"
   options: paragraph letters or summaries  e.g. ["A","B","C","D","E","F"]
   { "type": "matching_information", "groupId": "mi_g1",
     "intro_blocks": [{"type":"heading","text":"Locating Information"}],
     "instructions": "Which paragraph contains the following information?",
     "options": ["A","B","C","D","E","F"],
     "questions": [
       { "id": 11, "text": "A comparison between sleep patterns in different age groups.", "answer": "B" },
       { "id": 12, "text": "A reference to a specific scientific study on sleep deprivation.", "answer": "E" }
     ]
   }

7. matching_features
   Each question = one feature to match to a person/category.
   answer: letter of the matching person/category  e.g. "B"
   options: array of people/categories  (format "A. Name")
   { "type": "matching_features", "groupId": "mf_g1",
     "intro_blocks": [
       {"type":"heading","text":"Research Findings"},
       {"type":"line","text":"Match each finding to the scientist who made it."}
     ],
     "instructions": "Match each finding with the correct scientist.",
     "options_heading": "Scientists",
     "options": ["A. Dr Sarah Chen", "B. Professor James Liu", "C. Dr Maria Costa"],
     "questions": [
       { "id": 14, "text": "Identified a gene linked to short sleep duration.", "answer": "A" },
       { "id": 15, "text": "Proposed that sleep serves a waste-removal function.", "answer": "C" }
     ]
   }

8. matching_sentence_endings
   Each question = sentence beginning; student selects the correct ending.
   answer: letter of the correct ending  e.g. "E"
   options: array of sentence endings  (format "A. ending text")
   { "type": "matching_sentence_endings", "groupId": "mse_g1",
     "intro_blocks": [{"type":"heading","text":"Effects of Sleep on Health"}],
     "instructions": "Complete each sentence with the correct ending A–F.",
     "options": ["A. is associated with better performance.", "B. can lead to cardiovascular disease.", "C. reduces vaccine effectiveness."],
     "questions": [
       { "id": 17, "text": "Regularly sleeping fewer than six hours per night", "answer": "B" },
       { "id": 18, "text": "Getting sufficient deep sleep each night", "answer": "A" }
     ]
   }

9. sentence_completion
   Each question = one sentence with a blank. Use "________" (8 underscores) in "text" as the blank placeholder.
   Sentences with "________" render with the blank embedded inline; sentences without it render as label + blank.
   Both styles can mix freely in one group.
   answerRule: e.g. "NO MORE THAN TWO WORDS"
   groupId is auto-assigned — you do NOT need to add it manually.
   intro_blocks (optional): heading naming the topic + line of context

10. summary_completion
    A flowing paragraph with numbered blanks embedded inside. Use "________" (8 underscores) in each question's "text"
    where the blank goes. All texts are joined into one paragraph on screen.
    answerRule: e.g. "ONE WORD ONLY"
    groupId is auto-assigned — you do NOT need to add it manually.
    intro_blocks (optional): heading naming the topic of the summary + line of context

11. completion  (inline blanks embedded inside a block of text — LEGACY, prefer summary_completion)
    No "questions" array — use "content" array instead.
    content: alternating text tokens and blank tokens.
    answerRule: e.g. "NO MORE THAN TWO WORDS AND/OR A NUMBER"
    intro_blocks (optional): heading for the completion block
    *** See example below ***

12. table_completion
    PREFERRED: rich format using "rows" → "cells" → segments array.
      Each cell is an array of segments: {"t":"text","content":"..."} or {"t":"blank","id":N,"answer":["word"]}.
      Multiple blanks per cell are supported. "columns" drives the header row.
    LEGACY: "questions" with "row"/"col" per blank (one blank per cell only).
    groupId is auto-assigned — you do NOT need to add it manually.
    answerRule: e.g. "NO MORE THAN TWO WORDS"
    intro_blocks (optional): heading naming what the table is about (e.g. "Comparison of Sleep Stages")

13. diagram_labeling
    TWO variants — use whichever fits the source material:
    PIN variant (x/y coordinates): image + numbered input boxes overlaid at exact positions.
      Use "labels" array with "x", "y" (0–100 percent), and "answer".
    FILL/INLINE variant (no x/y needed): image on left, labelled questions on right.
      Each label's "text": short label → renders as label [___];
                           text with "________" → renders inline with blank embedded.
      Both styles can mix freely in one group.
    image: URL to the diagram/map/plan image.
    groupId is auto-assigned — you do NOT need to add it manually.
    answer: word(s) from the passage
    intro_blocks (optional): heading naming the diagram (e.g. "The Sleep Cycle")

--------------------------------------------------------------
FULL EXAMPLE
--------------------------------------------------------------
{
  "passages": [
    {
      "passage_id": 1,
      "title": "The Science of Sleep",
      "text": "<p>Sleep is a complex biological process...</p><p>During REM sleep...</p>",
      "groups": [

        {
          "type": "true_false_not_given",
          "intro_blocks": [{"type":"heading","text":"Claims about Sleep Science"}],
          "instructions": "Do the following statements agree with the information given in the Reading Passage? Write TRUE if the statement agrees, FALSE if it contradicts, or NOT GIVEN if there is no information.",
          "questions": [
            { "id": 1, "text": "Adults need at least nine hours of sleep per night.", "answer": "FALSE", "paragraphRef": "A" },
            { "id": 2, "text": "REM sleep occurs multiple times in one night.", "answer": "TRUE", "paragraphRef": "B" },
            { "id": 3, "text": "Dreaming has been linked to improved memory.", "answer": "NOT GIVEN" }
          ]
        },

        {
          "type": "yes_no_not_given",
          "intro_blocks": [{"type":"heading","text":"The Writer's Views on Sleep"}],
          "instructions": "Do the following statements agree with the views of the writer? Write YES, NO or NOT GIVEN.",
          "questions": [
            { "id": 4, "text": "The writer believes modern society undervalues sleep.", "answer": "YES", "paragraphRef": "C" },
            { "id": 5, "text": "Technology is the primary cause of sleep disorders.", "answer": "NO", "paragraphRef": "D" }
          ]
        },

        {
          "type": "multiple_choice",
          "intro_blocks": [{"type":"heading","text":"The Role of Deep Sleep"}],
          "instructions": "Choose the correct letter A, B, C or D.",
          "questions": [
            {
              "id": 6,
              "text": "According to the passage, which of the following best describes the role of deep sleep?",
              "answer": "C",
              "options": [
                "A. It helps regulate body temperature.",
                "B. It is when most dreaming occurs.",
                "C. It is essential for physical restoration.",
                "D. It lasts longer than REM sleep."
              ]
            }
          ]
        },

        {
          "type": "multiple_select",
          "intro_blocks": [{"type":"heading","text":"Benefits of Sleep"}],
          "instructions": "Choose TWO letters A–E. Which TWO benefits of sleep are mentioned in the passage?",
          "count": 2,
          "questions": [
            {
              "id": 7,
              "text": "Which TWO benefits of sleep are mentioned?",
              "answer": ["B", "D"],
              "options": [
                "A. Improved eyesight",
                "B. Strengthened immune system",
                "C. Faster reaction times",
                "D. Enhanced memory consolidation",
                "E. Reduced appetite"
              ]
            }
          ]
        },

        {
          "type": "matching_headings",
          "intro_blocks": [{"type":"heading","text":"Paragraph Headings"}],
          "instructions": "The Reading Passage has seven paragraphs A–G. Choose the correct heading for each paragraph from the list below.",
          "options": [
            "i. The evolutionary origins of sleep",
            "ii. How technology disrupts sleep patterns",
            "iii. The stages of a sleep cycle",
            "iv. Cultural attitudes towards napping",
            "v. The role of sleep in memory formation",
            "vi. Consequences of chronic sleep deprivation",
            "vii. Recommended sleep duration by age group"
          ],
          "questions": [
            { "id": 8,  "text": "Paragraph A", "answer": "iii" },
            { "id": 9,  "text": "Paragraph B", "answer": "v"   },
            { "id": 10, "text": "Paragraph C", "answer": "vi"  }
          ]
        },

        {
          "type": "matching_information",
          "intro_blocks": [{"type":"heading","text":"Locating Information in the Passage"}],
          "instructions": "The Reading Passage has six paragraphs A–F. Which paragraph contains the following information? You may use any letter more than once.",
          "options": ["A","B","C","D","E","F"],
          "questions": [
            { "id": 11, "text": "A comparison between sleep patterns in different age groups.", "answer": "B" },
            { "id": 12, "text": "A reference to a specific scientific study on sleep deprivation.", "answer": "E" },
            { "id": 13, "text": "An explanation of why people dream.", "answer": "C" }
          ]
        },

        {
          "type": "matching_features",
          "intro_blocks": [
            {"type":"heading","text":"Sleep Research Findings"},
            {"type":"line","text":"Match each finding to the scientist responsible for it."}
          ],
          "instructions": "Match each research finding with the correct scientist. NB You may use any letter more than once.",
          "options": [
            "A. Dr Sarah Chen",
            "B. Professor James Liu",
            "C. Dr Maria Costa",
            "D. Professor Ahmed Khan"
          ],
          "questions": [
            { "id": 14, "text": "Identified a gene linked to short sleep duration.", "answer": "A" },
            { "id": 15, "text": "Proposed that sleep serves a waste-removal function.", "answer": "C" },
            { "id": 16, "text": "First measured REM sleep in a laboratory setting.", "answer": "B" }
          ]
        },

        {
          "type": "matching_sentence_endings",
          "intro_blocks": [{"type":"heading","text":"Effects of Sleep on Health"}],
          "instructions": "Complete each sentence with the correct ending A–F.",
          "options": [
            "A. is associated with better academic performance.",
            "B. can lead to long-term cardiovascular disease.",
            "C. reduces the effectiveness of vaccines.",
            "D. improves emotional regulation.",
            "E. has no proven effect on metabolism.",
            "F. was first documented in the nineteenth century."
          ],
          "questions": [
            { "id": 17, "text": "Regularly sleeping fewer than six hours per night", "answer": "B" },
            { "id": 18, "text": "Getting sufficient deep sleep each night", "answer": "D" }
          ]
        },

        {
          "type": "sentence_completion",
          "intro_blocks": [
            {"type":"heading","text":"Sleep and Cognitive Performance"},
            {"type":"line","text":"The following sentences are based on research findings described in the passage."}
          ],
          "instructions": "Complete the sentences below. Write NO MORE THAN TWO WORDS from the passage for each answer.",
          "answerRule": "NO MORE THAN TWO WORDS",
          "questions": [
            { "id": 19, "text": "The brain consolidates memories during a phase known as ________.", "answer": "slow-wave sleep", "paragraphRef": "B" },
            { "id": 20, "text": "Researchers found that sleep deprivation impairs ________ more than physical performance.", "answer": "cognitive function", "paragraphRef": "D" }
          ]
        },

        {
          "type": "summary_completion",
          "intro_blocks": [
            {"type":"heading","text":"Sleep Deprivation and the Immune System"},
            {"type":"line","text":"The paragraph below summarises what the passage says about how sleep affects the body's defences."}
          ],
          "instructions": "Complete the summary below. Choose NO MORE THAN ONE WORD from the passage for each answer.",
          "answerRule": "ONE WORD ONLY",
          "questions": [
            { "id": 21, "text": "Sleep deprivation affects the body's ability to produce ________, which fights infection.", "answer": "antibodies" },
            { "id": 22, "text": "The brain's ________ system is activated during deep sleep to remove toxins.", "answer": "glymphatic" }
          ]
        },

        {
          "type": "completion",
          "intro_blocks": [{"type":"heading","text":"Sleep Cycle Facts"}],
          "instructions": "Complete the notes below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER from the passage for each answer.",
          "answerRule": "NO MORE THAN TWO WORDS AND/OR A NUMBER",
          "content": [
            { "type": "text",  "value": "Sleep cycles last approximately " },
            { "type": "blank", "id": "23" },
            { "type": "text",  "value": " minutes and repeat " },
            { "type": "blank", "id": "24" },
            { "type": "text",  "value": " times per night. During REM sleep, the brain shows activity similar to the " },
            { "type": "blank", "id": "25" },
            { "type": "text",  "value": " state." }
          ],
          "questions": [
            { "id": "23", "answer": "90" },
            { "id": "24", "answer": "4 to 6/four to six" },
            { "id": "25", "answer": "waking" }
          ]
        },

        {
          "type": "table_completion",
          "intro_blocks": [{"type":"heading","text":"Comparison of Sleep Stages"}],
          "instructions": "Complete the table below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER from the passage.",
          "answerRule": "NO MORE THAN TWO WORDS AND/OR A NUMBER",
          "columns": ["Sleep Stage", "Brain Wave", "Key Function"],
          "rows": [
            { "cells": [
                [{"t":"text","content":"Stage 1"}],
                [{"t":"blank","id":26,"answer":["alpha waves"]}],
                [{"t":"blank","id":27,"answer":["light sleep"]}]
            ]},
            { "cells": [
                [{"t":"text","content":"Stage 3"}],
                [{"t":"blank","id":28,"answer":["delta waves"]}],
                [{"t":"text","content":"cell repair and "},{"t":"blank","id":29,"answer":["growth hormone"]}]
            ]},
            { "cells": [
                [{"t":"text","content":"REM"}],
                [{"t":"blank","id":30,"answer":["mixed frequency"]}],
                [{"t":"text","content":"memory consolidation"}]
            ]}
          ]
        },

        {
          "type": "diagram_labeling",
          "intro_blocks": [{"type":"heading","text":"The Sleep Cycle"}],
          "instructions": "Label the diagram of the sleep cycle. Write ONE WORD ONLY from the passage.",
          "answerRule": "ONE WORD ONLY",
          "image": "Resources/sleep-cycle.png",
          "labels": [
            { "id": 31, "x": 15, "y": 30, "answer": "light sleep" },
            { "id": 32, "x": 45, "y": 65, "answer": "deep sleep"  },
            { "id": 33, "x": 78, "y": 25, "answer": "REM sleep"   }
          ]
        },

        {
          "type": "diagram_labeling",
          "intro_blocks": [{"type":"heading","text":"How the Brain Induces Sleep"}],
          "instructions": "Complete the diagram labels below. Write ONE WORD ONLY from the passage.",
          "answerRule": "ONE WORD ONLY",
          "image": "Resources/sleep-process.png",
          "labels": [
            { "id": 34, "text": "adenosine",                                        "answer": "adenosine"  },
            { "id": 35, "text": "Brain releases ________ to induce drowsiness",     "answer": "melatonin"  },
            { "id": 36, "text": "core body temperature",                            "answer": "drops"      }
          ]
        }

      ]
    }
  ]
}

==============================================================
  NOTES FOR CHATGPT PROMPT
==============================================================
When asking ChatGPT to generate questions, use this prompt template:

"Generate an IELTS Reading question set for the passage below.
Output valid JSON matching this exact schema. Use question IDs as
consecutive integers starting from [N]. Include a mix of these types:
true_false_not_given, matching_headings, sentence_completion, and
summary_completion. Add intro_blocks to each group where it helps
students understand the context of the questions.
Passage: [paste passage here]"

- INTRO BLOCKS (optional, recommended): Add "intro_blocks" to a group when it helps
  students understand the context of the questions. Use:
    {"type":"heading","text":"..."}     — bold title naming the topic
    {"type":"line","text":"..."}        — one sentence of context when helpful
    {"type":"subheading","text":"..."}  — sub-section title if needed
  Put intro_blocks on the GROUP object, not on individual questions.
  Good uses: name what the questions are about ("Effects of Sleep on Health"),
  briefly indicate which part of the passage the questions relate to, or introduce
  the topic of a summary/sentence completion paragraph.

- For ALL matching types (matching_headings, matching_information, matching_features,
  matching_sentence_endings): Put "options" and "options_heading" on the GROUP object
  (not on individual questions). Format options as "A. text", "B. text". groupId is
  auto-assigned — you do NOT need to add it manually. Options panel is shown ONCE at top.
- For sentence_completion: put "________" (8 underscores) in each question's "text" where
  the blank goes. Sentences render as a list, each with its blank inline. Put "answerRule"
  on the group. groupId is auto-assigned.
- For summary_completion: put "________" (8 underscores) in each question's "text" where
  the blank goes. All sentences are joined into one flowing paragraph on screen.
  Put "answerRule" on the group. groupId is auto-assigned.
- For table_completion: PREFERRED rich format — use "rows" → "cells" → segments.
  Each cell is an array: [{"t":"text","content":"..."},{"t":"blank","id":N,"answer":["word"]}].
  Multiple blanks per cell are supported. "columns" drives the header row.
  LEGACY: "questions" with "row"/"col" still works (one blank per cell only).
  groupId is auto-assigned. Put "answerRule" on the group.
- For diagram_labeling: TWO variants:
  (A) PIN — use "labels" with "x","y" (0–100) for exact overlay positions on image.
  (B) FILL/INLINE — omit "x","y"; use "text" on each label: short label → renders as label+blank;
      text with "________" → blank embedded inline. Image shown left, questions right.
  Both variants: put "answerRule" on the group. groupId is auto-assigned.
- Slash-separated answers are accepted for short/completion types
  e.g. "cost effective/cost-effective"
==============================================================`;

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
  if (t === 'multiple_choice') return 'mcq';
  if (t === 'short_answer')    return 'short';
  if (t === 'map_labeling' || t === 'diagram_labeling' || t === 'plan_labeling') return 'diagram_matching';
  if (t === 'sentence_completion') return 'sentence_completion';
  if (t === 'summary_completion')  return 'summary_completion';
  if (t === 'note_completion')     return 'note_completion';
  return t;
}

function _lsGroupsToFlat(section, si) {
  const flat = [];
  (section.groups || []).forEach((group, gi) => {
    const groupId  = `grp_s${si}_g${gi}_${Date.now()}`;
    const type     = _lsNormalizeType(group.type);
    const isGroup  = ['diagram_matching','flow_chart','table_completion','form_completion','note_completion',
                       'sentence_completion','summary_completion','matching'].includes(type);
    const items    = group.questions || [];
    const answerRule  = group.answer_rule || group.answerRule || '';
    const instruction = group.instruction || '';
    const isMulti     = type === 'multi' || group.multi === true;

    // Blocks+tokens note_completion: { blocks: [...], questions: [{id,answer,start}] }
    if (type === 'note_completion' && group.blocks) {
      (group.questions || []).forEach((q, ii) => {
        const peer = {
          id:            `t_s${si}_g${gi}_${ii}_${Date.now()}`,
          qNum:          q.id,
          type:          'note_completion',
          answer:        Array.isArray(q.answer) ? q.answer[0] : (q.answer || ''),
          questionStart: q.start || 0,
          groupId,
          answerRule:    ii === 0 ? answerRule : '',
        };
        if (ii === 0) peer.noteBlocks = group.blocks;
        flat.push(peer);
      });
      return;  // handled — skip generic items loop below
    }

    // New-format note_completion: { sections: [{heading, lines:[{id,before,after,answer,start}]}] }
    if (type === 'note_completion' && group.sections) {
      let lineIdx = 0;
      group.sections.forEach((sec, _secI) => {
        (sec.lines || []).forEach((line, li) => {
          const ans = Array.isArray(line.answer) ? line.answer[0] : (line.answer || '');
          const q = {
            id:             `t_s${si}_g${gi}_${lineIdx}_${Date.now()}`,
            qNum:           line.id || (flat.length + 1),
            type:           'note_completion',
            before:         line.before != null ? line.before : '',
            after:          line.after  != null ? line.after  : '',
            answer:         ans,
            questionStart:  line.start || 0,
            groupId,
            answerRule:     lineIdx === 0 ? answerRule        : '',
            groupTitle:     lineIdx === 0 ? (group.title || '') : '',
            sectionHeading: li === 0      ? (sec.heading || '') : '',
          };
          flat.push(q);
          lineIdx++;
        });
      });
      return;  // handled — skip generic items loop below
    }

    // Rich table_completion: rows / cells / segments
    if (type === 'table_completion' && group.rows) {
      let bi = 0;
      group.rows.forEach(row => {
        (row.cells || []).forEach(cell => {
          (cell || []).forEach(seg => {
            if (seg.t !== 'blank') return;
            const ans = Array.isArray(seg.answer) ? seg.answer[0] : (seg.answer || '');
            const q = {
              id:            `t_s${si}_g${gi}_b${bi}_${Date.now()}`,
              qNum:          seg.id,
              type:          'table_completion',
              text:          '',
              answer:        ans,
              questionStart: seg.start || 0,
              groupId,
              answerRule:    bi === 0 ? answerRule  : '',
              instruction:   bi === 0 ? instruction : '',
            };
            if (bi === 0) {
              q.tableRows    = group.rows;
              q.tableColumns = group.columns || [];
              if (group.intro_blocks && group.intro_blocks.length) q.introBlocks = group.intro_blocks;
            }
            flat.push(q);
            bi++;
          });
        });
      });
      return;  // handled
    }

    items.forEach((item, ii) => {
      const ans = Array.isArray(item.answer) ? item.answer[0] : (item.answer || '');
      const q = {
        id:            `t_s${si}_g${gi}_${ii}_${Date.now()}`,
        qNum:          item.id || (flat.length + 1),
        type:          isMulti ? 'multi' : type,
        text:          item.label || item.text || '',
        answer:        isMulti ? (Array.isArray(item.answer) ? item.answer.join(', ') : ans) : ans,
        questionStart: item.start || 0,
        options: group.options || item.options || [],
        count:   group.count  || item.count  || 1,
      };
      if (isGroup) q.groupId = groupId;
      if (answerRule)  q.answerRule  = answerRule;
      if (instruction) q.instruction = ii === 0 ? instruction : '';  // only first in group
      if (ii === 0 && group.intro_blocks && group.intro_blocks.length) q.introBlocks = group.intro_blocks;
      if (type === 'matching' && ii === 0) {
        q.optionsHeading = group.options_heading || group.optionsHeading || '';
        q.matchQuestion  = group.question || '';
      }
      if (type === 'diagram_matching' && ii === 0) {
        q.groupImage    = group.image                                   || '';
        q.optionsRange  = group.options_range  || group.optionsRange   || '';
        q.options       = group.options        || [];
        q.matchQuestion = group.question       || '';
        q.matchType     = group.match_type     || group.matchType      || 'select';
      }
      if (type === 'flow_chart')       { q.nodeNum = item.node || (ii + 1); q.prefix = item.prefix || ''; q.suffix = item.suffix || ''; }
      if (type === 'table_completion') { q.rowContext = item.row || ''; q.colContext = item.col || ''; q.groupColumns = group.columns || []; }
      // Token-based sentence/summary/diagram-inline: propagate tokens array if present on item
      if ((type === 'sentence_completion' || type === 'summary_completion' ||
           type === 'diagram_matching') && item.tokens) {
        q.tokens = item.tokens;
      }
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

  _persistSection(_aPkg, _aTest, 'listening', data);
  _applyListeningEditorState(data);
  showToast(`Imported and saved ${flatQs.length} question(s)${replaceAll ? ' (replaced all)' : ''}.`);
}

/**
 * Import all 4 sections from a full-test JSON: { "sections": [{...}, ...] }
 * section_id is 1-based in the JSON; falls back to array position if absent.
 */
function adminImportListeningSection(parsed, replaceAll) {
  const incoming = parsed.sections;
  if (!incoming || !incoming.length) { showToast('No sections found.'); return; }
  const data = replaceAll ? null : _collectListeningData();
  let base;
  if (replaceAll) {
    // Build a fresh 4-section skeleton
    base = { sections: Array.from({ length: 4 }, (_, i) => ({
      id: `s${i}`, title: '', audioUrl: '', transcript: '', questions: [], groups: [], ranges: []
    })) };
  } else {
    base = data;
  }
  let totalQs = 0;
  incoming.forEach((sec, idx) => {
    const si = (sec.section_id != null) ? sec.section_id - 1 : idx;
    if (si < 0 || si > 3) return;  // guard — only 4 parts
    const flatQs = _lsGroupsToFlat(sec, si);
    totalQs += flatQs.length;
    if (replaceAll) {
      base.sections[si].questions = flatQs;
    } else {
      base.sections[si].questions.push(...flatQs);
    }
    base.sections[si].groups = sec.groups || [];
    base.sections[si].ranges = sec.ranges || [];
    if (sec.title)      base.sections[si].title     = sec.title;
    if (sec.audio_url)  base.sections[si].audioUrl  = sec.audio_url;
    if (sec.transcript) base.sections[si].transcript = sec.transcript;
  });
  _persistSection(_aPkg, _aTest, 'listening', base);
  _applyListeningEditorState(base);
  showToast(`Imported and saved ${incoming.length} section(s), ${totalQs} question(s)${replaceAll ? ' (replaced all)' : ''}.`);
}

/* ── JSON export ──────────────────────────────────────────────── */

/**
 * Convert a flat questions array back to the structured ChatGPT-friendly JSON format.
 * @param {Array}  questions - flat question array from _collectListeningData
 * @param {number} si        - section index (0-based)
 * @param {Object} secMeta   - { title, audioUrl } for the section header
 */
function _lsFlatToGroups(questions, si, secMeta) {
  si = si || 0;
  secMeta = secMeta || {};
  const groups = [];
  const seen   = new Set();

  // Process questions in order, grouping by groupId
  questions.forEach(q => {
    if (seen.has(q.id)) return;

    if (q.groupId) {
      // Collect all peers of this group (in order, already seen filtered)
      const peers = questions.filter(p => p.groupId === q.groupId);
      peers.forEach(p => seen.add(p.id));

      const type = q.type;
      const grp  = { type };
      if (q.answerRule) grp.answer_rule = q.answerRule;
      if (q.instruction) grp.instruction = q.instruction;

      if (type === 'diagram_matching') {
        if (peers[0].groupImage)    grp.image         = peers[0].groupImage;
        if (peers[0].matchType)     grp.match_type    = peers[0].matchType;
        if (peers[0].optionsRange)  grp.options_range = peers[0].optionsRange;
        else if (peers[0].options && peers[0].options.length) grp.options = peers[0].options;
        if (peers[0].matchQuestion) grp.question      = peers[0].matchQuestion;
        grp.questions = peers.map(p => ({ id: p.qNum, text: p.text || '', answer: [p.answer || ''], start: p.questionStart || 0 }));
      } else if (type === 'flow_chart') {
        grp.questions = peers.map(p => ({
          id: p.qNum, node: p.nodeNum || 1,
          prefix: p.prefix || '', answer: [p.answer || ''], suffix: p.suffix || '',
          start: p.questionStart || 0
        }));
      } else if (type === 'table_completion') {
        // Reconstruct columns from unique colContext values
        const colSet = [];
        peers.forEach(p => { if (p.colContext && !colSet.includes(p.colContext)) colSet.push(p.colContext); });
        grp.columns   = colSet;
        grp.questions = peers.map(p => ({
          id: p.qNum, row: p.rowContext || '', col: p.colContext || '',
          answer: [p.answer || ''], start: p.questionStart || 0
        }));
      } else if (type === 'matching') {
        grp.options   = peers[0].options || [];
        if (peers[0].optionsHeading) grp.options_heading = peers[0].optionsHeading;
        grp.questions = peers.map(p => ({ id: p.qNum, text: p.text || '', answer: [p.answer || ''], start: p.questionStart || 0 }));
      } else if (type === 'mcq') {
        grp.questions = peers.map(p => ({
          id: p.qNum, text: p.text || '', options: p.options || [],
          answer: [p.answer || ''], start: p.questionStart || 0
        }));
      } else if (type === 'multi') {
        grp.multi     = true;
        grp.count     = peers[0].count || 2;
        grp.questions = peers.map(p => ({
          id: p.qNum, text: p.text || '', options: p.options || [],
          answer: Array.isArray(p.answer) ? p.answer : (p.answer ? p.answer.split(',').map(s=>s.trim()) : []),
          start: p.questionStart || 0
        }));
      } else if (type === 'sentence_completion' && peers[0].tokens && peers[0].tokens.length) {
        grp.questions = peers.map(p => ({
          id: p.qNum, tokens: p.tokens, answer: [p.answer || ''], start: p.questionStart || 0
        }));
      } else if (type === 'note_completion' && peers[0].noteBlocks) {
        grp.blocks    = peers[0].noteBlocks;
        grp.questions = peers.map(p => ({
          id: p.qNum, answer: p.answer || '', start: p.questionStart || 0
        }));
      } else if (type === 'note_completion' && peers[0].before != null) {
        // New inline format: reconstruct sections from sectionHeading markers
        grp.title = peers[0].groupTitle || '';
        grp.sections = [];
        let currentSection = null;
        peers.forEach(p => {
          if (p.sectionHeading || currentSection === null) {
            currentSection = { heading: p.sectionHeading || '', lines: [] };
            grp.sections.push(currentSection);
          }
          currentSection.lines.push({
            id:     p.qNum,
            before: p.before || '',
            after:  p.after  || '',
            answer: p.answer || '',
            start:  p.questionStart || 0,
          });
        });
      } else {
        // form_completion, note_completion (legacy), sentence_completion (label), summary_completion
        grp.questions = peers.map(p => ({ id: p.qNum, label: p.text || '', answer: [p.answer || ''], start: p.questionStart || 0 }));
      }
      groups.push(grp);

    } else {
      // Standalone question
      seen.add(q.id);
      const grp = { type: q.type };
      if (q.answerRule) grp.answer_rule = q.answerRule;
      if (q.instruction) grp.instruction = q.instruction;
      if (q.type === 'mcq') {
        grp.questions = [{ id: q.qNum, text: q.text || '', options: q.options || [], answer: [q.answer || ''], start: q.questionStart || 0 }];
      } else if (q.type === 'multi') {
        grp.multi = true; grp.count = q.count || 2;
        grp.questions = [{ id: q.qNum, text: q.text || '', options: q.options || [],
          answer: Array.isArray(q.answer) ? q.answer : (q.answer ? q.answer.split(',').map(s=>s.trim()) : []),
          start: q.questionStart || 0 }];
      } else if (q.type === 'matching') {
        grp.options = q.options || [];
        grp.questions = [{ id: q.qNum, text: q.text || '', answer: [q.answer || ''], start: q.questionStart || 0 }];
      } else {
        grp.questions = [{ id: q.qNum, label: q.text || '', answer: [q.answer || ''], start: q.questionStart || 0 }];
      }
      groups.push(grp);
    }
  });

  return {
    sections: [{
      section_id: si + 1,
      title:      secMeta.title    || '',
      audio_url:  secMeta.audioUrl || '',
      groups
    }]
  };
}

function adminExportListeningJSON(si) {
  const data = _collectListeningData();
  const sec  = data.sections[si];
  const json = _lsFlatToGroups(sec.questions, si, sec);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `listening_part${si + 1}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Part ${si + 1} exported.`);
}

function adminCopyListeningJSON(si) {
  const data = _collectListeningData();
  const sec  = data.sections[si];
  const json = _lsFlatToGroups(sec.questions, si, sec);
  navigator.clipboard.writeText(JSON.stringify(json, null, 2))
    .then(() => showToast('JSON copied to clipboard.'))
    .catch(() => showToast('Copy failed — try Export instead.'));
}

/* ── Live JSON editor ─────────────────────────────────────────── */
const _lsJsonDebounce = {};
let   _lsJsonApplying = false;

function _lsJsonOnInput(si) {
  clearTimeout(_lsJsonDebounce[si]);
  _lsJsonDebounce[si] = setTimeout(() => _lsJsonApplyLive(si), 350);
}

function _lsJsonApplyLive(si) {
  const ta    = document.getElementById(`ls-json-live-${si}`);
  const errEl = document.getElementById(`ls-json-error-${si}`);
  if (!ta || !errEl) return;
  const raw = ta.value.trim();
  if (!raw) return;
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) {
    errEl.className = 'ls-json-error';
    errEl.textContent = 'JSON error: ' + e.message;
    errEl.style.display = '';
    return;
  }
  const section = parsed.groups ? parsed : (parsed.sections ? (parsed.sections[0] || null) : null);
  if (!section) {
    errEl.className = 'ls-json-warn';
    errEl.textContent = 'Must have "sections" or "groups" at the top level.';
    errEl.style.display = '';
    return;
  }
  const flat = _lsGroupsToFlat(section, si);
  if (!flat.length) {
    errEl.className = 'ls-json-warn';
    errEl.textContent = 'Valid JSON — no questions found yet. Keep typing…';
    errEl.style.display = '';
    return;
  }
  errEl.style.display = 'none';
  _lsJsonApplying = true;
  const data = _collectListeningData();
  data.sections[si].questions = flat;
  if (section.title && !data.sections[si].title) data.sections[si].title = section.title;
  if (section.audio_url && !data.sections[si].audioUrl) data.sections[si].audioUrl = section.audio_url;
  _applyListeningEditorState(data);
  // Re-select the JSON tab (applyListeningEditorState rebuilds the whole editor)
  setTimeout(() => { adminSwitchLsMode(si, 'json'); _lsJsonApplying = false; }, 0);
}

function _lsJsonRefreshEditor(si) {
  if (_lsJsonApplying) return;
  const ta = document.getElementById(`ls-json-live-${si}`);
  if (!ta) return;
  const data = _collectListeningData();
  const sec  = data.sections[si];
  const json = _lsFlatToGroups(sec.questions, si, sec);
  ta.value = JSON.stringify(json, null, 2);
}

/* ── Preview renderer for admin ───────────────────────────────── */
function _lsRenderAdminPreview(si) {
  const container = document.getElementById(`ls-preview-content-${si}`);
  if (!container) return;
  const data = _collectListeningData();
  const sec  = data.sections[si];
  if (!sec.questions.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No questions yet.</p>';
    return;
  }
  // Temporarily populate appState for the renderer
  const prevQs  = appState.test ? appState.test.flatQuestions : [];
  const prevAns = appState.test ? appState.test.answers : {};
  if (!appState.test) appState.test = {};
  appState.test.flatQuestions = sec.questions;
  appState.test.answers       = appState.test.answers || {};

  const rendered = new Set();
  const cards    = [];
  sec.questions.forEach((q, idx) => {
    if (rendered.has(q.id)) return;
    if (q.groupId) {
      const peers = sec.questions.filter(p => p.groupId === q.groupId);
      peers.forEach(p => rendered.add(p.id));
      // Only render once per group
    }
    rendered.add(q.id);
    cards.push(lsRenderGroup ? lsRenderGroup(q, idx) : '');
  });
  container.innerHTML = cards.join('') || '<p style="color:var(--text-muted);font-style:italic;">Nothing to preview.</p>';

  // Restore appState
  appState.test.flatQuestions = prevQs;
  appState.test.answers       = prevAns;
}

/* ── Mode switch (Edit / Preview / JSON) ──────────────────────── */
function adminSwitchLsMode(si, mode) {
  const editPane    = document.getElementById(`ls-edit-${si}`);
  const previewPane = document.getElementById(`ls-preview-${si}`);
  const jsonPane    = document.getElementById(`ls-json-pane-${si}`);
  const tabs        = document.querySelectorAll(`#ls-part-${si} .ls-mode-tab`);
  if (!editPane) return;

  editPane.style.display    = mode === 'edit'    ? '' : 'none';
  if (previewPane) previewPane.style.display = mode === 'preview' ? '' : 'none';
  if (jsonPane)    jsonPane.style.display    = mode === 'json'    ? '' : 'none';

  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));

  if (mode === 'preview') _lsRenderAdminPreview(si);
  if (mode === 'json')    _lsJsonRefreshEditor(si);
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
        <!-- Edit / Preview / JSON tabs -->
        <div class="ls-editor-mode-tabs">
          <button class="ls-mode-tab active" data-mode="edit"    onclick="adminSwitchLsMode(${si},'edit')">&#9998; Edit</button>
          <button class="ls-mode-tab"        data-mode="preview" onclick="adminSwitchLsMode(${si},'preview')">&#128065; Preview</button>
          <button class="ls-mode-tab"        data-mode="json"    onclick="adminSwitchLsMode(${si},'json')">&#123;&#125; JSON</button>
        </div>

        <!-- EDIT PANE -->
        <div id="ls-edit-${si}">
          <div id="ls-qs-${si}">
            ${sec.questions.map((q, qi) => _buildListeningQuestionRow(si, qi, q)).join('')}
          </div>
          <button class="btn btn-sm btn-outline admin-add-btn"
            onclick="adminAddListeningQ(${si})">+ Add Question</button>
        </div>

        <!-- PREVIEW PANE -->
        <div id="ls-preview-${si}" style="display:none">
          <div class="ls-admin-preview-wrap" id="ls-preview-content-${si}">
            <p style="color:var(--text-muted);font-style:italic;">Switch to Preview to see student view.</p>
          </div>
        </div>

        <!-- JSON PANE -->
        <div id="ls-json-pane-${si}" style="display:none">
          <div id="ls-json-error-${si}" class="ls-json-error" style="display:none"></div>
          <textarea id="ls-json-live-${si}" class="admin-textarea ls-json-textarea"
            rows="16" spellcheck="false"
            oninput="_lsJsonOnInput(${si})"
            placeholder='{"sections":[{"section_id":${si+1},"groups":[...]}]}'></textarea>
          <div class="ls-json-pane-actions">
            <button class="btn btn-sm btn-outline" onclick="adminCopyListeningJSON(${si})">&#128203; Copy JSON</button>
            <button class="btn btn-sm btn-primary" onclick="adminExportListeningJSON(${si})">&#8675; Export .json</button>
          </div>
        </div>
      </div>
    </div>`
  ).join('');

  return `
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
  ['short',               'Short Answer (fill blank)'],
  ['mcq',                 'MCQ – Single Choice'],
  ['tfng',                'True / False / Not Given'],
  ['multi',               'MCQ – Multiple Choice'],
  ['matching',            'Matching (paragraph)'],
  ['form_completion',     'Form Completion'],
  ['note_completion',     'Note Completion'],
  ['sentence_completion', 'Sentence Completion'],
  ['summary_completion',  'Summary Completion'],
  ['table_completion',    'Table Completion'],
  ['diagram_matching',    'Diagram Matching (image + dropdowns)'],
  ['flow_chart',          'Flow Chart'],
];
const _LS_GROUP_TYPES = ['diagram_matching','flow_chart','table_completion','form_completion','note_completion','sentence_completion','summary_completion'];

function _buildListeningQuestionRow(si, qi, q) {
  const type    = q.type || 'short';
  const qNum    = q.qNum != null ? q.qNum : '';
  const text    = q.text || '';
  const answer  = Array.isArray(q.answer) ? q.answer.join(', ') : (q.answer || '');
  const count   = q.count || 2;
  const options = q.options || [];

  const typeOpts = _LS_ALL_TYPES.map(([t, label]) =>
    `<option value="${t}"${t === type ? ' selected' : ''}>${label}</option>`).join('');

  const textLabel = type === 'diagram_matching'  ? 'Row Label'
                  : type === 'flow_chart'         ? 'Description (optional)'
                  : type === 'table_completion'   ? 'Description (optional)'
                  : 'Question Text / Blank Label';

  const answerHint = type === 'tfng'      ? ' (TRUE / FALSE / NG)'
                   : type === 'multi'     ? ' (e.g. B, E)'
                   : type === 'mcq'       ? ' (e.g. B)'
                   : type === 'matching'  ? ' (e.g. D)'
                   : '';

  const optionsSection = (type === 'mcq' || type === 'multi' || type === 'matching' || type === 'diagram_matching') ? `
    ${(type === 'matching' || type === 'diagram_matching') ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Goal Text <small style="color:var(--text-muted);">(e.g. "Complete the timetable.")</small></label>
      <input class="admin-input" id="ls-matchq-${si}-${qi}" value="${_esc(q.matchQuestion||'')}" placeholder="e.g. Complete the timetable.">
    </div>` : ''}
    ${type === 'diagram_matching' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Options Range <small style="color:var(--text-muted);">(e.g. "A-J" — auto-expands; or leave blank and list below)</small></label>
      <input class="admin-input" id="ls-optrange-${si}-${qi}" value="${_esc(q.optionsRange||'')}" placeholder="e.g. A-J">
    </div>` : ''}
    ${type === 'matching' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Options Heading <small style="color:var(--text-muted);">(e.g. "Events in the history of football")</small></label>
      <input class="admin-input" id="ls-opthead-${si}-${qi}" value="${_esc(q.optionsHeading||'')}" placeholder="e.g. Events in the history of football">
    </div>` : ''}
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Options (one per line${type === 'matching' ? ' — e.g. "A. the introduction of pay for players"' : ''})</label>
      <textarea class="admin-textarea" id="ls-opts-${si}-${qi}" rows="5"
        placeholder="${type === 'matching' ? 'A. description&#10;B. description&#10;C. description' : 'Option A&#10;Option B&#10;...'}">${_esc(options.join('\n'))}</textarea>
    </div>` : '';

  const countSection = type === 'multi' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Number of correct answers</label>
      <input class="admin-input" style="max-width:80px;" id="ls-count-${si}-${qi}" type="number"
        min="1" max="5" value="${count}">
    </div>` : '';

  const graphicSection = type === 'diagram_matching' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Diagram Image</label>
      <div class="diag-upload-row">
        <input class="admin-input" id="ls-img-${si}-${qi}" value="${_esc(q.groupImage||'')}"
          placeholder="Paste URL, or upload ↓">
        <input type="file" id="ls-img-file-${si}-${qi}" accept="image/*" style="display:none"
          onchange="adminLsUploadImage(${si},${qi},this)">
        <button class="btn btn-sm btn-outline" type="button"
          onclick="document.getElementById('ls-img-file-${si}-${qi}').click()">&#8679; Upload</button>
      </div>
      <div id="ls-img-preview-${si}-${qi}" style="margin-top:0.4rem;">
        ${q.groupImage ? `<img src="${_esc(q.groupImage)}" class="diag-img-preview" alt="Preview" style="max-height:80px;border-radius:4px;">` : ''}
      </div>
    </div>` : '';

  const tableSection = type === 'table_completion' ? (q.tableRows ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Table Rows JSON <small style="color:var(--text-muted);">(rich format — first question carries full layout)</small></label>
      <textarea class="admin-input admin-textarea" id="ls-tablerows-${si}-${qi}" rows="4"
        style="font-family:monospace;font-size:0.78rem;white-space:pre;">${_esc(JSON.stringify(q.tableRows, null, 2))}</textarea>
    </div>
    <div class="admin-field-row" style="margin-top:0.25rem;">
      <label class="admin-label">Table Columns (JSON array)</label>
      <input class="admin-input" id="ls-tablecols-${si}-${qi}"
        value="${_esc(JSON.stringify(q.tableColumns || []))}" placeholder='e.g. ["Subject","Description"]'>
    </div>` : `
    <div class="admin-vocab-grid" style="margin-top:0.5rem;">
      <div class="admin-field-row">
        <label class="admin-label">Row label</label>
        <input class="admin-input" id="ls-row-${si}-${qi}" value="${_esc(q.rowContext||'')}" placeholder="e.g. Swimming">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Column</label>
        <input class="admin-input" id="ls-col-${si}-${qi}" value="${_esc(q.colContext||'')}" placeholder="e.g. Day">
      </div>
    </div>`) : '';

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

  // Note completion: blocks+tokens format shows a JSON textarea; old format shows before/after/heading fields
  const noteSection = type === 'note_completion' ? (q.noteBlocks ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Blocks JSON <small style="color:var(--text-muted);">(blocks+tokens document — first question carries the full layout)</small></label>
      <textarea class="admin-input admin-textarea" id="ls-noteblocks-${si}-${qi}" rows="6"
        style="font-family:monospace;font-size:0.78rem;white-space:pre;">${_esc(JSON.stringify(q.noteBlocks, null, 2))}</textarea>
    </div>` : `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Note Title <small style="color:var(--text-muted);">(set on first question only, e.g. "Advice on Family Visit")</small></label>
      <input class="admin-input" id="ls-notetitle-${si}-${qi}" value="${_esc(q.groupTitle||'')}" placeholder="e.g. Advice on Family Visit">
    </div>
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Section Heading <small style="color:var(--text-muted);">(set on first line of each section, e.g. "Accommodation")</small></label>
      <input class="admin-input" id="ls-notesec-${si}-${qi}" value="${_esc(q.sectionHeading||'')}" placeholder="e.g. Accommodation">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.5rem;">
      <div class="admin-field-row">
        <label class="admin-label">Text <em>before</em> blank</label>
        <input class="admin-input" id="ls-before-${si}-${qi}" value="${_esc(q.before||'')}" placeholder="e.g. A trip by">
      </div>
      <div class="admin-field-row">
        <label class="admin-label">Text <em>after</em> blank</label>
        <input class="admin-input" id="ls-after-${si}-${qi}" value="${_esc(q.after||'')}" placeholder="e.g. to the old fort">
      </div>
    </div>`) : '';

  // Generic text field — hidden for note_completion (replaced by before/after above)
  const textSection = type !== 'note_completion' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">${textLabel}</label>
      <input class="admin-input" id="ls-text-${si}-${qi}"
        value="${_esc(text)}" placeholder="${type === 'diagram_matching' ? 'Row label (e.g. Teacher-led discussion)' : 'Question text'}">
    </div>` : `<input type="hidden" id="ls-text-${si}-${qi}" value="">`;

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
      ${textSection}
      ${noteSection}
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Answer${answerHint}</label>
        <input class="admin-input" id="ls-ans-${si}-${qi}"
          value="${_esc(answer)}" placeholder="Correct answer">
      </div>
      ${optionsSection}${countSection}${graphicSection}${tableSection}${flowSection}${groupIdSection}
      ${q.introBlocks ? `
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Intro Blocks JSON <small style="color:var(--text-muted);">(display-only content before questions — first question only)</small></label>
        <textarea class="admin-input admin-textarea" id="ls-introblocks-${si}-${qi}" rows="4"
          style="font-family:monospace;font-size:0.78rem;white-space:pre;">${_esc(JSON.stringify(q.introBlocks, null, 2))}</textarea>
      </div>` : ''}
      <div class="admin-field-row" style="margin-top:0.5rem;">
        <label class="admin-label">Answer Rule <small style="color:var(--text-muted);">(optional — e.g. NO MORE THAN TWO WORDS)</small></label>
        <input class="admin-input" id="ls-ansrule-${si}-${qi}" value="${_esc(q.answerRule||'')}" placeholder="e.g. NO MORE THAN TWO WORDS AND/OR A NUMBER">
      </div>
      <div class="admin-field-row ls-timestamp-row" style="margin-top:0.5rem;">
        <label class="admin-label">Question Start <small style="color:var(--text-muted);">(seconds into audio)</small></label>
        <div style="display:flex;gap:0.4rem;align-items:center;">
          <input class="admin-input" type="number" min="0" step="1" style="max-width:100px;"
            id="ls-qstart-${si}-${qi}" value="${q.questionStart != null ? Math.round(q.questionStart) : (q.start != null ? Math.round(q.start) : '')}">
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
function adminRefreshListeningQ(_si, _qi) {
  const data = _collectListeningData();
  _applyListeningEditorState(data);
}
function _applyListeningEditorState(data) {
  const editor = document.getElementById('adminEditor');
  if (!editor) return;
  editor.innerHTML = _buildListeningEditor(data);
  _adminSetDirty();
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
      const groupId       = _val(`ls-grpid-${si}-${qi}`);
      const optionsHeading = type === 'matching' ? _val(`ls-opthead-${si}-${qi}`) : undefined;
      const matchQuestion  = (type === 'matching' || type === 'diagram_matching') ? _val(`ls-matchq-${si}-${qi}`)  : undefined;
      const groupImage   = _val(`ls-img-${si}-${qi}`);
      const optionsRange = type === 'diagram_matching' ? _val(`ls-optrange-${si}-${qi}`) : undefined;
      const rowContext  = _val(`ls-row-${si}-${qi}`);
      const colContext  = _val(`ls-col-${si}-${qi}`);
      // Rich table_completion: read back tableRows/tableColumns if present
      let tableRows = undefined, tableColumns = undefined;
      if (type === 'table_completion') {
        const trEl = document.getElementById(`ls-tablerows-${si}-${qi}`);
        if (trEl && trEl.value.trim()) {
          try { tableRows = JSON.parse(trEl.value); } catch { tableRows = undefined; }
        }
        const tcEl = document.getElementById(`ls-tablecols-${si}-${qi}`);
        if (tcEl && tcEl.value.trim()) {
          try { tableColumns = JSON.parse(tcEl.value); } catch { tableColumns = undefined; }
        }
      }
      const nodeNum    = parseInt(_val(`ls-node-${si}-${qi}`)) || 0;
      const prefix     = _val(`ls-prefix-${si}-${qi}`);
      const suffix     = _val(`ls-suffix-${si}-${qi}`);
      const answerRule = _val(`ls-ansrule-${si}-${qi}`);
      const qsRaw = _val(`ls-qstart-${si}-${qi}`);
      const questionStart = qsRaw !== '' ? parseInt(qsRaw, 10) : NaN;
      // intro_blocks: display-only content before questions (any group type, first question only)
      let introBlocks = undefined;
      const ibEl = document.getElementById(`ls-introblocks-${si}-${qi}`);
      if (ibEl && ibEl.value.trim()) {
        try { introBlocks = JSON.parse(ibEl.value); } catch { introBlocks = undefined; }
      }
      // Note completion: blocks+tokens format uses a noteBlocks textarea; old format uses before/after/heading fields
      let noteBlocks = undefined, before = undefined, after = undefined, sectionHeading = undefined, groupTitle = undefined;
      if (type === 'note_completion') {
        const nbEl = document.getElementById(`ls-noteblocks-${si}-${qi}`);
        if (nbEl) {
          try { noteBlocks = JSON.parse(nbEl.value); } catch { noteBlocks = undefined; }
        } else {
          before         = _val(`ls-before-${si}-${qi}`);
          after          = _val(`ls-after-${si}-${qi}`);
          sectionHeading = _val(`ls-notesec-${si}-${qi}`);
          groupTitle     = _val(`ls-notetitle-${si}-${qi}`);
        }
      }

      questions.push({
        id: `t_s${si}_q${qi}`,
        qNum: parsedNum,
        type,
        text,
        answer,
        ...(options.length ? { options } : {}),
        ...(type === 'multi' ? { count } : {}),
        ...(groupId    ? { groupId }    : {}),
        ...(groupImage   ? { groupImage }   : {}),
        ...(optionsRange != null ? { optionsRange } : {}),
        ...(rowContext  ? { rowContext } : {}),
        ...(colContext  ? { colContext } : {}),
        ...(nodeNum     ? { nodeNum }    : {}),
        ...(prefix      ? { prefix }     : {}),
        ...(suffix      ? { suffix }     : {}),
        ...(answerRule  ? { answerRule } : {}),
        ...(questionStart >= 0 && !isNaN(questionStart) ? { questionStart } : {}),
        // Intro blocks (display-only content before questions)
        ...(introBlocks  != null ? { introBlocks }  : {}),
        // Rich table_completion fields
        ...(tableRows    != null ? { tableRows }    : {}),
        ...(tableColumns != null ? { tableColumns } : {}),
        // Note completion fields (undefined for other types → not serialised)
        ...(noteBlocks     != null ? { noteBlocks }     : {}),
        ...(before         != null ? { before }         : {}),
        ...(after          != null ? { after }          : {}),
        ...(sectionHeading != null ? { sectionHeading } : {}),
        ...(groupTitle     != null ? { groupTitle }     : {}),
        ...(optionsHeading != null ? { optionsHeading } : {}),
        ...(matchQuestion  != null ? { matchQuestion }  : {}),
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
   READING — JSON / PREVIEW HELPERS
   ============================================================== */

/* Convert flat reading questions back to the group JSON format for export / live editor */
function _rdFlatToGroups(questions) {
  const typeNameMap = {
    mcq: 'multiple_choice', multi: 'multiple_select',
    tfng: 'true_false_not_given', ynng: 'yes_no_not_given',
    matching_headings: 'matching_headings', matching_information: 'matching_information',
    matching_features: 'matching_features', matching_sentence_endings: 'matching_sentence_endings',
    sentence_completion: 'sentence_completion', summary_completion: 'summary_completion',
    table_completion: 'table_completion', diagram_labeling: 'diagram_labeling',
    short: 'short_answer', completion: 'completion',
  };
  const groups = [];
  const seen = new Set();

  questions.forEach(q => {
    if (seen.has(String(q.id))) return;
    seen.add(String(q.id));

    const type = q.type;
    const exportType = typeNameMap[type] || type;

    if (q.groupId) {
      const peers = questions.filter(p => p.groupId === q.groupId);
      peers.forEach(p => seen.add(String(p.id)));

      const grp = { type: exportType };
      if (peers[0].instructions) grp.instructions  = peers[0].instructions;
      if (peers[0].answerRule)   grp.answer_rule    = peers[0].answerRule;
      if (peers[0].introBlocks && peers[0].introBlocks.length) grp.intro_blocks = peers[0].introBlocks;

      if (type === 'table_completion' && peers[0].tableRows) {
        grp.columns = peers[0].tableColumns || [];
        grp.rows    = peers[0].tableRows;
      } else if (type === 'table_completion') {
        grp.columns   = [...new Set(peers.map(p => p.colContext).filter(Boolean))];
        grp.questions = peers.map(p => ({
          id: p.id, row: p.rowContext || '', col: p.colContext || '',
          answer: p.answer ? [p.answer] : [],
        }));
      } else if (type === 'diagram_labeling') {
        grp.image = peers[0].groupImage || '';
        const hasPins = peers.some(p => p.xPct || p.yPct);
        grp.labels = peers.map(p => {
          const lbl = { id: p.id, answer: p.answer ? [p.answer] : [] };
          if (hasPins) { lbl.x = p.xPct || 0; lbl.y = p.yPct || 0; }
          else { lbl.text = p.text || ''; }
          return lbl;
        });
      } else {
        if (peers[0].options && peers[0].options.length) grp.options = peers[0].options;
        if (peers[0].optionsHeading) grp.options_heading = peers[0].optionsHeading;
        grp.questions = peers.map(p => {
          const item = { id: p.id, answer: p.answer || '' };
          if (p.text)         item.text         = p.text;
          if (p.paragraphRef) item.paragraphRef  = p.paragraphRef;
          return item;
        });
      }
      groups.push(grp);
    } else {
      // Ungrouped question
      const grp = { type: exportType };
      if (q.instructions) grp.instructions = q.instructions;
      if (q.count)        grp.count        = q.count;
      if (q.options && q.options.length) grp.options = q.options;
      if (q.answerRule)   grp.answer_rule  = q.answerRule;
      const item = { id: q.id, answer: q.answer || '' };
      if (q.text)         item.text         = q.text;
      if (q.paragraphRef) item.paragraphRef  = q.paragraphRef;
      grp.questions = [item];
      groups.push(grp);
    }
  });
  return { groups };
}

function adminCopyReadingJSON(pi) {
  const data = _collectReadingData();
  const qs   = (data.passages[pi] && data.passages[pi].questions) || [];
  navigator.clipboard.writeText(JSON.stringify(_rdFlatToGroups(qs), null, 2))
    .then(() => showToast('JSON copied to clipboard.'))
    .catch(() => showToast('Copy failed — try Export instead.'));
}

function adminExportReadingJSON(pi) {
  const data = _collectReadingData();
  const p    = data.passages[pi] || {};
  const json = { passage_id: pi + 1, title: p.title || '', groups: _rdFlatToGroups(p.questions || []).groups };
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `reading_passage${pi + 1}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast(`Passage ${pi + 1} exported.`);
}

function _rdJsonRefreshEditor(pi) {
  if (_rdJsonApplying) return;
  const ta = document.getElementById(`rd-json-live-${pi}`);
  if (!ta) return;
  const data = _collectReadingData();
  const qs   = (data.passages[pi] && data.passages[pi].questions) || [];
  ta.value = JSON.stringify(_rdFlatToGroups(qs), null, 2);
}

const _rdJsonDebounce = {};
let   _rdJsonApplying = false;

function _rdJsonOnInput(pi) {
  clearTimeout(_rdJsonDebounce[pi]);
  _rdJsonDebounce[pi] = setTimeout(() => _rdJsonApplyLive(pi), 350);
}

function _rdJsonApplyLive(pi) {
  const ta    = document.getElementById(`rd-json-live-${pi}`);
  const errEl = document.getElementById(`rd-json-error-${pi}`);
  if (!ta || !errEl) return;
  const raw = ta.value.trim();
  if (!raw) return;
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) {
    errEl.className = 'ls-json-error'; errEl.textContent = 'JSON error: ' + e.message;
    errEl.style.display = ''; return;
  }
  const passage = parsed.groups ? parsed : (parsed.passages ? (parsed.passages[0] || null) : null);
  if (!passage) {
    errEl.className = 'ls-json-warn'; errEl.textContent = 'Must have "groups" or "passages" at top level.';
    errEl.style.display = ''; return;
  }
  const flat = _rdGroupsToFlat(passage, pi);
  if (!flat.length) {
    errEl.className = 'ls-json-warn'; errEl.textContent = 'Valid JSON — no questions found yet. Keep typing…';
    errEl.style.display = ''; return;
  }
  errEl.style.display = 'none';
  _rdJsonApplying = true;
  const data = _collectReadingData();
  data.passages[pi].questions = flat;
  if (passage.title && !data.passages[pi].title) data.passages[pi].title = passage.title;
  _applyReadingEditorState(data);
  setTimeout(() => { adminSwitchRdMode(pi, 'json'); _rdJsonApplying = false; }, 0);
}

/* ── Preview renderer ─────────────────────────────────────────── */
function _rdRenderAdminPreview(pi) {
  const container = document.getElementById(`rd-preview-content-${pi}`);
  if (!container) return;
  const data = _collectReadingData();
  const qs   = (data.passages[pi] && data.passages[pi].questions) || [];
  if (!qs.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No questions yet.</p>';
    return;
  }
  const prevQs  = appState.test ? appState.test.flatQuestions : [];
  const prevAns = appState.test ? appState.test.answers : {};
  const prevFlags = appState.test ? appState.test.flags : new Set();
  if (!appState.test) appState.test = {};
  appState.test.flatQuestions = qs;
  appState.test.answers       = {};
  appState.test.flags         = new Set();
  container.innerHTML = typeof _rdRenderQuestionsPane === 'function'
    ? _rdRenderQuestionsPane(qs, 0)
    : '<p style="color:var(--text-muted);">Preview unavailable.</p>';
  appState.test.flatQuestions = prevQs;
  appState.test.answers       = prevAns;
  appState.test.flags         = prevFlags;
}

/* ── Mode switch (Edit / Preview / JSON) ──────────────────────── */
function adminSwitchRdMode(pi, mode) {
  const editPane    = document.getElementById(`rd-edit-${pi}`);
  const previewPane = document.getElementById(`rd-preview-${pi}`);
  const jsonPane    = document.getElementById(`rd-json-pane-${pi}`);
  const tabs        = document.querySelectorAll(`#rd-passage-${pi} .ls-mode-tab`);
  if (!editPane) return;
  editPane.style.display    = mode === 'edit'    ? '' : 'none';
  if (previewPane) previewPane.style.display = mode === 'preview' ? '' : 'none';
  if (jsonPane)    jsonPane.style.display    = mode === 'json'    ? '' : 'none';
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  if (mode === 'preview') _rdRenderAdminPreview(pi);
  if (mode === 'json')    _rdJsonRefreshEditor(pi);
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
  const active = Math.max(0, Math.min(_rdActivePassage, passages.length - 1));

  // ── Tab bar ──────────────────────────────────────────────────
  const tabsHtml = passages.map((_p, pi) => `
    <button class="rd-passage-tab${pi === active ? ' active' : ''}"
      onclick="adminSwitchReadingPassage(${pi})">
      Passage ${pi + 1}
      ${passages.length > 1
        ? `<span class="rd-tab-close" onclick="event.stopPropagation();adminRemoveReadingPassage(${pi})" title="Remove passage">&#10005;</span>`
        : ''}
    </button>`).join('');

  // ── Passage panels ───────────────────────────────────────────
  const panelsHtml = passages.map((p, pi) => `
    <div id="rd-passage-${pi}" class="rd-passage-panel${pi === active ? ' active' : ''}" style="display:${pi === active ? '' : 'none'}">
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

        <!-- Import JSON panel (collapsible) -->
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

        <!-- Edit / Preview / JSON tabs -->
        <div class="ls-editor-mode-tabs">
          <button class="ls-mode-tab active" data-mode="edit"    onclick="adminSwitchRdMode(${pi},'edit')">&#9998; Edit</button>
          <button class="ls-mode-tab"        data-mode="preview" onclick="adminSwitchRdMode(${pi},'preview')">&#128065; Preview</button>
          <button class="ls-mode-tab"        data-mode="json"    onclick="adminSwitchRdMode(${pi},'json')">&#123;&#125; JSON</button>
        </div>

        <!-- EDIT PANE -->
        <div id="rd-edit-${pi}">
          <div id="rd-qs-${pi}">
            ${p.questions.map((q, qi) => _buildReadingQuestionRow(pi, qi, q)).join('')}
          </div>
          <button class="btn btn-sm btn-outline admin-add-btn"
            onclick="adminAddReadingQ(${pi})">+ Add Question</button>
        </div>

        <!-- PREVIEW PANE -->
        <div id="rd-preview-${pi}" style="display:none">
          <div class="ls-admin-preview-wrap" id="rd-preview-content-${pi}">
            <p style="color:var(--text-muted);font-style:italic;">Switch to Preview to see student view.</p>
          </div>
        </div>

        <!-- JSON PANE -->
        <div id="rd-json-pane-${pi}" style="display:none">
          <div id="rd-json-error-${pi}" class="ls-json-error" style="display:none"></div>
          <textarea id="rd-json-live-${pi}" class="admin-textarea ls-json-textarea"
            rows="16" spellcheck="false"
            oninput="_rdJsonOnInput(${pi})"
            placeholder='{"groups":[{"type":"true_false_not_given","questions":[...]}]}'></textarea>
          <div class="ls-json-pane-actions">
            <button class="btn btn-sm btn-outline" onclick="adminCopyReadingJSON(${pi})">&#128203; Copy JSON</button>
            <button class="btn btn-sm btn-primary" onclick="adminExportReadingJSON(${pi})">&#8675; Export .json</button>
          </div>
        </div>
      </div>
    </div>`
  ).join('');

  return `
    <div class="rd-passage-tabs">
      ${tabsHtml}
      <button class="rd-passage-tab rd-passage-tab-add" onclick="adminAddReadingPassage()" title="Add passage">+</button>
    </div>
    ${panelsHtml}`;
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

  const imgVal = q.groupImage || '';
  const graphicSection = type === 'diagram_labeling' ? `
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <label class="admin-label">Diagram Image</label>
      <div class="diag-upload-row">
        <input class="admin-input" id="rd-img-${pi}-${qi}"
          value="${_esc(imgVal)}" placeholder="Paste image URL, or upload ↓">
        <input type="file" id="rd-img-file-${pi}-${qi}" accept="image/*" style="display:none"
          onchange="adminDiagUploadImage(${pi},${qi},this)">
        <button class="btn btn-sm btn-outline" type="button"
          onclick="document.getElementById('rd-img-file-${pi}-${qi}').click()">&#8679; Upload</button>
      </div>
      ${imgVal ? `<img id="rd-img-preview-${pi}-${qi}" class="diag-img-preview" src="${_esc(imgVal)}" alt="Preview">` : `<span id="rd-img-preview-${pi}-${qi}"></span>`}
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
    </div>
    <div class="admin-field-row" style="margin-top:0.5rem;">
      <button class="btn btn-sm btn-primary" type="button" onclick="adminDiagOpenModal(${pi},${qi})">
        &#128506; Place on Image
      </button>
      <small style="color:var(--text-muted);margin-left:0.5rem;">Visual editor — place &amp; drag all boxes in this group</small>
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
    const isGroup = ['table_completion','diagram_labeling',
                     'sentence_completion','summary_completion',
                     'matching_headings','matching_information','matching_features',
                     'matching_sentence_endings'].includes(type);
    const groupId = group.groupId || (isGroup ? `grp_p${pi}_g${gi}_${Date.now()}` : '');
    const items   = isGfx ? (group.labels || group.questions || []) : (group.questions || []);

    // Rich table_completion format: rows / cells / segments
    if (type === 'table_completion' && group.rows) {
      let bi = 0;
      group.rows.forEach(row => {
        (row.cells || []).forEach(cell => {
          (cell || []).forEach(seg => {
            if (seg.t !== 'blank') return;
            const ans = Array.isArray(seg.answer) ? seg.answer.join(', ') : (seg.answer || '');
            const q = {
              id:           seg.id || (flat.length + 1),
              qNum:         seg.id || (flat.length + 1),
              type:         'table_completion',
              text:         '',
              answer:       ans,
              instructions: bi === 0 ? (group.instructions || '') : '',
              groupId,
            };
            if (bi === 0) {
              q.tableRows    = group.rows;
              q.tableColumns = group.columns || [];
              if (group.intro_blocks && group.intro_blocks.length) q.introBlocks = group.intro_blocks;
              if (group.answerRule || group.answer_rule) q.answerRule = group.answerRule || group.answer_rule;
            }
            flat.push(q);
            bi++;
          });
        });
      });
      return;  // skip generic items loop
    }

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
        ...(ii === 0 && group.intro_blocks && group.intro_blocks.length ? { introBlocks: group.intro_blocks } : {}),
        ...(ii === 0 && (group.answerRule || group.answer_rule) ? { answerRule: group.answerRule || group.answer_rule } : {}),
        ...(ii === 0 && (group.options_heading || group.optionsHeading) ? { optionsHeading: group.options_heading || group.optionsHeading } : {}),
        ...(item.tokens ? { tokens: item.tokens } : {}),
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
  _persistSection(_aPkg, _aTest, 'reading', _collectReadingData());
  showToast(`Imported and saved ${flatQs.length} question(s)${replaceAll ? ' (replaced all)' : ''}.`);
}

// Import a full reading section: { "passages": [ {passage_id, title, text, groups}, ... ] }
function adminImportReadingSection(parsed, replaceAll) {
  const incoming = parsed.passages;
  if (!incoming || !incoming.length) { showToast('No passages found.'); return; }

  const data = replaceAll ? { passages: [] } : _collectReadingData();
  let totalQs = 0;

  incoming.forEach((passage, idx) => {
    const pi = replaceAll ? idx : (passage.passage_id != null ? passage.passage_id - 1 : data.passages.length);
    const flatQs = _rdGroupsToFlat(passage, pi);
    totalQs += flatQs.length;
    if (!data.passages[pi]) {
      data.passages[pi] = { id: `p${pi + 1}`, title: passage.title || '', text: passage.text || '', questions: [] };
    } else {
      if (passage.title) data.passages[pi].title = passage.title;
      if (passage.text)  data.passages[pi].text  = passage.text;
    }
    if (replaceAll) {
      data.passages[pi].questions = flatQs;
    } else {
      data.passages[pi].questions.push(...flatQs);
    }
  });

  // Fill any gaps from sparse passage_id assignments
  for (let i = 0; i < data.passages.length; i++) {
    if (!data.passages[i]) data.passages[i] = { id: `p${i + 1}`, title: '', text: '', questions: [] };
  }

  _rdActivePassage = 0;
  _applyReadingEditorState(data);
  _persistSection(_aPkg, _aTest, 'reading', _collectReadingData());
  showToast(`Imported and saved ${incoming.length} passage(s), ${totalQs} question(s)${replaceAll ? ' (replaced all)' : ''}.`);
}

function adminSwitchReadingPassage(pi) {
  _rdActivePassage = pi;
  // Update tab active states
  document.querySelectorAll('.rd-passage-tab:not(.rd-passage-tab-add)').forEach((btn, i) => {
    btn.classList.toggle('active', i === pi);
  });
  // Show/hide panels
  let i = 0;
  while (document.getElementById(`rd-passage-${i}`)) {
    document.getElementById(`rd-passage-${i}`).style.display = i === pi ? '' : 'none';
    i++;
  }
}

function adminAddReadingPassage() {
  const d = _collectReadingData();
  const n = d.passages.length + 1;
  d.passages.push({ id:`p${n}`, title:'', text:'', questions:[] });
  _rdActivePassage = d.passages.length - 1;
  _applyReadingEditorState(d);
}
function adminRemoveReadingPassage(pi) {
  if (!confirm('Remove this passage and all its questions?')) return;
  const d = _collectReadingData();
  d.passages.splice(pi, 1);
  _rdActivePassage = Math.min(_rdActivePassage, d.passages.length - 1);
  _applyReadingEditorState(d);
}
function adminAddReadingQ(pi)         { const d = _collectReadingData(); d.passages[pi].questions.push({ id:`rd_p${pi}_q${Date.now()}`, type:'tfng', text:'', answer:'' }); _applyReadingEditorState(d); }
function adminRemoveReadingQ(pi, qi)  { if (!confirm('Remove this question?')) return; const d = _collectReadingData(); d.passages[pi].questions.splice(qi,1); _applyReadingEditorState(d); }
function adminRefreshReadingQ(_pi, _qi) { _applyReadingEditorState(_collectReadingData()); }
function _applyReadingEditorState(data) { const e = document.getElementById('adminEditor'); if(e) { e.innerHTML = _buildReadingEditor(data); _adminSetDirty(); } }

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
  adminSaveWriting();
  showToast(`Writing imported and saved (${tasks.length} task${tasks.length > 1 ? 's' : ''}).`);
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
  const e = document.getElementById('adminEditor');
  if (e) { e.innerHTML = _buildSpeakingEditor(data); _adminSetDirty(); }
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
  _persistSection(_aPkg, _aTest, 'speaking', _collectSpeakingData());
  showToast(`Speaking imported and saved (${parts.length} part${parts.length > 1 ? 's' : ''}).`);
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

/* ============================================================
   DIAGRAM PLACEMENT EDITOR
   ============================================================ */
let _diagModalPi      = -1;
let _diagModalGroupId = '';
let _diagModalImgUrl  = '';
let _diagModalPins    = [];   // [{id, qNum, answer, xPct, yPct, isNew}]
let _diagModalNextId  = 0;
let _diagDragging     = null; // {pinId, lastX, lastY}
let _diagDragMoved    = false;
let _diagModalContext = 'reading';  // 'reading' | 'listening'
let _diagModalSi      = -1;        // section index when context = 'listening'

/* ── Upload image → resize → Supabase Storage → fill URL field ── */
function adminDiagUploadImage(pi, qi, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { showToast('File too large — please use an image under 20 MB.'); return; }

  const btn = document.querySelector(`#rd-img-file-${pi}-${qi}`)?.nextElementSibling;
  if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Resize to max 1400×1000, compress to JPEG 85%, then upload as blob
      const MAX_W = 1400, MAX_H = 1000;
      let w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);

      cv.toBlob(async function(blob) {
        try {
          const publicUrl = await db.uploadImage(blob, file.name);

          const urlInput = document.getElementById(`rd-img-${pi}-${qi}`);
          if (urlInput) urlInput.value = publicUrl;

          const previewEl = document.getElementById(`rd-img-preview-${pi}-${qi}`);
          if (previewEl && previewEl.tagName === 'IMG') {
            previewEl.src = publicUrl;
          } else if (previewEl) {
            const img2 = document.createElement('img');
            img2.id = `rd-img-preview-${pi}-${qi}`;
            img2.className = 'diag-img-preview';
            img2.alt = 'Preview';
            img2.src = publicUrl;
            previewEl.replaceWith(img2);
          }
          showToast('Image uploaded successfully.');
        } catch (err) {
          console.error('[Diag] Upload failed:', err);
          showToast('Upload failed: ' + (err.message || 'Unknown error. Check Supabase Storage bucket "media" exists and is public.'));
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '⇧ Upload'; }
          input.value = ''; // reset file input so same file can be re-selected if needed
        }
      }, 'image/jpeg', 0.85);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ── Listening image upload (mirrors adminDiagUploadImage for listening DOM IDs) ── */
function adminLsUploadImage(si, qi, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { showToast('File too large — please use an image under 20 MB.'); return; }

  const uploadBtn = input.nextElementSibling;
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading…'; }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const MAX_W = 1400, MAX_H = 1000;
      let w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(async function(blob) {
        try {
          const publicUrl = await db.uploadImage(blob, file.name);
          const urlInput  = document.getElementById(`ls-img-${si}-${qi}`);
          if (urlInput) urlInput.value = publicUrl;
          const previewEl = document.getElementById(`ls-img-preview-${si}-${qi}`);
          if (previewEl) {
            previewEl.innerHTML = `<img src="${publicUrl}" class="diag-img-preview" alt="Preview" style="max-height:80px;border-radius:4px;">`;
          }
          showToast('Image uploaded successfully.');
        } catch(err) {
          showToast('Upload failed: ' + (err.message || 'Check Supabase "media" bucket is public.'));
        } finally {
          if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = '⇧ Upload'; }
          input.value = '';
        }
      }, 'image/jpeg', 0.85);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ── Open diagram placement modal for a LISTENING graphic question ── */
function adminLsDiagOpenModal(si, qi) {
  const data = _collectListeningData();
  const sec  = data.sections[si];
  if (!sec) return;
  const q = sec.questions[qi];
  if (!q) return;

  const imgUrl  = _val(`ls-img-${si}-${qi}`) || q.groupImage || '';
  const groupId = q.groupId || `grp_ls_s${si}_q${qi}_${Date.now()}`;

  // Collect all peers with the same groupId (or just this question if solo)
  const peers = groupId
    ? sec.questions.filter(p => p.groupId === groupId)
    : [q];

  _diagModalContext = 'listening';
  _diagModalSi      = si;
  _diagModalPi      = -1;
  _diagModalGroupId = groupId;
  _diagModalImgUrl  = imgUrl;
  _diagModalPins    = peers.map((p, i) => ({
    id:     p.id || `lspin_${si}_${i}_${Date.now()}`,
    qNum:   p.qNum || (i + 1),
    answer: p.answer || '',
    xPct:   p.xPct || 0,
    yPct:   p.yPct || 0,
    isNew:  false,
    questionStart: p.questionStart || 0,
  }));
  _diagModalNextId = _diagModalPins.length;

  _diagEnsureModal();
  const modal = document.getElementById('diagPlacementModal');
  const imgEl = document.getElementById('diagPlacementImg');
  imgEl.src   = imgUrl;
  modal.style.display = 'flex';
  _diagRenderPins();
}

/* ── Build / show modal ── */
function _diagEnsureModal() {
  if (document.getElementById('diagPlacementModal')) return;
  const el = document.createElement('div');
  el.id = 'diagPlacementModal';
  el.className = 'diag-placement-overlay';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="diag-placement-modal">
      <div class="diag-placement-header">
        <div>
          <h3 class="diag-placement-title">&#128506; Diagram Placement Editor</h3>
          <p class="diag-placement-hint">Click on the image to add a box. Drag boxes to reposition. Click &#10005; to remove.</p>
        </div>
        <div class="diag-placement-actions">
          <button class="btn btn-primary btn-sm" type="button" onclick="adminDiagSavePlacements()">&#10003; Save Positions</button>
          <button class="btn btn-outline btn-sm"  type="button" onclick="adminDiagCloseModal()">&#10005; Cancel</button>
        </div>
      </div>
      <div class="diag-placement-body">
        <div class="diag-canvas-wrap">
          <div class="diag-placement-canvas" id="diagPlacementCanvas">
            <img id="diagPlacementImg" class="diag-placement-img" draggable="false" alt="Diagram">
          </div>
        </div>
        <div class="diag-placement-sidebar" id="diagPlacementList"></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  const canvas = el.querySelector('#diagPlacementCanvas');
  canvas.addEventListener('click',      _diagHandleCanvasClick);
  canvas.addEventListener('mousedown',  _diagHandleMouseDown);
  document.addEventListener('mousemove', _diagHandleMouseMove);
  document.addEventListener('mouseup',   _diagHandleMouseUp);
  canvas.addEventListener('touchstart', _diagHandleTouchStart, {passive:false});
  document.addEventListener('touchmove', _diagHandleTouchMove, {passive:false});
  document.addEventListener('touchend',  _diagHandleTouchEnd);
}

function adminDiagOpenModal(pi, qi) {
  const d = _collectReadingData();
  const passage = d.passages[pi];
  if (!passage) return;
  const q = passage.questions[qi];
  if (!q) return;
  const groupId = q.groupId;
  const imgUrl  = q.groupImage || document.getElementById(`rd-img-${pi}-${qi}`)?.value || '';
  if (!groupId) { showToast('Set a Group ID first.'); return; }
  if (!imgUrl)  { showToast('Upload or enter an image URL first.'); return; }

  _diagModalContext = 'reading';
  _diagModalSi      = -1;
  _diagModalPi      = pi;
  _diagModalGroupId = groupId;
  _diagModalImgUrl  = imgUrl;
  _diagModalPins    = passage.questions
    .filter(pq => pq.groupId === groupId)
    .map(pq => ({
      id:     pq.id,
      qNum:   pq.qNum != null ? pq.qNum : pq.id,
      answer: Array.isArray(pq.answer) ? pq.answer.join(', ') : (pq.answer || ''),
      xPct:   pq.xPct || 0,
      yPct:   pq.yPct || 0,
      isNew:  false,
    }));
  const existingNums = _diagModalPins.map(p => Number(p.qNum) || 0);
  _diagModalNextId  = existingNums.length ? Math.max(...existingNums) : 0;

  _diagEnsureModal();
  const modal = document.getElementById('diagPlacementModal');
  modal.style.display = 'flex';
  document.getElementById('diagPlacementImg').src = imgUrl;
  _diagRenderPins();
}

function adminDiagCloseModal() {
  const modal = document.getElementById('diagPlacementModal');
  if (modal) modal.style.display = 'none';
  _diagDragging = null;
}

/* ── Render all pins onto canvas + sidebar ── */
function _diagRenderPins() {
  const canvas = document.getElementById('diagPlacementCanvas');
  const list   = document.getElementById('diagPlacementList');
  if (!canvas || !list) return;
  canvas.querySelectorAll('.diag-pin').forEach(p => p.remove());
  _diagModalPins.forEach(pin => {
    const el = document.createElement('div');
    el.className   = 'diag-pin';
    el.dataset.pinId = String(pin.id);
    el.style.left  = pin.xPct + '%';
    el.style.top   = pin.yPct + '%';
    el.innerHTML   = `<div class="diag-pin-badge">${pin.qNum}</div>
      <button class="diag-pin-delete" type="button" onclick="adminDiagDeletePin('${pin.id}')">&#10005;</button>`;
    canvas.appendChild(el);
  });
  list.innerHTML = `<div class="diag-list-header">Answer Boxes (${_diagModalPins.length})</div>` +
    (_diagModalPins.length === 0
      ? '<p class="diag-empty">Click anywhere on the image to place the first box.</p>'
      : _diagModalPins.map(pin => `
          <div class="diag-pin-row" id="diagPinRow-${pin.id}">
            <div class="diag-pin-row-top">
              <span class="diag-pin-badge-sm">${pin.qNum}</span>
              <input type="number" class="admin-input diag-qnum-input" value="${pin.qNum}" min="1"
                placeholder="Q#" title="Question number"
                onchange="adminDiagUpdateQNum('${pin.id}',this.value)">
              <input type="text" class="admin-input diag-answer-input" value="${_esc(pin.answer)}"
                placeholder="Correct answer…"
                oninput="adminDiagUpdateAnswer('${pin.id}',this.value)">
              <button class="btn btn-sm btn-danger" type="button"
                onclick="adminDiagDeletePin('${pin.id}')">&#10005;</button>
            </div>
            <div class="diag-pin-pos" id="diagPinPos-${pin.id}">
              x: ${pin.xPct.toFixed(1)}%&ensp;y: ${pin.yPct.toFixed(1)}%
            </div>
          </div>`).join(''));
}

/* ── Canvas click → add new pin ── */
function _diagHandleCanvasClick(e) {
  if (_diagDragMoved) { _diagDragMoved = false; return; }
  if (e.target.closest('.diag-pin')) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const xPct = Math.round(((e.clientX - rect.left)  / rect.width)  * 1000) / 10;
  const yPct = Math.round(((e.clientY - rect.top)   / rect.height) * 1000) / 10;
  _diagModalNextId++;
  _diagModalPins.push({ id: `n${_diagModalNextId}`, qNum: _diagModalNextId, answer: '', xPct, yPct, isNew: true });
  _diagRenderPins();
}

/* ── Mouse drag ── */
function _diagHandleMouseDown(e) {
  const pin = e.target.closest('.diag-pin');
  if (!pin || e.target.closest('.diag-pin-delete')) return;
  e.preventDefault();
  _diagDragMoved = false;
  _diagDragging = { pinId: pin.dataset.pinId, lastX: e.clientX, lastY: e.clientY };
  pin.classList.add('diag-dragging');
}
function _diagHandleMouseMove(e) {
  if (!_diagDragging) return;
  _diagDragMoved = true;
  _diagMovePinBy(_diagDragging.pinId, e.clientX - _diagDragging.lastX, e.clientY - _diagDragging.lastY);
  _diagDragging.lastX = e.clientX;
  _diagDragging.lastY = e.clientY;
}
function _diagHandleMouseUp() {
  if (!_diagDragging) return;
  document.querySelector(`.diag-pin[data-pin-id="${_diagDragging.pinId}"]`)?.classList.remove('diag-dragging');
  _diagDragging = null;
}

/* ── Touch drag ── */
function _diagHandleTouchStart(e) {
  const pin = e.target.closest('.diag-pin');
  if (!pin || e.target.closest('.diag-pin-delete')) return;
  e.preventDefault();
  _diagDragMoved = false;
  const t = e.touches[0];
  _diagDragging = { pinId: pin.dataset.pinId, lastX: t.clientX, lastY: t.clientY };
  pin.classList.add('diag-dragging');
}
function _diagHandleTouchMove(e) {
  if (!_diagDragging) return;
  e.preventDefault();
  _diagDragMoved = true;
  const t = e.touches[0];
  _diagMovePinBy(_diagDragging.pinId, t.clientX - _diagDragging.lastX, t.clientY - _diagDragging.lastY);
  _diagDragging.lastX = t.clientX;
  _diagDragging.lastY = t.clientY;
}
function _diagHandleTouchEnd() {
  if (!_diagDragging) return;
  document.querySelector(`.diag-pin[data-pin-id="${_diagDragging.pinId}"]`)?.classList.remove('diag-dragging');
  _diagDragging = null;
}

/* ── Shared drag move logic ── */
function _diagMovePinBy(pinId, dx, dy) {
  const canvas  = document.getElementById('diagPlacementCanvas');
  const pinEl   = document.querySelector(`.diag-pin[data-pin-id="${pinId}"]`);
  const pinData = _diagModalPins.find(p => String(p.id) === String(pinId));
  if (!canvas || !pinEl || !pinData) return;
  const rect = canvas.getBoundingClientRect();
  pinData.xPct = Math.round(Math.max(0, Math.min(100, pinData.xPct + dx / rect.width  * 100)) * 10) / 10;
  pinData.yPct = Math.round(Math.max(0, Math.min(100, pinData.yPct + dy / rect.height * 100)) * 10) / 10;
  pinEl.style.left = pinData.xPct + '%';
  pinEl.style.top  = pinData.yPct + '%';
  const posEl = document.getElementById(`diagPinPos-${pinId}`);
  if (posEl) posEl.textContent = `x: ${pinData.xPct.toFixed(1)}%  y: ${pinData.yPct.toFixed(1)}%`;
}

/* ── Pin mutations ── */
function adminDiagDeletePin(pinId) {
  _diagModalPins = _diagModalPins.filter(p => String(p.id) !== String(pinId));
  _diagRenderPins();
}
function adminDiagUpdateAnswer(pinId, val) {
  const pin = _diagModalPins.find(p => String(p.id) === String(pinId));
  if (pin) pin.answer = val;
}
function adminDiagUpdateQNum(pinId, val) {
  const pin = _diagModalPins.find(p => String(p.id) === String(pinId));
  if (!pin) return;
  pin.qNum = parseInt(val) || pin.qNum;
  const badge = document.querySelector(`.diag-pin[data-pin-id="${pinId}"] .diag-pin-badge`);
  if (badge) badge.textContent = pin.qNum;
  const sm = document.querySelector(`#diagPinRow-${pinId} .diag-pin-badge-sm`);
  if (sm) sm.textContent = pin.qNum;
}

/* ── Save placements back to editor (reading or listening) ── */
function adminDiagSavePlacements() {
  if (_diagModalContext === 'listening') {
    // ── Listening path ──
    const data = _collectListeningData();
    const sec  = data.sections[_diagModalSi];
    if (!sec) return;
    // Determine type from existing group questions, default to map_labeling
    const existingType = (sec.questions.find(q => q.groupId === _diagModalGroupId) || {}).type || 'map_labeling';
    // Remove old group questions, keep others
    sec.questions = sec.questions.filter(q => q.groupId !== _diagModalGroupId);
    // Add updated pins
    _diagModalPins.forEach((pin, i) => {
      sec.questions.push({
        id:            pin.isNew ? `lspin_${_diagModalSi}_${i}_${Date.now()}` : pin.id,
        qNum:          pin.qNum,
        type:          existingType,
        text:          pin.answer || '',
        answer:        pin.answer || '',
        groupId:       _diagModalGroupId,
        groupImage:    _diagModalImgUrl,
        xPct:          pin.xPct,
        yPct:          pin.yPct,
        questionStart: pin.questionStart || 0,
      });
    });
    adminDiagCloseModal();
    _applyListeningEditorState(data);
    showToast(`Saved ${_diagModalPins.length} box(es).`);
    return;
  }

  // ── Reading path (original) ──
  const d = _collectReadingData();
  const passage = d.passages[_diagModalPi];
  if (!passage) return;
  // Remove old group questions, keep others
  passage.questions = passage.questions.filter(q => q.groupId !== _diagModalGroupId);
  // Add pins as questions
  _diagModalPins.forEach((pin, i) => {
    passage.questions.push({
      id:         pin.isNew ? (Date.now() + i) : pin.id,
      qNum:       pin.qNum,
      type:       'diagram_labeling',
      text:       '',
      answer:     pin.answer || '',
      groupId:    _diagModalGroupId,
      groupImage: _diagModalImgUrl,
      xPct:       pin.xPct,
      yPct:       pin.yPct,
    });
  });
  _applyReadingEditorState(d);
  adminDiagCloseModal();
  showToast(`Saved ${_diagModalPins.length} diagram box(es).`);
}
