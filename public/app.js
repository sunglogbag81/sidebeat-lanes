// Sidebeat Lanes core: notes move right-to-left into the judgement line.
const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');

const ui = {
  score: document.querySelector('#score'),
  combo: document.querySelector('#combo'),
  accuracy: document.querySelector('#accuracy'),
  life: document.querySelector('#life'),
  difficultyLabel: document.querySelector('#difficultyLabel'),
  difficultySelect: document.querySelector('#difficultySelect'),
  judgement: document.querySelector('#judgement'),
  status: document.querySelector('#status'),
  startButton: document.querySelector('#startButton'),
  restartButton: document.querySelector('#restartButton'),
  audioUpload: document.querySelector('#audioUpload'),
  audioPlayer: document.querySelector('#audioPlayer'),
  songTitle: document.querySelector('#songTitle'),
  editorTime: document.querySelector('#editorTime'),
  editorCount: document.querySelector('#editorCount'),
  chartList: document.querySelector('#chartList'),
  exportChart: document.querySelector('#exportChart'),
  importChart: document.querySelector('#importChart'),
  clearChart: document.querySelector('#clearChart'),
  downloadChart: document.querySelector('#downloadChart'),
  editorLaneButtons: [...document.querySelectorAll('[data-editor-lane]')],
};

const LANES = ['D', 'F', 'J', 'K'];
const LANE_KEYS = new Map(LANES.map((key, lane) => [key.toLowerCase(), lane]));
const judgementLineX = 150;
const spawnX = 1040;
const baseTravelMs = 2200;
const laneTop = 92;
const laneGap = 82;
const noteRadius = 22;
const chartOffsetMs = 1200;

const windows = [
  { name: 'Perfect', ms: 45, score: 1000, life: 2, color: '#78f7d1' },
  { name: 'Great', ms: 90, score: 700, life: 1, color: '#8bb8ff' },
  { name: 'Good', ms: 140, score: 350, life: 0, color: '#ffd166' },
];

let audioContext;
let masterGain;
let state;
let animationId;
let editorAnimationId;
let lastFrame = 0;
let currentDifficulty = 'normal';
let customChart = [];
let uploadedSong = null;

const difficulties = {
  easy: {
    label: 'Easy',
    bpm: 104,
    bars: 6,
    speed: 0.86,
    missDamage: 6,
    emptyDamage: 2,
    patterns: [0, 1, 2, 3, 0, 1, 2, 3],
  },
  normal: {
    label: 'Normal',
    bpm: 128,
    bars: 8,
    speed: 1,
    missDamage: 8,
    emptyDamage: 3,
    patterns: [0, 1, 2, 3, 1, 0, 3, 2, [0, 2], 1, 3, [1, 3], 2, 0, 1, 3],
  },
  hard: {
    label: 'Hard',
    bpm: 150,
    bars: 10,
    speed: 1.18,
    missDamage: 10,
    emptyDamage: 4,
    patterns: [0, 2, 1, 3, [0, 1], 2, 3, 1, [2, 3], 0, 1, [0, 3], 2, 1, 3, [1, 2]],
  },
  expert: {
    label: 'Expert',
    bpm: 172,
    bars: 12,
    speed: 1.34,
    missDamage: 12,
    emptyDamage: 5,
    patterns: [0, [1, 3], 2, 1, [0, 2], 3, 0, [1, 2], 3, 2, [0, 3], 1, 0, 2, [1, 3], [0, 2]],
  },
};

function activeDifficulty() {
  return difficulties[currentDifficulty] ?? difficulties.normal;
}

function makeChart(difficulty = activeDifficulty()) {
  if (customChart.length > 0) return clonePlayableNotes(customChart);

  const notes = [];
  const beat = 60000 / difficulty.bpm;
  for (let bar = 0; bar < difficulty.bars; bar += 1) {
    difficulty.patterns.forEach((pattern, index) => {
      const time = chartOffsetMs + (bar * difficulty.patterns.length + index) * (beat / 2);
      const lanes = Array.isArray(pattern) ? pattern : [pattern];
      lanes.forEach((lane) => notes.push({ lane, time, hit: false, missed: false }));
    });
  }
  return notes;
}

function clonePlayableNotes(notes) {
  return notes
    .map((note) => ({ lane: Number(note.lane), time: Number(note.time), hit: false, missed: false }))
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
  };
  ui.judgement.textContent = 'Ready';
  ui.status.textContent = state.usesCustomChart
    ? `커스텀 채보 ${customChart.length}개 노트. Space 또는 Start로 시작하세요.`
    : `난이도 ${difficulty.label}. Space 또는 Start로 시작하세요.`;
  updateHud();
  draw(0);
}

