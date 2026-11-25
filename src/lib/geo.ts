/** Punto de un recorrido: [tiempo ms, latitud, longitud, altitud m o null, 1 si inicia un tramo nuevo tras una pausa]. */
export type Pt = [t: number, lat: number, lon: number, ele: number | null, seg?: 1];
export type LatLon = [lat: number, lon: number];
export type Sport = 'hike' | 'trail' | 'walk' | 'bike';

export const SPORTS: Record<Sport, { label: string; minSpeed: number; met: number; flatKmh: number; climbMh: number; usesPace: boolean }> = {
  hike: { label: 'Cerro', minSpeed: 0.3, met: 4.5, flatKmh: 4.5, climbMh: 450, usesPace: true },
  trail: { label: 'Trail', minSpeed: 0.5, met: 8, flatKmh: 8, climbMh: 700, usesPace: true },
  walk: { label: 'Caminata', minSpeed: 0.3, met: 3.5, flatKmh: 5, climbMh: 400, usesPace: true },
  bike: { label: 'Bici', minSpeed: 1, met: 6.5, flatKmh: 16, climbMh: 600, usesPace: false },
};

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distancia en metros entre dos coordenadas. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Altitudes suavizadas (media móvil) para que el ruido del GPS no infle el desnivel. */
export function smoothEle(points: Pt[], window = 5): (number | null)[] {
  const raw = points.map((p) => p[3]);
  const half = Math.floor(window / 2);
  return raw.map((v, i) => {
    if (v === null) return null;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(raw.length - 1, i + half); j++) {
      const x = raw[j];
      if (x !== null) {
        sum += x;
        n++;
      }
    }
    return n > 0 ? sum / n : v;
  });
}

export interface EleOptions {
  /** Cambio mínimo de altitud (m) para contarlo como subida o bajada. */
  threshold: number;
  /** Tamaño de la media móvil aplicada a la altitud (1 = sin suavizar). */
  window: number;
}

export const GPS: EleOptions = { threshold: 4, window: 5 };
export const TERRAIN: EleOptions = { threshold: 2, window: 1 };

export interface TrackStats {
  distanceM: number;
  movingSec: number;
  ascentM: number;
  descentM: number;
  maxEle: number | null;
  minEle: number | null;
}

/**
 * Calcula distancia, tiempo en movimiento y desnivel de un recorrido.
 * El desnivel solo suma cuando la altitud suavizada cambia más que `threshold` metros,
 * lo que evita contar como subida las oscilaciones del GPS.
 * Con altitudes del modelo de terreno (sin ruido) conviene `TERRAIN`: umbral bajo y sin suavizado.
 */
export function computeStats(points: Pt[], sport: Sport = 'hike', { threshold, window }: EleOptions = GPS): TrackStats {
  const out: TrackStats = { distanceM: 0, movingSec: 0, ascentM: 0, descentM: 0, maxEle: null, minEle: null };
  const eles = smoothEle(points, window);
  let ref: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const e = eles[i];
    if (e !== null) {
      out.maxEle = out.maxEle === null ? e : Math.max(out.maxEle, e);
      out.minEle = out.minEle === null ? e : Math.min(out.minEle, e);
      if (ref === null || p[4] === 1) ref = e;
      else if (e - ref >= threshold) {
        out.ascentM += e - ref;
        ref = e;
      } else if (ref - e >= threshold) {
        out.descentM += ref - e;
        ref = e;
      }
    }
    if (i === 0 || p[4] === 1) continue;
    const q = points[i - 1];
    const d = haversine(q[1], q[2], p[1], p[2]);
    const dt = (p[0] - q[0]) / 1000;
    out.distanceM += d;
    if (dt > 0 && dt < 180 && d / dt >= SPORTS[sport].minSpeed) out.movingSec += dt;
  }
  return out;
}

/** Perfil de altitud: distancia acumulada (m) y altitud suavizada de cada punto con altitud. */
export function profile(points: Pt[], window = GPS.window): { dist: number; ele: number }[] {
  const eles = smoothEle(points, window);
  const out: { dist: number; ele: number }[] = [];
  let dist = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && points[i][4] !== 1) dist += haversine(points[i - 1][1], points[i - 1][2], points[i][1], points[i][2]);
    const e = eles[i];
    if (e !== null) out.push({ dist, ele: e });
  }
  return out;
}

export interface Split {
  km: number;
  sec: number;
  distanceM: number;
  eleChange: number | null;
}

