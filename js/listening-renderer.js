/* ============================================================
   listening-renderer.js
   Global renderer module for IELTS Listening questions.
   Loaded before mock-test.js. All functions are globals.
   ============================================================ */

/* ── Utilities ────────────────────────────────────────────── */
function lsEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function lsJumpBtn(questionStart) {
  // Hide in countdown (exam) mode — seeking gives an unfair advantage
  if (typeof appState !== 'undefined' && appState.timerCountdown) return '';
  if (questionStart == null || questionStart < 0) return '';
  const ts   = Math.round(questionStart);
  const mins = Math.floor(ts / 60);
  const secs = ts % 60;
  const label = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  return `<button class="ls-jump-btn" onclick="seekListeningAudio(${questionStart})" title="Jump to ${label}">&#9201;</button>`;
}

function lsAnswerRule(rule) {
  if (!rule) return '';
  return `<div class="ls-answer-rule">Write ${lsEsc(rule)}</div>`;
}

function lsInstruction(text) {
  if (!text) return '';
  return `<div class="ls-instruction">${lsEsc(text)}</div>`;
}

/* ── Group-level router ───────────────────────────────────── */
function lsRenderGroup(q, idx) {
  const allFqs = appState.test.flatQuestions;
  const peers  = allFqs.filter(fq => fq.groupId === q.groupId);
  if (!peers.length) return lsFallback(q, idx);
  // Only the first peer renders the group block; others return empty
  if (peers[0].id !== q.id) return '';
  const firstIdx = allFqs.indexOf(peers[0]);
  const lastIdx  = allFqs.indexOf(peers[peers.length - 1]);
  const rangeLabel = peers.length === 1
    ? `Question ${peers[0].qNum || firstIdx + 1}`
    : `Questions ${peers[0].qNum || firstIdx + 1}–${peers[peers.length-1].qNum || lastIdx + 1}`;
  const t = q.type;
  if (t === 'map_labeling' || t === 'diagram_labeling' || t === 'plan_labeling')
    return lsRenderMapGroup(peers, rangeLabel);
  if (t === 'flow_chart')
    return lsRenderFlowGroup(peers, rangeLabel);
  if (t === 'table_completion')
    return lsRenderTableGroup(peers, rangeLabel);
  if (t === 'form_completion')
    return lsRenderFormGroup(peers, rangeLabel);
  if (t === 'note_completion')
    return lsRenderNoteGroup(peers, rangeLabel);
  if (t === 'sentence_completion')
    return lsRenderSentenceGroup(peers, rangeLabel);
  if (t === 'summary_completion')
    return lsRenderSummaryGroup(peers, rangeLabel);
  if (t === 'matching')
    return lsRenderMatchingGroup(peers, rangeLabel);
  return lsRenderGenericGroup(peers, rangeLabel);
}

/* ── Renderer: Map / Diagram / Plan labeling ──────────────── */
function lsRenderMapGroup(peers, rangeLabel) {
  const imgUrl = (peers[0] && peers[0].groupImage) || '';
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  const pinsHtml = peers.map((p, i) => {
    const label = p.text || String.fromCharCode(65 + i);
    const saved = appState.test.answers[p.id] || '';
    return `<div class="ls-map-pin" style="left:${p.xPct || 0}%;top:${p.yPct || 0}%">
      <div class="ls-map-letter">${lsEsc(label)}</div>
      <input type="text" class="ls-map-input" value="${lsEsc(saved)}"
             data-qid="${p.id}"
             oninput="saveAnswer('${p.id}',this.value)" placeholder="${lsEsc(label)}">
    </div>`;
  }).join('');

  const promptsHtml = peers.map((p, i) => {
    const label = p.text || String.fromCharCode(65 + i);
    return `<div class="ls-map-prompt"><strong>${lsEsc(label)}.</strong> ${lsJumpBtn(p.questionStart)}</div>`;
  }).join('');

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${imgUrl
      ? `<div class="ls-map-wrap"><img src="${lsEsc(imgUrl)}" class="ls-map-img" alt="Map/Diagram"><div class="ls-map-overlay">${pinsHtml}</div></div>`
      : '<p class="ls-no-image">No image set.</p>'}
    <div class="ls-map-prompts">${promptsHtml}</div>
  </div>`;
}

/* ── Renderer: Flow chart ─────────────────────────────────── */
function lsRenderFlowGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  const nodesHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    const pre = p.prefix || '';
    const suf = p.suffix || '';
    return `<div class="ls-flow-step">
      ${p.nodeNum ? `<div class="ls-flow-node">${p.nodeNum}</div>` : ''}
      <div class="ls-flow-content">
        ${lsEsc(pre)}<input type="text" class="ls-flow-input" value="${lsEsc(saved)}"
          data-qid="${p.id}"
          oninput="saveAnswer('${p.id}',this.value)" placeholder="...">${lsEsc(suf)} ${lsJumpBtn(p.questionStart)}
      </div>
    </div>`;
  }).join('<div class="ls-flow-arrow">&#8595;</div>');

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    <div class="ls-flow-chart">${nodesHtml}</div>
  </div>`;
}

