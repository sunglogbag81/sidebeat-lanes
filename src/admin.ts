import './styles/app.css';
import { all, must } from './ui/dom';
import { buildChartFile, LANES, normalizeNotes, parseChart } from './core/chart';
import type { ChartFile, ChartNote } from './core/types';
import { deleteSong, getLibrary, getSong, saveSongPackage } from './library/storage';
import { LibraryPanel } from './admin/LibraryPanel';
import { Timeline } from './admin/Timeline';

const audio = must<HTMLAudioElement>('#audioPlayer');
const audioUpload = must<HTMLInputElement>('#audioUpload');
const songTitle = must<HTMLInputElement>('#songTitle');
const bpmInput = must<HTMLInputElement>('#bpmInput');
const offsetInput = must<HTMLInputElement>('#offsetInput');
const snapSelect = must<HTMLSelectElement>('#snapSelect');
const longDurationInput = must<HTMLInputElement>('#longDurationInput');
const chartList = must<HTMLOListElement>('#chartList');
const exportChart = must<HTMLTextAreaElement>('#exportChart');
const importChart = must<HTMLTextAreaElement>('#importChart');
const statusEl = must<HTMLElement>('#status');
const editorCount = must<HTMLElement>('#editorCount');
const editorTime = must<HTMLElement>('#editorTime');

let notes: ChartNote[] = [];
let selected = -1;
let audioName: string | null = null;
let audioBlob: Blob | undefined;
let audioObjectUrl: string | null = null;

const bpm = (): number => Number(bpmInput.value) || 128;
const offset = (): number => Number(offsetInput.value) || 0;
const snap = (): number => Number(snapSelect.value) || 0;
const longDuration = (): number => Number(longDurationInput.value) || 900;
const currentTime = (): number => audio.currentTime * 1000;
const title = (): string => songTitle.value.trim() || audioName?.replace(/\.[^.]+$/, '') || 'Untitled Song';
const status = (text: string): void => { statusEl.textContent = text; };

function setAudioSource(blob: Blob | undefined, fileName?: string | null): void {
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
  audioObjectUrl = null;
  audioBlob = blob;
  audioName = fileName ?? null;
  if (!blob) { audio.removeAttribute('src'); audio.load(); return; }
  audioObjectUrl = URL.createObjectURL(blob);
  audio.src = audioObjectUrl;
}

function build(): ChartFile {
  return buildChartFile({ title: title(), difficulty: 'normal', bpm: bpm(), offset: offset(), audioFileName: audioName, notes });
}

function renderList(): void {
  chartList.innerHTML = '';
  notes.slice(0, 140).forEach((note, index) => {
    const row = document.createElement('li');
    row.innerHTML = `<button data-remove="${index}">×</button><span>${(note.time / 1000).toFixed(3)}s</span><strong>${LANES[note.lane]}</strong><em>${note.duration ? `${note.duration}ms` : 'tap'}</em>`;
    if (index === selected) row.style.outline = '2px solid var(--accent)';
    chartList.append(row);
  });
}

function sync(): void {
  notes = normalizeNotes(notes).map(({ lane, time, duration }) => ({ lane, time, duration }));
  exportChart.value = JSON.stringify(build(), null, 2);
  editorCount.textContent = `${notes.length} notes`;
  editorTime.textContent = `${(currentTime() / 1000).toFixed(3)}s`;
  renderList();
  timeline.draw();
}

function addNote(lane: number, time = currentTime(), duration = 0): void {
  notes.push({ lane, time, duration });
  selected = notes.length - 1;
  sync();
  status(`노트 추가: ${LANES[lane]} ${(time / 1000).toFixed(3)}s`);
}

function applyChart(chart: ChartFile, storedAudio?: Blob): void {
  notes = chart.notes;
  songTitle.value = chart.title;
  bpmInput.value = String(chart.bpm);
  offsetInput.value = String(chart.offset);
  selected = -1;
  if (storedAudio) setAudioSource(storedAudio, chart.audioFileName);
  else audioName = chart.audioFileName ?? audioName;
  sync();
  status(`${chart.title} 불러오기 완료.`);
}

function download(): void {
  const blob = new Blob([JSON.stringify(build(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title().replace(/[^a-z0-9가-힣]+/gi, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderLibrary(): Promise<void> {
  libraryPanel.render(await getLibrary());
}

async function saveCurrent(): Promise<void> {
  await saveSongPackage({ chart: build(), audioBlob, audioFileName: audioName });
  await renderLibrary();
  status(`${title()} 저장 완료. 오디오${audioBlob ? ' 포함' : ' 없음'}.`);
}

async function loadSelected(id: string): Promise<void> {
  const song = await getSong(id);
  if (!song) return;
  applyChart(song.chart, song.audioBlob);
}

async function deleteSelected(id: string): Promise<void> {
  const removed = await deleteSong(id);
  await renderLibrary();
  if (removed) status(`${removed.title} 삭제 완료.`);
}

const timeline = new Timeline({
  canvas: must<HTMLCanvasElement>('#timeline'),
  audio,
  getNotes: () => notes,
  getSelected: () => selected,
  setSelected: (index) => { selected = index; },
  replaceNote: (index, note) => { notes[index] = note; },
  addNote,
  getBpm: bpm,
  getOffset: offset,
  getSnap: snap,
  getLongDuration: longDuration,
  onChange: sync,
});

const libraryPanel = new LibraryPanel({
  select: must<HTMLSelectElement>('#songLibrary'),
  loadButton: must<HTMLButtonElement>('#loadSong'),
  deleteButton: must<HTMLButtonElement>('#deleteSong'),
  onLoad: loadSelected,
  onDelete: deleteSelected,
});

function bind(): void {
  timeline.bind();
  libraryPanel.bind();
  audioUpload.addEventListener('change', () => {
    const file = audioUpload.files?.[0];
    if (!file) return;
    setAudioSource(file, file.name);
    songTitle.value ||= file.name.replace(/\.[^.]+$/, '');
    sync();
    status(`${file.name} 업로드 완료.`);
  });
  audio.addEventListener('timeupdate', sync);
  audio.addEventListener('loadedmetadata', sync);
  audio.addEventListener('play', function tick() { sync(); if (!audio.paused) requestAnimationFrame(tick); });
  all<HTMLButtonElement>('[data-editor-lane]').forEach((button) => button.addEventListener('click', () => addNote(Number(button.dataset.editorLane))));
  must<HTMLButtonElement>('#addLongNote').addEventListener('click', () => addNote(0, currentTime(), longDuration()));
  chartList.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]');
    if (!button) return;
    notes.splice(Number(button.dataset.remove), 1);
    sync();
  });
  importChart.addEventListener('change', () => {
    try { applyChart(parseChart(importChart.value)); }
    catch (error) { status(`불러오기 실패: ${(error as Error).message}`); }
  });
  must<HTMLInputElement>('#generatedChartUpload').addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) applyChart(parseChart(await file.text()));
  });
  must<HTMLButtonElement>('#downloadChart').addEventListener('click', download);
  must<HTMLButtonElement>('#saveSong').addEventListener('click', () => { void saveCurrent(); });
  must<HTMLButtonElement>('#clearChart').addEventListener('click', () => { notes = []; selected = -1; sync(); });
  [bpmInput, offsetInput, snapSelect].forEach((el) => el.addEventListener('change', sync));
}

bind();
void renderLibrary().then(sync).catch((error) => status(`라이브러리 초기화 실패: ${(error as Error).message}`));