/** Parciales por kilómetro: tiempo en movimiento y cambio de altitud de cada uno. */
export function splits(points: Pt[], sport: Sport, window = GPS.window): Split[] {
  const eles = smoothEle(points, window);
  const out: Split[] = [];
  let dist = 0;
  let sec = 0;
  let startEle: number | null = null;
  let lastEle: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const e = eles[i];
    if (e !== null) {
      if (startEle === null) startEle = e;
      lastEle = e;
    }
    if (i === 0 || points[i][4] === 1) continue;
    const q = points[i - 1];
    const p = points[i];
    const d = haversine(q[1], q[2], p[1], p[2]);
    const dt = (p[0] - q[0]) / 1000;
    dist += d;
    if (dt > 0 && dt < 180 && d / dt >= SPORTS[sport].minSpeed) sec += dt;
    if (dist >= 1000) {
      out.push({ km: out.length + 1, sec, distanceM: dist, eleChange: startEle !== null && lastEle !== null ? lastEle - startEle : null });
      dist = 0;
      sec = 0;
      startEle = lastEle;
    }
  }
  if (dist >= 50) out.push({ km: out.length + 1, sec, distanceM: dist, eleChange: startEle !== null && lastEle !== null ? lastEle - startEle : null });
  return out;
}

/** Reduce un recorrido a como máximo `max` coordenadas (para miniaturas y consultas a servicios). */
export function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items.slice();
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out;
}

/** Tiempo estimado (s): velocidad en plano más el tiempo extra de subida, al estilo de la regla de Naismith. */
export function estimateSeconds(distanceM: number, ascentM: number, sport: Sport): number {
  const s = SPORTS[sport];
  return (distanceM / 1000 / s.flatKmh) * 3600 + (ascentM / s.climbMh) * 3600;
}

/** Calorías estimadas: gasto base según el deporte más el trabajo de subir el propio peso. */
export function estimateKcal(sport: Sport, weightKg: number, movingSec: number, ascentM: number): number {
  return Math.round(SPORTS[sport].met * weightKg * (movingSec / 3600) + weightKg * ascentM * 0.0056);
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Ritmo en min/km a partir de metros y segundos; "–" si no hay datos suficientes. */
export function fmtPace(distanceM: number, sec: number): string {
  if (distanceM < 20 || sec <= 0) return '–';
  const perKm = sec / (distanceM / 1000);
  if (perKm > 5999) return '–';
  return `${Math.floor(perKm / 60)}:${String(Math.round(perKm % 60)).padStart(2, '0')}`.replace(':60', ':59');
}

export function fmtSpeed(distanceM: number, sec: number): string {
  if (sec <= 0) return '–';
  return (distanceM / 1000 / (sec / 3600)).toLocaleString('es-CL', { maximumFractionDigits: 1 });
}

export function fmtKm(m: number): string {
  return (m / 1000).toLocaleString('es-CL', { minimumFractionDigits: m < 10000 ? 2 : 1, maximumFractionDigits: m < 10000 ? 2 : 1 });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Exporta un recorrido en formato GPX, compatible con Strava, Suunto, Garmin y similares. */
export function toGpx(name: string, points: Pt[], withTime = true): string {
  const segs: string[][] = [];
  for (const p of points) {
    if (segs.length === 0 || p[4] === 1) segs.push([]);
    const ele = p[3] !== null ? `<ele>${p[3].toFixed(1)}</ele>` : '';
    const time = withTime && p[0] > 0 ? `<time>${new Date(p[0]).toISOString()}</time>` : '';
    segs[segs.length - 1].push(`<trkpt lat="${p[1].toFixed(6)}" lon="${p[2].toFixed(6)}">${ele}${time}</trkpt>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kaizen" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${esc(name)}</name>
${segs.map((s) => `<trkseg>\n${s.join('\n')}\n</trkseg>`).join('\n')}
</trk>
</gpx>
`;
}

/** Lee los puntos (tracks o rutas) de un archivo GPX. */
export function parseGpx(text: string): { name: string; points: Pt[] } {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('GPX no válido');
  let nodes = Array.from(doc.querySelectorAll('trkpt'));
  if (nodes.length === 0) nodes = Array.from(doc.querySelectorAll('rtept'));
  const points: Pt[] = [];
  for (const n of nodes) {
    const lat = Number(n.getAttribute('lat'));
    const lon = Number(n.getAttribute('lon'));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleText = n.querySelector('ele')?.textContent;
    const ele = eleText !== null && eleText !== undefined && eleText.trim() !== '' && isFinite(Number(eleText)) ? Number(eleText) : null;
    const t = Date.parse(n.querySelector('time')?.textContent ?? '');
    points.push([isFinite(t) ? t : 0, lat, lon, ele]);
  }
  if (points.length < 2) throw new Error('El archivo no contiene un recorrido');
  const name = (doc.querySelector('trk > name')?.textContent || doc.querySelector('rte > name')?.textContent || doc.querySelector('metadata > name')?.textContent || '').trim();
  return { name, points };
}