/* ── Renderer: Table completion ───────────────────────────── */
function lsRenderTableGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  const rowKeys = []; const colKeys = [];
  peers.forEach(p => {
    if (p.rowContext && !rowKeys.includes(p.rowContext)) rowKeys.push(p.rowContext);
    if (p.colContext && !colKeys.includes(p.colContext)) colKeys.push(p.colContext);
  });
  const cellMap = {};
  peers.forEach(p => { cellMap[`${p.rowContext}||${p.colContext}`] = p; });

  const headerHtml = `<tr><th></th>${colKeys.map(c => `<th>${lsEsc(c)}</th>`).join('')}</tr>`;
  const bodyHtml = rowKeys.map(row => `<tr>
    <td class="ls-table-row-label">${lsEsc(row)}</td>
    ${colKeys.map(col => {
      const p = cellMap[`${row}||${col}`];
      if (!p) return '<td></td>';
      const saved = appState.test.answers[p.id] || '';
      return `<td><input type="text" class="ls-table-cell-input" value="${lsEsc(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)">${p.questionStart != null ? lsJumpBtn(p.questionStart) : ''}</td>`;
    }).join('')}
  </tr>`).join('');

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    <div class="ls-table-wrap"><table class="ls-completion-table">
      <thead>${headerHtml}</thead>
      <tbody>${bodyHtml}</tbody>
    </table></div>
  </div>`;
}

/* ── Renderer: Form completion ────────────────────────────── */
function lsRenderFormGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  const fieldsHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    return `<div class="ls-form-field">
      <label class="ls-form-label">${lsEsc(p.text || `Q${p.qNum}`)} ${lsJumpBtn(p.questionStart)}</label>
      <input type="text" class="ls-form-input" value="${lsEsc(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
    </div>`;
  }).join('');

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    <div class="ls-form-group">${fieldsHtml}</div>
  </div>`;
}

/* ── Renderer: Note completion ────────────────────────────── */
function lsRenderNoteGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';
  const groupTitle  = (peers[0] && peers[0].groupTitle)  || '';

  // Blocks+tokens format: peers[0].noteBlocks carries the full document
  if (peers[0] && peers[0].noteBlocks) {
    const blankMap = {};
    peers.forEach(p => { blankMap[p.qNum] = p; });

    const blocksHtml = peers[0].noteBlocks.map(block => {
      if (block.type === 'heading')    return `<div class="ls-nc-heading">${lsEsc(block.text || '')}</div>`;
      if (block.type === 'subheading') return `<div class="ls-nc-subheading">${lsEsc(block.text || '')}</div>`;
      const prefix = block.type === 'bullet_line' ? '<span class="ls-nc-bullet">–</span>' : '';
      const innerHtml = _lsNcRenderTokens(block.tokens, block.text, blankMap);
      return `<div class="ls-nc-line">${prefix}${innerHtml}</div>`;
    }).join('');

    return `<div class="question-block ls-nc-block" data-group="${lsEsc(peers[0].groupId || '')}">
      <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
      ${lsAnswerRule(answerRule)}
      <div class="ls-nc-document">${blocksHtml}</div>
    </div>`;
  }

  // Inline format: peers have before/after fields (new schema)
  if (peers[0] && peers[0].before != null) {
    // Group peers into visual sections by sectionHeading markers
    const sections = [];
    let cur = null;
    peers.forEach(p => {
      if (p.sectionHeading || cur === null) {
        cur = { heading: p.sectionHeading || '', lines: [] };
        sections.push(cur);
      }
      cur.lines.push(p);
    });

    const sectionsHtml = sections.map(sec => {
      const linesHtml = sec.lines.map(p => {
        const saved      = appState.test.answers[p.id] || '';
        const beforeHtml = p.before ? `<span class="ls-note-before">${lsEsc(p.before)}</span>` : '';
        const afterHtml  = p.after  ? `<span class="ls-note-after">${lsEsc(p.after)}</span>`   : '';
        return `<div class="ls-note-inline-line">
          ${beforeHtml}
          <span class="ls-token-blank-wrap">
            <span class="ls-token-blank-num">${p.qNum}</span>
            <input type="text" class="ls-token-blank-input" value="${lsEsc(saved)}"
              data-qid="${p.id}" oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
          </span>
          ${afterHtml}
          ${lsJumpBtn(p.questionStart)}
        </div>`;
      }).join('');
      const headingHtml = sec.heading
        ? `<div class="ls-note-section-heading">${lsEsc(sec.heading)}</div>` : '';
      return `${headingHtml}<div class="ls-note-section-lines">${linesHtml}</div>`;
    }).join('');

    return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
      <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
      ${lsInstruction(instruction)}
      ${lsAnswerRule(answerRule)}
      ${groupTitle ? `<div class="ls-note-title">${lsEsc(groupTitle)}</div>` : ''}
      <div class="ls-note-group-inline">${sectionsHtml}</div>
    </div>`;
  }

  // Legacy format: simple label → input rows
  const linesHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    return `<div class="ls-note-line">
      <span class="ls-note-label">${lsEsc(p.text || `Q${p.qNum}`)}:</span>
      <input type="text" class="ls-note-input" value="${lsEsc(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
      ${lsJumpBtn(p.questionStart)}
    </div>`;
  }).join('');

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    <div class="ls-note-group">${linesHtml}</div>
  </div>`;
}

