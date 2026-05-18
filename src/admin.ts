import './styles/app.css';
import { all, must } from './ui/dom';
import { buildChartFile, LANES, normalizeNotes, parseChart } from './core/chart';
import type { ChartFile, ChartNote } from './core/types';
import { deleteChart, getLibrary, saveChart } from './library/storage';

const audio = must<HTMLAudioElement>('#audioPlayer');
const audioUpload = must<HTMLInputElement>('#audioUpload');
const songTitle = must<HTMLInputElement>('#songTitle');
const bpmInput = must<HTMLInputElement>('#bpmInput');
const offsetInput = must<HTMLInputElement>('#offsetInput');
const snapSelect = must<HTMLSelectElement>('#snapSelect');
const longDurationInput = must<HTMLInputElement>('#longDurationInput');
const timeline = must<HTMLCanvasElement>('#timeline');
const tctx = timeline.getContext('2d')!;
const chartList = must<HTMLOListElement>('#chartList');
const exportChart = must<HTMLTextAreaElement>('#exportChart');
const importChart = must<HTMLTextAreaElement>('#importChart');
const statusEl = must<HTMLElement>('#status');
const librarySelect = must<HTMLSelectElement>('#songLibrary');
let notes: ChartNote[] = [];
let selected = -1;
let drag = -1;
let audioName: string | null = null;

