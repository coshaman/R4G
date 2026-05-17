const $ = (id) => document.getElementById(id);

const state = {
  chart: null,
  chartUrl: null,
  audioBuffer: null,
  audioObjectUrl: null,
  audioUrl: null,
  audioContext: null,
  source: null,
  gain: null,
  startedAt: 0,
  pausedAt: 0,
  isPlaying: false,
  isPaused: false,
  settings: loadSettings(),
  game: null,
};

const JUDGE = {
  perfect: 0.050,
  great: 0.088,
  good: 0.130,
  bad: 0.180,
  miss: 0.210,
  earlyBad: 0.285,
};
const WEIGHT = { PERFECT: 1, GREAT: 0.82, GOOD: 0.55, BAD: 0.18, MISS: 0 };

function loadSettings(){
  const defaults = {
    offsetMs: 0,
    speedMultiplier: 1.0,
    manualBpm: "",
    autoSync: false,
    accMode: "cumulative",
    keys4: ["D","F","J","K"],
    keys6: ["S","D","F","J","K","L"],
    pauseKey: "P",
    retryKey: "Backspace",
  };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem("rhythm4g.online.settings") || "{}") }; }
  catch { return defaults; }
}
function saveSettings(){
  state.settings.offsetMs = Number($("offsetInput").value || 0);
  state.settings.speedMultiplier = Number($("speedInput").value || 1);
  state.settings.manualBpm = $("bpmInput").value.trim();
  state.settings.autoSync = $("autoSyncInput").checked;
  state.settings.accMode = $("accModeInput").value;
  state.settings.keys4 = parseKeys($("keys4Input").value, ["D","F","J","K"]);
  state.settings.keys6 = parseKeys($("keys6Input").value, ["S","D","F","J","K","L"]);
  state.settings.pauseKey = normalizeKeyName($("pauseKeyInput").value || "P");
  state.settings.retryKey = normalizeKeyName($("retryKeyInput").value || "Backspace");
  localStorage.setItem("rhythm4g.online.settings", JSON.stringify(state.settings));
  setStatus("설정 저장됨");
}
function applySettingsToUI(){
  $("offsetInput").value = state.settings.offsetMs;
  $("speedInput").value = state.settings.speedMultiplier;
  $("bpmInput").value = state.settings.manualBpm || "";
  $("autoSyncInput").checked = !!state.settings.autoSync;
  $("accModeInput").value = state.settings.accMode;
  $("keys4Input").value = state.settings.keys4.join(" ");
  $("keys6Input").value = state.settings.keys6.join(" ");
  $("pauseKeyInput").value = state.settings.pauseKey;
  $("retryKeyInput").value = state.settings.retryKey;
}
function parseKeys(text, fallback){
  const xs = text.split(/[ ,/]+/).map(normalizeKeyName).filter(Boolean);
  return xs.length ? xs : fallback;
}
function normalizeKeyName(k){
  if (!k) return "";
  const t = String(k).trim();
  if (!t) return "";
  if (t.length === 1) return t.toUpperCase();
  const lower = t.toLowerCase();
  const aliases = { esc:"Escape", escape:"Escape", space:"Space", backspace:"Backspace", enter:"Enter", return:"Enter", shift:"Shift", ctrl:"Control", control:"Control" };
  return aliases[lower] || t;
}
function setStatus(text){ $("loadStatus").textContent = text; }

async function readJsonFile(file){ return JSON.parse(await file.text()); }
async function loadAudioFromFile(file){
  cleanupAudioUrl();
  state.audioObjectUrl = URL.createObjectURL(file);
  state.audioUrl = state.audioObjectUrl;
  await decodeAudioFromUrl(state.audioUrl);
}
async function decodeAudioFromUrl(url){
  const ctx = getAudioContext();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`음악 파일을 읽을 수 없습니다: ${url}`);
  const data = await res.arrayBuffer();
  state.audioBuffer = await ctx.decodeAudioData(data);
}
function getAudioContext(){
  if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  return state.audioContext;
}
function cleanupAudioUrl(){
  if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
  state.audioObjectUrl = null;
}

