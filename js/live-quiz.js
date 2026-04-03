'use strict';

/* ============================================================
   Live Quiz — js/live-quiz.js
   Kahoot-style real-time multiplayer quiz using Supabase Realtime.

   Roles
   -----
   HOST   : logged-in user who creates the room, controls questions
   PLAYER : anyone (anon OK) who joins via room code or QR link

   Realtime channel: quiz:{ROOMCODE}
   Host → All broadcasts:
     QUIZ_STARTED  { questionCount }
     SHOW_QUESTION { qIdx, question }   ← correct answer NOT included
     LOCK_ANSWERS  { qIdx }
     SHOW_Q_RESULTS { qIdx, correctAnswer, leaderboard }
     QUIZ_ENDED    { leaderboard, final: true }
   Player → All broadcasts:
     PLAYER_ANSWER { playerId, playerName, qIdx, answer, timeMs }
   ============================================================ */

// ── Constants ─────────────────────────────────────────────────
const LQ_TIMER_CIRCUMFERENCE = 2 * Math.PI * 22; // r=22
const LQ_NO_ANSWER_TIMEOUT_MS = 90_000;           // 90s before "waiting for host" overlay

// ─────────────────────────────────────────────────────────────
// ENTRY POINT — called by _doSwitchTab('live-quiz')
// ─────────────────────────────────────────────────────────────
function renderLiveQuizTab() {
  // If currently in a session (player or host), do not clobber the view
  if (appState.liveQuiz.mode) return;
  _lqRenderLanding();
}

// ─────────────────────────────────────────────────────────────
// LANDING SCREEN
// ─────────────────────────────────────────────────────────────
function _lqRenderLanding() {
  const el = document.getElementById('lqContainer');
  el.innerHTML = `
    <div class="lq-landing">
      <h2>&#9889; Live Quiz</h2>
      <p>Compete live with classmates — individually or in teams!</p>
      <div class="lq-actions">
        ${typeof isAdminLoggedIn === 'function' && isAdminLoggedIn()
          ? `<button class="btn btn-primary" onclick="_lqShowCreateForm()">&#10133; Host a Quiz</button>`
          : ''
        }
        <button class="btn btn-success" onclick="_lqShowJoinForm('')">&#128247; Join a Quiz</button>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// HOST — CREATE FORM
// ─────────────────────────────────────────────────────────────
function _lqShowCreateForm() {
  const el = document.getElementById('lqContainer');

  // Build options: one entry per mini quiz section within each practice package
  const _pp = (typeof PRACTICE_PACKAGES !== 'undefined' ? PRACTICE_PACKAGES : []);
  let practiceOpts = '';
  _pp.forEach((pkg, i) => {
    const tests = _lqGetTests(pkg);
    tests.forEach(test => {
      practiceOpts += `<option value="practice:${i}:${test.id}">${pkg.name || pkg.id} — ${test.title || 'Mini Quiz'}</option>`;
    });
  });
  if (!practiceOpts) practiceOpts = '<option disabled value="">No practice sections available</option>';

  el.innerHTML = `
    <div class="lq-card" style="max-width:520px;margin:0 auto;">
      <button class="btn btn-outline" style="margin-bottom:1rem;" onclick="_lqRenderLanding()">&#8592; Back</button>
      <h3>&#9889; Host a Live Quiz</h3>
      <div class="lq-form-group">
        <label>Quiz Title</label>
        <input type="text" id="lqTitle" placeholder="e.g. Week 3 Vocab Challenge" maxlength="80">
      </div>
      <div class="lq-form-group">
        <label>Question Source</label>
        <select id="lqSource">
          ${practiceOpts}
        </select>
      </div>
      <div class="lq-form-group">
        <label>Number of Questions (5 – 20)</label>
        <input type="number" id="lqCount" value="10" min="5" max="20">
      </div>
      <div class="lq-form-group">
        <label>Time per Question</label>
        <select id="lqTime">
          <option value="15">15 seconds</option>
          <option value="30" selected>30 seconds</option>
          <option value="45">45 seconds</option>
          <option value="60">60 seconds</option>
        </select>
      </div>
      <div id="lqCreateError"></div>
      <button class="btn btn-primary" style="width:100%;margin-top:0.5rem;" onclick="_lqCreate()">Create Room</button>
    </div>`;
}

async function _lqCreate() {
  const title    = (document.getElementById('lqTitle').value.trim() || 'Live Quiz');
  const source   = document.getElementById('lqSource').value;
  const count    = Math.min(20, Math.max(5, parseInt(document.getElementById('lqCount').value) || 10));
  const timeSec  = parseInt(document.getElementById('lqTime').value) || 30;
  const groupMode = false;
  const errEl    = document.getElementById('lqCreateError');

  errEl.innerHTML = '';

  // Pick questions from the chosen source
  const questions = _lqPickQuestions(source, count);
  if (questions.length === 0) {
    errEl.innerHTML = '<div class="lq-error">No compatible questions found in this source. Choose a different source or check that it has MCQ / T\/F\/NG questions.</div>';
    return;
  }
  if (questions.length < count) {
    errEl.innerHTML = `<div class="lq-info">Only ${questions.length} compatible questions found — room created with ${questions.length} questions.</div>`;
  }

  const session  = await db.getSession();
  const hostId   = session?.user?.id || null;
  const hostName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Host';

  // Generate a unique room code, retry on collision
  let roomCode, retries = 0;
  while (retries < 5) {
    roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    try {
      const room = await db.createQuizRoom(roomCode, hostId, hostName, questions, {
        timePerQuestion: timeSec,
        quizTitle: title,
        source,
        groupMode,
      });
      appState.liveQuiz.roomData = room;
      break;
    } catch (e) {
      if (e.code === '23505') { retries++; continue; } // unique collision
      errEl.innerHTML = `<div class="lq-error">Failed to create room: ${e.message}</div>`;
      return;
    }
  }

  appState.liveQuiz.mode     = 'host';
  appState.liveQuiz.roomCode = roomCode;
  appState.liveQuiz.collectedAnswers = {};
  appState.liveQuiz.participants     = {};
  _lqHostSubscribe(roomCode);
  _lqRenderHostLobby();
}