function bpm(): number { return Number(bpmInput.value) || 128; }
function offset(): number { return Number(offsetInput.value) || 0; }
function snap(): number { return Number(snapSelect.value) || 0; }
function title(): string { return songTitle.value.trim() || audioName?.replace(/\.[^.]+$/, '') || 'Untitled Song'; }
function currentTime(): number { return audio.currentTime * 1000; }
function snapTime(time: number): number { const s = snap(); if (!s) return Math.max(0, Math.round(time)); const step = 60000 / bpm() * 4 / s; return Math.max(0, Math.round(Math.round((time - offset()) / step) * step + offset())); }
function durationView(): number { return Math.max(8000, (audio.duration || 32) * 1000) / 2.4; }
function viewStart(): number { return Math.max(0, currentTime() - durationView() * .42); }
function build(): ChartFile { return buildChartFile({ title: title(), difficulty: 'normal', bpm: bpm(), offset: offset(), audioFileName: audioName, notes }); }
function sync(): void { notes = normalizeNotes(notes).map(({ lane, time, duration }) => ({ lane, time, duration })); exportChart.value = JSON.stringify(build(), null, 2); must<HTMLElement>('#editorCount').textContent = `${notes.length} notes`; must<HTMLElement>('#editorTime').textContent = `${(currentTime()/1000).toFixed(3)}s`; renderList(); drawTimeline(); }
function renderList(): void { chartList.innerHTML = ''; notes.slice(0, 140).forEach((note, index) => { const row = document.createElement('li'); row.innerHTML = `<button data-remove="${index}">×</button><span>${(note.time/1000).toFixed(3)}s</span><strong>${LANES[note.lane]}</strong><em>${note.duration ? `${note.duration}ms` : 'tap'}</em>`; if (index === selected) row.style.outline = '2px solid var(--accent)'; chartList.append(row); }); }
function addNote(lane: number, time = currentTime(), duration = 0): void { notes.push({ lane, time: snapTime(time), duration }); selected = notes.length - 1; sync(); status(`노트 추가: ${LANES[lane]} ${(snapTime(time)/1000).toFixed(3)}s`); }
function status(text: string): void { statusEl.textContent = text; }
function applyChart(chart: ChartFile): void { notes = chart.notes; songTitle.value = chart.title; bpmInput.value = String(chart.bpm); offsetInput.value = String(chart.offset); audioName = chart.audioFileName ?? null; selected = -1; sync(); status(`${chart.title} 불러오기 완료.`); }
function download(): void { const blob = new Blob([JSON.stringify(build(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${title().replace(/[^a-z0-9가-힣]+/gi, '-')}.json`; a.click(); URL.revokeObjectURL(url); }
function renderLibrary(): void { librarySelect.innerHTML = ''; getLibrary().forEach((chart, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `${chart.title} · ${chart.notes.length} notes`; librarySelect.append(option); }); }
function saveCurrent(): void { saveChart(build()); renderLibrary(); status(`${title()} 저장 완료.`); }
function loadSelected(): void { const chart = getLibrary()[Number(librarySelect.value)]; if (chart) applyChart(chart); }
function deleteSelected(): void { const removed = deleteChart(Number(librarySelect.value)); renderLibrary(); if (removed) status(`${removed.title} 삭제 완료.`); }

function drawTimeline(): void { const w = timeline.width, h = timeline.height; tctx.clearRect(0,0,w,h); tctx.fillStyle = '#080b15'; tctx.fillRect(0,0,w,h); const laneH = h / 4; const start = viewStart(); const dur = durationView(); for (let lane=0; lane<4; lane++){ tctx.fillStyle = lane % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)'; tctx.fillRect(0,lane*laneH,w,laneH-1); tctx.fillStyle='#fff'; tctx.font='900 16px system-ui'; tctx.fillText(LANES[lane],14,lane*laneH+laneH/2+6); } drawBeatGrid(start,dur); notes.forEach((note,index)=>{ const x=(note.time-start)/dur*w; const endX=(note.time+(note.duration||0)-start)/dur*w; const y=note.lane*laneH+laneH/2; if (endX < -20 || x > w+20) return; tctx.strokeStyle = index === selected ? '#ffd166' : (note.duration ? '#72f6d1' : '#ff5c9a'); tctx.fillStyle = tctx.strokeStyle; if(note.duration){ tctx.lineWidth=10; tctx.lineCap='round'; tctx.beginPath(); tctx.moveTo(x,y); tctx.lineTo(endX,y); tctx.stroke(); } tctx.beginPath(); tctx.arc(x,y,9,0,Math.PI*2); tctx.fill(); }); const playX=(currentTime()-start)/dur*w; tctx.strokeStyle='#fff'; tctx.lineWidth=2; tctx.beginPath(); tctx.moveTo(playX,0); tctx.lineTo(playX,h); tctx.stroke(); }
function drawBeatGrid(start: number, dur: number): void { const s = snap() || 4; const step = 60000 / bpm() * 4 / s; const first = Math.floor((start - offset()) / step) * step + offset(); for (let t=first; t<start+dur; t+=step){ const x=(t-start)/dur*timeline.width; tctx.strokeStyle='rgba(114,246,209,.22)'; tctx.lineWidth=1; tctx.beginPath(); tctx.moveTo(x,0); tctx.lineTo(x,timeline.height); tctx.stroke(); } }
function eventPos(event: PointerEvent): { lane: number; time: number } { const rect = timeline.getBoundingClientRect(); const x=(event.clientX-rect.left)/rect.width*timeline.width; const y=(event.clientY-rect.top)/rect.height*timeline.height; return { lane: Math.max(0, Math.min(3, Math.floor(y/(timeline.height/4)))), time: snapTime(viewStart()+x/timeline.width*durationView()) }; }
function findNote(event: PointerEvent): number { const pos = eventPos(event); let best=-1, delta=Infinity; notes.forEach((note,index)=>{ const d=Math.abs(note.time-pos.time)+(note.lane===pos.lane?0:1200); if(d<delta && d<650){best=index; delta=d;} }); return best; }

audioUpload.addEventListener('change', () => { const file = audioUpload.files?.[0]; if (!file) return; audioName = file.name; audio.src = URL.createObjectURL(file); songTitle.value ||= file.name.replace(/\.[^.]+$/, ''); sync(); status(`${file.name} 업로드 완료.`); });
audio.addEventListener('timeupdate', sync); audio.addEventListener('loadedmetadata', sync); audio.addEventListener('play', function tick(){ sync(); if(!audio.paused) requestAnimationFrame(tick); });
all<HTMLButtonElement>('[data-editor-lane]').forEach((button) => button.addEventListener('click', () => addNote(Number(button.dataset.editorLane))));
must<HTMLButtonElement>('#addLongNote').addEventListener('click', () => addNote(0, currentTime(), Number(longDurationInput.value)||900));
chartList.addEventListener('click', (event) => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]'); if (!button) return; notes.splice(Number(button.dataset.remove),1); sync(); });
importChart.addEventListener('change', () => { try { applyChart(parseChart(importChart.value)); } catch (error) { status(`불러오기 실패: ${(error as Error).message}`); } });
must<HTMLInputElement>('#generatedChartUpload').addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (file) applyChart(parseChart(await file.text())); });
must<HTMLButtonElement>('#downloadChart').addEventListener('click', download); must<HTMLButtonElement>('#saveSong').addEventListener('click', saveCurrent); must<HTMLButtonElement>('#clearChart').addEventListener('click', () => { notes=[]; sync(); }); must<HTMLButtonElement>('#loadSong').addEventListener('click', loadSelected); must<HTMLButtonElement>('#deleteSong').addEventListener('click', deleteSelected);
[bpmInput, offsetInput, snapSelect].forEach((el) => el.addEventListener('change', sync));
timeline.addEventListener('pointerdown', (event) => { const found = findNote(event); if (found >= 0) { selected = drag = found; } else { const pos = eventPos(event); addNote(pos.lane, pos.time, event.shiftKey ? Number(longDurationInput.value)||900 : 0); drag = selected; } timeline.setPointerCapture(event.pointerId); sync(); });
timeline.addEventListener('pointermove', (event) => { if (drag < 0) return; const pos = eventPos(event); notes[drag] = { ...notes[drag], lane: pos.lane, time: pos.time }; sync(); });
timeline.addEventListener('pointerup', () => { drag = -1; });
renderLibrary(); sync();
