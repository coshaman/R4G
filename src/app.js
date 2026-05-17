const DEFAULT_SETTINGS = {
  keys4: ['D', 'F', 'J', 'K'],
  keys6: ['S', 'D', 'F', 'J', 'K', 'L'],
  pauseKey: 'P',
  retryKey: 'Backspace',
  backKey: 'Escape',
  globalOffsetMs: 0,
  speedMultiplier: 1.0,
  manualBpm: 0,
  accMode: 'cumulative',
  autoSyncEnabled: true,
};

const JUDGE = { perfect: 0.050, great: 0.088, good: 0.130, bad: 0.180, miss: 0.210 };
const SCORE_WEIGHT = { PERFECT: 1.0, GREAT: 0.8, GOOD: 0.5, BAD: 0.2, MISS: 0.0, RELEASE: 0.0 };
const DIFF_ORDER = ['easy', 'normal', 'hard', 'extreme', 'master'];

const $ = (id) => document.getElementById(id);
const state = {
  manifest: null,
  songs: [],
  selected: null,
  localChart: null,
  localAudio: null,
  settings: loadSettings(),
  game: null,
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('rhythm4g_online_settings') || '{}') };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() {
  localStorage.setItem('rhythm4g_online_settings', JSON.stringify(state.settings));
}
function parseKeys(text, fallback) {
  const arr = String(text || '').split(/[ ,/]+/).map(s => s.trim()).filter(Boolean).map(s => normalizeKeyName(s));
  return arr.length ? arr : fallback;
}
function normalizeKeyName(k) {
  const s = String(k || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'esc') return 'Escape';
  if (lower === 'space') return ' ';
  if (lower === 'backspace' || lower === 'bksp') return 'Backspace';
  if (lower === 'enter' || lower === 'return') return 'Enter';
  return s.length === 1 ? s.toUpperCase() : s;
}
function keyMatches(event, wanted) {
  const w = normalizeKeyName(wanted);
  const physical = event.code?.startsWith('Key') ? event.code.slice(3).toUpperCase() : event.code;
  const logical = event.key?.length === 1 ? event.key.toUpperCase() : event.key;
  return w === logical || w === physical || w === event.code;
}
function setStatus(text) { $('libraryStatus').textContent = text; }

function settingsToUI() {
  $('keys4Input').value = state.settings.keys4.join(' ');
  $('keys6Input').value = state.settings.keys6.join(' ');
  $('pauseKeyInput').value = state.settings.pauseKey;
  $('retryKeyInput').value = state.settings.retryKey;
  $('backKeyInput').value = state.settings.backKey;
  $('offsetInput').value = state.settings.globalOffsetMs;
  $('speedInput').value = state.settings.speedMultiplier;
  $('bpmInput').value = state.settings.manualBpm || '';
  $('accModeInput').value = state.settings.accMode;
  $('autoSyncInput').checked = !!state.settings.autoSyncEnabled;
}
function uiToSettings() {
  state.settings.keys4 = parseKeys($('keys4Input').value, DEFAULT_SETTINGS.keys4);
  state.settings.keys6 = parseKeys($('keys6Input').value, DEFAULT_SETTINGS.keys6);
  state.settings.pauseKey = normalizeKeyName($('pauseKeyInput').value || DEFAULT_SETTINGS.pauseKey);
  state.settings.retryKey = normalizeKeyName($('retryKeyInput').value || DEFAULT_SETTINGS.retryKey);
  state.settings.backKey = normalizeKeyName($('backKeyInput').value || DEFAULT_SETTINGS.backKey);
  state.settings.globalOffsetMs = Number($('offsetInput').value || 0);
  state.settings.speedMultiplier = Math.max(0.3, Math.min(3, Number($('speedInput').value || 1)));
  state.settings.manualBpm = Number($('bpmInput').value || 0);
  state.settings.accMode = $('accModeInput').value;
  state.settings.autoSyncEnabled = $('autoSyncInput').checked;
  saveSettings();
}

