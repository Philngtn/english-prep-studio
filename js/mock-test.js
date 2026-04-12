'use strict';

let _lastPassageId    = null;
let _lastSectionId    = null;
let _transcriptExpanded = false;

/* ============================================================
   ===== TEST SECTION START =====
   ============================================================ */
/* Show a friendly message when no content has been configured for a section */
function _showNoContent(section) {
  showModal(
    'No Content Configured',
    `No ${capitalize(section)} content has been set up for the selected test yet. ` +
    `Go to the Admin panel and import content for this test first.`,
    () => {}
  );
}

function startTestSection(section) {
  // Guard: reading and listening require admin-imported data
  if (section === 'reading' || section === 'listening') {
    if (!getActiveTestData(section)) { _showNoContent(section); return; }
  }

  switchTab('mock-test');
  appState.test = {
    active: true,
    section,
    answers: {},
    flags: new Set(),
    currentQ: 0,
    timerSeconds: section === 'listening' ? 30*60 : (section === 'speaking' ? 14*60 : 60*60),
    timerInterval: null,
    startTime: Date.now(),
    flatQuestions: [],
    passages: [],
  };

  document.getElementById('testSelectorPage').style.display = 'none';
  document.getElementById('testResultsPage').style.display  = 'none';
  document.getElementById('testInterface').style.display    = 'block';
  document.getElementById('timerSectionName').textContent   = capitalize(section);

  if (section === 'reading')   setupReadingTest();
  else if (section === 'listening') setupListeningTest();
  else if (section === 'writing')   setupWritingTest();
  else if (section === 'speaking')  setupSpeakingTest();
  else if (section === 'full')      setupReadingTest(); // Start with reading for full test

  startTimer();
  renderQNavigator();
  renderCurrentQuestion();
}

/* Return the active test's data for a given section, falling back to globals */
function getActiveTestData(section) {
  const pkg  = TEST_PACKAGES[appState.activePackage];
  const test = pkg && pkg.tests[appState.activeTest];
  return (test && test[section]) || null;
}
function setActivePackage(id) {
  appState.activePackage = id;
  _populateTestPicker();
}
function setActiveTest(id) {
  appState.activeTest = id;
}
/* Populate the package picker from TEST_PACKAGES keys */
function _populatePackagePicker() {
  const pkgPicker = document.getElementById('packagePicker');
  if (!pkgPicker) return;
  pkgPicker.innerHTML = Object.values(TEST_PACKAGES)
    .map(p => `<option value="${p.id}">${p.name}</option>`)
    .join('');
  pkgPicker.value = appState.activePackage;
}
/* Sync the test-picker dropdown options when package changes */
function _populateTestPicker() {
  _populatePackagePicker();
  const pkg = TEST_PACKAGES[appState.activePackage];
  if (!pkg) return;
  const picker = document.getElementById('testPicker');
  if (!picker) return;
  picker.innerHTML = Object.values(pkg.tests)
    .map(t => `<option value="${t.id}">${t.name}</option>`)
    .join('');
  appState.activeTest = Object.keys(pkg.tests)[0];
  picker.value = appState.activeTest;
}

function setupReadingTest() {
  appState.test.section = 'reading';
  appState.test.timerSeconds = 60 * 60;
  document.getElementById('timerSectionName').textContent = 'Reading';
  const data = getActiveTestData('reading');
  const qs = [];
  data.passages.forEach(p => p.questions.forEach(q => qs.push({...q, passageId: p.id})));
  appState.test.flatQuestions = qs;
  appState.test.passages = data.passages;
}

function setupListeningTest() {
  appState.test.section = 'listening';
  appState.test.timerSeconds = 30 * 60;
  document.getElementById('timerSectionName').textContent = 'Listening';
  const data = getActiveTestData('listening');
  const qs = [];
  data.sections.forEach(s => s.questions.forEach(q => qs.push({...q, sectionId: s.id})));
  appState.test.flatQuestions = qs;
  appState.test.sections = data.sections;
  lsStartAudioHighlight();
}

function setupWritingTest() {
  appState.test.section = 'writing';
  appState.test.timerSeconds = 60 * 60;
  document.getElementById('timerSectionName').textContent = 'Writing';
  appState.test.flatQuestions = [
    { id: 'w1', type: 'writing', taskNum: 1 },
    { id: 'w2', type: 'writing', taskNum: 2 },
  ];
}

function setupSpeakingTest() {
  appState.test.section = 'speaking';
  appState.test.timerSeconds = 14 * 60;
  document.getElementById('timerSectionName').textContent = 'Speaking';
  appState.test.flatQuestions = [
    { id: 'sp1', type: 'speaking', partNum: 1 },
    { id: 'sp2', type: 'speaking', partNum: 2 },
    { id: 'sp3', type: 'speaking', partNum: 3 },
  ];
}

/* ============================================================
   ===== TIMER =====
   ============================================================ */
function startTimer() {
  const display = document.getElementById('timerDisplay');
  if (appState.timerCountdown) {
    display.textContent = formatTime(appState.test.timerSeconds);
    appState.test.timerInterval = setInterval(() => {
      appState.test.timerSeconds--;
      const s = appState.test.timerSeconds;
      display.textContent = formatTime(s);
      display.className = 'timer-display';
      if (s <= 300) display.classList.add('danger');
      else if (s <= 600) display.classList.add('warning');
      if (s <= 0) { clearInterval(appState.test.timerInterval); showToast('Time is up! Submitting...'); submitTest(); }
    }, 1000);
  } else {
    display.textContent = '+' + formatTime(0);
    display.className = 'timer-display';
    appState.test.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - appState.test.startTime) / 1000);
      display.textContent = '+' + formatTime(elapsed);
    }, 1000);
  }
}

function stopTimer() {
  if (appState.test.timerInterval) clearInterval(appState.test.timerInterval);
}
/* ============================================================
   ===== QUESTION NAVIGATOR =====
   ============================================================ */