function _lsNcRenderTokens(tokens, plainText, blankMap) {
  if (!tokens || !tokens.length) return `<span class="ls-nc-text">${lsEsc(plainText || '')}</span>`;
  return tokens.map(tok => {
    if (tok.type === 'text') return `<span class="ls-nc-text">${lsEsc(tok.value || '')}</span>`;
    if (tok.type === 'blank') {
      const peer = blankMap[tok.id];
      if (!peer) return '';
      const saved = appState.test.answers[peer.id] || '';
      return `<span class="ls-token-blank-wrap">
        <span class="ls-token-blank-num">${peer.qNum}</span>
        <input type="text" class="ls-token-blank-input" value="${lsEsc(saved)}"
          data-qid="${peer.id}" oninput="saveAnswer('${peer.id}',this.value)" placeholder="...">
      </span>${lsJumpBtn(peer.questionStart)}`;
    }
    return '';
  }).join('');
}

/* ── Renderer: Sentence completion (token-based or label) ─── */
function lsRenderSentenceGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  // Build a lookup map from blank id → peer question
  const blankMap = {};
  peers.forEach(p => { blankMap[p.qNum] = p; });

  const itemsHtml = peers.map(p => {
    // Token-based rendering if tokens array exists
    if (p.tokens && p.tokens.length) {
      const tokHtml = p.tokens.map(tok => {
        if (tok.type === 'text') return `<span class="ls-token-text">${lsEsc(tok.value)}</span>`;
        if (tok.type === 'blank') {
          // Find the peer whose qNum matches the blank id
          const peer = blankMap[tok.id] || p;
          const saved = appState.test.answers[peer.id] || '';
          return `<span class="ls-token-blank-wrap">
            <span class="ls-token-blank-num">${peer.qNum}</span>
            <input type="text" class="ls-token-blank-input" value="${lsEsc(saved)}"
              data-qid="${peer.id}"
              oninput="saveAnswer('${peer.id}',this.value)" placeholder="...">
          </span>`;
        }
        return '';
      }).join('');
      return `<div class="ls-sentence-tokens">${tokHtml} ${lsJumpBtn(p.questionStart)}</div>`;
    }
    // Fallback: plain label + input
    const saved = appState.test.answers[p.id] || '';
    return `<div class="ls-form-field">
      <label class="ls-form-label">${lsEsc(p.text || `Q${p.qNum}`)} ${lsJumpBtn(p.questionStart)}</label>
      <input type="text" class="ls-form-input" value="${lsEsc(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
    </div>`;
  }).join('');

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    <div class="ls-form-group">${itemsHtml}</div>
  </div>`;
}

/* ── Renderer: Summary completion (flowing paragraph) ─────── */
function lsRenderSummaryGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  // Build a lookup map from qNum → peer
  const blankMap = {};
  peers.forEach(p => { blankMap[p.qNum] = p; });

  // Check if any peer has tokens
  const hasTokens = peers.some(p => p.tokens && p.tokens.length);

  let bodyHtml = '';
  if (hasTokens) {
    // Concatenate all tokens from all peers into one flowing paragraph
    const allTokens = [];
    peers.forEach(p => {
      if (p.tokens && p.tokens.length) {
        allTokens.push(...p.tokens);
      }
    });
    bodyHtml = '<div class="ls-sentence-tokens">' + allTokens.map(tok => {
      if (tok.type === 'text') return `<span class="ls-token-text">${lsEsc(tok.value)}</span>`;
      if (tok.type === 'blank') {
        const peer = blankMap[tok.id] || peers[0];
        const saved = appState.test.answers[peer.id] || '';
        return `<span class="ls-token-blank-wrap">
          <span class="ls-token-blank-num">${peer.qNum}</span>
          <input type="text" class="ls-token-blank-input" value="${lsEsc(saved)}"
            data-qid="${peer.id}"
            oninput="saveAnswer('${peer.id}',this.value)" placeholder="...">
        </span>`;
      }
      return '';
    }).join('') + '</div>';
  } else {
    // Fallback: treat as form group
    bodyHtml = '<div class="ls-form-group">' + peers.map(p => {
      const saved = appState.test.answers[p.id] || '';
      return `<div class="ls-form-field">
        <label class="ls-form-label">${lsEsc(p.text || `Q${p.qNum}`)} ${lsJumpBtn(p.questionStart)}</label>
        <input type="text" class="ls-form-input" value="${lsEsc(saved)}"
          data-qid="${p.id}"
          oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
      </div>`;
    }).join('') + '</div>';
  }

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${bodyHtml}
  </div>`;
}

