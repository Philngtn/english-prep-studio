/* ============================================================
   listening-renderer.js
   Global renderer module for IELTS Listening questions.
   Loaded before mock-test.js. All functions are globals.
   ============================================================ */

/* ── Utilities ────────────────────────────────────────────── */
/* lsEsc removed — use shared escHtml() */

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
  return `<div class="ls-answer-rule">Write ${escHtml(rule)}</div>`;
}

function lsInstruction(text) {
  if (!text) return '';
  return `<div class="ls-instruction">${escHtml(text)}</div>`;
}

function lsRenderIntroBlocks(blocks) {
  if (!blocks || !blocks.length) return '';
  return '<div class="ls-intro-blocks">' + blocks.map(b => {
    const text = escHtml(b.text || '');
    if (b.type === 'heading')     return `<div class="ls-intro-heading">${text}</div>`;
    if (b.type === 'subheading')  return `<div class="ls-intro-subheading">${text}</div>`;
    if (b.type === 'bullet_line') return `<div class="ls-intro-bullet"><span class="ls-nc-bullet">–</span>${text}</div>`;
    return `<div class="ls-intro-line">${text}</div>`;
  }).join('') + '</div>';
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
  if (t === 'diagram_matching' || t === 'map_labeling' || t === 'diagram_labeling' || t === 'plan_labeling')
    return lsRenderDiagramMatchingGroup(peers, rangeLabel);
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

/* ── Helper: expand "A-J" → ["A","B",...,"J"] ────────────────── */
function _expandOptionsRange(str) {
  if (!str) return [];
  const m = String(str).toUpperCase().match(/^([A-Z])\s*[-–]\s*([A-Z])$/);
  if (!m) return [];
  const start = m[1].charCodeAt(0), end = m[2].charCodeAt(0);
  if (end < start) return [];
  const out = [];
  for (let c = start; c <= end; c++) out.push(String.fromCharCode(c));
  return out;
}

/* ── Renderer: Diagram Matching (image left + questions right) ── */
function lsRenderDiagramMatchingGroup(peers, rangeLabel) {
  const answerRule    = (peers[0] && peers[0].answerRule)    || '';
  const matchQuestion = (peers[0] && peers[0].matchQuestion) || '';
  const instruction   = (peers[0] && peers[0].instruction)   || '';
  const imgUrl        = (peers[0] && peers[0].groupImage)    || '';
  const matchType    = (peers[0] && peers[0].matchType) || '';

  const optionsRange = (peers[0] && peers[0].optionsRange) || '';
  const rawOptions   = (peers[0] && peers[0].options)      || [];
  const letters = optionsRange
    ? _expandOptionsRange(optionsRange)
    : rawOptions.map(o => String(o).trim()).filter(Boolean);

  // Group is select variant only when match_type is explicitly 'select' AND options exist
  const isSelect = matchType === 'select' && letters.length > 0;

  const questionHtml = matchQuestion
    ? `<div class="ls-matching-question">${escHtml(matchQuestion)}</div>` : '';
  const imgHtml = imgUrl
    ? `<img src="${escHtml(imgUrl)}" class="ls-diagram-img" alt="Diagram">`
    : '';

  const questionsHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    const flagActive = appState.test.flags.has(p.id) ? ' active' : '';

    if (isSelect) {
      // Select variant: dropdown letter picker
      const ddOpts = [`<option value="">Select…</option>`,
        ...letters.map(letter => {
          const sel = letter.toUpperCase() === (saved || '').toUpperCase() ? ' selected' : '';
          return `<option value="${escHtml(letter)}"${sel}>${escHtml(letter)}</option>`;
        })
      ].join('');
      return `<div class="ls-matching-row">
        <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
          onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
        <span class="ls-match-qnum">${p.qNum}</span>
        <span class="ls-match-label">${escHtml(p.text || '')}</span>
        <select class="ls-matching-select" data-qid="${p.id}"
          onchange="saveAnswer('${p.id}',this.value)">${ddOpts}</select>
        ${lsJumpBtn(p.questionStart)}
      </div>`;
    }

    // Per-question: inline if text contains ________ or has tokens; else short label + blank
    const isInline = !!(p.tokens && p.tokens.length) || (p.text || '').includes('________');

    if (isInline) {
      // Inline blank: text contains ________ as placeholder, or use tokens
      const blankHtml = `<span class="ls-token-blank-wrap">
        <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
          onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
        <span class="ls-token-blank-num">${p.qNum}</span>
        <input type="text" class="ls-token-blank-input" data-qid="${p.id}"
          value="${escHtml(saved)}" oninput="saveAnswer('${p.id}',this.value)"
          autocomplete="off" spellcheck="false">
        ${lsJumpBtn(p.questionStart)}
      </span>`;
      let lineHtml;
      if (p.tokens && p.tokens.length) {
        lineHtml = p.tokens.map(tok => {
          if (tok.type === 'text')  return `<span class="ls-token-text">${escHtml(tok.value)}</span>`;
          if (tok.type === 'blank') return blankHtml;
          return '';
        }).join('');
      } else {
        const parts = (p.text || '').split(/_{2,}/);
        lineHtml = parts.length >= 2
          ? escHtml(parts[0]) + blankHtml + escHtml(parts.slice(1).join('________'))
          : escHtml(p.text || '') + ' ' + blankHtml;
      }
      return `<div class="ls-matching-inline-row">${lineHtml}</div>`;
    }

    // Fill variant: short label beside a blank
    return `<div class="ls-matching-row">
      <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
        onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
      <span class="ls-match-qnum">${p.qNum}</span>
      <span class="ls-match-label">${escHtml(p.text || '')}</span>
      <input type="text" class="ls-matching-fill-input" data-qid="${p.id}"
        value="${escHtml(saved)}" oninput="saveAnswer('${p.id}',this.value)"
        placeholder="…" autocomplete="off" spellcheck="false">
      ${lsJumpBtn(p.questionStart)}
    </div>`;
  }).join('');

  const introBlocks = (peers[0] && peers[0].introBlocks) || [];
  const questionsBlock = `${questionHtml}
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocks)}
    <div class="ls-matching-questions">${questionsHtml}</div>`;

  const inner = imgHtml
    ? `<div class="ls-diagram-layout">
        <div class="ls-diagram-side">${imgHtml}</div>
        <div class="ls-diagram-questions-side">${questionsBlock}</div>
      </div>`
    : questionsBlock;

  return `<div class="question-block ls-matching-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${inner}
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
    const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
    return `<div class="ls-flow-step">
      ${p.nodeNum ? `<div class="ls-flow-node">${p.nodeNum}</div>` : ''}
      <div class="ls-flow-content">
        <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
          onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
        <span class="ls-token-blank-num" style="margin-right:0.2rem;">${p.qNum}</span>
        ${escHtml(pre)}<input type="text" class="ls-flow-input" value="${escHtml(saved)}"
          data-qid="${p.id}"
          oninput="saveAnswer('${p.id}',this.value)" placeholder="...">${escHtml(suf)} ${lsJumpBtn(p.questionStart)}
      </div>
    </div>`;
  }).join('<div class="ls-flow-arrow">&#8595;</div>');

  const introBlocksFlow = (peers[0] && peers[0].introBlocks) || [];
  return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocksFlow)}
    <div class="ls-flow-chart">${nodesHtml}</div>
  </div>`;
}

