import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'README.md',
];

for (const file of requiredFiles) {
  const contents = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  if (!contents.trim()) throw new Error(`${file} is empty`);
}

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

for (const token of ['<canvas', 'timeline', 'resultDialog', 'startLatency', 'songLibrary', 'audioUpload', 'exportChart']) {
  if (!html.includes(token)) throw new Error(`index.html missing ${token}`);
}

for (const token of ['right-to-left', 'judge', 'releaseLane', 'duration', 'showResult', 'drawTimeline', 'snapTime', 'startLatencyCheck', 'saveSongToLibrary', 'downloadChartJson']) {
  if (!app.includes(token)) throw new Error(`app.js missing ${token}`);
}

console.log('Smoke test passed: game, editor, latency, and library hooks are present.');
