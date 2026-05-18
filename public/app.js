// Sidebeat Lanes core: notes move right-to-left into the judgement line.
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const canvas = $('#game');
const ctx = canvas.getContext('2d');
const timeline = $('#timeline');
const tctx = timeline.getContext('2d');

const ui = {
  songLabel: $('#songLabel'), difficultyLabel: $('#difficultyLabel'), score: $('#score'), combo: $('#combo'), accuracy: $('#accuracy'), life: $('#life'),
  difficultySelect: $('#difficultySelect'), judgement: $('#judgement'), status: $('#status'), startButton: $('#startButton'), restartButton: $('#restartButton'),
  audioUpload: $('#audioUpload'), audioPlayer: $('#audioPlayer'), songTitle: $('#songTitle'), bpmInput: $('#bpmInput'), offsetInput: $('#offsetInput'), snapSelect: $('#snapSelect'), longDurationInput: $('#longDurationInput'),
  editorTime: $('#editorTime'), editorCount: $('#editorCount'), chartList: $('#chartList'), exportChart: $('#exportChart'), importChart: $('#importChart'), clearChart: $('#clearChart'), downloadChart: $('#downloadChart'), saveSong: $('#saveSong'),
  addLongNote: $('#addLongNote'), editorLaneButtons: $$('[data-editor-lane]'), songLibrary: $('#songLibrary'), loadSong: $('#loadSong'), deleteSong: $('#deleteSong'),
  startLatency: $('#startLatency'), latencyTap: $('#latencyTap'), latencyValue: $('#latencyValue'), latencyStatus: $('#latencyStatus'),
  resultDialog: $('#resultDialog'), resultRank: $('#resultRank'), resultScore: $('#resultScore'), resultCombo: $('#resultCombo'), resultAccuracy: $('#resultAccuracy'), resultNotes: $('#resultNotes'), closeResult: $('#closeResult'),
};

const LANES = ['D', 'F', 'J', 'K'];
const LANE_KEYS = new Map(LANES.map((key, lane) => [key.toLowerCase(), lane]));
const judgementLineX = 150;
const spawnX = 1040;
const baseTravelMs = 2200;
const laneTop = 96;
const laneGap = 86;
const noteRadius = 22;
const chartOffsetMs = 1200;
const chartStoreKey = 'sidebeat-lanes-song-library-v1';
const windows = [
  { name: 'Perfect', ms: 45, score: 1000, life: 2, color: '#72f6d1' },
  { name: 'Great', ms: 90, score: 700, life: 1, color: '#8bb8ff' },
  { name: 'Good', ms: 140, score: 350, life: 0, color: '#ffd166' },
];
const difficulties = {
  easy: { label: 'Easy', bpm: 104, bars: 6, speed: .86, missDamage: 6, emptyDamage: 2, patterns: [0, 1, 2, 3, 0, 1, 2, 3] },
  normal: { label: 'Normal', bpm: 128, bars: 8, speed: 1, missDamage: 8, emptyDamage: 3, patterns: [0, 1, 2, 3, 1, 0, 3, 2, [0, 2], 1, 3, [1, 3], 2, 0, 1, 3] },
  hard: { label: 'Hard', bpm: 150, bars: 10, speed: 1.18, missDamage: 10, emptyDamage: 4, patterns: [0, 2, 1, 3, [0, 1], 2, 3, 1, [2, 3], 0, 1, [0, 3], 2, 1, 3, [1, 2]] },
  expert: { label: 'Expert', bpm: 172, bars: 12, speed: 1.34, missDamage: 12, emptyDamage: 5, patterns: [0, [1, 3], 2, 1, [0, 2], 3, 0, [1, 2], 3, 2, [0, 3], 1, 0, 2, [1, 3], [0, 2]] },
};

let audioContext;
let masterGain;
let state;
let animationId;
let editorAnimationId;
let latencyTimer;
let lastFrame = 0;
let currentDifficulty = 'normal';
let customChart = [];
let uploadedSong = null;
let latencyMs = Number(localStorage.getItem('sidebeat-latency-ms') || 0);
let selectedNoteIndex = -1;
let dragNoteIndex = -1;
let latencySession = null;
let hitEffects = [];
let heldKeys = new Set();