/* ── Renderer: Table completion ───────────────────────────── */
function lsRenderTableGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';

  // Rich format: rows / cells / segments
  if (peers[0] && peers[0].tableRows) {
    const peerByQNum = {};
    peers.forEach(p => { peerByQNum[String(p.qNum)] = p; });
    const columns = peers[0].tableColumns || [];
    const headerHtml = `<tr>${columns.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr>`;
    const bodyHtml = peers[0].tableRows.map(row =>
      `<tr>${(row.cells || []).map(cell => {
        const segHtml = (cell || []).map(seg => {
          if (seg.t === 'text') return escHtml(seg.content || '');
          if (seg.t === 'blank') {
            const p = peerByQNum[String(seg.id)];
            if (!p) return `<span class="ls-token-blank-wrap"><span class="ls-token-blank-num">${seg.id}</span><input type="text" class="ls-token-blank-input" placeholder="(${seg.id})"></span>`;
            const saved = appState.test.answers[p.id] || '';
            const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
            return `<span class="ls-token-blank-wrap"><button class="q-inline-flag${flagActive}" data-qid="${p.id}" onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button><span class="ls-token-blank-num">${p.qNum}</span><input type="text" class="ls-token-blank-input" data-qid="${p.id}" value="${escHtml(saved)}" oninput="saveAnswer('${p.id}',this.value)" autocomplete="off" spellcheck="false"></span>${lsJumpBtn(p.questionStart)}`;
          }
          return '';
        }).join('');
        return `<td>${segHtml}</td>`;
      }).join('')}</tr>`
    ).join('');
    const introBlocksTbl = (peers[0] && peers[0].introBlocks) || [];
    return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
      <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
      ${lsInstruction(instruction)}
      ${lsAnswerRule(answerRule)}
      ${lsRenderIntroBlocks(introBlocksTbl)}
      <div class="ls-table-wrap"><table class="ls-completion-table">
        <thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody>
      </table></div>
    </div>`;
  }

  // Legacy format: rowContext / colContext
  const rowKeys = []; const colKeys = [];
  peers.forEach(p => {
    if (p.rowContext && !rowKeys.includes(p.rowContext)) rowKeys.push(p.rowContext);
    if (p.colContext && !colKeys.includes(p.colContext)) colKeys.push(p.colContext);
  });
  const cellMap = {};
  peers.forEach(p => { cellMap[`${p.rowContext}||${p.colContext}`] = p; });

  const headerHtml = `<tr><th></th>${colKeys.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr>`;
  const bodyHtml = rowKeys.map(row => `<tr>
    <td class="ls-table-row-label">${escHtml(row)}</td>
    ${colKeys.map(col => {
      const p = cellMap[`${row}||${col}`];
      if (!p) return '<td></td>';
      const saved = appState.test.answers[p.id] || '';
      const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
      return `<td><button class="q-inline-flag${flagActive}" data-qid="${p.id}" onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button><input type="text" class="ls-table-cell-input" value="${escHtml(saved)}" data-qid="${p.id}" oninput="saveAnswer('${p.id}',this.value)">${p.questionStart != null ? lsJumpBtn(p.questionStart) : ''}</td>`;
    }).join('')}
  </tr>`).join('');

  const introBlocksTblLeg = (peers[0] && peers[0].introBlocks) || [];
  return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocksTblLeg)}
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
    const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
    return `<div class="ls-form-field">
      <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
        onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
      <label class="ls-form-label">${escHtml(p.text || `Q${p.qNum}`)} ${lsJumpBtn(p.questionStart)}</label>
      <input type="text" class="ls-form-input" value="${escHtml(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
    </div>`;
  }).join('');

  const introBlocksForm = (peers[0] && peers[0].introBlocks) || [];
  return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocksForm)}
    <div class="ls-form-group">${fieldsHtml}</div>
  </div>`;
}

/* ── Renderer: Note completion ────────────────────────────── */
function lsRenderNoteGroup(peers, rangeLabel) {
  const answerRule  = (peers[0] && peers[0].answerRule)  || '';
  const instruction = (peers[0] && peers[0].instruction) || '';
  const groupTitle  = (peers[0] && peers[0].groupTitle)  || '';

  const introBlocksNote = (peers[0] && peers[0].introBlocks) || [];

  // Blocks+tokens format: peers[0].noteBlocks carries the full document
  if (peers[0] && peers[0].noteBlocks) {
    const blankMap = {};
    peers.forEach(p => { blankMap[p.qNum] = p; });

    const blocksHtml = peers[0].noteBlocks.map(block => {
      if (block.type === 'heading')    return `<div class="ls-nc-heading">${escHtml(block.text || '')}</div>`;
      if (block.type === 'subheading') return `<div class="ls-nc-subheading">${escHtml(block.text || '')}</div>`;
      const prefix = block.type === 'bullet_line' ? '<span class="ls-nc-bullet">–</span>' : '';
      const innerHtml = _lsNcRenderTokens(block.tokens, block.text, blankMap);
      return `<div class="ls-nc-line">${prefix}${innerHtml}</div>`;
    }).join('');

    return `<div class="question-block ls-nc-block" data-group="${escHtml(peers[0].groupId || '')}">
      <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
      ${lsAnswerRule(answerRule)}
      ${lsRenderIntroBlocks(introBlocksNote)}
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
        const beforeHtml = p.before ? `<span class="ls-note-before">${escHtml(p.before)}</span>` : '';
        const afterHtml  = p.after  ? `<span class="ls-note-after">${escHtml(p.after)}</span>`   : '';
        const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
        return `<div class="ls-note-inline-line">
          ${beforeHtml}
          <span class="ls-token-blank-wrap">
            <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
              onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
            <span class="ls-token-blank-num">${p.qNum}</span>
            <input type="text" class="ls-token-blank-input" value="${escHtml(saved)}"
              data-qid="${p.id}" oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
          </span>
          ${afterHtml}
          ${lsJumpBtn(p.questionStart)}
        </div>`;
      }).join('');
      const headingHtml = sec.heading
        ? `<div class="ls-note-section-heading">${escHtml(sec.heading)}</div>` : '';
      return `${headingHtml}<div class="ls-note-section-lines">${linesHtml}</div>`;
    }).join('');

    return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
      <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
      ${lsInstruction(instruction)}
      ${lsAnswerRule(answerRule)}
      ${lsRenderIntroBlocks(introBlocksNote)}
      ${groupTitle ? `<div class="ls-note-title">${escHtml(groupTitle)}</div>` : ''}
      <div class="ls-note-group-inline">${sectionsHtml}</div>
    </div>`;
  }

  // Legacy format: simple label → input rows
  const linesHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
    return `<div class="ls-note-line">
      <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
        onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
      <span class="ls-note-label">${escHtml(p.text || `Q${p.qNum}`)}:</span>
      <input type="text" class="ls-note-input" value="${escHtml(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
      ${lsJumpBtn(p.questionStart)}
    </div>`;
  }).join('');

  return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocksNote)}
    <div class="ls-note-group">${linesHtml}</div>
  </div>`;
}

function _lsNcRenderTokens(tokens, plainText, blankMap) {
  if (!tokens || !tokens.length) return `<span class="ls-nc-text">${escHtml(plainText || '')}</span>`;
  return tokens.map(tok => {
    if (tok.type === 'text') return `<span class="ls-nc-text">${escHtml(tok.value || '')}</span>`;
    if (tok.type === 'blank') {
      const peer = blankMap[tok.id];
      if (!peer) return '';
      const saved = appState.test.answers[peer.id] || '';
      const flagActive = appState.test.flags.has(peer.id) ? ' active' : '';
      return `<span class="ls-token-blank-wrap">
        <button class="q-inline-flag${flagActive}" data-qid="${peer.id}"
          onclick="toggleFlagById('${peer.id}')" title="Flag Q${peer.qNum}">⚑</button>
        <span class="ls-token-blank-num">${peer.qNum}</span>
        <input type="text" class="ls-token-blank-input" value="${escHtml(saved)}"
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
        if (tok.type === 'text') return `<span class="ls-token-text">${escHtml(tok.value)}</span>`;
        if (tok.type === 'blank') {
          // Find the peer whose qNum matches the blank id
          const peer = blankMap[tok.id] || p;
          const saved = appState.test.answers[peer.id] || '';
          const flagActive = appState.test.flags.has(peer.id) ? ' active' : '';
          return `<span class="ls-token-blank-wrap">
            <button class="q-inline-flag${flagActive}" data-qid="${peer.id}"
              onclick="toggleFlagById('${peer.id}')" title="Flag Q${peer.qNum}">⚑</button>
            <span class="ls-token-blank-num">${peer.qNum}</span>
            <input type="text" class="ls-token-blank-input" value="${escHtml(saved)}"
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
    const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
    return `<div class="ls-form-field">
      <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
        onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
      <label class="ls-form-label">${escHtml(p.text || `Q${p.qNum}`)} ${lsJumpBtn(p.questionStart)}</label>
      <input type="text" class="ls-form-input" value="${escHtml(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="...">
    </div>`;
  }).join('');

  const introBlocksSent = (peers[0] && peers[0].introBlocks) || [];
  return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocksSent)}
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
      if (tok.type === 'text') return `<span class="ls-token-text">${escHtml(tok.value)}</span>`;
      if (tok.type === 'blank') {
        const peer = blankMap[tok.id] || peers[0];
        const saved = appState.test.answers[peer.id] || '';
        const flagActive = appState.test.flags.has(peer.id) ? ' active' : '';
        return `<span class="ls-token-blank-wrap">
          <button class="q-inline-flag${flagActive}" data-qid="${peer.id}"
            onclick="toggleFlagById('${peer.id}')" title="Flag Q${peer.qNum}">⚑</button>
          <span class="ls-token-blank-num">${peer.qNum}</span>
          <input type="text" class="ls-token-blank-input" value="${escHtml(saved)}"
            data-qid="${peer.id}"
            oninput="saveAnswer('${peer.id}',this.value)" placeholder="...">
        </span>`;
      }
      return '';
    }).join('') + '</div>';
  } else {
    // No tokens: each peer's text contains '________' as the blank marker.
    // Render as one flowing paragraph with inline numbered inputs.
    const paragraph = peers.map(p => {
      const saved = appState.test.answers[p.id] || '';
      const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
      const blank = `<span class="ls-token-blank-wrap">
        <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
          onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
        <span class="ls-token-blank-num">${p.qNum}</span>
        <input type="text" class="ls-token-blank-input" value="${escHtml(saved)}"
          data-qid="${p.id}" oninput="saveAnswer('${p.id}',this.value)">
        ${lsJumpBtn(p.questionStart)}
      </span>`;
      const parts = (p.text || '').split(/_{2,}/);
      if (parts.length >= 2) {
        return escHtml(parts[0]) + blank + escHtml(parts.slice(1).join('________'));
      }
      return escHtml(p.text || '') + ' ' + blank;
    }).join(' ');
    bodyHtml = `<div class="ls-sentence-tokens">${paragraph}</div>`;
  }

  const introBlocksSum = (peers[0] && peers[0].introBlocks) || [];
  return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocksSum)}
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
    ? `<div class="ls-matching-question">${escHtml(matchQuestion)}</div>` : '';

  // Instruction line (e.g. "Choose SIX answers from the box...")
  const instructionHtml = instruction
    ? `<div class="ls-matching-instruction">${escHtml(instruction).replace(/\n/g,'<br>')}</div>` : '';

  // Options reference panel: bold letter + description, no period
  const optionsHtml = options.length ? `
    <div class="ls-matching-options">
      ${optionsHeading ? `<div class="ls-matching-options-heading">${escHtml(optionsHeading)}</div>` : ''}
      ${options.map(opt => {
        const m = String(opt).match(/^([A-Za-z]+)[.\s]+(.+)$/);
        return m
          ? `<div class="ls-matching-option"><span class="ls-match-letter">${escHtml(m[1])}</span>${escHtml(m[2])}</div>`
          : `<div class="ls-matching-option">${escHtml(opt)}</div>`;
      }).join('')}
    </div>` : '';

  // Dropdown options: letter only (A, B, C …)
  const buildDd = (saved) => {
    const ddOpts = [`<option value="">Select…</option>`,
      ...options.map(opt => {
        const letter = String(opt).match(/^([A-Za-z]+)/)?.[1] || '';
        const sel    = letter && letter.toUpperCase() === saved.toUpperCase() ? ' selected' : '';
        return `<option value="${escHtml(letter)}"${sel}>${escHtml(letter)}</option>`;
      })
    ].join('');
    return ddOpts;
  };

  // Question rows: [flag] [Q#] [year/label] [dropdown] — inline, tightly grouped
  const questionsHtml = peers.map(p => {
    const saved = appState.test.answers[p.id] || '';
    const flagActive = appState.test.flags.has(p.id) ? ' active' : '';
    return `<div class="ls-matching-row">
      <button class="q-inline-flag${flagActive}" data-qid="${p.id}"
        onclick="toggleFlagById('${p.id}')" title="Flag Q${p.qNum}">⚑</button>
      <span class="ls-match-qnum">${p.qNum}</span>
      <span class="ls-match-label">${escHtml(p.text || '')}</span>
      <select class="ls-matching-select" data-qid="${p.id}"
        onchange="saveAnswer('${p.id}',this.value)">${buildDd(saved)}</select>
      ${lsJumpBtn(p.questionStart)}
    </div>`;
  }).join('');

  const introBlocksMatch = (peers[0] && peers[0].introBlocks) || [];
  return `<div class="question-block ls-matching-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsJumpBtn(peers[0].questionStart)}
    ${questionHtml}
    ${instructionHtml}
    ${answerRule ? `<div class="ls-answer-rule">Write ${escHtml(answerRule)}</div>` : ''}
    ${lsRenderIntroBlocks(introBlocksMatch)}
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
        ? `<div class="question-text" style="margin-bottom:0.35rem;">${escHtml(p.text)} ${lsJumpBtn(p.questionStart)}</div>`
        : lsJumpBtn(p.questionStart)}
      <input type="text" class="answer-input" value="${escHtml(saved)}"
        data-qid="${p.id}"
        oninput="saveAnswer('${p.id}',this.value)" placeholder="Answer...">
    </div>`;
  }).join('');

  const introBlocksGen = (peers[0] && peers[0].introBlocks) || [];
  return `<div class="question-block" data-group="${escHtml(peers[0].groupId || '')}">
    <div class="question-number" data-qstart="${peers[0].questionStart || ''}">${rangeLabel}</div>
    ${lsInstruction(instruction)}
    ${lsAnswerRule(answerRule)}
    ${lsRenderIntroBlocks(introBlocksGen)}
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
      value="${escHtml(saved)}" data-qid="${q.id}"
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