function normalizeChart(chart){
  const notes = Array.isArray(chart.notes) ? chart.notes : [];
  const cleaned = notes.map((n, i) => ({
    id: n.id ?? `n${i}`,
    type: n.type || "tap",
    lane: Number.isFinite(Number(n.lane)) ? Number(n.lane) : 0,
    time: Number(n.render_time ?? n.time ?? 0),
    end_time: Number(n.end_time ?? n.endTime ?? n.time ?? 0),
    required_hits: Number(n.required_hits ?? n.requiredHits ?? 0),
    scroll_speed: Number(n.visual_scroll_speed ?? n.scroll_speed ?? chart.scroll_speed ?? 760),
    color: n.color || "normal",
    judged: false,
    active: false,
    broken: false,
    ticks: [],
    remaining: Number(n.required_hits ?? n.requiredHits ?? 0),
  })).filter(n => Number.isFinite(n.time));

  // Hard safety: remove any same-lane tap inside hold intervals.
  const holds = cleaned.filter(n => n.type === "hold" && n.end_time > n.time);
  const filtered = cleaned.filter(n => {
    if (n.type === "hold") return true;
    if (n.type === "roll") {
      return !holds.some(h => n.time < h.end_time + 0.04 && (n.end_time || n.time) > h.time - 0.04);
    }
    return !holds.some(h => n.lane === h.lane && n.time >= h.time - 0.045 && n.time <= h.end_time + 0.045);
  });

  for (const h of filtered.filter(n=>n.type === "hold")) {
    const interval = Number(h.tick_interval || chart.beat_interval / 2 || 0.25);
    for (let t = h.time + interval; t < h.end_time - 0.05; t += interval) {
      h.ticks.push({ time: t, judged: false });
    }
  }

  chart.notes = filtered.sort((a,b)=> a.time - b.time || a.lane - b.lane);
  chart.lane_count = Number(chart.lane_count || (chart.difficulty === "master" ? 6 : 4));
  if (!Number.isFinite(chart.lane_count) || chart.lane_count < 1) chart.lane_count = 4;
  chart.duration = Number(chart.duration || state.audioBuffer?.duration || 0);
  return chart;
}

function updateSongInfo(){
  const info = $("songInfo");
  if (!state.chart) { info.innerHTML = `<div class="empty-state">채보와 음악을 불러오면 정보가 표시됩니다.</div>`; return; }
  const c = state.chart;
  info.innerHTML = `
    <div class="song-title">${escapeHtml(c.title || "Untitled")}</div>
    <div class="song-meta">
      <div>난이도: <b>${escapeHtml(c.difficulty || "unknown")}</b></div>
      <div>레인: <b>${c.lane_count}</b></div>
      <div>BPM: <b>${Number(c.tempo_bpm || 0).toFixed(2)}</b></div>
      <div>노트: <b>${c.notes?.length || 0}</b></div>
    </div>`;
  $("startBtn").disabled = !(state.chart && state.audioBuffer);
}
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }

async function loadUrl(chartUrl, audioUrl){
  setStatus("경로 로딩 중...");
  const chartRes = await fetch(chartUrl, { cache:"no-store" });
  if (!chartRes.ok) throw new Error(`채보를 읽을 수 없습니다: ${chartUrl}`);
  state.chart = normalizeChart(await chartRes.json());
  state.chartUrl = chartUrl;
  await decodeAudioFromUrl(audioUrl);
  state.audioUrl = audioUrl;
  updateSongInfo();
  setStatus("로드 완료");
}

