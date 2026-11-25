import { type LatLon, type Pt, haversine, sample } from './geo';

/** Altitudes del modelo de terreno de Open-Meteo para una lista de coordenadas (lotes de 100). */
export async function fetchElevations(coords: LatLon[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 100) {
    const batch = coords.slice(i, i + 100);
    const params = new URLSearchParams({
      latitude: batch.map((c) => c[0].toFixed(5)).join(','),
      longitude: batch.map((c) => c[1].toFixed(5)).join(','),
    });
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
    const data = (await res.json()) as { elevation?: unknown[] };
    const list = Array.isArray(data.elevation) ? data.elevation : [];
    if (list.length !== batch.length) throw new Error('Respuesta de elevación incompleta');
    for (const v of list) out.push(typeof v === 'number' && isFinite(v) ? v : NaN);
  }
  if (out.some((v) => isNaN(v))) throw new Error('Elevación no disponible');
  return out;
}

/**
 * Reemplaza las altitudes de un recorrido por las del modelo de terreno.
 * Se consultan hasta 300 puntos repartidos y el resto se interpola por posición.
 */
export async function withTerrainElevation(points: Pt[]): Promise<Pt[]> {
  if (points.length < 2) return points;
  const idx = sample(
    points.map((_, i) => i),
    300,
  );
  const eles = await fetchElevations(idx.map((i) => [points[i][1], points[i][2]]));
  const out = points.map((p) => p.slice() as Pt);
  for (let k = 0; k < idx.length; k++) {
    out[idx[k]][3] = eles[k];
    if (k === 0) continue;
    const a = idx[k - 1];
    const b = idx[k];
    for (let i = a + 1; i < b; i++) out[i][3] = eles[k - 1] + ((eles[k] - eles[k - 1]) * (i - a)) / (b - a);
  }
  return out;
}

/** Puntos intermedios en línea recta, uno cada ~`stepM` metros, para poder perfilar el terreno. */
export function densify(a: LatLon, b: LatLon, stepM = 60): LatLon[] {
  const d = haversine(a[0], a[1], b[0], b[1]);
  const n = Math.max(1, Math.min(200, Math.ceil(d / stepM)));
  const out: LatLon[] = [];
  for (let i = 1; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

/**
 * Tramo entre dos puntos siguiendo senderos, usando el servicio público BRouter (datos de OpenStreetMap).
 * Devuelve coordenadas con altitud. Lanza un error si no hay sendero o el servicio no responde.
 */
export async function trailSegment(a: LatLon, b: LatLon, signal?: AbortSignal): Promise<[number, number, number | null][]> {
  const lonlats = `${a[1].toFixed(6)},${a[0].toFixed(6)}|${b[1].toFixed(6)},${b[0].toFixed(6)}`;
  let lastError: unknown = new Error('sin respuesta');
  for (const profileName of ['hiking-mountain', 'trekking']) {
    try {
      const res = await fetch(`https://brouter.de/brouter?lonlats=${lonlats}&profile=${profileName}&alternativeidx=0&format=geojson`, { signal });
      if (!res.ok) {
        lastError = new Error(`BRouter respondió ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { features?: { geometry?: { coordinates?: unknown[] } }[] };
      const coords = data.features?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) {
        lastError = new Error('Ruta vacía');
        continue;
      }
      const out: [number, number, number | null][] = [];
      for (const c of coords as unknown[][]) {
        const lon = Number(c[0]);
        const lat = Number(c[1]);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const ele = c.length > 2 && isFinite(Number(c[2])) ? Number(c[2]) : null;
        out.push([lat, lon, ele]);
      }
      if (out.length >= 2) return out;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError;
}