/* ── Renderer: Matching (options list + dropdowns) ─────────── */
function lsRenderMatchingGroup(peers, rangeLabel) {
  const answerRule     = (peers[0] && peers[0].answerRule)     || '';
  const matchQuestion  = (peers[0] && peers[0].matchQuestion)  || '';
  const instruction    = (peers[0] && peers[0].instruction)    || '';
  const optionsHeading = (peers[0] && peers[0].optionsHeading) || '';
  const options        = (peers[0] && peers[0].options)        || [];

  // Main question text (e.g. "Which event in the history of football...")
  const questionHtml = matchQuestion
    ? `<div class="ls-matching-question">${lsEsc(matchQuestion)}</div>` : '';

  // Instruction line (e.g. "Choose SIX answers from the box...")
  const instructionHtml = instruction
    ? `<div class="ls-matching-instruction">${lsEsc(instruction).replace(/\n/g,'<br>')}</div>` : '';

  // Options reference panel: bold letter + description, no period
  const optionsHtml = options.length ? `
    <div class="ls-matching-options">
      ${optionsHeading ? `<div class="ls-matching-options-heading">${lsEsc(optionsHeading)}</div>` : ''}
      ${options.map(opt => {
        const m = String(opt).match(/^([A-Za-z]+)[.\s]+(.+)$/);
        return m
          ? `<div class="ls-matching-option"><span class="ls-match-letter">${lsEsc(m[1])}</span>${lsEsc(m[2])}</div>`
          : `<div class="ls-matching-option">${lsEsc(opt)}</div>`;
      }).join('')}
    </div>` : '';

  // Dropdown options: letter only (A, B, C …)
  const buildDd = (saved) => {
    const ddOpts = [`<option value="">Select…</option>`,
      ...options.map(opt => {
        const letter = String(opt).match(/^([A-Za-z]+)/)?.[1] || '';
        const sel    = letter && letter.toUpperCase() === saved.toUpperCase() ? ' selected' : '';
        return `<option value="${lsEsc(letter)}"${sel}>${lsEsc(letter)}</option>`;
      })
    ].join('');
    return ddOpts;
  };

  // Question rows: [Q#] [year/label] [dropdown] — inline, tightly grouped
  const questionsHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    return `<div class="ls-matching-row">
      <span class="ls-match-qnum">${p.qNum}</span>
      <span class="ls-match-label">${lsEsc(p.text || '')}</span>
      <select class="ls-matching-select" data-qid="${p.id}"
        onchange="saveAnswer('${p.id}',this.value)">${buildDd(saved)}</select>
      ${lsJumpBtn(p.questionStart)}
    </div>`;
  }).join('');

  return `<div class="question-block ls-matching-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsJumpBtn(peers[0].questionStart)}
    ${questionHtml}
    ${instructionHtml}
    ${answerRule ? `<div class="ls-answer-rule">Write ${lsEsc(answerRule)}</div>` : ''}
    ${optionsHtml}
    <div class="ls-matching-questions">${questionsHtml}</div>
  </div>`;
}