function renderQNavigator() {
  const container = document.getElementById('qNavigator');
  const qs = appState.test.flatQuestions;
  if (qs.length <= 3) {
    container.innerHTML = '';
    const q = qs[appState.test.currentQ];
    const qLabel = document.getElementById('timerQCount');
    if (appState.test.section === 'writing' && q)
      qLabel.textContent = `Task ${q.taskNum}`;
    else if (appState.test.section === 'speaking' && q)
      qLabel.textContent = `Part ${q.partNum}`;
    return;
  }

  if (appState.test.section === 'reading') {
    const passages = appState.test.passages || [];
    let html = '';
    let lastPassageId = null;
    qs.forEach((q, i) => {
      if (q.passageId && q.passageId !== lastPassageId) {
        const pIdx = passages.findIndex(p => p.id === q.passageId);
        html += `<span class="q-nav-passage-label">Passage ${pIdx + 1}</span>`;
        lastPassageId = q.passageId;
      }
      const answered = appState.test.answers[q.id] !== undefined;
      const flagged  = appState.test.flags.has(q.id);
      const current  = i === appState.test.currentQ;
      let cls = 'q-nav-btn';
      if (current)  cls += ' current';
      if (flagged)  cls += ' flagged';
      else if (answered) cls += ' answered';
      html += `<button class="${cls}" onclick="jumpToQuestion(${i})">${i + 1}</button>`;
    });
    container.innerHTML = html;
    const currentQ = qs[appState.test.currentQ];
    if (currentQ && currentQ.passageId) {
      const passageIdx = passages.findIndex(p => p.id === currentQ.passageId);
      const passage = passages[passageIdx];
      document.getElementById('timerQCount').textContent =
        `Passage ${passageIdx + 1} of ${passages.length}: ${passage ? passage.title : ''}`;
    }
  } else if (appState.test.section === 'listening') {
    const sections = appState.test.sections || [];
    let html = '';
    let lastSectionId = null;
    qs.forEach((q, i) => {
      if (q.sectionId && q.sectionId !== lastSectionId) {
        const sIdx = sections.findIndex(s => s.id === q.sectionId);
        html += `<span class="q-nav-passage-label">Section ${sIdx + 1}</span>`;
        lastSectionId = q.sectionId;
      }
      const answered = q.type === 'multi'
        ? (appState.test.answers[q.id] || '').split(',').filter(Boolean).length >= q.count
        : appState.test.answers[q.id] !== undefined;
      const flagged  = appState.test.flags.has(q.id);
      const current  = i === appState.test.currentQ;
      let cls = 'q-nav-btn';
      if (current)  cls += ' current';
      if (flagged)  cls += ' flagged';
      else if (answered) cls += ' answered';
      const label = q.qNum != null ? q.qNum : i + 1;
      if (String(label).includes('&')) cls += ' wide';
      html += `<button class="${cls}" onclick="jumpToQuestion(${i})">${label}</button>`;
    });
    container.innerHTML = html;
    const currentQ = qs[appState.test.currentQ];
    if (currentQ && currentQ.sectionId) {
      const sIdx = sections.findIndex(s => s.id === currentQ.sectionId);
      const sec  = sections[sIdx];
      document.getElementById('timerQCount').textContent =
        `Section ${sIdx + 1} of ${sections.length}: ${sec ? sec.title : ''}`;
    }
  } else {
    container.innerHTML = qs.map((q, i) => {
      const answered = appState.test.answers[q.id] !== undefined;
      const flagged  = appState.test.flags.has(q.id);
      const current  = i === appState.test.currentQ;
      let cls = 'q-nav-btn';
      if (current)  cls += ' current';
      if (flagged)  cls += ' flagged';
      else if (answered) cls += ' answered';
      const label = q.qNum != null ? q.qNum : i + 1;
      if (String(label).includes('&')) cls += ' wide';
      return `<button class="${cls}" onclick="jumpToQuestion(${i})">${label}</button>`;
    }).join('');
    document.getElementById('timerQCount').textContent =
      `Question ${appState.test.currentQ + 1} of ${qs.length}`;
  }
}