function activeDifficulty() { return difficulties[currentDifficulty] ?? difficulties.normal; }
function activeBpm() { return Number(ui.bpmInput.value) || activeDifficulty().bpm; }
function activeOffset() { return Number(ui.offsetInput.value) || 0; }
function activeSnap() { return Number(ui.snapSelect.value) || 0; }
function activeTitle() { return ui.songTitle.value.trim() || uploadedSong?.name?.replace(/\.[^.]+$/, '') || 'Demo Track'; }

function makeChart(difficulty = activeDifficulty()) {
  if (customChart.length > 0) return clonePlayableNotes(customChart);
  const notes = [];
  const beat = 60000 / difficulty.bpm;
  for (let bar = 0; bar < difficulty.bars; bar += 1) {
    difficulty.patterns.forEach((pattern, index) => {
      const time = chartOffsetMs + (bar * difficulty.patterns.length + index) * (beat / 2);
      const lanes = Array.isArray(pattern) ? pattern : [pattern];
      lanes.forEach((lane) => notes.push({ lane, time, duration: index % 15 === 8 ? beat : 0 }));
    });
  }
  return clonePlayableNotes(notes);
}

function clonePlayableNotes(notes) {
  return notes
    .map((note) => ({ lane: Number(note.lane), time: Number(note.time), duration: Math.max(0, Number(note.duration) || 0), hit: false, missed: false, holding: false, completed: false }))
    .filter((note) => Number.isFinite(note.time) && note.time >= 0 && note.lane >= 0 && note.lane < LANES.length)
    .sort((a, b) => a.time - b.time || a.lane - b.lane);
}

function reset() {
  cancelAnimationFrame(animationId);
  stopSong();
  const difficulty = activeDifficulty();
  state = {
    difficulty,
    notes: makeChart(difficulty),
    running: false,
    startedAt: 0,
    pausedAt: 0,
    pauseAccumulated: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    totalHitValue: 0,
    judged: 0,
    life: 100,
    laneFlash: Array(4).fill(0),
    nextTick: 0,
    usesCustomChart: customChart.length > 0,
    finished: false,
  };
  heldKeys.clear();
  ui.judgement.textContent = 'Ready';
  ui.status.textContent = state.usesCustomChart ? `커스텀 채보 ${customChart.length}개 노트. Space 또는 Start.` : `난이도 ${difficulty.label}. Space 또는 Start.`;
  updateHud();
  draw(0);
  drawTimeline();
}

function ensureAudio() {
  if (audioContext) return;
  audioContext = new AudioContext();
  masterGain = audioContext.createGain();
  masterGain.gain.value = .16;
  masterGain.connect(audioContext.destination);
}
function beep(frequency = 440, duration = .055, type = 'sine', volume = .8) {
  if (!audioContext || !masterGain) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.frequency.value = frequency; osc.type = type;
  gain.gain.setValueAtTime(.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, audioContext.currentTime + .006);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
  osc.connect(gain).connect(masterGain); osc.start(); osc.stop(audioContext.currentTime + duration + .02);
}
function inputAdjustedTime() { return Math.max(0, songTime() - latencyMs); }
function songTime(now = performance.now()) {
  if (uploadedSong && state?.startedAt) return ui.audioPlayer.currentTime * 1000;
  if (!state?.startedAt) return 0;
  const end = state.running ? now : state.pausedAt;
  return end - state.startedAt - state.pauseAccumulated;
}
async function toggleStart() {
  ensureAudio();
  if (audioContext.state === 'suspended') await audioContext.resume();
  const now = performance.now();
  if (!state.startedAt || state.finished) {
    if (state.finished) reset();
    state.startedAt = now; state.running = true;
    if (uploadedSong) await playSongFromStart();
    ui.status.textContent = uploadedSong ? '업로드한 곡 재생 중.' : '진행 중 — 판정선에 맞춰 입력하세요.';
    lastFrame = now; animationId = requestAnimationFrame(loop); return;
  }
  state.running = !state.running;
  if (state.running) {
    state.pauseAccumulated += now - state.pausedAt;
    if (uploadedSong) await ui.audioPlayer.play();
    lastFrame = now; animationId = requestAnimationFrame(loop);
  } else {
    state.pausedAt = now; if (uploadedSong) ui.audioPlayer.pause(); cancelAnimationFrame(animationId); draw(songTime(now)); ui.status.textContent = '일시정지됨.';
  }
}
async function playSongFromStart() { ui.audioPlayer.currentTime = 0; await ui.audioPlayer.play(); }
function stopSong() { if (!uploadedSong) return; ui.audioPlayer.pause(); ui.audioPlayer.currentTime = 0; }

