'use strict';

/* ============================================================
   ===== LOCAL STORAGE - CLEAR =====
   ============================================================ */
function clearAllHistory() {
  confirmClearHistory(() => { renderReview(); renderDashboard(); showToast('All history cleared.'); });
}

/* ============================================================
   ===== REVIEW SUB-TABS =====
   ============================================================ */
let _reviewTab = 'tests';

function switchReviewTab(tab) {
  _reviewTab = tab;
  document.getElementById('reviewTabTests').classList.toggle('active',    tab === 'tests');
  document.getElementById('reviewTabPractice').classList.toggle('active', tab === 'practice');
  document.getElementById('reviewPaneTests').style.display    = tab === 'tests'    ? '' : 'none';
  document.getElementById('reviewPanePractice').style.display = tab === 'practice' ? '' : 'none';
  if (tab === 'practice') renderPracticeReview();
}

/* ============================================================
   ===== MOCK TEST REVIEW =====
   ============================================================ */
function renderReview() {
  const history = loadHistory();
  renderScoreChart(history);

  const container = document.getElementById('reviewHistoryList');
  if (!history.length) {
    container.innerHTML = '<div class="empty-state"><p>No test history found. Complete a mock test to see detailed reviews here.</p></div>';
  } else {
    container.innerHTML = history.map((h, idx) => `
      <div class="history-item">
        <div class="history-header" onclick="toggleHistoryBody(${idx})">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <span class="history-section-badge badge-${h.section}">${capitalize(h.section)}</span>
            <div>
              <div style="font-weight:600;">${capitalize(h.section)} Test</div>
              <div class="history-date">${new Date(h.date).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="history-band">Band ${h.band}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${h.correct}/${h.total} correct</div>
          </div>
        </div>
        <div class="history-body" id="histBody_${idx}">
          <div class="results-breakdown" style="grid-template-columns:repeat(3,1fr);">
            <div class="result-card"><div class="rc-value">${h.band}</div><div class="rc-label">Band Score</div></div>
            <div class="result-card"><div class="rc-value">${h.correct}/${h.total}</div><div class="rc-label">Correct</div></div>
            <div class="result-card"><div class="rc-value">${h.timeTaken||'?'} min</div><div class="rc-label">Time</div></div>
          </div>
          <p style="color:var(--text-muted);font-size:0.85rem;margin-top:0.75rem;">
            ${getBandAdvice(h.band, h.section)}
          </p>
        </div>
      </div>`).join('');
  }

  // Re-render practice pane if it's currently visible
  if (_reviewTab === 'practice') renderPracticeReview();
}

function toggleHistoryBody(idx) {
  document.getElementById('histBody_' + idx).classList.toggle('open');
}

function getBandAdvice(band, section) {
  if (band >= 8) return `Excellent performance! Focus on maintaining consistency and tackling the most complex question types.`;
  if (band >= 7) return `Great work! To reach Band 8+, practise with difficult passages and focus on vocabulary precision.`;
  if (band >= 6) return `Good progress. Aim to improve by practising ${section} daily and reviewing the question types you find hardest.`;
  if (band >= 5) return `Keep practising! Focus on time management and understanding the specific requirements of each question type.`;
  return `Don't give up — consistent daily practice makes a significant difference. Review the basics of ${section} skills.`;
}

/* ============================================================
   ===== PRACTICE REVIEW =====
   ============================================================ */
async function renderPracticeReview() {
  const container = document.getElementById('reviewPracticeList');
  if (!container) return;
  container.innerHTML = '<div class="empty-state" style="padding:2rem"><p>Loading…</p></div>';

  let results = [];
  try { results = (await db.loadPracticeResults()) || []; } catch(e) {}

  if (!results.length) {
    container.innerHTML = '<div class="empty-state"><p>No practice results yet. Complete a quiz in the Practice section to see results here.</p></div>';
    return;
  }

  container.innerHTML = results.map(r => {
    const pct     = r.total ? Math.round(r.score / r.total * 100) : 0;
    const band    = r.total ? rawToBand(r.score, r.total) : '—';
    const date    = r.created_at
      ? new Date(r.created_at).toLocaleString('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : '—';
    const pkgName = String(r.package_name || r.package_id || 'Practice Quiz')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const pctColor = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    return `
    <div class="history-item">
      <div class="history-header" style="cursor:default;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <span class="history-section-badge" style="background:#fce7f3;color:var(--primary)">Practice</span>
          <div>
            <div style="font-weight:600;">${pkgName}</div>
            <div class="history-date">${date}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="history-band" style="color:${pctColor}">${pct}%</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">${r.score}/${r.total} correct &middot; Band ${band}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   ===== SCORE CHART =====
   ============================================================ */
function renderScoreChart(history) {
  const canvas = document.getElementById('scoreTrendChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!history.length) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Complete tests to see your score trend here', W/2, H/2);
    document.getElementById('chartLegend').textContent = '';
    return;
  }

  const recent = history.slice(0, 10).reverse();
  const padL = 40, padR = 20, padT = 20, padB = 30;
  const gW = W - padL - padR, gH = H - padT - padB;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  [3.5,4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0,8.5,9.0].forEach(band => {
    const y = padT + gH - ((band - 3.5) / 5.5) * gH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gW, y); ctx.stroke();
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(band.toFixed(1), padL - 4, y + 3);
  });

  const sectionColors = { reading:'#2563eb', listening:'#16a34a', writing:'#d97706', speaking:'#7c3aed', full:'#0891b2' };
  const sectionGroups = {};
  recent.forEach((h, i) => {
    const color = sectionColors[h.section] || '#64748b';
    if (!sectionGroups[h.section]) sectionGroups[h.section] = { color, points: [] };
    const x = padL + (i / Math.max(recent.length - 1, 1)) * gW;
    const y = padT + gH - ((h.band - 3.5) / 5.5) * gH;
    sectionGroups[h.section].points.push({x, y, band: h.band});
  });

  Object.values(sectionGroups).forEach(({ color, points }) => {
    if (points.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  });
  recent.forEach((h, i) => {
    const color = sectionColors[h.section] || '#64748b';
    const x = padL + (i / Math.max(recent.length - 1, 1)) * gW;
    const y = padT + gH - ((h.band - 3.5) / 5.5) * gH;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(h.band, x, y - 8);
  });

  const legend = Object.entries(sectionGroups)
    .map(([s, {color}]) => `<span style="color:${color}">&#9632;</span> ${capitalize(s)}`)
    .join(' &nbsp;&nbsp; ');
  document.getElementById('chartLegend').innerHTML = legend;
}