function jumpToQuestion(idx) {
  const qs = appState.test.flatQuestions;
  // If jumping into a group, always land on its first peer
  const dest = qs[idx];
  if (dest && dest.groupId) {
    const fp = qs.findIndex(fq => fq.groupId === dest.groupId);
    if (fp !== -1) idx = fp;
  }
  const targetQ = qs[idx];
  const currentQ = qs[appState.test.currentQ];

  // Listening: if target is in the same section already rendered, just scroll
  if (targetQ && targetQ.sectionId && currentQ && currentQ.sectionId === targetQ.sectionId) {
    appState.test.currentQ = idx;
    renderQNavigator();
    setTimeout(() => {
      const el = document.getElementById('ls-q-' + targetQ.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
    return;
  }

  if (targetQ && targetQ.passageId && (!currentQ || currentQ.passageId !== targetQ.passageId)) {
    _lastPassageId = null;
  }
  appState.test.currentQ = idx;
  renderCurrentQuestion();
  renderQNavigator();
  if (targetQ && targetQ.passageId) {
    setTimeout(() => {
      const card = document.getElementById('q-card-' + targetQ.id);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function navigateQuestion(dir) {
  const qs = appState.test.flatQuestions;
  const q = qs[appState.test.currentQ];

  if (q && q.sectionId) {
    // Listening: navigate by section (Part 1 → 2 → 3 → 4)
    const sections = appState.test.sections || [];
    const sectionIdx = sections.findIndex(s => s.id === q.sectionId);
    const nextSectionIdx = sectionIdx + dir;
    if (nextSectionIdx >= sections.length) { confirmSubmit(); return; }
    if (nextSectionIdx < 0) return;
    const nextSection = sections[nextSectionIdx];
    const nextQIdx = qs.findIndex(fq => fq.sectionId === nextSection.id);
    if (nextQIdx !== -1) appState.test.currentQ = nextQIdx;
  } else if (q && q.passageId) {
    // Reading: navigate by passage
    const passages = appState.test.passages || [];
    const passageIdx = passages.findIndex(p => p.id === q.passageId);
    const nextIdx = passageIdx + dir;
    if (nextIdx >= passages.length) { confirmSubmit(); return; }
    if (nextIdx < 0) return;
    const nextPassageId = passages[nextIdx].id;
    const nextQIdx = qs.findIndex(pq => pq.passageId === nextPassageId);
    if (nextQIdx === -1) return;
    _lastPassageId = null;
    appState.test.currentQ = nextQIdx;
  } else if (q && q.groupId) {
    // Grouped question: treat the whole group as one unit when navigating
    const peerIdxs = qs.reduce((acc, fq, i) => { if (fq.groupId === q.groupId) acc.push(i); return acc; }, []);
    const next = dir > 0
      ? Math.min(peerIdxs[peerIdxs.length - 1] + 1, qs.length - 1)
      : Math.max(peerIdxs[0] - 1, 0);
    // If landing on another group, go to its first peer
    const nextQ = qs[next];
    if (nextQ && nextQ.groupId) {
      const fp = qs.findIndex(fq => fq.groupId === nextQ.groupId);
      appState.test.currentQ = fp !== -1 ? fp : next;
    } else {
      appState.test.currentQ = next;
    }
  } else {
    appState.test.currentQ = Math.max(0, Math.min(qs.length - 1, appState.test.currentQ + dir));
  }

  renderCurrentQuestion();
  renderQNavigator();
}

function toggleFlag() {
  const q = appState.test.flatQuestions[appState.test.currentQ];
  if (!q) return;
  if (appState.test.flags.has(q.id)) appState.test.flags.delete(q.id);
  else appState.test.flags.add(q.id);
  const flagged = appState.test.flags.has(q.id);
  const btn = document.getElementById('flagBtn');
  if (btn) btn.classList.toggle('active', flagged);
  renderQNavigator();
  showToast(flagged ? 'Question flagged for review.' : 'Flag removed.');
}

/* ============================================================
   ===== RENDER CURRENT QUESTION =====
   ============================================================ */
function renderCurrentQuestion() {
  const qs = appState.test.flatQuestions;
  const idx = appState.test.currentQ;
  const q   = qs[idx];
  const body = document.getElementById('testBody');
  if (!q) return;

  // Reading: split pane layout
  if (q.passageId) {
    _updateListeningPlayerBar(null);
    body.style.display = 'none';
    document.getElementById('readingSplit').style.display = 'grid';
    _renderReadingSplit(q, idx, qs);
    return;
  }

  // Non-reading: regular single-column layout
  document.getElementById('readingSplit').style.display = 'none';
  body.style.display = 'block';

  document.getElementById('prevBtn').disabled = idx === 0;
  document.getElementById('nextBtn').textContent = idx === qs.length - 1 ? 'Submit ✓' : 'Next →';
  const flagBtn = document.getElementById('flagBtn');
  if (flagBtn) flagBtn.classList.toggle('active', appState.test.flags.has(q.id));

  // Writing
  if (q.type === 'writing') {
    _updateListeningPlayerBar(null);
    const writingData = getActiveTestData('writing') || {
      task1: { prompt: '', instructions: '', chartDescription: '', imageUrl: '', imageCaption: '', imageType: '', minWords: 150, rubric: [], sampleAnswer: '' },
      task2: { prompt: '', instructions: '', minWords: 250, rubric: [], sampleAnswer: '' },
    };
    const task  = q.taskNum === 1 ? writingData.task1 : writingData.task2;
    const saved = appState.test.answers[q.id] || '';
    const instrBlock = task.instructions ? `<div class="writing-instructions">${task.instructions}</div>` : '';
    const imageBlock = (q.taskNum === 1 && task.imageUrl)
      ? `<div class="writing-image-wrap"><img src="${task.imageUrl}" class="writing-task-img" alt="${task.imageCaption||'Chart'}"><div class="writing-image-caption">${task.imageCaption||''}</div></div>`
      : (q.taskNum === 1 && task.chartDescription ? `<div class="writing-chart-desc">${task.chartDescription}</div>` : '');
    body.innerHTML = `
      <div class="passage-label">Writing Task ${q.taskNum}</div>
      <div class="writing-task-desc">${task.prompt}</div>
      ${instrBlock}${imageBlock}
      <textarea class="writing-area" id="writeArea_${q.id}" placeholder="Write your response here..." oninput="saveWriting('${q.id}')">${saved}</textarea>
      <div class="word-count" id="wc_${q.id}">0 words (minimum: ${task.minWords})</div>
      <div class="writing-rubric">
        <p style="font-weight:600;margin-bottom:0.5rem;">Self-assessment checklist:</p>
        ${task.rubric.map((r,i) => `
          <div class="rubric-item">
            <label><input type="checkbox" onchange="saveRubric('${q.id}',${i},this.checked)" ${(appState.test.answers['rubric_'+q.id+'_'+i]) ? 'checked' : ''}> ${r}</label>
          </div>`).join('')}
      </div>`;
    updateWordCount(q.id, saved);
    return;
  }

  // Speaking
  if (q.type === 'speaking') {
    _updateListeningPlayerBar(null);
    const speakingData = getActiveTestData('speaking') || {
      part1: { title: 'Part 1', questions: [] },
      part2: { title: 'Part 2', cueCard: '', followUp: '', sampleAnswer: '', prepTime: 60, speakingTime: 120 },
      part3: { title: 'Part 3', questions: [] },
    };
    const part = q.partNum;
    const data = part === 1 ? speakingData.part1 : part === 2 ? speakingData.part2 : speakingData.part3;
    let html = `<div class="passage-label">Speaking ${data.title}</div>`;
    if (part === 1) {
      html += data.questions.map((sq, i) => {
        const qText = typeof sq === 'string' ? sq : (sq.text || '');
        return `
        <div class="speaking-part">
          <h4>Question ${i + 1}</h4>
          <p style="margin-bottom:0.75rem;">${qText}</p>
          <textarea class="notes-area" placeholder="Write your answer notes here..." oninput="saveSpeaking('sp1_${i}',this.value)">${appState.test.answers['sp1_'+i]||''}</textarea>
        </div>`;
      }).join('');
    } else if (part === 2) {
      html += `<div class="speaking-part"><h4>${data.cueCard.topic}</h4>
        <div class="cue-card">
          <h5>You should say:</h5>
          <ul>${data.cueCard.bullets.map(b=>`<li>${b}</li>`).join('')}</ul>
          <p style="font-size:0.82rem;color:var(--text-muted);margin-top:0.5rem;">${data.cueCard.note}</p>
        </div>
        <textarea class="notes-area" style="min-height:150px;" placeholder="Preparation notes..." oninput="saveSpeaking('sp2',this.value)">${appState.test.answers['sp2']||''}</textarea>
      </div>`;
    } else {
      html += data.questions.map((sq, i) => {
        const qText = typeof sq === 'string' ? sq : (sq.text || '');
        return `
        <div class="speaking-part">
          <h4>Discussion Question ${i + 1}</h4>
          <p style="margin-bottom:0.75rem;">${qText}</p>
          <textarea class="notes-area" placeholder="Your ideas..." oninput="saveSpeaking('sp3_${i}',this.value)">${appState.test.answers['sp3_'+i]||''}</textarea>
        </div>`;
      }).join('');
    }
    body.innerHTML = html;
    return;
  }

  // Listening — show ALL questions in the section at once
  if (q.sectionId) {
    const sections    = appState.test.sections || [];
    const section     = sections.find(s => s.id === q.sectionId);
    const sectionIdx  = sections.findIndex(s => s.id === q.sectionId);
    const sectionChanged = _lastSectionId !== (section && section.id);
    _updateListeningPlayerBar(section);  // updates _lastSectionId + _transcriptExpanded

    if (sectionChanged) {
      const sectionQs = qs.filter(fq => fq.sectionId === q.sectionId);
      const firstQIdx = qs.findIndex(fq => fq.sectionId === q.sectionId);

      // Seek audio to start of first question in section
      const firstStart = sectionQs[0] && sectionQs[0].questionStart;
      if (firstStart != null && firstStart >= 0) {
        const audioEl = document.querySelector('#lpbPlayer audio');
        if (audioEl) {
          const doSeek = () => { audioEl.currentTime = firstStart; };
          if (audioEl.readyState >= 1) doSeek();
          else audioEl.addEventListener('loadedmetadata', doSeek, { once: true });
        }
      }

      // Transcript (collapsed by default on section change)
      let transcriptHTML = '';
      if (section && section.transcript && !appState.timerCountdown) {
        const expanded = _transcriptExpanded;
        transcriptHTML = `
          <div class="listening-transcript">
            <div class="transcript-toggle" onclick="toggleTranscript()">
              <h4>&#127925; ${section.title}</h4>
              <span class="transcript-arrow">${expanded ? '&#9650; Hide transcript' : '&#9660; Show transcript'}</span>
            </div>
            <div class="transcript-body"${expanded ? '' : ' style="display:none"'}>
              <p>${section.transcript}</p>
            </div>
          </div>`;
      }

      // Render every question in this section, each wrapped with a scroll anchor
      const questionsHtml = sectionQs.map((sq, i) =>
        `<div id="ls-q-${sq.id}">${renderQuestionHTML(sq, firstQIdx + i)}</div>`
      ).join('');

      body.innerHTML = transcriptHTML + questionsHtml;
    }

    // Override nav buttons with section-level labels
    document.getElementById('prevBtn').disabled = sectionIdx === 0;
    document.getElementById('nextBtn').textContent =
      sectionIdx === sections.length - 1 ? 'Submit ✓' : 'Next Part →';
    if (flagBtn) flagBtn.classList.toggle('active', appState.test.flags.has(q.id));

    // Scroll to the specific question anchor
    setTimeout(() => {
      const el = document.getElementById('ls-q-' + q.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
    return;
  }

  body.innerHTML = renderQuestionHTML(q, idx);
}

function _renderReadingSplit(q, idx, qs) {
  const passages   = appState.test.passages || [];
  const passage    = passages.find(p => p.id === q.passageId);
  const passageIdx = passages.findIndex(p => p.id === q.passageId);
  const passageQs  = qs.filter(pq => pq.passageId === q.passageId);
  const firstIdx   = qs.findIndex(pq => pq.passageId === q.passageId);

  // Left pane: only re-render when passage changes
  if (_lastPassageId !== q.passageId) {
    document.getElementById('readingPassagePane').innerHTML = `
      <div class="reading-pane-header">
        <span class="passage-label">Passage ${passageIdx + 1} of ${passages.length}</span>
        <h3 class="reading-pane-title">${passage ? passage.title : ''}</h3>
      </div>
      <div class="reading-passage-content">${passage ? passage.text : ''}</div>`;
    _lastPassageId = q.passageId;
  }

  // Right pane: re-render questions, preserve scroll position
  const qPane = document.getElementById('readingQuestionsPane');
  const savedScroll = qPane.scrollTop;
  qPane.innerHTML =
    `<div class="reading-pane-header">
      <span style="font-size:0.88rem;color:var(--text-muted);">
        Questions ${firstIdx + 1}–${firstIdx + passageQs.length}
      </span>
    </div>` +
    _rdRenderQuestionsPane(passageQs, firstIdx);
  qPane.scrollTop = savedScroll;
  _rdAttachHandlers(qPane);

  // Nav buttons: passage-level
  document.getElementById('prevBtn').disabled = passageIdx === 0;
  document.getElementById('nextBtn').textContent =
    passageIdx === passages.length - 1 ? 'Submit ✓' : 'Next Passage →';
}

/* Show/update the sticky listening player bar when the section changes.
   Passing null hides the bar (used when leaving a listening test). */
function toggleTranscript() {
  _transcriptExpanded = !_transcriptExpanded;
  const body   = document.querySelector('.transcript-body');
  const arrow  = document.querySelector('.transcript-arrow');
  if (body)  body.style.display = _transcriptExpanded ? '' : 'none';
  if (arrow) arrow.innerHTML    = _transcriptExpanded ? '&#9650; Hide transcript' : '&#9660; Show transcript';
}

function _updateListeningPlayerBar(section) {
  const bar   = document.getElementById('listeningPlayerBar');
  const label = document.getElementById('lpbSectionLabel');
  const player = document.getElementById('lpbPlayer');
  if (!bar) return;

  if (!section) {
    bar.style.display = 'none';
    player.innerHTML = '';
    _lastSectionId = null;
    lsStopAudioHighlight();
    return;
  }

  bar.style.display = 'block';
  label.textContent = '🎧 ' + section.title;
  // Show lock badge next to label when timer is counting down
  bar.classList.toggle('lpb-pause-locked', !!appState.timerCountdown);

  // Only rebuild the audio element when the section actually changes
  if (_lastSectionId !== section.id) {
    player.innerHTML = _buildAudioPlayer(section.audioUrl);
    _lastSectionId = section.id;
    _transcriptExpanded = false;  // collapse transcript on new section

    // In countdown mode: auto-play and prevent pausing
    const audioEl = player.querySelector('audio');
    if (audioEl && appState.timerCountdown) {
      audioEl.play().catch(() => {});  // trigger autoplay (may be blocked first interaction)
      audioEl.addEventListener('pause', _lsPauseLockHandler);
    }
  }
}

/* Prevents the student from pausing audio during a timed test */
function _lsPauseLockHandler() {
  if (appState.timerCountdown && appState.test && appState.test.active) {
    this.play();
    showToast('Pause is disabled during a timed test.');
  }
}

function seekListeningAudio(seconds) {
  const audioEl = document.querySelector('#lpbPlayer audio');
  if (!audioEl) { showToast('No audio player found.'); return; }
  const doSeek = () => { audioEl.currentTime = seconds; };
  if (audioEl.readyState >= 1) doSeek();
  else audioEl.addEventListener('loadedmetadata', doSeek, { once: true });
}

function _buildAudioPlayer(url) {
  if (!url) return '';
  const gdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (gdMatch) {
    return `<iframe class="listening-audio-player"
      src="https://drive.google.com/file/d/${gdMatch[1]}/preview"
      allow="autoplay" allowfullscreen></iframe>`;
  }
  return `<audio class="listening-audio-player" src="${url}" controls autoplay></audio>`;
}

/* ============================================================
   ===== READING QUESTION RENDERERS =====
   ============================================================ */
function _rdEsc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* Build the HTML for all questions in a passage, grouping by groupId */
function _rdRenderQuestionsPane(passageQs, firstIdx) {
  const rendered = new Set();
  const cards    = [];
  passageQs.forEach((pq, i) => {
    const sid = String(pq.id);
    if (rendered.has(sid)) return;
    if (pq.groupId) {
      const peers = passageQs.filter(x => x.groupId === pq.groupId);
      peers.forEach(p => rendered.add(String(p.id)));
      cards.push(`<div class="reading-question-card">${_rdRenderGroupBlock(peers)}</div>`);
    } else {
      rendered.add(sid);
      cards.push(`<div class="reading-question-card" id="q-card-${pq.id}">${_rdRenderQuestion(pq, firstIdx + i)}</div>`);
    }
  });
  return cards.join('');
}

/* Render a single (non-grouped) reading question */
function _rdRenderQuestion(q, idx) {
  const saved   = appState.test.answers[q.id];
  const qLabel  = q.qNum != null ? q.qNum : idx + 1;
  const qPrefix = String(qLabel).includes('&') ? 'Questions' : 'Question';
  const answerRule = q.answerRule
    ? `<div class="rd-answer-rule">${_rdEsc(q.answerRule)}</div>` : '';
  let body = '';

  if (q.type === 'tfng' || q.type === 'ynng') {
    const opts = q.type === 'tfng'
      ? [{k:'TRUE',l:'True'},{k:'FALSE',l:'False'},{k:'NG',l:'Not Given'}]
      : [{k:'YES',l:'Yes'},{k:'NO',l:'No'},{k:'NG',l:'Not Given'}];
    body = `<div class="rd-tfng-opts" role="radiogroup" aria-label="Question ${qLabel}">
      ${opts.map(o => {
        const active = saved === o.k ? ' rd-tfng-btn--active' : '';
        return `<button class="rd-tfng-btn${active}" type="button"
          data-qid="${q.id}" data-val="${o.k}"
          aria-pressed="${saved === o.k}">${o.l}</button>`;
      }).join('')}
    </div>`;

  } else if (q.type === 'mcq') {
    body = `<div class="options-list">
      ${(q.options||[]).map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const sel    = saved === letter ? ' selected' : '';
        return `<label class="option-label${sel}">
          <input type="radio" name="q_${q.id}" value="${letter}" ${saved===letter?'checked':''}
            aria-label="Question ${qLabel}, option ${letter}">
          ${opt}</label>`;
      }).join('')}
    </div>`;

  } else if (q.type === 'multi') {
    const savedArr  = saved ? saved.split(',').filter(Boolean) : [];
    const maxLetter = String.fromCharCode(64 + (q.options||[]).length);
    body = `<p class="multi-hint">Choose <strong>${q.count||2}</strong> answers (A–${maxLetter})</p>
    <div class="options-list">
      ${(q.options||[]).map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const isChk  = savedArr.includes(letter);
        return `<label class="option-label${isChk ? ' selected' : ''}">
          <input type="checkbox" name="q_${q.id}" value="${letter}" ${isChk?'checked':''}
            data-max="${q.count||2}"
            aria-label="Question ${qLabel}, option ${letter}">
          ${opt}</label>`;
      }).join('')}
    </div>`;

  } else if (q.type === 'matching' || q.type === 'matching_headings' ||
             q.type === 'matching_info' || q.type === 'matching_information' ||
             q.type === 'matching_features' || q.type === 'matching_sentence_endings') {
    /* Single ungrouped matching question — reuse the same layout as the grouped renderer */
    body = _rdRenderMatchingGroup([q], `Question ${qLabel}`);
    // _rdRenderMatchingGroup returns a full question-block div; skip the outer wrapper below
    if (q.instructions) body = `<div class="rd-instructions">${q.instructions}</div>` + body;
    return body;

  } else if (q.type === 'completion' && Array.isArray(q.content)) {
    /* Inline blank completion: content is an array of {type:"text"|"blank", value?, id?} */
    body = `${answerRule}<div class="rd-inline-content">
      ${q.content.map(tok => {
        if (tok.type === 'text') return `<span class="rd-inline-text">${tok.value}</span>`;
        if (tok.type === 'blank') {
          const val = appState.test.answers[tok.id] || '';
          return `<span class="rd-blank-wrap">
            <span class="rd-blank-num">${tok.id}</span>
            <input type="text" class="rd-blank-input" data-qid="${_rdEsc(tok.id)}"
              value="${_rdEsc(val)}" autocomplete="off" spellcheck="false"
              aria-label="Blank ${tok.id}" placeholder="(${tok.id})">
          </span>`;
        }
        return '';
      }).join('')}
    </div>`;

  } else {
    /* short / sentence_completion / summary_completion / note_completion / form_completion */
    body = `${answerRule}<input type="text" class="answer-input" data-qid="${q.id}"
      placeholder="Type your answer…" value="${_rdEsc(saved||'')}"
      autocomplete="off" spellcheck="false" aria-label="Question ${qLabel} answer">`;
  }

  let html = `<div class="question-block">
    <div class="question-number">${qPrefix} ${qLabel}</div>
    <div class="question-text">${q.text}</div>
    ${body}
  </div>`;
  if (q.instructions) html = `<div class="rd-instructions">${q.instructions}</div>` + html;
  return html;
}

/* Render a grouped question block (table_completion, diagram_labeling) */
function _rdRenderGroupBlock(peers) {
  if (!peers.length) return '';
  const qNums      = peers.map(p => p.qNum || p.id);
  const rangeLabel = qNums.length === 1
    ? `Question ${qNums[0]}`
    : `Questions ${qNums[0]}–${qNums[qNums.length - 1]}`;
  const instructions = (peers.find(p => p.instructions) || {}).instructions || '';
  const type = peers[0].type;

  const isMatchingType = ['matching', 'matching_headings', 'matching_info', 'matching_information',
                          'matching_features', 'matching_sentence_endings'].includes(type);
  let inner = '';
  if (type === 'diagram_labeling' || type === 'map_labeling') {
    inner = _rdRenderDiagram(peers, rangeLabel);
  } else if (type === 'table_completion') {
    inner = _rdRenderTable(peers, rangeLabel);
  } else if (isMatchingType) {
    inner = _rdRenderMatchingGroup(peers, rangeLabel);
  } else {
    inner = _rdRenderFormList(peers, rangeLabel);
  }
  return (instructions ? `<div class="rd-instructions">${instructions}</div>` : '') + inner;
}

/* Render grouped matching questions: options list at top + question rows with dropdowns */
function _rdRenderMatchingGroup(peers, rangeLabel) {
  const opts           = (peers[0] && peers[0].options) || [];
  const answerRule     = peers[0].answerRule
    ? `<div class="rd-answer-rule">${_rdEsc(peers[0].answerRule)}</div>` : '';
  const optionsHeading = (peers[0] && peers[0].optionsHeading) || '';
  const instruction    = (peers[0] && peers[0].instruction)    || '';

  const instructionHtml = instruction
    ? `<div class="ls-matching-instruction">${_rdEsc(instruction).replace(/\n/g,'<br>')}</div>` : '';

  // Options reference list (shown once at top)
  const optionsHtml = opts.length ? `
    <div class="ls-matching-options">
      ${optionsHeading ? `<div class="ls-matching-options-heading">${_rdEsc(optionsHeading)}</div>` : ''}
      ${opts.map(opt => {
        const m = String(opt).match(/^([A-Za-z]+)[.\s]+(.+)$/);
        return m
          ? `<div class="ls-matching-option"><span class="ls-match-letter">${_rdEsc(m[1])}</span>${_rdEsc(m[2])}</div>`
          : `<div class="ls-matching-option">${_rdEsc(opt)}</div>`;
      }).join('')}
    </div>` : '';

  // Dropdown builder
  const buildDd = (saved) => [`<option value="">Select…</option>`,
    ...opts.map(opt => {
      const letter = String(opt).match(/^([A-Za-z]+)/)?.[1] || '';
      const sel    = letter && letter.toUpperCase() === saved.toUpperCase() ? ' selected' : '';
      return `<option value="${_rdEsc(letter)}"${sel}>${_rdEsc(letter)}</option>`;
    })
  ].join('');

  // Question rows: [Q#] [text] [dropdown]
  const questionsHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    return `<div class="ls-matching-row">
      <span class="ls-match-qnum">${_rdEsc(String(p.qNum || p.id))}</span>
      <span class="ls-match-label">${_rdEsc(p.text || '')}</span>
      <select class="ls-matching-select" data-qid="${_rdEsc(String(p.id))}">${buildDd(saved)}</select>
    </div>`;
  }).join('');

  return `<div class="question-block ls-matching-block">
    <div class="question-number">${rangeLabel}</div>
    ${instructionHtml}
    ${answerRule}
    ${optionsHtml}
    <div class="ls-matching-questions">${questionsHtml}</div>
  </div>`;
}

function _rdRenderDiagram(peers, rangeLabel) {
  const imgUrl     = (peers[0] && peers[0].groupImage) || '';
  const answerRule = peers[0].answerRule
    ? `<div class="rd-answer-rule">${_rdEsc(peers[0].answerRule)}</div>` : '';
  const pinsHtml   = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    return `<div class="rd-diagram-blank" style="left:${p.xPct||0}%;top:${p.yPct||0}%">
      <span class="rd-diagram-label">${p.qNum || p.id}</span>
      <input type="text" class="rd-diagram-input" data-qid="${p.id}"
        value="${_rdEsc(saved)}" autocomplete="off" spellcheck="false"
        aria-label="Blank ${p.qNum || p.id}: ${_rdEsc(p.text||'')}">
    </div>`;
  }).join('');
  const promptsHtml = peers.map(p =>
    `<div class="rd-diagram-prompt"><strong>${p.qNum || p.id}.</strong> ${p.text || ''}</div>`
  ).join('');
  return `<div class="question-block">
    <div class="question-number">${rangeLabel}</div>
    ${answerRule}
    ${imgUrl
      ? `<div class="rd-image-wrap"><img src="${_rdEsc(imgUrl)}" class="rd-diagram-img" alt="Diagram" draggable="false">${pinsHtml}</div>`
      : '<div class="rd-no-image">No diagram image provided.</div>'}
    ${promptsHtml ? `<div class="rd-diagram-prompts">${promptsHtml}</div>` : ''}
  </div>`;
}

function _rdRenderTable(peers, rangeLabel) {
  const rowKeys = [], colKeys = [];
  peers.forEach(p => {
    if (p.rowContext && !rowKeys.includes(p.rowContext)) rowKeys.push(p.rowContext);
    if (p.colContext && !colKeys.includes(p.colContext)) colKeys.push(p.colContext);
  });
  const cellMap = {};
  peers.forEach(p => { cellMap[`${p.rowContext}||${p.colContext}`] = p; });
  const answerRule = peers[0].answerRule
    ? `<div class="rd-answer-rule">${_rdEsc(peers[0].answerRule)}</div>` : '';
  const headerHtml = `<tr><th></th>${colKeys.map(c => `<th>${_rdEsc(c)}</th>`).join('')}</tr>`;
  const bodyHtml   = rowKeys.map(row => `<tr>
    <td class="rd-table-row-label">${_rdEsc(row)}</td>
    ${colKeys.map(col => {
      const p = cellMap[`${row}||${col}`];
      if (!p) return '<td></td>';
      const saved = appState.test.answers[p.id] || '';
      return `<td><input type="text" class="rd-table-input" data-qid="${p.id}"
        value="${_rdEsc(saved)}" autocomplete="off" spellcheck="false"
        aria-label="Blank ${p.qNum || p.id}" placeholder="(${p.qNum || p.id})"></td>`;
    }).join('')}
  </tr>`).join('');
  return `<div class="question-block">
    <div class="question-number">${rangeLabel}</div>
    ${answerRule}
    <div class="rd-table-wrap"><table class="rd-completion-table">
      <thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody>
    </table></div>
  </div>`;
}

function _rdRenderFormList(peers, rangeLabel) {
  const fieldsHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    return `<div class="rd-form-field">
      <span class="rd-form-num">${p.qNum || p.id}.</span>
      <span class="rd-form-label">${p.text || ''}</span>
      <input type="text" class="rd-form-input answer-input" data-qid="${p.id}"
        value="${_rdEsc(saved)}" autocomplete="off" spellcheck="false"
        aria-label="Blank ${p.qNum || p.id}" placeholder="…">
    </div>`;
  }).join('');
  return `<div class="question-block">
    <div class="question-number">${rangeLabel}</div>
    <div class="rd-form-group">${fieldsHtml}</div>
  </div>`;
}

/* Event delegation for the reading questions pane — no inline onclick handlers */
function _rdAttachHandlers(qPane) {
  if (qPane._rdClickH)  { qPane.removeEventListener('click',  qPane._rdClickH);  }
  if (qPane._rdChangeH) { qPane.removeEventListener('change', qPane._rdChangeH); }
  if (qPane._rdInputH)  { qPane.removeEventListener('input',  qPane._rdInputH);  }

  qPane._rdClickH = function(e) {
    const btn = e.target.closest('.rd-tfng-btn');
    if (!btn) return;
    const qid = btn.dataset.qid;
    const val = btn.dataset.val;
    saveAnswer(qid, val);
    btn.closest('.rd-tfng-opts').querySelectorAll('.rd-tfng-btn').forEach(b => {
      const active = b.dataset.val === val;
      b.classList.toggle('rd-tfng-btn--active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };

  qPane._rdChangeH = function(e) {
    const t = e.target;
    if (t.type === 'radio') {
      const qid = t.name.startsWith('q_') ? t.name.slice(2) : null;
      if (!qid) return;
      saveAnswer(qid, t.value);
      document.querySelectorAll(`input[name="${t.name}"]`).forEach(r => {
        const lbl = r.closest('label');
        if (lbl) lbl.classList.toggle('selected', r === t);
      });
    } else if (t.type === 'checkbox') {
      const qid = t.name.startsWith('q_') ? t.name.slice(2) : null;
      if (!qid) return;
      saveMulti(qid, t.value, t.checked, parseInt(t.dataset.max) || 2);
    } else if (t.tagName === 'SELECT' && t.dataset.qid) {
      saveAnswer(t.dataset.qid, t.value);
    }
  };

  qPane._rdInputH = function(e) {
    const t = e.target;
    if (t.type === 'text' && t.dataset.qid) saveAnswer(t.dataset.qid, t.value);
  };

  qPane.addEventListener('click',  qPane._rdClickH);
  qPane.addEventListener('change', qPane._rdChangeH);
  qPane.addEventListener('input',  qPane._rdInputH);
}

/* ============================================================
   ===== LISTENING GROUP RENDERERS =====
   Delegated to listening-renderer.js (loaded before this file).
   ============================================================ */

function renderQuestionHTML(q, idx) {
  // Group types: render all peers in the group together (via listening-renderer.js)
  if (q.groupId) return lsRenderGroup(q, idx);

  const saved = appState.test.answers[q.id];
  const qLabel  = q.qNum != null ? q.qNum : idx + 1;
  const qPrefix = String(qLabel).includes('&') ? 'Questions' : 'Question';
  let html = `<div class="question-block">
    <div class="question-number">${qPrefix} ${qLabel} ${lsJumpBtn(q.questionStart)}</div>
    ${q.answerRule ? lsAnswerRule(q.answerRule) : ''}
    <div class="question-text">${q.text}</div>`;

  if (q.type === 'mcq') {
    html += `<div class="options-list">${q.options.map((opt, i) => {
      const letter = String.fromCharCode(65+i);
      const sel = saved === letter ? ' selected' : '';
      return `<label class="option-label${sel}">
        <input type="radio" name="q_${q.id}" value="${letter}" onchange="saveAnswer('${q.id}','${letter}')" ${saved===letter?'checked':''}>
        ${opt}
      </label>`;
    }).join('')}</div>`;
  } else if (q.type === 'multi') {
    const savedArr = saved ? saved.split(',').filter(Boolean) : [];
    const maxLetter = String.fromCharCode(64 + q.options.length);
    html += `<p class="multi-hint">Choose <strong>${q.count}</strong> answers (A–${maxLetter})</p>`;
    html += `<div class="options-list">${q.options.map((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      const isChk  = savedArr.includes(letter);
      return `<label class="option-label${isChk ? ' selected' : ''}">
        <input type="checkbox" name="q_${q.id}" value="${letter}"
          onchange="saveMulti('${q.id}','${letter}',this.checked,${q.count})"
          ${isChk ? 'checked' : ''}>
        ${opt}
      </label>`;
    }).join('')}</div>`;
  } else if (q.type === 'tfng') {
    const opts = [{k:'TRUE',l:'True'},{k:'FALSE',l:'False'},{k:'NG',l:'Not Given'}];
    html += `<div class="tfng-options">${opts.map(o => {
      const sel = saved===o.k ? ` selected-${o.k.toLowerCase()}` : '';
      return `<button class="tfng-btn${sel}" onclick="saveAnswer('${q.id}','${o.k}');renderCurrentQuestion()">${o.l}</button>`;
    }).join('')}</div>`;
  } else if (q.type === 'ynng') {
    const opts = [{k:'YES',l:'Yes'},{k:'NO',l:'No'},{k:'NG',l:'Not Given'}];
    html += `<div class="tfng-options">${opts.map(o => {
      const sel = saved===o.k ? ` selected-${o.k.toLowerCase()}` : '';
      return `<button class="tfng-btn${sel}" onclick="saveAnswer('${q.id}','${o.k}');renderCurrentQuestion()">${o.l}</button>`;
    }).join('')}</div>`;
  } else if (q.type === 'matching' || q.type === 'matching_headings' || q.type === 'matching_info' || q.type === 'matching_features') {
    html += `<div class="options-list">${(q.options||[]).map(opt => {
      const sel = saved === opt ? ' selected' : '';
      return `<label class="option-label${sel}">
        <input type="radio" name="q_${q.id}" value="${opt}" onchange="saveAnswer('${q.id}','${opt}')" ${saved===opt?'checked':''}>
        Paragraph ${opt}
      </label>`;
    }).join('')}</div>`;
  } else if (q.type === 'short' || q.type === 'sentence_completion' || q.type === 'note_completion' || q.type === 'form_completion' || q.type === 'summary_completion') {
    html += `<input type="text" class="answer-input" placeholder="Type your answer..." value="${saved||''}" oninput="saveAnswer('${q.id}',this.value)">`;
  }

  html += `</div>`;
  if (q.instructions) html = `<div class="rd-instructions">${q.instructions}</div>` + html;
  return html;
}

/* ============================================================
   ===== SAVE ANSWERS =====
   ============================================================ */
function saveAnswer(id, value) {
  appState.test.answers[id] = value;
  renderQNavigator();
}
function saveMulti(id, letter, checked, maxCount) {
  let sel = (appState.test.answers[id] || '').split(',').filter(Boolean);
  if (checked) {
    if (!sel.includes(letter)) {
      if (sel.length >= maxCount) {
        showToast('Please select only ' + maxCount + ' answers.');
        const cb = document.querySelector('input[name="q_' + id + '"][value="' + letter + '"]');
        if (cb) cb.checked = false;
        return;
      }
      sel.push(letter);
    }
  } else {
    sel = sel.filter(l => l !== letter);
  }
  appState.test.answers[id] = sel.sort().join(',');
  const selSet = new Set(sel);
  document.querySelectorAll('input[name="q_' + id + '"]').forEach(cb => {
    const lbl = cb.closest('label');
    if (lbl) lbl.className = 'option-label' + (selSet.has(cb.value) ? ' selected' : '');
  });
  renderQNavigator();
}
function saveWriting(id) {
  const ta = document.getElementById('writeArea_' + id);
  if (!ta) return;
  appState.test.answers[id] = ta.value;
  updateWordCount(id, ta.value);
}
function saveRubric(qId, idx, checked) {
  appState.test.answers[`rubric_${qId}_${idx}`] = checked;
}
function saveSpeaking(key, val) {
  appState.test.answers[key] = val;
}
function updateWordCount(id, text) {
  const el = document.getElementById('wc_' + id);
  if (!el) return;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const min   = id === 'w1' ? 150 : 250;
  el.textContent = `${words} words (minimum: ${min})`;
  el.className = 'word-count ' + (words >= min ? 'ok' : words >= min * 0.8 ? 'warning' : '');
}

/* ============================================================
   ===== SUBMIT TEST =====
   ============================================================ */
function confirmSubmit() {
  const answered = Object.keys(appState.test.answers).filter(k => !k.startsWith('rubric_') && !k.startsWith('sp')).length;
  const total = appState.test.flatQuestions.length;
  showModal(
    'Submit Test?',
    `You have answered ${answered} of ${total} question${total>1?'s':''}. Are you sure you want to submit?`,
    submitTest
  );
}

function submitTest() {
  closeModal();
  stopTimer();
  lsStopAudioHighlight();
  const { section, answers, flatQuestions, startTime } = appState.test;
  const timeTaken = Math.round((Date.now() - startTime) / 1000 / 60); // minutes

  if (section === 'writing' || section === 'speaking') {
    // Self-assessed — give estimated band based on rubric checkboxes
    let checked = 0, total = 0;
    if (section === 'writing') {
      const writingData = getActiveTestData('writing') || {
      task1: { prompt: '', instructions: '', chartDescription: '', imageUrl: '', imageCaption: '', imageType: '', minWords: 150, rubric: [], sampleAnswer: '' },
      task2: { prompt: '', instructions: '', minWords: 250, rubric: [], sampleAnswer: '' },
    };
      ['w1','w2'].forEach(wId => {
        const task = wId==='w1'?writingData.task1:writingData.task2;
        total += task.rubric.length;
        task.rubric.forEach((_,i) => { if (answers['rubric_'+wId+'_'+i]) checked++; });
      });
    } else {
      // Speaking: count filled notes as proxy
      const filled = ['sp1_0','sp1_1','sp1_2','sp1_3','sp1_4','sp2','sp3_0','sp3_1','sp3_2','sp3_3']
        .filter(k => answers[k] && answers[k].trim().length > 20).length;
      checked = filled; total = 10;
    }
    const band = rawToBand(checked, total);
    saveHistory({ section, band, correct: checked, total, timeTaken, date: new Date().toISOString() });
    showWritingSpeakingResults(section, band, checked, total, timeTaken);
    return;
  }

  // Auto-grade reading / listening
  let correct = 0;
  const results = flatQuestions.map(q => {
    const given = answers[q.id];
    let isCorrect = false;
    if (q.type === 'mcq' || q.type === 'tfng' || q.type === 'matching') {
      isCorrect = given && given.toUpperCase() === q.answer.toUpperCase();
    } else if (q.type === 'multi') {
      const givenArr = (given || '').split(',').filter(Boolean).map(s => s.toUpperCase()).sort();
      const ansArr   = q.answer.map(a => a.toUpperCase()).sort();
      isCorrect = givenArr.length === ansArr.length && givenArr.every((v, i) => v === ansArr[i]);
    } else if (q.type === 'short' || q.type === 'sentence_completion' || q.type === 'note_completion'
        || q.type === 'summary_completion' || q.type === 'form_completion' || q.type === 'flow_chart'
        || q.type === 'table_completion' || q.type === 'map_labeling' || q.type === 'diagram_labeling'
        || q.type === 'plan_labeling') {
      const acceptables = String(q.answer || '').toLowerCase().split('/').map(s=>s.trim()).filter(Boolean);
      const givenNorm = (given||'').toLowerCase().trim();
      isCorrect = acceptables.length > 0 && acceptables.some(a => givenNorm.includes(a) || (a.includes(givenNorm) && givenNorm.length > 1));
    }
    if (isCorrect) correct++;
    return { q, given, isCorrect };
  });

  const band = rawToBand(correct, flatQuestions.length);
  const wrongAnswers = results
    .filter(r => !r.isCorrect && r.given)
    .map(r => ({
      qNum:    r.q.qNum != null ? r.q.qNum : '?',
      text:    _stripHtml(r.q.text || '').substring(0, 150),
      given:   String(r.given),
      correct: Array.isArray(r.q.answer) ? r.q.answer.join(', ') : String(r.q.answer || ''),
    }));
  saveHistory({ section, band, correct, total: flatQuestions.length, timeTaken, date: new Date().toISOString(), wrongAnswers });
  showTestResults(section, band, correct, flatQuestions.length, timeTaken, results);
  renderDashboard();
}

/* ============================================================
   ===== RESULTS DISPLAY =====
   ============================================================ */
function _stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '').trim();
}

function showTestResults(section, band, correct, total, timeTaken, results) {
  document.getElementById('testInterface').style.display = 'none';
  const container = document.getElementById('testResultsPage');
  container.style.display = 'block';
  const pct = Math.round((correct/total)*100);

  container.innerHTML = `
    <div class="results-hero">
      <h2>${capitalize(section)} Test — Results</h2>
      <div class="big-band">${band}</div>
      <div class="results-meta">${correct}/${total} correct &bull; ${pct}% &bull; Time taken: ${timeTaken} min</div>
    </div>
    <div class="results-breakdown">
      <div class="result-card"><div class="rc-value">${band}</div><div class="rc-label">Band Score</div></div>
      <div class="result-card"><div class="rc-value">${correct}/${total}</div><div class="rc-label">Correct Answers</div></div>
      <div class="result-card"><div class="rc-value">${timeTaken} min</div><div class="rc-label">Time Taken</div></div>
    </div>
    <div class="results-actions">
      <button class="btn btn-primary" onclick="retakeTest('${section}')">&#8635; Retake Test</button>
      <button class="btn btn-outline" onclick="backToSelector()">&#8592; Back to Tests</button>
      <button class="btn btn-outline" onclick="switchTab('review')">&#128203; View History</button>
    </div>
    <div class="answers-review">
      <h3 style="margin-bottom:1rem;">Answer Review</h3>
      ${results.map((r, i) => {
        const textPlain = _stripHtml(r.q.text);
        const answerStr = Array.isArray(r.q.answer) ? r.q.answer.join(', ') : r.q.answer;
        const qLabel    = r.q.qNum != null ? r.q.qNum : i + 1;
        return `
        <div class="answer-row ${r.given ? (r.isCorrect ? 'correct' : 'incorrect') : 'skipped'}">
          <div class="answer-qnum">Q${qLabel}</div>
          <div class="answer-given">
            <strong>${textPlain.substring(0, 80)}${textPlain.length > 80 ? '…' : ''}</strong><br>
            Your answer: <em>${r.given || 'Not answered'}</em>
            ${!r.isCorrect ? ` &nbsp;&#8594; Correct: <span class="answer-correct-val">${answerStr}</span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function showWritingSpeakingResults(section, band, checked, total, timeTaken) {
  document.getElementById('testInterface').style.display = 'none';
  const container = document.getElementById('testResultsPage');
  container.style.display = 'block';

  container.innerHTML = `
    <div class="results-hero">
      <h2>${capitalize(section)} Test — Results</h2>
      <div class="big-band">${band}</div>
      <div class="results-meta">Self-assessment: ${checked}/${total} criteria met &bull; Time: ${timeTaken} min</div>
    </div>
    <div class="results-breakdown">
      <div class="result-card"><div class="rc-value">${band}</div><div class="rc-label">Est. Band</div></div>
      <div class="result-card"><div class="rc-value">${checked}/${total}</div><div class="rc-label">Criteria Met</div></div>
      <div class="result-card"><div class="rc-value">${timeTaken} min</div><div class="rc-label">Time Taken</div></div>
    </div>
    <div class="results-actions">
      <button class="btn btn-primary" onclick="retakeTest('${section}')">&#8635; Retake Test</button>
      <button class="btn btn-outline" onclick="backToSelector()">&#8592; Back to Tests</button>
      <button class="btn btn-outline" onclick="switchTab('review')">&#128203; View History</button>
    </div>
    <div class="tip-card" style="margin-top:1.5rem;">
      <h4>💡 Tips for Improvement</h4>
      ${section === 'writing' ? `<ul>
        <li>Task 1: Spend 20 minutes; write 150–180 words</li>
        <li>Task 2: Spend 40 minutes; write 250–300 words</li>
        <li>Plan your essay structure before writing</li>
        <li>Vary your vocabulary and sentence structures</li>
        <li>Leave 2–3 minutes to review and correct errors</li>
      </ul>` : `<ul>
        <li>Part 1: Give extended answers (2–3 sentences), not just yes/no</li>
        <li>Part 2: Use your 1 minute of preparation wisely</li>
        <li>Part 3: Offer opinions, examples, and comparisons</li>
        <li>Avoid long pauses — use fillers ("Well, that's an interesting point…")</li>
        <li>Vary your intonation and pace for natural-sounding speech</li>
      </ul>`}
    </div>`;
}

function retakeTest(section) {
  backToSelector();
  startTestSection(section);
}
function setTimerMode(countdown) {
  appState.timerCountdown = countdown;
  const desc = document.getElementById('timerToggleDesc');
  if (desc) {
    desc.textContent = countdown
      ? 'Timer counts down — test auto-submits when time is up'
      : 'Timer counts up — shows elapsed time, no auto-submit';
  }
}

function backToSelector() {
  if (appState.test.active) {
    appState.test.active = false;
  }
  _lastPassageId = null;
  _updateListeningPlayerBar(null);
  stopTimer();
  document.getElementById('testInterface').style.display    = 'none';
  document.getElementById('testResultsPage').style.display  = 'none';
  document.getElementById('testSelectorPage').style.display = 'block';
}