async function loadManifest() {
  setStatus('manifest 로딩 중...');
  try {
    const res = await fetch(`manifest.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    state.manifest = manifest;
    state.songs = normalizeManifest(manifest);
    renderSongs();
    setStatus(`${state.songs.length}곡 로드됨`);
  } catch (err) {
    state.songs = [];
    renderSongs();
    setStatus('manifest 없음');
    $('songList').innerHTML = `<div class="song-card"><div class="song-title">온라인 곡 목록이 없습니다.</div><div class="song-meta">GitHub Actions가 manifest.json을 만들도록 설정하거나, scripts/generate_manifest.py를 실행해 주세요.<br>${String(err.message || err)}</div></div>`;
  }
}
function normalizeManifest(manifest) {
  const raw = Array.isArray(manifest?.songs) ? manifest.songs : [];
  return raw.map((song, idx) => {
    const charts = song.charts || {};
    const diffs = Object.keys(charts).sort((a,b) => DIFF_ORDER.indexOf(a) - DIFF_ORDER.indexOf(b));
    return { id: song.id || `song-${idx}`, title: song.title || song.name || `Song ${idx + 1}`, audio: song.audio || song.audio_path, duration: song.duration, bpm: song.bpm || song.tempo_bpm, charts, diffs };
  }).filter(s => s.audio && s.diffs.length);
}
function renderSongs() {
  const root = $('songList');
  root.innerHTML = '';
  for (const song of state.songs) {
    const el = document.createElement('article');
    el.className = 'song-card';
    const meta = [`BPM ${song.bpm ? Number(song.bpm).toFixed(2) : '-'}`, song.duration ? `${Number(song.duration).toFixed(1)}s` : '', `${song.diffs.length}개 난이도`].filter(Boolean).join(' · ');
    el.innerHTML = `<div class="song-title"></div><div class="song-meta"></div><div class="diff-row"></div>`;
    el.querySelector('.song-title').textContent = song.title;
    el.querySelector('.song-meta').textContent = meta;
    const row = el.querySelector('.diff-row');
    for (const diff of song.diffs) {
      const btn = document.createElement('button');
      btn.className = 'diff-btn';
      btn.textContent = diff;
      btn.onclick = () => selectSong(song, diff, btn);
      row.appendChild(btn);
    }
    root.appendChild(el);
  }
}
function selectSong(song, difficulty, btn) {
  document.querySelectorAll('.diff-btn.selected').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selected = { song, difficulty, chartUrl: song.charts[difficulty], audioUrl: song.audio };
  $('selectedInfo').innerHTML = `<strong>${escapeHtml(song.title)}</strong><br>난이도: ${difficulty}<br>audio: ${escapeHtml(song.audio)}<br>chart: ${escapeHtml(song.charts[difficulty])}`;
  $('playSelectedBtn').disabled = false;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function playSelected() {
  if (!state.selected) return;
  const chart = await (await fetch(state.selected.chartUrl)).json();
  const audioUrl = state.selected.audioUrl;
  startGame(chart, audioUrl);
}
async function playLocal() {
  if (!state.localChart || !state.localAudio) {
    $('localStatus').textContent = '채보 JSON과 음악 파일을 모두 선택해야 합니다.';
    return;
  }
  const text = await state.localChart.text();
  const chart = JSON.parse(text);
  const audioUrl = URL.createObjectURL(state.localAudio);
  startGame(chart, audioUrl, true);
}

function normalizeChart(chart) {
  const c = structuredClone(chart);
  c.notes = Array.isArray(c.notes) ? c.notes : [];
  for (const n of c.notes) {
    n.type = n.type || 'tap';
    n.time = Number(n.render_time ?? n.time ?? 0);
    n.end_time = Number(n.end_time ?? n.endTime ?? n.time ?? 0);
    n.lane = Number.isFinite(Number(n.lane)) ? Number(n.lane) : 0;
    n.required_hits = Number(n.required_hits ?? n.requiredHits ?? 15);
    n.scroll_speed = Number(n.visual_scroll_speed ?? n.scroll_speed ?? c.scroll_speed ?? 800);
    n.hit = false; n.missed = false; n.started = false; n.broken = false; n.rollHits = 0; n.tickIndex = 0;
  }
  c.notes.sort((a,b) => a.time - b.time || a.lane - b.lane);
  const laneCount = Number(c.lane_count || c.lanes || (c.difficulty === 'master' ? 6 : 4));
  c.lane_count = laneCount;
  c.notes = removeHoldOverlaps(c.notes);
  return c;
}
function removeHoldOverlaps(notes) {
  const holds = notes.filter(n => n.type === 'hold');
  return notes.filter(n => {
    if (n.type === 'hold') return true;
    if (n.type === 'roll') {
      return !holds.some(h => rangesOverlap(n.time, n.end_time, h.time - 0.05, h.end_time + 0.05));
    }
    return !holds.some(h => n.lane === h.lane && n.time >= h.time - 0.06 && n.time <= h.end_time + 0.06);
  });
}
function rangesOverlap(a1, a2, b1, b2) { return Math.max(a1, b1) <= Math.min(a2, b2); }

class RhythmGame {
  constructor(chart, audioUrl) {
    this.chart = normalizeChart(chart);
    this.audioUrl = audioUrl;
    this.canvas = $('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new Audio(audioUrl);
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    this.startedAt = 0;
    this.paused = false;
    this.laneHeld = Array(this.chart.lane_count).fill(false);
    this.activeHolds = new Map();
    this.scoreUnits = this.computeScoreUnits();
    this.hitUnits = 0;
    this.combo = 0; this.maxCombo = 0; this.score = 0;
    this.counts = { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0, RELEASE: 0 };
    this.judgeText = ''; this.judgeUntil = 0;
    this.autoSamples = []; this.autoAdjust = 0; this.autoCount = 0; this.lastAutoAt = 0;
    this.finished = false;
    this._raf = null;
    this.boundKeyDown = e => this.onKeyDown(e);
    this.boundKeyUp = e => this.onKeyUp(e);
    this.boundTouchStart = e => this.onTouchStart(e);
    this.boundTouchEnd = e => this.onTouchEnd(e);
    this.boundResizeTouch = () => this.updateTouchLaneGeometry();
  }
  computeScoreUnits() {
    let units = 0;
    const beat = 60 / (state.settings.manualBpm || this.chart.tempo_bpm || 120);
    for (const n of this.chart.notes) {
      if (n.type === 'hold') units += 2 + Math.max(1, Math.floor((n.end_time - n.time) / Math.max(0.15, beat / 2)));
      else units += 1;
    }
    return Math.max(1, units);
  }
  async start() {
    $('launcher').classList.add('hidden');
    $('gameView').classList.remove('hidden');
    buildTouchLanes(this.chart.lane_count);
    this.updateTouchLaneGeometry();
    requestAnimationFrame(() => this.updateTouchLaneGeometry());
    window.addEventListener('resize', this.boundResizeTouch);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    $('touchLanes').addEventListener('touchstart', this.boundTouchStart, { passive: false });
    $('touchLanes').addEventListener('touchend', this.boundTouchEnd, { passive: false });
    $('touchLanes').addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
    await this.audio.play();
    this.loop();
  }
  stop() {
    cancelAnimationFrame(this._raf);
    this.audio.pause();
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('resize', this.boundResizeTouch);
    $('touchLanes').removeEventListener('touchstart', this.boundTouchStart);
    $('touchLanes').removeEventListener('touchend', this.boundTouchEnd);
    $('touchLanes').removeEventListener('touchcancel', this.boundTouchEnd);
  }
  updateTouchLaneGeometry() {
    const canvasRect = this.canvas.getBoundingClientRect();
    const touchRoot = $('touchLanes');
    if (!canvasRect.width || !canvasRect.height) return;

    // Canvas rendering uses playX = width * 0.18 and playW = width * 0.64.
    // The mobile touch overlay must use the exact same rectangle; otherwise
    // a tap on the visible lane can be interpreted as a neighboring lane.
    const playLeft = canvasRect.left + canvasRect.width * 0.18;
    const playWidth = canvasRect.width * 0.64;
    const judgeTop = canvasRect.top + canvasRect.height * 0.68;
    const playBottom = canvasRect.bottom;

    touchRoot.style.left = `${playLeft}px`;
    touchRoot.style.width = `${playWidth}px`;
    touchRoot.style.top = `${judgeTop}px`;
    touchRoot.style.height = `${Math.max(96, playBottom - judgeTop)}px`;
    touchRoot.style.bottom = 'auto';
    touchRoot.style.transform = 'none';
  }
  restart() { const chart = this.chart, audio = this.audioUrl; this.stop(); startGame(chart, audio); }
  songTime() { return this.audio.currentTime + (state.settings.globalOffsetMs + this.autoAdjust) / 1000; }
  onKeyDown(e) {
    if (keyMatches(e, state.settings.backKey)) { e.preventDefault(); returnToLauncher(); return; }
    if (keyMatches(e, state.settings.pauseKey)) { e.preventDefault(); this.togglePause(); return; }
    if (keyMatches(e, state.settings.retryKey)) { e.preventDefault(); this.restart(); return; }
    const lane = this.keyToLane(e);
    if (lane >= 0 && !e.repeat) { e.preventDefault(); this.pressLane(lane); }
  }
  onKeyUp(e) { const lane = this.keyToLane(e); if (lane >= 0) { e.preventDefault(); this.releaseLane(lane); } }
  keyToLane(e) {
    const keys = this.chart.lane_count >= 6 ? state.settings.keys6 : state.settings.keys4;
    return keys.findIndex(k => keyMatches(e, k));
  }
  onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) this.pressLane(this.touchToLane(t));
  }
  onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) this.releaseLane(this.touchToLane(t));
  }
  touchToLane(t) {
    // Use the same lane rectangle as rendering. This keeps touch detection
    // aligned even if CSS layout, mobile browser chrome, or orientation changes.
    const canvasRect = this.canvas.getBoundingClientRect();
    const playLeft = canvasRect.left + canvasRect.width * 0.18;
    const playWidth = canvasRect.width * 0.64;
    const x = Math.max(0, Math.min(playWidth - 1, t.clientX - playLeft));
    return Math.floor(x / playWidth * this.chart.lane_count);
  }
  togglePause() {
    this.paused = !this.paused;
    if (this.paused) this.audio.pause(); else this.audio.play();
  }
  pressLane(lane) {
    this.laneHeld[lane] = true;
    document.querySelectorAll('.touch-lane')[lane]?.classList.add('active');
    const t = this.songTime();
    const roll = this.chart.notes.find(n => n.type === 'roll' && !n.hit && !n.missed && t >= n.time && t <= n.end_time);
    if (roll) { roll.rollHits += 1; this.flash(`ROLL ${Math.max(0, roll.required_hits - roll.rollHits)}`); if (roll.rollHits >= roll.required_hits) this.applyJudgment(roll, 'PERFECT', 1, true); return; }
    const hold = this.closestNote(lane, 'hold', t, JUDGE.bad);
    if (hold && !hold.started) { hold.started = true; this.activeHolds.set(hold, true); this.applyJudgment(hold, this.judgeFor(Math.abs(t - hold.time)), 1, false); return; }
    const tap = this.closestNote(lane, 'tap', t, JUDGE.bad);
    if (tap) { this.applyJudgment(tap, this.judgeFor(Math.abs(t - tap.time)), 1, true); this.autoSyncSample(t - tap.time, t); return; }
  }
  releaseLane(lane) {
    this.laneHeld[lane] = false;
    document.querySelectorAll('.touch-lane')[lane]?.classList.remove('active');
    const t = this.songTime();
    for (const h of this.activeHolds.keys()) {
      if (h.lane === lane && t < h.end_time - 0.08 && !h.broken && !h.hit) { h.broken = true; this.breakCombo('RELEASE'); }
    }
  }
  closestNote(lane, type, t, window) {
    let best = null, bestD = Infinity;
    for (const n of this.chart.notes) {
      if (n.type !== type || n.lane !== lane || n.hit || n.missed) continue;
      const d = Math.abs(t - n.time);
      if (d <= window && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }
  judgeFor(d) { if (d <= JUDGE.perfect) return 'PERFECT'; if (d <= JUDGE.great) return 'GREAT'; if (d <= JUDGE.good) return 'GOOD'; return 'BAD'; }
  applyJudgment(note, judgment, units = 1, finish = true) {
    this.counts[judgment] = (this.counts[judgment] || 0) + 1;
    this.hitUnits += SCORE_WEIGHT[judgment] * units;
    this.combo = judgment === 'BAD' || judgment === 'MISS' || judgment === 'RELEASE' ? 0 : this.combo + units;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score = Math.round(1000000 * this.hitUnits / this.scoreUnits);
    this.flash(judgment);
    if (finish) note.hit = true;
  }
  breakCombo(j='MISS') { this.counts[j] = (this.counts[j] || 0) + 1; this.combo = 0; this.flash(j); }
  flash(text) { if (text !== 'EMPTY') { this.judgeText = text; this.judgeUntil = performance.now() + 450; } }
  autoSyncSample(diff, t) {
    if (!state.settings.autoSyncEnabled || t < 8 || Math.abs(diff) > JUDGE.good) return;
    this.autoSamples.push(diff); if (this.autoSamples.length > 12) this.autoSamples.shift();
    if (this.autoSamples.length < 8 || this.autoCount >= 3 || t - this.lastAutoAt < 18) return;
    const avg = this.autoSamples.reduce((a,b)=>a+b,0) / this.autoSamples.length;
    if (Math.abs(avg) < 0.022) return;
    const change = Math.max(-12, Math.min(12, Math.round(avg * 1000 * 0.45)));
    this.autoAdjust = Math.max(-45, Math.min(45, this.autoAdjust + change));
    this.autoCount++; this.lastAutoAt = t; this.autoSamples = [];
    this.flash(`AutoSync ${change > 0 ? '+' : ''}${change}ms`);
  }
  update() {
    const t = this.songTime();
    const beat = 60 / (state.settings.manualBpm || this.chart.tempo_bpm || 120);
    for (const n of this.chart.notes) {
      if (n.hit || n.missed) continue;
      if (n.type === 'tap' && t - n.time > JUDGE.miss) { n.missed = true; this.applyJudgment(n, 'MISS', 1, true); }
      if (n.type === 'roll' && t > n.end_time + JUDGE.miss) { n.missed = true; this.applyJudgment(n, 'MISS', 1, true); }
      if (n.type === 'hold') {
        if (!n.started && t - n.time > JUDGE.miss) { n.missed = true; this.applyJudgment(n, 'MISS', 1, true); }
        if (n.started && !n.hit && !n.broken) {
          const tickInterval = Math.max(0.15, beat / 2);
          const nextTick = n.time + (n.tickIndex + 1) * tickInterval;
          if (t >= nextTick && nextTick < n.end_time - 0.05) { n.tickIndex++; this.applyJudgment(n, 'PERFECT', 1, false); }
          if (t >= n.end_time - JUDGE.good && this.laneHeld[n.lane]) { this.applyJudgment(n, 'PERFECT', 1, true); this.activeHolds.delete(n); }
        }
        if ((n.broken || n.started) && !n.hit && t > n.end_time + JUDGE.miss) { n.missed = true; this.applyJudgment(n, 'MISS', 1, true); this.activeHolds.delete(n); }
      }
    }
    if (!this.finished && this.audio.ended) this.finished = true;
  }
  loop() { this.update(); this.draw(); this._raf = requestAnimationFrame(() => this.loop()); }
  draw() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0,0,w,h);
    const laneCount = this.chart.lane_count;
    const playX = w * 0.18, playW = w * 0.64, laneW = playW / laneCount;
    const judgeY = h * 0.82, topY = h * 0.14;
    const t = this.songTime();
    const speedMul = state.settings.speedMultiplier || 1;
    const grad = ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0,'#0a0f25'); grad.addColorStop(1,'#050712'); ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(playX, topY, playW, judgeY - topY + 42);
    for (let i=0;i<=laneCount;i++) { const x=playX+i*laneW; ctx.strokeStyle='rgba(210,225,255,.13)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, judgeY+42); ctx.stroke(); }
    const beat = 60 / (state.settings.manualBpm || this.chart.tempo_bpm || 120);
    for (let gt = Math.floor((t-2)/beat)*beat; gt < t+3; gt += beat/2) {
      const y = judgeY - (gt - t) * 800 * speedMul;
      if (y < topY || y > judgeY+42) continue;
      ctx.strokeStyle = Math.abs((gt/beat)%1) < 0.01 ? 'rgba(220,230,255,.22)' : 'rgba(220,230,255,.09)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(playX,y); ctx.lineTo(playX+playW,y); ctx.stroke();
    }
    ctx.strokeStyle = '#f1f5ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(playX, judgeY); ctx.lineTo(playX+playW, judgeY); ctx.stroke();
    for (const n of this.chart.notes) this.drawNote(ctx, n, t, playX, laneW, judgeY, topY, speedMul);
    ctx.fillStyle = '#eef3ff'; ctx.font = '800 34px Malgun Gothic, Noto Sans CJK KR, sans-serif'; ctx.fillText(String(this.score).padStart(7,'0'), 34, 54);
    ctx.font = '900 46px Malgun Gothic, sans-serif'; ctx.textAlign='center'; ctx.fillText(`${this.combo} COMBO`, w/2, 62); ctx.textAlign='left';
    const acc = this.acc(); ctx.font = '700 24px Malgun Gothic, sans-serif'; ctx.fillStyle='#b9c7e8'; ctx.fillText(`ACC ${acc.toFixed(2)}%`, 34, 88);
    ctx.fillText(this.chart.title || 'Untitled', 34, h-34);
    if (performance.now() < this.judgeUntil) { ctx.font='900 48px Malgun Gothic, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#9bffd0'; ctx.fillText(this.judgeText, w/2, h*0.34); ctx.textAlign='left'; }
    if (this.paused || this.finished) { ctx.fillStyle='rgba(0,0,0,.62)'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#fff'; ctx.font='900 64px Malgun Gothic, sans-serif'; ctx.textAlign='center'; ctx.fillText(this.finished ? 'RESULT' : 'PAUSED', w/2, h*.38); ctx.font='700 28px Malgun Gothic, sans-serif'; ctx.fillText(`SCORE ${this.score} · MAX COMBO ${this.maxCombo} · ACC ${acc.toFixed(2)}%`, w/2, h*.48); ctx.fillText('Back: 목록 · Retry: 재시작 · Pause: 계속', w/2, h*.56); ctx.textAlign='left'; }
  }
  drawNote(ctx, n, t, playX, laneW, judgeY, topY, speedMul) {
    if (n.hit || n.missed) return;
    const sp = (n.scroll_speed || 800) * speedMul;
    if (n.type === 'roll') {
      const y1 = judgeY - (n.time - t) * sp, y2 = judgeY - (n.end_time - t) * sp;
      if (Math.max(y1,y2) < topY || Math.min(y1,y2) > judgeY+70) return;
      ctx.fillStyle='rgba(255,194,102,.18)'; ctx.strokeStyle='#ffc266'; ctx.lineWidth=3; roundRect(ctx, playX, Math.min(y1,y2), laneW*this.chart.lane_count, Math.abs(y2-y1)+28, 16, true, true);
      ctx.fillStyle='#fff0bf'; ctx.font='900 34px Malgun Gothic, sans-serif'; ctx.textAlign='center'; ctx.fillText(`ROLL ${Math.max(0,n.required_hits-n.rollHits)}`, playX+laneW*this.chart.lane_count/2, Math.min(y1,y2)+48); ctx.textAlign='left'; return;
    }
    const x = playX + n.lane * laneW + laneW * .15;
    const width = laneW * .7;
    if (n.type === 'hold') {
      const yHead = judgeY - (n.time - t) * sp, yTail = judgeY - (n.end_time - t) * sp;
      if (Math.max(yHead,yTail) < topY || Math.min(yHead,yTail) > judgeY+70) return;
      ctx.fillStyle = n.broken ? 'rgba(255,100,130,.25)' : 'rgba(124,199,255,.28)'; roundRect(ctx, x+width*.22, Math.min(yHead,yTail), width*.56, Math.abs(yTail-yHead)+18, 12, true, false);
      ctx.fillStyle = n.broken ? '#ff7f9f' : '#7cc7ff'; roundRect(ctx, x, yHead-15, width, 30, 10, true, false); roundRect(ctx, x, yTail-15, width, 30, 10, true, false); return;
    }
    const y = judgeY - (n.time - t) * sp;
    if (y < topY || y > judgeY+70) return;
    const colors = { normal:'#7cc7ff', bright:'#9bffd0', accent:'#ffe08a', highlight:'#d6a3ff' };
    ctx.fillStyle = colors[n.color] || colors.normal; ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=2; roundRect(ctx, x, y-14, width, 28, 10, true, true);
  }
  acc() {
    const totalPossible = state.settings.accMode === 'start100' ? Math.max(1, Object.values(this.counts).reduce((a,b)=>a+b,0)) : this.scoreUnits;
    if (state.settings.accMode === 'start100' && totalPossible === 0) return 100;
    return Math.max(0, Math.min(100, 100 * this.hitUnits / totalPossible));
  }
}
function roundRect(ctx, x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); if(fill)ctx.fill(); if(stroke)ctx.stroke(); }
function buildTouchLanes(n) { const root=$('touchLanes'); root.innerHTML=''; for(let i=0;i<n;i++){ const d=document.createElement('div'); d.className='touch-lane'; root.appendChild(d); } }
function startGame(chart, audioUrl) { if (state.game) state.game.stop(); state.game = new RhythmGame(chart, audioUrl); state.game.start().catch(err => alert(`재생 실패: ${err.message || err}`)); }
function returnToLauncher() { if (state.game) { state.game.stop(); state.game=null; } $('gameView').classList.add('hidden'); $('launcher').classList.remove('hidden'); }

$('refreshLibraryBtn').onclick = loadManifest;
$('playSelectedBtn').onclick = playSelected;
$('playLocalBtn').onclick = playLocal;
$('localChartInput').onchange = e => { state.localChart = e.target.files[0]; $('localStatus').textContent = state.localChart?.name || ''; };
$('localAudioInput').onchange = e => { state.localAudio = e.target.files[0]; $('localStatus').textContent = [state.localChart?.name, state.localAudio?.name].filter(Boolean).join(' + '); };
$('openSettingsBtn').onclick = () => { settingsToUI(); $('settingsDialog').showModal(); };
$('saveSettingsBtn').onclick = uiToSettings;
$('resetSettingsBtn').onclick = () => { state.settings = { ...DEFAULT_SETTINGS }; saveSettings(); settingsToUI(); };
$('backToLauncherBtn').onclick = returnToLauncher;
settingsToUI();
loadManifest();