function ensureAudio() {
  if (audioContext) return;
  audioContext = new AudioContext();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.16;
  masterGain.connect(audioContext.destination);
}

function beep(frequency = 440, duration = 0.055, type = 'sine') {
  if (!audioContext || !masterGain) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.frequency.value = frequency;
  osc.type = type;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.8, audioContext.currentTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  osc.connect(gain).connect(masterGain);
  osc.start();
  osc.stop(audioContext.currentTime + duration + 0.02);
}

function songTime(now = performance.now()) {
  if (uploadedSong && state.running) return ui.audioPlayer.currentTime * 1000;
  if (uploadedSong && state.startedAt) return ui.audioPlayer.currentTime * 1000;
  if (!state.startedAt) return 0;
  const end = state.running ? now : state.pausedAt;
  return end - state.startedAt - state.pauseAccumulated;
}

async function toggleStart() {
  ensureAudio();
  if (audioContext.state === 'suspended') await audioContext.resume();

  const now = performance.now();
  if (!state.startedAt) {
    state.startedAt = now;
    state.running = true;
    if (uploadedSong) await playSongFromStart();
    ui.status.textContent = uploadedSong ? '업로드한 곡 재생 중 — 커스텀 채보를 입력하세요.' : '진행 중 — 왼쪽 판정선에 맞춰 입력하세요.';
    lastFrame = now;
    animationId = requestAnimationFrame(loop);
    return;
  }

  state.running = !state.running;
  if (state.running) {
    state.pauseAccumulated += now - state.pausedAt;
    if (uploadedSong) await ui.audioPlayer.play();
    ui.status.textContent = '진행 중 — 왼쪽 판정선에 맞춰 입력하세요.';
    lastFrame = now;
    animationId = requestAnimationFrame(loop);
  } else {
    state.pausedAt = now;
    if (uploadedSong) ui.audioPlayer.pause();
    ui.status.textContent = '일시정지됨.';
    cancelAnimationFrame(animationId);
    draw(songTime(now));
  }
}

async function playSongFromStart() {
  ui.audioPlayer.currentTime = 0;
  await ui.audioPlayer.play();
}

function stopSong() {
  if (!uploadedSong) return;
  ui.audioPlayer.pause();
  ui.audioPlayer.currentTime = 0;
}

function judge(lane) {
  if (!state.running) return;
  const time = songTime();
  const candidate = state.notes
    .filter((note) => note.lane === lane && !note.hit && !note.missed)
    .map((note) => ({ note, delta: Math.abs(note.time - time) }))
    .filter(({ delta }) => delta <= windows.at(-1).ms)
    .sort((a, b) => a.delta - b.delta)[0];

  state.laneFlash[lane] = 1;
  beep(330 + lane * 90, 0.045, 'triangle');

  if (!candidate) {
    registerMiss('Empty');
    return;
  }

  const judgement = windows.find((window) => candidate.delta <= window.ms);
  candidate.note.hit = true;
  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.score += judgement.score + state.combo * 7;
  state.life = Math.min(100, state.life + judgement.life);
  state.hits += 1;
  state.judged += 1;
  state.totalHitValue += judgement.score / 1000;
  showJudgement(judgement.name, `${candidate.delta.toFixed(0)}ms`, judgement.color);
  updateHud();
}

function registerMiss(reason = 'Miss') {
  state.combo = 0;
  state.life = Math.max(0, state.life - (reason === 'Empty' ? state.difficulty.emptyDamage : state.difficulty.missDamage));
  if (reason !== 'Empty') state.judged += 1;
  showJudgement('Miss', reason === 'Empty' ? '노트 없음' : '지나감', '#ff5c9a');
  updateHud();
  if (state.life <= 0) finish('체력이 0이 됐습니다. R로 재시작하세요.');
}

function showJudgement(label, detail, color) {
  ui.judgement.textContent = label;
  ui.judgement.style.color = color;
  ui.status.textContent = detail;
}

function updateHud() {
  ui.difficultyLabel.textContent = state.usesCustomChart ? 'Custom' : state.difficulty.label;
  ui.score.textContent = Math.round(state.score).toLocaleString('ko-KR');
  ui.combo.textContent = state.combo;
  const accuracy = state.judged ? (state.totalHitValue / state.judged) * 100 : 100;
  ui.accuracy.textContent = `${accuracy.toFixed(2)}%`;
  ui.life.textContent = Math.round(state.life);
}

