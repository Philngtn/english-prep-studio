'use strict';

function confirmResetAllData() {
  confirmClearHistory(() => { renderDashboard(); showToast('All data has been reset.'); });
}

/* ============================================================
   ===== DASHBOARD =====
   ============================================================ */
function renderDashboard() {
  const history = loadHistory();
  const total = history.length;
  const totalMin = history.reduce((a, h) => a + (h.timeTaken || 0), 0);
  const hours = Math.round(totalMin / 60);
  const bands = history.filter(h => h.band).map(h => h.band);
  const avgBand = bands.length ? (bands.reduce((a,b)=>a+b,0)/bands.length).toFixed(1) : '--';
  const bestBand = bands.length ? Math.max(...bands) : '--';
  const lastDate = history[0] ? new Date(history[0].date).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : 'Never';

  document.getElementById('statTotalTests').textContent = total;
  document.getElementById('statTotalTime').textContent  = hours + 'h';
  document.getElementById('statBestBand').textContent   = bestBand;
  document.getElementById('statLastDate').textContent   = lastDate;
  document.getElementById('dashAvgBand').textContent    = avgBand;

  // Skill progress
  const skillAvg = (section) => {
    const filtered = history.filter(h => h.section === section && h.band);
    if (!filtered.length) return null;
    return (filtered.reduce((a,h)=>a+h.band,0)/filtered.length).toFixed(1);
  };
  const setSkill = (id, barId, section) => {
    const avg = skillAvg(section);
    document.getElementById(id).textContent = avg || '--';
    document.getElementById(barId).style.width = avg ? ((avg/9)*100) + '%' : '0%';
  };
  setSkill('readingBand',   'readingBar',   'reading');
  setSkill('listeningBand', 'listeningBar', 'listening');
  setSkill('writingBand',   'writingBar',   'writing');
  setSkill('speakingBand',  'speakingBar',  'speaking');

  // Recent tests
  const container = document.getElementById('recentTestsList');
  if (!history.length) {
    container.innerHTML = '<div class="empty-state"><p>No tests taken yet. Start a mock test to see your results here!</p></div>';
    return;
  }
  container.innerHTML = history.slice(0, 5).map(h => `
    <div class="recent-test-item">
      <div>
        <div style="font-weight:600">${capitalize(h.section)} Test</div>
        <div class="recent-test-meta">${new Date(h.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} &bull; ${h.correct ?? '?'} / ${h.total ?? '?'} correct &bull; ${formatTime(h.timeTaken*60||0)}</div>
      </div>
      <div class="recent-test-score">Band ${h.band}</div>
    </div>
  `).join('');
}