function judge(lane) {
  if (!state.running) return;
  const time = inputAdjustedTime();
  heldKeys.add(lane);
  const candidate = state.notes
    .filter((note) => note.lane === lane && !note.hit && !note.missed)
    .map((note) => ({ note, delta: Math.abs(note.time - time) }))
    .filter(({ delta }) => delta <= windows.at(-1).ms)
    .sort((a, b) => a.delta - b.delta)[0];
  state.laneFlash[lane] = 1; beep(330 + lane * 90, .045, 'triangle');
  if (!candidate) { registerMiss('Empty'); return; }
  const judgement = windows.find((window) => candidate.delta <= window.ms);
  const note = candidate.note;
  note.hit = true;
  if (note.duration > 0) {
    note.holding = true;
    addHitEffect(lane, 'Hold', '#72f6d1');
    showJudgement('Hold', `${candidate.delta.toFixed(0)}ms · 유지`, judgement.color);
    return;
  }
  scoreHit(judgement, lane, candidate.delta);
}
function releaseLane(lane) {
  heldKeys.delete(lane);
  if (!state.running) return;
  const time = inputAdjustedTime();
  const holding = state.notes.find((note) => note.lane === lane && note.holding && !note.completed && !note.missed);
  if (!holding) return;
  const end = holding.time + holding.duration;
  const delta = Math.abs(end - time);
  if (delta <= windows.at(-1).ms || time >= end) completeLongNote(holding, delta, lane);
  else failLongNote(holding, lane);
}
function scoreHit(judgement, lane, delta, longBonus = 1) {
  state.combo += 1; state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.score += (judgement.score + state.combo * 7) * longBonus;
  state.life = Math.min(100, state.life + judgement.life);
  state.hits += 1; state.judged += 1; state.totalHitValue += judgement.score / 1000;
  addHitEffect(lane, judgement.name, judgement.color);
  showJudgement(judgement.name, `${delta.toFixed(0)}ms`, judgement.color); updateHud();
}
function completeLongNote(note, delta, lane) {
  note.completed = true; note.holding = false;
  const judgement = windows.find((window) => delta <= window.ms) ?? windows.at(-1);
  scoreHit(judgement, lane, delta, 1.35);
}
function failLongNote(note, lane) { note.missed = true; note.holding = false; addHitEffect(lane, 'Break', '#ff5c9a'); registerMiss('LongBreak'); }
function registerMiss(reason = 'Miss') {
  state.combo = 0;
  state.life = Math.max(0, state.life - (reason === 'Empty' ? state.difficulty.emptyDamage : state.difficulty.missDamage));
  if (reason !== 'Empty') state.judged += 1;
  showJudgement('Miss', reason === 'Empty' ? '노트 없음' : '지나감', '#ff5c9a'); updateHud();
  if (state.life <= 0) finish('체력이 0이 됐습니다. R로 재시작하세요.');
}
function showJudgement(label, detail, color) { ui.judgement.textContent = label; ui.judgement.style.color = color; ui.status.textContent = detail; }
function updateHud() {
  ui.songLabel.textContent = activeTitle(); ui.difficultyLabel.textContent = state.usesCustomChart ? 'Custom' : state.difficulty.label;
  ui.score.textContent = Math.round(state.score).toLocaleString('ko-KR'); ui.combo.textContent = state.combo;
  const accuracy = state.judged ? (state.totalHitValue / state.judged) * 100 : 100;
  ui.accuracy.textContent = `${accuracy.toFixed(2)}%`; ui.life.textContent = Math.round(state.life);
}
function loop(now) {
  const dt = Math.min(50, now - lastFrame); lastFrame = now; const time = songTime(now);
  state.laneFlash = state.laneFlash.map((value) => Math.max(0, value - dt / 120));
  hitEffects = hitEffects.filter((effect) => (effect.age += dt) < 520);
  state.notes.forEach((note) => {
    if (note.missed || note.completed) return;
    if (note.duration > 0 && note.holding && time >= note.time + note.duration && heldKeys.has(note.lane)) completeLongNote(note, 0, note.lane);
    if (!note.hit && time - note.time > windows.at(-1).ms) { note.missed = true; registerMiss('Miss'); }
    if (note.duration > 0 && note.holding && time - (note.time + note.duration) > windows.at(-1).ms && !heldKeys.has(note.lane)) failLongNote(note, note.lane);
  });
  if (!uploadedSong) playMetronome(time);
  draw(time); drawTimeline();
  const lastNoteTime = Math.max(0, ...state.notes.map((note) => note.time + note.duration));
  if ((uploadedSong && ui.audioPlayer.ended) || time > lastNoteTime + 1800) { finish(`완주! Max Combo ${state.maxCombo}`); return; }
  if (state.running) animationId = requestAnimationFrame(loop);
}
function playMetronome(time) { const beatMs = 60000 / activeBpm(); if (time >= state.nextTick) { const beatIndex = Math.round(state.nextTick / beatMs); beep(beatIndex % 4 === 0 ? 220 : 165, .035, 'square', .45); state.nextTick += beatMs; } }
function finish(message) { state.running = false; state.finished = true; state.pausedAt = performance.now(); if (uploadedSong) ui.audioPlayer.pause(); cancelAnimationFrame(animationId); ui.status.textContent = message; showResult(); }
function showResult() {
  const accuracy = state.judged ? (state.totalHitValue / state.judged) * 100 : 100;
  const rank = accuracy >= 98 ? 'SS' : accuracy >= 94 ? 'S' : accuracy >= 88 ? 'A' : accuracy >= 80 ? 'B' : accuracy >= 70 ? 'C' : 'D';
  ui.resultRank.textContent = rank; ui.resultScore.textContent = Math.round(state.score).toLocaleString('ko-KR'); ui.resultCombo.textContent = state.maxCombo; ui.resultAccuracy.textContent = `${accuracy.toFixed(2)}%`; ui.resultNotes.textContent = state.notes.length;
  ui.resultDialog.showModal();
}

