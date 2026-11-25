import { del, get, set } from 'idb-keyval';
import type { Bounds } from './terrain';

/**
 * Senderos, caminos, cursos de agua y cumbres de OpenStreetMap para una zona, obtenidos con la API Overpass.
 * Los datos de OpenStreetMap son abiertos (licencia ODbL) y se pueden guardar para usarlos sin conexión.
 */

export type WayKind = 'path' | 'track' | 'minor' | 'road' | 'major' | 'water';
export type PoiKind = 'peak' | 'saddle' | 'spring' | 'hut' | 'viewpoint' | 'camp' | 'place';

export interface OsmWay {
  k: WayKind;
  n?: string;
  /** Coordenadas aplanadas: lat, lon, lat, lon… */
  p: number[];
}

export interface OsmPoi {
  k: PoiKind;
  n?: string;
  ele?: number;
  lat: number;
  lon: number;
}

export interface OsmData {
  ways: OsmWay[];
  pois: OsmPoi[];
}

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const HIGHWAY: Record<string, WayKind> = {
  path: 'path',
  footway: 'path',
  steps: 'path',
  bridleway: 'path',
  cycleway: 'path',
  pedestrian: 'path',
  track: 'track',
  residential: 'minor',
  unclassified: 'minor',
  living_street: 'minor',
  tertiary: 'road',
  secondary: 'road',
  primary: 'major',
  trunk: 'major',
  motorway: 'major',
};

function query(b: Bounds): string {
  const box = `${b.s.toFixed(5)},${b.w.toFixed(5)},${b.n.toFixed(5)},${b.e.toFixed(5)}`;
  return `[out:json][timeout:60];(
way["highway"~"^(${Object.keys(HIGHWAY).join('|')})$"](${box});
way["waterway"~"^(stream|river)$"](${box});
node["natural"~"^(peak|saddle|spring)$"](${box});
node["tourism"~"^(alpine_hut|wilderness_hut|viewpoint|camp_site)$"](${box});
node["place"~"^(town|village|suburb|hamlet|locality)$"](${box});
);out geom;`;
}

interface Element {
  type?: string;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** Convierte la respuesta de Overpass a un formato compacto. */
export function parseOverpass(data: unknown): OsmData {
  const out: OsmData = { ways: [], pois: [] };
  const elements = (data as { elements?: Element[] } | null)?.elements;
  if (!Array.isArray(elements)) return out;
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = typeof tags.name === 'string' && tags.name.trim() ? tags.name.trim().slice(0, 60) : undefined;
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const kind: WayKind | undefined = tags.waterway ? 'water' : HIGHWAY[tags.highway ?? ''];
      if (!kind) continue;
      const p: number[] = [];
      for (const g of el.geometry) if (typeof g?.lat === 'number' && typeof g?.lon === 'number') p.push(r5(g.lat), r5(g.lon));
      if (p.length >= 4) out.ways.push({ k: kind, n: kind === 'minor' ? undefined : name, p });
    } else if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      const kind: PoiKind | undefined =
        tags.natural === 'peak'
          ? 'peak'
          : tags.natural === 'saddle'
            ? 'saddle'
            : tags.natural === 'spring'
              ? 'spring'
              : tags.tourism === 'viewpoint'
                ? 'viewpoint'
                : tags.tourism === 'camp_site'
                  ? 'camp'
                  : tags.tourism
                    ? 'hut'
                    : tags.place
                      ? 'place'
                      : undefined;
      if (!kind || (!name && kind !== 'spring' && kind !== 'viewpoint')) continue;
      const ele = Number(tags.ele);
      out.pois.push({ k: kind, n: name, ele: isFinite(ele) && ele > -500 && ele < 9000 ? Math.round(ele) : undefined, lat: r5(el.lat), lon: r5(el.lon) });
    }
  }
  return out;
}

export async function fetchOsm(b: Bounds, signal?: AbortSignal): Promise<OsmData> {
  let lastError: unknown = new Error('sin respuesta');
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query(b) }), signal });
      if (!res.ok) {
        lastError = new Error(`Overpass respondió ${res.status}`);
        continue;
      }
      return parseOverpass(await res.json());
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

const memory = new Map<string, OsmData>();

export async function saveOsm(regionId: string, data: OsmData): Promise<void> {
  memory.set(regionId, data);
  await set(`osm:${regionId}`, data);
}

export async function loadOsm(regionId: string): Promise<OsmData | null> {
  const hit = memory.get(regionId);
  if (hit) return hit;
  const data = ((await get(`osm:${regionId}`).catch(() => undefined)) as OsmData | undefined) ?? null;
  if (data) memory.set(regionId, data);
  return data;
}

export async function deleteOsm(regionId: string): Promise<void> {
  memory.delete(regionId);
  await del(`osm:${regionId}`).catch(() => undefined);
}