// ─────────────────────────────────────────────────────────────
// QUESTION PICKER
// Normalises questions to { text, type:'mcq'|'tfng', options[], answer }
// source format: "practice:{pkgIdx}:{testId}"
// ─────────────────────────────────────────────────────────────

// Normalise pkg.miniQuiz → array of test wrapper objects { id, title, questions[] }
function _lqGetTests(pkg) {
  const arr = pkg.miniQuiz || [];
  if (!arr.length) return [];
  const first = arr[0];
  // Already wrapped: [{id, title, questions:[...]}]
  if (first && Array.isArray(first.questions) && !first.type && !first.q) return arr;
  // Legacy flat array — wrap in a single test
  return [{ id: 'legacy', title: 'Mini Quiz', questions: arr }];
}

function _lqPickQuestions(source, count) {
  const raw = [];
  const parts = source.split(':');
  const pkgIdx = parseInt(parts[1]);
  const testId = parts[2];
  const pkg = (typeof PRACTICE_PACKAGES !== 'undefined' ? PRACTICE_PACKAGES : [])[pkgIdx];
  if (!pkg) return raw;
  const tests = _lqGetTests(pkg);
  const test = tests.find(t => t.id === testId) || tests[0];
  if (!test) return raw;
  for (const q of (test.questions || [])) {
    if (q.type === 'multiple_choice') {
      for (const sub of (q.questions || [])) raw.push(_lqNormMcqRich(sub));
    } else if (q.type === 'true_false_ng' || q.type === 'yes_no_ng') {
      const opts = q.type === 'yes_no_ng'
        ? ['YES', 'NO', 'NOT GIVEN']
        : ['TRUE', 'FALSE', 'NOT GIVEN'];
      for (const sub of (q.questions || [])) raw.push(_lqNormTfngRich(sub, opts));
    } else if (!q.type && q.q && Array.isArray(q.opts)) {
      const idx = parseInt(q.answer);
      const answer = !isNaN(idx) && q.opts[idx] !== undefined ? String(q.opts[idx]) : String(q.answer);
      raw.push({ text: q.q, type: 'mcq', options: q.opts, answer });
    }
  }
  // Shuffle and cap
  _lqShuffle(raw);
  return raw.filter(Boolean).slice(0, count);
}

function _lqNormMcq(q) {
  if (!q.text || !q.options) return null;
  return { text: q.text, type: 'mcq', options: q.options, answer: q.answer };
}
function _lqNormTfng(q) {
  if (!q.text) return null;
  return { text: q.text, type: 'tfng', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: q.answer };
}
function _lqNormMcqRich(q) {
  if (!q) return null;
  const text = q.prompt || q.question || q.text;
  if (!text) return null;
  // q.answer is a numeric index — resolve to the actual option text so it
  // matches what the player broadcasts (which is always the option text)
  const idx = parseInt(q.answer);
  const answer = !isNaN(idx) && Array.isArray(q.options) && q.options[idx] !== undefined
    ? String(q.options[idx])
    : String(q.answer);
  return { text, type: 'mcq', options: q.options, answer };
}
function _lqNormTfngRich(q, opts) {
  if (!q) return null;
  const text = q.statement || q.text || q.question;
  if (!text) return null;
  const options = opts || ['TRUE', 'FALSE', 'NOT GIVEN'];
  // Normalise short-form answers (T/F/NG → TRUE/FALSE/NOT GIVEN)
  const _normAns = { T: 'TRUE', TRUE: 'TRUE', F: 'FALSE', FALSE: 'FALSE', NG: 'NOT GIVEN', 'NOT GIVEN': 'NOT GIVEN', Y: 'YES', YES: 'YES', N: 'NO', NO: 'NO' };
  const answer = _normAns[String(q.answer).trim().toUpperCase()] || String(q.answer);
  return { text, type: 'tfng', options, answer };
}
function _lqShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ─────────────────────────────────────────────────────────────
// HOST — REALTIME SUBSCRIPTION
// ─────────────────────────────────────────────────────────────
function _lqHostSubscribe(roomCode) {
  const ch = _sb.channel(`quiz:${roomCode}`, {
    config: { broadcast: { self: false }, presence: { key: 'host' } },
  });

  ch.on('broadcast', { event: 'PLAYER_ANSWER' }, ({ payload }) => {
    _lqHostOnPlayerAnswer(payload);
  });

  ch.on('presence', { event: 'sync' }, () => {
    _lqRefreshPlayerChips(ch);
  });

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      ch.track({ role: 'host', hostName: appState.liveQuiz.roomData?.host_name || 'Host' });
    }
  });

  appState.liveQuiz.channel = ch;
}

