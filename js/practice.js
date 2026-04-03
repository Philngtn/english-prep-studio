'use strict';

let _activePracticePackage = 'intermediate';
let _activeQuizTestId      = null;  // null = showing list; string id = active test

function _getPkg() {
  return PRACTICE_PACKAGES.find(p => p.id === _activePracticePackage) || PRACTICE_PACKAGES[1];
}

/* ── Package picker ────────────────────────────────────────── */
function renderPracticePackagePicker() {
  const el = document.getElementById('practicePkgPicker');
  if (!el) return;
  el.innerHTML = `
    <div class="practice-pkg-picker">
      ${PRACTICE_PACKAGES.map(p => `
        <button class="practice-pkg-btn${p.id === _activePracticePackage ? ' active' : ''}"
          onclick="switchPracticePackage('${p.id}')">
          <span class="pkg-btn-name">${p.name}</span>
          <span class="pkg-btn-level">${p.level}</span>
        </button>`).join('')}
    </div>`;
  _updatePracticeTabVisibility();
}

function switchPracticePackage(id) {
  _activePracticePackage = id;
  _activeQuizTestId = null;
  renderPracticePackagePicker();
  renderVocab();
  renderGrammar();
  renderReadingSkills();
  renderWritingTips();
  renderMiniQuiz();
  // Reset quiz state
  appState.miniQuiz = { current: 0, answers: {}, submitted: false };
}

/* ── Multi-quiz helpers ───────────────────────────────────────── */
// Normalizes pkg.miniQuiz (old flat array OR new array of test objects) → array of test objects
function _normalizeToQuizTests(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const first = arr[0];
  // New format: items are test wrappers (have questions array, no type, no q)
  if (first.questions !== undefined && !first.type && !first.q) return arr;
  // Old format: wrap all question items in a single default test
  return [{ id: 'legacy', title: 'Mini Quiz', description: '', image: '', questions: arr }];
}

function _getActiveQuizQuestions() {
  const tests = _normalizeToQuizTests(_getPkg().miniQuiz);
  if (!_activeQuizTestId) return tests.length === 1 ? tests[0].questions : [];
  const t = tests.find(t => t.id === _activeQuizTestId);
  return t ? t.questions : [];
}

/* ── Show/hide practice section tabs based on available data ─ */
function _updatePracticeTabVisibility() {
  const pkg = _getPkg();
  const sections = [
    { key: 'mini-quiz',      data: pkg.miniQuiz        },
    { key: 'vocab',          data: pkg.vocab          },
    { key: 'grammar',        data: pkg.grammar         },
    { key: 'reading-skills', data: pkg.readingSkills   },
    { key: 'writing-tips',   data: pkg.writingTips     },
  ];

  const activeBtn = document.querySelector('.practice-tab-btn.active');
  const activeKey = activeBtn ? activeBtn.dataset.ptab : null;
  let firstVisibleKey = null;
  let activeIsVisible = false;

  const disabled = pkg.disabledSections || [];

  sections.forEach(({ key, data }) => {
    const visible = !disabled.includes(key) && Array.isArray(data) && data.length > 0;
    const btn = document.querySelector(`.practice-tab-btn[data-ptab="${key}"]`);
    if (btn) btn.style.display = visible ? '' : 'none';
    if (visible && !firstVisibleKey) firstVisibleKey = key;
    if (visible && key === activeKey) activeIsVisible = true;
  });

  // If the active tab is now hidden, move active to the first visible tab
  if (!activeIsVisible && firstVisibleKey) {
    document.querySelectorAll('.practice-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.practice-tab-btn').forEach(el => el.classList.remove('active'));
    const firstBtn  = document.querySelector(`.practice-tab-btn[data-ptab="${firstVisibleKey}"]`);
    const firstPane = document.getElementById('ptab-' + firstVisibleKey);
    if (firstBtn)  firstBtn.classList.add('active');
    if (firstPane) firstPane.classList.add('active');
  }
}

/* ============================================================
   ===== PRACTICE: VOCABULARY =====
   ============================================================ */
