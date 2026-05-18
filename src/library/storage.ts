import type { ChartFile } from '../core/types';

const chartStoreKey = 'sidebeat-lanes-song-library-v2';

export function getLibrary(): ChartFile[] {
  try { return JSON.parse(localStorage.getItem(chartStoreKey) || '[]') as ChartFile[]; }
  catch { return []; }
}

export function saveChart(chart: ChartFile): void {
  const library = getLibrary();
  const existing = library.findIndex((item) => item.title === chart.title);
  if (existing >= 0) library[existing] = chart;
  else library.push(chart);
  localStorage.setItem(chartStoreKey, JSON.stringify(library));
}

export function deleteChart(index: number): ChartFile | undefined {
  const library = getLibrary();
  const [removed] = library.splice(index, 1);
  localStorage.setItem(chartStoreKey, JSON.stringify(library));
  return removed;
}