function _lqHostOnPlayerAnswer(payload) {
  const lq    = appState.liveQuiz;
  const room  = lq.roomData;
  if (!room || payload.qIdx !== room.current_q_idx) return;
  if (lq._locked) return; // answers after lock are discarded

  if (!lq.collectedAnswers[payload.qIdx]) lq.collectedAnswers[payload.qIdx] = [];
  // Prevent duplicate answers from same player
  const already = lq.collectedAnswers[payload.qIdx].some(a => a.playerId === payload.playerId);
  if (already) return;

  lq.collectedAnswers[payload.qIdx].push({
    playerId:   payload.playerId,
    playerName: payload.playerName,
    answer:     payload.answer,
    timeMs:     payload.timeMs,
  });

  // Register participant if new
  if (!lq.participants[payload.playerId]) {
    lq.participants[payload.playerId] = {
      playerId:   payload.playerId,
      playerName: payload.playerName,
      teamName:   payload.teamName || null,
      score: 0,
      answers: [],
    };
  }

  // Update live answer count bar
  const total  = Object.keys(lq.participants).length || 1;
  const answered = lq.collectedAnswers[payload.qIdx].length;
  const pct    = Math.min(100, Math.round(answered / total * 100));
  const fill   = document.getElementById('lqAnswerFill');
  const label  = document.getElementById('lqAnswerLabel');
  if (fill)  fill.style.width  = pct + '%';
  if (label) label.textContent = `${answered} of ${total} answered`;
}