async function loadManifest(){
  const box = $("manifestList");
  try {
    const res = await fetch("manifest.json", { cache:"no-store" });
    if (!res.ok) throw new Error("manifest 없음");
    const data = await res.json();
    const songs = Array.isArray(data.songs) ? data.songs : [];
    box.innerHTML = songs.length ? "" : `<div class="manifest-item"><small>manifest.json에 곡이 없습니다.</small></div>`;
    for (const s of songs) {
      const item = document.createElement("div");
      item.className = "manifest-item";
      const diffs = Array.isArray(s.charts) ? s.charts.map(c=>c.difficulty || "chart").join(" / ") : "";
      item.innerHTML = `<div><b>${escapeHtml(s.title || s.audio || "Untitled")}</b><small>${escapeHtml(diffs)}</small></div>`;
      const btn = document.createElement("button"); btn.textContent = "선택";
      btn.onclick = async () => {
        const chartEntry = Array.isArray(s.charts) ? s.charts[0] : null;
        if (!chartEntry) return alert("charts 항목이 없습니다.");
        try { await loadUrl(chartEntry.path, s.audio); }
        catch(e){ alert(e.message); setStatus("로드 실패"); }
      };
      item.appendChild(btn); box.appendChild(item);
    }
  } catch {
    box.innerHTML = `<div class="manifest-item"><small>manifest.json이 없으면 로컬 파일 또는 직접 경로 입력을 사용하세요.</small></div>`;
  }
}