/* ── Renderer: Generic group (fallback) ───────────────────── */
function lsRenderGenericGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  const items = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    return `<div style="margin-bottom:0.75rem;">
      ${p.text
        ? `<div class="question-text" style="margin-bottom:0.35rem;">${lsEsc(p.text)} ${lsJumpBtn(p.questionStart)}</div>`
        : lsJumpBtn(p.questionStart)}
      <input type="text" class="answer-input" value="${lsEsc(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="Answer...">
    </div>`;
  }).join('');

  return `<div class="question-block" data-group="${lsEsc(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${items}
  </div>`;
}

/* ── Standalone fallback (no groupId) ─────────────────────── */
function lsFallback(q, idx) {
  const saved  = appState.test.answers[q.id] || '';
  const qLabel = q.qNum != null ? q.qNum : idx + 1;
  return `<div class="question-block">
    <div class="question-number">Question ${qLabel} ${lsJumpBtn(q.questionStart)}</div>
    ${q.answerRule  ? lsAnswerRule(q.answerRule)  : ''}
    ${q.instruction ? lsInstruction(q.instruction) : ''}
    <div class="question-text">${q.text || ''}</div>
    <input type="text" class="answer-input" placeholder="Type your answer..."
      value="${lsEsc(saved)}" data-qid="${q.id}"
      oninput="saveAnswer('${q.id}',this.value)">
  </div>`;
}

/* ============================================================
   AUDIO HIGHLIGHT SYSTEM
   Polls audio.currentTime every 500ms and highlights the
   question block whose questionStart is closest to (but not
   exceeding) the current playback position.
   ============================================================ */

let _lsHighlightInterval = null;
let _lsLastHighlightedId = null;

function lsStartAudioHighlight() {
  lsStopAudioHighlight();
  _lsHighlightInterval = setInterval(_lsAudioHighlightTick, 500);
}

function lsStopAudioHighlight() {
  if (_lsHighlightInterval) {
    clearInterval(_lsHighlightInterval);
    _lsHighlightInterval = null;
  }
  // Remove all active highlights
  document.querySelectorAll('.question-block.ls-active-question').forEach(el => {
    el.classList.remove('ls-active-question');
  });
  _lsLastHighlightedId = null;
}

function _lsAudioHighlightTick() {
  const audio = document.querySelector('#lpbPlayer audio');
  if (!audio || audio.paused) return;

  const t = audio.currentTime;
  const qs = (appState.test && appState.test.flatQuestions) || [];

  // Find question with highest questionStart that is <= current time
  let best = null;
  let bestStart = -1;
  for (const q of qs) {
    if (q.questionStart != null && q.questionStart >= 0 && q.questionStart <= t) {
      if (q.questionStart > bestStart) {
        bestStart = q.questionStart;
        best = q;
      }
    }
  }

  if (!best) return;
  if (best.id === _lsLastHighlightedId) return; // no change

  _lsLastHighlightedId = best.id;

  // Find the DOM block for this question
  // It may be a grouped question (data-group) or standalone (data-qid input)
  let targetBlock = null;

  if (best.groupId) {
    targetBlock = document.querySelector(`.question-block[data-group="${CSS.escape(best.groupId)}"]`);
  }
  if (!targetBlock) {
    const input = document.querySelector(`input[data-qid="${CSS.escape(best.id)}"]`);
    if (input) targetBlock = input.closest('.question-block');
  }
  if (!targetBlock) return;

  // Remove highlight from all blocks
  document.querySelectorAll('.question-block.ls-active-question').forEach(el => {
    el.classList.remove('ls-active-question');
  });
  targetBlock.classList.add('ls-active-question');

  // Auto-scroll only if user is not typing inside this block
  const active = document.activeElement;
  if (!targetBlock.contains(active)) {
    targetBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