function renderVocab() {
  const vocab = _getPkg().vocab;
  const pkg   = _getPkg();

  // Update section description
  const descEl = document.getElementById('vocabPkgDesc');
  if (descEl) descEl.textContent = `${pkg.name} level — ${vocab.length} words`;

  // Vocab cards
  document.getElementById('vocabGrid').innerHTML = vocab.map(v => `
    <div class="vocab-card">
      <div><span class="vocab-word">${v.word}</span><span class="vocab-pos">${v.pos}</span></div>
      <div class="vocab-def">${v.def}</div>
      <div class="vocab-ex">"${v.ex}"</div>
    </div>`).join('');

  // Vocab quiz (first 8 words, match word → definition)
  const quizWords    = vocab.slice(0, 8);
  const shuffledDefs = [...quizWords].sort(() => Math.random() - 0.5).map(v => v.def);
  document.getElementById('vocabQuiz').innerHTML = quizWords.map((v, i) => `
    <div class="vocab-quiz-item">
      <strong>${v.word}</strong>
      <select id="vq_${i}">
        <option value="">-- Select definition --</option>
        ${shuffledDefs.map(d => `<option value="${d}">${d.substring(0, 80)}...</option>`).join('')}
      </select>
    </div>`).join('');

  // Clear previous result
  const res = document.getElementById('vocabQuizResult');
  if (res) { res.className = 'quiz-result'; res.innerHTML = ''; }
}

function checkVocabQuiz() {
  const vocab     = _getPkg().vocab;
  const quizWords = vocab.slice(0, 8);
  let correct = 0;
  quizWords.forEach((v, i) => {
    const sel = document.getElementById('vq_' + i);
    if (sel && sel.value === v.def) correct++;
  });
  const res = document.getElementById('vocabQuizResult');
  res.className = 'quiz-result show';
  res.innerHTML = `<strong>${correct}/${quizWords.length} correct!</strong> ${correct === quizWords.length ? '🎉 Perfect score!' : 'Review the definitions of the words you missed.'}`;
}

/* ============================================================
   ===== PRACTICE: GRAMMAR =====
   ============================================================ */