class RhythmGame {
  constructor(canvas, chart, audioBuffer, settings){
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.chart = JSON.parse(JSON.stringify(chart));
    this.audioBuffer = audioBuffer; this.settings = JSON.parse(JSON.stringify(settings));
    this.laneCount = Number(this.chart.lane_count || 4);
    this.keys = (this.laneCount >= 6 ? this.settings.keys6 : this.settings.keys4).slice(0, this.laneCount);
    this.keyToLane = new Map(this.keys.map((k,i)=>[normalizeKeyName(k),i]));
    this.held = new Array(this.laneCount).fill(false);
    this.holdByLane = new Array(this.laneCount).fill(null);
    this.scoreUnits = this.computeScoreUnits();
    this.scoreValue = 0; this.combo = 0; this.maxCombo = 0;
    this.judgeCounts = { PERFECT:0, GREAT:0, GOOD:0, BAD:0, MISS:0 };
    this.lastJudge = ""; this.lastJudgeAt = 0; this.autosyncText=""; this.autosyncAt=0;
    this.autoSamples=[]; this.autoAdjustments=0; this.runtimeOffset=0; this.lastAutoAt=-999;
    this.hitBursts=[]; this.running=true; this.paused=false; this.pauseSongTime=0;
    this.resize(); this.bind(); this.start();
  }
  computeScoreUnits(){
    let units=0;
    for (const n of this.chart.notes) {
      if (n.type === "hold") units += 2 + (n.ticks?.length || 0);
      else units += 1;
    }
    return Math.max(1, units);
  }
  resize(){
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(innerWidth*dpr); this.canvas.height = Math.floor(innerHeight*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0); this.w=innerWidth; this.h=innerHeight;
    this.playTop = Math.max(112, this.h*0.16); this.judgeY = this.h - Math.max(112, this.h*0.18);
    this.playLeft = Math.max(16, this.w*0.18); this.playRight = this.w - Math.max(16, this.w*0.18);
    if (this.w < 760) { this.playLeft = 10; this.playRight = this.w-10; this.playTop = 96; }
    this.laneW = (this.playRight-this.playLeft)/this.laneCount;
  }
  bind(){
    this.onKeyDown = (e) => {
      const key = normalizeKeyName(e.key);
      if (key === this.settings.pauseKey) { e.preventDefault(); this.togglePause(); return; }
      if (key === this.settings.retryKey) { e.preventDefault(); this.retry(); return; }
      const lane = this.keyToLane.get(key) ?? this.keyToLane.get(normalizeKeyName(e.code?.replace(/^Key/,"")));
      if (lane !== undefined && !e.repeat) { e.preventDefault(); this.pressLane(lane); }
    };
    this.onKeyUp = (e) => {
      const key = normalizeKeyName(e.key);
      const lane = this.keyToLane.get(key) ?? this.keyToLane.get(normalizeKeyName(e.code?.replace(/^Key/,"")));
      if (lane !== undefined) { e.preventDefault(); this.releaseLane(lane); }
    };
    addEventListener("keydown", this.onKeyDown); addEventListener("keyup", this.onKeyUp); addEventListener("resize", ()=>this.resize());
    buildTouchLanes(this.laneCount, (lane)=>this.pressLane(lane), (lane)=>this.releaseLane(lane));
  }
  unbind(){ removeEventListener("keydown", this.onKeyDown); removeEventListener("keyup", this.onKeyUp); }
  start(){
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();
    this.source = ctx.createBufferSource(); this.source.buffer = this.audioBuffer;
    this.gain = ctx.createGain(); this.gain.gain.value = 0.95;
    this.source.connect(this.gain).connect(ctx.destination);
    this.startedAt = ctx.currentTime + 0.7;
    this.source.start(this.startedAt);
    this.source.onended = () => { if(this.running) this.finish(); };
    requestAnimationFrame(()=>this.loop());
  }
  songTime(){
    if (this.paused) return this.pauseSongTime;
    const base = getAudioContext().currentTime - this.startedAt;
    return base + (Number(this.settings.offsetMs || 0) + this.runtimeOffset)/1000;
  }
  visualTime(){ return this.paused ? this.pauseSongTime : getAudioContext().currentTime - this.startedAt; }
  togglePause(){
    if (!this.running) return;
    const ctx = getAudioContext();
    if (!this.paused) { this.pauseSongTime=this.songTime(); ctx.suspend(); this.paused=true; }
    else { ctx.resume(); this.startedAt = ctx.currentTime - this.pauseSongTime + (Number(this.settings.offsetMs || 0) + this.runtimeOffset)/1000; this.paused=false; }
  }
  retry(){ this.destroy(); startGame(); }
  destroy(){
    this.running=false; this.unbind(); try{ this.source?.stop(); }catch{}; getAudioContext().resume();
  }
  finish(){ this.running=false; this.drawResult(); }
  loop(){ if(!this.running) return; this.update(); this.draw(); requestAnimationFrame(()=>this.loop()); }
  update(){ if(this.paused) return; const t=this.songTime(); this.updateMisses(t); this.updateHoldTicks(t); }
  addScore(judge){
    this.judgeCounts[judge] = (this.judgeCounts[judge] || 0) + 1;
    this.scoreValue += WEIGHT[judge] || 0;
    if (judge === "MISS" || judge === "BAD") this.combo=0; else { this.combo++; this.maxCombo=Math.max(this.maxCombo,this.combo); }
    this.lastJudge=judge; this.lastJudgeAt=performance.now();
  }
  score(){ return Math.round(1000000 * this.scoreValue / this.scoreUnits); }
  acc(){
    const judged = Object.values(this.judgeCounts).reduce((a,b)=>a+b,0);
    if (this.settings.accMode === "from100") {
      if (!judged) return 100;
      return 100 * this.scoreValue / judged;
    }
    return 100 * this.scoreValue / this.scoreUnits;
  }
  nearestTap(lane, t){
    let best=null, bestAbs=999;
    for (const n of this.chart.notes) {
      if (n.judged || n.type !== "tap" || n.lane !== lane) continue;
      const d=n.time-t, a=Math.abs(d);
      if (a < bestAbs && a <= JUDGE.earlyBad) { best=n; bestAbs=a; }
    }
    return best;
  }
  activeRoll(t){ return this.chart.notes.find(n => n.type === "roll" && !n.judged && t >= n.time-JUDGE.bad && t <= n.end_time+JUDGE.bad); }
  pressLane(lane){
    if (this.paused || !this.running) return;
    this.held[lane]=true; const t=this.songTime();
    const roll = this.activeRoll(t);
    if (roll) {
      roll.remaining = Math.max(0, (roll.remaining || roll.required_hits || 15) - 1);
      this.hitBursts.push({lane, t:performance.now(), roll:true});
      if (roll.remaining <= 0) { roll.judged=true; this.addScore("PERFECT"); }
      return;
    }
    const hold = this.chart.notes.find(n => n.type === "hold" && !n.headJudged && n.lane === lane && Math.abs(n.time-t) <= JUDGE.earlyBad);
    if (hold) {
      const judge = this.judgeFromDelta(hold.time-t);
      hold.headJudged=true; hold.active = judge !== "BAD" && judge !== "MISS";
      this.holdByLane[lane]=hold.active ? hold : null;
      this.addScore(judge); this.collectAuto(hold.time-t, judge, t); this.hitBursts.push({lane,t:performance.now()}); return;
    }
    const tap = this.nearestTap(lane,t);
    if (tap) {
      const delta=tap.time-t; const judge=this.judgeFromDelta(delta);
      tap.judged=true; this.addScore(judge); this.collectAuto(delta, judge, t); this.hitBursts.push({lane,t:performance.now()}); return;
    }
    // EMPTY exists as a penalty-free internal state; no text is shown.
  }
  releaseLane(lane){
    this.held[lane]=false;
    const hold=this.holdByLane[lane];
    if (hold && !hold.judged && this.songTime() < hold.end_time - JUDGE.good) { hold.broken=true; this.combo=0; this.lastJudge="RELEASE"; this.lastJudgeAt=performance.now(); }
    this.holdByLane[lane]=null;
  }
  judgeFromDelta(delta){
    const a=Math.abs(delta);
    if (a<=JUDGE.perfect) return "PERFECT"; if(a<=JUDGE.great) return "GREAT"; if(a<=JUDGE.good) return "GOOD"; if(a<=JUDGE.bad) return "BAD"; return "BAD";
  }
  updateMisses(t){
    for(const n of this.chart.notes){
      if(n.judged) continue;
      if(n.type==="tap" && t > n.time + JUDGE.miss){ n.judged=true; this.addScore("MISS"); }
      if(n.type==="roll" && t > n.end_time + JUDGE.miss){ n.judged=true; this.addScore(n.remaining<=0?"PERFECT":"MISS"); }
      if(n.type==="hold" && t > n.end_time + JUDGE.miss){ n.judged=true; this.addScore((n.active && !n.broken)?"PERFECT":"MISS"); }
    }
  }
  updateHoldTicks(t){
    for(const n of this.chart.notes){
      if(n.type!=="hold" || n.judged || !n.active || n.broken) continue;
      if(!this.held[n.lane] && t < n.end_time - JUDGE.good){ n.broken=true; this.combo=0; continue; }
      for(const tick of n.ticks || []){
        if(!tick.judged && t >= tick.time){ tick.judged=true; if(this.held[n.lane]) this.addScore("PERFECT"); else { n.broken=true; this.addScore("MISS"); } }
      }
    }
  }
  collectAuto(delta, judge, t){
    if(!this.settings.autoSync || t < 8 || !["PERFECT","GREAT","GOOD"].includes(judge)) return;
    this.autoSamples.push(delta*1000); if(this.autoSamples.length>24) this.autoSamples.shift();
    if(this.autoSamples.length<14 || t-this.lastAutoAt<18 || this.autoAdjustments>=3) return;
    const avg=this.autoSamples.reduce((a,b)=>a+b,0)/this.autoSamples.length;
    const consistent=this.autoSamples.filter(x=>Math.sign(x)===Math.sign(avg) && Math.abs(x)>12).length;
    if(Math.abs(avg)>18 && consistent>=10){
      const adj=Math.max(-12,Math.min(12,avg*0.35));
      this.runtimeOffset=Math.max(-45,Math.min(45,this.runtimeOffset+adj));
      this.autoAdjustments++; this.lastAutoAt=t; this.autosyncText=`AutoSync ${adj>0?"+":""}${Math.round(adj)}ms`; this.autosyncAt=performance.now(); this.autoSamples=[];
    }
  }
  noteY(note,t){ const speed=(note.scroll_speed || 760)*Number(this.settings.speedMultiplier || 1); return this.judgeY - (note.time - t)*speed; }
  endY(note,t){ const speed=(note.scroll_speed || 760)*Number(this.settings.speedMultiplier || 1); return this.judgeY - (note.end_time - t)*speed; }
  draw(){
    const c=this.ctx, t=this.songTime(); c.clearRect(0,0,this.w,this.h);
    const g=c.createLinearGradient(0,0,0,this.h); g.addColorStop(0,"#091021"); g.addColorStop(1,"#050713"); c.fillStyle=g; c.fillRect(0,0,this.w,this.h);
    this.drawHud(c,t); this.drawLanes(c); this.drawGrid(c,t); this.drawNotes(c,t); this.drawHitBursts(c); if(this.paused) this.drawPause(c);
  }
  drawHud(c,t){
    c.fillStyle="#eaf1ff"; c.font="900 34px Malgun Gothic, sans-serif"; c.textAlign="center"; c.fillText(`${this.combo} COMBO`,this.w/2,48);
    c.font="800 18px Malgun Gothic, sans-serif"; c.fillStyle="#aebbe0"; c.textAlign="left"; c.fillText(`SCORE ${this.score().toLocaleString()}`,24,34); c.fillText(`ACC ${this.acc().toFixed(2)}%`,24,60);
    c.textAlign="right"; c.fillText(`${this.chart.title || "Untitled"}`,this.w-24,34);
    const age=performance.now()-this.lastJudgeAt; if(age<650 && this.lastJudge && this.lastJudge!=="EMPTY"){ c.textAlign="center"; c.font="900 42px Malgun Gothic, sans-serif"; c.fillStyle=this.lastJudge==="PERFECT"?"#ffe69a":this.lastJudge==="GREAT"?"#a8e8ff":"#ff9090"; c.fillText(this.lastJudge,this.w/2,98); }
    if(performance.now()-this.autosyncAt<1400){ c.font="800 16px Malgun Gothic, sans-serif"; c.fillStyle="#7ee7b8"; c.textAlign="center"; c.fillText(this.autosyncText,this.w/2,122); }
  }
  drawLanes(c){
    c.strokeStyle="#26365c"; c.lineWidth=2; c.fillStyle="rgba(13,20,37,.72)"; c.fillRect(this.playLeft,this.playTop,this.playRight-this.playLeft,this.judgeY-this.playTop+52);
    for(let i=0;i<=this.laneCount;i++){ const x=this.playLeft+i*this.laneW; c.beginPath(); c.moveTo(x,this.playTop); c.lineTo(x,this.judgeY+52); c.stroke(); }
    c.strokeStyle="#dce7ff"; c.lineWidth=5; c.beginPath(); c.moveTo(this.playLeft,this.judgeY); c.lineTo(this.playRight,this.judgeY); c.stroke();
    c.font="900 24px Malgun Gothic, sans-serif"; c.textAlign="center";
    for(let i=0;i<this.laneCount;i++){ const x=this.playLeft+(i+.5)*this.laneW; c.fillStyle=this.held[i]?"#dceaff":"#aebbe0"; c.fillText(this.keys[i] || "",x,this.judgeY+48); }
  }
  drawGrid(c,t){
    const bpm=Number(this.settings.manualBpm || this.chart.tempo_bpm || 120); const beat=60/bpm/2; if(!Number.isFinite(beat)||beat<=0) return;
    const start=Math.max(0,t-1.2), end=t+3.2; c.lineWidth=1;
    for(let gt=Math.floor(start/beat)*beat; gt<end; gt+=beat){ const y=this.judgeY-(gt-t)*760*Number(this.settings.speedMultiplier || 1); if(y<this.playTop||y>this.judgeY+52) continue; c.strokeStyle=Math.abs((gt/(beat*2))-Math.round(gt/(beat*2)))<.05?"rgba(180,190,215,.32)":"rgba(180,190,215,.14)"; c.beginPath(); c.moveTo(this.playLeft,y); c.lineTo(this.playRight,y); c.stroke(); }
  }
  drawNotes(c,t){
    for(const n of this.chart.notes){
      if(n.judged && n.type!=="hold") continue;
      if(n.type==="hold") this.drawHold(c,n,t); else if(n.type==="roll") this.drawRoll(c,n,t); else this.drawTap(c,n,t);
    }
  }
  noteRect(lane,y){ const w=this.laneW*.72,h=26,x=this.playLeft+lane*this.laneW+(this.laneW-w)/2; return {x,y:y-h/2,w,h}; }
  noteColor(n){ return n.color==="highlight"?"#ff8fd6":n.color==="accent"?"#f5bf5e":n.color==="bright"?"#8fc6ff":"#78a7ff"; }
  rounded(c,x,y,w,h,r){ c.beginPath(); c.roundRect(x,y,w,h,r); c.fill(); c.stroke(); }
  drawTap(c,n,t){ const y=this.noteY(n,t); if(y<this.playTop-40||y>this.judgeY+80) return; const r=this.noteRect(n.lane,y); c.fillStyle=this.noteColor(n); c.strokeStyle="#f3f7ff"; c.lineWidth=2; this.rounded(c,r.x,r.y,r.w,r.h,10); }
  drawHold(c,n,t){
    const headY=this.noteY(n,t), tailY=this.endY(n,t); if(Math.max(headY,tailY)<this.playTop-80||Math.min(headY,tailY)>this.judgeY+120) return;
    const x=this.playLeft+n.lane*this.laneW+this.laneW*.31, w=this.laneW*.38; c.fillStyle=n.broken?"rgba(255,107,107,.32)":"rgba(126,231,184,.42)"; c.strokeStyle=n.broken?"#ff7777":"#9ef3c9"; c.lineWidth=2; const y1=Math.min(headY,tailY), h=Math.abs(tailY-headY); c.fillRect(x,y1,w,Math.max(8,h)); c.strokeRect(x,y1,w,Math.max(8,h));
    const rr=this.noteRect(n.lane,headY); c.fillStyle="#7ee7b8"; c.strokeStyle="#f4fff9"; this.rounded(c,rr.x,rr.y,rr.w,rr.h,10); const tr=this.noteRect(n.lane,tailY); c.fillStyle="#56dba0"; c.strokeStyle="#f4fff9"; this.rounded(c,tr.x,tr.y,tr.w,tr.h,10);
  }
  drawRoll(c,n,t){ const y=this.noteY(n,t), y2=this.endY(n,t); if(Math.max(y,y2)<this.playTop-80||Math.min(y,y2)>this.judgeY+120) return; const x=this.playLeft+18,w=this.playRight-this.playLeft-36; c.fillStyle="rgba(245,191,94,.22)"; c.strokeStyle="#f5bf5e"; c.lineWidth=3; c.fillRect(x,Math.min(y,y2),w,Math.max(20,Math.abs(y2-y))); c.strokeRect(x,Math.min(y,y2),w,Math.max(20,Math.abs(y2-y))); c.fillStyle="#fff1c6"; c.font="900 28px Malgun Gothic, sans-serif"; c.textAlign="center"; c.fillText(`ROLL ${n.remaining ?? n.required_hits}`,this.w/2,(y+y2)/2); }
  drawHitBursts(c){ const now=performance.now(); this.hitBursts=this.hitBursts.filter(b=>now-b.t<260); for(const b of this.hitBursts){ const age=(now-b.t)/260, x=this.playLeft+(b.lane+.5)*this.laneW, r=24+age*44; c.strokeStyle=`rgba(210,235,255,${1-age})`; c.lineWidth=3; c.beginPath(); c.arc(x,this.judgeY,r,0,Math.PI*2); c.stroke(); } }
  drawPause(c){ c.fillStyle="rgba(0,0,0,.48)"; c.fillRect(0,0,this.w,this.h); c.fillStyle="#fff"; c.font="900 54px Malgun Gothic, sans-serif"; c.textAlign="center"; c.fillText("PAUSED",this.w/2,this.h/2); }
  drawResult(){
    this.draw(); const c=this.ctx; c.fillStyle="rgba(0,0,0,.62)"; c.fillRect(0,0,this.w,this.h); c.fillStyle="#101a30"; c.strokeStyle="#78a7ff"; c.lineWidth=2; const x=this.w/2-210,y=this.h/2-160,w=420,h=300; c.fillRect(x,y,w,h); c.strokeRect(x,y,w,h); c.fillStyle="#fff"; c.font="900 34px Malgun Gothic, sans-serif"; c.textAlign="center"; c.fillText("RESULT",this.w/2,y+54); c.font="800 22px Malgun Gothic, sans-serif"; c.fillText(`Score ${this.score().toLocaleString()}`,this.w/2,y+105); c.fillText(`Max Combo ${this.maxCombo}`,this.w/2,y+142); c.fillText(`ACC ${this.acc().toFixed(2)}%`,this.w/2,y+179); c.font="700 15px Malgun Gothic, sans-serif"; c.fillStyle="#aebbe0"; c.fillText(`${JSON.stringify(this.judgeCounts)}`,this.w/2,y+220); c.fillText("Back 버튼으로 돌아가기",this.w/2,y+255);
  }
}

