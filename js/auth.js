'use strict';

/* ============================================================
   Student Authentication
   Handles student register / login / logout UI and state.
   Admin auth is handled separately in admin.js.
   ============================================================ */

let _studentProfile = null;   // { id, name, email, role } or null

/* ── State helpers ────────────────────────────────────────── */
function getStudentProfile() { return _studentProfile; }
function isStudentLoggedIn()  { return !!_studentProfile; }

/* ── Startup: register the auth state listener ────────────── *
 *
 * onAuthStateChange is the single source of truth for all auth
 * transitions:
 *   INITIAL_SESSION  — existing session found on page load
 *   SIGNED_IN        — fresh login (email/pwd, Google OAuth
 *                      redirect, or email verification click)
 *   SIGNED_OUT       — logout
 *   TOKEN_REFRESHED  — silent token refresh (ignored here)
 *
 * This replaces the old getSession() polling approach and fixes
 * the race condition where Google/email-verification redirects
 * reloaded the page before the async token exchange finished.
 */
async function initStudentAuth() {
  db.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      _studentProfile = null;
      _updateAuthNav();
      // Redirect away from protected tabs
      if (typeof appState !== 'undefined' &&
          (appState.currentTab === 'practice' || appState.currentTab === 'review')) {
        if (typeof _doSwitchTab === 'function') _doSwitchTab('dashboard');
      }
      return;
    }

    if (!session?.user) return;

    // Resolve profile, creating it for first-time OAuth users
    let profile = await db.getProfile(session.user.id);
    if (!profile) {
      const u = session.user;
      const name = u.user_metadata?.full_name || u.user_metadata?.name
                   || u.email?.split('@')[0] || 'Student';
      await db.upsertProfile(u.id, u.email, name);
      profile = await db.getProfile(u.id);
    }

    // Admin accounts must not bleed into student UI
    if (profile?.role === 'admin') return;

    _studentProfile = profile;
    _updateAuthNav();

    // SIGNED_IN = fresh login (not just a page reload with existing session)
    if (event === 'SIGNED_IN') {
      const history = await db.loadHistory();
      if (history !== null)
        localStorage.setItem('ielts_history', JSON.stringify(history));
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderReview    === 'function') renderReview();

      // Close modal if it was open (email/password login path)
      const modal = document.getElementById('authModal');
      if (modal && modal.style.display !== 'none') {
        closeAuthModal();
      }
      if (typeof showToast === 'function')
        showToast(`Welcome, ${_studentProfile?.name || 'student'}!`);

      // Navigate to the tab the student was trying to reach before logging in
      if (typeof _authPendingTab !== 'undefined' && _authPendingTab) {
        const dest = _authPendingTab;
        _authPendingTab = null;
        if (typeof _doSwitchTab === 'function') _doSwitchTab(dest);
      }
    }
  });
}

function _updateAuthNav() {
  const btn = document.getElementById('authNavBtn');
  if (!btn) return;
  if (_studentProfile) {
    btn.textContent = _studentProfile.name;
    btn.title = 'Click to sign out';
    btn.classList.add('logged-in');
  } else {
    btn.textContent = 'Login';
    btn.title = '';
    btn.classList.remove('logged-in');
  }
}

/* ── Modal open/close ─────────────────────────────────────── */
function openAuthModal() {
  if (_studentProfile) {
    showModal('Sign Out', `Sign out as ${_studentProfile.name}?`, async () => {
      await db.logout();
      // onAuthStateChange SIGNED_OUT handles _studentProfile = null + nav update
      localStorage.removeItem('ielts_history');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderReview    === 'function') renderReview();
      if (typeof showToast       === 'function') showToast('Signed out.');
    });
    return;
  }
  document.getElementById('authModal').style.display = 'flex';
  switchAuthTab('login');
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
  _clearAuthForms();
}

