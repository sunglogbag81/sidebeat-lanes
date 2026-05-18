// Sidebeat Lanes core: notes move right-to-left into the judgement line.
const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');

const ui = {
  score: document.querySelector('#score'),
  combo: document.querySelector('#combo'),
  accuracy: document.querySelector('#accuracy'),
  life: document.querySelector('#life'),
  judgement: document.querySelector('#judgement'),
  status: document.querySelector('#status'),
  startButton: document.querySelector('#startButton'),
  restartButton: document.querySelector('#restartButton'),
};

const LANES = ['D', 'F', 'J', 'K'];
const LANE_KEYS = new Map(LANES.map((key, lane) => [key.toLowerCase(), lane]));
const judgementLineX = 150;
const spawnX = 1040;
const travelMs = 2200;
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
let lastFrame = 0;

function makeChart() {
  const notes = [];
  const bpm = 128;
  const beat = 60000 / bpm;
  const patterns = [0, 1, 2, 3, 1, 0, 3, 2, [0, 2], 1, 3, [1, 3], 2, 0, 1, 3];

  for (let bar = 0; bar < 8; bar += 1) {
    patterns.forEach((pattern, index) => {
      const time = chartOffsetMs + (bar * patterns.length + index) * (beat / 2);
      const lanes = Array.isArray(pattern) ? pattern : [pattern];
      lanes.forEach((lane) => notes.push({ lane, time, hit: false, missed: false }));
    });
  }
  return notes;
}

function reset() {
  cancelAnimationFrame(animationId);
  state = {
    notes: makeChart(),
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
  };
  ui.judgement.textContent = 'Ready';
  ui.status.textContent = '스페이스 또는 Start를 눌러 시작하세요.';
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
  if (!state.startedAt) return 0;
  const end = state.running ? now : state.pausedAt;
  return end - state.startedAt - state.pauseAccumulated;
}

function toggleStart() {
  ensureAudio();
  if (audioContext.state === 'suspended') audioContext.resume();

  const now = performance.now();
  if (!state.startedAt) {
    state.startedAt = now;
    state.running = true;
    ui.status.textContent = '진행 중 — 왼쪽 판정선에 맞춰 입력하세요.';
    lastFrame = now;
    animationId = requestAnimationFrame(loop);
    return;
  }

  state.running = !state.running;
  if (state.running) {
    state.pauseAccumulated += now - state.pausedAt;
    ui.status.textContent = '진행 중 — 왼쪽 판정선에 맞춰 입력하세요.';
    lastFrame = now;
    animationId = requestAnimationFrame(loop);
  } else {
    state.pausedAt = now;
    ui.status.textContent = '일시정지됨.';
    cancelAnimationFrame(animationId);
    draw(songTime(now));
  }
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
  state.life = Math.max(0, state.life - (reason === 'Empty' ? 3 : 8));
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

  playMetronome(time);
  draw(time);

  const lastNoteTime = state.notes.at(-1).time;
  if (time > lastNoteTime + 1800) {
    finish(`완주! Max Combo ${state.maxCombo}`);
    return;
  }
  if (state.running) animationId = requestAnimationFrame(loop);
}

function playMetronome(time) {
  const beatMs = 60000 / 128;
  if (time >= state.nextTick) {
    const beatIndex = Math.round(state.nextTick / beatMs);
    beep(beatIndex % 4 === 0 ? 220 : 165, 0.035, 'square');
    state.nextTick += beatMs;
  }
}

function finish(message) {
  state.running = false;
  state.pausedAt = performance.now();
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
  ctx.fillText(`TIME ${(time / 1000).toFixed(2)}s`, 76, 470);
}

function drawNotes(time) {
  state.notes.forEach((note) => {
    if (note.hit || note.missed) return;
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

function drawOverlay(time) {
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

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'Space') {
    event.preventDefault();
    toggleStart();
    return;
  }
  if (event.key.toLowerCase() === 'r') {
    reset();
    return;
  }
  const lane = LANE_KEYS.get(event.key.toLowerCase());
  if (lane !== undefined) judge(lane);
});

ui.startButton.addEventListener('click', toggleStart);
ui.restartButton.addEventListener('click', reset);

reset();