// ─────────────────────────────────────────────────────────────
// HOST — LOBBY VIEW
// ─────────────────────────────────────────────────────────────
function _lqRenderHostLobby() {
  const lq       = appState.liveQuiz;
  const room     = lq.roomData;
  const settings = room.settings || {};
  const joinUrl  = `${location.origin}${location.pathname}?join=${lq.roomCode}`;
  const el       = document.getElementById('lqContainer');

  el.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h2 style="font-size:1.4rem;color:var(--text);">&#9889; ${settings.quizTitle || 'Live Quiz'}</h2>
      <p style="color:var(--text-muted);font-size:0.9rem;">${room.questions.length} questions &bull; ${settings.timePerQuestion}s each &bull; ${settings.groupMode ? 'Team mode' : 'Individual mode'}</p>
    </div>
    <div class="lq-lobby">
      <div class="lq-card lq-room-code-display">
        <div class="lq-lobby-code-row">
          <div class="lq-lobby-code-info">
            <div class="lq-label">Room Code</div>
            <div class="lq-room-code">${lq.roomCode}</div>
            <div class="lq-join-url">Scan QR or go to:<br>${joinUrl}</div>
          </div>
          <div class="lq-lobby-qr" id="lqQRCanvas"></div>
        </div>
      </div>
      <div class="lq-card">
        <div class="lq-player-list">
          <h4>Players Joined</h4>
          <div class="lq-player-count" id="lqPlayerCount">0</div>
          <div class="lq-player-chips" id="lqPlayerChips"><em style="color:var(--text-muted);font-size:0.85rem;">Waiting for players…</em></div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:1rem;margin-top:1.5rem;flex-wrap:wrap;">
      <button class="btn btn-primary" id="lqStartBtn" onclick="_lqHostStart()">&#9658; Start Quiz</button>
      <button class="btn btn-outline" onclick="_lqHostCancel()">Cancel</button>
    </div>`;

  // Generate QR code
  if (window.QRCode) {
    try {
      new QRCode(document.getElementById('lqQRCanvas'), {
        text: joinUrl,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (_) {}
  }
}

function _lqRefreshPlayerChips(ch) {
  const lq    = appState.liveQuiz;
  const state = ch.presenceState();
  const chips = document.getElementById('lqPlayerChips');
  const count = document.getElementById('lqPlayerCount');
  if (!chips) return;

  const players = [];
  Object.values(state).forEach(presences => {
    presences.forEach(p => {
      if (p.role === 'player') players.push(p);
    });
  });

  if (count) count.textContent = players.length;
  if (players.length === 0) {
    chips.innerHTML = '<em style="color:var(--text-muted);font-size:0.85rem;">Waiting for players…</em>';
  } else {
    chips.innerHTML = players.map(p => {
      const team = p.teamName ? ` <span style="opacity:0.6;">(${p.teamName})</span>` : '';
      return `<span class="lq-player-chip">${_esc(p.playerName)}${team}</span>`;
    }).join('');
  }

  // Also register them in participants map so the answer bar is calibrated
  players.forEach(p => {
    if (!lq.participants[p.playerId]) {
      lq.participants[p.playerId] = {
        playerId: p.playerId, playerName: p.playerName,
        teamName: p.teamName || null, score: 0, answers: [],
      };
    }
  });
}

async function _lqHostStart() {
  const lq = appState.liveQuiz;
  document.getElementById('lqStartBtn').disabled = true;
  try {
    await db.updateQuizRoom(lq.roomData.id, { status: 'active', current_q_idx: -1 });
    lq.roomData.status = 'active';
    lq.channel.send({ type: 'broadcast', event: 'QUIZ_STARTED', payload: { questionCount: lq.roomData.questions.length } });
    _lqHostShowQuestion(0);
  } catch (e) {
    showToast('Could not start quiz: ' + e.message);
    document.getElementById('lqStartBtn').disabled = false;
  }
}

function _lqHostCancel() {
  const lq = appState.liveQuiz;
  // Fire-and-forget — don't block the UI on the DB call
  if (lq.roomData) {
    db.updateQuizRoom(lq.roomData.id, { status: 'finished', finished_at: new Date().toISOString() }).catch(() => {});
  }
  _lqCleanup();
  _lqShowCreateForm(); // go back to create form so admin can reselect
}

// ─────────────────────────────────────────────────────────────
// HOST — QUESTION VIEW
// ─────────────────────────────────────────────────────────────
async function _lqHostShowQuestion(qIdx) {
  const lq       = appState.liveQuiz;
  const room     = lq.roomData;
  const questions = room.questions;
  if (qIdx >= questions.length) { _lqHostEndQuiz(); return; }

  lq._locked    = false;
  lq.secondsLeft = room.settings.timePerQuestion || 30;
  room.current_q_idx = qIdx;
  await db.updateQuizRoom(room.id, { current_q_idx: qIdx }).catch(() => {});

  const q         = questions[qIdx];
  const optColors = ['lq-opt-a','lq-opt-b','lq-opt-c','lq-opt-d'];
  const optsHtml  = (q.options || []).map((opt, i) =>
    `<div class="lq-host-opt ${optColors[i] || ''}" id="lqHostOpt${i}">${_esc(opt)}</div>`
  ).join('');

  const el = document.getElementById('lqContainer');
  el.innerHTML = `
    <div class="lq-host-q-view lq-card">
      <div class="lq-host-q-header">
        <span class="lq-host-q-num">Question ${qIdx + 1} / ${questions.length}</span>
        <span class="lq-host-timer" id="lqHostTimer">${lq.secondsLeft}</span>
      </div>
      <div class="lq-host-question-text">${_esc(q.text)}</div>
      <div class="lq-host-options">${optsHtml}</div>
      <div>
        <div class="lq-answer-count-bar"><div class="lq-answer-count-fill" id="lqAnswerFill" style="width:0%"></div></div>
        <div class="lq-answer-count-label" id="lqAnswerLabel">0 answered</div>
      </div>
      <div id="lqHostActions" style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.5rem;">
        <button class="btn btn-warning" onclick="_lqHostLock()" id="lqLockBtn">&#9654; Lock &amp; Reveal</button>
        <button class="btn btn-outline" onclick="_lqHostEndQuiz()">End Quiz</button>
      </div>
    </div>`;

  // Broadcast question (without answer)
  lq.channel.send({
    type: 'broadcast', event: 'SHOW_QUESTION',
    payload: { qIdx, question: { text: q.text, type: q.type, options: q.options } },
  });

  // Reset collected answers for this question
  lq.collectedAnswers[qIdx] = [];

  // Start countdown
  lq.timerInterval = setInterval(() => {
    lq.secondsLeft--;
    const timerEl = document.getElementById('lqHostTimer');
    if (timerEl) {
      timerEl.textContent = lq.secondsLeft;
      timerEl.className = 'lq-host-timer' + (lq.secondsLeft <= 5 ? ' danger' : lq.secondsLeft <= 10 ? ' warning' : '');
    }
    if (lq.secondsLeft <= 0) _lqHostLock();
  }, 1000);
}

function _lqHostLock() {
  const lq = appState.liveQuiz;
  if (lq._locked) return;
  lq._locked = true;
  clearInterval(lq.timerInterval);
  lq.timerInterval = null;

  const qIdx    = lq.roomData.current_q_idx;
  const q       = lq.roomData.questions[qIdx];
  const timeLim = (lq.roomData.settings.timePerQuestion || 30) * 1000;

  lq.channel.send({ type: 'broadcast', event: 'LOCK_ANSWERS', payload: { qIdx } });

  // Score answers
  const answers = lq.collectedAnswers[qIdx] || [];
  answers.forEach(a => {
    const pts = _lqScoreAnswer(a.answer, a.timeMs, q, timeLim);
    const p   = lq.participants[a.playerId];
    if (p) {
      p.score += pts;
      p.answers.push({ qIdx, answer: a.answer, correct: _lqIsCorrect(a.answer, q), points: pts, timeMs: a.timeMs });
    }
  });

  // Reveal correct answer on host options
  const optEls = document.querySelectorAll('.lq-host-opt');
  optEls.forEach((el, i) => {
    const opt = q.options[i];
    if (_lqIsCorrect(opt, q)) el.classList.add('correct');
  });

  const leaderboard = _lqBuildLeaderboard(lq.roomData.settings.groupMode);
  lq.channel.send({ type: 'broadcast', event: 'SHOW_Q_RESULTS', payload: { qIdx, correctAnswer: q.answer, leaderboard } });

  // Show next/end buttons
  const qCount      = lq.roomData.questions.length;
  const isLast      = qIdx >= qCount - 1;
  const actArea = document.getElementById('lqHostActions');
  if (actArea) {
    actArea.innerHTML = isLast
      ? `<button class="btn btn-primary" onclick="_lqHostEndQuiz()">&#127942; Show Final Results</button>`
      : `<button class="btn btn-primary" onclick="_lqHostShowQuestion(${qIdx + 1})">&#9658; Next Question</button>
         <button class="btn btn-outline" onclick="_lqHostEndQuiz()">End Quiz</button>`;
  }
}

async function _lqHostEndQuiz() {
  const lq = appState.liveQuiz;
  clearInterval(lq.timerInterval);
  lq.timerInterval = null;

  const leaderboard = _lqBuildLeaderboard(lq.roomData.settings.groupMode);
  lq.channel.send({ type: 'broadcast', event: 'QUIZ_ENDED', payload: { leaderboard, final: true } });

  // Persist final scores
  const rows = Object.values(lq.participants).map((p) => ({
    room_id:     lq.roomData.id,
    player_id:   p.playerId,
    player_name: p.playerName,
    team_name:   p.teamName || null,
    score:       p.score,
    answers:     p.answers,
    rank:        leaderboard.individual ? leaderboard.individual.findIndex(r => r.playerId === p.playerId) + 1 : null,
  }));
  db.saveAllParticipants(rows).catch(() => {});
  await db.updateQuizRoom(lq.roomData.id, { status: 'finished', finished_at: new Date().toISOString() }).catch(() => {});
  lq.roomData.status = 'finished';

  _lqRenderLeaderboard(leaderboard, true);
}