function switchAuthTab(tab) {
  document.getElementById('authTabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('authTabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('authPaneLogin').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('authPaneRegister').style.display = tab === 'register' ? 'block' : 'none';
  const errEl = document.getElementById('authErr');
  if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
}

function _clearAuthForms() {
  ['authLoginEmail','authLoginPwd','authRegEmail','authRegName','authRegPwd','authRegPwd2']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const errEl = document.getElementById('authErr');
  if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
}

/* ── Google OAuth ─────────────────────────────────────────── */
async function doGoogleLogin() {
  // loginWithGoogle() triggers a full-page redirect to Google.
  // On return, Supabase processes the URL hash and fires
  // onAuthStateChange(SIGNED_IN) — no further action needed here.
  const err = await db.loginWithGoogle();
  if (err) {
    const errEl = document.getElementById('authErr');
    if (errEl) errEl.textContent = err.message || 'Google sign-in failed.';
  }
}

/* ── Register ─────────────────────────────────────────────── */
async function doStudentRegister() {
  const name  = (document.getElementById('authRegName')?.value  || '').trim();
  const email = (document.getElementById('authRegEmail')?.value || '').trim();
  const pwd   = document.getElementById('authRegPwd')?.value  || '';
  const pwd2  = document.getElementById('authRegPwd2')?.value || '';
  const errEl = document.getElementById('authErr');

  if (!name || !email || !pwd) { errEl.textContent = 'All fields are required.'; return; }
  if (pwd !== pwd2)            { errEl.textContent = 'Passwords do not match.'; return; }
  if (pwd.length < 6)          { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  const btn = document.getElementById('authRegBtn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  errEl.textContent = ''; errEl.style.color = '';

  const { error, needsVerification } = await db.registerStudent(email, name, pwd);
  btn.disabled = false; btn.textContent = 'Create Account';

  if (error) {
    errEl.textContent = error.message || 'Registration failed.';
    return;
  }

  if (needsVerification) {
    // Email confirmation required — tell the user clearly, do NOT try to login
    errEl.style.color = 'var(--primary)';
    errEl.textContent = '✓ Account created! Check your email and click the link to verify before signing in.';
    // Clear password fields only; keep email visible so user knows which inbox to check
    document.getElementById('authRegPwd').value  = '';
    document.getElementById('authRegPwd2').value = '';
    btn.disabled = true;  // prevent duplicate submissions
    return;
  }

  // Email confirmation disabled in Supabase — user is already logged in.
  // onAuthStateChange SIGNED_IN will fire and handle nav + modal close.
}

/* ── Forgot password ──────────────────────────────────────── */
async function doForgotPassword() {
  const email = (document.getElementById('authLoginEmail')?.value || '').trim();
  const errEl = document.getElementById('authErr');
  if (!email) { errEl.style.color = ''; errEl.textContent = 'Enter your email address first.'; return; }
  errEl.textContent = '';
  const error = await db.resetPassword(email);
  if (error) {
    errEl.style.color = '';
    errEl.textContent = error.message || 'Could not send reset email.';
  } else {
    errEl.style.color = 'var(--primary)';
    errEl.textContent = '✓ Reset link sent — check your inbox.';
  }
}

/* ── Login ────────────────────────────────────────────────── */
async function doStudentLogin() {
  const email = (document.getElementById('authLoginEmail')?.value || '').trim();
  const pwd   = document.getElementById('authLoginPwd')?.value || '';
  const errEl = document.getElementById('authErr');

  if (!email || !pwd) { errEl.textContent = 'Email and password are required.'; return; }

  const btn = document.getElementById('authLoginBtn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  errEl.textContent = '';

  const error = await db.login(email, pwd);
  btn.disabled = false; btn.textContent = 'Sign In';

  if (error) {
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      errEl.textContent = 'Please verify your email first. Check your inbox for the confirmation link.';
    } else {
      errEl.textContent = 'Incorrect email or password.';
    }
    return;
  }
  // onAuthStateChange SIGNED_IN fires and handles everything else
}

/* Close modal when clicking backdrop */
document.addEventListener('click', e => {
  const modal = document.getElementById('authModal');
  if (e.target === modal) closeAuthModal();
});
