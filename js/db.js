'use strict';

/* ============================================================
   Learn With Trang — Supabase backend client
   All data operations go through this module.
   localStorage is kept as a fast local cache; Supabase is the
   source of truth synced in the background.
   ============================================================ */

const _SB_URL = 'https://hxnavrghxwrsjnvqbgqc.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4bmF2cmdoeHdyc2pudnFiZ3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzAzNjEsImV4cCI6MjA5MDI0NjM2MX0.64eekygugwKP7VER7Jkl22Aw-D_972lSdziVxKv7mg4';

const _sb = window.supabase.createClient(_SB_URL, _SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/* Always redirect back to app.html regardless of where the user
   clicked the link from (email, OAuth, password reset). */
function _appUrl() {
  const { origin, pathname } = window.location;
  // If already on app.html, use that exact path.
  // Otherwise build the path — handles both local dev and GitHub Pages.
  const base = pathname.endsWith('app.html')
    ? pathname
    : pathname.replace(/\/?$/, '/') + 'app.html';
  return origin + base;
}

/* Anonymous session ID — stays in localStorage, used to scope
   test history to the current browser without requiring login. */
function _sid() {
  let id = localStorage.getItem('_sb_sid');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('_sb_sid', id); }
  return id;
}

const db = {

  /* ── Admin Auth ───────────────────────────────────────────── */

  async getSession() {
    const { data: { session } } = await _sb.auth.getSession();
    return session;
  },

  async login(email, password) {
    const { error } = await _sb.auth.signInWithPassword({ email, password });
    return error || null;
  },

  async logout() {
    await _sb.auth.signOut();
  },

  async resetPassword(email) {
    const { error } = await _sb.auth.resetPasswordForEmail(email, {
      redirectTo: _appUrl()
    });
    return error || null;
  },

  async loginWithGoogle() {
    const { error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: _appUrl() }
    });
    return error || null;
  },

  async upsertProfile(userId, email, name) {
    const { error } = await _sb.from('profiles').upsert(
      { id: userId, email, name: name || email.split('@')[0], role: 'student' },
      { onConflict: 'id' }
    );
    return error || null;
  },

  async updatePassword(currentPassword, newPassword) {
    const session = await db.getSession();
    if (!session) return new Error('Not authenticated');
    const verifyErr = await db.login(session.user.email, currentPassword);
    if (verifyErr) return verifyErr;
    const { error } = await _sb.auth.updateUser({ password: newPassword });
    return error || null;
  },

  /* ── Student Auth ─────────────────────────────────────────── */

  async registerStudent(email, name, password) {
    const { data, error } = await _sb.auth.signUp({ email, password,
      options: { data: { name }, emailRedirectTo: _appUrl() }
    });
    if (error) return { error, needsVerification: false };
    // data.session is null when Supabase requires email verification
    const needsVerification = !data.session;
    if (data.user && !needsVerification) {
      // Only insert profile now if user is already confirmed (email confirmation disabled)
      const { error: pErr } = await _sb.from('profiles').insert({
        id: data.user.id, name, email, role: 'student',
      });
      if (pErr) console.warn('[DB] Profile create failed:', pErr.message);
    } else if (data.user && needsVerification) {
      // Insert profile now so it exists after verification; upsert is safe if
      // the onAuthStateChange handler also tries to create it.
      const { error: pErr } = await _sb.from('profiles').upsert(
        { id: data.user.id, name, email, role: 'student' }, { onConflict: 'id' }
      );
      if (pErr) console.warn('[DB] Profile pre-create failed:', pErr.message);
    }
    return { error: null, needsVerification };
  },

  onAuthStateChange(callback) {
    return _sb.auth.onAuthStateChange(callback);
  },

  async getProfile(userId) {
    const uid = userId || (await db.getSession())?.user?.id;
    if (!uid) return null;
    const { data } = await _sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    return data;
  },

  /* ── Test history ────────────────────────────────────────── */

  async saveHistory(r) {
    const session = await db.getSession();
    const base = {
      session_id: _sid(),
      user_id:    session?.user?.id || null,
      section:    r.section,
      band:       r.band,
      correct:    r.correct,
      total:      r.total,
      time_taken: r.timeTaken,
      created_at: r.date,
    };
    const { error } = await _sb.from('test_history').insert({
      ...base,
      wrong_answers: r.wrongAnswers?.length ? r.wrongAnswers : null,
    });
    if (error) {
      if (error.message?.includes('wrong_answers')) {
        console.warn('[DB] wrong_answers column missing — saving without it. Run migration SQL.');
        const { error: e2 } = await _sb.from('test_history').insert(base);
        if (e2) console.warn('[DB] saveHistory fallback failed:', e2.message);
      } else {
        console.warn('[DB] saveHistory failed:', error.message);
      }
    }
  },

  async loadHistory() {
    const session = await db.getSession();
    let query = _sb.from('test_history').select('*')
      .order('created_at', { ascending: false }).limit(50);
    if (session?.user?.id) {
      query = query.eq('user_id', session.user.id);
    } else {
      query = query.eq('session_id', _sid());
    }
    const { data, error } = await query;
    if (error || !data) return null;
    return data.map(r => ({
      date: r.created_at, section: r.section,
      band: r.band, correct: r.correct, total: r.total, timeTaken: r.time_taken,
    }));
  },

  async clearHistory() {
    const session = await db.getSession();
    let query = _sb.from('test_history').delete();
    if (session?.user?.id) query = query.eq('user_id', session.user.id);
    else query = query.eq('session_id', _sid());
    const { error } = await query;
    if (error) console.warn('[DB] clearHistory failed:', error.message);
  },

  async loadPracticeResults() {
    const session = await db.getSession();
    let query = _sb.from('practice_results').select('*')
      .order('created_at', { ascending: false }).limit(100);
    if (session?.user?.id) {
      query = query.eq('user_id', session.user.id);
    } else {
      query = query.eq('session_id', _sid());
    }
    const { data, error } = await query;
    if (error) console.warn('[DB] loadPracticeResults failed:', error.message);
    return data || [];
  },

  /* ── Practice results ────────────────────────────────────── */

  async savePracticeResult(pkgId, pkgName, score, total, wrongAnswers) {
    const session = await db.getSession();
    const base = {
      user_id:      session?.user?.id || null,
      session_id:   _sid(),
      package_id:   pkgId,
      package_name: pkgName,
      score,
      total,
    };
    // Try with wrong_answers first; if column doesn't exist yet, fall back to base insert
    const { error } = await _sb.from('practice_results').insert({
      ...base,
      wrong_answers: wrongAnswers?.length ? wrongAnswers : null,
    });
    if (error) {
      if (error.message?.includes('wrong_answers')) {
        console.warn('[DB] wrong_answers column missing — saving without it. Run migration SQL.');
        const { error: e2 } = await _sb.from('practice_results').insert(base);
        if (e2) console.warn('[DB] savePracticeResult fallback failed:', e2.message);
      } else {
        console.warn('[DB] savePracticeResult failed:', error.message);
      }
    }
  },

  /* ── Admin: student management ───────────────────────────── */

  async getAllStudents() {
    const { data, error } = await _sb.from('profiles')
      .select('*').eq('role', 'student')
      .order('created_at', { ascending: false });
    if (error) console.warn('[DB] getAllStudents failed:', error.message);
    return data || [];
  },

  async getStudentHistory(userId) {
    const { data, error } = await _sb.from('test_history')
      .select('*').eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.warn('[DB] getStudentHistory failed:', error.message);
    return data || [];
  },

  async getStudentPracticeResults(userId) {
    const { data, error } = await _sb.from('practice_results')
      .select('*').eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.warn('[DB] getStudentPracticeResults failed:', error.message);
    return data || [];
  },

  /* ── App data (key-value store for all admin content) ─────── */

  async getData(key) {
    const { data, error } = await _sb.from('app_data')
      .select('value').eq('key', key).maybeSingle();
    if (error) console.warn('[DB] getData failed:', error.message);
    return data?.value ?? null;
  },

  async setData(key, value) {
    const { error } = await _sb.from('app_data')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) console.warn('[DB] setData failed:', error.message);
  },

  /* ── Startup sync: pull Supabase → localStorage ──────────── */

  async syncAll() {
    try {
      const keyMap = [
        ['admin_content',         'hct_admin_data'],
        ['practice_content',      'hct_practice_data'],
        ['custom_test_pkgs',      'hct_custom_test_pkgs'],
        ['custom_tests',          'hct_custom_tests'],
        ['hidden_tests',          'hct_hidden_tests'],
        ['custom_practice_pkgs',  'hct_custom_practice_pkgs'],
        ['hidden_practice_pkgs',  'hct_hidden_practice_pkgs'],
      ];
      await Promise.all(keyMap.map(async ([dbKey, lsKey]) => {
        const val = await db.getData(dbKey);
        if (val !== null) localStorage.setItem(lsKey, JSON.stringify(val));
      }));
      const history = await db.loadHistory();
      if (history !== null && history.length > 0)
        localStorage.setItem('ielts_history', JSON.stringify(history));
    } catch (e) {
      console.warn('[DB] syncAll failed (offline?):', e);
    }
  },

  // ── Live Quiz ────────────────────────────────────────────────

  async createQuizRoom(roomCode, hostId, hostName, questions, settings) {
    const { data, error } = await _sb.from('quiz_rooms').insert({
      room_code: roomCode, host_id: hostId, host_name: hostName,
      questions, settings,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async getQuizRoom(roomCode) {
    const { data, error } = await _sb.from('quiz_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .neq('status', 'finished')
      .single();
    if (error) return null;
    return data;
  },

  async updateQuizRoom(id, updates) {
    const { error } = await _sb.from('quiz_rooms').update(updates).eq('id', id);
    if (error) throw error;
  },

  async upsertParticipant(data) {
    const { data: row, error } = await _sb.from('quiz_participants')
      .upsert(data, { onConflict: 'room_id,player_id' })
      .select().single();
    if (error) throw error;
    return row;
  },

  async saveAllParticipants(participants) {
    if (!participants.length) return;
    const { error } = await _sb.from('quiz_participants').upsert(participants, { onConflict: 'room_id,player_id' });
    if (error) throw error;
  },

  async getQuizResults(roomCode) {
    const room = await db.getQuizRoom(roomCode);
    if (!room) return null;
    const { data, error } = await _sb.from('quiz_participants')
      .select('*')
      .eq('room_id', room.id)
      .order('score', { ascending: false });
    if (error) return null;
    return { room, participants: data };
  },

  async cleanupOldRooms() {
    // Fire-and-forget: delete finished rooms older than 24 hours
    _sb.from('quiz_rooms')
      .delete()
      .eq('status', 'finished')
      .lt('created_at', new Date(Date.now() - 86400000).toISOString())
      .then(() => {})
      .catch(() => {});
  },
};