// ─────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────
function _lqScoreAnswer(answer, timeMs, question, timeLimitMs) {
  if (!_lqIsCorrect(answer, question)) return 0;
  // 1000 base, minus up to 500 for time — minimum 500 for a correct answer
  return Math.round(1000 - (Math.min(timeMs, timeLimitMs) / timeLimitMs) * 500);
}

function _lqIsCorrect(answer, question) {
  if (question.type === 'mcq') {
    // answer may be an index (legacy) or a letter/text
    if (typeof answer === 'number') return answer === parseInt(question.answer);
    return String(answer).trim().toUpperCase() === String(question.answer).trim().toUpperCase();
  }
  if (question.type === 'tfng') {
    return String(answer).trim().toUpperCase() === String(question.answer).trim().toUpperCase();
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// LEADERBOARD BUILDER
// ─────────────────────────────────────────────────────────────
function _lqBuildLeaderboard(groupMode) {
  const parts = Object.values(appState.liveQuiz.participants);

  const individual = [...parts]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, playerId: p.playerId, playerName: p.playerName, teamName: p.teamName || null, score: p.score }));

  if (!groupMode) return { individual };

  // Team aggregation
  const teams = {};
  parts.forEach(p => {
    const key = (p.teamName || 'No Team');
    if (!teams[key]) teams[key] = { teamName: key, score: 0, members: [] };
    teams[key].score += p.score;
    teams[key].members.push({ playerId: p.playerId, playerName: p.playerName, score: p.score });
  });
  const teamList = Object.values(teams)
    .sort((a, b) => b.score - a.score)
    .map((t, i) => {
      t.rank = i + 1;
      t.members.sort((a, b) => b.score - a.score);
      return t;
    });

  return { individual, teams: teamList };
}