function loop(now) {
  const dt = Math.min(50, now - lastFrame);
  lastFrame = now;
  const time = songTime(now);

  state.laneFlash = state.laneFlash.map((value) => Math.max(0, value - dt / 120));
  state.notes.forEach((note) => {
    if (!note.hit && !note.missed && time - note.time > windows.at(-1).ms) {
      note.missed = true;
      registerMiss('Miss');
    }
  });

  if (!uploadedSong) playMetronome(time);
  draw(time);

  const lastNoteTime = state.notes.at(-1)?.time ?? 0;
  const songEnded = uploadedSong && ui.audioPlayer.ended;
  if (songEnded || time > lastNoteTime + 1800) {
    finish(`완주! Max Combo ${state.maxCombo}`);
    return;
  }
  if (state.running) animationId = requestAnimationFrame(loop);
}

function playMetronome(time) {
  const beatMs = 60000 / state.difficulty.bpm;
  if (time >= state.nextTick) {
    const beatIndex = Math.round(state.nextTick / beatMs);
    beep(beatIndex % 4 === 0 ? 220 : 165, 0.035, 'square');
    state.nextTick += beatMs;
  }
}

function finish(message) {
  state.running = false;
  state.pausedAt = performance.now();
  if (uploadedSong) ui.audioPlayer.pause();
  cancelAnimationFrame(animationId);
  ui.status.textContent = message;
}