function draw(time) { ctx.clearRect(0, 0, canvas.width, canvas.height); drawBackground(); drawLanes(time); drawNotes(time); drawHitEffects(); drawOverlay(); }
function drawBackground() { const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height); gradient.addColorStop(0, '#111a35'); gradient.addColorStop(1, '#060812'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = .10; ctx.strokeStyle = '#fff'; for (let x = 0; x < canvas.width; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 140, canvas.height); ctx.stroke(); } ctx.globalAlpha = 1; }
function drawLanes(time) {
  for (let lane = 0; lane < 4; lane += 1) { const y = laneY(lane); ctx.fillStyle = lane % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)'; ctx.fillRect(64, y - 34, canvas.width - 110, 68); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.strokeRect(64, y - 34, canvas.width - 110, 68); ctx.fillStyle = `rgba(114,246,209,${.18 + state.laneFlash[lane] * .45})`; roundRect(judgementLineX - 34, y - 34, 68, 68, 16); ctx.fill(); ctx.fillStyle = '#eef3ff'; ctx.font = '900 24px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(LANES[lane], judgementLineX, y); }
  ctx.strokeStyle = '#72f6d1'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(judgementLineX, 54); ctx.lineTo(judgementLineX, 450); ctx.stroke();
  ctx.fillStyle = 'rgba(238,243,255,.68)'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'left'; const mode = state.usesCustomChart ? `CUSTOM · ${customChart.length} NOTES · ${activeBpm()} BPM` : `${state.difficulty.label.toUpperCase()} · ${state.difficulty.bpm} BPM`; ctx.fillText(`${mode} · LATENCY ${latencyMs}ms · TIME ${(time / 1000).toFixed(2)}s`, 76, 500);
}
function drawNotes(time) {
  const travelMs = baseTravelMs / state.difficulty.speed;
  state.notes.forEach((note) => { if (note.completed || note.missed) return; const x = noteX(note.time, time, travelMs); const y = laneY(note.lane); const endX = note.duration > 0 ? noteX(note.time + note.duration, time, travelMs) : x; if (Math.max(x, endX) < judgementLineX - 100 || Math.min(x, endX) > spawnX + 70) return; if (note.duration > 0) { ctx.strokeStyle = note.holding ? '#72f6d1' : '#ff5c9a'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, y); ctx.stroke(); ctx.lineCap = 'butt'; } const hotness = 1 - Math.min(1, Math.abs(note.time - time) / 420); ctx.shadowColor = `rgba(255,92,154,${.35 + hotness * .45})`; ctx.shadowBlur = 18 + hotness * 18; ctx.fillStyle = note.duration > 0 ? '#72f6d1' : (note.lane % 2 ? '#8bb8ff' : '#ff5c9a'); ctx.beginPath(); ctx.arc(x, y, noteRadius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.beginPath(); ctx.arc(x - 7, y - 7, 5, 0, Math.PI * 2); ctx.fill(); });
}
function noteX(noteTime, time, travelMs) { return judgementLineX + (noteTime - time) / travelMs * (spawnX - judgementLineX); }
function addHitEffect(lane, label, color) { hitEffects.push({ lane, label, color, age: 0 }); }
function drawHitEffects() { hitEffects.forEach((effect) => { const progress = effect.age / 520; const y = laneY(effect.lane); ctx.globalAlpha = 1 - progress; ctx.strokeStyle = effect.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(judgementLineX, y, 36 + progress * 42, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = effect.color; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(effect.label, judgementLineX + 92, y - progress * 26); ctx.globalAlpha = 1; }); }
function drawOverlay() { if (state.running) return; ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#eef3ff'; ctx.textAlign = 'center'; ctx.font = '900 38px system-ui'; ctx.fillText(state.startedAt ? 'PAUSED' : 'READY', canvas.width / 2, 250); ctx.font = '700 18px system-ui'; ctx.fillStyle = 'rgba(238,243,255,.72)'; ctx.fillText('Space / Start로 시작', canvas.width / 2, 286); }
function laneY(lane) { return laneTop + lane * laneGap; }
function roundRect(x, y, width, height, radius) { ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.arcTo(x, y, x + width, y, radius); ctx.closePath(); }

function snapTime(time) { const snap = activeSnap(); if (!snap) return Math.max(0, Math.round(time)); const step = 60000 / activeBpm() * 4 / snap; const offset = activeOffset(); return Math.max(0, Math.round(Math.round((time - offset) / step) * step + offset)); }
function addEditorNote(lane, time = currentEditorTime(), duration = 0) { customChart.push({ lane, time: snapTime(time), duration: Math.max(0, Number(duration) || 0) }); customChart = clonePlayableNotes(customChart); selectedNoteIndex = customChart.length - 1; syncCustomChartIntoGame(); refreshChartEditor(); ui.status.textContent = `${LANES[lane]} 레인에 ${(snapTime(time) / 1000).toFixed(3)}s ${duration ? '롱노트' : '노트'} 추가.`; }
function removeEditorNote(index) { customChart.splice(index, 1); selectedNoteIndex = -1; syncCustomChartIntoGame(); refreshChartEditor(); }
function currentEditorTime() { return ui.audioPlayer.currentTime * 1000; }
function syncCustomChartIntoGame() { if (!state) return; state.usesCustomChart = customChart.length > 0; state.notes = state.usesCustomChart ? clonePlayableNotes(customChart) : makeChart(state.difficulty); updateHud(); draw(songTime()); drawTimeline(); }
function refreshChartEditor() { ui.editorCount.textContent = `${customChart.length} notes`; ui.editorTime.textContent = `${(currentEditorTime() / 1000).toFixed(3)}s`; ui.exportChart.value = JSON.stringify(buildChartPayload(), null, 2); renderChartList(); drawTimeline(); }
function renderChartList() { ui.chartList.innerHTML = ''; customChart.slice(0, 120).forEach((note, index) => { const row = document.createElement('li'); row.innerHTML = `<button type="button" data-remove-note="${index}">×</button><span>${(note.time / 1000).toFixed(3)}s</span><strong>${LANES[note.lane]}</strong><em>${note.duration ? `${note.duration}ms` : 'tap'}</em>`; if (index === selectedNoteIndex) row.style.outline = '2px solid var(--accent)'; ui.chartList.append(row); }); }
function buildChartPayload() { return { title: activeTitle(), format: 'sidebeat-lanes-chart-v2', difficulty: currentDifficulty, bpm: activeBpm(), offset: activeOffset(), latencyMs, audioFileName: uploadedSong?.name ?? null, notes: customChart.map(({ lane, time, duration }) => ({ lane, time, duration })) }; }
function importChartFromText() { const payload = JSON.parse(ui.importChart.value); applyChartPayload(payload); }
function applyChartPayload(payload) { const notes = Array.isArray(payload) ? payload : payload.notes; if (!Array.isArray(notes)) throw new Error('notes 배열을 찾을 수 없습니다.'); if (payload.difficulty && difficulties[payload.difficulty]) { currentDifficulty = payload.difficulty; ui.difficultySelect.value = currentDifficulty; } if (payload.bpm) ui.bpmInput.value = payload.bpm; if (payload.offset !== undefined) ui.offsetInput.value = payload.offset; if (payload.latencyMs !== undefined) setLatency(payload.latencyMs); if (payload.title) ui.songTitle.value = payload.title; customChart = clonePlayableNotes(notes); refreshChartEditor(); reset(); }
function downloadChartJson() { const blob = new Blob([JSON.stringify(buildChartPayload(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${slugify(activeTitle())}.json`; anchor.click(); URL.revokeObjectURL(url); }
function slugify(value) { return value.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9가-힣]+/gi, '-').replace(/^-|-$/g, '') || 'sidebeat-chart'; }

function drawTimeline() { const w = timeline.width, h = timeline.height; tctx.clearRect(0, 0, w, h); tctx.fillStyle = '#080b15'; tctx.fillRect(0, 0, w, h); const duration = timelineDuration(); const viewStart = Math.max(0, currentEditorTime() - duration * .42); const laneH = h / 4; for (let lane = 0; lane < 4; lane++) { tctx.fillStyle = lane % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)'; tctx.fillRect(0, lane * laneH, w, laneH - 1); tctx.fillStyle = '#eef3ff'; tctx.font = '900 16px system-ui'; tctx.fillText(LANES[lane], 14, lane * laneH + laneH / 2 + 6); } drawBeatGrid(viewStart, duration); customChart.forEach((note, index) => { const x = (note.time - viewStart) / duration * w; const y = note.lane * laneH + laneH / 2; const endX = (note.time + note.duration - viewStart) / duration * w; if (endX < -20 || x > w + 20) return; tctx.strokeStyle = index === selectedNoteIndex ? '#ffd166' : (note.duration ? '#72f6d1' : '#ff5c9a'); tctx.fillStyle = tctx.strokeStyle; if (note.duration) { tctx.lineWidth = 10; tctx.lineCap = 'round'; tctx.beginPath(); tctx.moveTo(x, y); tctx.lineTo(endX, y); tctx.stroke(); } tctx.beginPath(); tctx.arc(x, y, 9, 0, Math.PI * 2); tctx.fill(); }); const playX = (currentEditorTime() - viewStart) / duration * w; tctx.strokeStyle = '#fff'; tctx.lineWidth = 2; tctx.beginPath(); tctx.moveTo(playX, 0); tctx.lineTo(playX, h); tctx.stroke(); }
function drawBeatGrid(viewStart, duration) { const bpm = activeBpm(); const snap = activeSnap() || 4; const step = 60000 / bpm * 4 / snap; const offset = activeOffset(); const first = Math.floor((viewStart - offset) / step) * step + offset; for (let t = first; t < viewStart + duration; t += step) { const x = (t - viewStart) / duration * timeline.width; const isBeat = Math.abs(((t - offset) / (60000 / bpm)) - Math.round((t - offset) / (60000 / bpm))) < .01; tctx.strokeStyle = isBeat ? 'rgba(114,246,209,.35)' : 'rgba(255,255,255,.08)'; tctx.lineWidth = isBeat ? 2 : 1; tctx.beginPath(); tctx.moveTo(x, 0); tctx.lineTo(x, timeline.height); tctx.stroke(); } }
function timelineDuration() { return Math.max(8000, (ui.audioPlayer.duration || 0) * 1000 || 16000) / 2.4; }
function timelineToNote(event) { const rect = timeline.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width * timeline.width; const y = (event.clientY - rect.top) / rect.height * timeline.height; const duration = timelineDuration(); const viewStart = Math.max(0, currentEditorTime() - duration * .42); return { time: snapTime(viewStart + x / timeline.width * duration), lane: Math.max(0, Math.min(3, Math.floor(y / (timeline.height / 4)))) }; }
function findTimelineNote(event) { const pos = timelineToNote(event); let best = -1, bestDelta = Infinity; customChart.forEach((note, index) => { const d = Math.abs(note.time - pos.time) + (note.lane === pos.lane ? 0 : 1200); if (d < bestDelta && d < 650) { best = index; bestDelta = d; } }); return best; }

function saveSongToLibrary() { const library = getLibrary(); const payload = buildChartPayload(); payload.id = payload.id || crypto.randomUUID(); payload.savedAt = new Date().toISOString(); const existing = library.findIndex((item) => item.id === payload.id || item.title === payload.title); if (existing >= 0) library[existing] = payload; else library.push(payload); localStorage.setItem(chartStoreKey, JSON.stringify(library)); renderLibrary(); ui.status.textContent = `${payload.title} 저장 완료.`; }
function getLibrary() { try { return JSON.parse(localStorage.getItem(chartStoreKey) || '[]'); } catch { return []; } }
function renderLibrary() { const library = getLibrary(); ui.songLibrary.innerHTML = ''; library.forEach((song, index) => { const option = document.createElement('option'); option.value = index; option.textContent = `${song.title} · ${song.notes?.length ?? 0} notes`; ui.songLibrary.append(option); }); }
function loadSelectedSong() { const song = getLibrary()[Number(ui.songLibrary.value)]; if (!song) return; applyChartPayload(song); ui.status.textContent = `${song.title} 채보를 불러왔습니다. 오디오가 필요하면 곡 파일을 다시 선택하세요.`; }
function deleteSelectedSong() { const library = getLibrary(); const index = Number(ui.songLibrary.value); if (!library[index]) return; const [removed] = library.splice(index, 1); localStorage.setItem(chartStoreKey, JSON.stringify(library)); renderLibrary(); ui.status.textContent = `${removed.title} 삭제 완료.`; }

function setLatency(value) { latencyMs = Math.round(Number(value) || 0); localStorage.setItem('sidebeat-latency-ms', String(latencyMs)); ui.latencyValue.textContent = `${latencyMs}ms`; }
function startLatencyCheck() { ensureAudio(); clearInterval(latencyTimer); latencySession = { started: performance.now() + 900, interval: 800, taps: [] }; ui.latencyStatus.textContent = '비트에 맞춰 Tap 8번'; latencyTimer = setInterval(() => { const now = performance.now(); const beat = Math.round((now - latencySession.started) / latencySession.interval); if (beat >= 0) beep(beat % 4 === 0 ? 600 : 440, .045, 'square', .7); }, 100); }
function latencyTap() { if (!latencySession) return; const now = performance.now(); const nearest = Math.round((now - latencySession.started) / latencySession.interval) * latencySession.interval + latencySession.started; latencySession.taps.push(now - nearest); ui.latencyStatus.textContent = `${latencySession.taps.length}/8 taps`; if (latencySession.taps.length >= 8) { const avg = latencySession.taps.reduce((a, b) => a + b, 0) / latencySession.taps.length; setLatency(avg); clearInterval(latencyTimer); latencySession = null; ui.latencyStatus.textContent = '보정 적용됨'; } }

window.addEventListener('keydown', (event) => { if (event.repeat) return; const target = event.target; const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement; if (!isTyping && event.code === 'Space') { event.preventDefault(); toggleStart(); return; } if (!isTyping && event.key.toLowerCase() === 'r') { reset(); return; } const lane = LANE_KEYS.get(event.key.toLowerCase()); if (lane !== undefined && !isTyping) judge(lane); });
window.addEventListener('keyup', (event) => { const lane = LANE_KEYS.get(event.key.toLowerCase()); if (lane !== undefined) releaseLane(lane); });
ui.difficultySelect.addEventListener('change', (event) => { currentDifficulty = event.target.value; ui.bpmInput.value = activeDifficulty().bpm; reset(); });
ui.startButton.addEventListener('click', toggleStart); ui.restartButton.addEventListener('click', reset); ui.closeResult.addEventListener('click', () => ui.resultDialog.close());
ui.audioUpload.addEventListener('change', (event) => { const file = event.target.files?.[0]; if (!file) return; if (uploadedSong?.url) URL.revokeObjectURL(uploadedSong.url); uploadedSong = { name: file.name, url: URL.createObjectURL(file) }; ui.audioPlayer.src = uploadedSong.url; ui.songTitle.value ||= file.name.replace(/\.[^.]+$/, ''); reset(); refreshChartEditor(); ui.status.textContent = `${file.name} 업로드 완료.`; });
ui.audioPlayer.addEventListener('timeupdate', refreshChartEditor); ui.audioPlayer.addEventListener('loadedmetadata', refreshChartEditor); ui.audioPlayer.addEventListener('play', () => { cancelAnimationFrame(editorAnimationId); const tick = () => { refreshChartEditor(); editorAnimationId = requestAnimationFrame(tick); }; tick(); }); ui.audioPlayer.addEventListener('pause', () => cancelAnimationFrame(editorAnimationId));
ui.editorLaneButtons.forEach((button) => button.addEventListener('click', () => addEditorNote(Number(button.dataset.editorLane)))); ui.addLongNote.addEventListener('click', () => addEditorNote(0, currentEditorTime(), Number(ui.longDurationInput.value) || 900));
ui.chartList.addEventListener('click', (event) => { const button = event.target.closest('[data-remove-note]'); if (button) removeEditorNote(Number(button.dataset.removeNote)); });
ui.importChart.addEventListener('change', () => { try { importChartFromText(); ui.status.textContent = '채보 JSON을 불러왔습니다.'; } catch (error) { ui.status.textContent = `채보 불러오기 실패: ${error.message}`; } });
ui.clearChart.addEventListener('click', () => { customChart = []; refreshChartEditor(); reset(); }); ui.downloadChart.addEventListener('click', downloadChartJson); ui.saveSong.addEventListener('click', saveSongToLibrary); ui.loadSong.addEventListener('click', loadSelectedSong); ui.deleteSong.addEventListener('click', deleteSelectedSong);
ui.startLatency.addEventListener('click', startLatencyCheck); ui.latencyTap.addEventListener('click', latencyTap); [ui.bpmInput, ui.offsetInput, ui.snapSelect].forEach((el) => el.addEventListener('change', refreshChartEditor));
timeline.addEventListener('pointerdown', (event) => { const found = findTimelineNote(event); if (found >= 0) { selectedNoteIndex = dragNoteIndex = found; } else { const pos = timelineToNote(event); addEditorNote(pos.lane, pos.time, event.shiftKey ? Number(ui.longDurationInput.value) || 900 : 0); dragNoteIndex = selectedNoteIndex; } timeline.setPointerCapture(event.pointerId); refreshChartEditor(); });
timeline.addEventListener('pointermove', (event) => { if (dragNoteIndex < 0) return; const pos = timelineToNote(event); customChart[dragNoteIndex].time = pos.time; customChart[dragNoteIndex].lane = pos.lane; customChart = clonePlayableNotes(customChart); selectedNoteIndex = customChart.findIndex((note) => note.time === pos.time && note.lane === pos.lane); dragNoteIndex = selectedNoteIndex; syncCustomChartIntoGame(); refreshChartEditor(); });
timeline.addEventListener('pointerup', () => { dragNoteIndex = -1; });

setLatency(latencyMs); renderLibrary(); reset(); refreshChartEditor();