// ─────────────────────────────────────────────────────────────
// HOST — LEADERBOARD VIEW (shown between questions and at end)
// ─────────────────────────────────────────────────────────────
function _lqRenderLeaderboard(leaderboard, final) {
  const el  = document.getElementById('lqContainer');

  const individual = leaderboard.individual || [];
  const top3 = individual.slice(0, 3);
  const rest = individual.slice(3);

  const podiumHtml = top3.length ? `
    <div class="lq-podium">
      ${top3.map((p, i) => {
        const cls   = ['first','second','third'][i];
        const medal = ['🥇','🥈','🥉'][i];
        return `<div class="lq-podium-place ${cls}">
          <div class="lq-podium-name">${_esc(p.playerName)}</div>
          <div class="lq-podium-score">${p.score} pts</div>
          <div class="lq-podium-bar ${cls}">${medal}</div>
        </div>`;
      }).join('')}
    </div>` : '';

  const restHtml = rest.map(p => `
    <div class="lq-rank-row">
      <span class="lq-rank-num">#${p.rank}</span>
      <span class="lq-rank-name">${_esc(p.playerName)}${p.teamName ? ` <span class="lq-rank-team">(${_esc(p.teamName)})</span>` : ''}</span>
      <span class="lq-rank-score">${p.score}</span>
    </div>`).join('');

  el.innerHTML = `
    <div class="lq-card lq-leaderboard">
      <h3>${final ? '&#127942; Final Results' : '&#128200; Leaderboard'}</h3>
      ${podiumHtml}
      <div class="lq-rank-list">${restHtml}</div>
      ${final
        ? `<div style="margin-top:1.5rem;text-align:center;">
             <button class="btn btn-primary" onclick="_lqCleanup();_lqRenderLanding()">&#10133; New Quiz</button>
           </div>`
        : ''
      }
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// PLAYER — JOIN FORM
// ─────────────────────────────────────────────────────────────
function showPlayerJoinScreen(prefillCode) {
  _lqShowJoinForm(prefillCode || '');
}

function _lqShowJoinForm(prefillCode) {
  const el = document.getElementById('lqContainer');
  if (!el) return;

  el.innerHTML = `
    <div class="lq-join-screen">
      <button class="btn btn-outline" style="margin-bottom:1rem;" onclick="_lqRenderLanding()">&#8592; Back</button>
      <h2>&#128247; Join a Quiz</h2>
      <p class="lq-subtitle">Enter the room code your teacher shared</p>
      <div class="lq-card">
        <div class="lq-form-group">
          <label>Room Code</label>
          <input type="text" id="lqJoinCode" class="lq-code-input" maxlength="6"
            placeholder="ABC123" value="${_esc(prefillCode)}"
            oninput="this.value=this.value.toUpperCase()">
        </div>
        <div class="lq-form-group">
          <label>Your Name</label>
          <input type="text" id="lqJoinName" maxlength="30" placeholder="e.g. Linh"
            value="${typeof getStudentProfile === 'function' && getStudentProfile() ? _esc(getStudentProfile().name) : ''}">
        </div>
        <div id="lqTeamRow" style="display:none;" class="lq-form-group">
          <label>Team Name</label>
          <input type="text" id="lqJoinTeam" maxlength="30" placeholder="e.g. Team A">
        </div>
        <div id="lqJoinError"></div>
        <button class="btn btn-primary" style="width:100%;margin-top:0.5rem;" onclick="_lqPlayerJoin()">Join!</button>
      </div>
    </div>`;

  // If room code is pre-filled, fetch room to check if team mode is on
  if (prefillCode) {
    db.getQuizRoom(prefillCode).then(room => {
      if (room && room.settings && room.settings.groupMode) {
        const teamRow = document.getElementById('lqTeamRow');
        if (teamRow) teamRow.style.display = '';
      }
    }).catch(() => {});
  }
}

async function _lqPlayerJoin() {
  const code   = (document.getElementById('lqJoinCode').value || '').trim().toUpperCase();
  const name   = (document.getElementById('lqJoinName').value || '').trim();
  const team   = (document.getElementById('lqJoinTeam')?.value || '').trim();
  const errEl  = document.getElementById('lqJoinError');

  errEl.innerHTML = '';
  if (!code || code.length < 4) { errEl.innerHTML = '<div class="lq-error">Please enter a valid room code.</div>'; return; }
  if (!name)                     { errEl.innerHTML = '<div class="lq-error">Please enter your name.</div>'; return; }

  const room = await db.getQuizRoom(code);
  if (!room) {
    errEl.innerHTML = '<div class="lq-error">Room not found or quiz has already ended.</div>'; return;
  }
  if (room.status === 'finished') {
    errEl.innerHTML = '<div class="lq-error">This quiz has already finished.</div>'; return;
  }

  // Get or create a persistent player ID for this browser session
  let playerId = sessionStorage.getItem('lq_pid');
  if (!playerId) {
    playerId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem('lq_pid', playerId);
  }

  // Insert participant row
  const partRow = await db.upsertParticipant({
    room_id:     room.id,
    player_id:   playerId,
    player_name: name,
    team_name:   team || null,
    score:       0,
    answers:     [],
  }).catch(e => { errEl.innerHTML = `<div class="lq-error">Could not join: ${e.message}</div>`; return null; });
  if (!partRow) return;

  // Store in appState
  appState.liveQuiz.mode         = 'player';
  appState.liveQuiz.roomCode     = code;
  appState.liveQuiz.roomData     = room;
  appState.liveQuiz.playerId     = playerId;
  appState.liveQuiz.playerName   = name;
  appState.liveQuiz.teamName     = team || null;
  appState.liveQuiz.participantRow = partRow;

  _lqPlayerSubscribe(code, room, name, team || null, playerId);
  _lqPlayerWaiting(room);
}

// ─────────────────────────────────────────────────────────────
// PLAYER — REALTIME SUBSCRIPTION
// ─────────────────────────────────────────────────────────────
function _lqPlayerSubscribe(roomCode, room, playerName, teamName, playerId) {
  const lq = appState.liveQuiz;

  // Clear any stale "no activity" watchdog
  _lqResetWatchdog();

  const ch = _sb.channel(`quiz:${roomCode}`, {
    config: { broadcast: { self: false }, presence: { key: playerId } },
  });

  ch.on('broadcast', { event: 'QUIZ_STARTED' }, () => {
    _lqResetWatchdog();
    // Already on waiting screen — just update the message
    const msg = document.getElementById('lqWaitMsg');
    if (msg) msg.textContent = 'Quiz starting…';
  });

  ch.on('broadcast', { event: 'SHOW_QUESTION' }, ({ payload }) => {
    _lqResetWatchdog();
    lq.hasAnswered = false;
    lq._qStartMs  = Date.now();
    lq.roomData.current_q_idx = payload.qIdx;
    lq.roomData.questions     = lq.roomData.questions; // preserve snapshot
    _lqPlayerShowQuestion(payload.qIdx, payload.question, room.settings.timePerQuestion || 30);
  });

  ch.on('broadcast', { event: 'LOCK_ANSWERS' }, () => {
    _lqResetWatchdog();
    // Disable any remaining answer buttons
    document.querySelectorAll('.lq-opt-btn').forEach(b => b.disabled = true);
    clearInterval(lq.timerInterval);
    lq.timerInterval = null;
    const ansMsg = document.getElementById('lqAnsweredMsg');
    if (ansMsg) ansMsg.textContent = 'Waiting for results…';
  });

  ch.on('broadcast', { event: 'SHOW_Q_RESULTS' }, ({ payload }) => {
    _lqResetWatchdog();
    _lqPlayerShowQResult(payload);
  });

  ch.on('broadcast', { event: 'QUIZ_ENDED' }, ({ payload }) => {
    _lqResetWatchdog();
    _lqPlayerShowFinalLeaderboard(payload.leaderboard);
  });

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      ch.track({ role: 'player', playerId, playerName, teamName });
    }
  });

  lq.channel = ch;
}

// "No activity" watchdog — shows overlay after 90s of silence from host
let _lqWatchdogTimer = null;
function _lqResetWatchdog() {
  clearTimeout(_lqWatchdogTimer);
  const overlay = document.getElementById('lqHostGoneOverlay');
  if (overlay) overlay.remove();
  _lqWatchdogTimer = setTimeout(() => {
    if (!appState.liveQuiz.mode) return;
    const existing = document.getElementById('lqHostGoneOverlay');
    if (existing) return;
    const ov = document.createElement('div');
    ov.id = 'lqHostGoneOverlay';
    ov.className = 'lq-host-gone-overlay';
    ov.innerHTML = '<span>&#9889;</span><span>Waiting for host<span class="lq-dots"></span></span>';
    document.body.appendChild(ov);
  }, LQ_NO_ANSWER_TIMEOUT_MS);
}

// ─────────────────────────────────────────────────────────────
// PLAYER — WAITING SCREEN
// ─────────────────────────────────────────────────────────────
function _lqPlayerWaiting(room) {
  const el = document.getElementById('lqContainer');
  el.innerHTML = `
    <div class="lq-waiting">
      <div class="lq-player-badge">${_esc(appState.liveQuiz.playerName)}${appState.liveQuiz.teamName ? ` &bull; ${_esc(appState.liveQuiz.teamName)}` : ''}</div>
      <h3>You're in!</h3>
      <p id="lqWaitMsg">Waiting for the host to start<span class="lq-dots"></span></p>
      <div class="lq-live-count"><span class="lq-live-dot"></span> Live</div>
    </div>`;

  // If quiz is already active, show a "joining in progress" note
  if (room.status === 'active') {
    const msg = document.getElementById('lqWaitMsg');
    if (msg) msg.textContent = 'Quiz in progress — you\'ll join from the next question!';
  }
}

// ─────────────────────────────────────────────────────────────
// PLAYER — QUESTION VIEW
// ─────────────────────────────────────────────────────────────
function _lqPlayerShowQuestion(qIdx, question, timeSec) {
  const lq  = appState.liveQuiz;
  const el  = document.getElementById('lqContainer');
  const circumference = LQ_TIMER_CIRCUMFERENCE;

  let optionsHtml = '';
  if (question.type === 'mcq') {
    const colors = ['lq-opt-a','lq-opt-b','lq-opt-c','lq-opt-d'];
    optionsHtml = (question.options || []).map((opt, i) =>
      `<button class="lq-opt-btn ${colors[i] || 'lq-opt-a'}" data-answer="${_esc(String(opt))}"
        onclick="_lqPlayerAnswer('${_escAttr(String(opt))}', this)">${_esc(opt)}</button>`
    ).join('');
  } else if (question.type === 'tfng') {
    optionsHtml = `
      <button class="lq-opt-btn lq-opt-t" data-answer="TRUE"  onclick="_lqPlayerAnswer('TRUE', this)">TRUE</button>
      <button class="lq-opt-btn lq-opt-f" data-answer="FALSE" onclick="_lqPlayerAnswer('FALSE', this)">FALSE</button>
      <button class="lq-opt-btn lq-opt-n" data-answer="NOT GIVEN" onclick="_lqPlayerAnswer('NOT GIVEN', this)" style="grid-column:span 2;">NOT GIVEN</button>`;
  }

  el.innerHTML = `
    <div class="lq-question-view">
      <div class="lq-q-meta">
        <span class="lq-q-num">Q${qIdx + 1}</span>
        <div class="lq-timer-ring" id="lqTimerRing">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle class="lq-timer-ring-bg" cx="28" cy="28" r="22"/>
            <circle class="lq-timer-ring-fill" id="lqRingFill" cx="28" cy="28" r="22"
              stroke-dasharray="${circumference}" stroke-dashoffset="0"/>
          </svg>
          <div class="lq-timer-num" id="lqTimerNum">${timeSec}</div>
        </div>
      </div>
      <div class="lq-question-text">${_esc(question.text)}</div>
      <div class="lq-options-grid" id="lqOptionsGrid">${optionsHtml}</div>
      <div class="lq-answered-msg" id="lqAnsweredMsg" style="display:none;"></div>
    </div>`;

  // Start countdown ring
  let secsLeft = timeSec;
  lq.timerInterval = setInterval(() => {
    secsLeft--;
    const numEl  = document.getElementById('lqTimerNum');
    const fillEl = document.getElementById('lqRingFill');
    if (numEl)  numEl.textContent = Math.max(0, secsLeft);
    if (fillEl) {
      const pct    = secsLeft / timeSec;
      const offset = circumference * (1 - pct);
      fillEl.style.strokeDashoffset = offset;
      if (secsLeft <= 5)       fillEl.classList.add('danger');
      else if (secsLeft <= 10) fillEl.classList.add('warning');
    }
    if (secsLeft <= 0) {
      clearInterval(lq.timerInterval);
      lq.timerInterval = null;
    }
  }, 1000);
}

function _lqPlayerAnswer(answer, btnEl) {
  const lq = appState.liveQuiz;
  if (lq.hasAnswered) return;
  lq.hasAnswered = true;

  // Disable all buttons immediately
  document.querySelectorAll('.lq-opt-btn').forEach(b => {
    b.disabled = true;
    if (b !== btnEl) b.classList.add('dimmed');
  });
  btnEl.classList.add('selected');

  const timeMs = Date.now() - (lq._qStartMs || Date.now());

  // Show answered message
  const msgEl = document.getElementById('lqAnsweredMsg');
  if (msgEl) { msgEl.style.display = ''; msgEl.textContent = 'Answer locked in! Waiting for results…'; }

  // Broadcast answer
  lq.channel.send({
    type: 'broadcast', event: 'PLAYER_ANSWER',
    payload: {
      playerId:   lq.playerId,
      playerName: lq.playerName,
      teamName:   lq.teamName,
      qIdx:       lq.roomData.current_q_idx,
      answer,
      timeMs,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// PLAYER — PER-QUESTION RESULT
// ─────────────────────────────────────────────────────────────
function _lqPlayerShowQResult(payload) {
  const lq      = appState.liveQuiz;
  clearInterval(lq.timerInterval);
  lq.timerInterval = null;

  // Find my result in the leaderboard
  const myEntry = (payload.leaderboard?.individual || []).find(r => r.playerId === lq.playerId);
  const correct = lq.hasAnswered && _lqIsCorrect(
    // Check what we sent — reconstruct from whether any button had .selected
    document.querySelector('.lq-opt-btn.selected')?.dataset?.answer || '',
    { type: lq.roomData?.questions?.[payload.qIdx]?.type, answer: payload.correctAnswer }
  );

  // Re-render options with reveal
  const optEls = document.querySelectorAll('.lq-opt-btn');
  optEls.forEach(btn => {
    const ans = btn.dataset.answer;
    if (_lqIsCorrect(ans, { type: 'mcq', answer: payload.correctAnswer }) ||
        ans === payload.correctAnswer) {
      btn.classList.remove('dimmed');
      btn.classList.add('revealed-correct');
    } else {
      btn.classList.add('dimmed');
    }
  });

  // Overlay result on top of question view
  const resultHtml = `
    <div class="lq-q-result">
      <div class="lq-result-icon">${lq.hasAnswered ? (correct ? '✅' : '❌') : '⏱️'}</div>
      <div class="lq-result-label ${lq.hasAnswered ? (correct ? 'correct' : 'wrong') : 'wrong'}">
        ${lq.hasAnswered ? (correct ? 'Correct!' : 'Wrong') : 'Time\'s up!'}
      </div>
      <div class="lq-result-pts">Correct answer: <strong>${_esc(String(payload.correctAnswer))}</strong></div>
      ${myEntry ? `<div class="lq-result-rank">Rank #${myEntry.rank} &bull; ${myEntry.score} pts</div>` : ''}
    </div>`;

  const existing = document.querySelector('.lq-question-view');
  if (existing) {
    const div = document.createElement('div');
    div.innerHTML = resultHtml;
    existing.appendChild(div.firstElementChild);
  }
}

// ─────────────────────────────────────────────────────────────
// PLAYER — FINAL LEADERBOARD
// ─────────────────────────────────────────────────────────────
function _lqPlayerShowFinalLeaderboard(leaderboard) {
  const lq         = appState.liveQuiz;
  const el         = document.getElementById('lqContainer');
  const individual = leaderboard?.individual || [];
  const groupMode  = leaderboard?.teams !== undefined;

  if (groupMode && leaderboard.teams?.length) {
    _lqRenderGroupLeaderboard(el, leaderboard, lq.playerId, lq.teamName);
  } else {
    const top3 = individual.slice(0, 3);

    const podiumHtml = top3.map((p, i) => {
      const cls   = ['first','second','third'][i];
      const medal = ['🥇','🥈','🥉'][i];
      return `<div class="lq-podium-place ${cls}">
        <div class="lq-podium-name">${_esc(p.playerName)}</div>
        <div class="lq-podium-score">${p.score} pts</div>
        <div class="lq-podium-bar ${cls}">${medal}</div>
      </div>`;
    }).join('');

    const rankHtml = individual.map(p => `
      <div class="lq-rank-row${p.playerId === lq.playerId ? ' me' : ''}">
        <span class="lq-rank-num">#${p.rank}</span>
        <span class="lq-rank-name">${_esc(p.playerName)}${p.playerId === lq.playerId ? ' &#10004;' : ''}</span>
        <span class="lq-rank-score">${p.score}</span>
      </div>`).join('');

    el.innerHTML = `
      <div class="lq-card lq-leaderboard">
        <h3>🏆 Final Results</h3>
        <div class="lq-podium">${podiumHtml}</div>
        <div class="lq-rank-list">${rankHtml}</div>
        <div style="margin-top:1.5rem;text-align:center;">
          <button class="btn btn-primary" onclick="_lqCleanup();_lqRenderLanding()">Done</button>
        </div>
      </div>`;
  }
}

function _lqRenderGroupLeaderboard(el, leaderboard, myPlayerId, myTeam) {
  const teamsHtml = (leaderboard.teams || []).map(t => {
    const membersHtml = t.members.map((m, mi) => `
      <div class="lq-team-member${m.playerId === myPlayerId ? ' me' : ''}">
        <span class="lq-team-member-rank">#${mi+1}</span>
        <span class="lq-team-member-name">${_esc(m.playerName)}${m.playerId === myPlayerId ? ' ✔' : ''}</span>
        <span class="lq-team-member-score">${m.score} pts</span>
      </div>`).join('');
    return `<div class="lq-team-block">
      <div class="lq-team-header">
        <span>#${t.rank} ${_esc(t.teamName)}</span>
        <span class="lq-team-score">${t.score} pts</span>
      </div>
      <div class="lq-team-members">${membersHtml}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="lq-card lq-leaderboard">
      <h3>🏆 Final Results — Teams</h3>
      ${teamsHtml}
      <div style="margin-top:1.5rem;text-align:center;">
        <button class="btn btn-primary" onclick="_lqCleanup();_lqRenderLanding()">Done</button>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// CLEANUP
// ─────────────────────────────────────────────────────────────
function _lqCleanup() {
  const lq = appState.liveQuiz;
  clearInterval(lq.timerInterval);
  clearTimeout(_lqWatchdogTimer);
  const overlay = document.getElementById('lqHostGoneOverlay');
  if (overlay) overlay.remove();
  if (lq.channel) {
    lq.channel.unsubscribe();
    lq.channel = null;
  }
  // Reset state
  appState.liveQuiz = {
    mode: null, roomCode: null, channel: null, roomData: null,
    collectedAnswers: {}, participants: {},
    timerInterval: null, secondsLeft: 0,
    playerId: null, playerName: null, teamName: null, hasAnswered: false,
  };
}

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function _escAttr(str) {
  return String(str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}