function draw(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawLanes(time);
  drawNotes(time);
  drawOverlay(time);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#11182f');
  gradient.addColorStop(1, '#070911');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ffffff';
  for (let x = 0; x < canvas.width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 140, canvas.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawLanes(time) {
  ctx.lineWidth = 2;
  for (let lane = 0; lane < 4; lane += 1) {
    const y = laneY(lane);
    ctx.fillStyle = lane % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(64, y - 34, canvas.width - 110, 68);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(64, y - 34, canvas.width - 110, 68);

    ctx.fillStyle = `rgba(120, 247, 209, ${0.18 + state.laneFlash[lane] * 0.45})`;
    roundRect(judgementLineX - 34, y - 34, 68, 68, 16);
    ctx.fill();

    ctx.fillStyle = '#eef3ff';
    ctx.font = '800 24px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LANES[lane], judgementLineX, y);
  }

  ctx.strokeStyle = '#78f7d1';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(judgementLineX, 54);
  ctx.lineTo(judgementLineX, 424);
  ctx.stroke();

  ctx.fillStyle = 'rgba(238,243,255,0.64)';
  ctx.font = '700 14px system-ui';
  ctx.textAlign = 'left';
  const mode = state.usesCustomChart ? `CUSTOM · ${customChart.length} NOTES` : `${state.difficulty.label.toUpperCase()} · ${state.difficulty.bpm} BPM`;
  ctx.fillText(`${mode} · TIME ${(time / 1000).toFixed(2)}s`, 76, 470);
}

function drawNotes(time) {
  state.notes.forEach((note) => {
    if (note.hit || note.missed) return;
    const travelMs = baseTravelMs / state.difficulty.speed;
    const x = judgementLineX + (note.time - time) / travelMs * (spawnX - judgementLineX);
    if (x < judgementLineX - 90 || x > spawnX + 60) return;
    const y = laneY(note.lane);

    const hotness = 1 - Math.min(1, Math.abs(note.time - time) / 420);
    ctx.shadowColor = `rgba(255, 92, 154, ${0.35 + hotness * 0.45})`;
    ctx.shadowBlur = 18 + hotness * 18;
    ctx.fillStyle = note.lane % 2 ? '#8bb8ff' : '#ff5c9a';
    ctx.beginPath();
    ctx.arc(x, y, noteRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.arc(x - 7, y - 7, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawOverlay() {
  if (state.running) return;
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#eef3ff';
  ctx.textAlign = 'center';
  ctx.font = '900 38px system-ui';
  ctx.fillText(state.startedAt ? 'PAUSED' : 'READY', canvas.width / 2, 236);
  ctx.font = '600 18px system-ui';
  ctx.fillStyle = 'rgba(238,243,255,0.72)';
  ctx.fillText('Space / Start로 시작', canvas.width / 2, 272);
}

function laneY(lane) {
  return laneTop + lane * laneGap;
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function addEditorNote(lane, time = currentEditorTime()) {
  const wasPlaying = !ui.audioPlayer.paused;
  customChart.push({ lane, time: Math.max(0, Math.round(time)) });
  customChart = clonePlayableNotes(customChart);
  syncCustomChartIntoGame();
  refreshChartEditor();
  ui.audioPlayer.currentTime = time / 1000;
  if (wasPlaying) ui.audioPlayer.play();
  ui.status.textContent = `${LANES[lane]} 레인에 ${(time / 1000).toFixed(3)}s 노트를 추가했습니다.`;
}

function removeEditorNote(index) {
  customChart.splice(index, 1);
  syncCustomChartIntoGame();
  refreshChartEditor();
}

function syncCustomChartIntoGame() {
  if (!state) return;
  state.usesCustomChart = customChart.length > 0;
  state.notes = state.usesCustomChart ? clonePlayableNotes(customChart) : makeChart(state.difficulty);
  updateHud();
  draw(songTime());
}

function currentEditorTime() {
  return ui.audioPlayer.currentTime * 1000;
}

function refreshChartEditor() {
  ui.editorCount.textContent = `${customChart.length} notes`;
  ui.editorTime.textContent = `${(currentEditorTime() / 1000).toFixed(3)}s`;
  ui.chartList.innerHTML = '';

  customChart.slice(0, 80).forEach((note, index) => {
    const row = document.createElement('li');
    row.innerHTML = `<button type="button" data-remove-note="${index}">×</button><span>${(note.time / 1000).toFixed(3)}s</span><strong>${LANES[note.lane]}</strong>`;
    ui.chartList.append(row);
  });

  if (customChart.length > 80) {
    const row = document.createElement('li');
    row.textContent = `… ${customChart.length - 80}개 더 있음`;
    ui.chartList.append(row);
  }

  ui.exportChart.value = JSON.stringify(buildChartPayload(), null, 2);
}

function buildChartPayload() {
  return {
    title: ui.songTitle.value || uploadedSong?.name || 'Untitled Song',
    format: 'sidebeat-lanes-chart-v1',
    difficulty: currentDifficulty,
    audioFileName: uploadedSong?.name ?? null,
    notes: customChart.map(({ lane, time }) => ({ lane, time })),
  };
}

function importChartFromText() {
  const payload = JSON.parse(ui.importChart.value);
  const notes = Array.isArray(payload) ? payload : payload.notes;
  if (!Array.isArray(notes)) throw new Error('notes 배열을 찾을 수 없습니다.');
  if (payload.difficulty && difficulties[payload.difficulty]) {
    currentDifficulty = payload.difficulty;
    ui.difficultySelect.value = currentDifficulty;
  }
  customChart = clonePlayableNotes(notes);
  if (payload.title) ui.songTitle.value = payload.title;
  refreshChartEditor();
  reset();
}

function downloadChartJson() {
  const blob = new Blob([JSON.stringify(buildChartPayload(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slugify(ui.songTitle.value || uploadedSong?.name || 'sidebeat-chart')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return value.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9가-힣]+/gi, '-').replace(/^-|-$/g, '') || 'sidebeat-chart';
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (!isTyping && event.code === 'Space') {
    event.preventDefault();
    toggleStart();
    return;
  }
  if (!isTyping && event.key.toLowerCase() === 'r') {
    reset();
    return;
  }
  const lane = LANE_KEYS.get(event.key.toLowerCase());
  if (lane !== undefined) judge(lane);
});

ui.difficultySelect.addEventListener('change', (event) => {
  currentDifficulty = event.target.value;
  reset();
});
ui.startButton.addEventListener('click', toggleStart);
ui.restartButton.addEventListener('click', reset);
ui.audioUpload.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (uploadedSong?.url) URL.revokeObjectURL(uploadedSong.url);
  uploadedSong = { name: file.name, url: URL.createObjectURL(file) };
  ui.audioPlayer.src = uploadedSong.url;
  ui.songTitle.value ||= file.name.replace(/\.[^.]+$/, '');
  reset();
  refreshChartEditor();
  ui.status.textContent = `${file.name} 업로드 완료. 오디오를 재생하면서 레인 버튼으로 채보를 찍을 수 있습니다.`;
});
ui.audioPlayer.addEventListener('timeupdate', refreshChartEditor);
ui.audioPlayer.addEventListener('play', () => {
  cancelAnimationFrame(editorAnimationId);
  const tick = () => {
    refreshChartEditor();
    editorAnimationId = requestAnimationFrame(tick);
  };
  tick();
});
ui.audioPlayer.addEventListener('pause', () => cancelAnimationFrame(editorAnimationId));
ui.editorLaneButtons.forEach((button) => {
  button.addEventListener('click', () => addEditorNote(Number(button.dataset.editorLane)));
});
ui.chartList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-note]');
  if (!button) return;
  removeEditorNote(Number(button.dataset.removeNote));
});
ui.importChart.addEventListener('change', () => {
  try {
    importChartFromText();
    ui.status.textContent = '채보 JSON을 불러왔습니다.';
  } catch (error) {
    ui.status.textContent = `채보 불러오기 실패: ${error.message}`;
  }
});
ui.clearChart.addEventListener('click', () => {
  customChart = [];
  refreshChartEditor();
  reset();
});
ui.downloadChart.addEventListener('click', downloadChartJson);

reset();
refreshChartEditor();
