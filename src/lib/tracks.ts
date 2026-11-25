import { del, get, set } from 'idb-keyval';
import type { Pt, Sport } from './geo';

/** Los recorridos tienen miles de puntos, así que se guardan en IndexedDB y no junto al resto de los datos. */

export const saveTrack = (id: string, points: Pt[]) => set(`track:${id}`, points);
export const loadTrack = async (id: string): Promise<Pt[]> => ((await get(`track:${id}`)) as Pt[] | undefined) ?? [];
export const deleteTrack = (id: string) => del(`track:${id}`);

/** Grabación en curso: se va guardando para no perderla si Android cierra la app. */
export interface LiveState {
  sport: Sport;
  startedAt: number;
  points: Pt[];
  routeId?: string;
  /** La grabación estaba en pausa al guardarse. */
  paused?: boolean;
}

export const saveLive = (state: LiveState) => set('live', state);
export const loadLive = async (): Promise<LiveState | null> => ((await get('live')) as LiveState | undefined) ?? null;
export const clearLive = () => del('live');
