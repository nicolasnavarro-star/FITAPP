import { create } from 'zustand';
import { useStore } from '../store';
import { type Pt, type Sport, type TrackStats, GPS, SPORTS, TERRAIN, computeStats, estimateKcal, haversine, sample } from './geo';
import { type Fix, LocationError, watchLocation } from './location';
import { withTerrainElevation } from './routing';
import { clearLive, loadLive, saveLive, saveTrack } from './tracks';
import type { OutdoorActivity } from './types';
import { formatDate, toDateKey, uid } from './util';

/**
 * Grabadora de actividades. Vive fuera de las pantallas para seguir funcionando al navegar por la app,
 * y guarda el avance en disco para poder retomarlo si Android cierra la app.
 */

const EMPTY: TrackStats = { distanceM: 0, movingSec: 0, ascentM: 0, descentM: 0, maxEle: null, minEle: null };

interface RecState {
  status: 'idle' | 'recording' | 'paused';
  sport: Sport;
  startedAt: number;
  points: Pt[];
  stats: TrackStats;
  /** Última posición recibida, se esté grabando o no. */
  last: Fix | null;
  error: string;
  routeId?: string;
}

export const useRec = create<RecState>(() => ({ status: 'idle', sport: 'hike', startedAt: 0, points: [], stats: EMPTY, last: null, error: '' }));

let stopWatch: (() => void) | null = null;
let newSegment = false;
let unsaved = 0;

const MAX_SPEED: Record<Sport, number> = { hike: 12, trail: 12, walk: 12, bike: 30 };

function persist() {
  const s = useRec.getState();
  unsaved = 0;
  void saveLive({ sport: s.sport, startedAt: s.startedAt, points: s.points, routeId: s.routeId, paused: s.status === 'paused' }).catch(() => undefined);
}

function onFix(fix: Fix) {
  const s = useRec.getState();
  if (s.status !== 'recording') {
    useRec.setState({ last: fix, error: '' });
    return;
  }
  // Las lecturas imprecisas (interiores, quebradas cerradas) se muestran pero no se suman al recorrido.
  if (fix.acc > 40) {
    useRec.setState({ last: fix, error: '' });
    return;
  }
  const prev = s.points[s.points.length - 1];
  let point: Pt | null = null;
  if (!prev) point = [fix.t, fix.lat, fix.lon, fix.ele];
  else if (newSegment) point = [fix.t, fix.lat, fix.lon, fix.ele, 1];
  else {
    const d = haversine(prev[1], prev[2], fix.lat, fix.lon);
    const dt = (fix.t - prev[0]) / 1000;
    // Se descartan saltos imposibles del GPS y el "temblor" de cuando uno está detenido.
    const jump = dt > 0 && d / dt > MAX_SPEED[s.sport];
    const jitter = d < 4 && dt < 15;
    if (dt > 0 && !jump && !jitter) point = [fix.t, fix.lat, fix.lon, fix.ele];
  }
  if (!point) {
    useRec.setState({ last: fix, error: '' });
    return;
  }
  newSegment = false;
  const points = [...s.points, point];
  useRec.setState({ last: fix, error: '', points, stats: computeStats(points, s.sport) });
  if (++unsaved >= 5) persist();
}

async function startWatcher() {
  if (stopWatch) return;
  stopWatch = await watchLocation(onFix, (e: LocationError) => useRec.setState({ error: e.message }));
}

function stopWatcher() {
  stopWatch?.();
  stopWatch = null;
}

export async function startRecording(sport: Sport, routeId?: string): Promise<void> {
  if (useRec.getState().status !== 'idle') return;
  newSegment = false;
  useRec.setState({ status: 'recording', sport, startedAt: Date.now(), points: [], stats: EMPTY, error: '', routeId });
  persist();
  try {
    await startWatcher();
  } catch (e) {
    useRec.setState({ status: 'idle', error: e instanceof Error ? e.message : 'No se pudo iniciar el GPS.' });
    void clearLive();
    throw e;
  }
}

export function pauseRecording() {
  if (useRec.getState().status !== 'recording') return;
  useRec.setState({ status: 'paused' });
  persist();
}

export async function resumeRecording() {
  if (useRec.getState().status !== 'paused') return;
  newSegment = useRec.getState().points.length > 0;
  useRec.setState({ status: 'recording', error: '' });
  await startWatcher().catch((e) => useRec.setState({ error: e instanceof Error ? e.message : 'No se pudo iniciar el GPS.' }));
}

/**
 * Recupera una grabación que quedó a medias (por ejemplo, si el sistema cerró la app).
 * Si estaba grabando, se retoma sola como un tramo nuevo; si estaba en pausa, sigue en pausa.
 * Devuelve true si había una grabación pendiente.
 */
export async function restoreRecording(): Promise<boolean> {
  if (useRec.getState().status !== 'idle') return false;
  const live = await loadLive().catch(() => null);
  if (!live || !Array.isArray(live.points)) return false;
  if (useRec.getState().status !== 'idle') return false;
  useRec.setState({ status: 'paused', sport: live.sport, startedAt: live.startedAt, points: live.points, stats: computeStats(live.points, live.sport), routeId: live.routeId, error: '' });
  if (!live.paused) await resumeRecording();
  return true;
}

export async function discardRecording(): Promise<void> {
  stopWatcher();
  useRec.setState({ status: 'idle', points: [], stats: EMPTY, error: '', routeId: undefined });
  await clearLive().catch(() => undefined);
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/**
 * Termina la grabación y guarda la actividad. Devuelve null si el recorrido es demasiado corto.
 * Si hay conexión, las altitudes se corrigen con el modelo de terreno, más fiable que el GPS del teléfono.
 */
export async function finishRecording(weightKg: number): Promise<OutdoorActivity | null> {
  const s = useRec.getState();
  if (s.status === 'idle') return null;
  stopWatcher();
  let points = s.points;
  const raw = computeStats(points, s.sport);
  if (points.length < 2 || raw.distanceM < 20) {
    await discardRecording();
    return null;
  }
  let eleSource: OutdoorActivity['eleSource'] = 'gps';
  try {
    points = await timeout(withTerrainElevation(points), 15000);
    eleSource = 'terrain';
  } catch {
    /* sin conexión: se conservan las altitudes del GPS */
  }
  const stats = computeStats(points, s.sport, eleSource === 'terrain' ? TERRAIN : GPS);
  const endedAt = points[points.length - 1][0];
  const activity: OutdoorActivity = {
    id: uid(),
    sport: s.sport,
    name: `${SPORTS[s.sport].label} del ${formatDate(toDateKey(new Date(s.startedAt)))}`,
    startedAt: s.startedAt,
    endedAt,
    distanceM: Math.round(stats.distanceM),
    movingSec: Math.round(stats.movingSec),
    elapsedSec: Math.max(Math.round(stats.movingSec), Math.round((endedAt - s.startedAt) / 1000)),
    ascentM: Math.round(stats.ascentM),
    descentM: Math.round(stats.descentM),
    maxEle: stats.maxEle === null ? null : Math.round(stats.maxEle),
    minEle: stats.minEle === null ? null : Math.round(stats.minEle),
    kcal: estimateKcal(s.sport, weightKg, stats.movingSec, stats.ascentM),
    eleSource,
    preview: sample(points, 80).map((p) => [p[1], p[2]]),
    routeId: s.routeId,
  };
  await saveTrack(activity.id, points);
  useStore.getState().addActivity(activity);
  useRec.setState({ status: 'idle', points: [], stats: EMPTY, error: '', routeId: undefined });
  await clearLive().catch(() => undefined);
  return activity;
}
