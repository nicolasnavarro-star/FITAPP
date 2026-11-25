import { exportData, useStore } from '../store';
import type { Pt } from './geo';
import { loadTrack, saveTrack } from './tracks';

/** Respaldo completo: los datos de la app más los recorridos de actividades y rutas. */
export async function buildBackup(): Promise<string> {
  const base = JSON.parse(exportData()) as Record<string, unknown>;
  const { activities, routes } = useStore.getState();
  const tracks: Record<string, Pt[]> = {};
  for (const a of activities) tracks[a.id] = await loadTrack(a.id);
  for (const r of routes) tracks[`route-${r.id}`] = await loadTrack(`route-${r.id}`);
  return JSON.stringify({ ...base, tracks });
}

const validPoint = (p: unknown): p is Pt =>
  Array.isArray(p) && p.length >= 4 && typeof p[0] === 'number' && typeof p[1] === 'number' && typeof p[2] === 'number' && Math.abs(p[1]) <= 90 && Math.abs(p[2]) <= 180;

/** Restaura los recorridos incluidos en un respaldo. */
export async function restoreTracks(raw: unknown): Promise<void> {
  const tracks = (raw as { tracks?: unknown } | null)?.tracks;
  if (!tracks || typeof tracks !== 'object') return;
  for (const [id, pts] of Object.entries(tracks as Record<string, unknown>)) {
    if (!/^[\w-]{1,80}$/.test(id) || !Array.isArray(pts)) continue;
    await saveTrack(id, pts.filter(validPoint));
  }
}