function buildTouchLanes(count,onDown,onUp){
  const box=$("touchLanes"); box.innerHTML="";
  for(let i=0;i<count;i++){
    const d=document.createElement("div"); d.className="touch-lane";
    const down=(e)=>{ e.preventDefault(); d.classList.add("pressed"); onDown(i); };
    const up=(e)=>{ e.preventDefault(); d.classList.remove("pressed"); onUp(i); };
    d.addEventListener("pointerdown",down); d.addEventListener("pointerup",up); d.addEventListener("pointercancel",up); d.addEventListener("pointerleave",up);
    box.appendChild(d);
  }
}
function startGame(){
  saveSettings();
  if(!state.chart || !state.audioBuffer) return;
  $("mainLayout").classList.add("hidden"); $("gameShell").classList.remove("hidden");
  state.game = new RhythmGame($("gameCanvas"), state.chart, state.audioBuffer, state.settings);
}
function stopGame(){
  state.game?.destroy(); state.game=null; $("gameShell").classList.add("hidden"); $("mainLayout").classList.remove("hidden");
}

function wire(){
  applySettingsToUI(); loadManifest();
  $("saveSettingsBtn").onclick=saveSettings;
  $("startBtn").onclick=startGame;
  $("backBtn").onclick=stopGame;
  $("pauseBtn").onclick=()=>state.game?.togglePause();
  $("retryBtn").onclick=()=>state.game?.retry();
  $("reloadManifestBtn").onclick=loadManifest;
  $("chartFile").onchange=async(e)=>{ try{ const f=e.target.files[0]; if(!f) return; state.chart=normalizeChart(await readJsonFile(f)); updateSongInfo(); setStatus("채보 로드됨"); }catch(err){ alert(err.message); } };
  $("audioFile").onchange=async(e)=>{ try{ const f=e.target.files[0]; if(!f) return; await loadAudioFromFile(f); updateSongInfo(); setStatus("음악 로드됨"); }catch(err){ alert(err.message); } };
  $("loadUrlBtn").onclick=async()=>{ try{ await loadUrl($("chartUrl").value.trim(), $("audioUrl").value.trim()); }catch(e){ alert(e.message); setStatus("로드 실패"); } };
  const params=new URLSearchParams(location.search); if(params.get("chart") && params.get("audio")){ $("chartUrl").value=params.get("chart"); $("audioUrl").value=params.get("audio"); loadUrl(params.get("chart"),params.get("audio")).catch(e=>setStatus(e.message)); }
}
wire();