function renderGrammar() {
  const grammar = _getPkg().grammar;
  document.getElementById('grammarContent').innerHTML = grammar.map((topic, ti) => `
    <div class="grammar-topic">
      <div class="grammar-header">
        <h4>${topic.topic}</h4>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="grammar-body">
        <div class="grammar-rule" style="white-space:pre-wrap;">${topic.rule}</div>
        <h5 style="margin-bottom:0.75rem;font-size:0.9rem;">Practice Questions:</h5>
        ${topic.questions.map((q, qi) => `
          <div class="grammar-question">
            <p>${qi + 1}. ${q.q}</p>
            <div class="grammar-q-options">
              ${q.opts.map((opt, oi) => `
                <button class="grammar-opt-btn"
                  onclick="checkGrammarQ(this,'${_activePracticePackage}',${ti},${qi},${oi})">${opt}</button>`
              ).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function checkGrammarQ(btn, pkgId, topicIdx, qIdx, optIdx) {
  const pkg = PRACTICE_PACKAGES.find(p => p.id === pkgId) || _getPkg();
  const q   = pkg.grammar[topicIdx].questions[qIdx];
  const container = btn.parentElement;
  container.querySelectorAll('.grammar-opt-btn').forEach(b => b.disabled = true);
  if (optIdx === q.answer) {
    btn.classList.add('correct');
    showToast('✓ Correct!');
  } else {
    btn.classList.add('incorrect');
    container.querySelectorAll('.grammar-opt-btn')[q.answer].classList.add('correct');
    showToast('✗ Incorrect. The correct answer is highlighted.');
  }
}

/* ============================================================
   ===== PRACTICE: READING SKILLS =====
   ============================================================ */
function renderReadingSkills() {
  const data   = _getPkg().readingSkills || [];
  const header = `<div class="page-header"><h2>Reading Skills Guide</h2><p>Master every IELTS Reading question type</p></div>`;
  const cards = data.map(card => `
    <div class="tip-card">
      <h4>${card.title}</h4>
      <ul>${(card.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
    </div>`).join('');
  document.getElementById('readingSkillsContent').innerHTML = header + cards;
}

/* ============================================================
   ===== PRACTICE: WRITING TIPS =====
   ============================================================ */
function renderWritingTips() {
  const data   = _getPkg().writingTips || [];
  const header = `<div class="page-header"><h2>Writing Tips & Model Answers</h2><p>Strategies and examples for both IELTS Writing tasks</p></div>`;
  const cards = data.map(card => {
    const bulletsHTML = (card.bullets && card.bullets.length)
      ? `<ul>${card.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : '';
    const badgeHTML  = card.badge  ? `<div class="band-badge">${card.badge}</div>` : '';
    const sampleHTML = card.sample ? `<div class="sample-answer">${card.sample}</div>` : '';
    return `<div class="tip-card"><h4>${card.title}</h4>${bulletsHTML}${badgeHTML}${sampleHTML}</div>`;
  }).join('');
  document.getElementById('writingTipsContent').innerHTML = header + cards;
}

/* ============================================================
   ===== PRACTICE: MINI QUIZ =====
   ============================================================ */
function renderMiniQuiz() {
  _activeQuizTestId = null;
  appState.miniQuiz = { current: 0, answers: {}, submitted: false };
  const tests = _normalizeToQuizTests(_getPkg().miniQuiz);
  if (tests.length > 1) {
    _renderMiniQuizList(tests);
  } else if (tests.length === 1) {
    _activeQuizTestId = tests[0].id;
    _startMiniQuizUI();
  } else {
    document.getElementById('miniQuizContent').innerHTML =
      '<p style="color:var(--text-muted);padding:1rem 0;">No quiz available for this package.</p>';
    document.getElementById('miniQuizNav').style.display = 'none';
    document.getElementById('miniQuizResult').style.display = 'none';
  }
}

function _renderMiniQuizList(tests) {
  const cards = tests.map(t => {
    const qCount = (t.questions || []).length;
    const imgHtml = t.image
      ? `<img class="mq-card-img" src="${t.image}" alt="">`
      : `<div class="mq-card-img mq-card-img-placeholder"><span>&#128221;</span></div>`;
    return `
      <div class="mq-test-card">
        ${imgHtml}
        <div class="mq-card-body">
          <h4 class="mq-card-title">${t.title || 'Mini Quiz'}</h4>
          ${t.description ? `<p class="mq-card-desc">${t.description}</p>` : '<p class="mq-card-desc"></p>'}
          <p class="mq-card-meta">${qCount} question${qCount !== 1 ? 's' : ''}</p>
          <button class="btn btn-primary mq-card-btn" onclick="startMiniQuizTest('${t.id}')">Start Quiz</button>
        </div>
      </div>`;
  }).join('');
  document.getElementById('miniQuizContent').innerHTML = `<div class="mq-test-grid">${cards}</div>`;
  document.getElementById('miniQuizNav').style.display = 'none';
  document.getElementById('miniQuizResult').style.display = 'none';
}

function startMiniQuizTest(testId) {
  _activeQuizTestId = testId;
  appState.miniQuiz = { current: 0, answers: {}, submitted: false };
  _startMiniQuizUI();
}

function _startMiniQuizUI() {
  const tests = _normalizeToQuizTests(_getPkg().miniQuiz);
  const questions = _getActiveQuizQuestions();
  const backBtn = document.getElementById('mqBackBtn');
  if (backBtn) backBtn.style.display = tests.length > 1 ? 'inline-flex' : 'none';
  if (questions.length === 0) {
    document.getElementById('miniQuizContent').innerHTML =
      '<p style="color:var(--text-muted);padding:1rem 0;">No questions in this quiz.</p>';
    document.getElementById('miniQuizNav').style.display = 'none';
    return;
  }
  showMiniQuizQ(0);
  document.getElementById('miniQuizNav').style.display = 'flex';
  document.getElementById('miniQuizResult').style.display = 'none';
  document.getElementById('mqSubmitBtn').style.display = 'none';
}

const _MQ_TYPE_LABELS = {
  multiple_choice:     'Multiple Choice',
  true_false_ng:       'True / False / Not Given',
  matching:            'Vocabulary Matching',
  fill_in:             'Find Words',
  short_answer:        'Short Answer',
  sentence_completion: 'Sentence Completion',
  paraphrase_phrases:  'Paraphrase Phrases',
  table_input:         'Word Forms Table',
  paraphrase:          'Paraphrasing',
  discussion:          'Discussion',
  guided_writing:      'Guided Writing',
};

function showMiniQuizQ(idx) {
  const quiz = _getActiveQuizQuestions();
  const q    = quiz[idx];
  const nav  = `${idx + 1} of ${quiz.length}`;
  document.getElementById('miniQuizContent').innerHTML =
    q.type ? _mqRenderSection(q, idx, nav) : _mqRenderLegacy(q, idx, nav);
  document.getElementById('mqPrevBtn').disabled         = idx === 0;
  document.getElementById('mqNextBtn').style.display    = idx === quiz.length - 1 ? 'none'        : 'inline-flex';
  document.getElementById('mqSubmitBtn').style.display  = idx === quiz.length - 1 ? 'inline-flex' : 'none';
}

/* Legacy MCQ (manually-created, no type field) */
function _mqRenderLegacy(q, idx, nav) {
  const saved = appState.miniQuiz.answers[idx];
  return `
    <div class="mini-quiz-question">
      <div class="question-number">Question ${nav} &bull; ${q.skill || ''}</div>
      <div class="question-text">${q.q}</div>
      <div class="options-list">
        ${(q.opts||[]).map((opt, i) => `
          <label class="option-label${saved===i?' selected':''}">
            <input type="radio" name="mq" value="${i}" onchange="saveMQAnswer(${idx},${i})" ${saved===i?'checked':''}>
            ${opt}
          </label>`).join('')}
      </div>
    </div>`;
}

/* Rich imported section — dispatch on type */
function _mqRenderSection(q, idx, nav) {
  const label = _MQ_TYPE_LABELS[q.type] || q.type.replace(/_/g,' ');
  const saved = appState.miniQuiz.answers[idx] || {};
  let body = '';
  switch (q.type) {
    case 'multiple_choice':     body = _mqMCQ(q, idx, saved);       break;
    case 'true_false_ng':       body = _mqTFNG(q, idx, saved);      break;
    case 'matching':            body = _mqMatching(q, idx, saved);  break;
    case 'fill_in':
    case 'short_answer':
    case 'sentence_completion':
    case 'paraphrase_phrases':  body = _mqFillIn(q, idx, saved);    break;
    case 'table_input':         body = _mqTableInput(q, idx, saved); break;
    case 'paraphrase':
    case 'discussion':
    case 'guided_writing':      body = _mqOpenEnded(q, idx, saved); break;
    default: body = `<p style="color:var(--text-muted);">Unknown section type: ${q.type}</p>`;
  }
  return `
    <div class="mini-quiz-question">
      <div class="question-number">Section ${nav} &bull; ${label}</div>
      <div class="question-text">${q.title || label}</div>
      ${q.instructions ? `<p class="mq-instructions">${q.instructions}</p>` : ''}
      ${body}
    </div>`;
}

function _mqMCQ(q, idx, saved) {
  return (q.questions||[]).map((qq, j) => `
    <div class="mq-sub-question">
      <div class="mq-sub-prompt">${j+1}. ${qq.prompt}</div>
      <div class="options-list">
        ${(qq.options||[]).map((opt, k) => `
          <label class="option-label${saved[j]===k?' selected':''}">
            <input type="radio" name="mq-${idx}-${j}" value="${k}"
              onchange="saveMQSectionAnswer(${idx},${j},${k})" ${saved[j]===k?'checked':''}>
            ${opt}
          </label>`).join('')}
      </div>
    </div>`).join('');
}

function _mqTFNG(q, idx, saved) {
  return `
    <table class="mq-tfng-table">
      <thead><tr><th>Statement</th><th>T</th><th>F</th><th>NG</th></tr></thead>
      <tbody>
        ${(q.questions||[]).map((qq, j) => `
          <tr>
            <td class="mq-tfng-stmt">${qq.statement}</td>
            ${['T','F','NG'].map(v => `
              <td class="mq-tfng-radio">
                <input type="radio" name="tfng-${idx}-${j}" value="${v}"
                  onchange="saveMQSectionAnswer(${idx},${j},'${v}')"
                  ${saved[j]===v?'checked':''}></td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function _mqMatching(q, idx, saved) {
  const set = (q.questions||[])[0];
  if (!set) return '';
  return `
    <div class="mq-matching-grid">
      ${(set.left||[]).map((word, j) => `
        <div class="mq-matching-row">
          <span class="mq-matching-left">${word}</span>
          <select class="mq-matching-select" onchange="saveMQSectionAnswer(${idx},${j},this.value)">
            <option value="">— select —</option>
            ${(set.right||[]).map(m => `<option value="${m.replace(/"/g,'&quot;')}"${saved[j]===m?' selected':''}>${m}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>`;
}

function _mqFillIn(q, idx, saved) {
  return `
    <div class="mq-fill-list">
      ${(q.questions||[]).map((qq, j) => `
        <div class="mq-fill-item">
          <span class="mq-fill-prompt">${j+1}. ${qq.prompt}</span>
          <input class="mq-fill-input" value="${(saved[j]||'').replace(/"/g,'&quot;')}"
            placeholder="Your answer…"
            oninput="saveMQSectionAnswer(${idx},${j},this.value)">
        </div>`).join('')}
    </div>`;
}

function _mqTableInput(q, idx, saved) {
  const tq = (q.questions||[])[0];
  if (!tq) return '';
  return `
    <div class="mq-table-wrap">
      <table class="mq-table-input">
        <thead><tr>${(tq.columns||[]).map(c=>`<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${(tq.rows||[]).map((row, ri) => `
            <tr>
              <td class="mq-table-given">${row.word}</td>
              ${(row.answers||[]).map((_, ci) => `
                <td><input class="mq-table-cell"
                  value="${(saved[ri+'-'+ci]||'').replace(/"/g,'&quot;')}"
                  placeholder="…"
                  oninput="saveMQSectionAnswer(${idx},'${ri}-${ci}',this.value)"></td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _mqOpenEnded(q, idx, saved) {
  return `
    <div class="mq-open-list">
      ${(q.questions||[]).map((qq, j) => {
        const hasSample = qq.sampleAnswers && qq.sampleAnswers[0] !== 'Open-ended';
        return `
        <div class="mq-open-item">
          <p class="mq-open-prompt">${j+1}. ${qq.prompt}</p>
          <textarea class="mq-open-textarea" rows="4" placeholder="Write your answer…"
            oninput="saveMQSectionAnswer(${idx},${j},this.value)">${(saved[j]||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
          ${hasSample ? `
            <button class="mq-sample-btn btn btn-sm btn-outline"
              onclick="this.nextElementSibling.style.display='block';this.style.display='none'">
              Show Sample Answer
            </button>
            <div class="mq-sample-answer" style="display:none">
              ${qq.sampleAnswers.map(a=>`<p>${a}</p>`).join('')}
            </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

/* Save answer for a rich section (key = sub-question index or composite) */
function saveMQSectionAnswer(sectionIdx, key, val) {
  if (!appState.miniQuiz.answers[sectionIdx] ||
      typeof appState.miniQuiz.answers[sectionIdx] !== 'object') {
    appState.miniQuiz.answers[sectionIdx] = {};
  }
  appState.miniQuiz.answers[sectionIdx][key] = val;
}

/* Legacy MCQ answer (backward compat — stores a plain integer) */
function saveMQAnswer(idx, val) { appState.miniQuiz.answers[idx] = val; }

function miniQuizNavigate(dir) {
  const len = _getActiveQuizQuestions().length;
  appState.miniQuiz.current = Math.max(0, Math.min(len - 1, appState.miniQuiz.current + dir));
  showMiniQuizQ(appState.miniQuiz.current);
}

function submitMiniQuiz() {
  const quiz = _getActiveQuizQuestions();
  let correct = 0, total = 0;
  const wrongAnswers = [];

  // Strip HTML tags for clean question text storage
  function _qt(s) { return String(s||'').replace(/<[^>]*>/g,'').trim().substring(0,150); }

  quiz.forEach((q, i) => {
    const ans = appState.miniQuiz.answers[i];

    if (!q.type) {
      // Legacy MCQ — always count toward total
      const opts       = q.opts || [];
      const correctTxt = String(opts[q.answer] ?? q.answer);
      total++;
      if (ans == null) {
        wrongAnswers.push({ question: _qt(q.q || ''), given: null, correct: correctTxt, skipped: true });
      } else {
        const givenTxt = String(opts[ans] ?? ans);
        if (ans === q.answer) { correct++; }
        else { wrongAnswers.push({ question: _qt(q.q || ''), given: givenTxt, correct: correctTxt }); }
      }

    } else if (q.type === 'multiple_choice') {
      (q.questions||[]).forEach((qq, j) => {
        const opts       = qq.options || [];
        const correctTxt = String(opts[qq.answer] ?? qq.answer);
        const givenIdx   = (ans != null && typeof ans === 'object' && ans[j] != null) ? ans[j] : null;
        total++;
        if (givenIdx == null) {
          wrongAnswers.push({ question: _qt(qq.prompt || ''), given: null, correct: correctTxt, skipped: true });
        } else {
          const givenTxt = String(opts[givenIdx] ?? givenIdx);
          if (givenIdx === qq.answer) { correct++; }
          else { wrongAnswers.push({ question: _qt(qq.prompt || ''), given: givenTxt, correct: correctTxt }); }
        }
      });

    } else if (q.type === 'true_false_ng') {
      (q.questions||[]).forEach((qq, j) => {
        const given      = ans && ans[j];
        const correctTxt = String(qq.answer);
        total++;
        if (!given) {
          wrongAnswers.push({ question: _qt(qq.statement || ''), given: null, correct: correctTxt, skipped: true });
        } else {
          if (given === qq.answer) { correct++; }
          else { wrongAnswers.push({ question: _qt(qq.statement || ''), given: String(given), correct: correctTxt }); }
        }
      });

    } else if (['fill_in','short_answer','sentence_completion','paraphrase_phrases'].includes(q.type)) {
      (q.questions||[]).forEach((qq, j) => {
        const user       = ((ans && ans[j]) || '').trim().toLowerCase();
        const correctTxt = (qq.answers||[]).join(' / ');
        const expected   = (qq.answers||[]).map(a => a.toLowerCase());
        total++;
        if (!user) {
          wrongAnswers.push({ question: _qt(qq.prompt || ''), given: null, correct: correctTxt, skipped: true });
        } else {
          if (expected.some(e => user === e)) { correct++; }
          else { wrongAnswers.push({ question: _qt(qq.prompt || ''), given: user, correct: correctTxt }); }
        }
      });

    } else if (q.type === 'matching') {
      const set = (q.questions||[])[0];
      if (set && set.left) {
        (set.left||[]).forEach((word, j) => {
          const given    = ans && ans[j];
          const expected = set.answers && set.answers[word];
          total++;
          if (!given) {
            wrongAnswers.push({ question: `Match: "${word}"`, given: null, correct: String(expected||'?'), skipped: true });
          } else {
            if (given === expected) { correct++; }
            else { wrongAnswers.push({ question: `Match: "${word}"`, given: String(given), correct: String(expected||'?') }); }
          }
        });
      }

    } else if (q.type === 'table_input') {
      const tq = (q.questions||[])[0];
      if (tq) {
        (tq.rows||[]).forEach((row, ri) => {
          (row.answers||[]).forEach((expected, ci) => {
            const user = ((ans && ans[`${ri}-${ci}`]) || '').trim().toLowerCase();
            total++;
            if (!user) {
              wrongAnswers.push({ question: _qt(row.word || `Row ${ri+1}`) + ` (col ${ci+1})`, given: null, correct: String(expected), skipped: true });
            } else {
              if (user === expected.toLowerCase()) { correct++; }
              else { wrongAnswers.push({ question: _qt(row.word || `Row ${ri+1}`) + ` (col ${ci+1})`, given: user, correct: String(expected) }); }
            }
          });
        });
      }
    }
    // paraphrase / discussion / guided_writing — not auto-scored, not counted in total
  });

  // Save to Supabase in the background (always save if quiz was submitted)
  const pkg = _getPkg();
  db.savePracticeResult(pkg.id, pkg.name + ' · Mini Quiz', correct, total, wrongAnswers)
    .catch(e => console.warn('[DB] Practice result save failed:', e));

  const res = document.getElementById('miniQuizResult');
  res.style.display = 'block';
  res.className = 'quiz-result show';
  const hasGradable = quiz.some(q => q.type !== 'paraphrase' && q.type !== 'discussion' && q.type !== 'guided_writing');
  const scoreText = total > 0
    ? `${correct} / ${total} correct — Estimated Band: ${rawToBand(correct, total)}`
    : hasGradable
      ? `${correct} / ${total} correct — all questions skipped`
      : 'Completed — open-ended sections are self-checked.';
  const skipped = wrongAnswers.filter(w => w.skipped).length;
  const skippedNote = skipped > 0 ? `<p style="margin-top:0.4rem;color:var(--text-muted);font-size:0.9rem;">${skipped} question${skipped > 1 ? 's' : ''} skipped — counted as incorrect.</p>` : '';
  res.innerHTML = `
    <h3 style="margin-bottom:0.5rem;">Mini Quiz Results</h3>
    <p><strong>${scoreText}</strong></p>
    ${skippedNote}
    <p style="margin-top:0.5rem;color:var(--text-muted);">Review the questions you missed and study the relevant sections.</p>
    <button class="btn btn-primary" style="margin-top:1rem;" onclick="startMiniQuizTest(_activeQuizTestId)">Retake Quiz</button>`;
  document.getElementById('miniQuizNav').style.display = 'none';
}
